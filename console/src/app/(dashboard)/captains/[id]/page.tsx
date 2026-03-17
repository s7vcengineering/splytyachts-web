import { createServiceClient } from "@/lib/supabase";
import { cn, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaptainActions } from "./captain-actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

async function getCaptain(id: string) {
  const supabase = createServiceClient();

  const { data: captain } = await supabase
    .from("captains")
    .select("*")
    .eq("id", id)
    .single();

  if (!captain) return null;

  // Get boats managed by this captain
  const { data: boats } = await supabase
    .from("boats")
    .select("id, name, type, city, hourly_rate, rating, is_active, photo_urls")
    .eq("captain_id", id)
    .order("hourly_rate", { ascending: false })
    .limit(50);

  // Get experiences assigned to this captain
  const { data: experiences } = await supabase
    .from("experiences")
    .select("id, title, status, date_time, location, total_cost")
    .eq("captain_id", id)
    .order("date_time", { ascending: false })
    .limit(20);

  return {
    captain,
    boats: boats ?? [],
    experiences: experiences ?? [],
  };
}

export default async function CaptainDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await getCaptain(id);

  if (!result) notFound();

  const { captain: c, boats, experiences } = result;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ocean-400 mb-6">
        <Link href="/dashboard" className="hover:text-white transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/captains" className="hover:text-white transition-colors">
          Partners
        </Link>
        <span>/</span>
        <span className="text-ocean-300 truncate max-w-[200px]">{c.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-6 mb-6">
        {c.avatar_url ? (
          <img
            src={c.avatar_url}
            alt={c.name}
            className="w-20 h-20 rounded-full object-cover ring-2 ring-amber-400/30"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-2xl font-bold">
            {c.name[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            {c.name}
            <span className="text-amber-400 text-lg">&#129309;</span>
          </h2>
          <div className="flex items-center gap-4 mt-2">
            {c.rating && (
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-white font-medium">{Number(c.rating).toFixed(1)}</span>
              </div>
            )}
            <span className="text-ocean-400 text-sm">{c.boats_count} listings</span>
            <span className="text-ocean-400 text-sm capitalize">{c.source}</span>
            {c.profile_id ? (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                Profile Linked
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-ocean-800 text-ocean-500">
                No Profile
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Captain Info */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">Details</h3>
          </div>
          <div className="p-6 space-y-3">
            <DetailRow label="ID" value={c.id} valueClass="font-mono text-xs" />
            <DetailRow label="Name" value={c.name} />
            <DetailRow label="Rating" value={c.rating ? Number(c.rating).toFixed(2) : "—"} />
            <DetailRow label="Source" value={c.source} />
            <DetailRow label="External ID" value={c.boatsetter_manager_id ?? "—"} valueClass="font-mono text-xs" />
            <DetailRow label="Phone" value={c.phone ?? "—"} />
            <DetailRow label="Email" value={c.email ?? "—"} />
            <DetailRow label="Response Rate" value={c.response_rate ? `${Number(c.response_rate).toFixed(0)}%` : "—"} />
            <DetailRow label="Active" value={c.is_active ? "Yes" : "No"} />
            <DetailRow label="Created" value={new Date(c.created_at).toLocaleString()} />
            <DetailRow label="Updated" value={new Date(c.updated_at).toLocaleString()} />
            {c.bio && (
              <div className="pt-3 border-t border-ocean-800">
                <p className="text-xs text-ocean-400 mb-1">Bio</p>
                <p className="text-sm text-ocean-200 whitespace-pre-line">{c.bio}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <CaptainActions captainId={c.id} profileId={c.profile_id} captainPhone={c.phone} />

        {/* Boats */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">
              Listings ({boats.length})
            </h3>
          </div>
          {boats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ocean-800 text-ocean-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Boat</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">City</th>
                    <th className="px-4 py-3 text-right font-medium">Rate</th>
                    <th className="px-4 py-3 text-left font-medium">Rating</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ocean-800">
                  {boats.map((b: Record<string, unknown>) => {
                    const photos = (b.photo_urls as string[]) || [];
                    return (
                      <tr key={b.id as string} className="hover:bg-ocean-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {photos[0] ? (
                              <img
                                src={photos[0]}
                                alt=""
                                className="w-10 h-7 rounded object-cover"
                              />
                            ) : (
                              <div className="w-10 h-7 rounded bg-ocean-800" />
                            )}
                            <span className="text-white font-medium text-xs truncate max-w-[200px]">
                              {b.name as string}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-ocean-300 text-xs capitalize">
                          {(b.type as string) ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-ocean-300 text-xs">
                          {(b.city as string) ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-white text-right font-mono text-xs">
                          {b.hourly_rate ? formatCurrency(b.hourly_rate as number) + "/hr" : "—"}
                        </td>
                        <td className="px-4 py-3 text-ocean-300 text-xs">
                          {b.rating ? Number(b.rating).toFixed(1) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium",
                              (b.is_active as boolean)
                                ? "bg-green-500/20 text-green-400"
                                : "bg-red-500/20 text-red-400",
                            )}
                          >
                            {(b.is_active as boolean) ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/boats/${b.id}`}
                            className="text-xs text-cyan-400 hover:text-cyan-300"
                          >
                            View &rarr;
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-ocean-400 text-sm">
              No listings linked to this partner
            </div>
          )}
        </div>

        {/* Experiences */}
        {experiences.length > 0 && (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden lg:col-span-2">
            <div className="px-6 py-4 border-b border-ocean-700">
              <h3 className="text-lg font-semibold text-white">
                Assigned Experiences ({experiences.length})
              </h3>
            </div>
            <div className="divide-y divide-ocean-800">
              {experiences.map((exp: Record<string, unknown>) => (
                <div
                  key={exp.id as string}
                  className="px-6 py-3 flex items-center justify-between hover:bg-ocean-800/50 transition-colors"
                >
                  <div>
                    <Link
                      href={`/experiences/${exp.id}`}
                      className="text-sm text-white font-medium hover:text-cyan-400 transition-colors"
                    >
                      {exp.title as string}
                    </Link>
                    <p className="text-[10px] text-ocean-500">
                      {exp.location as string} &middot;{" "}
                      {exp.date_time
                        ? new Date(exp.date_time as string).toLocaleDateString()
                        : "TBD"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white font-medium">
                      {formatCurrency((exp.total_cost as number) ?? 0)}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-ocean-800 text-ocean-300 capitalize">
                      {exp.status as string}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-ocean-400">{label}</span>
      <span className={cn("text-sm text-ocean-200", valueClass)}>{value}</span>
    </div>
  );
}
