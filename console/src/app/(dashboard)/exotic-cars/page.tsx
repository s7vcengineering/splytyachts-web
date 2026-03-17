import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, cn } from "@/lib/utils";
import Link from "next/link";
import { CarsFilter } from "./cars-filter";

export const dynamic = "force-dynamic";

const PER_PAGE = 24;

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

async function getData(params: Record<string, string | undefined>) {
  const supabase = createServiceClient();

  let query = supabase
    .from("exotic_cars")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  if (params.q) query = query.ilike("title", `%${params.q}%`);
  if (params.make) query = query.eq("make", params.make);

  const sort = params.sort || "price_desc";
  switch (sort) {
    case "price_asc":
      query = query.order("daily_rate", { ascending: true, nullsFirst: false });
      break;
    case "year":
      query = query.order("year", { ascending: false, nullsFirst: false });
      break;
    case "hp":
      query = query.order("horsepower", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("daily_rate", { ascending: false, nullsFirst: false });
  }

  const page = parseInt(params.page || "1");
  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;
  query = query.range(from, to);

  const { data, count } = await query;
  return { cars: data || [], total: count || 0, page };
}

async function getMakes() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("exotic_cars")
    .select("make")
    .eq("is_active", true)
    .not("make", "is", null);

  const unique = [...new Set((data || []).map((d) => (d as Record<string, unknown>).make as string))]
    .filter(Boolean)
    .sort();
  return unique;
}

export default async function ExoticCarsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [{ cars, total, page }, makes] = await Promise.all([
    getData(params),
    getMakes(),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Exotic Cars</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
            {total} vehicles
          </span>
        </div>
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
          mvpmiami.com
        </span>
      </div>

      <CarsFilter makes={makes} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
        {cars.map((car: Record<string, unknown>) => {
          const photos = (car.photo_urls as string[]) || [];
          const title =
            (car.title as string) ||
            `${car.year} ${car.make} ${car.model}`;

          return (
            <div
              key={car.id as string}
              className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden hover:border-ocean-500 transition-colors group"
            >
              {photos.length > 0 ? (
                <div className="aspect-[16/10] bg-ocean-950 overflow-hidden">
                  <img
                    src={photos[0]}
                    alt={title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              ) : (
                <div className="aspect-[16/10] bg-ocean-950 flex items-center justify-center">
                  <svg className="w-12 h-12 text-ocean-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                  </svg>
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

      {cars.length === 0 && (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-12 text-center text-ocean-400 mt-6">
          No cars match your filters
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <PaginationLink page={page - 1} params={params} label="Previous" />
          )}
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p: number;
            if (totalPages <= 7) {
              p = i + 1;
            } else if (page <= 4) {
              p = i + 1;
            } else if (page >= totalPages - 3) {
              p = totalPages - 6 + i;
            } else {
              p = page - 3 + i;
            }
            return (
              <PaginationLink
                key={p}
                page={p}
                params={params}
                label={String(p)}
                active={p === page}
              />
            );
          })}
          {page < totalPages && (
            <PaginationLink page={page + 1} params={params} label="Next" />
          )}
        </div>
      )}
    </div>
  );
}

function PaginationLink({
  page,
  params,
  label,
  active,
}: {
  page: number;
  params: Record<string, string | undefined>;
  label: string;
  active?: boolean;
}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") sp.set(k, v);
  }
  sp.set("page", String(page));

  return (
    <Link
      href={`/exotic-cars?${sp.toString()}`}
      className={cn(
        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
        active
          ? "bg-ocean-600 text-white"
          : "bg-ocean-800 text-ocean-300 hover:bg-ocean-700 hover:text-white",
      )}
    >
      {label}
    </Link>
  );
}
