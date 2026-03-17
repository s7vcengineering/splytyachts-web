import { createServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

const BOOKING_AGENT_URL =
  process.env.BOOKING_AGENT_URL || "http://localhost:3100";

interface ExecuteAgentBody {
  experience_id: string;
  experience_title: string;
  source_url: string;
  source_provider: string;
  booking_date: string;
  booking_start_time: string;
  duration_hours: number;
  total_amount: number;
}

export async function POST(req: NextRequest) {
  const body: ExecuteAgentBody = await req.json();

  if (!body.experience_id || !body.source_url) {
    return NextResponse.json(
      { error: "experience_id and source_url are required" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Fetch host contact info for the booking form
  const { data: experience } = await supabase
    .from("experiences")
    .select("host:host_id(display_name, email, phone)")
    .eq("id", body.experience_id)
    .single();

  const host = experience?.host as unknown as Record<string, unknown> | null;

  // Create a booking record
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      experience_id: body.experience_id,
      source_url: body.source_url,
      source_provider: body.source_provider || "boatsetter",
      booking_date: body.booking_date || null,
      booking_start_time: body.booking_start_time || null,
      booking_duration_hours: body.duration_hours || 4,
      booking_total_amount: body.total_amount || 0,
      status: "pending",
      retry_count: 0,
      max_retries: 3,
    })
    .select()
    .single();

  if (bookingError || !booking) {
    return NextResponse.json(
      { error: bookingError?.message || "Failed to create booking" },
      { status: 500 },
    );
  }

  // Update experience booking_status to in_progress
  await supabase
    .from("experiences")
    .update({ booking_status: "in_progress" })
    .eq("id", body.experience_id);

  // Dispatch to booking agent with host contact info
  try {
    const agentRes = await fetch(`${BOOKING_AGENT_URL}/api/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booking_id: booking.id,
        experience_id: body.experience_id,
        experience_title: body.experience_title,
        source_url: body.source_url,
        source_provider: body.source_provider || "boatsetter",
        booking_date: body.booking_date,
        booking_start_time: body.booking_start_time,
        booking_duration_hours: body.duration_hours || 4,
        booking_total_amount: body.total_amount || 0,
        contact_name: (host?.display_name as string) || undefined,
        contact_email: (host?.email as string) || undefined,
        contact_phone: (host?.phone as string) || undefined,
      }),
    });

    const agentData = await agentRes.json();

    return NextResponse.json({
      booking_id: booking.id,
      agent: agentData.agent || body.source_provider,
      accepted: agentData.accepted ?? true,
    });
  } catch {
    // Agent unreachable — booking record still exists for manual retry
    return NextResponse.json({
      booking_id: booking.id,
      agent: null,
      accepted: false,
      warning:
        "Booking record created but agent service is unreachable. The booking can be retried later.",
    });
  }
}
