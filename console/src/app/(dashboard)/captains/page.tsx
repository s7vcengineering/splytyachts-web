import { createServiceClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { CaptainsFilter } from "./captains-filter";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string; source?: string }>;
}

async function getData(params: { q?: string; source?: string }) {
  const supabase = createServiceClient();

  let query = supabase
    .from("captains")
    .select("*")
    .eq("is_active", true)
    .order("boats_count", { ascending: false });

  if (params.q) {
    query = query.ilike("name", `%${params.q}%`);
  }
  if (params.source) {
    query = query.eq("source", params.source);
  }

  const { data: captains } = await query.limit(100);

  // Stats
  const [
    { count: totalCaptains },
    { count: withProfile },
    { data: ratingData },
  ] = await Promise.all([
    supabase
      .from("captains")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("captains")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .not("profile_id", "is", null),
    supabase
      .from("captains")
      .select("rating, boats_count")
      .eq("is_active", true)
      .not("rating", "is", null),
  ]);

  const ratings = (ratingData ?? []).map((r: Record<string, unknown>) => Number(r.rating));
  const avgRating = ratings.length > 0
    ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
    : 0;

  const boatCounts = (ratingData ?? []).map((r: Record<string, unknown>) => Number(r.boats_count));
  const avgBoats = boatCounts.length > 0
    ? boatCounts.reduce((a: number, b: number) => a + b, 0) / boatCounts.length
    : 0;

  return {
    captains: captains ?? [],
    totalCaptains: totalCaptains ?? 0,
    withProfile: withProfile ?? 0,
    avgRating,
    avgBoats,
  };
}

export default async function CaptainsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { captains, totalCaptains, withProfile, avgRating, avgBoats } = await getData(params);

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Partners</h2>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Partners" value={totalCaptains} />
        <StatCard label="With Profile" value={withProfile} accent />
        <StatCard label="Avg Rating" value={avgRating.toFixed(1)} />
        <StatCard label="Avg Listings" value={avgBoats.toFixed(1)} />
      </div>

      {/* Filters */}
      <CaptainsFilter />

      {/* Table */}
      <div className="mt-6 bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ocean-800 text-ocean-300">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Partner</th>
                <th className="px-4 py-3 text-left font-medium">Rating</th>
                <th className="px-4 py-3 text-right font-medium">Listings</th>
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Profile</th>
                <th className="px-4 py-3 text-left font-medium">Phone</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-800">
              {captains.map((c: Record<string, unknown>) => (
                <tr
                  key={c.id as string}
                  className="hover:bg-ocean-800/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {c.avatar_url ? (
                        <img
                          src={c.avatar_url as string}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold">
                          {((c.name as string) ?? "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-white font-medium">
                        {c.name as string}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.rating ? (
                      <div className="flex items-center gap-1">
                        <svg
                          className="w-3.5 h-3.5 text-yellow-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-ocean-300 text-xs">
                          {Number(c.rating).toFixed(1)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-ocean-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ocean-300 text-right font-mono text-xs">
                    {c.boats_count as number}
                  </td>
                  <td className="px-4 py-3 text-ocean-300 text-xs capitalize">
                    {c.source as string}
                  </td>
                  <td className="px-4 py-3">
                    {c.profile_id ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                        Linked
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-ocean-800 text-ocean-500">
                        None
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ocean-400 text-xs">
                    {(c.phone as string) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ocean-500 text-xs whitespace-nowrap">
                    {new Date(c.created_at as string).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/captains/${c.id}`}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Detail &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
              {captains.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-ocean-400"
                  >
                    No partners found
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

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-5">
      <p className="text-xs text-ocean-400 font-medium uppercase tracking-wider">
        {label}
      </p>
      <p
        className={cn(
          "text-3xl font-bold mt-1",
          accent ? "text-cyan-400" : "text-white",
        )}
      >
        {value}
      </p>
    </div>
  );
}
