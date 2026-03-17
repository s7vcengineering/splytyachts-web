"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STAGE_ORDER = [
  "deposits_collecting",
  "ready_to_book",
  "outreach_sent",
  "confirmed",
  "completed",
] as const;

const STAGE_LABELS: Record<string, string> = {
  deposits_collecting: "Collecting",
  ready_to_book: "Ready",
  outreach_sent: "Outreach",
  confirmed: "Confirmed",
  completed: "Completed",
};

interface Props {
  experienceId: string;
  currentStage: string;
}

export function PipelineActions({ experienceId, currentStage }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const currentIdx = STAGE_ORDER.indexOf(
    currentStage as (typeof STAGE_ORDER)[number],
  );
  const canAdvance = currentIdx >= 0 && currentIdx < STAGE_ORDER.length - 1;
  const canRevert = currentIdx > 0;

  async function moveStage(direction: "advance" | "revert") {
    setLoading(true);
    try {
      const nextIdx =
        direction === "advance" ? currentIdx + 1 : currentIdx - 1;
      const targetStage = STAGE_ORDER[nextIdx];

      const res = await fetch("/api/fulfillment/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experience_id: experienceId,
          target_stage: targetStage,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update stage");
        return;
      }

      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-ocean-800">
      {canRevert && (
        <button
          onClick={() => moveStage("revert")}
          disabled={loading}
          className="px-2 py-1 rounded-md text-[10px] font-medium bg-ocean-800 text-ocean-400 hover:text-ocean-200 hover:bg-ocean-700 transition-colors disabled:opacity-50"
        >
          &larr; {STAGE_LABELS[STAGE_ORDER[currentIdx - 1]]}
        </button>
      )}
      {canAdvance && (
        <button
          onClick={() => moveStage("advance")}
          disabled={loading}
          className="px-2 py-1 rounded-md text-[10px] font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-50 ml-auto"
        >
          {STAGE_LABELS[STAGE_ORDER[currentIdx + 1]]} &rarr;
        </button>
      )}
    </div>
  );
}
