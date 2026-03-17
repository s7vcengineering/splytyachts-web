#!/usr/bin/env python3
"""
Scrape Airbnb Experiences listings and upsert into Supabase.

How it works:
  1. Fetches search results pages for configured cities
  2. Extracts JSON data from <script id="data-deferred-state-0"> tag
  3. Parses experience data (title, price, rating, duration, images, etc.)
  4. Handles pagination via cursor-based offsets
  5. Upserts into Supabase `airbnb_experiences` table

Usage:
  export SUPABASE_URL="https://your-project.supabase.co"
  export SUPABASE_SERVICE_KEY="your-service-role-key"

  # Scrape all configured cities
  python3 scripts/scrape-airbnb-experiences.py --all-cities

  # Scrape a specific city
  python3 scripts/scrape-airbnb-experiences.py --city miami

  # Dry run (scrape but don't write to database)
  python3 scripts/scrape-airbnb-experiences.py --all-cities --dry-run

  # Limit results per city
  python3 scripts/scrape-airbnb-experiences.py --all-cities --limit 20

  # Filter by category
  python3 scripts/scrape-airbnb-experiences.py --city miami --category outdoors

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

log = logging.getLogger("airbnb-scraper")
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

REQUEST_DELAY = 2.5  # seconds between requests (be respectful)

# City configurations: slug -> (display_name, region, country_code, place_id)
# country_code: US, ES, IT, FR — used to build the Airbnb URL slug
CITIES = {
    # ── United States ──
    "miami": ("Miami", "FL", "US", "ChIJEcHIDqKw2YgRZU-t3XHylv8"),
    "fort-lauderdale": ("Fort Lauderdale", "FL", "US", "ChIJs_Jx2s-r2YgR0sS5ooQ3j4o"),
    "los-angeles": ("Los Angeles", "CA", "US", "ChIJE9on3F3HwoAR9AhGJW_fL-I"),
    "san-diego": ("San Diego", "CA", "US", "ChIJSx6SrQ9T2YARed8V_f0hOg0"),
    "new-york": ("New York", "NY", "US", "ChIJOwg_06VPwokRYv534QaPC8g"),
    "key-west": ("Key West", "FL", "US", "ChIJ4dG5s4Ew4IgRIxkHqlkBZ7I"),
    "naples-fl": ("Naples", "FL", "US", "ChIJvxEH2h-j3ogRfrkEAWSNjic"),
    # ── Spain ──
    "ibiza": ("Ibiza", "IB", "ES", "ChIJnYN6XhqslxIR3_UiFZPNPqk"),
    # ── France ──
    "cannes": ("Cannes", "Provence-Alpes-Côte d'Azur", "FR", "ChIJMWKpBY_EzRIRGOuPph7Brck"),
    "nice": ("Nice", "Provence-Alpes-Côte d'Azur", "FR", "ChIJMS2KR-_CzRIRMDOBAN_nYZo"),
    "saint-tropez": ("Saint-Tropez", "Provence-Alpes-Côte d'Azur", "FR", "ChIJlYnlnqSqzRIR4WCl3mCqaic"),
    "monaco": ("Monaco", "Monaco", "MC", "ChIJMTj2x_XJzRIRCc2aM0CE5hI"),
    # ── Italy ──
    "amalfi-coast": ("Amalfi Coast", "Campania", "IT", "ChIJkwkB4mhOOxMRLsP4Yr0mEzk"),
    "capri": ("Capri", "Campania", "IT", "ChIJ61GVqMVFOxMRdq9QrOGLFmI"),
    "positano": ("Positano", "Campania", "IT", "ChIJlX-C7D5POxMRf6iFJr3qITU"),
    "naples-it": ("Naples", "Campania", "IT", "ChIJ6yq8gMJOOxMR7ONCPiGRPAs"),
    "rome": ("Rome", "Lazio", "IT", "ChIJu46S-ZZhLxMROG5lkwZ3D7k"),
    "florence": ("Florence", "Tuscany", "IT", "ChIJrdbSgKZWKhMRAyrH7TMarUA"),
    "venice": ("Venice", "Veneto", "IT", "ChIJiT3W8dqxfkcRoGQuKqx1qMk"),
    "lake-como": ("Lake Como", "Lombardy", "IT", "ChIJ4bBCrRpUh0cRrGwUBKB5X6g"),
    "sardinia": ("Sardinia", "Sardinia", "IT", "ChIJG07j2PlIIBMRoC_unhIzCQs"),
    "sicily": ("Sicily", "Sicily", "IT", "ChIJb4kFiS5kEBMRlBpJIWPKPjA"),
    "portofino": ("Portofino", "Liguria", "IT", "ChIJYRF9rCqj1RIRGKkT-KXHsm4"),
    "milan": ("Milan", "Lombardy", "IT", "ChIJ53USP0nBhkcRjQ50xhPN_zw"),
}

# Category tag mapping
CATEGORIES = {
    "outdoors": "Tag:8961",
    "dining": "Tag:8972",
    "food-tours": "Tag:8960",
    "cooking": "Tag:8957",
    "water-sports": "Tag:8962",
    "cultural-tours": "Tag:8970",
    "wellness": "Tag:8968",
    "art": "Tag:8953",
    "performances": "Tag:9048",
    "shopping": "Tag:8955",
    "wildlife": "Tag:8963",
    "tastings": "Tag:9012",
    "flying": "Tag:9011",
    "architecture": "Tag:9010",
    "workouts": "Tag:8969",
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

def build_search_url(city_slug, items_offset=0, category_tag=None):
    """Build an Airbnb Experiences search URL for a city."""
    city_info = CITIES.get(city_slug)
    if not city_info:
        raise ValueError(f"Unknown city: {city_slug}")

    display_name, region, country_code, place_id = city_info

    # Build the location slug Airbnb expects (spaces become dashes in the URL path)
    name_slug = display_name.replace(" ", "-")
    COUNTRY_NAMES = {"US": "United-States", "ES": "Spain", "IT": "Italy", "FR": "France", "MC": "Monaco"}
    country_name = COUNTRY_NAMES.get(country_code, country_code)

    if country_code == "US":
        location_slug = f"{name_slug}--{region}--{country_name}"
        query = f"{display_name}, {region}"
    else:
        location_slug = f"{name_slug}--{country_name}"
        query = display_name

    params = {
        "tab_id": "experience_tab",
        "refinement_paths[]": "/experiences",
        "query": query,
        "place_id": place_id,
    }

    if items_offset > 0:
        cursor_data = {"section_offset": 4, "items_offset": items_offset, "version": 1}
        cursor = base64.b64encode(json.dumps(cursor_data).encode()).decode()
        params["cursor"] = cursor

    if category_tag:
        params["kg_or_tags[]"] = category_tag

    query_string = urllib.parse.urlencode(params, doseq=True)
    return f"{BASE_URL}/s/{location_slug}/experiences?{query_string}"


# ---------------------------------------------------------------------------
# JSON extraction from search page
# ---------------------------------------------------------------------------

def extract_deferred_state(html_content):
    """Extract JSON data from the data-deferred-state-0 script tag."""
    # The tag has variable attribute order: id, data-deferred-state-0="true", type
    pattern = r'<script[^>]*id="data-deferred-state-0"[^>]*type="application/json"[^>]*>(.*?)</script>'
    match = re.search(pattern, html_content, re.DOTALL)
    if not match:
        # Try with type before id
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
    """Navigate the nested JSON structure to find experience search results."""
    if not deferred_state:
        return [], None

    # The data is in niobeClientData which is an array of [key, value] pairs
    niobe_data = deferred_state.get("niobeClientData", [])

    for entry in niobe_data:
        if not isinstance(entry, list) or len(entry) < 2:
            continue

        value = entry[1] if isinstance(entry[1], dict) else {}
        data = value.get("data", {})

        # Try different paths the search results might be at
        search_data = (
            data.get("presentation", {}).get("experiencesSearch", {}).get("results", {})
            or data.get("presentation", {}).get("explore", {}).get("sections", {})
        )

        if not search_data:
            continue

        search_results = search_data.get("searchResults", [])
        if search_results:
            # Get pagination info
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
# Experience parser
# ---------------------------------------------------------------------------

def parse_experience(result, city_slug):
    """Parse a single experience search result into our schema."""
    city_info = CITIES.get(city_slug, ("Unknown", "??", "US", ""))
    display_name, region, country_code, _ = city_info

    # Filter out non-experience results (headers, ads, etc.)
    typename = result.get("__typename", "")
    if typename and "ExperienceSearchResult" not in typename:
        return None

    # Extract the experience ID
    exp_id = result.get("id")
    if not exp_id:
        return None

    data = {
        "source_provider": SOURCE_PROVIDER,
        "source_listing_id": str(exp_id),
        "source_url": f"{BASE_URL}/experiences/{exp_id}",
        "city": city_info[0],
        "region": region,
        "country": {"US": "United States", "ES": "Spain", "IT": "Italy", "FR": "France", "MC": "Monaco"}.get(country_code, country_code),
        "is_active": True,
        "scrape_status": "scraped",
        "last_scraped_at": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    # Location from result
    activity_location = result.get("activityLocation")
    if activity_location:
        data["city"] = activity_location

    # Category
    category = result.get("primaryThemeFormatted")
    if category:
        data["category"] = category

    # Title and description from listing
    listing = result.get("listing", {})
    descriptions = listing.get("descriptions", {})

    name_obj = descriptions.get("name", {})
    if name_obj:
        localized = name_obj.get("localizedValue", {})
        title = localized.get("localizedStringWithTranslationPreference", "")
        if title:
            data["title"] = title

    byline_obj = descriptions.get("byline", {})
    if byline_obj:
        localized = byline_obj.get("localizedValue", {})
        desc = localized.get("localizedStringWithTranslationPreference", "")
        if desc:
            data["description"] = desc

    # If no title found via nested path, try simpler paths
    if "title" not in data:
        data["title"] = result.get("title", result.get("name", f"Experience {exp_id}"))

    # Rating
    rating_stats = listing.get("listingRatingStats", {}).get("overallRatingStats", {})
    if rating_stats:
        avg = rating_stats.get("ratingAverage")
        if avg is not None:
            data["rating"] = float(avg)
        count = rating_stats.get("ratingCount")
        if count is not None:
            data["review_count"] = int(count)

    # Duration
    offerings = listing.get("offerings", {}).get("publishedOfferings", {}).get("edges", [])
    if offerings:
        node = offerings[0].get("node", {})
        duration = node.get("durationMinutes")
        if duration:
            data["duration_minutes"] = int(duration)

    # Price
    display_price = result.get("displayPrice", {})
    primary_line = display_price.get("primaryLine", {})
    components = primary_line.get("orderedComponents", [])

    for comp in components:
        discounted = comp.get("discountedPrice", "")
        original = comp.get("originalPrice", "")
        price_str = discounted or original
        if price_str:
            # Extract number from "$79", "€79", "From $79", etc.
            price_match = re.search(r'[\$€£](\d+)', price_str)
            if price_match:
                data["price_amount"] = int(price_match.group(1))
            if '€' in price_str:
                data["currency"] = "EUR"
            elif '£' in price_str:
                data["currency"] = "GBP"

        qualifier = comp.get("qualifier", "")
        if qualifier:
            if "group" in qualifier.lower():
                data["price_type"] = "per_group"
            else:
                data["price_type"] = "per_guest"

    # Also try accessibility label for price
    if "price_amount" not in data:
        acc_label = primary_line.get("accessibilityLabel", "")
        if acc_label:
            price_match = re.search(r'[\$€£](\d+)', acc_label)
            if price_match:
                data["price_amount"] = int(price_match.group(1))
            if "group" in acc_label.lower():
                data["price_type"] = "per_group"
            if '€' in acc_label:
                data["currency"] = "EUR"
            elif '£' in acc_label:
                data["currency"] = "GBP"

    # Images
    photo_urls = []

    # Main poster image
    picture = result.get("picture", {})
    poster = picture.get("poster")
    if poster:
        photo_urls.append(poster)

    # Additional poster images
    poster_pictures = result.get("posterPictures", [])
    for pp in poster_pictures:
        p = pp.get("poster", "")
        if p and p not in photo_urls:
            photo_urls.append(p)

    data["photo_urls"] = photo_urls[:20]

    # Badges (Popular, Original, etc.)
    badges = []
    for badge in result.get("searchBadges", []):
        texts = badge.get("texts", [])
        for t in texts:
            if t and t not in badges:
                badges.append(t)
    data["badges"] = badges

    return data


# ---------------------------------------------------------------------------
# Supabase upsert
# ---------------------------------------------------------------------------

def supabase_upsert(supabase_url, supabase_key, data):
    """Upsert a record into the airbnb_experiences table."""
    table = "airbnb_experiences"
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
        f"{emoji} *Airbnb Experiences Scrape Complete*\n"
        f"*Cities:* {summary.get('cities_scraped', 0)}\n"
        f"*Experiences:* {summary.get('total_scraped', 0)} scraped, "
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

def scrape_city(city_slug, max_results=0, category_tag=None):
    """Scrape all experiences for a city. Returns list of parsed experiences."""
    city_info = CITIES.get(city_slug)
    if not city_info:
        log.error("Unknown city: %s", city_slug)
        return []

    display_name = city_info[0]
    all_experiences = []
    seen_ids = set()
    items_offset = 0
    page = 1

    while True:
        url = build_search_url(city_slug, items_offset=items_offset, category_tag=category_tag)
        log.info("[%s] Page %d (offset %d): fetching...", display_name, page, items_offset)

        html = fetch_page(url)
        if not html:
            log.warning("[%s] Failed to fetch page %d", display_name, page)
            break

        deferred_state = extract_deferred_state(html)
        if not deferred_state:
            log.warning("[%s] No deferred state found on page %d", display_name, page)
            # Try to find any JSON data as fallback
            break

        results, next_cursor = find_search_results(deferred_state)

        if not results:
            log.info("[%s] No more results on page %d", display_name, page)
            break

        new_count = 0
        for result in results:
            exp = parse_experience(result, city_slug)
            if not exp:
                continue
            if exp["source_listing_id"] in seen_ids:
                continue

            seen_ids.add(exp["source_listing_id"])
            all_experiences.append(exp)
            new_count += 1

        log.info("[%s] Page %d: %d new experiences (total: %d)", display_name, page, new_count, len(all_experiences))

        if max_results > 0 and len(all_experiences) >= max_results:
            all_experiences = all_experiences[:max_results]
            break

        # Check if we should paginate — keep going as long as we got new results
        if new_count == 0:
            break

        items_offset += 20
        page += 1
        time.sleep(REQUEST_DELAY)

    return all_experiences


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape Airbnb Experiences listings")
    parser.add_argument("--city", choices=list(CITIES.keys()), help="Scrape a specific city")
    parser.add_argument("--all-cities", action="store_true", help="Scrape all configured cities")
    parser.add_argument("--category", choices=list(CATEGORIES.keys()), help="Filter by category")
    parser.add_argument("--limit", type=int, default=0, help="Max experiences per city (0=all)")
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
    category_tag = CATEGORIES.get(args.category) if args.category else None

    for city_slug in cities_to_scrape:
        display_name = CITIES[city_slug][0]
        log.info("=" * 60)
        log.info("Scraping %s...", display_name)
        log.info("=" * 60)

        experiences = scrape_city(city_slug, max_results=args.limit, category_tag=category_tag)
        summary["total_scraped"] += len(experiences)
        summary["cities_scraped"] += 1

        if not experiences:
            log.info("[%s] No experiences found", display_name)
            continue

        for i, exp in enumerate(experiences):
            price_str = f"${exp.get('price_amount', '?')}/{exp.get('price_type', '?')}" if exp.get("price_amount") else "no price"
            dur_str = f"{exp.get('duration_minutes', '?')}min" if exp.get("duration_minutes") else "no duration"
            rating_str = f"{exp.get('rating', '?')}★ ({exp.get('review_count', 0)})" if exp.get("rating") else "no rating"

            log.info(
                "  [%d/%d] %s | %s | %s | %s | %d images",
                i + 1, len(experiences),
                exp.get("title", "?")[:60],
                price_str,
                dur_str,
                rating_str,
                len(exp.get("photo_urls", [])),
            )

            if not args.dry_run:
                status = supabase_upsert(supabase_url, supabase_key, exp)
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
    log.info("  Experiences scraped: %d", summary["total_scraped"])
    log.info("  Upserted: %d", summary["total_upserted"])
    log.info("  Errors: %d", summary["errors"])
    log.info("  Duration: %ds", elapsed)
    log.info("=" * 60)

    send_slack_notification(summary)

    if summary["errors"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
