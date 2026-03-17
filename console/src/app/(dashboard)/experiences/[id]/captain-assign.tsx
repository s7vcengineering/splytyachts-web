"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface Captain {
  id: string;
  name: string;
  avatar_url: string | null;
  rating: number | null;
  boats_count: number;
  source: string;
}

interface CaptainAssignProps {
  experienceId: string;
  currentCaptain: Captain | null;
}

export function CaptainAssign({ experienceId, currentCaptain }: CaptainAssignProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Captain[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async (query: string) => {
    setSearch(query);
    if (query.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/captains/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.captains ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  async function assignCaptain(captainId: string) {
    setAssigning(true);
    setError(null);

    try {
      const res = await fetch(`/api/experiences/${experienceId}/captain`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captain_id: captainId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Assignment failed");
        return;
      }

      setSearch("");
      setResults([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setAssigning(false);
    }
  }

  async function removeCaptain() {
    setAssigning(true);
    setError(null);

    try {
      const res = await fetch(`/api/experiences/${experienceId}/captain`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Remove failed");
        return;
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-ocean-700 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="text-amber-400">&#129309;</span> Partner
        </h3>
        {currentCaptain && (
          <button
            onClick={removeCaptain}
            disabled={assigning}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      <div className="p-6">
        {currentCaptain ? (
          <div className="flex items-center gap-4">
            {currentCaptain.avatar_url ? (
              <img
                src={currentCaptain.avatar_url}
                alt={currentCaptain.name}
                className="w-14 h-14 rounded-full object-cover ring-2 ring-amber-400/30"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-lg font-bold">
                {currentCaptain.name[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-white font-semibold">{currentCaptain.name}</p>
              <div className="flex items-center gap-3 mt-1">
                {currentCaptain.rating && (
                  <span className="flex items-center gap-1 text-sm">
                    <svg className="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-ocean-300">{Number(currentCaptain.rating).toFixed(1)}</span>
                  </span>
                )}
                <span className="text-xs text-ocean-500">
                  {currentCaptain.boats_count} listings
                </span>
                <span className="text-xs text-ocean-500 capitalize">
                  {currentCaptain.source}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div>
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
                placeholder="Search partners by name..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full rounded-lg border border-ocean-700 bg-ocean-800 pl-9 pr-3 py-2 text-sm text-white placeholder-ocean-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 focus:outline-none"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-ocean-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {results.length > 0 && (
              <div className="mt-2 border border-ocean-700 rounded-lg overflow-hidden divide-y divide-ocean-800">
                {results.map((captain) => (
                  <button
                    key={captain.id}
                    onClick={() => assignCaptain(captain.id)}
                    disabled={assigning}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-ocean-800/50 transition-colors text-left"
                  >
                    {captain.avatar_url ? (
                      <img
                        src={captain.avatar_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-ocean-700 flex items-center justify-center text-ocean-400 text-xs font-bold">
                        {captain.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{captain.name}</p>
                      <p className="text-[10px] text-ocean-500">
                        {captain.rating ? `${Number(captain.rating).toFixed(1)} rating` : "No rating"}
                        {" · "}
                        {captain.boats_count} listings
                      </p>
                    </div>
                    <span className="text-xs text-amber-400">Assign</span>
                  </button>
                ))}
              </div>
            )}

            {search.length >= 2 && results.length === 0 && !searching && (
              <p className="mt-2 text-sm text-ocean-500 text-center py-2">
                No partners found
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
