import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, statusColor, cn } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getMetrics() {
  const supabase = createServiceClient();

  const [
    { count: totalExperiences },
    { count: openExperiences },
    { count: totalBookings },
    { count: pendingBookings },
    { count: failedBookings },
    { count: completedBookings },
    { count: totalUsers },
    { data: recentBookings },
  ] = await Promise.all([
    supabase.from("experiences").select("*", { count: "exact", head: true }),
    supabase.from("experiences").select("*", { count: "exact", head: true }).in("status", ["open", "filling"]),
    supabase.from("bookings").select("*", { count: "exact", head: true }),
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("bookings").select("*", { count: "exact", head: true }).in("status", ["booked", "confirmed"]),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("bookings")
      .select(
        "id, status, source_provider, source_url, booking_date, booking_start_time, booking_duration_hours, booking_total_amount, failure_reason, confirmation_number, retry_count, max_retries, created_at, booked_at, experience:experiences(id, title, status)",
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return {
    totalExperiences: totalExperiences ?? 0,
    openExperiences: openExperiences ?? 0,
    totalBookings: totalBookings ?? 0,
    pendingBookings: pendingBookings ?? 0,
    failedBookings: failedBookings ?? 0,
    completedBookings: completedBookings ?? 0,
    totalUsers: totalUsers ?? 0,
    recentBookings: recentBookings ?? [],
  };
}

export default async function DashboardPage() {
  const m = await getMetrics();

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Dashboard</h2>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Experiences"
          value={m.totalExperiences}
          href="/experiences"
        />
        <MetricCard
          label="Active Splits"
          value={m.openExperiences}
          href="/experiences?status=open"
          accent
        />
        <MetricCard
          label="Total Bookings"
          value={m.totalBookings}
          href="/bookings"
        />
        <MetricCard
          label="Users"
          value={m.totalUsers}
          href="/crew"
        />
        <MetricCard
          label="Pending Bookings"
          value={m.pendingBookings}
          href="/bookings?status=pending"
          warn={m.pendingBookings > 0}
        />
        <MetricCard
          label="Failed Bookings"
          value={m.failedBookings}
          href="/bookings?status=failed"
          warn={m.failedBookings > 0}
        />
        <MetricCard
          label="Completed Bookings"
          value={m.completedBookings}
          href="/bookings?status=completed"
          accent
        />
      </div>

      {/* Recent bookings */}
      <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-ocean-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Recent Bookings</h3>
          <Link
            href="/bookings"
            className="text-xs text-ocean-400 hover:text-white transition-colors"
          >
            View all &rarr;
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ocean-800 text-ocean-300">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Experience</th>
                <th className="px-6 py-3 text-left font-medium">Provider</th>
                <th className="px-6 py-3 text-left font-medium">Amount</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium">Date</th>
                <th className="px-6 py-3 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-800">
              {m.recentBookings.map((b: Record<string, unknown>) => {
                const exp = b.experience as Record<string, unknown> | null;
                const isFailed = (b.status as string) === "failed";
                return (
                  <tr
                    key={b.id as string}
                    className="hover:bg-ocean-800/50 transition-colors"
                  >
                    <td className="px-6 py-3">
                      {exp?.id ? (
                        <Link
                          href={`/experiences/${exp.id}`}
                          className="text-white font-medium hover:text-cyan-400 transition-colors"
                        >
                          {(exp.title as string) ?? "—"}
                        </Link>
                      ) : (
                        <span className="text-white font-medium">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-ocean-300 capitalize">
                      {b.source_provider as string}
                    </td>
                    <td className="px-6 py-3 text-ocean-200">
                      {formatCurrency(b.booking_total_amount as number)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          statusColor(b.status as string),
                        )}
                      >
                        {(b.status as string).replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-ocean-400 text-xs">
                      {new Date(b.created_at as string).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        href={`/bookings/${b.id}`}
                        className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        View &rarr;
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {m.recentBookings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-ocean-400">
                    No bookings yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  href,
  accent,
  warn,
}: {
  label: string;
  value: number;
  href: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className="bg-ocean-900 rounded-xl border border-ocean-700 p-5 hover:border-ocean-500 hover:bg-ocean-800/50 transition-all group cursor-pointer"
    >
      <p className="text-xs text-ocean-400 font-medium uppercase tracking-wider group-hover:text-ocean-300 transition-colors">
        {label}
      </p>
      <p
        className={cn(
          "text-3xl font-bold mt-1",
          warn ? "text-red-400" : accent ? "text-cyan-400" : "text-white",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-ocean-600 mt-2 group-hover:text-ocean-400 transition-colors">
        Click to view details &rarr;
      </p>
    </Link>
  );
}
