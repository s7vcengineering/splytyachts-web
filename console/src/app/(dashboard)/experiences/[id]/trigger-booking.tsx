"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface TriggerBookingProps {
  experienceId: string;
  hasSourceUrl: boolean;
  hasActiveBooking: boolean;
}

export function TriggerBooking({
  experienceId,
  hasSourceUrl,
  hasActiveBooking,
}: TriggerBookingProps) {
  const router = useRouter();
  const [triggering, setTriggering] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleTrigger() {
    if (!hasSourceUrl || hasActiveBooking || triggering) return;

    setTriggering(true);
    setResult(null);

    try {
      const res = await fetch("/api/bookings/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experience_id: experienceId }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResult({ success: true, message: `Booking triggered (${data.booking_id.slice(0, 8)})` });
        router.refresh();
      } else {
        setResult({ success: false, message: data.error || "Failed to trigger booking" });
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setTriggering(false);
    }
  }

  const disabled = !hasSourceUrl || hasActiveBooking || triggering;
  const tooltip = !hasSourceUrl
    ? "No source URL — cannot trigger automated booking"
    : hasActiveBooking
      ? "Active booking already exists"
      : undefined;

  return (
    <div>
      <button
        onClick={handleTrigger}
        disabled={disabled}
        title={tooltip}
        className={cn(
          "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
          disabled
            ? "bg-ocean-800 text-ocean-500 cursor-not-allowed"
            : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
        )}
      >
        {triggering ? "Triggering..." : "Trigger Booking"}
      </button>
      {result && (
        <p
          className={cn(
            "text-xs mt-2",
            result.success ? "text-green-400" : "text-red-400",
          )}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
