import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

type Format = "feed" | "story" | "square";

const FORMATS: Record<Format, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

/**
 * GET /api/card/experience
 *
 * Generates an Instagram-ready card image for a SPLYT yacht experience.
 *
 * Query params:
 *   - id:     Supabase boat listing ID (fetches from `boats` table)
 *   - format: "feed" (1080x1350), "story" (1080x1920), "square" (1080x1080)
 */
export default async function handler(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const format = (url.searchParams.get("format") || "feed") as Format;
  const dims = FORMATS[format] || FORMATS.feed;

  let title = "Sunset Cruise & Champagne";
  let city = "Miami";
  let pricePerHour = 245;
  let boatName = "Sea Majesty 60";
  let capacity = 12;
  let rating = 4.9;
  let boatType = "Motor Yacht";
  let features: string[] = ["Champagne", "DJ", "Swimming"];
  let hostName = "Captain Rivera";
  let lengthFt = 60;
  let photoUrl = "";

  // If an ID is provided, fetch the real listing from Supabase
  if (id) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/boats?select=*&id=eq.${id}&limit=1`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
          }
        );
        const boats = await resp.json();
        if (Array.isArray(boats) && boats.length > 0) {
          const boat = boats[0];
          title = boat.name || title;
          city = boat.city || city;
          if (boat.hourly_rate) {
            pricePerHour = Math.round(Number(boat.hourly_rate));
          }
          boatName = boat.name || boatName;
          if (boat.make && boat.model) {
            boatName = `${boat.make} ${boat.model}`;
          }
          capacity = boat.capacity || capacity;
          rating = boat.rating ? Number(boat.rating) : rating;
          boatType = boat.type || boatType;
          lengthFt = boat.length_ft || lengthFt;
          hostName = boat.captain_name || hostName;
          if (
            Array.isArray(boat.photo_urls) &&
            boat.photo_urls.length > 0
          ) {
            photoUrl = boat.photo_urls[0];
          }
          if (
            Array.isArray(boat.features) &&
            boat.features.length > 0
          ) {
            features = boat.features.slice(0, 4);
          } else if (
            Array.isArray(boat.amenities) &&
            boat.amenities.length > 0
          ) {
            features = boat.amenities.slice(0, 4);
          }
        }
      } catch {
        // Fall through to defaults
      }
    }
  }

  // Query-param overrides
  title = url.searchParams.get("title") || title;
  city = url.searchParams.get("city") || city;
  if (url.searchParams.get("price"))
    pricePerHour = parseInt(url.searchParams.get("price")!);
  if (url.searchParams.get("photo"))
    photoUrl = url.searchParams.get("photo")!;

  const W = dims.width;
  const H = dims.height;
  const isStory = format === "story";
  const isSquare = format === "square";

  const splitGuests = 8;
  const splitPrice = Math.round((pricePerHour * 4) / splitGuests);
  const appIconUrl = "https://splytpayments.com/app-icon.png";

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#050E1A",
        }}
      >
        {/* ===== FULL-BLEED HERO IMAGE ===== */}
        {photoUrl ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: W,
              height: H,
              display: "flex",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt=""
              width={W}
              height={H}
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
            />
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: W,
              height: H,
              display: "flex",
              background:
                "linear-gradient(165deg, #0A2540 0%, #0D1F3C 40%, #061728 100%)",
            }}
          />
        )}

        {/* ===== GRADIENT OVERLAYS ===== */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: Math.round(H * 0.25),
            background: photoUrl
              ? "linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)"
              : "transparent",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: Math.round(H * (isStory ? 0.5 : 0.58)),
            background: photoUrl
              ? "linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0.3) 75%, transparent 100%)"
              : "linear-gradient(0deg, rgba(0,0,0,0.4) 0%, transparent 100%)",
            display: "flex",
          }}
        />

        {/* ===== TOP BAR: Brand + Location ===== */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "48px 52px 0 52px",
            position: "relative",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={appIconUrl}
              alt=""
              width={44}
              height={44}
              style={{ borderRadius: 12 }}
            />
            <span
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "#fff",
                letterSpacing: "0.06em",
              }}
            >
              SPLYT
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              borderRadius: 100,
              padding: "10px 22px",
              border: "1px solid rgba(255, 255, 255, 0.2)",
            }}
          >
            <span style={{ fontSize: 14, color: "#fff" }}>{"\u2693"}</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {city}
            </span>
          </div>
        </div>

        {/* ===== BOTTOM CONTENT ===== */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            padding: isStory ? "0 52px 64px" : "0 52px 52px",
            gap: isStory ? 28 : 24,
            zIndex: 10,
          }}
        >
          {/* Details line */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {boatType}
            </span>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>
              {"\u00B7"}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {lengthFt}FT
            </span>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>
              {"\u00B7"}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              UP TO {capacity} GUESTS
            </span>
            {rating > 0 && (
              <>
                <span
                  style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}
                >
                  {"\u00B7"}
                </span>
                <span style={{ fontSize: 14, color: "#FFB400" }}>
                  {"\u2605"}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {rating.toFixed(1)}
                </span>
              </>
            )}
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: isStory ? 46 : isSquare ? 36 : 42,
              fontWeight: 700,
              lineHeight: 1.1,
              color: "#fff",
              display: "flex",
              flexWrap: "wrap",
              letterSpacing: "-0.02em",
            }}
          >
            {title.length > 55 ? title.slice(0, 52) + "..." : title}
          </div>

          {/* Host */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                color: "#fff",
                fontWeight: 700,
              }}
            >
              {hostName.charAt(0)}
            </div>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              Hosted by {hostName}
            </span>
          </div>

          {/* Feature tags */}
          {features.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {features.map((feature, i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: 100,
                    padding: "6px 16px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.7)",
                      fontWeight: 500,
                    }}
                  >
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ===== HERO PRICING ===== */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: isStory ? 80 : isSquare ? 64 : 74,
                  fontWeight: 800,
                  color: "#fff",
                  lineHeight: 0.9,
                  letterSpacing: "-0.03em",
                }}
              >
                ${splitPrice}
              </span>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: 6,
                }}
              >
                /person
              </span>
            </div>
          </div>

          {/* Total context */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: -8,
            }}
          >
            <span
              style={{
                fontSize: 16,
                color: "rgba(255,255,255,0.4)",
                fontWeight: 500,
                textDecoration: "line-through",
                textDecorationColor: "rgba(255,255,255,0.3)",
              }}
            >
              ${(pricePerHour * 4).toLocaleString()} total charter
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                backgroundColor: "rgba(76, 175, 80, 0.2)",
                borderRadius: 100,
                padding: "5px 14px",
                border: "1px solid rgba(76, 175, 80, 0.3)",
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#81C784",
                  letterSpacing: "0.02em",
                }}
              >
                Split {splitGuests} ways
              </span>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background:
                "linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))",
              display: "flex",
              marginTop: 4,
              marginBottom: 4,
            }}
          />

          {/* Bottom row: App Store + tagline */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                backgroundColor: "#000",
                borderRadius: 12,
                padding: "9px 18px 9px 14px",
                border: "1.5px solid rgba(255, 255, 255, 0.25)",
              }}
            >
              <svg
                width="24"
                height="30"
                viewBox="0 0 28 34"
                fill="white"
              >
                <path d="M23.1 17.8c0-3.2 2.6-4.8 2.7-4.8-1.5-2.2-3.8-2.5-4.6-2.5-2-.2-3.8 1.2-4.8 1.2-1 0-2.5-1.1-4.1-1.1-2.1 0-4.1 1.2-5.2 3.1-2.2 3.8-.6 9.5 1.6 12.6 1.1 1.5 2.3 3.2 4 3.2 1.6-.1 2.2-1 4.1-1s2.5 1 4.1 1c1.7 0 2.8-1.5 3.9-3.1 1.2-1.8 1.7-3.5 1.8-3.6 0 0-3.5-1.3-3.5-5.1zM19.8 8c.9-1.1 1.5-2.6 1.3-4.1-1.3.1-2.8.8-3.8 1.9-.8 1-1.6 2.5-1.4 4 1.5.1 2.9-.7 3.9-1.8z" />
              </svg>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#fff",
                    fontWeight: 400,
                    lineHeight: 1.2,
                  }}
                >
                  Download on the
                </span>
                <span
                  style={{
                    fontSize: 20,
                    color: "#fff",
                    fontWeight: 600,
                    lineHeight: 1.2,
                    letterSpacing: "-0.02em",
                  }}
                >
                  App Store
                </span>
              </div>
            </div>

            <span
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.35)",
                fontWeight: 500,
                letterSpacing: "0.02em",
              }}
            >
              Split the cost. Share the experience.
            </span>
          </div>
        </div>

        {/* ===== DECORATIVE (no-photo mode) ===== */}
        {!photoUrl && (
          <>
            <div
              style={{
                position: "absolute",
                top: "15%",
                left: "50%",
                width: 600,
                height: 600,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(79, 195, 247, 0.08) 0%, transparent 70%)",
                transform: "translateX(-50%)",
                display: "flex",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: isStory ? "18%" : isSquare ? "12%" : "15%",
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <svg width="280" height="220" viewBox="0 0 200 160">
                <path
                  d="M0 110 Q25 100 50 110 Q75 120 100 110 Q125 100 150 110 Q175 120 200 110 L200 160 L0 160 Z"
                  fill="rgba(79, 195, 247, 0.15)"
                />
                <path
                  d="M0 125 Q30 115 60 125 Q90 135 120 125 Q150 115 180 125 Q195 130 200 125 L200 160 L0 160 Z"
                  fill="rgba(79, 195, 247, 0.08)"
                />
                <path
                  d="M55 110 Q60 135 100 135 Q140 135 145 110 Z"
                  fill="rgba(79, 195, 247, 0.5)"
                />
                <line
                  x1="100"
                  y1="25"
                  x2="100"
                  y2="110"
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="2.5"
                />
                <path
                  d="M103 28 Q145 65 138 107 L103 107 Z"
                  fill="rgba(255,255,255,0.12)"
                />
                <path
                  d="M97 35 Q65 75 68 107 L97 107 Z"
                  fill="rgba(255,255,255,0.08)"
                />
              </svg>
            </div>
          </>
        )}
      </div>
    ),
    { width: W, height: H }
  );
}
