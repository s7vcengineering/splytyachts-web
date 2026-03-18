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
DEFAULT_LIMIT = 250  # top 250 per city

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
        "price_filter_input_type": "0",
        "search_mode": "regular_search",
        "search_type": "filter_change",
        "price_min": "100",
    }

    if items_offset > 0:
        cursor_data = {"section_offset": 0, "items_offset": items_offset, "version": 1}
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
        presentation = data.get("presentation", {})

        # Current Airbnb structure: staysSearch -> results
        stays_search = presentation.get("staysSearch", {})
        if stays_search:
            results_obj = stays_search.get("results", {})
            search_results = results_obj.get("searchResults", [])
            if search_results:
                pagination = results_obj.get("paginationInfo", {})
                # Get next page cursor from pageCursors list
                cursors = pagination.get("pageCursors", [])
                next_cursor = cursors[1] if len(cursors) > 1 else None
                return search_results, next_cursor

        # Fallback: explore -> sections
        explore = presentation.get("explore", {})
        sections = explore.get("sections", {})
        if sections:
            search_results = sections.get("searchResults", [])
            if search_results:
                pagination = sections.get("paginationInfo", {})
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
    """Parse a single stay search result into our schema.

    As of 2026-03, Airbnb's search results use a flat structure with:
    - demandStayListing: id (base64), location, description
    - title, subtitle, avgRatingLocalized, avgRatingA11yLabel at top level
    - structuredDisplayPrice for pricing
    - contextualPictures for photos
    - structuredContent.primaryLine for room details (bedrooms, beds)
    - badges for labels (Guest favourite, Superhost, etc.)
    """
    city_info = CITIES.get(city_slug, ("Unknown", "??", "US", ""))
    display_name, region, country_code, _ = city_info

    # Extract listing ID from demandStayListing (base64-encoded)
    demand = result.get("demandStayListing", {}) or {}
    raw_id = demand.get("id", "")
    listing_id = None
    if raw_id:
        try:
            decoded = base64.b64decode(raw_id).decode("utf-8")
            # Format: "DemandStayListing:1234567890"
            listing_id = decoded.split(":")[-1] if ":" in decoded else decoded
        except Exception:
            listing_id = raw_id

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

    # Title — use subtitle as name (subtitle has the actual listing name),
    # title is generic like "Home in Miami"
    title = result.get("title", "")
    subtitle = result.get("subtitle", "")
    data["title"] = subtitle if subtitle else title if title else f"Listing {listing_id}"

    # Property type from title (e.g., "Home in Miami", "Condo in Miami Beach")
    if title:
        m = re.match(r'^(\w[\w\s]*?)\s+in\s+', title)
        if m:
            data["property_type"] = m.group(1)

    # Coordinates from demandStayListing.location
    location = demand.get("location", {}) or {}
    coordinate = location.get("coordinate", {}) or {}
    lat = coordinate.get("latitude")
    lng = coordinate.get("longitude")
    if lat:
        data["latitude"] = float(lat)
    if lng:
        data["longitude"] = float(lng)

    # Room details from structuredContent.primaryLine
    struct_content = result.get("structuredContent", {}) or {}
    primary_items = struct_content.get("primaryLine", []) or []
    for item in primary_items:
        body = item.get("body", "") if isinstance(item, dict) else ""
        if not body:
            continue
        m_beds = re.match(r'(\d+)\s+bedroom', body, re.IGNORECASE)
        if m_beds:
            data["bedrooms"] = int(m_beds.group(1))
        m_beds_count = re.match(r'(\d+)\s+bed(?!room)', body, re.IGNORECASE)
        if m_beds_count:
            data["beds"] = int(m_beds_count.group(1))
        m_bath = re.match(r'([\d.]+)\s+bath', body, re.IGNORECASE)
        if m_bath:
            data["bathrooms"] = float(m_bath.group(1))
        m_guests = re.match(r'(\d+)\s+guest', body, re.IGNORECASE)
        if m_guests:
            data["max_guests"] = int(m_guests.group(1))

    # Rating and review count from avgRatingLocalized (e.g., "4.99 (370)")
    # and avgRatingA11yLabel (e.g., "4.99 out of 5 average rating,  370 reviews")
    rating_localized = result.get("avgRatingLocalized", "")
    rating_label = result.get("avgRatingA11yLabel", "")

    if rating_localized and rating_localized != "New":
        m = re.search(r'([\d.]+)', rating_localized)
        if m:
            data["rating"] = float(m.group(1))
        m_reviews = re.search(r'\((\d[\d,]*)\)', rating_localized)
        if m_reviews:
            data["review_count"] = int(m_reviews.group(1).replace(",", ""))

    if "review_count" not in data and rating_label:
        m_reviews = re.search(r'(\d[\d,]*)\s+review', rating_label)
        if m_reviews:
            data["review_count"] = int(m_reviews.group(1).replace(",", ""))

    # Price from structuredDisplayPrice
    sdp = result.get("structuredDisplayPrice", {}) or {}
    primary_line = sdp.get("primaryLine", {}) or {}
    explanation = sdp.get("explanationData", {}) or {}

    # Try to get nightly rate from explanation details (e.g., "5 nights x $489.52")
    price_details = explanation.get("priceDetails", []) or []
    for group in price_details:
        items = group.get("items", []) or []
        for item in items:
            desc = item.get("description", "")
            m = re.search(r'[\$€£]([\d,.]+)', desc)
            if m and "night" in desc.lower():
                nightly = float(m.group(1).replace(",", ""))
                data["nightly_rate"] = int(round(nightly))
                break
        if "nightly_rate" in data:
            break

    # Fallback: derive from total price / nights
    if "nightly_rate" not in data:
        acc_label = primary_line.get("accessibilityLabel", "")
        qualifier = primary_line.get("qualifier", "")
        # e.g., "$2,448 for 5 nights"
        label = acc_label or f"{primary_line.get('price', '')} {qualifier}"
        m_total = re.search(r'[\$€£]([\d,]+)', label)
        m_nights = re.search(r'(\d+)\s+night', label)
        if m_total and m_nights:
            total = int(m_total.group(1).replace(",", ""))
            nights = int(m_nights.group(1))
            if nights > 0:
                data["nightly_rate"] = int(round(total / nights))

    # Images from contextualPictures
    photo_urls = []
    for pic in result.get("contextualPictures", []) or []:
        url = pic.get("picture", "")
        if url and url not in photo_urls:
            photo_urls.append(url)
    data["photo_urls"] = photo_urls[:20]

    # Badges
    badges = []
    for badge in result.get("badges", []) or []:
        # badge can be dict with text or string
        if isinstance(badge, dict):
            text = badge.get("text", "") or badge.get("title", "")
            if text:
                badges.append(text)
        elif isinstance(badge, str) and badge:
            badges.append(badge)
    data["badges"] = badges

    # Superhost from badges
    if any("superhost" in b.lower() for b in badges):
        data["is_superhost"] = True

    # Guest favourite badge
    if any("guest fav" in b.lower() for b in badges):
        pass  # just tracked in badges list

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
