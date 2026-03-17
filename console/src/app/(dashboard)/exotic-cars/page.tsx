import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, cn } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getData() {
  const supabase = createServiceClient();

  const [{ data: cars, count }, { data: makes }] = await Promise.all([
    supabase
      .from("exotic_cars")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("daily_rate", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("exotic_cars")
      .select("make")
      .eq("is_active", true)
      .not("make", "is", null),
  ]);

  // Count by make
  const makeCounts: Record<string, number> = {};
  for (const row of makes || []) {
    const make = (row as Record<string, unknown>).make as string;
    makeCounts[make] = (makeCounts[make] || 0) + 1;
  }

  return { cars: cars || [], total: count || 0, makeCounts };
}

export default async function ExoticCarsPage() {
  const { cars, total, makeCounts } = await getData();

  const sortedMakes = Object.entries(makeCounts)
    .sort((a, b) => b[1] - a[1]);

  const totalWithPricing = cars.filter(
    (c: Record<string, unknown>) => c.daily_rate,
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Exotic Cars</h2>
          <p className="text-ocean-400 text-sm mt-1">
            {total} vehicles from MVP Miami &middot; {totalWithPricing} with
            pricing
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400">
          mvpmiami.com
        </span>
      </div>

      {/* Make breakdown */}
      <div className="flex flex-wrap gap-2 mb-6">
        {sortedMakes.map(([make, count]) => (
          <span
            key={make}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-ocean-800 text-ocean-300"
          >
            {make} ({count})
          </span>
        ))}
      </div>

      {cars.length === 0 ? (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-12 text-center">
          <p className="text-ocean-400 font-medium">No exotic cars scraped yet</p>
          <p className="text-ocean-500 text-sm mt-1">
            Run: python3 scripts/scrape-mvpmiami.py --type cars
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cars.map((car: Record<string, unknown>) => {
            const photos = (car.photo_urls as string[]) || [];
            const title =
              (car.title as string) ||
              `${car.year} ${car.make} ${car.model}`;

            return (
              <div
                key={car.id as string}
                className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden hover:border-ocean-600 transition-colors"
              >
                {/* Image */}
                {photos.length > 0 ? (
                  <div className="aspect-[16/10] bg-ocean-950 overflow-hidden">
                    <img
                      src={photos[0]}
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/10] bg-ocean-950 flex items-center justify-center">
                    <span className="text-3xl">🏎️</span>
                  </div>
                )}

                <div className="p-4">
                  <h3 className="text-white font-semibold text-sm truncate">
                    {title}
                  </h3>

                  <div className="flex items-center gap-2 mt-1.5">
                    {car.make ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/20 text-purple-400">
                        {car.make as string}
                      </span>
                    ) : null}
                    {car.body_style ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-ocean-800 text-ocean-400">
                        {car.body_style as string}
                      </span>
                    ) : null}
                    {car.year ? (
                      <span className="text-[10px] text-ocean-500">
                        {car.year as number}
                      </span>
                    ) : null}
                  </div>

                  {/* Specs row */}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-ocean-500">
                    {car.horsepower ? (
                      <span>{car.horsepower as number} HP</span>
                    ) : null}
                    {car.zero_to_sixty ? (
                      <span>0-60: {car.zero_to_sixty as number}s</span>
                    ) : null}
                    {car.top_speed ? (
                      <span>{car.top_speed as number} mph</span>
                    ) : null}
                    {car.engine ? <span>{car.engine as string}</span> : null}
                  </div>

                  {/* Colors */}
                  {car.exterior_color || car.interior_color ? (
                    <p className="text-[10px] text-ocean-600 mt-1 truncate">
                      {car.exterior_color
                        ? `Ext: ${car.exterior_color as string}`
                        : ""}
                      {car.exterior_color && car.interior_color ? " · " : ""}
                      {car.interior_color
                        ? `Int: ${car.interior_color as string}`
                        : ""}
                    </p>
                  ) : null}

                  {/* Price + photos */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-ocean-800">
                    {car.daily_rate ? (
                      <span className="text-green-400 font-bold text-sm">
                        {formatCurrency(car.daily_rate as number)}/day
                      </span>
                    ) : (
                      <span className="text-ocean-500 text-xs">
                        Call for price
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-ocean-500">
                        {photos.length} photos
                      </span>
                      {car.source_url ? (
                        <a
                          href={car.source_url as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-cyan-400 hover:text-cyan-300"
                        >
                          View &rarr;
                        </a>
                      ) : null}
                    </div>
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
