import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, cn } from "@/lib/utils";
import Link from "next/link";
import { PipelineActions } from "./pipeline-actions";

export const dynamic = "force-dynamic";

const STAGES = [
  {
    key: "deposits_collecting",
    label: "Deposits Collecting",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    dot: "bg-yellow-400",
  },
  {
    key: "ready_to_book",
    label: "Ready to Book",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    dot: "bg-cyan-400",
  },
  {
    key: "outreach_sent",
    label: "Outreach Sent",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    dot: "bg-purple-400",
  },
  {
    key: "confirmed",
    label: "Confirmed",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    dot: "bg-green-400",
  },
  {
    key: "completed",
    label: "Completed",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    dot: "bg-emerald-400",
  },
] as const;

type Stage = (typeof STAGES)[number]["key"];

function deriveStage(exp: Record<string, unknown>): Stage {
  const status = exp.status as string;
  const bookingStatus = exp.booking_status as string | null;

  if (status === "completed") return "completed";
  if (bookingStatus === "booked" || bookingStatus === "confirmed")
    return "confirmed";
  if (bookingStatus === "in_progress") return "outreach_sent";
  if (status === "full" && (!bookingStatus || bookingStatus === "pending"))
    return "ready_to_book";
  return "deposits_collecting";
}

async function getPipelineData() {
  const supabase = createServiceClient();

  const { data: experiences } = await supabase
    .from("experiences")
    .select(
      "id, title, status, booking_status, total_cost, max_participants, current_participants, date_time, location, boat_name, boat_type, host:host_id(display_name), created_at",
    )
    .in("status", ["open", "filling", "full", "locked", "completed"])
    .not("status", "in", '("cancelled","draft")')
    .order("created_at", { ascending: false })
    .limit(100);

  // Get payment totals per experience
  const expIds = (experiences || []).map(
    (e: Record<string, unknown>) => e.id as string,
  );

  let paymentsByExp: Record<string, number> = {};
  if (expIds.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("experience_id, amount, status")
      .in("experience_id", expIds)
      .eq("status", "succeeded");

    paymentsByExp = (payments || []).reduce(
      (acc: Record<string, number>, p: Record<string, unknown>) => {
        const eid = p.experience_id as string;
        acc[eid] = (acc[eid] || 0) + Number(p.amount);
        return acc;
      },
      {},
    );
  }

  // Group by stage
  const pipeline: Record<Stage, Record<string, unknown>[]> = {
    deposits_collecting: [],
    ready_to_book: [],
    outreach_sent: [],
    confirmed: [],
    completed: [],
  };

  for (const exp of experiences || []) {
    const stage = deriveStage(exp as Record<string, unknown>);
    pipeline[stage].push({
      ...(exp as Record<string, unknown>),
      total_paid: paymentsByExp[(exp as Record<string, unknown>).id as string] || 0,
    });
  }

  return pipeline;
}

export default async function FulfillmentPage() {
  const pipeline = await getPipelineData();

  const totalInPipeline = Object.values(pipeline).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  const totalDeposits = Object.values(pipeline)
    .flat()
    .reduce(
      (sum, e) => sum + (e.total_paid as number),
      0,
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">
            Booking Fulfillment Pipeline
          </h2>
          <p className="text-ocean-400 text-sm mt-1">
            {totalInPipeline} experiences &middot;{" "}
            {formatCurrency(totalDeposits)} in deposits collected
          </p>
        </div>
      </div>

      {/* Pipeline overview bar */}
      <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-8 bg-ocean-800">
        {STAGES.map((stage) => {
          const count = pipeline[stage.key].length;
          if (count === 0) return null;
          const pct = (count / Math.max(totalInPipeline, 1)) * 100;
          return (
            <div
              key={stage.key}
              className={cn("h-full transition-all", stage.dot)}
              style={{ width: `${pct}%` }}
              title={`${stage.label}: ${count}`}
            />
          );
        })}
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {STAGES.map((stage) => (
          <div key={stage.key} className="min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <div className={cn("w-2 h-2 rounded-full", stage.dot)} />
              <h3 className={cn("text-sm font-semibold", stage.color)}>
                {stage.label}
              </h3>
              <span className="text-xs text-ocean-500 ml-auto">
                {pipeline[stage.key].length}
              </span>
            </div>

            <div className="space-y-3">
              {pipeline[stage.key].length === 0 ? (
                <div
                  className={cn(
                    "rounded-xl border border-dashed p-6 text-center",
                    stage.border,
                  )}
                >
                  <p className="text-ocean-500 text-xs">No experiences</p>
                </div>
              ) : (
                pipeline[stage.key].map((exp) => (
                  <PipelineCard
                    key={exp.id as string}
                    exp={exp}
                    stage={stage.key}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineCard({
  exp,
  stage,
}: {
  exp: Record<string, unknown>;
  stage: Stage;
}) {
  const host = exp.host as Record<string, unknown> | null;
  const totalCost = (exp.total_cost as number) || 0;
  const totalPaid = (exp.total_paid as number) || 0;
  const max = (exp.max_participants as number) || 1;
  const current = (exp.current_participants as number) || 0;
  const pctFilled = Math.round((current / max) * 100);
  const pctFunded = totalCost > 0 ? Math.round((totalPaid / totalCost) * 100) : 0;

  const stageConfig = STAGES.find((s) => s.key === stage)!;

  return (
    <div
      className={cn(
        "rounded-xl border bg-ocean-900 p-4 hover:bg-ocean-800/50 transition-colors",
        stageConfig.border,
      )}
    >
      <Link href={`/fulfillment/${exp.id}`}>
        <h4 className="text-sm font-semibold text-white truncate hover:text-cyan-400 transition-colors">
          {exp.title as string}
        </h4>
      </Link>

      <p className="text-[10px] text-ocean-500 mt-1 truncate">
        {(exp.location as string) || "No location"}{" "}
        {exp.boat_type ? `\u00B7 ${exp.boat_type as string}` : ""}
      </p>

      {/* Crew progress */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-ocean-400">
            Crew {current}/{max}
          </span>
          <span className="text-ocean-500">{pctFilled}%</span>
        </div>
        <div className="h-1.5 bg-ocean-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full transition-all"
            style={{ width: `${Math.min(pctFilled, 100)}%` }}
          />
        </div>
      </div>

      {/* Funding progress */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-ocean-400">
            {formatCurrency(totalPaid)} / {formatCurrency(totalCost)}
          </span>
          <span className="text-ocean-500">{pctFunded}%</span>
        </div>
        <div className="h-1.5 bg-ocean-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              pctFunded >= 100 ? "bg-green-500" : "bg-yellow-500",
            )}
            style={{ width: `${Math.min(pctFunded, 100)}%` }}
          />
        </div>
      </div>

      {/* Date */}
      {exp.date_time ? (
        <p className="text-[10px] text-ocean-500 mt-2">
          {new Date(exp.date_time as string).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      ) : null}

      {host && (
        <p className="text-[10px] text-ocean-600 mt-1">
          Host: {host.display_name as string}
        </p>
      )}

      {/* Stage actions */}
      <PipelineActions
        experienceId={exp.id as string}
        currentStage={stage}
      />
    </div>
  );
}
