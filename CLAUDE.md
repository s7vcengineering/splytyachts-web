# splytpayments-web

SPLYT landing page, API functions, and data scrapers. Deployed on Vercel at splytpayments.com.

## What this repo is

This is the public-facing web presence + backend automation for SPLYT — a mobile app that lets groups split the cost of yacht charters (and exotic cars, mansions). It is NOT the mobile app itself (that's in `split-mobile-app`).

### Three main pieces:

1. **Landing pages** (`public/`) — Static HTML for splytpayments.com: home, download, experience deep links, invite pages, privacy/terms
2. **Serverless API** (`api/`) — Vercel Edge Functions:
   - `api/card/experience.tsx` — OG image generator for social media cards (Instagram feed/story/square formats, 1080px). Uses `@vercel/og` ImageResponse
   - `api/post-daily.ts` — Daily Instagram auto-poster (Vercel cron, 3:15 PM UTC). Picks best unposted boat, generates card, publishes via s7vc-social-marketing service
   - `api/stripe/overview.ts` — Stripe revenue dashboard data
3. **Scrapers** (`scripts/`) — Python scripts that populate the Supabase database:
   - `scrape-boatsetter.py` — Boatsetter.com yacht listings
   - `scrape-mvpmiami.py` — MVP Miami exotic cars, mansions, yachts

## Tech stack

- **Hosting:** Vercel (static + serverless)
- **API runtime:** Vercel Edge Functions (Node.js)
- **Image generation:** `@vercel/og` (satori + resvg-js)
- **Database:** Supabase (shared with split-mobile-app)
- **Scrapers:** Python 3.12, stdlib only (no pip dependencies)

## Scrapers

### Boatsetter (`scripts/scrape-boatsetter.py`)
- **Schedule:** Every 6 hours via GitHub Actions (`.github/workflows/scrape-boatsetter.yml`)
- **Source:** Boatsetter.com search API + browse pages
- **Cities:** Miami, Fort Lauderdale, Key West, Naples, LA, San Diego, Ibiza
- **Table:** `boats` (upserts on `boatsetter_listing_id`)
- **Features:** Field-level change tracking, stale boat deactivation (--all-cities mode), Slack notifications, audit log to `scrape_logs`
- **Usage:** `python3 scripts/scrape-boatsetter.py --all-cities` or `--city miami` or `--ids abc123`

### MVP Miami (`scripts/scrape-mvpmiami.py`)
- **Schedule:** Daily at 5 AM UTC via GitHub Actions (`.github/workflows/scrape-mvpmiami.yml`)
- **Source:** mvpmiami.com sitemap + detail pages
- **Tables:** `exotic_cars`, `mansions`, `mvp_yachts` (upserts on `source_provider` + `source_listing_id`)
- **Features:** Filters out site logos from photos, Slack notifications
- **Usage:** `python3 scripts/scrape-mvpmiami.py --type all` or `--type cars` or `--type mansions` or `--type yachts`

### Both scrapers require these env vars:
```
SUPABASE_URL=https://msiljtrmujznyuocytzq.supabase.co
SUPABASE_SERVICE_KEY=<service role key>
SLACK_BOT_TOKEN=<optional, for notifications>
```

## Vercel config

- `vercel.json` defines URL rewrites (e.g., `/invite/:code` → `invite.html`), cron jobs, and cache headers
- Deep links: `/invite/:code` and `/experience/:id` serve HTML that redirects to the mobile app via Universal Links / App Links
- App association files served at `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`

## Database tables this repo writes to

| Table | Source | Key |
|-------|--------|-----|
| `boats` | Boatsetter scraper | `boatsetter_listing_id` |
| `exotic_cars` | MVP Miami scraper | `source_provider` + `source_listing_id` |
| `mansions` | MVP Miami scraper | `source_provider` + `source_listing_id` |
| `mvp_yachts` | MVP Miami scraper | `source_provider` + `source_listing_id` |
| `social_posts_log` | Daily Instagram poster | — |

## GitHub Actions secrets needed

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SLACK_BOT_TOKEN` (optional)

## Related repos

- **split-mobile-app** — Flutter mobile app, admin dashboard (Next.js on port 3200), Supabase Edge Functions, booking agent microservice
