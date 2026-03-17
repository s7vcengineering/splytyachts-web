import { createServiceClient } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getData() {
  const supabase = createServiceClient();
  const { data, count } = await supabase
    .from("mansions")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .order("capacity", { ascending: false, nullsFirst: false })
    .limit(50);

  return { mansions: data || [], total: count || 0 };
}

export default async function MansionsPage() {
  const { mansions, total } = await getData();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Mansions</h2>
          <p className="text-ocean-400 text-sm mt-1">
            {total} properties from MVP Miami
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
          mvpmiami.com
        </span>
      </div>

      {mansions.length === 0 ? (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-12 text-center">
          <p className="text-ocean-400 font-medium">
            No mansions scraped yet
          </p>
          <p className="text-ocean-500 text-sm mt-1">
            Run: python3 scripts/scrape-mvpmiami.py --type mansions
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {mansions.map((mansion: Record<string, unknown>) => {
            const rawPhotos = (mansion.photo_urls as string[]) || [];
            const photos = rawPhotos.filter(
              (url) => !url.includes("MVP_MIAMI") && !url.includes("mvp-logo") && !url.includes("favicon"),
            );
            const amenities = (mansion.amenities as string[]) || [];

            return (
              <div
                key={mansion.id as string}
                className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden hover:border-ocean-600 transition-colors"
              >
                {photos.length > 0 ? (
                  <div className="aspect-[16/9] bg-ocean-950 overflow-hidden">
                    <img
                      src={photos[0]}
                      alt={mansion.name as string}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/9] bg-ocean-950 flex items-center justify-center">
                    <span className="text-3xl">🏠</span>
                  </div>
                )}

                <div className="p-5">
                  <h3 className="text-white font-semibold text-lg">
                    {mansion.name as string}
                  </h3>

                  {mansion.location ? (
                    <p className="text-ocean-400 text-sm mt-1">
                      {mansion.location as string}
                    </p>
                  ) : null}

                  <div className="flex items-center gap-4 mt-3">
                    {mansion.bedrooms ? (
                      <div className="text-center">
                        <p className="text-white font-bold text-lg">
                          {mansion.bedrooms as number}
                        </p>
                        <p className="text-ocean-500 text-[10px] uppercase tracking-wider">
                          Beds
                        </p>
                      </div>
                    ) : null}
                    {mansion.bathrooms ? (
                      <div className="text-center">
                        <p className="text-white font-bold text-lg">
                          {mansion.bathrooms as number}
                        </p>
                        <p className="text-ocean-500 text-[10px] uppercase tracking-wider">
                          Baths
                        </p>
                      </div>
                    ) : null}
                    {mansion.capacity ? (
                      <div className="text-center">
                        <p className="text-cyan-400 font-bold text-lg">
                          {mansion.capacity as number}
                        </p>
                        <p className="text-ocean-500 text-[10px] uppercase tracking-wider">
                          Guests
                        </p>
                      </div>
                    ) : null}
                    {mansion.nightly_rate ? (
                      <div className="text-center ml-auto">
                        <p className="text-green-400 font-bold text-lg">
                          {formatCurrency(mansion.nightly_rate as number)}
                        </p>
                        <p className="text-ocean-500 text-[10px] uppercase tracking-wider">
                          /night
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {mansion.bed_config ? (
                    <p className="text-ocean-500 text-xs mt-2">
                      {mansion.bed_config as string}
                    </p>
                  ) : null}

                  {mansion.description ? (
                    <p className="text-ocean-400 text-sm mt-3 line-clamp-3">
                      {mansion.description as string}
                    </p>
                  ) : null}

                  {amenities.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {amenities.slice(0, 8).map((amenity, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-ocean-800 text-ocean-400"
                        >
                          {amenity}
                        </span>
                      ))}
                      {amenities.length > 8 ? (
                        <span className="text-[10px] text-ocean-500">
                          +{amenities.length - 8} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-ocean-800">
                    <span className="text-[10px] text-ocean-500">
                      {photos.length} photos
                    </span>
                    {mansion.source_url ? (
                      <a
                        href={mansion.source_url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-400 hover:text-cyan-300"
                      >
                        View on MVP Miami &rarr;
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
