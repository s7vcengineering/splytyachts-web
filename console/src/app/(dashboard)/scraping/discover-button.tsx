"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function DiscoverCitiesButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    new_cities: number;
    existing_cities: number;
    total_discovered: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDiscover() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/scrape/discover-cities", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Discovery failed");
        return;
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleDiscover}
        disabled={loading}
        className={cn(
          "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
          loading
            ? "bg-ocean-700 text-ocean-400 cursor-not-allowed"
            : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30",
        )}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg
              className="w-4 h-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
            </svg>
            Discovering...
          </span>
        ) : (
          "Discover All Cities"
        )}
      </button>

      {result && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-green-400">
            +{result.new_cities} new
          </span>
          <span className="text-ocean-400">
            {result.existing_cities} existing
          </span>
          <span className="text-ocean-500">
            {result.total_discovered} total discovered
          </span>
        </div>
      )}

      {error && (
        <span className="text-sm text-red-400">{error}</span>
      )}
    </div>
  );
}

export function BackfillCaptainsButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    captains_created: number;
    boats_linked: number;
    captain_groups: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBackfill() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/scrape/backfill-captains", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Backfill failed");
        return;
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleBackfill}
        disabled={loading}
        className={cn(
          "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
          loading
            ? "bg-ocean-700 text-ocean-400 cursor-not-allowed"
            : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
        )}
      >
        {loading ? "Backfilling..." : "Backfill Captains"}
      </button>

      {result && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-green-400">
            +{result.captains_created} captains
          </span>
          <span className="text-cyan-400">
            {result.boats_linked} boats linked
          </span>
        </div>
      )}

      {error && (
        <span className="text-sm text-red-400">{error}</span>
      )}
    </div>
  );
}
