import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, cn } from "@/lib/utils";
import Link from "next/link";
import { StaysFilter } from "./stays-filter";

export const dynamic = "force-dynamic";

const PER_PAGE = 24;

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

async function getData(params: Record<string, string | undefined>) {
  const supabase = createServiceClient();

  let query = supabase
    .from("airbnb_stays")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  if (params.q) query = query.ilike("title", `%${params.q}%`);
  if (params.city) query = query.eq("city", params.city);
  if (params.min_beds)
    query = query.gte("bedrooms", parseInt(params.min_beds));
  if (params.min_guests)
    query = query.gte("max_guests", parseInt(params.min_guests));

  const sort = params.sort || "rating";
  switch (sort) {
    case "price_asc":
      query = query.order("nightly_rate", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      query = query.order("nightly_rate", { ascending: false, nullsFirst: false });
      break;
    case "guests":
      query = query.order("max_guests", { ascending: false, nullsFirst: false });
      break;
    case "bedrooms":
      query = query.order("bedrooms", { ascending: false, nullsFirst: false });
      break;
    case "reviews":
      query = query.order("review_count", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("rating", { ascending: false, nullsFirst: false });
  }

  const page = parseInt(params.page || "1");
  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;
  query = query.range(from, to);

  const { data, count } = await query;
  return { stays: data || [], total: count || 0, page };
}

async function getCities() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("airbnb_stays")
    .select("city")
    .eq("is_active", true)
    .not("city", "is", null);

  const unique = [
    ...new Set(
      (data || []).map((d) => (d as Record<string, unknown>).city as string),
    ),
  ]
    .filter(Boolean)
    .sort();
  return unique;
}

export default async function AirbnbStaysPage({ searchParams }: Props) {
  const params = await searchParams;
  const [{ stays, total, page }, cities] = await Promise.all([
    getData(params),
    getCities(),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Airbnb Stays</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/20 text-rose-400">
            {total} listings
          </span>
        </div>
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
          airbnb.com
        </span>
      </div>

      <StaysFilter cities={cities} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
        {stays.map((stay: Record<string, unknown>) => {
          const photos = (stay.photo_urls as string[]) || [];
          const title = (stay.title as string) || "Untitled";
          const badges = (stay.badges as string[]) || [];

          return (
            <div
              key={stay.id as string}
              className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden hover:border-ocean-500 transition-colors group"
            >
              <div className="aspect-[4/3] bg-ocean-800 overflow-hidden relative">
                {photos[0] ? (
                  <img
                    src={photos[0]}
                    alt={title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ocean-600">
                    <svg
                      className="w-10 h-10"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 3L4 9v12h16V9l-8-6zm6 16h-3v-6H9v6H6v-9l6-4.5 6 4.5v9z" />
                    </svg>
                  </div>
                )}
                {stay.is_superhost && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white text-black">
                    Superhost
                  </span>
                )}
                {badges.length > 0 && !stay.is_superhost && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white text-black">
                    {badges[0]}
                  </span>
                )}
              </div>

              <div className="p-4">
                <h3 className="text-white font-semibold text-sm truncate">
                  {title}
                </h3>
                <p className="text-ocean-400 text-xs mt-0.5 truncate">
                  {(stay.city as string) || "Unknown"}
                  {stay.neighborhood ? (
                    <span className="text-ocean-500">
                      {" "}
                      &middot; {stay.neighborhood as string}
                    </span>
                  ) : null}
                </p>

                {/* Room details */}
                <div className="flex items-center gap-2 mt-2 text-[10px] text-ocean-500">
                  {stay.bedrooms != null && (
                    <span>{stay.bedrooms as number} bed</span>
                  )}
                  {stay.bathrooms != null && (
                    <>
                      <span>&middot;</span>
                      <span>{stay.bathrooms as number} bath</span>
                    </>
                  )}
                  {stay.max_guests != null && (
                    <>
                      <span>&middot;</span>
                      <span>{stay.max_guests as number} guests</span>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3">
                  {stay.nightly_rate ? (
                    <span className="text-white font-bold text-sm">
                      {formatCurrency(stay.nightly_rate as number)}/night
                    </span>
                  ) : (
                    <span className="text-ocean-500 text-xs">No price</span>
                  )}

                  {stay.rating && (stay.rating as number) > 0 ? (
                    <div className="flex items-center gap-1">
                      <svg
                        className="w-3.5 h-3.5 text-yellow-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-ocean-300 text-xs">
                        {Number(stay.rating).toFixed(1)}
                      </span>
                      {stay.review_count && (stay.review_count as number) > 0 ? (
                        <span className="text-ocean-500 text-xs">
                          ({stay.review_count as number})
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {stay.source_url ? (
                  <div className="mt-2 pt-2 border-t border-ocean-800 flex justify-end">
                    <a
                      href={stay.source_url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors"
                    >
                      View on Airbnb &rarr;
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {stays.length === 0 && (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-12 text-center text-ocean-400 mt-6">
          {total === 0
            ? "No Airbnb stays scraped yet. Run: python3 scripts/scrape-airbnb-stays.py --all-cities"
            : "No stays match your filters"}
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
      href={`/airbnb-stays?${sp.toString()}`}
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
