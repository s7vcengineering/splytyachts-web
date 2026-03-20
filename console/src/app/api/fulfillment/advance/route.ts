import { createServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// Maps pipeline stages to the booking_status / experience status updates needed
const STAGE_UPDATES: Record<
  string,
  { booking_status?: string; status?: string }
> = {
  deposits_collecting: { booking_status: "pending", status: "filling" },
  ready_to_book: { booking_status: "pending", status: "full" },
  outreach_sent: { booking_status: "in_progress" },
  confirmed: { booking_status: "confirmed" },
  completed: { booking_status: "confirmed", status: "completed" },
};

const VALID_STAGES = Object.keys(STAGE_UPDATES);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { experience_id, target_stage } = body;

    if (!experience_id || !target_stage) {
      return NextResponse.json(
        { error: "Missing experience_id or target_stage" },
        { status: 400 },
      );
    }

    if (!VALID_STAGES.includes(target_stage)) {
      return NextResponse.json(
        { error: `Invalid stage: ${target_stage}` },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    const updates = STAGE_UPDATES[target_stage];
    const updatePayload: Record<string, string> = {};

    if (updates.booking_status) {
      updatePayload.booking_status = updates.booking_status;
    }
    if (updates.status) {
      updatePayload.status = updates.status;
    }

    const { error } = await supabase
      .from("experiences")
      .update(updatePayload)
      .eq("id", experience_id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    // Fire agent message to the group thread (non-blocking)
    const baseUrl =
      req.headers.get("x-forwarded-proto") + "://" + req.headers.get("host");
    fetch(`${baseUrl}/api/fulfillment/agent-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experience_id, stage: target_stage }),
    }).catch(() => {
      // Non-blocking — don't fail the advance if messaging fails
    });

    return NextResponse.json({ ok: true, stage: target_stage });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
