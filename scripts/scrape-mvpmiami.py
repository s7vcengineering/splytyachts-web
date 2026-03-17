#!/usr/bin/env python3
"""
Scrape MVP Miami (mvpmiami.com) exotic car, mansion, and yacht listings.

How it works:
  1. Fetches the sitemap at /sitemap.xml to discover all listing URLs
  2. Groups URLs by type: rental_cars, rental_mansions, rental_yachts
  3. Fetches each listing detail page
  4. Parses structured data from the HTML
  5. Upserts into Supabase tables: exotic_cars, mansions, mvp_yachts

Usage:
  export SUPABASE_URL="https://your-project.supabase.co"
  export SUPABASE_SERVICE_KEY="your-service-role-key"

  # Scrape everything
  python3 scripts/scrape-mvpmiami.py

  # Scrape only cars
  python3 scripts/scrape-mvpmiami.py --type cars

  # Scrape only mansions
  python3 scripts/scrape-mvpmiami.py --type mansions

  # Scrape only yachts
  python3 scripts/scrape-mvpmiami.py --type yachts

  # Dry run (scrape but don't write to database)
  python3 scripts/scrape-mvpmiami.py --dry-run

  # Scrape specific URLs
  python3 scripts/scrape-mvpmiami.py --urls https://www.mvpmiami.com/rental_cars/2024-rolls-royce-cullinan-c-4/
"""

import argparse
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
import uuid
import html.parser

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

log = logging.getLogger("mvp-scraper")
log.setLevel(logging.DEBUG)

_console = logging.StreamHandler(sys.stderr)
_console.setLevel(logging.INFO)
_console.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT))
log.addHandler(_console)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "https://www.mvpmiami.com"
SITEMAP_URL = f"{BASE_URL}/sitemap.xml"
SOURCE_PROVIDER = "mvpmiami"
PHONE = "786.877.4317"
ADDRESS = "2500 NW 39th Street, Miami, FL 33142"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Rate limiting
REQUEST_DELAY = 1.5  # seconds between requests


# ---------------------------------------------------------------------------
# HTML Parser helpers
# ---------------------------------------------------------------------------

class TagTextExtractor(html.parser.HTMLParser):
    """Extract text content from HTML."""
    def __init__(self):
        super().__init__()
        self._text = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            self._text.append(data)

    def get_text(self):
        return ' '.join(self._text)


def fetch_page(url):
    """Fetch a URL and return the HTML content."""
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


def extract_text(html_str):
    """Strip HTML tags and return plain text."""
    parser = TagTextExtractor()
    parser.feed(html_str)
    return parser.get_text().strip()


# ---------------------------------------------------------------------------
# Sitemap discovery
# ---------------------------------------------------------------------------

def discover_from_page(url, pattern):
    """Fetch a page and extract listing URLs matching a pattern."""
    content = fetch_page(url)
    if not content:
        return []
    matches = re.findall(rf'href=["\']({BASE_URL}/{pattern}/[^"\'#]+)["\']', content)
    # Deduplicate and clean
    seen = set()
    urls = []
    for u in matches:
        clean = u.rstrip("/") + "/"
        if clean not in seen:
            seen.add(clean)
            urls.append(clean)
    return urls


def discover_listings_from_sitemap():
    """Fetch sitemap.xml and category pages to discover all listing URLs."""
    log.info("Fetching sitemap: %s", SITEMAP_URL)
    content = fetch_page(SITEMAP_URL)

    result = {"cars": [], "mansions": [], "yachts": []}

    if content:
        urls = re.findall(r"<loc>(.*?)</loc>", content)
        for url in urls:
            if "/rental_cars/" in url:
                result["cars"].append(url)
            elif "/rental_mansions/" in url:
                result["mansions"].append(url)
            elif "/rental_yachts/" in url:
                result["yachts"].append(url)

    # Mansion and yacht listings aren't in sitemap — discover from category pages
    if not result["mansions"]:
        log.info("Discovering mansions from category page...")
        result["mansions"] = discover_from_page(
            f"{BASE_URL}/mansion-rentals/", "rental_mansions"
        )
        time.sleep(REQUEST_DELAY)

    if not result["yachts"]:
        log.info("Discovering yachts from category page...")
        result["yachts"] = discover_from_page(
            f"{BASE_URL}/yacht-rentals/", "rental_yachts"
        )
        time.sleep(REQUEST_DELAY)

    log.info(
        "Discovered: %d cars, %d mansions, %d yachts",
        len(result["cars"]), len(result["mansions"]), len(result["yachts"])
    )
    return result


# ---------------------------------------------------------------------------
# Car parser
# ---------------------------------------------------------------------------

def parse_car_listing(url, html_content):
    """Parse an exotic car listing page and return structured data."""
    data = {
        "source_provider": SOURCE_PROVIDER,
        "source_url": url,
        "source_listing_id": url.rstrip("/").split("/")[-1],
        "city": "Miami",
        "region": "FL",
        "contact_phone": PHONE,
        "contact_address": ADDRESS,
        "is_active": True,
        "scrape_status": "scraped",
        "last_scraped_at": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    # Extract from URL slug: "2024-rolls-royce-cullinan-c-4"
    slug = url.rstrip("/").split("/")[-1]
    slug_match = re.match(r"(\d{4})-(.+?)-c-(\d+)$", slug)
    if slug_match:
        data["year"] = int(slug_match.group(1))
        name_parts = slug_match.group(2).replace("-", " ").title()
        data["stock_number"] = f"c-{slug_match.group(3)}"
    else:
        name_parts = slug.replace("-", " ").title()

    # Extract title
    title_match = re.search(r"<h1[^>]*class=\"[^\"]*post-title[^\"]*\"[^>]*>(.*?)</h1>", html_content, re.DOTALL)
    if not title_match:
        title_match = re.search(r"<title>(.*?)(?:\s*[-|].*)?</title>", html_content, re.DOTALL)
    if title_match:
        title = extract_text(title_match.group(1)).strip()
        # Parse "2024 Rolls Royce Cullinan" pattern
        parts = title.split()
        if parts and parts[0].isdigit():
            data["year"] = int(parts[0])
            # Try to split make and model
            remaining = " ".join(parts[1:])
            data["title"] = title
        else:
            data["title"] = title
    else:
        data["title"] = name_parts

    # Extract make/model from structured data or patterns
    make_match = re.search(r'"make"\s*:\s*"([^"]+)"', html_content)
    model_match = re.search(r'"model"\s*:\s*"([^"]+)"', html_content)
    if make_match:
        data["make"] = make_match.group(1)
    if model_match:
        data["model"] = model_match.group(1)

    # Try to get make/model from detail rows
    for field, key in [
        ("Make", "make"), ("Model", "model"), ("Trim", "trim"),
        ("Body Style", "body_style"), ("Bodystyle", "body_style"),
        ("Exterior Color", "exterior_color"), ("Interior Color", "interior_color"),
        ("Transmission", "transmission"), ("Engine", "engine"),
        ("Mileage", "mileage_text"), ("Stock #", "stock_number"),
        ("Drivetrain", "drivetrain"), ("VIN #", "vin"),
    ]:
        pattern = re.compile(
            rf'<(?:span|td|div|dt)[^>]*>\s*{re.escape(field)}\s*:?\s*</(?:span|td|div|dt)>\s*'
            rf'<(?:span|td|div|dd)[^>]*>\s*(.*?)\s*</(?:span|td|div|dd)>',
            re.DOTALL | re.IGNORECASE
        )
        match = pattern.search(html_content)
        if match:
            val = extract_text(match.group(1)).strip()
            if val and val.lower() not in ("n/a", "call", ""):
                data[key] = val

    # Parse mileage as integer
    if "mileage_text" in data:
        mileage_num = re.sub(r"[^\d]", "", data.pop("mileage_text"))
        if mileage_num:
            data["mileage"] = int(mileage_num)

    # Extract price
    price_match = re.search(r'\$\s*([\d,]+)\s*(?:/day|per day|daily)?', html_content)
    if price_match:
        price_str = price_match.group(1).replace(",", "")
        if price_str.isdigit():
            data["daily_rate"] = int(price_str)

    # Also check for structured price data
    price_data_match = re.search(r'"price"\s*:\s*"?\$?([\d,]+)"?', html_content)
    if price_data_match and "daily_rate" not in data:
        price_str = price_data_match.group(1).replace(",", "")
        if price_str.isdigit():
            data["daily_rate"] = int(price_str)

    # Extract horsepower
    hp_match = re.search(r'(\d{3,4})\s*(?:hp|horsepower|bhp)', html_content, re.IGNORECASE)
    if hp_match:
        data["horsepower"] = int(hp_match.group(1))

    # Extract 0-60
    accel_match = re.search(r'0[-–]60\s*(?:mph)?\s*(?:in)?\s*([\d.]+)\s*(?:seconds|sec|s)', html_content, re.IGNORECASE)
    if accel_match:
        data["zero_to_sixty"] = float(accel_match.group(1))

    # Extract top speed
    speed_match = re.search(r'(?:top speed|max speed)[:\s]*(\d{3})\s*mph', html_content, re.IGNORECASE)
    if speed_match:
        data["top_speed"] = int(speed_match.group(1))

    # Extract description
    desc_match = re.search(
        r'<div[^>]*class="[^"]*(?:description|entry-content|vehicle-description)[^"]*"[^>]*>(.*?)</div>',
        html_content, re.DOTALL | re.IGNORECASE
    )
    if desc_match:
        data["description"] = extract_text(desc_match.group(1))[:2000]

    # Extract images - MVP uses imagetag pattern
    image_urls = []

    # Pattern 1: imagetag URLs
    imagetag_matches = re.findall(
        r'(?:src|href|data-src)=["\']([^"\']*imagetag[^"\']*)["\']',
        html_content
    )
    for img_url in imagetag_matches:
        full_url = img_url if img_url.startswith("http") else BASE_URL + img_url
        # Prefer large images (l/) over thumbnails (f/)
        if "/l/" in full_url or "/main/" in full_url:
            if full_url not in image_urls:
                image_urls.append(full_url)

    # Pattern 2: wp-content/uploads images
    wp_matches = re.findall(
        r'(?:src|data-src)=["\']([^"\']*wp-content/uploads[^"\']*\.(?:jpg|jpeg|png|webp))["\']',
        html_content, re.IGNORECASE
    )
    for img_url in wp_matches:
        full_url = img_url if img_url.startswith("http") else BASE_URL + img_url
        if full_url not in image_urls and "150x" not in full_url and "thumbnail" not in full_url:
            image_urls.append(full_url)

    # If we found imagetag pattern, try to build full set
    if imagetag_matches:
        # Extract the base pattern: /imagetag/{id}/{num}/l/filename.jpg
        tag_base = re.search(r'/imagetag/(\d+)/\d+/[fl]/(.*?\.jpg)', imagetag_matches[0], re.IGNORECASE)
        if tag_base:
            car_id = tag_base.group(1)
            filename = tag_base.group(2)
            # Try images 1 through 60
            for i in range(1, 61):
                img_url = f"{BASE_URL}/imagetag/{car_id}/{i}/l/{filename}"
                if img_url not in image_urls:
                    image_urls.append(img_url)

    data["photo_urls"] = image_urls[:50]  # Cap at 50 images

    # Derive make/model from title if not already set
    if "make" not in data and "title" in data:
        title = data["title"]
        known_makes = [
            "Rolls Royce", "Rolls-Royce", "Lamborghini", "Ferrari", "Bentley",
            "Mercedes-Benz", "Mercedes Benz", "Porsche", "BMW", "Audi",
            "McLaren", "Maserati", "Range Rover", "Land Rover", "Jaguar",
            "Tesla", "Aston Martin", "Bugatti",
        ]
        for make in known_makes:
            if make.lower() in title.lower():
                data["make"] = make.replace("-", " ").replace("  ", " ")
                # Model is everything after make
                idx = title.lower().index(make.lower())
                after = title[idx + len(make):].strip()
                if after:
                    data["model"] = after
                break

    return data


# ---------------------------------------------------------------------------
# Mansion parser
# ---------------------------------------------------------------------------

def parse_mansion_listing(url, html_content):
    """Parse a mansion listing page and return structured data."""
    data = {
        "source_provider": SOURCE_PROVIDER,
        "source_url": url,
        "source_listing_id": url.rstrip("/").split("/")[-1],
        "city": "Miami",
        "region": "FL",
        "contact_phone": PHONE,
        "is_active": True,
        "scrape_status": "scraped",
        "last_scraped_at": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    slug = url.rstrip("/").split("/")[-1]
    data["name"] = slug.replace("-", " ").title()

    # Extract title
    title_match = re.search(r"<h1[^>]*>(.*?)</h1>", html_content, re.DOTALL)
    if title_match:
        data["name"] = extract_text(title_match.group(1)).strip()

    # Extract bedrooms
    bed_match = re.search(r'(\d+)\s*(?:bedroom|bed\b)', html_content, re.IGNORECASE)
    if bed_match:
        data["bedrooms"] = int(bed_match.group(1))

    # Extract bathrooms
    bath_match = re.search(r'([\d.]+)\s*(?:bathroom|bath\b)', html_content, re.IGNORECASE)
    if bath_match:
        data["bathrooms"] = float(bath_match.group(1))

    # Extract capacity
    cap_match = re.search(r'(?:guest|capacity|sleeps?|accommodates?)[:\s]*(\d+)', html_content, re.IGNORECASE)
    if not cap_match:
        cap_match = re.search(r'(\d+)\s*(?:guest|people)', html_content, re.IGNORECASE)
    if cap_match:
        data["capacity"] = int(cap_match.group(1))

    # Extract bed configuration
    bed_config_match = re.search(
        r'(?:bed configuration|beds?)[:\s]*((?:\d+\s*(?:king|queen|twin|full|bunk)[^<]*(?:,|/|&|and)?[^<]*)+)',
        html_content, re.IGNORECASE
    )
    if bed_config_match:
        data["bed_config"] = extract_text(bed_config_match.group(1)).strip()

    # Extract location
    loc_match = re.search(r'(?:located?\s+(?:in|on|at)|neighborhood)[:\s]*([^<.]{5,50})', html_content, re.IGNORECASE)
    if loc_match:
        data["location"] = extract_text(loc_match.group(1)).strip()

    # Extract description
    desc_patterns = [
        r'<div[^>]*class="[^"]*(?:entry-content|description|mansion-desc)[^"]*"[^>]*>(.*?)</div>',
        r'<div[^>]*class="[^"]*wpb_wrapper[^"]*"[^>]*>(.*?)</div>',
    ]
    for pat in desc_patterns:
        desc_match = re.search(pat, html_content, re.DOTALL | re.IGNORECASE)
        if desc_match:
            text = extract_text(desc_match.group(1))
            if len(text) > 50:
                data["description"] = text[:2000]
                break

    # Extract amenities
    amenities = []
    amenity_patterns = [
        r'<li[^>]*>\s*([^<]{3,60})\s*</li>',
    ]
    for pat in amenity_patterns:
        for m in re.finditer(pat, html_content):
            amenity = extract_text(m.group(1)).strip()
            if amenity and len(amenity) < 60 and amenity not in amenities:
                amenities.append(amenity)
    if amenities:
        data["amenities"] = amenities[:30]

    # Extract images
    image_urls = []
    # Skip known logos and site assets
    SKIP_IMAGES = {"MVP_MIAMI.png", "mvp-logo", "favicon", "site-logo"}
    wp_matches = re.findall(
        r'(?:src|data-src|href)=["\']([^"\']*wp-content/uploads[^"\']*\.(?:jpg|jpeg|png|webp))["\']',
        html_content, re.IGNORECASE
    )
    for img_url in wp_matches:
        full_url = img_url if img_url.startswith("http") else BASE_URL + img_url
        # Skip thumbnails and logos
        if "150x" not in full_url and "300x" not in full_url and "-min" not in full_url:
            if not any(skip in full_url for skip in SKIP_IMAGES):
                if full_url not in image_urls:
                    image_urls.append(full_url)
    data["photo_urls"] = image_urls[:50]

    # Extract price
    price_match = re.search(r'\$\s*([\d,]+)\s*(?:/night|per night|nightly)?', html_content)
    if price_match:
        price_str = price_match.group(1).replace(",", "")
        if price_str.isdigit() and int(price_str) > 100:
            data["nightly_rate"] = int(price_str)

    return data


# ---------------------------------------------------------------------------
# Yacht parser
# ---------------------------------------------------------------------------

def parse_yacht_listing(url, html_content):
    """Parse a yacht listing page and return structured data."""
    data = {
        "source_provider": SOURCE_PROVIDER,
        "source_url": url,
        "source_listing_id": url.rstrip("/").split("/")[-1],
        "city": "Miami",
        "region": "FL",
        "contact_phone": PHONE,
        "is_active": True,
        "scrape_status": "scraped",
        "last_scraped_at": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    slug = url.rstrip("/").split("/")[-1]
    data["name"] = slug.replace("-", " ").title()

    # Extract title
    title_match = re.search(r"<h1[^>]*>(.*?)</h1>", html_content, re.DOTALL)
    if title_match:
        data["name"] = extract_text(title_match.group(1)).strip()

    # Extract capacity
    sleeping_match = re.search(r'(\d+)\s*(?:sleeping|sleep)', html_content, re.IGNORECASE)
    cruising_match = re.search(r'(\d+)\s*(?:cruising|cruise|day\s*guests?)', html_content, re.IGNORECASE)
    if sleeping_match:
        data["sleeping_capacity"] = int(sleeping_match.group(1))
    if cruising_match:
        data["cruising_capacity"] = int(cruising_match.group(1))

    # Extract staterooms
    state_match = re.search(r'(\d+)\s*stateroom', html_content, re.IGNORECASE)
    if state_match:
        data["staterooms"] = int(state_match.group(1))

    # Extract length
    length_match = re.search(r'([\d.]+)\s*(?:meters|m\b|feet|ft)', html_content, re.IGNORECASE)
    if length_match:
        val = float(length_match.group(1))
        unit = "meters" if "meter" in length_match.group(0).lower() else "feet"
        data["length_meters"] = val if unit == "meters" else round(val * 0.3048, 2)
        data["length_feet"] = round(val / 0.3048) if unit == "meters" else int(val)

    # Extract top speed
    speed_match = re.search(r'(\d+)\s*knots', html_content, re.IGNORECASE)
    if speed_match:
        data["top_speed_knots"] = int(speed_match.group(1))

    # Extract builder
    builder_match = re.search(r'(?:built by|builder|manufacturer)[:\s]*([A-Z][a-zA-Z\s]+)', html_content)
    if builder_match:
        data["builder"] = builder_match.group(1).strip()

    # Extract description
    desc_match = re.search(
        r'<div[^>]*class="[^"]*(?:entry-content|description|wpb_wrapper)[^"]*"[^>]*>(.*?)</div>',
        html_content, re.DOTALL | re.IGNORECASE
    )
    if desc_match:
        text = extract_text(desc_match.group(1))
        if len(text) > 30:
            data["description"] = text[:2000]

    # Extract images
    image_urls = []
    wp_matches = re.findall(
        r'(?:src|data-src)=["\']([^"\']*wp-content/uploads[^"\']*\.(?:jpg|jpeg|png|webp))["\']',
        html_content, re.IGNORECASE
    )
    for img_url in wp_matches:
        full_url = img_url if img_url.startswith("http") else BASE_URL + img_url
        if "150x" not in full_url and "300x" not in full_url:
            if full_url not in image_urls:
                image_urls.append(full_url)
    data["photo_urls"] = image_urls[:30]

    return data


# ---------------------------------------------------------------------------
# Supabase upsert
# ---------------------------------------------------------------------------

def supabase_upsert(supabase_url, supabase_key, table, data, conflict_key="source_provider,source_listing_id"):
    """Upsert a record into Supabase."""
    url = f"{supabase_url}/rest/v1/{table}?on_conflict={conflict_key}"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    # Don't send id on upsert — let DB keep existing id or generate new one
    data.pop("id", None)

    body = json.dumps(data, default=str).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        log.error("Supabase upsert error %d for %s: %s", e.code, table, error_body)
        return e.code
    except Exception as e:
        log.error("Supabase upsert exception for %s: %s", table, e)
        return 0


# ---------------------------------------------------------------------------
# Slack notification (optional)
# ---------------------------------------------------------------------------

def send_slack_notification(summary):
    """Send a summary to Slack if SLACK_WEBHOOK_URL is set."""
    webhook = os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook:
        return

    emoji = "\u2705" if summary.get("errors", 0) == 0 else "\u26a0\ufe0f"
    text = (
        f"{emoji} *MVP Miami Scrape Complete*\n"
        f"*Cars:* {summary.get('cars_scraped', 0)} scraped\n"
        f"*Mansions:* {summary.get('mansions_scraped', 0)} scraped\n"
        f"*Yachts:* {summary.get('yachts_scraped', 0)} scraped\n"
        f"*Errors:* {summary.get('errors', 0)}\n"
        f"*Duration:* {summary.get('duration', '?')}s"
    )

    body = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(
        webhook, data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        log.warning("Slack notification failed: %s", e)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape MVP Miami listings")
    parser.add_argument("--type", choices=["cars", "mansions", "yachts", "all"], default="all")
    parser.add_argument("--dry-run", action="store_true", help="Scrape but don't write to database")
    parser.add_argument("--urls", nargs="+", help="Scrape specific URLs")
    parser.add_argument("--limit", type=int, default=0, help="Max listings to scrape per type (0=all)")
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not args.dry_run and (not supabase_url or not supabase_key):
        log.error("SUPABASE_URL and SUPABASE_SERVICE_KEY required (or use --dry-run)")
        sys.exit(1)

    start_time = time.time()
    summary = {"cars_scraped": 0, "mansions_scraped": 0, "yachts_scraped": 0, "errors": 0}

    if args.urls:
        # Scrape specific URLs
        for url in args.urls:
            if "/rental_cars/" in url:
                listings = {"cars": [url], "mansions": [], "yachts": []}
            elif "/rental_mansions/" in url:
                listings = {"cars": [], "mansions": [url], "yachts": []}
            elif "/rental_yachts/" in url:
                listings = {"cars": [], "mansions": [], "yachts": [url]}
            else:
                log.warning("Unknown URL type: %s", url)
                continue
    else:
        listings = discover_listings_from_sitemap()

    # Filter by type
    types_to_scrape = []
    if args.type in ("all", "cars"):
        types_to_scrape.append(("cars", listings["cars"], "exotic_cars", parse_car_listing))
    if args.type in ("all", "mansions"):
        types_to_scrape.append(("mansions", listings["mansions"], "mansions", parse_mansion_listing))
    if args.type in ("all", "yachts"):
        types_to_scrape.append(("yachts", listings["yachts"], "mvp_yachts", parse_yacht_listing))

    for type_name, urls, table, parser_fn in types_to_scrape:
        if args.limit > 0:
            urls = urls[:args.limit]

        log.info("Scraping %d %s listings...", len(urls), type_name)

        for i, url in enumerate(urls):
            log.info("[%d/%d] %s: %s", i + 1, len(urls), type_name, url)

            html_content = fetch_page(url)
            if not html_content:
                summary["errors"] += 1
                continue

            try:
                data = parser_fn(url, html_content)
            except Exception as e:
                log.error("Parse error for %s: %s", url, e)
                summary["errors"] += 1
                continue

            log.info(
                "  Parsed: %s | %d images",
                data.get("title") or data.get("name", "?"),
                len(data.get("photo_urls", [])),
            )

            if not args.dry_run:
                status = supabase_upsert(supabase_url, supabase_key, table, data)
                if status in (200, 201):
                    log.info("  Upserted to %s", table)
                else:
                    log.error("  Upsert failed: HTTP %d", status)
                    summary["errors"] += 1
            else:
                log.info("  [DRY RUN] Would upsert to %s:", table)
                # Print key fields
                for k in ("title", "name", "make", "model", "year", "daily_rate",
                           "bedrooms", "capacity", "photo_urls"):
                    if k in data:
                        val = data[k]
                        if k == "photo_urls":
                            val = f"{len(val)} images"
                        log.info("    %s: %s", k, val)

            summary[f"{type_name}_scraped"] += 1

            # Rate limit
            if i < len(urls) - 1:
                time.sleep(REQUEST_DELAY)

    elapsed = round(time.time() - start_time)
    summary["duration"] = elapsed

    log.info("=" * 60)
    log.info("SCRAPE COMPLETE")
    log.info("  Cars: %d", summary["cars_scraped"])
    log.info("  Mansions: %d", summary["mansions_scraped"])
    log.info("  Yachts: %d", summary["yachts_scraped"])
    log.info("  Errors: %d", summary["errors"])
    log.info("  Duration: %ds", elapsed)
    log.info("=" * 60)

    send_slack_notification(summary)


if __name__ == "__main__":
    main()
