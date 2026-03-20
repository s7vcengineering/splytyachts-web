"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AGENTS } from "@/lib/agents";

export { AGENTS };

export function AgentProfile({ stage }: { stage: string }) {
  const [expanded, setExpanded] = useState(false);
  const agent = AGENTS[stage];
  if (!agent) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left",
          expanded
            ? "bg-ocean-800 border border-ocean-600"
            : "bg-ocean-800/50 hover:bg-ocean-800 border border-transparent",
        )}
      >
        <img
          src={agent.photo}
          alt={agent.name}
          className="w-7 h-7 rounded-full object-cover shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white truncate">
            {agent.name}
          </p>
          <p className="text-[10px] text-ocean-400 truncate">{agent.role}</p>
        </div>
        <svg
          className={cn(
            "w-3.5 h-3.5 text-ocean-500 transition-transform shrink-0",
            expanded && "rotate-180",
          )}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {expanded && (
        <div className="mt-2 px-3 py-3 bg-ocean-800/30 rounded-lg border border-ocean-700 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-semibold text-white",
                agent.color,
              )}
            >
              {agent.codename}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-ocean-700 text-ocean-300">
              {agent.phase}
            </span>
          </div>

          {/* Contact */}
          <div className="flex items-center gap-3 text-[10px] text-ocean-400">
            <span>{agent.email}</span>
          </div>

          {/* Intro */}
          <p className="text-xs text-ocean-300 leading-relaxed">
            {agent.intro}
          </p>

          {/* Personality */}
          <div>
            <p className="text-[10px] font-semibold text-ocean-400 uppercase tracking-wider mb-1">
              Personality
            </p>
            <p className="text-xs text-ocean-300 leading-relaxed">
              {agent.personality}
            </p>
          </div>

          {/* Capabilities */}
          <div>
            <p className="text-[10px] font-semibold text-ocean-400 uppercase tracking-wider mb-1.5">
              Capabilities
            </p>
            <ul className="space-y-1">
              {agent.capabilities.map((cap, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-[11px] text-ocean-300"
                >
                  <span className={cn("mt-1 w-1.5 h-1.5 rounded-full shrink-0", agent.color)} />
                  {cap}
                </li>
              ))}
            </ul>
          </div>

          {/* Motto */}
          <p className="text-xs text-ocean-500 italic border-t border-ocean-700 pt-2">
            {agent.motto}
          </p>
        </div>
      )}
    </div>
  );
}
