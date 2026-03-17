"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn, formatCity } from "@/lib/utils";

const SOURCE_TABS = [
  { value: "airbnb_experiences", label: "Airbnb Experiences", color: "bg-pink-500/20 text-pink-400" },
  { value: "boats", label: "Boats", color: "bg-cyan-500/20 text-cyan-400" },
  { value: "exotic_cars", label: "Exotic Cars", color: "bg-purple-500/20 text-purple-400" },
  { value: "mansions", label: "Mansions", color: "bg-amber-500/20 text-amber-400" },
] as const;

interface CatalogFilterProps {
  cities: string[];
  counts: Record<string, number>;
}

export function CatalogFilter({ cities, counts }: CatalogFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSource = searchParams.get("source") || "airbnb_experiences";

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // Reset page when changing filters
      params.delete("page");
      router.push(`/catalog?${params.toString()}`);
    },
    [router, searchParams],
  );

  const selectClass =
    "rounded-lg border border-ocean-700 bg-ocean-800 px-3 py-2 text-sm text-white focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 focus:outline-none";

  return (
    <div className="space-y-4">
      {/* Source tabs */}
      <div className="flex flex-wrap gap-2">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              // When switching source, clear city and search since they differ per source
              const params = new URLSearchParams();
              params.set("source", tab.value);
              router.push(`/catalog?${params.toString()}`);
            }}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              currentSource === tab.value
                ? "bg-ocean-700 text-white ring-1 ring-ocean-500"
                : "bg-ocean-900 text-ocean-400 hover:bg-ocean-800 hover:text-ocean-200",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-semibold",
                currentSource === tab.value
                  ? "bg-ocean-600 text-white"
                  : "bg-ocean-800 text-ocean-500",
              )}
            >
              {counts[tab.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 bg-ocean-900 rounded-xl border border-ocean-700 p-4">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ocean-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            placeholder="Search by title..."
            value={searchParams.get("q") || ""}
            onChange={(e) => update("q", e.target.value)}
            className="w-56 rounded-lg border border-ocean-700 bg-ocean-800 pl-9 pr-3 py-2 text-sm text-white placeholder-ocean-500 focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 focus:outline-none"
          />
        </div>

        {/* City filter */}
        <select
          value={searchParams.get("city") || ""}
          onChange={(e) => update("city", e.target.value)}
          className={selectClass}
        >
          <option value="">All Cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {formatCity(c)}
            </option>
          ))}
        </select>

        {/* Clear */}
        {(searchParams.get("q") || searchParams.get("city")) && (
          <button
            onClick={() => {
              const params = new URLSearchParams();
              const source = searchParams.get("source");
              if (source) params.set("source", source);
              router.push(`/catalog?${params.toString()}`);
            }}
            className="text-xs text-ocean-400 hover:text-white transition-colors underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
