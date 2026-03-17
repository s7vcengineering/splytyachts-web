import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, scrapeStatusColor, cn, formatCity } from "@/lib/utils";
import Link from "next/link";
import { BoatsFilter } from "./boats-filter";

export const dynamic = "force-dynamic";

const PER_PAGE = 24;

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

async function getBoats(params: Record<string, string | undefined>) {
  const supabase = createServiceClient();

  let query = supabase
    .from("boats")
    .select(
      "id, name, type, city, hourly_rate, capacity, rating, review_count, photo_urls, scrape_status, last_scraped_at, length_ft, is_active",
      { count: "exact" },
    )
    .eq("is_active", true)
    .not("hourly_rate", "is", null);

  if (params.q) query = query.ilike("name", `%${params.q}%`);
  if (params.city) query = query.eq("city", params.city);
  if (params.type) query = query.eq("type", params.type);
  if (params.min_capacity) query = query.gte("capacity", parseInt(params.min_capacity));
  if (params.max_capacity) query = query.lte("capacity", parseInt(params.max_capacity));
  if (params.min_price) query = query.gte("hourly_rate", parseFloat(params.min_price));
  if (params.max_price) query = query.lte("hourly_rate", parseFloat(params.max_price));

  const sort = params.sort || "rating";
  switch (sort) {
    case "price_asc":
      query = query.order("hourly_rate", { ascending: true });
      break;
    case "price_desc":
      query = query.order("hourly_rate", { ascending: false });
      break;
    case "capacity":
      query = query.order("capacity", { ascending: false });
      break;
    case "last_scraped":
      query = query.order("last_scraped_at", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("rating", { ascending: false, nullsFirst: false });
  }

  const page = parseInt(params.page || "1");
  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;
  query = query.range(from, to);

  const { data, count } = await query;
  return { boats: data ?? [], total: count ?? 0, page };
}

async function getCities() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("boats")
    .select("city")
    .eq("is_active", true)
    .not("hourly_rate", "is", null)
    .not("city", "is", null);

  const unique = [...new Set((data ?? []).map((d) => d.city as string))].sort();
  return unique;
}

export default async function BoatsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [{ boats, total, page }, cities] = await Promise.all([
    getBoats(params),
    getCities(),
  ]);
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Boat Catalog</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
            {total} boats
          </span>
        </div>
      </div>

      <BoatsFilter cities={cities} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
        {boats.map((boat: Record<string, unknown>) => (
          <BoatCard key={boat.id as string} boat={boat} />
        ))}
      </div>

      {boats.length === 0 && (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-12 text-center text-ocean-400 mt-6">
          No boats match your filters
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

function BoatCard({ boat }: { boat: Record<string, unknown> }) {
  const photos = (boat.photo_urls as string[]) || [];
  const thumb = photos[0];

  return (
    <Link
      href={`/boats/${boat.id}`}
      className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden hover:border-ocean-500 transition-colors group"
    >
      <div className="aspect-[4/3] bg-ocean-800 overflow-hidden">
        {thumb ? (
          <img
            src={thumb}
            alt={boat.name as string}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ocean-600">
            <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2z" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-white font-semibold text-sm truncate">
          {boat.name as string}
        </h3>
        <p className="text-ocean-400 text-xs mt-0.5">
          {boat.city ? formatCity(boat.city as string) : "Unknown"}
          {boat.type ? (
            <span className="text-ocean-500"> &middot; {boat.type as string}</span>
          ) : null}
        </p>
        <div className="flex items-center justify-between mt-3">
          <span className="text-white font-bold text-sm">
            {boat.hourly_rate
              ? `${formatCurrency(boat.hourly_rate as number)}/hr`
              : "N/A"}
          </span>
          <span className="text-ocean-400 text-xs">
            {boat.capacity ? `${boat.capacity} guests` : ""}
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            {(boat.rating as number) > 0 && (
              <>
                <svg
                  className="w-3.5 h-3.5 text-yellow-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-ocean-300 text-xs">
                  {Number(boat.rating).toFixed(1)}
                </span>
                {(boat.review_count as number) > 0 && (
                  <span className="text-ocean-500 text-xs">
                    ({boat.review_count as number})
                  </span>
                )}
              </>
            )}
          </div>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium",
              scrapeStatusColor(boat.scrape_status as string),
            )}
          >
            {boat.scrape_status as string}
          </span>
        </div>
      </div>
    </Link>
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
      href={`/boats?${sp.toString()}`}
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
