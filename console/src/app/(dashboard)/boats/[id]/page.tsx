import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, scrapeStatusColor, cn, formatCity } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

async function getBoat(id: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("boats")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

export default async function BoatDetailPage({ params }: Props) {
  const { id } = await params;
  const boat = await getBoat(id);

  if (!boat) notFound();

  const photos = (boat.photo_urls as string[]) || [];
  const pricingTiers = (boat.pricing_tiers as Array<{ hours: number; price: number }>) || [];
  const amenities = (boat.amenities as string[]) || [];
  const features = (boat.features as string[]) || [];

  return (
    <div>
      {/* Back link */}
      <Link
        href="/boats"
        className="inline-flex items-center gap-1.5 text-sm text-ocean-400 hover:text-white transition-colors mb-6"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
        Back to catalog
      </Link>

      {/* Photo gallery */}
      {photos.length > 0 && (
        <div className="mb-6">
          <div className="rounded-xl overflow-hidden bg-ocean-800 aspect-[21/9]">
            <img
              src={photos[0]}
              alt={boat.name}
              className="w-full h-full object-cover"
            />
          </div>
          {photos.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {photos.slice(1, 7).map((url: string, i: number) => (
                <div
                  key={i}
                  className="w-24 h-18 shrink-0 rounded-lg overflow-hidden bg-ocean-800"
                >
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {photos.length > 7 && (
                <div className="w-24 h-18 shrink-0 rounded-lg bg-ocean-800 flex items-center justify-center text-ocean-400 text-sm">
                  +{photos.length - 7}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{boat.name}</h2>
          <p className="text-ocean-400 mt-1">
            {boat.city ? formatCity(boat.city) : "Unknown location"}
            {boat.region && <span> &middot; {boat.region}</span>}
          </p>
        </div>
        {boat.rating && (
          <div className="flex items-center gap-1.5 bg-ocean-800 rounded-lg px-3 py-2">
            <svg
              className="w-4 h-4 text-yellow-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-white font-bold">
              {Number(boat.rating).toFixed(1)}
            </span>
            {boat.review_count > 0 && (
              <span className="text-ocean-400 text-sm">
                ({boat.review_count} reviews)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2 mb-6">
        {boat.type && <Badge label={boat.type} />}
        {boat.length_ft && <Badge label={`${boat.length_ft} ft`} />}
        {boat.capacity && <Badge label={`${boat.capacity} guests`} />}
        {boat.year && <Badge label={`Year ${boat.year}`} />}
        {boat.make && <Badge label={boat.make} />}
        {boat.model && <Badge label={boat.model} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pricing section */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Pricing</h3>
          {boat.hourly_rate && (
            <p className="text-2xl font-bold text-white mb-4">
              {formatCurrency(boat.hourly_rate)}
              <span className="text-sm text-ocean-400 font-normal">/hr</span>
            </p>
          )}

          {pricingTiers.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-ocean-700 mb-4">
              <table className="w-full text-sm">
                <thead className="bg-ocean-800 text-ocean-300">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Hours</th>
                    <th className="px-4 py-2 text-right font-medium">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ocean-800">
                  {pricingTiers.map(
                    (tier: { hours: number; price: number }, i: number) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-ocean-300">
                          {tier.hours} hours
                        </td>
                        <td className="px-4 py-2 text-white text-right font-medium">
                          {formatCurrency(tier.price)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {boat.min_duration_hours && (
              <span className="px-2 py-1 rounded bg-ocean-800 text-ocean-300 text-xs">
                Min {boat.min_duration_hours}hrs
              </span>
            )}
            {boat.max_duration_hours && (
              <span className="px-2 py-1 rounded bg-ocean-800 text-ocean-300 text-xs">
                Max {boat.max_duration_hours}hrs
              </span>
            )}
            {boat.captain_included && (
              <span className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs">
                Captain included
              </span>
            )}
            {boat.fuel_included && (
              <span className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs">
                Fuel included
              </span>
            )}
            {boat.captain_optional && (
              <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 text-xs">
                Captain optional
              </span>
            )}
          </div>
        </div>

        {/* Captain card */}
        {boat.captain_name && (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Captain</h3>
            <div className="flex items-center gap-4">
              {boat.captain_avatar_url ? (
                <img
                  src={boat.captain_avatar_url}
                  alt={boat.captain_name}
                  className="w-14 h-14 rounded-full object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-ocean-700 flex items-center justify-center text-ocean-400 text-lg font-bold">
                  {boat.captain_name[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-white font-semibold">{boat.captain_name}</p>
                {boat.captain_rating && (
                  <div className="flex items-center gap-1 mt-1">
                    <svg
                      className="w-3.5 h-3.5 text-yellow-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-ocean-300 text-sm">
                      {Number(boat.captain_rating).toFixed(1)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Amenities */}
        {amenities.length > 0 && (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Amenities
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {amenities.map((a: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-ocean-300 text-sm">
                  <span className="text-green-400">&#10003;</span>
                  {a}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Features */}
        {features.length > 0 && (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Features</h3>
            <div className="grid grid-cols-2 gap-2">
              {features.map((f: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-ocean-300 text-sm">
                  <span className="text-cyan-400">&#10003;</span>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {boat.description && (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold text-white mb-4">
              Description
            </h3>
            <p className="text-ocean-300 text-sm leading-relaxed whitespace-pre-line">
              {boat.description}
            </p>
          </div>
        )}

        {/* Scrape metadata */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4">
            Scrape Metadata
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-ocean-500 text-xs uppercase tracking-wider mb-1">
                Status
              </p>
              <span
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium",
                  scrapeStatusColor(boat.scrape_status),
                )}
              >
                {boat.scrape_status}
              </span>
            </div>
            <div>
              <p className="text-ocean-500 text-xs uppercase tracking-wider mb-1">
                Last Scraped
              </p>
              <p className="text-ocean-300">
                {boat.last_scraped_at
                  ? new Date(boat.last_scraped_at).toLocaleString()
                  : "Never"}
              </p>
            </div>
            <div>
              <p className="text-ocean-500 text-xs uppercase tracking-wider mb-1">
                Version
              </p>
              <p className="text-ocean-300">{boat.scrape_version ?? 0}</p>
            </div>
            <div>
              <p className="text-ocean-500 text-xs uppercase tracking-wider mb-1">
                Provider
              </p>
              <p className="text-ocean-300 capitalize">
                {boat.source_provider ?? "—"}
              </p>
            </div>
          </div>

          {boat.scrape_error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">
                <span className="font-medium">Error:</span> {boat.scrape_error}
              </p>
            </div>
          )}

          {boat.source_url && (
            <a
              href={boat.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              View on {boat.source_provider ?? "source"}
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="px-3 py-1.5 rounded-full bg-ocean-800 text-ocean-300 text-xs font-medium capitalize">
      {label}
    </span>
  );
}
