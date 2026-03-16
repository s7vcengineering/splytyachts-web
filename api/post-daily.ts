export const config = { runtime: "edge" };

/**
 * POST|GET /api/post-daily
 *
 * Picks the best boat listing to post, generates an Instagram card via
 * /api/card/experience, and publishes it through the s7vc-social-marketing
 * service.
 *
 * Protected by CRON_SECRET — pass as:
 *   - Header: Authorization: Bearer <CRON_SECRET> (Vercel cron default)
 *   - Or query param: ?secret=<CRON_SECRET>
 *
 * The route selects a listing that hasn't been posted recently by checking
 * the `social_posts_log` table in Supabase.
 */

interface BoatListing {
  id: string;
  boatsetter_listing_id?: string;
  name: string;
  type?: string;
  city?: string;
  hourly_rate?: number;
  capacity?: number;
  rating?: number;
  length_ft?: number;
  captain_name?: string;
  features?: string[];
  amenities?: string[];
  make?: string;
  model?: string;
  description?: string;
  is_active?: boolean;
}

function supabaseFetch(
  supabaseUrl: string,
  supabaseKey: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function handler(req: Request): Promise<Response> {
  // ── Auth guard ──
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const querySecret = url.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") || querySecret || "";

  if (providedSecret !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Env validation ──
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const socialMarketingUrl = process.env.SOCIAL_MARKETING_URL;
  const socialMarketingApiKey = process.env.SOCIAL_MARKETING_API_KEY;
  const appUrl = process.env.APP_URL || process.env.VERCEL_URL;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      { error: "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set" },
      { status: 500 }
    );
  }

  if (!socialMarketingUrl || !socialMarketingApiKey) {
    return Response.json(
      { error: "SOCIAL_MARKETING_URL and SOCIAL_MARKETING_API_KEY must be set" },
      { status: 500 }
    );
  }

  if (!appUrl) {
    return Response.json(
      { error: "APP_URL or VERCEL_URL must be set" },
      { status: 500 }
    );
  }

  const baseUrl = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;

  try {
    // ── 1. Get IDs of boats already posted to Instagram ──
    const postedResp = await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      "social_posts_log?select=boat_id&platform=eq.instagram&status=eq.published"
    );
    const postedRows: { boat_id: string }[] = await postedResp.json();
    const postedIds = Array.isArray(postedRows)
      ? postedRows.map((r) => r.boat_id).filter(Boolean)
      : [];

    // ── 2. Find the best unposted boat listing ──
    // Prefer active boats with: good rating, not already posted.
    // Order by rating desc, then by most recently added/updated.
    let boatQuery =
      "boats?select=*&is_active=eq.true&order=rating.desc.nullslast,created_at.desc&limit=1";

    if (postedIds.length > 0) {
      // Exclude already-posted boats
      boatQuery += `&id=not.in.(${postedIds.join(",")})`;
    }

    const boatsResp = await supabaseFetch(supabaseUrl, supabaseKey, boatQuery);
    const boats: BoatListing[] = await boatsResp.json();

    if (!Array.isArray(boats) || boats.length === 0) {
      return Response.json(
        { message: "No unposted boat listings available" },
        { status: 200 }
      );
    }

    const boat = boats[0];

    // ── 3. Extract display values ──
    const displayTitle = boat.name || "Yacht Experience";
    const displayCity = boat.city || "Miami";
    const pricePerHour = boat.hourly_rate
      ? Math.round(Number(boat.hourly_rate))
      : 0;
    const displayBoatName =
      boat.make && boat.model
        ? `${boat.make} ${boat.model}`
        : boat.name || "Premium Yacht";
    const displayCapacity = boat.capacity || 12;
    const displayRating = boat.rating ? Number(boat.rating) : 4.9;
    const displayBoatType = boat.type || "Yacht";
    const displayLength = boat.length_ft || 42;
    // ── 4. Build the card image URL ──
    const cardUrl = `${baseUrl}/api/card/experience?id=${boat.id}&format=feed`;

    // ── 5. Build the Instagram caption ──
    const splitPrice =
      pricePerHour > 0
        ? `$${Math.round((pricePerHour * 4) / 8)}/person when you split with 8`
        : "";
    const priceStr = pricePerHour > 0 ? `From $${pricePerHour}/hr` : "";

    const captionParts = [
      displayTitle,
      "",
      `${displayBoatType} | ${displayLength}ft | ${displayCity}`,
      `${displayBoatName} | Up to ${displayCapacity} guests`,
      displayRating ? `Rating: ${"*".repeat(Math.floor(displayRating))} ${displayRating}` : "",
      "",
      priceStr,
      splitPrice ? `${splitPrice}` : "",
      "",
      "Life's too short to yacht alone.",
      "Split the cost with your crew on SPLYT.",
      "",
      "Download SPLYT - link in bio",
      "",
      "#SPLYT #YachtLife #BoatRental #YachtCharter #SplitTheCost #LuxuryForLess #MiamiYachts #BoatDay #WaterExperience #YachtParty",
    ];

    const caption = captionParts.filter((line) => line !== undefined).join("\n");

    // ── 6. Publish via s7vc-social-marketing ──
    const publishUrl = `${socialMarketingUrl}/functions/v1/publish`;

    const publishRes = await fetch(publishUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${socialMarketingApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform: "instagram",
        image_url: cardUrl,
        caption,
        post_type: "image",
        metadata: {
          boat_id: boat.id,
          boatsetter_listing_id: boat.boatsetter_listing_id || null,
          boat_name: boat.name,
          city: displayCity,
          hourly_rate: pricePerHour,
          source: "post-daily-cron",
        },
      }),
    });

    const publishData = await publishRes.json().catch(() => null);

    if (!publishRes.ok) {
      // Log the failed attempt
      await supabaseFetch(supabaseUrl, supabaseKey, "social_posts_log", {
        method: "POST",
        body: JSON.stringify({
          boat_id: boat.id,
          platform: "instagram",
          status: "failed",
          error_message:
            publishData?.error || `Publish returned ${publishRes.status}`,
          card_url: cardUrl,
          caption,
          created_at: new Date().toISOString(),
        }),
      });

      return Response.json(
        {
          error: "Failed to publish to Instagram",
          details: publishData?.error || publishRes.statusText,
          boat_id: boat.id,
        },
        { status: 502 }
      );
    }

    // ── 7. Record the successful post ──
    await supabaseFetch(supabaseUrl, supabaseKey, "social_posts_log", {
      method: "POST",
      body: JSON.stringify({
        boat_id: boat.id,
        platform: "instagram",
        status: "published",
        external_post_id: publishData?.post_id || publishData?.id || null,
        card_url: cardUrl,
        caption,
        response_data: publishData,
        created_at: new Date().toISOString(),
      }),
    });

    return Response.json({
      success: true,
      boat_id: boat.id,
      boat_name: boat.name,
      city: displayCity,
      card_url: cardUrl,
      publish_response: publishData,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Vercel edge functions export default — handles both GET (Vercel cron) and POST
export default handler;
