"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface BulkRetryButtonProps {
  failedCount: number;
}

export function BulkRetryButton({ failedCount }: BulkRetryButtonProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleBulkRetry() {
    if (retrying || failedCount === 0) return;

    setRetrying(true);
    setResult(null);

    try {
      const res = await fetch("/api/bookings/bulk-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (data.retried > 0) {
        setResult({
          success: true,
          message: `Retried ${data.retried} of ${data.total_failed} failed bookings`,
        });
        router.refresh();
      } else {
        setResult({
          success: false,
          message: data.message || "No bookings retried",
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setRetrying(false);
    }
  }

  if (failedCount === 0) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleBulkRetry}
        disabled={retrying}
        className={cn(
          "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
          retrying
            ? "bg-ocean-800 text-ocean-500 cursor-not-allowed"
            : "bg-red-500/20 text-red-400 hover:bg-red-500/30",
        )}
      >
        {retrying ? "Retrying..." : `Retry All Failed (${failedCount})`}
      </button>
      {result && (
        <span
          className={cn(
            "text-xs",
            result.success ? "text-green-400" : "text-red-400",
          )}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
