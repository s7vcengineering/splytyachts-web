"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { formatCity } from "@/lib/utils";

const BOAT_TYPES = [
  "yacht",
  "sailboat",
  "catamaran",
  "pontoon",
  "fishing",
  "speedboat",
  "other",
];

const SORT_OPTIONS = [
  { value: "rating", label: "Rating" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "capacity", label: "Capacity" },
  { value: "last_scraped", label: "Recently Scraped" },
];

export function BoatsFilter({ cities }: { cities: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`/boats?${params.toString()}`);
    },
    [router, searchParams],
  );

  const selectClass =
    "rounded-lg border border-ocean-700 bg-ocean-800 px-3 py-2 text-sm text-white focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 focus:outline-none";
  const inputClass =
    "w-24 rounded-lg border border-ocean-700 bg-ocean-800 px-3 py-2 text-sm text-white placeholder-ocean-500 focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-3 bg-ocean-900 rounded-xl border border-ocean-700 p-4">
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
          placeholder="Search boats..."
          value={searchParams.get("q") || ""}
          onChange={(e) => update("q", e.target.value)}
          className="w-52 rounded-lg border border-ocean-700 bg-ocean-800 pl-9 pr-3 py-2 text-sm text-white placeholder-ocean-500 focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 focus:outline-none"
        />
      </div>

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

      <select
        value={searchParams.get("type") || ""}
        onChange={(e) => update("type", e.target.value)}
        className={selectClass}
      >
        <option value="">All Types</option>
        {BOAT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("sort") || "rating"}
        onChange={(e) => update("sort", e.target.value)}
        className={selectClass}
      >
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-ocean-400">Capacity:</span>
        <input
          type="number"
          placeholder="Min"
          value={searchParams.get("min_capacity") || ""}
          onChange={(e) => update("min_capacity", e.target.value)}
          className={inputClass}
        />
        <span className="text-ocean-500">–</span>
        <input
          type="number"
          placeholder="Max"
          value={searchParams.get("max_capacity") || ""}
          onChange={(e) => update("max_capacity", e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-ocean-400">Price:</span>
        <input
          type="number"
          placeholder="Min"
          value={searchParams.get("min_price") || ""}
          onChange={(e) => update("min_price", e.target.value)}
          className={inputClass}
        />
        <span className="text-ocean-500">–</span>
        <input
          type="number"
          placeholder="Max"
          value={searchParams.get("max_price") || ""}
          onChange={(e) => update("max_price", e.target.value)}
          className={inputClass}
        />
      </div>

      {searchParams.toString() && (
        <button
          onClick={() => router.push("/boats")}
          className="text-xs text-ocean-400 hover:text-white transition-colors underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
