import { createServiceClient } from "@/lib/supabase";
import { statusColor, cn, formatCity } from "@/lib/utils";
import { DiscoverCitiesButton, BackfillCaptainsButton } from "./discover-button";

export const dynamic = "force-dynamic";

async function getData() {
  const supabase = createServiceClient();

  const now = new Date();
  const staleThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const [
    { data: scrapeConfig },
    { data: scrapeJobs },
    { count: totalBoats },
    { count: activeBoats },
    { count: staleBoats },
    { data: cityBreakdown },
  ] = await Promise.all([
    supabase.from("scrape_config").select("*").eq("id", "boatsetter").single(),
    supabase
      .from("scrape_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("boats")
      .select("*", { count: "exact", head: true })
      .eq("source_provider", "boatsetter"),
    supabase
      .from("boats")
      .select("*", { count: "exact", head: true })
      .eq("source_provider", "boatsetter")
      .eq("is_active", true),
    supabase
      .from("boats")
      .select("*", { count: "exact", head: true })
      .eq("source_provider", "boatsetter")
      .eq("is_active", true)
      .lt("last_scraped_at", staleThreshold),
    supabase
      .from("boats")
      .select("city")
      .eq("source_provider", "boatsetter")
      .eq("is_active", true)
      .not("city", "is", null),
  ]);

  // Calculate city counts
  const cityCounts: Record<string, number> = {};
  for (const row of cityBreakdown ?? []) {
    const city = row.city as string;
    cityCounts[city] = (cityCounts[city] || 0) + 1;
  }
  const sortedCities = Object.entries(cityCounts).sort(([, a], [, b]) => b - a);

  return {
    config: scrapeConfig,
    jobs: scrapeJobs ?? [],
    totalBoats: totalBoats ?? 0,
    activeBoats: activeBoats ?? 0,
    staleBoats: staleBoats ?? 0,
    citiesCount: sortedCities.length,
    sortedCities,
  };
}

export default async function ScrapingPage() {
  const { config, jobs, totalBoats, activeBoats, staleBoats, citiesCount, sortedCities } =
    await getData();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Scrape Dashboard</h2>
        <div className="flex items-center gap-3">
          <DiscoverCitiesButton />
          <BackfillCaptainsButton />
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Boats" value={totalBoats} />
        <MetricCard label="Active Boats" value={activeBoats} accent />
        <MetricCard
          label="Stale Boats"
          value={staleBoats}
          warn={staleBoats > 0}
          subtitle="> 48h since scrape"
        />
        <MetricCard label="Cities Covered" value={citiesCount} accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* City breakdown */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">
              Boats by City
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ocean-800 text-ocean-300">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">City</th>
                  <th className="px-6 py-3 text-right font-medium">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ocean-800">
                {sortedCities.map(([city, count]) => (
                  <tr
                    key={city}
                    className="hover:bg-ocean-800/50 transition-colors"
                  >
                    <td className="px-6 py-3 text-white">{formatCity(city)}</td>
                    <td className="px-6 py-3 text-ocean-300 text-right font-mono">
                      {count}
                    </td>
                  </tr>
                ))}
                {sortedCities.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-6 py-8 text-center text-ocean-400"
                    >
                      No boat data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scrape config */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Scrape Config
          </h3>
          {config ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-ocean-400 text-sm">Enabled</span>
                <span
                  className={cn(
                    "px-2 py-1 rounded text-xs font-medium",
                    config.enabled
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400",
                  )}
                >
                  {config.enabled ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ocean-400 text-sm">Crawl interval</span>
                <span className="text-white text-sm">
                  {config.scrape_interval_hours}h
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ocean-400 text-sm">
                  Availability refresh
                </span>
                <span className="text-white text-sm">
                  {config.availability_refresh_hours}h
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ocean-400 text-sm">
                  Max concurrent pages
                </span>
                <span className="text-white text-sm">
                  {config.max_concurrent_pages}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ocean-400 text-sm">Page delay</span>
                <span className="text-white text-sm">
                  {config.page_delay_ms}ms
                </span>
              </div>
              <div>
                <p className="text-ocean-400 text-sm mb-2">
                  Cities ({(config.cities as string[]).length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(config.cities as string[]).map((city: string) => (
                    <span
                      key={city}
                      className="px-2 py-1 rounded bg-ocean-800 text-ocean-300 text-xs"
                    >
                      {formatCity(city)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-ocean-400 text-sm">No config found</p>
          )}
        </div>
      </div>

      {/* Recent scrape jobs */}
      <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-ocean-700">
          <h3 className="text-lg font-semibold text-white">
            Recent Scrape Jobs
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ocean-800 text-ocean-300">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">City</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Found</th>
                <th className="px-4 py-3 text-right font-medium">Scraped</th>
                <th className="px-4 py-3 text-right font-medium">New</th>
                <th className="px-4 py-3 text-right font-medium">Updated</th>
                <th className="px-4 py-3 text-right font-medium">Deactivated</th>
                <th className="px-4 py-3 text-right font-medium">Errors</th>
                <th className="px-4 py-3 text-left font-medium">Duration</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-800">
              {jobs.map((job: Record<string, unknown>) => {
                const started = job.started_at
                  ? new Date(job.started_at as string).getTime()
                  : null;
                const completed = job.completed_at
                  ? new Date(job.completed_at as string).getTime()
                  : null;
                const durationMs =
                  started && completed ? completed - started : null;
                const durationStr = durationMs
                  ? durationMs > 60000
                    ? `${(durationMs / 60000).toFixed(1)}m`
                    : `${(durationMs / 1000).toFixed(1)}s`
                  : "—";

                return (
                  <tr
                    key={job.id as string}
                    className="hover:bg-ocean-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-white font-medium text-xs">
                      {(job.job_type as string).replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-ocean-300 text-xs">
                      {job.city ? formatCity(job.city as string) : "All"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          statusColor(job.status as string),
                        )}
                      >
                        {job.status as string}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ocean-300 text-right font-mono text-xs">
                      {job.listings_found as number}
                    </td>
                    <td className="px-4 py-3 text-ocean-300 text-right font-mono text-xs">
                      {job.listings_scraped as number}
                    </td>
                    <td className="px-4 py-3 text-green-400 text-right font-mono text-xs">
                      {(job.listings_new as number) > 0
                        ? `+${job.listings_new}`
                        : "0"}
                    </td>
                    <td className="px-4 py-3 text-cyan-400 text-right font-mono text-xs">
                      {job.listings_updated as number}
                    </td>
                    <td className="px-4 py-3 text-orange-400 text-right font-mono text-xs">
                      {job.listings_deactivated as number}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {(job.error_count as number) > 0 ? (
                        <span className="text-red-400">
                          {job.error_count as number}
                        </span>
                      ) : (
                        <span className="text-ocean-500">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ocean-400 text-xs">
                      {durationStr}
                    </td>
                    <td className="px-4 py-3 text-ocean-400 text-xs whitespace-nowrap">
                      {new Date(job.created_at as string).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {jobs.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-8 text-center text-ocean-400"
                  >
                    No scrape jobs yet
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
  accent,
  warn,
  subtitle,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-5">
      <p className="text-xs text-ocean-400 font-medium uppercase tracking-wider">
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
      {subtitle && (
        <p className="text-[10px] text-ocean-500 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
