import { createSupabaseClient } from "@/lib/supabase";
import { statusColor, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getRecentLogs() {
  const supabase = createSupabaseClient();
  const { data } = await supabase
    .from("booking_logs")
    .select("id, booking_id, step, status, message, screenshot_url, page_url, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export default async function AgentLogsPage() {
  const logs = await getRecentLogs();

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Agent Logs</h2>
      <p className="text-ocean-400 text-sm mb-4">
        Real-time activity from the Playwright booking agent. Newest first.
      </p>

      <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
        <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-ocean-800 text-ocean-300 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-left font-medium">Booking</th>
                <th className="px-4 py-3 text-left font-medium">Step</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Duration</th>
                <th className="px-4 py-3 text-left font-medium">Message</th>
                <th className="px-4 py-3 text-left font-medium">Screenshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-800 font-mono text-xs">
              {logs.map((l: Record<string, unknown>) => (
                <tr key={l.id as string} className="hover:bg-ocean-800/50 transition-colors">
                  <td className="px-4 py-2 text-ocean-400 whitespace-nowrap">
                    {new Date(l.created_at as string).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2 text-ocean-300">
                    {(l.booking_id as string).slice(0, 8)}
                  </td>
                  <td className="px-4 py-2 text-white font-medium">
                    {l.step as string}
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      l.status === "completed"
                        ? "bg-green-500/20 text-green-400"
                        : l.status === "failed"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-yellow-500/20 text-yellow-400",
                    )}>
                      {l.status as string}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-ocean-400">
                    {l.duration_ms ? `${l.duration_ms}ms` : "—"}
                  </td>
                  <td className="px-4 py-2 text-ocean-300 max-w-[300px] truncate">
                    {(l.message as string) ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {l.screenshot_url ? (
                      <a
                        href={l.screenshot_url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-ocean-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ocean-400">
                    No agent activity yet. Logs appear here when the booking agent runs.
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
