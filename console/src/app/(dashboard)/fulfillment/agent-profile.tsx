"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface AgentInfo {
  name: string;
  codename: string;
  role: string;
  avatar: string;
  photo: string;
  color: string;
  phase: string;
  intro: string;
  personality: string;
  capabilities: string[];
  motto: string;
}

export const AGENTS: Record<string, AgentInfo> = {
  deposits_collecting: {
    name: "Marcus Cole",
    codename: "deposit-hustler",
    role: "Deposit Collection Specialist",
    avatar: "MC",
    photo: "/agents/marcus-cole.jpg",
    color: "bg-yellow-500",
    phase: "Phase 1",
    intro:
      "Marcus is the engine behind every split getting funded. He watches deposit progress like a hawk and knows exactly when to send the right nudge to get people across the line. His messages focus on the experience — the yacht, the sunset, the once-in-a-lifetime moment — never guilt trips.",
    personality:
      "Persuasive but never pushy. Marcus sells the dream, not the obligation. He's the friend who makes you feel like you'd be crazy to miss out.",
    capabilities: [
      "Sends 2x daily deposit nudges with experience-focused FOMO",
      "Tracks deposit velocity and flags stalling splits",
      "Generates scarcity alerts (\"only 2 spots left\")",
      "Escalates stale experiences for manual intervention",
    ],
    motto: "\"Every split starts with someone believing the trip is worth it.\"",
  },
  ready_to_book: {
    name: "Dominic Reyes",
    codename: "booking-executor",
    role: "Booking Execution Agent",
    avatar: "DR",
    photo: "/agents/dominic-reyes.jpg",
    color: "bg-cyan-500",
    phase: "Phase 1",
    intro:
      "Dominic is the precision operator. Once a split is fully funded, he takes the wheel. Using Playwright automation, he navigates booking platforms and locks in the reservation before availability slips away. Zero hesitation, zero errors.",
    personality:
      "Methodical and relentless. Dominic treats every booking like a mission — confirm the target, execute the plan, verify the outcome. He doesn't celebrate until the confirmation number is in hand.",
    capabilities: [
      "Automated Playwright-based booking execution",
      "Source URL detection to select the right booking flow",
      "Readiness checklist validation before execution",
      "Automatic retry with intelligent failure handling",
    ],
    motto: "\"Funded means booked. No delays, no excuses.\"",
  },
  outreach_sent: {
    name: "Rafael Santos",
    codename: "captain-liaison",
    role: "Captain & Operator Liaison",
    avatar: "RS",
    photo: "/agents/rafael-santos.jpg",
    color: "bg-purple-500",
    phase: "Phase 2",
    intro:
      "Rafael is the relationship builder. He speaks the language of charter operators — literally. Fluent in English, Spanish, and Portuguese, he handles captain outreach, negotiation, and follow-ups. When an operator ghosts, Rafael doesn't take it personally. He just follows up harder.",
    personality:
      "Warm but persistent. Rafael builds real rapport with operators while never losing sight of the timeline. He knows that a captain who trusts SPLYT books faster next time.",
    capabilities: [
      "Multilingual outreach (EN/ES/PT) via SMS and email",
      "Scheduled follow-up cadence with escalation",
      "Captain profile management and preference tracking",
      "Direct operator negotiation and availability confirmation",
    ],
    motto: "\"The best captains don't just work with us once — they come back.\"",
  },
  confirmed: {
    name: "Nathan Park",
    codename: "trip-coordinator",
    role: "Trip Coordination & Confirmation",
    avatar: "NP",
    photo: "/agents/nathan-park.jpg",
    color: "bg-green-500",
    phase: "Phase 2",
    intro:
      "Nathan is the calm before the storm — in the best way. Once a booking is confirmed, he makes sure everyone knows where to be, when to be there, and what to expect. He handles Stripe payment captures, sends confirmation details to the crew, and runs day-of logistics.",
    personality:
      "Organized and reassuring. Nathan is the voice that makes a group of strangers feel like they're about to have the best day of their lives. His messages are clear, excited, and leave zero room for confusion.",
    capabilities: [
      "Sends confirmation details to all crew members",
      "Triggers Stripe payment capture at the right moment",
      "Day-of reminders with location, time, and logistics",
      "Weather and condition alerts for water experiences",
    ],
    motto: "\"A confirmed booking is a promise. I make sure we keep it.\"",
  },
  completed: {
    name: "Victor Chen",
    codename: "invoice-closer",
    role: "Post-Trip & Revenue Operations",
    avatar: "VC",
    photo: "/agents/victor-chen.jpg",
    color: "bg-emerald-500",
    phase: "Phase 3",
    intro:
      "Victor closes the loop. After the trip, he handles the business side — generating invoices, processing captain payouts, prompting reviews, and making sure the financials are airtight. He also plants the seed for the next booking, because the best customer is a returning one.",
    personality:
      "Professional and forward-thinking. Victor wraps up every trip cleanly while already thinking about what's next. He turns one great experience into a lifetime of bookings.",
    capabilities: [
      "Automated invoice generation and distribution",
      "Captain payout processing via Stripe",
      "Review and rating prompts to crew members",
      "Rebooking suggestions based on trip history",
    ],
    motto: "\"The trip ends. The relationship doesn't.\"",
  },
};

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
