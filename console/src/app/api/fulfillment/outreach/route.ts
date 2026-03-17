import { NextRequest, NextResponse } from "next/server";

const BOOKING_AGENT_URL =
  process.env.BOOKING_AGENT_URL || "http://localhost:3100";

interface OutreachBody {
  captain_name: string;
  captain_phone?: string;
  experience_title: string;
  experience_date: string;
  send?: boolean;
}

export async function POST(req: NextRequest) {
  const body: OutreachBody = await req.json();

  if (!body.captain_name || !body.experience_title || !body.experience_date) {
    return NextResponse.json(
      {
        error:
          "captain_name, experience_title, and experience_date are required",
      },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${BOOKING_AGENT_URL}/api/outreach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captain_name: body.captain_name,
        captain_phone: body.captain_phone,
        experience_title: body.experience_title,
        experience_date: body.experience_date,
        languages: ["en", "es", "pt"],
        send: body.send || false,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Outreach request failed" },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Booking agent service is unreachable" },
      { status: 503 },
    );
  }
}
