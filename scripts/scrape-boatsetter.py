#!/usr/bin/env python3
"""
Scrape Boatsetter boat listings and upsert into Supabase.

How it works:
  Two discovery methods are available:

  A) SEARCH API (--search, default for price-filtered queries):
     Calls /domestic/v2/search on www.boatsetter.com — an unauthenticated
     JSON API that returns boat IDs matching geographic/price filters.
     Supports up to 100 results per page with pagination.

  B) BROWSE PAGES (--browse):
     Fetches server-rendered HTML pages to extract /boats/{id} links:
       - /boat-rentals/{city}--{state}--united-states  (general boats)
       - /yacht-rentals/{city}--{state}--united-states  (yachts)
     Good for getting a curated set without price filters.

  Then for each discovered listing ID:
  1. Fetches the individual listing page at /boats/{id}
  2. Extracts full data from __NEXT_DATA__ script tag:
       props.pageProps.dehydratedState.queries[0].state.data
     (React Query / TanStack Query hydration format)
  3. Maps fields to the Supabase `boats` table schema
  4. Upserts using boatsetter_listing_id as conflict key (idempotent)

Usage:
  # Set environment variables
  export SUPABASE_URL="https://your-project.supabase.co"
  export SUPABASE_SERVICE_KEY="your-service-role-key"

  # Search for Miami boats $900+ (uses search API)
  python3 scripts/scrape-boatsetter.py --price-min 900

  # Search with custom bounds and date
  python3 scripts/scrape-boatsetter.py --price-min 900 --trip-date 2026-03-14

  # Browse mode (no price filter, uses HTML pages)
  python3 scripts/scrape-boatsetter.py --browse

  # Scrape a specific city
  python3 scripts/scrape-boatsetter.py --city "fort-lauderdale" --state "fl"

  # Scrape specific listing IDs directly
  python3 scripts/scrape-boatsetter.py --ids mxnsvgd lxzgskm bgndftc

  # Dry run (scrape but don't write to database)
  python3 scripts/scrape-boatsetter.py --dry-run

Requirements:
  - Python 3.7+ (stdlib only, no pip packages needed)
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

BOATSETTER_BASE = "https://www.boatsetter.com"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch(url):
    """Fetch a URL and return the response body as a string."""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8")


def discover_listing_ids(city="miami", state="fl"):
    """Fetch browse pages for a city and extract all unique boat listing IDs.

    Checks both /boat-rentals/ and /yacht-rentals/ pages since they surface
    different listings. The city slug format is: {city}--{state}--united-states
    """
    slug = f"{city}--{state}--united-states"
    all_ids = set()

    for page_type in ("boat-rentals", "yacht-rentals"):
        url = f"{BOATSETTER_BASE}/{page_type}/{slug}"
        print(f"  Fetching {page_type} page: {url}")
        try:
            html = fetch(url)
            ids = set(re.findall(r'/boats/([a-z0-9]{3,10})', html, re.IGNORECASE))
            print(f"    Found {len(ids)} listing IDs")
            all_ids.update(ids)
        except urllib.error.HTTPError as e:
            print(f"    HTTP {e.code} — skipping")
        except Exception as e:
            print(f"    Error: {e}")

    return sorted(all_ids)


# Miami bounding box defaults (covers Miami Beach, Downtown, Coconut Grove, etc.)
MIAMI_BOUNDS = {
    "ne_lat": "25.89203760360262",
    "ne_lng": "-80.06922397685548",
    "sw_lat": "25.668211956153495",
    "sw_lng": "-80.27933750224611",
}


def search_listing_ids(city="Miami, FL, USA", price_min=None, price_max=None,
                       trip_date=None, per_page=100, bounds=None):
    """Use the /domestic/v2/search API to find boat listing IDs.

    This is the same API the Boatsetter search page calls client-side.
    It works without authentication and returns up to 100 results per page.
    Supports geographic bounds, price filters, and date filters.
    """
    params = {
        "near": city,
        "zoom_level": "12",
        "per_page": str(per_page),
        "page": "1",
        "sort_by": "recommended",
        "include_experience_tags": "true",
    }

    if bounds:
        params.update(bounds)
    else:
        params.update(MIAMI_BOUNDS)

    if price_min:
        params["price_min"] = str(price_min)
    if price_max:
        params["price_max"] = str(price_max)
    if trip_date:
        params["trip_date"] = trip_date

    all_ids = []
    page = 1

    while True:
        params["page"] = str(page)
        qs = urllib.parse.urlencode(params)
        url = f"{BOATSETTER_BASE}/domestic/v2/search?{qs}"
        print(f"  Search API page {page}: {url[:100]}...")

        try:
            req = urllib.request.Request(url, headers={**HEADERS, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"    Error: {e}")
            break

        boats = data.get("data", [])
        meta = data.get("meta", {})
        ids = [b["boat_public_id"] for b in boats if "boat_public_id" in b]
        all_ids.extend(ids)

        total = meta.get("total_count", len(ids))
        total_pages = meta.get("total_pages", 1)
        print(f"    Got {len(ids)} boats (page {page}/{total_pages}, total: {total})")

        if page >= total_pages:
            break
        page += 1
        time.sleep(0.5)

    return list(dict.fromkeys(all_ids))  # dedupe preserving order


def extract_listing(listing_id):
    """Fetch a listing page and extract data from __NEXT_DATA__.

    The data is in a React Query dehydrated state format:
      __NEXT_DATA__.props.pageProps.dehydratedState.queries[0].state.data

    Key field mappings from Boatsetter -> our schema:
      listing_tagline -> name
      packages[0].half_day_cents / all_day_cents -> pricing_tiers, hourly_rate
      capacity -> capacity
      photos[].large.url -> photo_urls
      location.{lat,lng,city,state} -> lat, lng, city, region
      primary_manager -> captain_name, captain_avatar_url, captain_rating
      boat_category -> type
      features[].name -> amenities
    """
    url = f"{BOATSETTER_BASE}/boats/{listing_id}"
    html = fetch(url)

    script_match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html, re.DOTALL
    )
    if not script_match:
        return None

    next_data = json.loads(script_match.group(1))
    page_props = next_data.get("props", {}).get("pageProps", {})

    dehydrated = page_props.get("dehydratedState", {})
    queries = dehydrated.get("queries", [])
    if not queries:
        return None

    listing = queries[0].get("state", {}).get("data")
    if not listing:
        return None

    name = listing.get("listing_tagline") or listing.get("make_and_model") or "Unknown"

    # --- Pricing ---
    packages = listing.get("packages") or []
    pkg = packages[0] if packages else {}

    pricing_tiers = []
    tier_map = {
        "two_hour_price_cents": 2,
        "three_hour_price_cents": 3,
        "half_day_cents": 4,
        "six_hour_price_cents": 6,
        "all_day_cents": 8,
    }
    captain_fee_map = {
        2: "two_hours_captain_fee",
        3: "three_hours_captain_fee",
        4: "half_day_captain_fee",
        6: "six_hours_captain_fee",
        8: "full_day_captain_fee",
    }
    for field, hours in tier_map.items():
        cents = pkg.get(field)
        if cents and cents > 0:
            captain_fee = 0
            if pkg.get("include_captain_price") and pkg.get("captain_fee_type") == "separate":
                captain_fee = pkg.get(captain_fee_map.get(hours, ""), 0) or 0
            total_cents = cents + captain_fee
            pricing_tiers.append({"hours": hours, "price": total_cents / 100})

    hourly_rate = 0
    all_day = pkg.get("all_day_cents") or 0
    half_day = pkg.get("half_day_cents") or 0
    primary_rate = listing.get("primary_rate") or 0
    if all_day > 0:
        hourly_rate = all_day / 100 / 8
    elif half_day > 0:
        hourly_rate = half_day / 100 / 4
    elif primary_rate > 0:
        hourly_rate = primary_rate / 100 / 8

    # --- Basic info ---
    capacity = listing.get("capacity") or listing.get("passenger_capacity") or 0

    photos = []
    for photo in (listing.get("photos") or []):
        if isinstance(photo, dict):
            large = photo.get("large", {})
            u = large.get("url") if isinstance(large, dict) else None
            if not u:
                orig = photo.get("original", {})
                u = orig.get("url") if isinstance(orig, dict) else None
            if u:
                photos.append(u)

    # --- Boat type ---
    raw_type = (listing.get("boat_category") or listing.get("type") or "").lower()
    boat_type = "other"
    for kw, tp in [("yacht", "yacht"), ("motor", "yacht"), ("sail", "sailboat"),
                    ("catamaran", "catamaran"), ("pontoon", "pontoon"),
                    ("fish", "fishing"), ("speed", "speedboat"),
                    ("center_console", "fishing")]:
        if kw in raw_type or kw in name.lower():
            boat_type = tp
            break

    # --- Location ---
    loc = listing.get("location") or {}
    lat = loc.get("lat") or loc.get("owner_pin_latitude")
    lng = loc.get("lng") or loc.get("owner_pin_longitude")
    city = loc.get("city") or "Unknown"
    region = loc.get("state") or ""

    # --- Captain ---
    captain = listing.get("primary_manager") or {}
    captain_name = None
    captain_avatar = None
    captain_rating_val = None
    if isinstance(captain, dict):
        first = captain.get("first_name", "")
        last = captain.get("last_name", "")
        captain_name = f"{first} {last}".strip() or None
        pic = captain.get("picture_large") or captain.get("picture") or {}
        captain_avatar = pic.get("url") if isinstance(pic, dict) else None
        captain_rating_val = captain.get("rating")

    captain_option = listing.get("captain_option") or ""
    captain_included = captain_option in ("captain_only",)
    captain_optional = captain_option in ("captain_optional", "owner_or_captain_network")
    fuel_policy = pkg.get("fuel_policy", "")
    fuel_included = fuel_policy == "owner_pays"
    service_type = "captained" if captain_included else ("bareboat_optional" if captain_optional else "bareboat")

    # --- Features ---
    amenities = []
    for f in (listing.get("features") or []):
        if isinstance(f, dict) and f.get("name"):
            amenities.append(f["name"])
        elif isinstance(f, str):
            amenities.append(f)

    # --- Start times ---
    start_times_raw = listing.get("start_times") or {}
    all_times = set()
    for day_times in start_times_raw.values():
        if isinstance(day_times, list):
            all_times.update(day_times)

    durations = [t["hours"] for t in pricing_tiers]

    return {
        "boatsetter_listing_id": listing_id,
        "boatsetter_slug": listing_id,
        "name": name,
        "source_provider": "boatsetter",
        "source_url": f"{BOATSETTER_BASE}/boats/{listing_id}",
        "type": boat_type,
        "length_ft": listing.get("length"),
        "capacity": capacity,
        "year": listing.get("year_manufactured"),
        "make": listing.get("make"),
        "model": listing.get("model"),
        "location": loc.get("full_address") or f"{city}, {region}",
        "description": (listing.get("listing_description") or "")[:2000] or None,
        "photo_urls": photos[:20],
        "hourly_rate": round(hourly_rate, 2),
        "pricing_tiers": pricing_tiers,
        "min_duration_hours": min(durations) if durations else 4,
        "max_duration_hours": max(durations) if durations else 8,
        "available_start_times": sorted(all_times),
        "captain_included": captain_included,
        "captain_optional": captain_optional,
        "fuel_included": fuel_included,
        "service_type": service_type,
        "amenities": amenities,
        "features": [],
        "review_count": listing.get("review_count") or 0,
        "rating": float(listing.get("rating")) if listing.get("rating") else None,
        "captain_name": captain_name,
        "captain_avatar_url": captain_avatar,
        "captain_rating": float(captain_rating_val) if captain_rating_val else None,
        "lat": float(lat) if lat else None,
        "lng": float(lng) if lng else None,
        "city": city,
        "region": region,
        "is_active": True,
        "scrape_status": "scraped",
    }


def upsert_boat(boat_data, supabase_url, supabase_key):
    """Upsert a boat into Supabase using boatsetter_listing_id as conflict key."""
    clean = {k: v for k, v in boat_data.items() if v is not None}
    for k in ("photo_urls", "pricing_tiers", "amenities", "features", "available_start_times"):
        if k not in clean:
            clean[k] = []

    data = json.dumps(clean).encode("utf-8")
    req = urllib.request.Request(
        f"{supabase_url}/rest/v1/boats?on_conflict=boatsetter_listing_id",
        data=data,
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  DB ERROR {e.code}: {body[:300]}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Scrape Boatsetter listings into Supabase")
    parser.add_argument("--city", default="miami", help="City slug for browse or search name (default: miami)")
    parser.add_argument("--state", default="fl", help="State abbreviation (default: fl)")
    parser.add_argument("--ids", nargs="+", help="Scrape specific listing IDs directly")
    parser.add_argument("--browse", action="store_true", help="Use browse pages instead of search API")
    parser.add_argument("--price-min", type=int, help="Minimum price filter (for search API)")
    parser.add_argument("--price-max", type=int, help="Maximum price filter (for search API)")
    parser.add_argument("--trip-date", help="Trip date YYYY-MM-DD (for search API)")
    parser.add_argument("--dry-run", action="store_true", help="Scrape but don't write to database")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests in seconds")
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")

    if not args.dry_run and (not supabase_url or not supabase_key):
        print("Error: Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables")
        print("  Or use --dry-run to scrape without writing to database")
        sys.exit(1)

    # Discover or use provided IDs
    if args.ids:
        listing_ids = args.ids
        print(f"Using {len(listing_ids)} provided listing IDs")
    elif args.browse:
        print(f"Browsing listings for {args.city}, {args.state.upper()}...")
        listing_ids = discover_listing_ids(args.city, args.state)
    else:
        city_name = f"{args.city.replace('-', ' ').title()}, {args.state.upper()}, USA"
        print(f"Searching for listings in {city_name}...")
        listing_ids = search_listing_ids(
            city=city_name,
            price_min=args.price_min,
            price_max=args.price_max,
            trip_date=args.trip_date,
        )

    if not listing_ids:
        print("No listings found!")
        sys.exit(1)

    print(f"\nScraping {len(listing_ids)} listings...")
    boats = []
    for i, lid in enumerate(listing_ids):
        print(f"[{i+1}/{len(listing_ids)}] /boats/{lid}...", end=" ")
        try:
            boat = extract_listing(lid)
            if boat:
                boats.append(boat)
                print(f"${boat['hourly_rate']}/hr | {boat['capacity']} pax | {boat['name'][:50]}")
            else:
                print("SKIP (no data)")
        except Exception as e:
            print(f"ERROR: {e}")
        if i < len(listing_ids) - 1:
            time.sleep(args.delay)

    print(f"\n{'='*60}")
    print(f"Extracted {len(boats)} boats")

    boats.sort(key=lambda b: b.get("hourly_rate") or 0, reverse=True)
    print("\nBy hourly rate:")
    for b in boats:
        print(f"  ${b['hourly_rate']:>8}/hr | {b['capacity']:>3} pax | {b['type']:<10} | {b['name'][:45]}")

    if args.dry_run:
        print("\n[DRY RUN] Skipping database upsert")
        return

    print(f"\nUpserting {len(boats)} boats to Supabase...")
    ok = 0
    for boat in boats:
        if upsert_boat(boat, supabase_url, supabase_key):
            ok += 1
        else:
            print(f"  FAILED: {boat['name'][:50]}")

    print(f"\nDone! {ok}/{len(boats)} upserted successfully.")


if __name__ == "__main__":
    main()
