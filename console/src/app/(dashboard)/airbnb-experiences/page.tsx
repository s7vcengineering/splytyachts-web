import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, cn, formatCity } from "@/lib/utils";
import Link from "next/link";
import { AirbnbFilter } from "./airbnb-filter";

export const dynamic = "force-dynamic";

const PER_PAGE = 24;

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

async function getData(params: Record<string, string | undefined>) {
  const supabase = createServiceClient();

  let query = supabase
    .from("airbnb_experiences")
    .select(
      "id, title, city, price_amount, price_type, rating, review_count, category, photo_urls, source_url, duration_minutes",
      { count: "exact" },
    );

  if (params.q) query = query.ilike("title", `%${params.q}%`);
  if (params.city) query = query.eq("city", params.city);
  if (params.category) query = query.eq("category", params.category);

  const sort = params.sort || "rating";
  switch (sort) {
    case "price_asc":
      query = query.order("price_amount", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      query = query.order("price_amount", { ascending: false, nullsFirst: false });
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
  return { experiences: data || [], total: count || 0, page };
}

async function getFilterOptions() {
  const supabase = createServiceClient();

  const [{ data: cityData }, { data: catData }] = await Promise.all([
    supabase.from("airbnb_experiences").select("city").not("city", "is", null),
    supabase
      .from("airbnb_experiences")
      .select("category")
      .not("category", "is", null),
  ]);

  const cities = [
    ...new Set(
      (cityData || []).map((d) => (d as Record<string, unknown>).city as string),
    ),
  ]
    .filter(Boolean)
    .sort();

  const categories = [
    ...new Set(
      (catData || []).map(
        (d) => (d as Record<string, unknown>).category as string,
      ),
    ),
  ]
    .filter(Boolean)
    .sort();

  return { cities, categories };
}

export default async function AirbnbExperiencesPage({ searchParams }: Props) {
  const params = await searchParams;
  const [{ experiences, total, page }, { cities, categories }] =
    await Promise.all([getData(params), getFilterOptions()]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Airbnb Experiences</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-pink-500/20 text-pink-400">
            {total} experiences
          </span>
        </div>
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
          airbnb.com
        </span>
      </div>

      <AirbnbFilter cities={cities} categories={categories} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
        {experiences.map((exp: Record<string, unknown>) => {
          const photos = (exp.photo_urls as string[]) || [];
          const title = (exp.title as string) || "Untitled";

          return (
            <div
              key={exp.id as string}
              className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden hover:border-ocean-500 transition-colors group"
            >
              <div className="aspect-[4/3] bg-ocean-800 overflow-hidden">
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
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="p-4">
                <h3 className="text-white font-semibold text-sm truncate">
                  {title}
                </h3>
                <p className="text-ocean-400 text-xs mt-0.5 truncate">
                  {exp.city
                    ? formatCity(exp.city as string)
                    : "Unknown location"}
                  {exp.category ? (
                    <span className="text-ocean-500">
                      {" "}
                      &middot; {exp.category as string}
                    </span>
                  ) : null}
                </p>

                <div className="flex items-center justify-between mt-3">
                  {exp.price_amount ? (
                    <span className="text-white font-bold text-sm">
                      {formatCurrency(exp.price_amount as number)}/
                      {(exp.price_type as string) || "person"}
                    </span>
                  ) : (
                    <span className="text-ocean-500 text-xs">No price</span>
                  )}

                  {exp.rating && (exp.rating as number) > 0 ? (
                    <div className="flex items-center gap-1">
                      <svg
                        className="w-3.5 h-3.5 text-yellow-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-ocean-300 text-xs">
                        {Number(exp.rating).toFixed(1)}
                      </span>
                      {exp.review_count && (exp.review_count as number) > 0 ? (
                        <span className="text-ocean-500 text-xs">
                          ({exp.review_count as number})
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {exp.duration_minutes ? (
                  <p className="text-ocean-500 text-[10px] mt-2">
                    {exp.duration_minutes as number} min
                  </p>
                ) : null}

                {exp.source_url ? (
                  <div className="mt-2 pt-2 border-t border-ocean-800 flex justify-end">
                    <a
                      href={exp.source_url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-pink-400 hover:text-pink-300 transition-colors"
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

      {experiences.length === 0 && (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-12 text-center text-ocean-400 mt-6">
          No experiences match your filters
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <PaginationLink
              page={page - 1}
              params={params}
              label="Previous"
            />
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
            <PaginationLink
              page={page + 1}
              params={params}
              label="Next"
            />
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
      href={`/airbnb-experiences?${sp.toString()}`}
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
