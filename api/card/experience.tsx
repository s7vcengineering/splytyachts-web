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
 *
 * If no `id` is provided, renders a generic branded card using static content.
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
          // Columns: name, type, hourly_rate, city, capacity, rating,
          //          length_ft, features, amenities, captain_name, make, model
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

  // Also allow query-param overrides for testing / manual card generation
  title = url.searchParams.get("title") || title;
  city = url.searchParams.get("city") || city;
  if (url.searchParams.get("price"))
    pricePerHour = parseInt(url.searchParams.get("price")!);

  const W = dims.width;
  const H = dims.height;
  const isStory = format === "story";
  const isSquare = format === "square";
  const pad = 56;

  // Split cost calculation
  const splitGuests = 8;
  const splitPrice = Math.round(
    (pricePerHour * 4) / splitGuests
  ); // 4-hour charter split

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
          background: "linear-gradient(180deg, #0A1628 0%, #0D1F3C 50%, #102A4C 100%)",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 5,
            background: "linear-gradient(90deg, #2196F3, #4FC3F7)",
            display: "flex",
          }}
        />

        {/* Ambient glow effects */}
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "10%",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "rgba(33, 150, 243, 0.06)",
            filter: "blur(80px)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "20%",
            right: "5%",
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "rgba(79, 195, 247, 0.04)",
            filter: "blur(60px)",
            display: "flex",
          }}
        />

        {/* Header: SPLYT brand + type badge */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: `${pad}px ${pad}px 0 ${pad}px`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, #2196F3, #4FC3F7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                color: "#fff",
              }}
            >
              S
            </div>
            <span
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#8EACCD",
                letterSpacing: "-0.02em",
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
              backgroundColor: "rgba(33, 150, 243, 0.12)",
              borderRadius: 20,
              padding: "8px 18px",
              border: "1px solid rgba(79, 195, 247, 0.15)",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#4FC3F7",
                display: "flex",
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#4FC3F7",
                letterSpacing: "0.08em",
              }}
            >
              EXPERIENCE
            </span>
          </div>
        </div>

        {/* Yacht visual area with wave decoration */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: `${isStory ? 48 : 36}px ${pad}px`,
            position: "relative",
          }}
        >
          {/* Large sailboat icon */}
          <div
            style={{
              width: isStory ? 220 : isSquare ? 160 : 200,
              height: isStory ? 220 : isSquare ? 160 : 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: isStory ? 140 : isSquare ? 100 : 120,
              marginBottom: 24,
            }}
          >
            <svg
              width={isStory ? 200 : isSquare ? 140 : 180}
              height={isStory ? 200 : isSquare ? 140 : 180}
              viewBox="0 0 200 200"
            >
              {/* Water waves */}
              <path
                d="M0 140 Q25 130 50 140 Q75 150 100 140 Q125 130 150 140 Q175 150 200 140 L200 200 L0 200 Z"
                fill="rgba(33, 150, 243, 0.3)"
              />
              <path
                d="M0 155 Q30 145 60 155 Q90 165 120 155 Q150 145 180 155 Q195 160 200 155 L200 200 L0 200 Z"
                fill="rgba(33, 150, 243, 0.15)"
              />
              {/* Hull */}
              <path
                d="M55 140 Q60 165 100 165 Q140 165 145 140 Z"
                fill="#4FC3F7"
              />
              {/* Mast */}
              <line
                x1="100"
                y1="45"
                x2="100"
                y2="140"
                stroke="#E8F0FE"
                strokeWidth="3"
              />
              {/* Main sail */}
              <path
                d="M103 48 Q145 85 138 137 L103 137 Z"
                fill="rgba(129, 212, 250, 0.7)"
              />
              {/* Jib */}
              <path
                d="M97 55 Q65 95 68 137 L97 137 Z"
                fill="rgba(179, 229, 252, 0.5)"
              />
            </svg>
          </div>

          {/* City label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 16, color: "#5A7A9A" }}>
              {"\u2693"}
            </span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#5A7A9A",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              {city}
            </span>
          </div>

          {/* Boat type & length */}
          <span
            style={{
              fontSize: 15,
              color: "#5A7A9A",
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            {boatType} {"\u00B7"} {lengthFt}ft {"\u00B7"} Up to {capacity}{" "}
            guests
          </span>
        </div>

        {/* Divider */}
        <div
          style={{
            margin: `0 ${pad}px`,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(79, 195, 247, 0.2), transparent)",
            display: "flex",
          }}
        />

        {/* Main content area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: `0 ${pad}px`,
            gap: isStory ? 36 : isSquare ? 20 : 28,
          }}
        >
          {/* Experience title */}
          <div
            style={{
              fontSize: isStory ? 52 : isSquare ? 36 : 46,
              fontWeight: 700,
              lineHeight: 1.15,
              color: "#E8F0FE",
              display: "flex",
              flexWrap: "wrap",
              letterSpacing: "-0.02em",
            }}
          >
            {title.length > 60 ? title.slice(0, 57) + "..." : title}
          </div>

          {/* Host + Rating */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, rgba(33,150,243,0.3), rgba(79,195,247,0.2))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  color: "#4FC3F7",
                  fontWeight: 700,
                }}
              >
                {hostName.charAt(0)}
              </div>
              <span style={{ fontSize: 18, fontWeight: 600, color: "#8EACCD" }}>
                {hostName}
              </span>
            </div>
            <span style={{ color: "#2A3A4C", fontSize: 18 }}>{"\u2022"}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 18, color: "#FFB400" }}>
                {"\u2605"}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#E8F0FE" }}>
                {rating.toFixed(1)}
              </span>
            </div>
          </div>

          {/* Feature tags */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {features.map((feature, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: "rgba(79, 195, 247, 0.08)",
                  border: "1px solid rgba(79, 195, 247, 0.15)",
                  borderRadius: 24,
                  padding: "8px 20px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 15,
                    color: "#8EACCD",
                    fontWeight: 500,
                  }}
                >
                  {feature}
                </span>
              </div>
            ))}
          </div>

          {/* Price callout */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              backgroundColor: "rgba(33, 150, 243, 0.08)",
              border: "1px solid rgba(79, 195, 247, 0.12)",
              borderRadius: 20,
              padding: "24px 28px",
              marginTop: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 14, color: "#5A7A9A", fontWeight: 600 }}>
                CHARTER FROM
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span
                  style={{
                    fontSize: 44,
                    fontWeight: 800,
                    color: "#4FC3F7",
                    lineHeight: 1,
                  }}
                >
                  ${pricePerHour}
                </span>
                <span
                  style={{
                    fontSize: 18,
                    color: "#5A7A9A",
                    fontWeight: 500,
                  }}
                >
                  /hr
                </span>
              </div>
            </div>

            {/* Split price */}
            <div
              style={{
                height: 60,
                width: 1,
                backgroundColor: "rgba(79, 195, 247, 0.15)",
                display: "flex",
              }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 14, color: "#5A7A9A", fontWeight: 600 }}>
                SPLIT {splitGuests} WAYS
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span
                  style={{
                    fontSize: 44,
                    fontWeight: 800,
                    color: "#E8F0FE",
                    lineHeight: 1,
                  }}
                >
                  ${splitPrice}
                </span>
                <span
                  style={{
                    fontSize: 18,
                    color: "#5A7A9A",
                    fontWeight: 500,
                  }}
                >
                  /person
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `0 ${pad}px ${pad}px ${pad}px`,
          }}
        >
          <span style={{ fontSize: 16, color: "#2A3A4C", fontWeight: 500 }}>
            splytyachts.com
          </span>
          <span style={{ fontSize: 14, color: "#1E2D3D", fontWeight: 500 }}>
            Life's too short to yacht alone
          </span>
        </div>
      </div>
    ),
    { width: W, height: H }
  );
}
