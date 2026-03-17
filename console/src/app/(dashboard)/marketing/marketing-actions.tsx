"use client";

import { useState } from "react";

interface Props {
  cardUrl: string;
  title: string;
  experienceId: string;
}

export function MarketingActions({ cardUrl, title, experienceId }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function downloadCard(format: string) {
    setDownloading(true);
    try {
      const url = cardUrl + `&format=${format}`;
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 30);
      a.download = `splyt-${slug}-${format}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }

  function copyLink() {
    const fullUrl = window.location.origin + cardUrl;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <button
        onClick={() => downloadCard("feed")}
        disabled={downloading}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
      >
        {downloading ? "..." : "Feed (4:5)"}
      </button>
      <button
        onClick={() => downloadCard("story")}
        disabled={downloading}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
      >
        Story (9:16)
      </button>
      <button
        onClick={() => downloadCard("square")}
        disabled={downloading}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50"
      >
        Square (1:1)
      </button>
      <button
        onClick={copyLink}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-ocean-800 text-ocean-300 hover:bg-ocean-700 transition-colors"
      >
        {copied ? "Copied!" : "Copy URL"}
      </button>
    </div>
  );
}
