import { createServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/fulfillment/confirm
 *
 * Manually confirm a booking from the admin dashboard.
 * Triggers the booking-confirmed-handler Edge Function which:
 * - Broadcasts push + in-app notifications to all crew
 * - Sends confirmation email to host
 * - Sends trip details email to all crew
 * - Posts confirmation to the experience chat thread
 * - Updates experience and booking status to confirmed
 */
export async function POST(req: NextRequest) {
  const {
    experience_id,
    booking_id,
    confirmation_number,
  }: {
    experience_id: string;
    booking_id?: string;
    confirmation_number?: string;
  } = await req.json();

  if (!experience_id) {
    return NextResponse.json(
      { error: "experience_id is required" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // If a confirmation number was provided, update the booking
  if (booking_id && confirmation_number) {
    await supabase
      .from("bookings")
      .update({
        confirmation_number,
        status: "booked",
        booked_at: new Date().toISOString(),
      })
      .eq("id", booking_id);
  }

  // Invoke the booking-confirmed-handler Edge Function
  const { data, error } = await supabase.functions.invoke(
    "booking-confirmed-handler",
    {
      body: {
        experience_id,
        booking_id: booking_id || undefined,
      },
    },
  );

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to trigger confirmed handler" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    ...(data as Record<string, unknown>),
  });
}
