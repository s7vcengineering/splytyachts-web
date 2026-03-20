export interface AgentInfo {
  name: string;
  codename: string;
  role: string;
  avatar: string;
  photo: string;
  senderId: string;
  email: string;
  color: string;
  phase: string;
  intro: string;
  personality: string;
  capabilities: string[];
  motto: string;
  stageMessage: string;
}

export const AGENTS: Record<string, AgentInfo> = {
  deposits_collecting: {
    name: "Marcus Cole",
    codename: "deposit-hustler",
    role: "Deposit Collection Specialist",
    avatar: "MC",
    photo: "/agents/marcus-cole.jpg",
    senderId: "00000000-0000-0000-0001-000000000001",
    email: "marcus.cole@splytpayments.com",
    color: "bg-yellow-500",
    phase: "Phase 1",
    intro:
      "Marcus is the engine behind every split getting funded. He watches deposit progress like a hawk and knows exactly when to send the right nudge to get people across the line. His messages focus on the experience — the yacht, the sunset, the once-in-a-lifetime moment — never guilt trips.",
    personality:
      "Persuasive but never pushy. Marcus sells the dream, not the obligation. He's the friend who makes you feel like you'd be crazy to miss out.",
    capabilities: [
      'Sends 2x daily deposit nudges with experience-focused FOMO',
      "Tracks deposit velocity and flags stalling splits",
      'Generates scarcity alerts ("only 2 spots left")',
      "Escalates stale experiences for manual intervention",
    ],
    motto: '"Every split starts with someone believing the trip is worth it."',
    stageMessage:
      "Hey crew! I'm Marcus, your deposit specialist at SPLYT. I'm now tracking the deposits for {title} on {date}. I'll keep the group updated as deposits come in — let's make this happen!",
  },
  ready_to_book: {
    name: "Dominic Reyes",
    codename: "booking-executor",
    role: "Booking Execution Agent",
    avatar: "DR",
    photo: "/agents/dominic-reyes.jpg",
    senderId: "00000000-0000-0000-0001-000000000002",
    email: "dominic.reyes@splytpayments.com",
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
    motto: '"Funded means booked. No delays, no excuses."',
    stageMessage:
      "All deposits are in for {title}! I'm Dominic, your booking executor. I'm locking in the reservation now — no delays. Stand by for your confirmation number.",
  },
  outreach_sent: {
    name: "Rafael Santos",
    codename: "captain-liaison",
    role: "Captain & Operator Liaison",
    avatar: "RS",
    photo: "/agents/rafael-santos.jpg",
    senderId: "00000000-0000-0000-0001-000000000003",
    email: "rafael.santos@splytpayments.com",
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
    motto: '"The best captains don\'t just work with us once — they come back."',
    stageMessage:
      "Hey everyone, Rafael here. I've reached out to the charter operator for {title}. I'll keep you posted as I confirm availability and finalize the details with the captain.",
  },
  confirmed: {
    name: "Nathan Park",
    codename: "trip-coordinator",
    role: "Trip Coordination & Confirmation",
    avatar: "NP",
    photo: "/agents/nathan-park.jpg",
    senderId: "00000000-0000-0000-0001-000000000004",
    email: "nathan.park@splytpayments.com",
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
    motto: '"A confirmed booking is a promise. I make sure we keep it."',
    stageMessage:
      "Great news, crew! Nathan here — your booking for {title} on {date} is officially confirmed! I'll be sending you all the trip details, meeting point, and logistics shortly. Get ready!",
  },
  completed: {
    name: "Victor Chen",
    codename: "invoice-closer",
    role: "Post-Trip & Revenue Operations",
    avatar: "VC",
    photo: "/agents/victor-chen.jpg",
    senderId: "00000000-0000-0000-0001-000000000005",
    email: "victor.chen@splytpayments.com",
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
    motto: '"The trip ends. The relationship doesn\'t."',
    stageMessage:
      "What a trip! Victor here — I'm wrapping up the post-trip details for {title}. Invoices and review requests are on the way. Thanks for splytting with us!",
  },
};

/** Get the agent assigned to a pipeline stage */
export function getAgentForStage(stage: string): AgentInfo | null {
  return AGENTS[stage] ?? null;
}

/** Format a stage message with experience details */
export function formatAgentMessage(
  stage: string,
  experience: { title: string; date?: string },
): string | null {
  const agent = AGENTS[stage];
  if (!agent) return null;

  return agent.stageMessage
    .replace("{title}", experience.title)
    .replace("{date}", experience.date ?? "TBD");
}
