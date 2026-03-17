"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  experienceId: string;
  experienceTitle: string;
  experienceDate: string;
  captainName: string | null;
  captainPhone: string | null;
  latestBooking: Record<string, unknown> | null;
  bookingLogs: Record<string, unknown>[];
}

type OutreachStatus = "idle" | "loading" | "success" | "error";

export function OutreachPanel({
  experienceTitle,
  experienceDate,
  captainName,
  captainPhone,
  latestBooking,
  bookingLogs,
}: Props) {
  const [outreachStatus, setOutreachStatus] = useState<OutreachStatus>("idle");
  const [outreachResult, setOutreachResult] = useState<{
    formatted?: string;
    sent?: boolean;
    error?: string;
  } | null>(null);

  async function handleGenerateOutreach(send: boolean) {
    if (!captainName) return;
    setOutreachStatus("loading");
    setOutreachResult(null);

    try {
      const res = await fetch("/api/fulfillment/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captain_name: captainName,
          captain_phone: captainPhone,
          experience_title: experienceTitle,
          experience_date: experienceDate,
          send,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setOutreachStatus("error");
        setOutreachResult({ error: data.error || "Outreach failed" });
        return;
      }

      setOutreachStatus("success");
      setOutreachResult(data);
    } catch (err) {
      setOutreachStatus("error");
      setOutreachResult({
        error: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Booking Status */}
      {latestBooking && (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-ocean-700">
            <h3 className="text-sm font-semibold text-white">
              Booking Agent Status
            </h3>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-ocean-400">Status</span>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  (latestBooking.status as string) === "in_progress"
                    ? "bg-purple-500/20 text-purple-400"
                    : (latestBooking.status as string) === "completed"
                      ? "bg-green-500/20 text-green-400"
                      : (latestBooking.status as string) === "failed"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-ocean-700 text-ocean-400",
                )}
              >
                {(latestBooking.status as string)?.replace("_", " ") || "—"}
              </span>
            </div>
            {!!latestBooking.failure_reason && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                <p className="text-xs text-red-400">
                  {latestBooking.failure_reason as string}
                </p>
              </div>
            )}
            {latestBooking.retry_count != null && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-ocean-400">Retries</span>
                <span className="text-xs text-ocean-300">
                  {latestBooking.retry_count as number} /{" "}
                  {(latestBooking.max_retries as number) || 3}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Captain Outreach */}
      <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-ocean-700">
          <h3 className="text-sm font-semibold text-white">
            Captain Outreach
          </h3>
        </div>
        <div className="p-5 space-y-4">
          {captainName ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-ocean-400">Captain</span>
                  <span className="text-sm text-white">{captainName}</span>
                </div>
                {captainPhone && (
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-ocean-400">Phone</span>
                    <span className="text-sm text-ocean-300 font-mono">
                      {captainPhone}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleGenerateOutreach(false)}
                  disabled={outreachStatus === "loading"}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors",
                    outreachStatus === "loading"
                      ? "bg-ocean-700 text-ocean-500 cursor-wait"
                      : "bg-ocean-800 text-ocean-300 hover:bg-ocean-700 hover:text-white",
                  )}
                >
                  Generate Messages
                </button>
                {captainPhone && (
                  <button
                    onClick={() => handleGenerateOutreach(true)}
                    disabled={outreachStatus === "loading"}
                    className={cn(
                      "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors",
                      outreachStatus === "loading"
                        ? "bg-ocean-700 text-ocean-500 cursor-wait"
                        : "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30",
                    )}
                  >
                    Generate & Send
                  </button>
                )}
              </div>

              {outreachResult && outreachStatus === "success" && (
                <div className="rounded-lg bg-ocean-800/50 border border-ocean-700 p-4">
                  <pre className="text-xs text-ocean-300 whitespace-pre-wrap font-mono leading-relaxed">
                    {outreachResult.formatted}
                  </pre>
                  {outreachResult.sent && (
                    <p className="text-xs text-green-400 mt-2 font-medium">
                      Messages sent to {captainPhone}
                    </p>
                  )}
                </div>
              )}

              {outreachResult && outreachStatus === "error" && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-xs text-red-400">
                    {outreachResult.error}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-ocean-500">
              No captain/partner assigned to this experience yet.
            </p>
          )}
        </div>
      </div>

      {/* Agent Activity Timeline */}
      {bookingLogs.length > 0 && (
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-ocean-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Agent Activity
            </h3>
            <span className="text-xs text-ocean-500">
              {bookingLogs.length} steps
            </span>
          </div>
          <div className="p-5">
            <div className="space-y-3">
              {bookingLogs.map((log, i) => (
                <div key={log.id as string} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-2.5 h-2.5 rounded-full border-2 mt-1",
                        (log.level as string) === "error"
                          ? "border-red-400 bg-red-400/20"
                          : (log.level as string) === "warn"
                            ? "border-yellow-400 bg-yellow-400/20"
                            : "border-ocean-500 bg-ocean-500/20",
                      )}
                    />
                    {i < bookingLogs.length - 1 && (
                      <div className="w-px flex-1 bg-ocean-700 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          (log.level as string) === "error"
                            ? "text-red-400"
                            : "text-white",
                        )}
                      >
                        {log.action as string}
                      </span>
                      <span className="text-[10px] text-ocean-500">
                        {log.duration_ms
                          ? `${log.duration_ms as number}ms`
                          : ""}
                      </span>
                    </div>
                    {!!log.message && (
                      <p className="text-[10px] text-ocean-400 mt-0.5">
                        {log.message as string}
                      </p>
                    )}
                    {!!log.screenshot_url && (
                      <a
                        href={log.screenshot_url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 mt-0.5 inline-block"
                      >
                        View screenshot
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
