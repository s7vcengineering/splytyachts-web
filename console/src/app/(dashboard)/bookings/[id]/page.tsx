import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, statusColor, cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

async function getBooking(id: string) {
  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "*, experience:experiences(id, title, status, total_cost, max_participants, current_participants, date_time, duration_hours, location, host:host_id(display_name))",
    )
    .eq("id", id)
    .single();

  if (!booking) return null;

  // Fetch booking logs
  const { data: logs } = await supabase
    .from("booking_logs")
    .select("*")
    .eq("booking_id", id)
    .order("created_at", { ascending: true });

  // Fetch related payments
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("experience_id", booking.experience_id)
    .order("created_at", { ascending: false });

  return { booking, logs: logs ?? [], payments: payments ?? [] };
}

export default async function BookingDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await getBooking(id);

  if (!result) notFound();

  const { booking: b, logs, payments } = result;
  const exp = b.experience as Record<string, unknown> | null;
  const host = exp?.host as Record<string, unknown> | null;
  const isFailed = b.status === "failed";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ocean-400 mb-6">
        <Link href="/dashboard" className="hover:text-white transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/bookings" className="hover:text-white transition-colors">
          Bookings
        </Link>
        <span>/</span>
        <span className="text-ocean-300 font-mono">{id.slice(0, 8)}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {(exp?.title as string) ?? "Booking Detail"}
          </h2>
          <p className="text-sm text-ocean-400 mt-1 font-mono">{id}</p>
        </div>
        <span
          className={cn(
            "px-4 py-2 rounded-full text-sm font-medium",
            statusColor(b.status),
          )}
        >
          {b.status.replace("_", " ")}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Booking Details */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">Booking Info</h3>
          </div>
          <div className="p-6 space-y-4">
            <DetailRow label="Provider" value={b.source_provider} />
            <DetailRow label="Date" value={b.booking_date} />
            <DetailRow label="Start Time" value={b.booking_start_time ?? "—"} />
            <DetailRow label="Duration" value={`${b.booking_duration_hours} hours`} />
            <DetailRow
              label="Total Amount"
              value={formatCurrency(b.booking_total_amount)}
              valueClass="text-white font-bold text-lg"
            />
            <DetailRow label="Confirmation #" value={b.confirmation_number ?? "—"} valueClass={b.confirmation_number ? "text-green-400 font-mono" : ""} />
            <DetailRow label="Retry Count" value={`${b.retry_count ?? 0} / ${b.max_retries ?? 3}`} />
            <DetailRow label="Created" value={new Date(b.created_at).toLocaleString()} />
            {b.booked_at ? (
              <DetailRow label="Booked At" value={new Date(b.booked_at).toLocaleString()} />
            ) : null}
            {b.source_url ? (
              <div className="flex items-center justify-between py-2 border-t border-ocean-800">
                <span className="text-xs text-ocean-400">Source URL</span>
                <a
                  href={b.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors truncate max-w-[300px]"
                >
                  {String(b.source_url)} &nearr;
                </a>
              </div>
            ) : null}
            {b.agent_session_id ? (
              <DetailRow label="Agent Session" value={String(b.agent_session_id)} valueClass="font-mono text-xs" />
            ) : null}
          </div>
        </div>

        {/* Experience Details */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ocean-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Experience</h3>
            {exp?.id ? (
              <Link
                href={`/experiences/${exp.id}`}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                View experience &rarr;
              </Link>
            ) : null}
          </div>
          <div className="p-6 space-y-4">
            <DetailRow label="Title" value={(exp?.title as string) ?? "—"} />
            <DetailRow label="Status" value={(exp?.status as string) ?? "—"}>
              {exp?.status ? (
                <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColor(exp.status as string))}>
                  {exp.status as string}
                </span>
              ) : null}
            </DetailRow>
            <DetailRow label="Host" value={(host?.display_name as string) ?? "—"} />
            <DetailRow label="Total Cost" value={formatCurrency((exp?.total_cost as number) ?? 0)} />
            <DetailRow label="Crew" value={`${exp?.current_participants ?? 0} / ${exp?.max_participants ?? 0}`} />
            <DetailRow label="Location" value={(exp?.location as string) ?? "—"} />
            <DetailRow label="Duration" value={`${exp?.duration_hours ?? 0} hours`} />
            {exp?.date_time ? (
              <DetailRow label="Date/Time" value={new Date(exp.date_time as string).toLocaleString()} />
            ) : null}
          </div>
        </div>

        {/* Error Details (if failed) */}
        {isFailed && b.failure_reason ? (
          <div className="bg-ocean-900 rounded-xl border border-red-500/30 overflow-hidden lg:col-span-2">
            <div className="px-6 py-4 border-b border-red-500/20 bg-red-500/5">
              <h3 className="text-lg font-semibold text-red-400">Failure Details</h3>
            </div>
            <div className="p-6">
              <pre className="text-sm text-red-300 bg-ocean-950 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono">
                {b.failure_reason}
              </pre>
            </div>
          </div>
        ) : null}

        {/* Payments */}
        {payments.length > 0 ? (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden lg:col-span-2">
            <div className="px-6 py-4 border-b border-ocean-700">
              <h3 className="text-lg font-semibold text-white">
                Payments ({payments.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ocean-800 text-ocean-300">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">ID</th>
                    <th className="px-6 py-3 text-left font-medium">Amount</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-left font-medium">Stripe PI</th>
                    <th className="px-6 py-3 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ocean-800">
                  {payments.map((p: Record<string, unknown>) => (
                    <tr key={p.id as string} className="hover:bg-ocean-800/50">
                      <td className="px-6 py-3 text-ocean-300 font-mono text-xs">
                        {(p.id as string).slice(0, 8)}
                      </td>
                      <td className="px-6 py-3 text-white font-medium">
                        {formatCurrency(p.amount as number)}
                      </td>
                      <td className="px-6 py-3">
                        <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColor(p.status as string))}>
                          {p.status as string}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-ocean-400 font-mono text-xs truncate max-w-[200px]">
                        {(p.stripe_payment_intent_id as string) ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-ocean-400 text-xs">
                        {new Date(p.created_at as string).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Booking Logs / Timeline */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">
              Activity Log ({logs.length})
            </h3>
          </div>
          {logs.length > 0 ? (
            <div className="p-6">
              <div className="space-y-4">
                {logs.map((log: Record<string, unknown>, i: number) => (
                  <div key={log.id as string} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          "w-3 h-3 rounded-full border-2",
                          (log.level as string) === "error"
                            ? "border-red-400 bg-red-400/20"
                            : (log.level as string) === "warn"
                              ? "border-yellow-400 bg-yellow-400/20"
                              : "border-ocean-500 bg-ocean-500/20",
                        )}
                      />
                      {i < logs.length - 1 && (
                        <div className="w-px flex-1 bg-ocean-700 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            (log.level as string) === "error"
                              ? "text-red-400"
                              : "text-white",
                          )}
                        >
                          {log.action as string}
                        </span>
                        <span className="text-xs text-ocean-500">
                          {new Date(log.created_at as string).toLocaleString()}
                        </span>
                      </div>
                      {log.message ? (
                        <p className="text-xs text-ocean-400 mt-1">
                          {log.message as string}
                        </p>
                      ) : null}
                      {log.metadata && typeof log.metadata === "object" && Object.keys(log.metadata as object).length > 0 ? (
                        <pre className="text-[10px] text-ocean-500 bg-ocean-950 rounded p-2 mt-2 overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-ocean-400 text-sm">
              No activity logs recorded
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClass,
  children,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-t border-ocean-800 first:border-t-0">
      <span className="text-xs text-ocean-400">{label}</span>
      {children || (
        <span className={cn("text-sm text-ocean-200", valueClass)}>
          {value}
        </span>
      )}
    </div>
  );
}
