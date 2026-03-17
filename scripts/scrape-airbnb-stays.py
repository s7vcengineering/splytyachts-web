#!/usr/bin/env python3
"""
Scrape Airbnb Stays (rental listings) and upsert into Supabase.

Targets the top 100 luxury/high-end Airbnbs in SPLYT's supported cities.

How it works:
  1. Fetches search results pages for configured cities
  2. Extracts JSON data from <script id="data-deferred-state-0"> tag
  3. Parses listing data (title, price, bedrooms, rating, images, etc.)
  4. Handles pagination via cursor-based offsets
  5. Upserts into Supabase `airbnb_stays` table

Usage:
  export SUPABASE_URL="https://your-project.supabase.co"
  export SUPABASE_SERVICE_KEY="your-service-role-key"

  # Scrape all configured cities
  python3 scripts/scrape-airbnb-stays.py --all-cities

  # Scrape a specific city
  python3 scripts/scrape-airbnb-stays.py --city miami

  # Dry run (scrape but don't write to database)
  python3 scripts/scrape-airbnb-stays.py --all-cities --dry-run

  # Limit results per city (default: 100)
  python3 scripts/scrape-airbnb-stays.py --all-cities --limit 50

Requirements:
  - Python 3.7+ (stdlib only, no pip packages needed)
"""

import argparse
import base64
import datetime
import json
import logging
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

log = logging.getLogger("airbnb-stays-scraper")
log.setLevel(logging.DEBUG)

_console = logging.StreamHandler(sys.stderr)
_console.setLevel(logging.INFO)
_console.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT))
log.addHandler(_console)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SOURCE_PROVIDER = "airbnb"
BASE_URL = "https://www.airbnb.com"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
}

REQUEST_DELAY = 3.0  # seconds between requests (be respectful)
DEFAULT_LIMIT = 100  # top 100 per city

# City configurations: slug -> (display_name, region, country_code, place_id)
CITIES = {
    "miami": ("Miami", "FL", "US", "ChIJEcHIDqKw2YgRZU-t3XHylv8"),
    "fort-lauderdale": ("Fort Lauderdale", "FL", "US", "ChIJs_Jx2s-r2YgR0sS5ooQ3j4o"),
    "tampa": ("Tampa", "FL", "US", "ChIJ4dG5s4Ew4IgRIxkHqlkBZ7I"),
    "new-york": ("New York", "NY", "US", "ChIJOwg_06VPwokRYv534QaPC8g"),
    "los-angeles": ("Los Angeles", "CA", "US", "ChIJE9on3F3HwoAR9AhGJW_fL-I"),
    "san-diego": ("San Diego", "CA", "US", "ChIJSx6SrQ9T2YARed8V_f0hOg0"),
    "san-francisco": ("San Francisco", "CA", "US", "ChIJIQBpAG2ahYAR_6128GcTUEo"),
    "las-vegas": ("Las Vegas", "NV", "US", "ChIJ0X31pIK3voARo3mz1ebVzDo"),
}


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def fetch_page(url):
    """Fetch a URL and return the response body as text."""
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        log.warning("HTTP %d fetching %s", e.code, url)
        return None
    except Exception as e:
        log.warning("Error fetching %s: %s", url, e)
        return None


# ---------------------------------------------------------------------------
# Airbnb search URL builder
# ---------------------------------------------------------------------------

def build_search_url(city_slug, items_offset=0):
    """Build an Airbnb Stays search URL for a city, sorted by rating."""
    city_info = CITIES.get(city_slug)
    if not city_info:
        raise ValueError(f"Unknown city: {city_slug}")

    display_name, region, country_code, place_id = city_info

    name_slug = display_name.replace(" ", "-")
    location_slug = f"{name_slug}--{region}--United-States"
    query = f"{display_name}, {region}"

    params = {
        "tab_id": "home_tab",
        "refinement_paths[]": "/homes",
        "query": query,
        "place_id": place_id,
        "price_filter_num_nights": "1",
    }

    if items_offset > 0:
        cursor_data = {"section_offset": 3, "items_offset": items_offset, "version": 1}
        cursor = base64.b64encode(json.dumps(cursor_data).encode()).decode()
        params["cursor"] = cursor

    query_string = urllib.parse.urlencode(params, doseq=True)
    return f"{BASE_URL}/s/{location_slug}/homes?{query_string}"


# ---------------------------------------------------------------------------
# JSON extraction from search page
# ---------------------------------------------------------------------------

def extract_deferred_state(html_content):
    """Extract JSON data from the data-deferred-state-0 script tag."""
    pattern = r'<script[^>]*id="data-deferred-state-0"[^>]*type="application/json"[^>]*>(.*?)</script>'
    match = re.search(pattern, html_content, re.DOTALL)
    if not match:
        pattern = r'<script[^>]*type="application/json"[^>]*id="data-deferred-state-0"[^>]*>(.*?)</script>'
        match = re.search(pattern, html_content, re.DOTALL)

    if not match:
        log.warning("Could not find data-deferred-state-0 script tag")
        return None

    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError as e:
        log.error("Failed to parse deferred state JSON: %s", e)
        return None


def find_search_results(deferred_state):
    """Navigate the nested JSON structure to find stay search results."""
    if not deferred_state:
        return [], None

    niobe_data = deferred_state.get("niobeClientData", [])

    for entry in niobe_data:
        if not isinstance(entry, list) or len(entry) < 2:
            continue

        value = entry[1] if isinstance(entry[1], dict) else {}
        data = value.get("data", {})

        # Try different paths the search results might be at
        presentation = data.get("presentation", {})

        # Stays search uses staysSearch or explore.sections
        search_data = (
            presentation.get("staysSearch", {}).get("results", {})
            or presentation.get("explore", {}).get("sections", {})
        )

        if not search_data:
            continue

        search_results = search_data.get("searchResults", [])
        if search_results:
            pagination = search_data.get("paginationInfo", {})
            next_cursor = pagination.get("nextPageCursor")
            return search_results, next_cursor

    # Fallback: search recursively for searchResults
    results = _find_key_recursive(deferred_state, "searchResults")
    if results and isinstance(results, list):
        return results, None

    return [], None


def _find_key_recursive(obj, target_key, max_depth=10):
    """Recursively search for a key in nested dict/list structures."""
    if max_depth <= 0:
        return None

    if isinstance(obj, dict):
        if target_key in obj:
            val = obj[target_key]
            if isinstance(val, list) and len(val) > 0:
                return val
        for v in obj.values():
            result = _find_key_recursive(v, target_key, max_depth - 1)
            if result:
                return result
    elif isinstance(obj, list):
        for item in obj:
            result = _find_key_recursive(item, target_key, max_depth - 1)
            if result:
                return result

    return None


# ---------------------------------------------------------------------------
# Listing parser
# ---------------------------------------------------------------------------

def parse_listing(result, city_slug):
    """Parse a single stay search result into our schema."""
    city_info = CITIES.get(city_slug, ("Unknown", "??", "US", ""))
    display_name, region, country_code, _ = city_info

    listing = result.get("listing", {})
    if not listing:
        return None

    listing_id = listing.get("id")
    if not listing_id:
        return None

    data = {
        "source_provider": SOURCE_PROVIDER,
        "source_listing_id": str(listing_id),
        "source_url": f"{BASE_URL}/rooms/{listing_id}",
        "city": display_name,
        "region": region,
        "country": "United States",
        "is_active": True,
        "scrape_status": "scraped",
        "last_scraped_at": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    # Title
    data["title"] = listing.get("name", listing.get("title", f"Listing {listing_id}"))

    # Property type
    room_type = listing.get("roomTypeCategory", "")
    if room_type:
        data["property_type"] = room_type

    # Also check for structured content
    struct_content = listing.get("structuredContent", {})
    if struct_content:
        primary_line = struct_content.get("primaryLine", {})
        if primary_line:
            bodies = primary_line.get("body", [])
            for body in bodies:
                text = body if isinstance(body, str) else body.get("text", "") if isinstance(body, dict) else ""
                if text:
                    data["property_type"] = text
                    break

    # Location / neighborhood
    neighborhood = listing.get("neighborhood", {})
    if isinstance(neighborhood, dict):
        data["neighborhood"] = neighborhood.get("name", "")
    elif isinstance(neighborhood, str):
        data["neighborhood"] = neighborhood

    city_name = listing.get("city", "")
    if city_name:
        data["city"] = city_name

    # Coordinates
    coordinate = listing.get("coordinate", {})
    if coordinate:
        lat = coordinate.get("latitude")
        lng = coordinate.get("longitude")
        if lat:
            data["latitude"] = float(lat)
        if lng:
            data["longitude"] = float(lng)

    # Bedrooms / beds / bathrooms / guests
    for key in ("bedrooms", "beds", "bathrooms"):
        val = listing.get(key)
        if val is not None:
            data[key] = val

    guests = listing.get("personCapacity") or listing.get("guestLabel", "")
    if isinstance(guests, int):
        data["max_guests"] = guests
    elif isinstance(guests, str):
        m = re.search(r'(\d+)', guests)
        if m:
            data["max_guests"] = int(m.group(1))

    # Rating
    avg_rating = listing.get("avgRating") or listing.get("avgRatingA11yLabel", "")
    if isinstance(avg_rating, (int, float)):
        data["rating"] = float(avg_rating)
    elif isinstance(avg_rating, str):
        m = re.search(r'([\d.]+)', avg_rating)
        if m:
            data["rating"] = float(m.group(1))

    review_count = listing.get("reviewsCount", 0)
    if review_count:
        data["review_count"] = int(review_count)

    # Host
    host = listing.get("user", {})
    if host:
        data["host_name"] = host.get("firstName", host.get("name", ""))
        data["is_superhost"] = host.get("isSuperHost", False) or host.get("isSuperhost", False)

    # Price
    pricing = result.get("pricingQuote", {}) or result.get("pricing", {})
    if pricing:
        rate = pricing.get("rate", {})
        amount = rate.get("amount") if rate else None
        if amount:
            data["nightly_rate"] = int(float(amount))

        # Also check structuredStayDisplayPrice
        structured = pricing.get("structuredStayDisplayPrice", {})
        if structured:
            primary_line = structured.get("primaryLine", {})
            price_str = primary_line.get("price", "") or primary_line.get("accessibilityLabel", "")
            if price_str and "nightly_rate" not in data:
                m = re.search(r'[\$€£]([\d,]+)', price_str)
                if m:
                    data["nightly_rate"] = int(m.group(1).replace(",", ""))

    # Also try displayPrice from result
    if "nightly_rate" not in data:
        display_price = result.get("displayPrice", {})
        primary_line = display_price.get("primaryLine", {})
        price_str = primary_line.get("accessibilityLabel", "")
        if price_str:
            m = re.search(r'[\$€£]([\d,]+)', price_str)
            if m:
                data["nightly_rate"] = int(m.group(1).replace(",", ""))

    # Images
    photo_urls = []
    context_images = listing.get("contextualPictures", [])
    for pic in context_images:
        url = pic.get("picture", "")
        if url and url not in photo_urls:
            photo_urls.append(url)

    # Also check main picture
    main_picture = listing.get("picture", {})
    if main_picture:
        url = main_picture.get("picture", "")
        if url and url not in photo_urls:
            photo_urls.insert(0, url)

    data["photo_urls"] = photo_urls[:20]

    # Badges (Superhost, Guest Favourite, etc.)
    badges = []
    for badge in listing.get("formattedBadges", []):
        text = badge.get("text", "")
        if text:
            badges.append(text)
    for badge in result.get("searchBadges", []):
        texts = badge.get("texts", [])
        for t in texts:
            if t and t not in badges:
                badges.append(t)
    data["badges"] = badges

    # Superhost from badges
    if any("superhost" in b.lower() for b in badges):
        data["is_superhost"] = True

    return data


# ---------------------------------------------------------------------------
# Supabase upsert
# ---------------------------------------------------------------------------

def supabase_upsert(supabase_url, supabase_key, data):
    """Upsert a record into the airbnb_stays table."""
    table = "airbnb_stays"
    url = f"{supabase_url}/rest/v1/{table}?on_conflict=source_provider,source_listing_id"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    data.pop("id", None)
    body = json.dumps(data, default=str).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        log.error("Supabase upsert error %d: %s", e.code, error_body)
        return e.code
    except Exception as e:
        log.error("Supabase upsert exception: %s", e)
        return 0


# ---------------------------------------------------------------------------
# Slack notification
# ---------------------------------------------------------------------------

def send_slack_notification(summary):
    """Send a summary to Slack if SLACK_BOT_TOKEN is set."""
    token = os.environ.get("SLACK_BOT_TOKEN")
    channel = os.environ.get("SLACK_CHANNEL", "#scraper-logs")
    if not token:
        return

    emoji = "\u2705" if summary.get("errors", 0) == 0 else "\u26a0\ufe0f"
    text = (
        f"{emoji} *Airbnb Stays Scrape Complete*\n"
        f"*Cities:* {summary.get('cities_scraped', 0)}\n"
        f"*Listings:* {summary.get('total_scraped', 0)} scraped, "
        f"{summary.get('total_upserted', 0)} upserted\n"
        f"*Errors:* {summary.get('errors', 0)}\n"
        f"*Duration:* {summary.get('duration', '?')}s"
    )

    body = json.dumps({"channel": channel, "text": text}).encode("utf-8")
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        log.warning("Slack notification failed: %s", e)


# ---------------------------------------------------------------------------
# Scraper core
# ---------------------------------------------------------------------------

def scrape_city(city_slug, max_results=DEFAULT_LIMIT):
    """Scrape stays for a city. Returns list of parsed listings."""
    city_info = CITIES.get(city_slug)
    if not city_info:
        log.error("Unknown city: %s", city_slug)
        return []

    display_name = city_info[0]
    all_listings = []
    seen_ids = set()
    items_offset = 0
    page = 1

    while True:
        url = build_search_url(city_slug, items_offset=items_offset)
        log.info("[%s] Page %d (offset %d): fetching...", display_name, page, items_offset)

        html = fetch_page(url)
        if not html:
            log.warning("[%s] Failed to fetch page %d", display_name, page)
            break

        deferred_state = extract_deferred_state(html)
        if not deferred_state:
            log.warning("[%s] No deferred state found on page %d", display_name, page)
            break

        results, next_cursor = find_search_results(deferred_state)

        if not results:
            log.info("[%s] No more results on page %d", display_name, page)
            break

        new_count = 0
        for result in results:
            listing = parse_listing(result, city_slug)
            if not listing:
                continue
            if listing["source_listing_id"] in seen_ids:
                continue

            seen_ids.add(listing["source_listing_id"])
            all_listings.append(listing)
            new_count += 1

        log.info("[%s] Page %d: %d new listings (total: %d)", display_name, page, new_count, len(all_listings))

        if max_results > 0 and len(all_listings) >= max_results:
            all_listings = all_listings[:max_results]
            break

        if new_count == 0:
            break

        items_offset += 18  # Airbnb shows ~18 stays per page
        page += 1
        time.sleep(REQUEST_DELAY)

    return all_listings


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape Airbnb Stays (rental listings)")
    parser.add_argument("--city", choices=list(CITIES.keys()), help="Scrape a specific city")
    parser.add_argument("--all-cities", action="store_true", help="Scrape all configured cities")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Max listings per city (default: 100)")
    parser.add_argument("--dry-run", action="store_true", help="Scrape but don't write to database")
    args = parser.parse_args()

    if not args.city and not args.all_cities:
        parser.error("Specify --city or --all-cities")

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not args.dry_run and (not supabase_url or not supabase_key):
        log.error("SUPABASE_URL and SUPABASE_SERVICE_KEY required (or use --dry-run)")
        sys.exit(1)

    start_time = time.time()
    summary = {"cities_scraped": 0, "total_scraped": 0, "total_upserted": 0, "errors": 0}

    cities_to_scrape = list(CITIES.keys()) if args.all_cities else [args.city]

    for city_slug in cities_to_scrape:
        display_name = CITIES[city_slug][0]
        log.info("=" * 60)
        log.info("Scraping %s (top %d stays)...", display_name, args.limit)
        log.info("=" * 60)

        listings = scrape_city(city_slug, max_results=args.limit)
        summary["total_scraped"] += len(listings)
        summary["cities_scraped"] += 1

        if not listings:
            log.info("[%s] No listings found", display_name)
            continue

        for i, listing in enumerate(listings):
            price_str = f"${listing.get('nightly_rate', '?')}/night" if listing.get("nightly_rate") else "no price"
            beds_str = f"{listing.get('bedrooms', '?')}bd/{listing.get('beds', '?')}b" if listing.get("bedrooms") else "no beds"
            guests_str = f"{listing.get('max_guests', '?')} guests" if listing.get("max_guests") else ""
            rating_str = f"{listing.get('rating', '?')}★ ({listing.get('review_count', 0)})" if listing.get("rating") else "no rating"

            log.info(
                "  [%d/%d] %s | %s | %s | %s | %s | %d imgs",
                i + 1, len(listings),
                listing.get("title", "?")[:50],
                price_str,
                beds_str,
                guests_str,
                rating_str,
                len(listing.get("photo_urls", [])),
            )

            if not args.dry_run:
                status = supabase_upsert(supabase_url, supabase_key, listing)
                if status in (200, 201):
                    summary["total_upserted"] += 1
                else:
                    log.error("  Upsert failed: HTTP %d", status)
                    summary["errors"] += 1

        if city_slug != cities_to_scrape[-1]:
            time.sleep(REQUEST_DELAY)

    elapsed = round(time.time() - start_time)
    summary["duration"] = elapsed

    log.info("=" * 60)
    log.info("SCRAPE COMPLETE")
    log.info("  Cities: %d", summary["cities_scraped"])
    log.info("  Listings scraped: %d", summary["total_scraped"])
    log.info("  Upserted: %d", summary["total_upserted"])
    log.info("  Errors: %d", summary["errors"])
    log.info("  Duration: %ds", elapsed)
    log.info("=" * 60)

    send_slack_notification(summary)

    if summary["errors"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
