import { createServiceClient } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { MarketingActions } from "./marketing-actions";

export const dynamic = "force-dynamic";

async function getExperiences() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("experiences")
    .select(
      "id, title, status, total_cost, max_participants, current_participants, date_time, duration_hours, location, boat_type, boat_name, host:host_id(display_name)",
    )
    .in("status", ["open", "filling", "full"])
    .order("created_at", { ascending: false })
    .limit(5);

  const experiences = data || [];

  // Fetch boat photos — get top-rated boats with photos for each unique city
  const cities = [
    ...new Set(
      experiences
        .map((e: Record<string, unknown>) => e.location as string)
        .filter(Boolean),
    ),
  ];

  const photoByCity: Record<string, string> = {};
  if (cities.length > 0) {
    const { data: boats } = await supabase
      .from("boats")
      .select("city, photo_urls")
      .in("city", cities)
      .eq("is_active", true)
      .not("photo_urls", "eq", "{}")
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(cities.length * 3);

    for (const boat of boats || []) {
      const b = boat as Record<string, unknown>;
      const city = b.city as string;
      const photos = b.photo_urls as string[];
      if (city && photos?.length > 0 && !photoByCity[city]) {
        photoByCity[city] = photos[0];
      }
    }
  }

  // Fallback: if no city match, get any boat with a good photo
  if (Object.keys(photoByCity).length === 0 && experiences.length > 0) {
    const { data: anyBoat } = await supabase
      .from("boats")
      .select("photo_urls")
      .eq("is_active", true)
      .not("photo_urls", "eq", "{}")
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(1);

    if (anyBoat?.[0]) {
      const photos = (anyBoat[0] as Record<string, unknown>).photo_urls as string[];
      if (photos?.length > 0) {
        photoByCity["_fallback"] = photos[0];
      }
    }
  }

  return { experiences, photoByCity };
}

export default async function MarketingPage() {
  const { experiences, photoByCity } = await getExperiences();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Social Media</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
            Availability Posts
          </span>
        </div>
      </div>

      <p className="text-ocean-400 text-sm mb-6">
        Download availability cards for active experiences. Each card is
        generated as a 1080x1350 Instagram feed image ready to post.
      </p>

      {experiences.length === 0 ? (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-12 text-center">
          <p className="text-ocean-400 font-medium">
            No active experiences to generate cards for
          </p>
          <p className="text-ocean-500 text-sm mt-1">
            Create experiences to see availability posts here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {experiences.map(
            (exp: Record<string, unknown>) => {
              const host = exp.host as Record<string, unknown> | null;
              const cost = (exp.total_cost as number) || 0;
              const max = (exp.max_participants as number) || 8;
              const splitPrice = max > 0 ? Math.round(cost / max) : 0;
              const title = (exp.title as string) || "Experience";
              const location = (exp.location as string) || "TBD";
              const duration = (exp.duration_hours as number) || 4;
              const boatType = (exp.boat_type as string) || "Yacht";

              const photoUrl = photoByCity[location] || photoByCity["_fallback"] || "";

              const cardUrl =
                `/api/marketing/card?` +
                `title=${encodeURIComponent(title)}` +
                `&location=${encodeURIComponent(location)}` +
                `&cost=${cost}` +
                `&max=${max}` +
                `&duration=${duration}` +
                `&type=${encodeURIComponent(boatType)}` +
                (photoUrl ? `&photo=${encodeURIComponent(photoUrl)}` : "");

              return (
                <div
                  key={exp.id as string}
                  className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden"
                >
                  {/* Card preview */}
                  <div className="relative aspect-[4/5] bg-ocean-950 flex items-center justify-center overflow-hidden">
                    <img
                      src={cardUrl}
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Experience info */}
                  <div className="p-4">
                    <h3 className="text-white font-semibold text-sm truncate">
                      {title}
                    </h3>
                    <p className="text-ocean-400 text-xs mt-1">
                      {location} &middot; {boatType} &middot; {duration}hr
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-cyan-400 font-semibold text-sm">
                        {formatCurrency(cost)}
                      </span>
                      <span className="text-ocean-600">&rarr;</span>
                      <span className="text-green-400 font-semibold text-sm">
                        {formatCurrency(splitPrice)}/person
                      </span>
                      <span className="text-ocean-500 text-xs">
                        ({max} ways)
                      </span>
                    </div>
                    {host && (
                      <p className="text-ocean-500 text-xs mt-1">
                        Host: {host.display_name as string}
                      </p>
                    )}

                    <MarketingActions
                      cardUrl={cardUrl}
                      title={title}
                      experienceId={exp.id as string}
                    />
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
