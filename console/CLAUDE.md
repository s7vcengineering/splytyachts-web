# SPLYT Admin Dashboard

Operations console for the SPLYT yacht/experience splitting platform.
Deployed to Vercel as `splytpayments-console` at **console.splytpayments.com**.

## Tech Stack

- **Framework**: Next.js 15.1 + React 19 + TypeScript 5.7
- **Styling**: Tailwind CSS 3.4 with custom `ocean-*` color palette
- **Database**: Supabase (service-role client bypasses RLS for admin access)
- **Auth**: Cookie-based (`splyt-admin-auth`), login via email OTP
- **Payments**: Stripe (account: `acct_1T6v85HriFmLObhH` / "S7 Managed Reserves Fund")
- **Image Generation**: `@vercel/og` for social media marketing cards (edge runtime)

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          # Login page + form
│   ├── (dashboard)/
│   │   ├── layout.tsx         # Sidebar nav (mainNav + catalogNav)
│   │   ├── dashboard/         # Main dashboard
│   │   ├── fulfillment/       # Booking fulfillment pipeline (Kanban board)
│   │   ├── experiences/       # Experience list + detail + captain assign
│   │   ├── bookings/          # Booking list + detail + bulk retry
│   │   ├── crew/              # User management
│   │   ├── agent-logs/        # AI agent log viewer
│   │   ├── messages/          # Admin messaging (chat with users as SPLYT Admin)
│   │   ├── marketing/         # Social media availability card generator
│   │   ├── stripe/            # Live Stripe dashboard (balance, payments, customers)
│   │   ├── boats/             # Boat catalog (scraped from Boatsetter)
│   │   ├── captains/          # Captain directory
│   │   └── scraping/          # Scraping job status + discovery
│   ├── api/
│   │   ├── auth/              # login + logout
│   │   ├── fulfillment/       # Pipeline stage advancement
│   │   ├── experiences/       # Captain assignment
│   │   ├── bookings/          # Trigger + bulk retry
│   │   ├── captains/          # Search, detail, outreach, profile creation
│   │   ├── messages/          # Threads, send, users search
│   │   ├── marketing/card/    # OG image generation (edge)
│   │   ├── stripe/overview/   # Stripe data aggregation
│   │   ├── email-otp/         # OTP send + verify
│   │   └── users/             # User update
│   └── layout.tsx             # Root layout (Inter font, dark mode)
├── lib/
│   ├── supabase.ts            # Supabase client (anon + service-role)
│   └── utils.ts               # cn(), formatCurrency(), statusColor(), etc.
└── middleware.ts               # Auth check for protected routes
```

## Key Conventions

- **Server components** for data fetching (use `createServiceClient()` + `export const dynamic = "force-dynamic"`)
- **Client components** only for interactivity (marked with `"use client"`)
- **Status colors** use the pattern `bg-{color}-500/20 text-{color}-400`
- **Cards/panels** use `bg-ocean-900 rounded-xl border border-ocean-700`
- **All data** fetched via Supabase service client (bypasses RLS)

## Environment Variables

Required in Vercel (`splytpayments-console` project):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD` (currently "admin123")
- `STRIPE_SECRET_KEY` or `STRIPE_SECRET_KEY_PROD` (Stripe API reads both)
- `CRON_SECRET` (for scheduled jobs)

## Fulfillment Pipeline

The booking fulfillment pipeline tracks experiences through 5 stages:

1. **Deposits Collecting** — experience is open/filling, deposits coming in
2. **Ready to Book** — group is full, enough deposits, ready for operator outreach
3. **Outreach Sent** — SPLYT has contacted the charter operator
4. **Confirmed** — operator confirmed the booking
5. **Completed** — trip completed

Stages are derived from `experiences.status` + `experiences.booking_status`:
- `deposits_collecting`: status=open/filling, booking_status=null/pending
- `ready_to_book`: status=full, booking_status=pending
- `outreach_sent`: booking_status=in_progress
- `confirmed`: booking_status=booked/confirmed
- `completed`: status=completed

The `/api/fulfillment/advance` endpoint updates these fields to move experiences between stages.

## SPLYT Admin Identity

- Admin sender ID: `00000000-0000-0000-0000-000000000000`
- Avatar: `/public/splyt-admin-avatar.svg` (money network icon)
- Used for messaging users from the admin console

## Business Model Context

SPLYT is a **demand aggregator / marketplace platform** for luxury experiences:
- Scrapes Boatsetter for boat inventory (Phase 1: aggregator)
- Groups of users split the cost of charters
- SPLYT collects deposits into a single Stripe account (merchant of record)
- SPLYT books charters on behalf of groups (concierge model)
- Stripe Connect for direct operator payouts is NOT yet implemented (0 connected accounts)

Target markets: Miami, Fort Lauderdale, Tampa (FL), Las Vegas, NYC.
