"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  experienceId: string;
  experienceTitle: string;
  sourceUrl: string;
  sourceProvider: string;
  bookingDate: string;
  bookingStartTime: string;
  durationHours: number;
  totalAmount: number;
  ready: boolean;
}

type Status = "idle" | "loading" | "success" | "error";

export function ExecuteAgentButton({
  experienceId,
  experienceTitle,
  sourceUrl,
  sourceProvider,
  bookingDate,
  bookingStartTime,
  durationHours,
  totalAmount,
  ready,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<{
    booking_id?: string;
    agent?: string;
    error?: string;
  } | null>(null);

  async function handleExecute() {
    if (!ready) return;
    setStatus("loading");
    setResult(null);

    try {
      const res = await fetch("/api/fulfillment/execute-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experience_id: experienceId,
          experience_title: experienceTitle,
          source_url: sourceUrl,
          source_provider: sourceProvider,
          booking_date: bookingDate,
          booking_start_time: bookingStartTime,
          duration_hours: durationHours,
          total_amount: totalAmount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setResult({ error: data.error || "Failed to execute agent" });
        return;
      }

      setStatus("success");
      setResult(data);
    } catch (err) {
      setStatus("error");
      setResult({
        error: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <div className="space-y-4">
      {!ready && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
          <p className="text-xs text-yellow-400">
            Not all readiness checks are passing. You can still execute, but the
            booking may fail.
          </p>
        </div>
      )}

      <button
        onClick={handleExecute}
        disabled={status === "loading"}
        className={cn(
          "w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all",
          status === "loading"
            ? "bg-ocean-700 text-ocean-400 cursor-wait"
            : status === "success"
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : status === "error"
                ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                : ready
                  ? "bg-cyan-500 text-white hover:bg-cyan-400 shadow-lg shadow-cyan-500/20"
                  : "bg-yellow-500/80 text-white hover:bg-yellow-500 shadow-lg shadow-yellow-500/20",
        )}
      >
        {status === "loading"
          ? "Executing Agent..."
          : status === "success"
            ? "Agent Dispatched"
            : status === "error"
              ? "Retry Execute Agent"
              : "Execute Booking Agent"}
      </button>

      {result && (
        <div
          className={cn(
            "rounded-lg p-3 text-xs",
            status === "success"
              ? "bg-green-500/10 border border-green-500/20"
              : "bg-red-500/10 border border-red-500/20",
          )}
        >
          {status === "success" ? (
            <div className="space-y-1">
              <p className="text-green-400 font-medium">
                Booking agent accepted the request
              </p>
              {result.booking_id && (
                <p className="text-ocean-400">
                  Booking ID:{" "}
                  <span className="font-mono text-ocean-300">
                    {result.booking_id.slice(0, 8)}...
                  </span>
                </p>
              )}
              {result.agent && (
                <p className="text-ocean-400">
                  Agent: <span className="text-ocean-300">{result.agent}</span>
                </p>
              )}
              <p className="text-ocean-500 mt-1">
                The agent is running in the background. Refresh the page to see
                updates.
              </p>
            </div>
          ) : (
            <p className="text-red-400">{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
