import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, cn, formatCity } from "@/lib/utils";
import Link from "next/link";
import { MansionsFilter } from "./mansions-filter";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

async function getData(params: Record<string, string | undefined>) {
  const supabase = createServiceClient();

  let query = supabase
    .from("mansions")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  if (params.q)
    query = query.or(`name.ilike.%${params.q}%,location.ilike.%${params.q}%`);
  if (params.city) query = query.eq("city", params.city);
  if (params.min_beds)
    query = query.gte("bedrooms", parseInt(params.min_beds));
  if (params.min_guests)
    query = query.gte("capacity", parseInt(params.min_guests));

  const sort = params.sort || "capacity";
  switch (sort) {
    case "price_asc":
      query = query.order("nightly_rate", {
        ascending: true,
        nullsFirst: false,
      });
      break;
    case "price_desc":
      query = query.order("nightly_rate", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    case "bedrooms":
      query = query.order("bedrooms", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    default:
      query = query.order("capacity", {
        ascending: false,
        nullsFirst: false,
      });
  }

  const page = parseInt(params.page || "1");
  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;
  query = query.range(from, to);

  const { data, count } = await query;
  return { mansions: data || [], total: count || 0, page };
}

async function getCities() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("mansions")
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

export default async function MansionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [{ mansions, total, page }, cities] = await Promise.all([
    getData(params),
    getCities(),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Mansions</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
            {total} properties
          </span>
        </div>
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
          mvpmiami.com
        </span>
      </div>

      <MansionsFilter cities={cities} />

      {mansions.length === 0 ? (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-12 text-center mt-6">
          <p className="text-ocean-400 font-medium">
            No mansions match your filters
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {mansions.map((mansion: Record<string, unknown>) => {
            const rawPhotos = (mansion.photo_urls as string[]) || [];
            const photos = rawPhotos.filter(
              (url) =>
                !url.includes("MVP_MIAMI") &&
                !url.includes("mvp-logo") &&
                !url.includes("favicon"),
            );
            const amenities = (mansion.amenities as string[]) || [];

            return (
              <div
                key={mansion.id as string}
                className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden hover:border-ocean-500 transition-colors group"
              >
                {photos.length > 0 ? (
                  <div className="aspect-[16/9] bg-ocean-950 overflow-hidden">
                    <img
                      src={photos[0]}
                      alt={mansion.name as string}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/9] bg-ocean-950 flex items-center justify-center">
                    <svg
                      className="w-12 h-12 text-ocean-600"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 3L4 9v12h16V9l-8-6zm6 16h-3v-6H9v6H6v-9l6-4.5 6 4.5v9z" />
                    </svg>
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
      href={`/mansions?${sp.toString()}`}
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
