"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const SORT_OPTIONS = [
  { value: "price_desc", label: "Price: High to Low" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "year", label: "Newest Year" },
  { value: "hp", label: "Most Horsepower" },
];

export function CarsFilter({ makes }: { makes: string[] }) {
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
      router.push(`/exotic-cars?${params.toString()}`);
    },
    [router, searchParams],
  );

  const selectClass =
    "rounded-lg border border-ocean-700 bg-ocean-800 px-3 py-2 text-sm text-white focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 focus:outline-none";

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
          placeholder="Search cars..."
          value={searchParams.get("q") || ""}
          onChange={(e) => update("q", e.target.value)}
          className="w-52 rounded-lg border border-ocean-700 bg-ocean-800 pl-9 pr-3 py-2 text-sm text-white placeholder-ocean-500 focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 focus:outline-none"
        />
      </div>

      <select
        value={searchParams.get("make") || ""}
        onChange={(e) => update("make", e.target.value)}
        className={selectClass}
      >
        <option value="">All Makes</option>
        {makes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("sort") || "price_desc"}
        onChange={(e) => update("sort", e.target.value)}
        className={selectClass}
      >
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {searchParams.toString() && (
        <button
          onClick={() => router.push("/exotic-cars")}
          className="text-xs text-ocean-400 hover:text-white transition-colors underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
