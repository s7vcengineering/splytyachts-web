import { createServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/bookings/trigger
 * Manually trigger the booking agent for an experience.
 * Creates a booking row and sends it to the booking-agent service.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { experience_id } = body;

    if (!experience_id) {
      return NextResponse.json(
        { error: "experience_id is required" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // Fetch the experience
    const { data: exp, error: expError } = await supabase
      .from("experiences")
      .select("*")
      .eq("id", experience_id)
      .single();

    if (expError || !exp) {
      return NextResponse.json(
        { error: "Experience not found" },
        { status: 404 },
      );
    }

    if (!exp.source_url) {
      return NextResponse.json(
        { error: "Experience has no source_url — cannot trigger automated booking" },
        { status: 400 },
      );
    }

    // Check for existing active booking
    const { data: existing } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("experience_id", experience_id)
      .in("status", ["pending", "in_progress", "booked", "confirmed"])
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `Active booking already exists (${existing[0].status})`, booking_id: existing[0].id },
        { status: 409 },
      );
    }

    // Create booking row
    const { data: booking, error: bookError } = await supabase
      .from("bookings")
      .insert({
        experience_id: exp.id,
        source_provider: exp.source_provider ?? "boatsetter",
        source_url: exp.source_url,
        booking_date: exp.date_time
          ? new Date(exp.date_time).toISOString().split("T")[0]
          : null,
        booking_start_time: exp.date_time
          ? new Date(exp.date_time).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          : null,
        booking_duration_hours: exp.duration_hours ?? 4,
        booking_total_amount: exp.total_cost ?? 0,
        status: "pending",
        retry_count: 0,
        max_retries: 3,
      })
      .select()
      .single();

    if (bookError || !booking) {
      return NextResponse.json(
        { error: `Failed to create booking: ${bookError?.message}` },
        { status: 500 },
      );
    }

    // Send to booking agent
    const agentUrl = process.env.BOOKING_AGENT_URL ?? "http://localhost:3100";
    const agentKey = process.env.AGENT_API_KEY;

    try {
      const agentRes = await fetch(`${agentUrl}/api/book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(agentKey ? { Authorization: `Bearer ${agentKey}` } : {}),
        },
        body: JSON.stringify({
          booking_id: booking.id,
          experience_id: exp.id,
          experience_title: exp.title,
          source_url: exp.source_url,
          source_provider: exp.source_provider ?? "boatsetter",
          booking_date: booking.booking_date,
          booking_start_time: booking.booking_start_time,
          booking_duration_hours: booking.booking_duration_hours,
          booking_total_amount: booking.booking_total_amount,
          service_type: exp.service_type,
        }),
      });

      const agentData = await agentRes.json();

      return NextResponse.json({
        success: true,
        booking_id: booking.id,
        agent_response: agentData,
      });
    } catch (agentErr) {
      // Booking was created but agent call failed — mark as needing manual retry
      await supabase
        .from("bookings")
        .update({
          status: "failed",
          failure_reason: `Agent unreachable: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`,
        })
        .eq("id", booking.id);

      return NextResponse.json({
        success: false,
        booking_id: booking.id,
        error: "Booking created but agent is unreachable. You can retry from the bookings page.",
      }, { status: 502 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
