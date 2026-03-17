import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, cn, formatCity } from "@/lib/utils";
import Link from "next/link";
import { CatalogFilter } from "./catalog-filter";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;

type SourceType = "airbnb_experiences" | "boats" | "exotic_cars" | "mansions";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

/** Fetch aggregate counts across all 4 tables. */
async function getCounts() {
  const supabase = createServiceClient();

  const [airbnb, boats, cars, mansions] = await Promise.all([
    supabase.from("airbnb_experiences").select("id", { count: "exact", head: true }),
    supabase.from("boats").select("id", { count: "exact", head: true }),
    supabase.from("exotic_cars").select("id", { count: "exact", head: true }),
    supabase.from("mansions").select("id", { count: "exact", head: true }),
  ]);

  return {
    airbnb_experiences: airbnb.count ?? 0,
    boats: boats.count ?? 0,
    exotic_cars: cars.count ?? 0,
    mansions: mansions.count ?? 0,
  };
}

/** Fetch distinct cities for the current source. */
async function getCities(source: SourceType) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from(source)
    .select("city")
    .not("city", "is", null);

  const unique = [...new Set((data ?? []).map((d) => (d as Record<string, unknown>).city as string))].filter(Boolean).sort();
  return unique;
}

/** Fetch paginated listings from the selected source. */
async function getListings(
  source: SourceType,
  params: Record<string, string | undefined>,
) {
  const supabase = createServiceClient();
  const page = parseInt(params.page || "1");
  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  let query;

  switch (source) {
    case "airbnb_experiences":
      query = supabase
        .from("airbnb_experiences")
        .select(
          "id, title, city, price_amount, price_type, rating, review_count, category, photo_urls, source_url",
          { count: "exact" },
        );
      if (params.q) query = query.ilike("title", `%${params.q}%`);
      if (params.city) query = query.eq("city", params.city);
      query = query.order("rating", { ascending: false, nullsFirst: false });
      break;

    case "boats":
      query = supabase
        .from("boats")
        .select(
          "id, name, city, hourly_rate, rating, review_count, type, photo_urls, capacity",
          { count: "exact" },
        );
      if (params.q) query = query.ilike("name", `%${params.q}%`);
      if (params.city) query = query.eq("city", params.city);
      query = query.order("rating", { ascending: false, nullsFirst: false });
      break;

    case "exotic_cars":
      query = supabase
        .from("exotic_cars")
        .select(
          "id, title, city, daily_rate, make, model, year, photo_urls, source_url",
          { count: "exact" },
        );
      if (params.q) query = query.ilike("title", `%${params.q}%`);
      if (params.city) query = query.eq("city", params.city);
      query = query.order("daily_rate", { ascending: false, nullsFirst: false });
      break;

    case "mansions":
      query = supabase
        .from("mansions")
        .select(
          "id, name, city, nightly_rate, bedrooms, bathrooms, capacity, photo_urls, source_url, location",
          { count: "exact" },
        );
      if (params.q) query = query.ilike("name", `%${params.q}%`);
      if (params.city) query = query.eq("city", params.city);
      query = query.order("nightly_rate", { ascending: false, nullsFirst: false });
      break;
  }

  query = query.range(from, to);

  const { data, count } = await query;
  return { listings: data ?? [], total: count ?? 0, page };
}

/** Normalize a listing row into a common display shape. */
function normalizeListing(
  row: Record<string, unknown>,
  source: SourceType,
): {
  id: string;
  title: string;
  city: string;
  price: string;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  thumb: string | null;
  sourceUrl: string | null;
} {
  const photos = (row.photo_urls as string[]) || [];
  const thumb = photos[0] || null;

  switch (source) {
    case "airbnb_experiences":
      return {
        id: row.id as string,
        title: (row.title as string) || "Untitled",
        city: (row.city as string) || "",
        price: row.price_amount
          ? `${formatCurrency(row.price_amount as number)}/${(row.price_type as string) || "person"}`
          : "N/A",
        rating: (row.rating as number) || null,
        reviewCount: (row.review_count as number) || null,
        category: (row.category as string) || null,
        thumb,
        sourceUrl: (row.source_url as string) || null,
      };

    case "boats":
      return {
        id: row.id as string,
        title: (row.name as string) || "Untitled",
        city: (row.city as string) || "",
        price: row.hourly_rate
          ? `${formatCurrency(row.hourly_rate as number)}/hr`
          : "N/A",
        rating: (row.rating as number) || null,
        reviewCount: (row.review_count as number) || null,
        category: (row.type as string) || null,
        thumb,
        sourceUrl: null,
      };

    case "exotic_cars":
      return {
        id: row.id as string,
        title:
          (row.title as string) ||
          `${row.year || ""} ${row.make || ""} ${row.model || ""}`.trim() ||
          "Untitled",
        city: (row.city as string) || "",
        price: row.daily_rate
          ? `${formatCurrency(row.daily_rate as number)}/day`
          : "Call for price",
        rating: null,
        reviewCount: null,
        category: (row.make as string) || null,
        thumb,
        sourceUrl: (row.source_url as string) || null,
      };

    case "mansions":
      return {
        id: row.id as string,
        title: (row.name as string) || "Untitled",
        city: (row.city as string) || (row.location as string) || "",
        price: row.nightly_rate
          ? `${formatCurrency(row.nightly_rate as number)}/night`
          : "N/A",
        rating: null,
        reviewCount: null,
        category: row.bedrooms ? `${row.bedrooms} bed` : null,
        thumb,
        sourceUrl: (row.source_url as string) || null,
      };
  }
}

const SOURCE_COLORS: Record<SourceType, string> = {
  airbnb_experiences: "bg-pink-500/20 text-pink-400",
  boats: "bg-cyan-500/20 text-cyan-400",
  exotic_cars: "bg-purple-500/20 text-purple-400",
  mansions: "bg-amber-500/20 text-amber-400",
};

const SOURCE_LABELS: Record<SourceType, string> = {
  airbnb_experiences: "Airbnb Experiences",
  boats: "Boats",
  exotic_cars: "Exotic Cars",
  mansions: "Mansions",
};

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const source = (params.source as SourceType) || "airbnb_experiences";

  const [counts, cities, { listings, total, page }] = await Promise.all([
    getCounts(),
    getCities(source),
    getListings(source, params),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const grandTotal = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Catalog Browser</h2>
          <p className="text-ocean-400 text-sm mt-1">
            {grandTotal.toLocaleString()} total listings across all sources
          </p>
        </div>
        <span
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium",
            SOURCE_COLORS[source],
          )}
        >
          {SOURCE_LABELS[source]}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {(Object.entries(counts) as [SourceType, number][]).map(
          ([key, count]) => (
            <div
              key={key}
              className={cn(
                "rounded-xl border p-4 transition-colors",
                source === key
                  ? "bg-ocean-800 border-ocean-600"
                  : "bg-ocean-900 border-ocean-700",
              )}
            >
              <p className="text-ocean-400 text-xs font-medium">
                {SOURCE_LABELS[key]}
              </p>
              <p className="text-white text-2xl font-bold mt-1">
                {count.toLocaleString()}
              </p>
            </div>
          ),
        )}
      </div>

      {/* Filters */}
      <CatalogFilter cities={cities} counts={counts} />

      {/* Results info */}
      <div className="flex items-center justify-between mt-6 mb-4">
        <p className="text-ocean-400 text-sm">
          Showing {listings.length} of {total.toLocaleString()} {SOURCE_LABELS[source].toLowerCase()}
          {params.city ? ` in ${formatCity(params.city)}` : ""}
          {params.q ? ` matching "${params.q}"` : ""}
        </p>
        {totalPages > 1 && (
          <p className="text-ocean-500 text-xs">
            Page {page} of {totalPages}
          </p>
        )}
      </div>

      {/* Listing grid */}
      {listings.length === 0 ? (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-12 text-center text-ocean-400">
          No listings match your filters
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {listings.map((row: Record<string, unknown>) => {
            const item = normalizeListing(row, source);
            return <ListingCard key={item.id} item={item} source={source} />;
          })}
        </div>
      )}

      {/* Pagination */}
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

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ListingCard({
  item,
  source,
}: {
  item: ReturnType<typeof normalizeListing>;
  source: SourceType;
}) {
  // Link to per-source detail page if it exists, otherwise just render
  const detailHref =
    source === "boats"
      ? `/boats/${item.id}`
      : null;

  const card = (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden hover:border-ocean-500 transition-colors group">
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-ocean-800 overflow-hidden">
        {item.thumb ? (
          <img
            src={item.thumb}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ocean-600">
            <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-white font-semibold text-sm truncate">
          {item.title}
        </h3>
        <p className="text-ocean-400 text-xs mt-0.5 truncate">
          {item.city ? formatCity(item.city) : "Unknown location"}
          {item.category ? (
            <span className="text-ocean-500"> &middot; {item.category}</span>
          ) : null}
        </p>

        <div className="flex items-center justify-between mt-3">
          <span className="text-white font-bold text-sm">{item.price}</span>

          {/* Rating */}
          {item.rating && item.rating > 0 ? (
            <div className="flex items-center gap-1">
              <svg
                className="w-3.5 h-3.5 text-yellow-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-ocean-300 text-xs">
                {Number(item.rating).toFixed(1)}
              </span>
              {item.reviewCount && item.reviewCount > 0 ? (
                <span className="text-ocean-500 text-xs">
                  ({item.reviewCount})
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Source link */}
        {item.sourceUrl ? (
          <div className="mt-2 pt-2 border-t border-ocean-800 flex justify-end">
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              View source &rarr;
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (detailHref) {
    return <Link href={detailHref}>{card}</Link>;
  }

  return card;
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
      href={`/catalog?${sp.toString()}`}
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
