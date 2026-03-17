import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, statusColor, cn } from "@/lib/utils";
import Link from "next/link";
import { BookingsFilter } from "./bookings-filter";
import { BulkRetryButton } from "./bulk-retry-button";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

async function getBookings(params: Record<string, string | undefined>) {
  const supabase = createServiceClient();

  let query = supabase
    .from("bookings")
    .select(
      "id, experience_id, source_provider, source_url, booking_date, booking_start_time, booking_duration_hours, booking_total_amount, status, retry_count, max_retries, failure_reason, confirmation_number, agent_session_id, created_at, booked_at, experience:experiences(id, title, status)",
      { count: "exact" },
    );

  // Status filter
  if (params.status) {
    if (params.status === "completed") {
      query = query.in("status", ["booked", "confirmed"]);
    } else {
      query = query.eq("status", params.status);
    }
  }

  // Search
  if (params.q) {
    query = query.or(
      `confirmation_number.ilike.%${params.q}%,failure_reason.ilike.%${params.q}%,id.ilike.%${params.q}%`,
    );
  }

  query = query.order("created_at", { ascending: false }).limit(100);

  const { data, count } = await query;

  // Count failed bookings with retries remaining (for bulk retry button)
  const failedCount = (data ?? []).filter(
    (b: Record<string, unknown>) =>
      (b.status as string) === "failed" &&
      (b.retry_count as number) < (b.max_retries as number),
  ).length;

  return { bookings: data ?? [], total: count ?? 0, failedCount };
}

export default async function BookingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { bookings, total, failedCount } = await getBookings(params);

  const statusLabel = params.status
    ? params.status === "completed"
      ? "Completed"
      : params.status.charAt(0).toUpperCase() + params.status.slice(1)
    : "All";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Bookings</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
            {total} {statusLabel !== "All" ? statusLabel.toLowerCase() : ""} bookings
          </span>
        </div>
        <div className="flex items-center gap-3">
          <BulkRetryButton failedCount={failedCount} />
          {params.status && (
            <Link
              href="/bookings"
              className="text-xs text-ocean-400 hover:text-white transition-colors underline"
            >
              Show all bookings
            </Link>
          )}
        </div>
      </div>

      <BookingsFilter />

      <div className="space-y-4 mt-6">
        {bookings.map((b: Record<string, unknown>) => (
          <BookingCard key={b.id as string} booking={b} />
        ))}
        {bookings.length === 0 && (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-8 text-center text-ocean-400">
            No {statusLabel !== "All" ? statusLabel.toLowerCase() + " " : ""}bookings found
          </div>
        )}
      </div>
    </div>
  );
}

function BookingCard({ booking: b }: { booking: Record<string, unknown> }) {
  const isFailed = (b.status as string) === "failed";
  const isPending = (b.status as string) === "pending";
  const canRetry = isFailed && (b.retry_count as number) < (b.max_retries as number);
  const exp = b.experience as Record<string, unknown> | null;

  return (
    <Link
      href={`/bookings/${b.id}`}
      className={cn(
        "block bg-ocean-900 rounded-xl border overflow-hidden hover:bg-ocean-800/50 transition-all group",
        isFailed ? "border-red-500/30 hover:border-red-500/50" : "border-ocean-700 hover:border-ocean-500",
      )}
    >
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h3 className="text-white font-semibold group-hover:text-cyan-400 transition-colors">
              {(exp?.title as string) ?? "Unknown Experience"}
            </h3>
            <p className="text-xs text-ocean-400 mt-0.5">
              {b.source_provider as string} &middot; {b.booking_date as string}
              {b.booking_start_time ? ` at ${b.booking_start_time}` : ""}
              {" "}&middot; {b.booking_duration_hours as number}hrs
              {" "}&middot; {formatCurrency(b.booking_total_amount as number)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("px-3 py-1 rounded-full text-xs font-medium", statusColor(b.status as string))}>
            {(b.status as string).replace("_", " ")}
          </span>
          {b.confirmation_number ? (
            <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs font-mono">
              #{String(b.confirmation_number)}
            </span>
          ) : null}
          {canRetry ? (
            <span className="text-xs text-ocean-400">
              Retries: {Number(b.retry_count)}/{Number(b.max_retries)}
            </span>
          ) : null}
          {isPending ? (
            <span className="text-xs text-yellow-400 animate-pulse">Processing...</span>
          ) : null}
          <svg
            className="w-4 h-4 text-ocean-600 group-hover:text-ocean-300 transition-colors"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
      {isFailed && b.failure_reason ? (
        <div className="px-6 py-3 bg-red-500/5 border-t border-red-500/20">
          <p className="text-xs text-red-400">
            <span className="font-medium">Error:</span> {String(b.failure_reason)}
          </p>
        </div>
      ) : null}
      <div className="px-6 py-2 bg-ocean-800/30 border-t border-ocean-800 flex items-center justify-between">
        <span className="text-xs text-ocean-500 font-mono">{(b.id as string).slice(0, 8)}</span>
        <span className="text-xs text-ocean-500">
          Created {new Date(b.created_at as string).toLocaleString()}
        </span>
      </div>
    </Link>
  );
}
