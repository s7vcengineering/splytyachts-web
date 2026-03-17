import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, statusColor, cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExecuteAgentButton } from "./execute-agent-button";
import { OutreachPanel } from "./outreach-panel";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

type Stage =
  | "deposits_collecting"
  | "ready_to_book"
  | "outreach_sent"
  | "confirmed"
  | "completed";

const STAGE_META: Record<
  Stage,
  { label: string; color: string; dot: string }
> = {
  deposits_collecting: {
    label: "Deposits Collecting",
    color: "text-yellow-400",
    dot: "bg-yellow-400",
  },
  ready_to_book: {
    label: "Ready to Book",
    color: "text-cyan-400",
    dot: "bg-cyan-400",
  },
  outreach_sent: {
    label: "Outreach Sent",
    color: "text-purple-400",
    dot: "bg-purple-400",
  },
  confirmed: {
    label: "Confirmed",
    color: "text-green-400",
    dot: "bg-green-400",
  },
  completed: {
    label: "Completed",
    color: "text-emerald-400",
    dot: "bg-emerald-400",
  },
};

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

async function getData(id: string) {
  const supabase = createServiceClient();

  const { data: experience } = await supabase
    .from("experiences")
    .select(
      "*, host:host_id(id, display_name, email), captain:captain_id(id, name, email, phone, boatsetter_manager_id)",
    )
    .eq("id", id)
    .single();

  if (!experience) return null;

  // Pledges / crew members
  const { data: pledges } = await supabase
    .from("pledges")
    .select("*, user:user_id(id, display_name, email)")
    .eq("experience_id", id)
    .order("created_at", { ascending: true });

  // Payments
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("experience_id", id)
    .order("created_at", { ascending: false });

  // Bookings
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("experience_id", id)
    .order("created_at", { ascending: false });

  // Booking logs (for the most recent booking)
  let bookingLogs: Record<string, unknown>[] = [];
  if (bookings && bookings.length > 0) {
    const { data: logs } = await supabase
      .from("booking_logs")
      .select("*")
      .eq("booking_id", (bookings[0] as Record<string, unknown>).id)
      .order("created_at", { ascending: true });
    bookingLogs = (logs as Record<string, unknown>[]) || [];
  }

  // Chat threads for outreach tracking
  const { data: threads } = await supabase
    .from("chat_threads")
    .select("*, messages:chat_messages(id, content, sender_id, created_at)")
    .eq("experience_id", id)
    .order("created_at", { ascending: false })
    .limit(5);

  return {
    experience: experience as Record<string, unknown>,
    pledges: (pledges as Record<string, unknown>[]) || [],
    payments: (payments as Record<string, unknown>[]) || [],
    bookings: (bookings as Record<string, unknown>[]) || [],
    bookingLogs,
    threads: (threads as Record<string, unknown>[]) || [],
  };
}

export default async function FulfillmentDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getData(id);
  if (!data) notFound();

  const { experience: exp, pledges, payments, bookings, bookingLogs, threads } =
    data;
  const stage = deriveStage(exp);
  const stageMeta = STAGE_META[stage];
  const host = exp.host as Record<string, unknown> | null;
  const captain = exp.captain as Record<string, unknown> | null;
  const totalCost = (exp.total_cost as number) || 0;
  const max = (exp.max_participants as number) || 1;
  const current = (exp.current_participants as number) || 0;
  const totalPaid = payments
    .filter((p) => (p.status as string) === "succeeded")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const pctFunded = totalCost > 0 ? Math.round((totalPaid / totalCost) * 100) : 0;
  const latestBooking = bookings.length > 0 ? bookings[0] : null;

  // Readiness checklist for "ready to book"
  const readiness = {
    funded: pctFunded >= 100,
    crewFull: current >= max,
    hasDate: !!exp.date_time,
    hasLocation: !!exp.location,
    hasCaptain: !!captain,
    hasBoat: !!exp.boat_name || !!exp.source_url,
    hasSourceUrl: !!exp.source_url,
  };
  const readyCount = Object.values(readiness).filter(Boolean).length;
  const totalChecks = Object.keys(readiness).length;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ocean-400 mb-6">
        <Link
          href="/fulfillment"
          className="hover:text-white transition-colors"
        >
          Fulfillment
        </Link>
        <span>/</span>
        <span className="text-ocean-300 truncate max-w-[300px]">
          {exp.title as string}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {exp.title as string}
          </h2>
          <p className="text-sm text-ocean-400 mt-1">
            {(exp.location as string) || "No location"}
            {exp.boat_type ? ` \u00B7 ${exp.boat_type as string}` : ""}
            {exp.duration_hours
              ? ` \u00B7 ${exp.duration_hours as number}hr`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("w-2.5 h-2.5 rounded-full", stageMeta.dot)} />
          <span className={cn("text-sm font-semibold", stageMeta.color)}>
            {stageMeta.label}
          </span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Cost"
          value={formatCurrency(totalCost)}
          sub={`${formatCurrency(Math.round(totalCost / max))}/person`}
        />
        <StatCard
          label="Deposits Collected"
          value={formatCurrency(totalPaid)}
          sub={`${pctFunded}% funded`}
          highlight={pctFunded >= 100 ? "green" : pctFunded > 0 ? "yellow" : undefined}
        />
        <StatCard
          label="Crew"
          value={`${current} / ${max}`}
          sub={current >= max ? "Full" : `${max - current} spots left`}
          highlight={current >= max ? "green" : undefined}
        />
        <StatCard
          label="Date"
          value={
            exp.date_time
              ? new Date(exp.date_time as string).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : "TBD"
          }
          sub={
            exp.date_time
              ? new Date(exp.date_time as string).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Not scheduled"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content — 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* === STAGE-SPECIFIC CONTENT === */}

          {/* DEPOSITS COLLECTING */}
          {stage === "deposits_collecting" && (
            <Section title="Deposit Progress">
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-ocean-400">
                    {formatCurrency(totalPaid)} / {formatCurrency(totalCost)}
                  </span>
                  <span className="text-ocean-300 font-semibold">
                    {pctFunded}%
                  </span>
                </div>
                <div className="h-3 bg-ocean-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pctFunded >= 100 ? "bg-green-500" : "bg-yellow-500",
                    )}
                    style={{ width: `${Math.min(pctFunded, 100)}%` }}
                  />
                </div>
              </div>

              {pledges.length > 0 ? (
                <div className="space-y-2">
                  {pledges.map((p) => {
                    const user = p.user as Record<string, unknown> | null;
                    const userPayments = payments.filter(
                      (pay) =>
                        (pay.user_id as string) === (p.user_id as string) &&
                        (pay.status as string) === "succeeded",
                    );
                    const paid = userPayments.reduce(
                      (s, pay) => s + Number(pay.amount),
                      0,
                    );
                    return (
                      <div
                        key={p.id as string}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-ocean-800/50"
                      >
                        <div>
                          <span className="text-sm text-white">
                            {(user?.display_name as string) || "Unknown"}
                          </span>
                          <span className="text-xs text-ocean-500 ml-2">
                            {p.status as string}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            paid > 0 ? "text-green-400" : "text-ocean-500",
                          )}
                        >
                          {paid > 0 ? formatCurrency(paid) : "No payment"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-ocean-500 text-sm">No pledges yet</p>
              )}
            </Section>
          )}

          {/* READY TO BOOK */}
          {stage === "ready_to_book" && (
            <>
              <Section
                title="Booking Readiness"
                badge={`${readyCount}/${totalChecks}`}
              >
                <div className="space-y-2">
                  <CheckItem
                    ok={readiness.funded}
                    label="Fully funded"
                    detail={`${formatCurrency(totalPaid)} / ${formatCurrency(totalCost)}`}
                  />
                  <CheckItem
                    ok={readiness.crewFull}
                    label="Crew full"
                    detail={`${current}/${max} members`}
                  />
                  <CheckItem
                    ok={readiness.hasDate}
                    label="Date set"
                    detail={
                      exp.date_time
                        ? new Date(
                            exp.date_time as string,
                          ).toLocaleDateString()
                        : "Not set"
                    }
                  />
                  <CheckItem
                    ok={readiness.hasLocation}
                    label="Location set"
                    detail={(exp.location as string) || "Not set"}
                  />
                  <CheckItem
                    ok={readiness.hasCaptain}
                    label="Partner assigned"
                    detail={
                      captain
                        ? (captain.name as string)
                        : "No partner assigned"
                    }
                  />
                  <CheckItem
                    ok={readiness.hasSourceUrl}
                    label="Source listing URL"
                    detail={
                      exp.source_url
                        ? (exp.source_url as string).slice(0, 50) + "..."
                        : "Not set"
                    }
                  />
                </div>
              </Section>

              <Section title="Execute Booking">
                <ExecuteAgentButton
                  experienceId={exp.id as string}
                  experienceTitle={exp.title as string}
                  sourceUrl={(exp.source_url as string) || ""}
                  sourceProvider={(exp.source_provider as string) || "boatsetter"}
                  bookingDate={
                    exp.date_time
                      ? new Date(exp.date_time as string)
                          .toISOString()
                          .split("T")[0]
                      : ""
                  }
                  bookingStartTime={(exp.start_time as string) || ""}
                  durationHours={(exp.duration_hours as number) || 4}
                  totalAmount={totalCost}
                  ready={readyCount === totalChecks}
                />
              </Section>
            </>
          )}

          {/* OUTREACH SENT */}
          {stage === "outreach_sent" && (
            <OutreachPanel
              experienceId={exp.id as string}
              experienceTitle={exp.title as string}
              experienceDate={
                exp.date_time
                  ? new Date(exp.date_time as string).toLocaleDateString(
                      "en-US",
                      { month: "long", day: "numeric", year: "numeric" },
                    )
                  : "TBD"
              }
              captainName={captain ? (captain.name as string) : null}
              captainPhone={captain ? (captain.phone as string) : null}
              latestBooking={latestBooking}
              bookingLogs={bookingLogs}
            />
          )}

          {/* CONFIRMED */}
          {stage === "confirmed" && latestBooking && (
            <Section title="Booking Confirmed">
              <div className="space-y-3">
                <DetailRow
                  label="Confirmation #"
                  value={
                    (latestBooking.confirmation_number as string) || "Pending"
                  }
                  valueClass={
                    latestBooking.confirmation_number
                      ? "text-green-400 font-mono font-bold"
                      : ""
                  }
                />
                <DetailRow
                  label="Provider"
                  value={(latestBooking.source_provider as string) || "—"}
                />
                <DetailRow
                  label="Booking Date"
                  value={(latestBooking.booking_date as string) || "—"}
                />
                <DetailRow
                  label="Start Time"
                  value={(latestBooking.booking_start_time as string) || "—"}
                />
                <DetailRow
                  label="Duration"
                  value={`${(latestBooking.booking_duration_hours as number) || 0} hours`}
                />
                <DetailRow
                  label="Total Amount"
                  value={formatCurrency(
                    (latestBooking.booking_total_amount as number) || 0,
                  )}
                  valueClass="text-white font-bold"
                />
                {!!latestBooking.booked_at && (
                  <DetailRow
                    label="Booked At"
                    value={new Date(
                      latestBooking.booked_at as string,
                    ).toLocaleString()}
                  />
                )}
                {!!latestBooking.source_url && (
                  <div className="pt-3 border-t border-ocean-800">
                    <a
                      href={latestBooking.source_url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-cyan-400 hover:text-cyan-300"
                    >
                      View listing &nearr;
                    </a>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* COMPLETED */}
          {stage === "completed" && (
            <Section title="Experience Completed">
              <div className="text-center py-6">
                <div className="text-4xl mb-3">&#9989;</div>
                <p className="text-lg font-semibold text-white">
                  This experience has been fulfilled
                </p>
                <p className="text-sm text-ocean-400 mt-1">
                  {formatCurrency(totalCost)} charter &middot; {max} crew
                  members
                </p>
              </div>
            </Section>
          )}

          {/* Agent Activity Log (for outreach_sent, confirmed, completed) */}
          {bookingLogs.length > 0 &&
            stage !== "deposits_collecting" &&
            stage !== "ready_to_book" && (
              <Section title={`Agent Activity (${bookingLogs.length} steps)`}>
                <div className="space-y-3">
                  {bookingLogs.map((log, i) => (
                    <div key={log.id as string} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "w-2.5 h-2.5 rounded-full border-2 mt-1",
                            (log.level as string) === "error"
                              ? "border-red-400 bg-red-400/20"
                              : "border-ocean-500 bg-ocean-500/20",
                          )}
                        />
                        {i < bookingLogs.length - 1 && (
                          <div className="w-px flex-1 bg-ocean-700 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-3">
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              (log.level as string) === "error"
                                ? "text-red-400"
                                : "text-white",
                            )}
                          >
                            {log.action as string}
                          </span>
                          <span className="text-[10px] text-ocean-500">
                            {log.duration_ms
                              ? `${log.duration_ms as number}ms`
                              : ""}
                          </span>
                        </div>
                        {!!log.message && (
                          <p className="text-[10px] text-ocean-400 mt-0.5">
                            {log.message as string}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
        </div>

        {/* Sidebar — 1 col */}
        <div className="space-y-6">
          {/* Experience info */}
          <Section title="Details">
            <div className="space-y-3">
              <DetailRow
                label="Status"
                value={(exp.status as string) || "—"}
              />
              <DetailRow
                label="Booking Status"
                value={(exp.booking_status as string) || "none"}
              />
              {host && (
                <DetailRow
                  label="Host"
                  value={(host.display_name as string) || "—"}
                />
              )}
              {captain && (
                <>
                  <DetailRow
                    label="Partner"
                    value={(captain.name as string) || "—"}
                  />
                  {!!captain.phone && (
                    <DetailRow
                      label="Partner Phone"
                      value={captain.phone as string}
                    />
                  )}
                  {!!captain.email && (
                    <DetailRow
                      label="Partner Email"
                      value={captain.email as string}
                    />
                  )}
                </>
              )}
              {!!exp.boat_name && (
                <DetailRow
                  label="Boat"
                  value={exp.boat_name as string}
                />
              )}
              {!!exp.source_url && (
                <div className="pt-2 border-t border-ocean-800">
                  <a
                    href={exp.source_url as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    View listing &nearr;
                  </a>
                </div>
              )}
            </div>
          </Section>

          {/* Payments summary */}
          <Section title={`Payments (${payments.length})`}>
            {payments.length > 0 ? (
              <div className="space-y-2">
                {payments.slice(0, 10).map((p) => (
                  <div
                    key={p.id as string}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        statusColor(p.status as string),
                      )}
                    >
                      {p.status as string}
                    </span>
                    <span className="text-sm text-white font-medium">
                      {formatCurrency(p.amount as number)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-ocean-500 text-sm">No payments recorded</p>
            )}
          </Section>

          {/* Bookings */}
          {bookings.length > 0 && (
            <Section title={`Bookings (${bookings.length})`}>
              <div className="space-y-2">
                {bookings.map((b) => (
                  <Link
                    key={b.id as string}
                    href={`/bookings/${b.id}`}
                    className="block p-3 rounded-lg bg-ocean-800/50 hover:bg-ocean-800 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          statusColor(b.status as string),
                        )}
                      >
                        {(b.status as string).replace("_", " ")}
                      </span>
                      <span className="text-[10px] text-ocean-500 font-mono">
                        {(b.id as string).slice(0, 8)}
                      </span>
                    </div>
                    {!!b.confirmation_number && (
                      <p className="text-xs text-green-400 font-mono mt-1">
                        #{b.confirmation_number as string}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {/* Quick links */}
          <Section title="Links">
            <div className="space-y-2">
              <Link
                href={`/experiences/${exp.id}`}
                className="block text-xs text-cyan-400 hover:text-cyan-300"
              >
                View experience &rarr;
              </Link>
              {latestBooking && (
                <Link
                  href={`/bookings/${(latestBooking.id as string)}`}
                  className="block text-xs text-cyan-400 hover:text-cyan-300"
                >
                  View booking detail &rarr;
                </Link>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-ocean-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {badge && (
          <span className="text-xs text-ocean-400 font-medium">{badge}</span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: "green" | "yellow";
}) {
  return (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-4">
      <p className="text-[10px] text-ocean-500 uppercase tracking-wider font-medium">
        {label}
      </p>
      <p
        className={cn(
          "text-xl font-bold mt-1",
          highlight === "green"
            ? "text-green-400"
            : highlight === "yellow"
              ? "text-yellow-400"
              : "text-white",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-ocean-500 mt-0.5">{sub}</p>
    </div>
  );
}

function CheckItem({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-ocean-800/50">
      <div
        className={cn(
          "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
          ok
            ? "bg-green-500/20 text-green-400"
            : "bg-ocean-700 text-ocean-500",
        )}
      >
        {ok ? "\u2713" : "\u2013"}
      </div>
      <div className="flex-1">
        <span className={cn("text-sm", ok ? "text-white" : "text-ocean-400")}>
          {label}
        </span>
      </div>
      <span className="text-xs text-ocean-500 truncate max-w-[200px]">
        {detail}
      </span>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-ocean-800 first:border-t-0">
      <span className="text-xs text-ocean-400">{label}</span>
      <span className={cn("text-sm text-ocean-200", valueClass)}>{value}</span>
    </div>
  );
}
