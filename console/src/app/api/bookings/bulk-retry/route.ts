import { createServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/bookings/bulk-retry
 * Retry all failed bookings that still have retries remaining.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();

    // Find all retryable failed bookings
    const { data: failed } = await supabase
      .from("bookings")
      .select("id, source_provider, source_url, experience_id, booking_date, booking_start_time, booking_duration_hours, booking_total_amount, retry_count, max_retries")
      .eq("status", "failed")
      .order("created_at", { ascending: false });

    if (!failed || failed.length === 0) {
      return NextResponse.json({ retried: 0, message: "No failed bookings to retry" });
    }

    const retryable = failed.filter(
      (b) => (b.retry_count ?? 0) < (b.max_retries ?? 3),
    );

    if (retryable.length === 0) {
      return NextResponse.json({
        retried: 0,
        message: `${failed.length} failed bookings but all have exhausted retries`,
      });
    }

    const agentUrl = process.env.BOOKING_AGENT_URL ?? "http://localhost:3100";
    const agentKey = process.env.AGENT_API_KEY;
    const results: { booking_id: string; sent: boolean; error?: string }[] = [];

    for (const b of retryable) {
      try {
        const res = await fetch(`${agentUrl}/api/retry`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(agentKey ? { Authorization: `Bearer ${agentKey}` } : {}),
          },
          body: JSON.stringify({ booking_id: b.id }),
        });

        results.push({ booking_id: b.id, sent: res.ok });
      } catch (err) {
        results.push({
          booking_id: b.id,
          sent: false,
          error: err instanceof Error ? err.message : "Agent unreachable",
        });
      }
    }

    const sent = results.filter((r) => r.sent).length;

    return NextResponse.json({
      retried: sent,
      total_failed: failed.length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
