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
  3. Fetches the existing record from Supabase (if any) and diffs fields
  4. Logs every change: pricing, capacity, availability, ratings, etc.
  5. Upserts using boatsetter_listing_id as conflict key (idempotent)
  6. Writes a scrape_logs entry for the run with full audit trail

Logging:
  - Structured logs to stderr (human-readable) and optionally to a JSON
    log file (--log-file) for ingestion by monitoring tools.
  - Every field change is logged individually so you know exactly what
    changed and when.
  - Run summary logged to Supabase scrape_logs table (unless --dry-run).

Usage:
  # Set environment variables
  export SUPABASE_URL="https://your-project.supabase.co"
  export SUPABASE_SERVICE_KEY="your-service-role-key"

  # Scrape ALL configured cities (premium boats only)
  python3 scripts/scrape-boatsetter.py --all-cities

  # Scrape all cities, dry run
  python3 scripts/scrape-boatsetter.py --all-cities --dry-run

  # Search for Miami boats $900+ (uses search API)
  python3 scripts/scrape-boatsetter.py --price-min 900

  # Scrape a specific configured city
  python3 scripts/scrape-boatsetter.py --city fort-lauderdale

  # With JSON log file output
  python3 scripts/scrape-boatsetter.py --all-cities --log-file scrape.log

  # Browse mode (no price filter, uses HTML pages)
  python3 scripts/scrape-boatsetter.py --browse

  # Scrape specific listing IDs directly
  python3 scripts/scrape-boatsetter.py --ids mxnsvgd lxzgskm bgndftc

  # Dry run (scrape but don't write to database)
  python3 scripts/scrape-boatsetter.py --dry-run

Requirements:
  - Python 3.7+ (stdlib only, no pip packages needed)
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

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

log = logging.getLogger("scraper")
log.setLevel(logging.DEBUG)

# Console handler (human-readable)
_console = logging.StreamHandler(sys.stderr)
_console.setLevel(logging.INFO)
_console.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT))
log.addHandler(_console)

# Optional JSON file handler (added in main() if --log-file is set)
_json_handler = None


class JSONLogHandler(logging.Handler):
    """Writes one JSON object per line for structured log ingestion."""

    def __init__(self, filepath):
        super().__init__()
        self._file = open(filepath, "a")

    def emit(self, record):
        entry = {
            "ts": datetime.datetime.now(datetime.UTC).isoformat() + "Z",
            "level": record.levelname,
            "msg": record.getMessage(),
        }
        if hasattr(record, "data"):
            entry["data"] = record.data
        self._file.write(json.dumps(entry) + "\n")
        self._file.flush()

    def close(self):
        self._file.close()
        super().close()


def log_with_data(level, msg, **data):
    """Log a message with structured data attached."""
    record = log.makeRecord(
        log.name, level, "(scraper)", 0, msg, (), None
    )
    record.data = data
    log.handle(record)


# ---------------------------------------------------------------------------
# Run tracking
# ---------------------------------------------------------------------------

class RunTracker:
    """Tracks stats and changes across a scrape run for the audit log."""

    def __init__(self, run_id, city, mode):
        self.run_id = run_id
        self.city = city
        self.mode = mode
        self.started_at = datetime.datetime.now(datetime.UTC).isoformat() + "Z"
        self.listings_discovered = 0
        self.listings_scraped = 0
        self.listings_skipped = 0
        self.listings_errored = 0
        self.listings_new = 0
        self.listings_updated = 0
        self.listings_unchanged = 0
        self.upserts_ok = 0
        self.upserts_failed = 0
        self.changes = []  # list of {listing_id, field, old, new}
        self.errors = []   # list of {listing_id, error}

    def record_change(self, listing_id, name, field, old_val, new_val):
        self.changes.append({
            "listing_id": listing_id,
            "name": name,
            "field": field,
            "old": old_val,
            "new": new_val,
        })

    def record_error(self, listing_id, error):
        self.errors.append({"listing_id": listing_id, "error": str(error)})

    def summary_dict(self):
        return {
            "run_id": self.run_id,
            "city": self.city,
            "mode": self.mode,
            "started_at": self.started_at,
            "finished_at": datetime.datetime.now(datetime.UTC).isoformat() + "Z",
            "listings_discovered": self.listings_discovered,
            "listings_scraped": self.listings_scraped,
            "listings_skipped": self.listings_skipped,
            "listings_errored": self.listings_errored,
            "listings_new": self.listings_new,
            "listings_updated": self.listings_updated,
            "listings_unchanged": self.listings_unchanged,
            "upserts_ok": self.upserts_ok,
            "upserts_failed": self.upserts_failed,
            "total_changes": len(self.changes),
            "total_errors": len(self.errors),
            "changes": self.changes[:200],  # cap for DB storage
            "errors": self.errors[:50],
        }


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

BOATSETTER_BASE = "https://www.boatsetter.com"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


def http_fetch(url, accept=None, timeout=20):
    """Fetch a URL and return the response body as a string."""
    headers = {**HEADERS}
    if accept:
        headers["Accept"] = accept
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def discover_listing_ids(city="miami", state="fl"):
    """Fetch browse pages for a city and extract all unique boat listing IDs."""
    slug = f"{city}--{state}--united-states"
    all_ids = set()

    for page_type in ("boat-rentals", "yacht-rentals"):
        url = f"{BOATSETTER_BASE}/{page_type}/{slug}"
        log.info("DISCOVER  Fetching %s page: %s", page_type, url)
        try:
            html = http_fetch(url)
            ids = set(re.findall(r'/boats/([a-z0-9]{3,10})', html, re.IGNORECASE))
            log.info("DISCOVER  Found %d listing IDs from %s", len(ids), page_type)
            all_ids.update(ids)
        except urllib.error.HTTPError as e:
            log.warning("DISCOVER  HTTP %d from %s — skipping", e.code, page_type)
        except Exception as e:
            log.error("DISCOVER  Error fetching %s: %s", page_type, e)

    log.info("DISCOVER  Total unique IDs: %d", len(all_ids))
    return sorted(all_ids)


# ---------------------------------------------------------------------------
# City registry — all markets we scrape from Boatsetter
# ---------------------------------------------------------------------------
# Each city has:
#   search_name: what to pass to the API's "near" param
#   bounds:      geographic bounding box (optional, improves result quality)
#   price_min:   default minimum price filter for premium inventory
#   browse_slug: city--state--country slug for browse mode (US only)
#   zoom:        zoom level for search API

CITIES = {
    # --- Florida ---
    "miami": {
        "search_name": "Miami, FL, USA",
        "bounds": {
            "ne_lat": "25.89203760360262",
            "ne_lng": "-80.06922397685548",
            "sw_lat": "25.668211956153495",
            "sw_lng": "-80.27933750224611",
        },
        "price_min": 500,
        "browse_slug": "miami--fl--united-states",
        "zoom": "12",
        "region": "Florida",
    },
    "fort-lauderdale": {
        "search_name": "Fort Lauderdale, FL, USA",
        "bounds": {
            "ne_lat": "26.23",
            "ne_lng": "-80.06",
            "sw_lat": "26.05",
            "sw_lng": "-80.20",
        },
        "price_min": 500,
        "browse_slug": "fort-lauderdale--fl--united-states",
        "zoom": "12",
        "region": "Florida",
    },
    "palm-beach": {
        "search_name": "West Palm Beach, FL, USA",
        "bounds": {
            "ne_lat": "26.75",
            "ne_lng": "-80.01",
            "sw_lat": "26.58",
            "sw_lng": "-80.12",
        },
        "price_min": 400,
        "browse_slug": "west-palm-beach--fl--united-states",
        "zoom": "12",
        "region": "Florida",
    },
    "key-west": {
        "search_name": "Key West, FL, USA",
        "bounds": {
            "ne_lat": "24.60",
            "ne_lng": "-81.72",
            "sw_lat": "24.52",
            "sw_lng": "-81.84",
        },
        "price_min": 300,
        "browse_slug": "key-west--fl--united-states",
        "zoom": "13",
        "region": "Florida",
    },
    "tampa": {
        "search_name": "Tampa, FL, USA",
        "bounds": {
            "ne_lat": "28.10",
            "ne_lng": "-82.35",
            "sw_lat": "27.82",
            "sw_lng": "-82.60",
        },
        "price_min": 300,
        "browse_slug": "tampa--fl--united-states",
        "zoom": "11",
        "region": "Florida",
    },
    "clearwater": {
        "search_name": "Clearwater, FL, USA",
        "bounds": {
            "ne_lat": "28.05",
            "ne_lng": "-82.72",
            "sw_lat": "27.88",
            "sw_lng": "-82.85",
        },
        "price_min": 200,
        "browse_slug": "clearwater--fl--united-states",
        "zoom": "12",
        "region": "Florida",
    },
    "sarasota": {
        "search_name": "Sarasota, FL, USA",
        "bounds": {
            "ne_lat": "27.42",
            "ne_lng": "-82.47",
            "sw_lat": "27.27",
            "sw_lng": "-82.63",
        },
        "price_min": 200,
        "browse_slug": "sarasota--fl--united-states",
        "zoom": "12",
        "region": "Florida",
    },
    "naples": {
        "search_name": "Naples, FL, USA",
        "bounds": {
            "ne_lat": "26.35",
            "ne_lng": "-81.72",
            "sw_lat": "26.10",
            "sw_lng": "-81.90",
        },
        "price_min": 300,
        "browse_slug": "naples--fl--united-states",
        "zoom": "11",
        "region": "Florida",
    },
    # --- California ---
    "los-angeles": {
        "search_name": "Los Angeles, CA, USA",
        "bounds": {
            "ne_lat": "33.98",
            "ne_lng": "-118.15",
            "sw_lat": "33.70",
            "sw_lng": "-118.52",
        },
        "price_min": 300,
        "browse_slug": "los-angeles--ca--united-states",
        "zoom": "11",
        "region": "California",
    },
    "san-diego": {
        "search_name": "San Diego, CA, USA",
        "bounds": {
            "ne_lat": "32.78",
            "ne_lng": "-117.05",
            "sw_lat": "32.60",
            "sw_lng": "-117.28",
        },
        "price_min": 300,
        "browse_slug": "san-diego--ca--united-states",
        "zoom": "12",
        "region": "California",
    },
    "san-francisco": {
        "search_name": "San Francisco, CA, USA",
        "bounds": {
            "ne_lat": "37.82",
            "ne_lng": "-122.35",
            "sw_lat": "37.70",
            "sw_lng": "-122.52",
        },
        "price_min": 300,
        "browse_slug": "san-francisco--ca--united-states",
        "zoom": "12",
        "region": "California",
    },
    # --- Other US ---
    "new-york": {
        "search_name": "New York, NY, USA",
        "bounds": {
            "ne_lat": "40.88",
            "ne_lng": "-73.85",
            "sw_lat": "40.65",
            "sw_lng": "-74.07",
        },
        "price_min": 400,
        "browse_slug": "new-york--ny--united-states",
        "zoom": "11",
        "region": "Northeast",
    },
    "chicago": {
        "search_name": "Chicago, IL, USA",
        "bounds": {
            "ne_lat": "42.00",
            "ne_lng": "-87.52",
            "sw_lat": "41.80",
            "sw_lng": "-87.75",
        },
        "price_min": 300,
        "browse_slug": "chicago--il--united-states",
        "zoom": "11",
        "region": "Midwest",
    },
    "seattle": {
        "search_name": "Seattle, WA, USA",
        "bounds": {
            "ne_lat": "47.72",
            "ne_lng": "-122.24",
            "sw_lat": "47.50",
            "sw_lng": "-122.44",
        },
        "price_min": 300,
        "browse_slug": "seattle--wa--united-states",
        "zoom": "11",
        "region": "Pacific Northwest",
    },
    "austin": {
        "search_name": "Austin, TX, USA",
        "bounds": {
            "ne_lat": "30.52",
            "ne_lng": "-97.60",
            "sw_lat": "30.18",
            "sw_lng": "-97.90",
        },
        "price_min": 200,
        "browse_slug": "austin--tx--united-states",
        "zoom": "11",
        "region": "Texas",
    },
    # --- Mediterranean ---
    "ibiza": {
        "search_name": "Ibiza, Spain",
        "bounds": None,
        "price_min": 300,
        "browse_slug": None,
        "zoom": "10",
        "region": "Mediterranean",
    },
    "cannes": {
        "search_name": "Cannes, France",
        "bounds": None,
        "price_min": 300,
        "browse_slug": None,
        "zoom": "11",
        "region": "Mediterranean",
    },
    "nice": {
        "search_name": "Nice, France",
        "bounds": None,
        "price_min": 300,
        "browse_slug": None,
        "zoom": "11",
        "region": "Mediterranean",
    },
    "saint-tropez": {
        "search_name": "Saint-Tropez, France",
        "bounds": None,
        "price_min": 300,
        "browse_slug": None,
        "zoom": "12",
        "region": "Mediterranean",
    },
    "amalfi": {
        "search_name": "Amalfi, Italy",
        "bounds": None,
        "price_min": 200,
        "browse_slug": None,
        "zoom": "12",
        "region": "Mediterranean",
    },
    "sardinia": {
        "search_name": "Olbia, Italy",
        "bounds": None,
        "price_min": 200,
        "browse_slug": None,
        "zoom": "10",
        "region": "Mediterranean",
    },
    "sicily": {
        "search_name": "Catania, Italy",
        "bounds": None,
        "price_min": 200,
        "browse_slug": None,
        "zoom": "10",
        "region": "Mediterranean",
    },
}


# ---------------------------------------------------------------------------
# City alias normalization — roll suburbs into main city names
# ---------------------------------------------------------------------------

CITY_ALIASES = {
    # Miami metro
    "Miami Beach": "Miami",
    "North Bay Village": "Miami",
    "Bay Harbor Islands": "Miami",
    "Key Biscayne": "Miami",
    "Sunny Isles Beach": "Miami",
    "North Miami": "Miami",
    "Coral Gables": "Miami",
    "Aventura": "Miami",
    "Coconut Grove": "Miami",
    "Doral": "Miami",
    "Bal Harbour": "Miami",
    "Surfside": "Miami",
    "Fisher Island": "Miami",
    # Fort Lauderdale metro
    "Dania Beach": "Fort Lauderdale",
    "Pompano Beach": "Fort Lauderdale",
    "Lauderdale-by-the-Sea": "Fort Lauderdale",
    "Lauderdale-By-The-Sea": "Fort Lauderdale",
    "Hollywood": "Fort Lauderdale",
    "Hallandale Beach": "Fort Lauderdale",
    "Deerfield Beach": "Fort Lauderdale",
    # Key West area
    "Stock Island": "Key West",
    "Naval Air Station Key West": "Key West",
    "Key Colony Beach": "Key West",
    "Marathon": "Key West",
    "Islamorada": "Key West",
    # Palm Beach area
    "West Palm Beach": "Palm Beach",
    "Lake Worth": "Palm Beach",
    "Boca Raton": "Palm Beach",
    "Delray Beach": "Palm Beach",
    "Jupiter": "Palm Beach",
    "Singer Island": "Palm Beach",
    # Tampa Bay area
    "St. Petersburg": "Tampa",
    "St Petersburg": "Tampa",
    "Tierra Verde": "Tampa",
    "Apollo Beach": "Tampa",
    "Ruskin": "Tampa",
    # Clearwater area
    "Indian Rocks Beach": "Clearwater",
    "Dunedin": "Clearwater",
    "Tarpon Springs": "Clearwater",
    # San Diego metro
    "Coronado": "San Diego",
    "Chula Vista": "San Diego",
    "National City": "San Diego",
    "Point Loma": "San Diego",
    # LA metro
    "Marina del Rey": "Los Angeles",
    "Marina Del Rey": "Los Angeles",
    "Redondo Beach": "Los Angeles",
    "Long Beach": "Los Angeles",
    "Manhattan Beach": "Los Angeles",
    "Hermosa Beach": "Los Angeles",
    "Playa del Rey": "Los Angeles",
    "San Pedro": "Los Angeles",
    "Newport Beach": "Los Angeles",
    "Huntington Beach": "Los Angeles",
    # San Francisco Bay
    "Sausalito": "San Francisco",
    "Tiburon": "San Francisco",
    "Emeryville": "San Francisco",
    "Oakland": "San Francisco",
    "Berkeley": "San Francisco",
    "Alameda": "San Francisco",
    # Mediterranean aliases
    "Eivissa": "Ibiza",
    "Sant Antoni de Portmany": "Ibiza",
    "Santa Eulalia del Rio": "Ibiza",
    "Santa Eulària des Riu": "Ibiza",
    "Olbia": "Sardinia",
    "Porto Cervo": "Sardinia",
    "Catania": "Sicily",
    "Palermo": "Sicily",
    "Taormina": "Sicily",
    "Positano": "Amalfi",
    "Sorrento": "Amalfi",
    "Salerno": "Amalfi",
    "Mougins": "Cannes",
    "Antibes": "Cannes",
    "Juan-les-Pins": "Cannes",
    "Villefranche-sur-Mer": "Nice",
    "Saint-Jean-Cap-Ferrat": "Nice",
    "Ramatuelle": "Saint-Tropez",
    "Gassin": "Saint-Tropez",
}


def normalize_city(raw_city):
    """Normalize a city name using the alias map. Returns the canonical name."""
    if not raw_city:
        return "Unknown"
    return CITY_ALIASES.get(raw_city, raw_city)

# Backwards-compatible default
MIAMI_BOUNDS = CITIES["miami"]["bounds"]


def search_listing_ids(city="Miami, FL, USA", price_min=None, price_max=None,
                       trip_date=None, per_page=100, bounds=None, zoom="12"):
    """Use the /domestic/v2/search API to find boat listing IDs."""
    params = {
        "near": city,
        "zoom_level": zoom,
        "per_page": str(per_page),
        "page": "1",
        "sort_by": "recommended",
        "include_experience_tags": "true",
    }

    if bounds:
        params.update(bounds)

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
        log.info("SEARCH    Page %d: %s...", page, url[:120])

        try:
            body = http_fetch(url, accept="application/json")
            data = json.loads(body)
        except Exception as e:
            log.error("SEARCH    Error on page %d: %s", page, e)
            break

        boats = data.get("data", [])
        meta = data.get("meta", {})
        ids = [b["boat_public_id"] for b in boats if "boat_public_id" in b]
        all_ids.extend(ids)

        total = meta.get("total_count", len(ids))
        total_pages = meta.get("total_pages", 1)
        log.info("SEARCH    Got %d boats (page %d/%d, total: %d)", len(ids), page, total_pages, total)

        if page >= total_pages:
            break
        page += 1
        time.sleep(0.5)

    deduped = list(dict.fromkeys(all_ids))
    log.info("SEARCH    Total unique IDs: %d", len(deduped))
    return deduped


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

def extract_listing(listing_id):
    """Fetch a listing page and extract data from __NEXT_DATA__."""
    url = f"{BOATSETTER_BASE}/boats/{listing_id}"
    html = http_fetch(url)

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
    raw_city = loc.get("city") or "Unknown"
    city = normalize_city(raw_city)
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


# ---------------------------------------------------------------------------
# Database: fetch existing record for diff
# ---------------------------------------------------------------------------

def fetch_existing_boat(listing_id, supabase_url, supabase_key):
    """Fetch the current record from Supabase for change detection."""
    encoded_id = urllib.parse.quote(listing_id)
    url = (
        f"{supabase_url}/rest/v1/boats"
        f"?boatsetter_listing_id=eq.{encoded_id}"
        f"&select=*"
    )
    req = urllib.request.Request(url, headers={
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
            return rows[0] if rows else None
    except Exception as e:
        log.debug("FETCH     Could not fetch existing record for %s: %s", listing_id, e)
        return None


# ---------------------------------------------------------------------------
# Change detection
# ---------------------------------------------------------------------------

# Fields we care about tracking changes for, grouped by importance
TRACKED_FIELDS = {
    # Critical — pricing & availability
    "hourly_rate":           "Hourly rate",
    "pricing_tiers":         "Pricing tiers",
    "available_start_times": "Available start times",
    "min_duration_hours":    "Min duration",
    "max_duration_hours":    "Max duration",
    "is_active":             "Active status",
    # Important — capacity & service
    "capacity":              "Guest capacity",
    "captain_included":      "Captain included",
    "captain_optional":      "Captain optional",
    "fuel_included":         "Fuel included",
    "service_type":          "Service type",
    # Informational
    "rating":                "Rating",
    "review_count":          "Review count",
    "captain_name":          "Captain name",
    "captain_rating":        "Captain rating",
    "amenities":             "Amenities",
    "name":                  "Listing name",
    "type":                  "Boat type",
    "photo_urls":            "Photos",
    "location":              "Location",
    "city":                  "City",
}


def normalize_for_compare(val):
    """Normalize a value for comparison (handle JSON types from Supabase)."""
    if val is None:
        return None
    if isinstance(val, float):
        return round(val, 2)
    if isinstance(val, list):
        # Sort lists of dicts by converting to sorted JSON
        try:
            return json.dumps(sorted(val, key=lambda x: json.dumps(x, sort_keys=True) if isinstance(x, dict) else str(x)), sort_keys=True)
        except (TypeError, ValueError):
            return json.dumps(val, sort_keys=True)
    return val


def format_change_value(val):
    """Format a value for human-readable change log output."""
    if val is None:
        return "null"
    if isinstance(val, bool):
        return str(val).lower()
    if isinstance(val, list):
        if len(val) == 0:
            return "[]"
        if len(val) > 3:
            return f"[{len(val)} items]"
        if all(isinstance(v, dict) for v in val):
            # Pricing tiers
            parts = []
            for v in val:
                if "hours" in v and "price" in v:
                    parts.append(f"{v['hours']}h=${v['price']}")
                else:
                    parts.append(str(v))
            return ", ".join(parts)
        return ", ".join(str(v) for v in val)
    if isinstance(val, float):
        return f"${val:.2f}" if val > 1 else f"{val}"
    return str(val)


def diff_listing(new_data, existing_data, tracker):
    """Compare scraped data against existing DB record and log changes.

    Returns: 'new', 'updated', or 'unchanged'
    """
    listing_id = new_data["boatsetter_listing_id"]
    name = new_data.get("name", listing_id)

    if existing_data is None:
        log.info(
            "NEW       %s — %s ($%.2f/hr, %d pax, %s)",
            listing_id, name, new_data.get("hourly_rate", 0),
            new_data.get("capacity", 0), new_data.get("city", "?")
        )
        log_with_data(
            logging.INFO, f"New listing discovered: {name}",
            event="listing_new", listing_id=listing_id, name=name,
            hourly_rate=new_data.get("hourly_rate"),
            capacity=new_data.get("capacity"),
            city=new_data.get("city"),
        )
        tracker.listings_new += 1
        return "new"

    changes_found = []

    for field, label in TRACKED_FIELDS.items():
        old_val = existing_data.get(field)
        new_val = new_data.get(field)

        old_norm = normalize_for_compare(old_val)
        new_norm = normalize_for_compare(new_val)

        if old_norm != new_norm:
            old_display = format_change_value(old_val)
            new_display = format_change_value(new_val)
            changes_found.append((field, label, old_display, new_display))
            tracker.record_change(listing_id, name, field, old_display, new_display)

    if not changes_found:
        log.debug("UNCHANGED %s — %s", listing_id, name)
        tracker.listings_unchanged += 1
        return "unchanged"

    # Log each change
    tracker.listings_updated += 1
    log.info("CHANGED   %s — %s (%d field(s) changed):", listing_id, name, len(changes_found))
    for field, label, old_display, new_display in changes_found:
        level = logging.WARNING if field in ("hourly_rate", "pricing_tiers", "is_active", "capacity", "available_start_times") else logging.INFO
        log.log(level, "  %-22s %s → %s", label + ":", old_display, new_display)
        log_with_data(
            level, f"{label} changed for {name}",
            event="field_changed", listing_id=listing_id, name=name,
            field=field, old=old_display, new=new_display,
        )

    return "updated"


# ---------------------------------------------------------------------------
# Database: upsert
# ---------------------------------------------------------------------------

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
        log.error("DB ERROR  HTTP %d upserting %s: %s", e.code, boat_data.get("boatsetter_listing_id"), body[:300])
        return False


def write_scrape_log(tracker, supabase_url, supabase_key):
    """Write the run summary to the scrape_logs table in Supabase."""
    summary = tracker.summary_dict()
    data = json.dumps(summary).encode("utf-8")
    req = urllib.request.Request(
        f"{supabase_url}/rest/v1/scrape_logs",
        data=data,
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            log.info("AUDIT     Scrape log written to scrape_logs table (run_id: %s)", tracker.run_id)
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if "42P01" in body or "relation" in body.lower():
            log.warning(
                "AUDIT     scrape_logs table does not exist yet — run this SQL to create it:\n"
                "          CREATE TABLE scrape_logs (\n"
                "            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,\n"
                "            run_id text NOT NULL,\n"
                "            city text,\n"
                "            mode text,\n"
                "            started_at timestamptz,\n"
                "            finished_at timestamptz,\n"
                "            listings_discovered int DEFAULT 0,\n"
                "            listings_scraped int DEFAULT 0,\n"
                "            listings_skipped int DEFAULT 0,\n"
                "            listings_errored int DEFAULT 0,\n"
                "            listings_new int DEFAULT 0,\n"
                "            listings_updated int DEFAULT 0,\n"
                "            listings_unchanged int DEFAULT 0,\n"
                "            upserts_ok int DEFAULT 0,\n"
                "            upserts_failed int DEFAULT 0,\n"
                "            total_changes int DEFAULT 0,\n"
                "            total_errors int DEFAULT 0,\n"
                "            changes jsonb DEFAULT '[]',\n"
                "            errors jsonb DEFAULT '[]',\n"
                "            created_at timestamptz DEFAULT now()\n"
                "          );"
            )
        else:
            log.error("AUDIT     Failed to write scrape log: HTTP %d: %s", e.code, body[:300])
        return False
    except Exception as e:
        log.error("AUDIT     Failed to write scrape log: %s", e)
        return False


# ---------------------------------------------------------------------------
# Deactivation: mark boats that are no longer on Boatsetter
# ---------------------------------------------------------------------------

def deactivate_stale_boats(discovered_ids, supabase_url, supabase_key, tracker):
    """Mark boats as inactive if they weren't found in the latest all-cities scrape.

    Only called in --all-cities mode when we have a comprehensive view of
    what's currently listed on Boatsetter.
    """
    log.info("")
    log.info("DEACTIVATE Checking for stale boats not found in this scrape...")

    # Fetch all active boatsetter_listing_ids from the database
    all_active = []
    offset = 0
    page_size = 500
    while True:
        req = urllib.request.Request(
            f"{supabase_url}/rest/v1/boats?select=boatsetter_listing_id,name&is_active=eq.true&limit={page_size}&offset={offset}",
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                page = json.loads(resp.read().decode())
                if not page:
                    break
                all_active.extend(page)
                if len(page) < page_size:
                    break
                offset += page_size
        except Exception as e:
            log.error("DEACTIVATE Failed to fetch active boats: %s", e)
            return

    log.info("DEACTIVATE %d active boats in database, %d discovered in this scrape",
             len(all_active), len(discovered_ids))

    # Find boats that are active in DB but were NOT discovered
    stale = [
        b for b in all_active
        if b["boatsetter_listing_id"] not in discovered_ids
    ]

    if not stale:
        log.info("DEACTIVATE No stale boats found — all active boats were discovered")
        return

    log.info("DEACTIVATE Found %d stale boats to deactivate:", len(stale))
    for b in stale:
        log.info("  %s — %s", b["boatsetter_listing_id"], b.get("name", "?")[:60])

    # Deactivate each stale boat
    deactivated = 0
    for b in stale:
        lid = b["boatsetter_listing_id"]
        patch_data = json.dumps({"is_active": False}).encode("utf-8")
        req = urllib.request.Request(
            f"{supabase_url}/rest/v1/boats?boatsetter_listing_id=eq.{lid}",
            data=patch_data,
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            method="PATCH",
        )
        try:
            with urllib.request.urlopen(req, timeout=10):
                deactivated += 1
                log.info("DEACTIVATE Deactivated %s — %s", lid, b.get("name", "?")[:50])
        except Exception as e:
            log.error("DEACTIVATE Failed to deactivate %s: %s", lid, e)
            tracker.record_error(lid, f"deactivate_failed: {e}")

    log.info("DEACTIVATE Done: %d/%d stale boats deactivated", deactivated, len(stale))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def discover_for_city(city_key, price_min_override=None, price_max=None,
                      trip_date=None, browse=False):
    """Discover listing IDs for a configured city.

    Returns (list_of_ids, city_config).
    """
    config = CITIES.get(city_key)
    if not config:
        log.error("DISCOVER  Unknown city '%s'. Available: %s", city_key, ", ".join(CITIES.keys()))
        return [], None

    price_min = price_min_override if price_min_override is not None else config["price_min"]

    if browse and config.get("browse_slug"):
        parts = config["browse_slug"].split("--")
        city_slug = parts[0]
        state_slug = parts[1] if len(parts) > 1 else ""
        log.info("DISCOVER  [%s] Browsing listings...", city_key)
        ids = discover_listing_ids(city_slug, state_slug)
    else:
        filters = []
        if price_min:
            filters.append(f"${price_min}+")
        if price_max:
            filters.append(f"max ${price_max}")
        if trip_date:
            filters.append(f"date={trip_date}")
        filter_str = f" ({', '.join(filters)})" if filters else ""
        log.info("DISCOVER  [%s] Searching %s%s...", city_key, config["search_name"], filter_str)
        ids = search_listing_ids(
            city=config["search_name"],
            price_min=price_min,
            price_max=price_max,
            trip_date=trip_date,
            bounds=config.get("bounds"),
            zoom=config.get("zoom", "12"),
        )

    log.info("DISCOVER  [%s] Found %d listing IDs", city_key, len(ids))
    return ids, config


def main():
    parser = argparse.ArgumentParser(description="Scrape Boatsetter listings into Supabase")
    parser.add_argument("--city", default="miami", help="City key (default: miami). Use --list-cities to see all.")
    parser.add_argument("--all-cities", action="store_true", help="Scrape all configured cities")
    parser.add_argument("--list-cities", action="store_true", help="Show configured cities and exit")
    parser.add_argument("--state", default="fl", help="State abbreviation for custom city (default: fl)")
    parser.add_argument("--ids", nargs="+", help="Scrape specific listing IDs directly")
    parser.add_argument("--browse", action="store_true", help="Use browse pages instead of search API")
    parser.add_argument("--price-min", type=int, help="Minimum price filter (overrides city default)")
    parser.add_argument("--price-max", type=int, help="Maximum price filter (for search API)")
    parser.add_argument("--trip-date", help="Trip date YYYY-MM-DD (for search API)")
    parser.add_argument("--dry-run", action="store_true", help="Scrape but don't write to database")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests in seconds")
    parser.add_argument("--log-file", help="Path to JSON log file for structured log output")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable debug-level logging")
    args = parser.parse_args()

    # List cities mode
    if args.list_cities:
        print(f"\n{'City':<20} {'Search Name':<30} {'Min Price':<12} {'Browse'}")
        print("-" * 75)
        for key, cfg in CITIES.items():
            browse = "yes" if cfg.get("browse_slug") else "no"
            print(f"{key:<20} {cfg['search_name']:<30} ${cfg['price_min']:<11} {browse}")
        print(f"\n{len(CITIES)} cities configured.\n")
        return

    if args.verbose:
        _console.setLevel(logging.DEBUG)

    # JSON log file
    if args.log_file:
        global _json_handler
        _json_handler = JSONLogHandler(args.log_file)
        _json_handler.setLevel(logging.DEBUG)
        log.addHandler(_json_handler)
        log.info("LOG       Writing structured logs to %s", args.log_file)

    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")

    if not args.dry_run and (not supabase_url or not supabase_key):
        log.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables (or use --dry-run)")
        sys.exit(1)

    # --- Run ID & tracker ---
    run_id = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    mode = "ids" if args.ids else ("browse" if args.browse else ("all-cities" if args.all_cities else "search"))
    city_label = "all" if args.all_cities else args.city
    tracker = RunTracker(run_id, city_label, mode)

    log.info("=" * 70)
    log.info("RUN START run_id=%s  city=%s  mode=%s", run_id, city_label, mode)
    log.info("=" * 70)
    log_with_data(
        logging.INFO, "Scrape run started",
        event="run_start", run_id=run_id, city=city_label, mode=mode,
        dry_run=args.dry_run,
    )

    # --- Discovery ---
    listing_ids = []

    if args.ids:
        listing_ids = args.ids
        log.info("DISCOVER  Using %d provided listing IDs: %s", len(listing_ids), ", ".join(listing_ids))

    elif args.all_cities:
        log.info("DISCOVER  Scraping all %d configured cities...", len(CITIES))
        log.info("")
        seen_ids = set()
        for city_key in CITIES:
            city_ids, _ = discover_for_city(
                city_key,
                price_min_override=args.price_min,
                price_max=args.price_max,
                trip_date=args.trip_date,
                browse=args.browse,
            )
            new_ids = [lid for lid in city_ids if lid not in seen_ids]
            dupes = len(city_ids) - len(new_ids)
            if dupes > 0:
                log.info("DISCOVER  [%s] %d unique, %d duplicates skipped", city_key, len(new_ids), dupes)
            seen_ids.update(new_ids)
            listing_ids.extend(new_ids)
            time.sleep(0.5)  # brief pause between city searches
        log.info("")
        log.info("DISCOVER  Total unique listings across all cities: %d", len(listing_ids))

    elif args.city in CITIES:
        city_ids, _ = discover_for_city(
            args.city,
            price_min_override=args.price_min,
            price_max=args.price_max,
            trip_date=args.trip_date,
            browse=args.browse,
        )
        listing_ids = city_ids

    elif args.browse:
        log.info("DISCOVER  Browsing listings for %s, %s...", args.city, args.state.upper())
        listing_ids = discover_listing_ids(args.city, args.state)

    else:
        # Fallback: treat --city as a raw search name
        city_name = f"{args.city.replace('-', ' ').title()}, {args.state.upper()}, USA"
        filters = []
        if args.price_min:
            filters.append(f"price_min=${args.price_min}")
        if args.price_max:
            filters.append(f"price_max=${args.price_max}")
        if args.trip_date:
            filters.append(f"date={args.trip_date}")
        filter_str = f" ({', '.join(filters)})" if filters else ""
        log.info("DISCOVER  Searching for listings in %s%s...", city_name, filter_str)
        listing_ids = search_listing_ids(
            city=city_name,
            price_min=args.price_min,
            price_max=args.price_max,
            trip_date=args.trip_date,
        )

    tracker.listings_discovered = len(listing_ids)

    if not listing_ids:
        log.warning("DISCOVER  No listings found — exiting")
        log_with_data(logging.WARNING, "No listings found", event="no_listings")
        sys.exit(1)

    log.info("")
    log.info("SCRAPE    Starting extraction of %d listings...", len(listing_ids))
    log.info("")

    # --- Scrape & diff ---
    boats = []
    for i, lid in enumerate(listing_ids):
        progress = f"[{i+1}/{len(listing_ids)}]"
        log.info("SCRAPE    %s Fetching /boats/%s...", progress, lid)

        try:
            boat = extract_listing(lid)
            if boat:
                tracker.listings_scraped += 1
                boats.append(boat)
                log.info(
                    "SCRAPE    %s Extracted: $%.2f/hr | %d pax | %s | %s",
                    progress, boat["hourly_rate"], boat["capacity"],
                    boat["type"], boat["name"][:50]
                )

                # Change detection (skip in dry-run without DB access)
                if supabase_url and supabase_key:
                    existing = fetch_existing_boat(lid, supabase_url, supabase_key)
                    diff_listing(boat, existing, tracker)
                elif args.dry_run:
                    log.debug("DIFF      Skipping diff (dry-run, no DB credentials)")
            else:
                tracker.listings_skipped += 1
                log.warning("SCRAPE    %s No data extracted for %s — skipping", progress, lid)
        except urllib.error.HTTPError as e:
            tracker.listings_errored += 1
            tracker.record_error(lid, f"HTTP {e.code}")
            log.error("SCRAPE    %s HTTP %d fetching %s", progress, e.code, lid)
        except Exception as e:
            tracker.listings_errored += 1
            tracker.record_error(lid, str(e))
            log.error("SCRAPE    %s Error extracting %s: %s", progress, lid, e)

        if i < len(listing_ids) - 1:
            time.sleep(args.delay)

    # --- Summary ---
    log.info("")
    log.info("=" * 70)
    log.info("SUMMARY   Extraction complete")
    log.info("=" * 70)
    log.info("  Discovered:  %d listings", tracker.listings_discovered)
    log.info("  Scraped:     %d", tracker.listings_scraped)
    log.info("  Skipped:     %d (no data)", tracker.listings_skipped)
    log.info("  Errors:      %d", tracker.listings_errored)
    log.info("  ---")
    log.info("  New:         %d", tracker.listings_new)
    log.info("  Updated:     %d (%d field changes)", tracker.listings_updated, len(tracker.changes))
    log.info("  Unchanged:   %d", tracker.listings_unchanged)

    if tracker.changes:
        log.info("")
        log.info("CHANGES   %d field(s) changed across %d listing(s):", len(tracker.changes), tracker.listings_updated)

        # Group changes by type for summary
        change_counts = {}
        for c in tracker.changes:
            label = TRACKED_FIELDS.get(c["field"], c["field"])
            change_counts[label] = change_counts.get(label, 0) + 1

        for label, count in sorted(change_counts.items(), key=lambda x: -x[1]):
            log.info("  %-22s %d listing(s)", label + ":", count)

    if tracker.errors:
        log.info("")
        log.warning("ERRORS    %d listing(s) had errors:", len(tracker.errors))
        for err in tracker.errors[:10]:
            log.warning("  %s: %s", err["listing_id"], err["error"])

    # --- Rate listing by hourly rate ---
    boats.sort(key=lambda b: b.get("hourly_rate") or 0, reverse=True)
    log.info("")
    log.info("INVENTORY By hourly rate:")
    for b in boats:
        log.info("  $%8.2f/hr | %3d pax | %-10s | %s", b["hourly_rate"], b["capacity"], b["type"], b["name"][:45])

    # --- Upsert ---
    if args.dry_run:
        log.info("")
        log.info("[DRY RUN] Skipping database upsert and scrape log")
        log_with_data(
            logging.INFO, "Dry run complete",
            event="run_end_dry", run_id=run_id,
            scraped=tracker.listings_scraped,
            new=tracker.listings_new,
            updated=tracker.listings_updated,
            unchanged=tracker.listings_unchanged,
        )
        _print_final_summary(tracker)
        notify_slack(tracker, dry_run=True)
        return

    log.info("")
    log.info("UPSERT    Writing %d boats to Supabase...", len(boats))

    for boat in boats:
        lid = boat["boatsetter_listing_id"]
        if upsert_boat(boat, supabase_url, supabase_key):
            tracker.upserts_ok += 1
            log.debug("UPSERT    OK %s", lid)
        else:
            tracker.upserts_failed += 1
            log.error("UPSERT    FAILED %s — %s", lid, boat["name"][:50])
            tracker.record_error(lid, "upsert_failed")

    log.info("UPSERT    Done: %d/%d succeeded", tracker.upserts_ok, len(boats))

    if tracker.upserts_failed > 0:
        log.warning("UPSERT    %d upserts FAILED — check errors above", tracker.upserts_failed)

    # --- Deactivate stale boats (only in --all-cities mode) ---
    if args.all_cities and listing_ids:
        deactivate_stale_boats(set(listing_ids), supabase_url, supabase_key, tracker)

    # --- Write audit log ---
    write_scrape_log(tracker, supabase_url, supabase_key)

    # --- Final summary ---
    log_with_data(
        logging.INFO, "Scrape run complete",
        event="run_end", run_id=run_id,
        **{k: v for k, v in tracker.summary_dict().items() if k not in ("changes", "errors")}
    )
    _print_final_summary(tracker)
    notify_slack(tracker)


# ---------------------------------------------------------------------------
# Slack notification
# ---------------------------------------------------------------------------

SLACK_CHANNEL_SCRAPER = "C0ALPT3E8QZ"  # #splyt-scraper-logs


def notify_slack(tracker, dry_run=False):
    """Post a scrape run summary to the #splyt-scraper-logs Slack channel."""
    slack_token = os.environ.get("SLACK_BOT_TOKEN", "")
    if not slack_token:
        log.warning("SLACK     No SLACK_BOT_TOKEN set - skipping Slack notification")
        return

    s = tracker.summary_dict()
    status = "DRY RUN" if dry_run else ("ERRORS" if s["total_errors"] > 0 else "OK")
    emoji_map = {"DRY RUN": ":test_tube:", "ERRORS": ":rotating_light:", "OK": ":white_check_mark:"}
    emoji = emoji_map.get(status, ":boat:")

    change_lines = ""
    if tracker.changes:
        change_counts = {}
        for c in tracker.changes:
            label = c["field"]
            change_counts[label] = change_counts.get(label, 0) + 1
        parts = []
        for label, count in sorted(change_counts.items(), key=lambda x: -x[1]):
            parts.append(f"  \u2022 {label}: {count} listing(s)")
        change_lines = "\n" + "*Field Changes (" + str(s["total_changes"]) + "):*\n" + "\n".join(parts)

    error_lines = ""
    if tracker.errors:
        parts = []
        for e in tracker.errors[:5]:
            parts.append(f"  \u2022 " + "" + ": " + e["error"])
        error_lines = "\n" + "*Errors (" + str(s["total_errors"]) + "):*\n" + "\n".join(parts)

    text = (
        emoji + " *Boatsetter Scrape \u2014 " + status + "*\n"
        + "*City:* " + str(s["city"]) + "  |  *Mode:* " + str(s["mode"]) + "\n"
        + "*Run ID:* `" + s["run_id"][:8] + "`\n\n"
        + "*Results:*\n"
        + "  \u2022 Discovered: " + str(s["listings_discovered"]) + "\n"
        + "  \u2022 Scraped: " + str(s["listings_scraped"]) + "\n"
        + "  \u2022 New: " + str(s["listings_new"]) + "\n"
        + "  \u2022 Updated: " + str(s["listings_updated"]) + "\n"
        + "  \u2022 Unchanged: " + str(s["listings_unchanged"]) + "\n"
        + "  \u2022 Errors: " + str(s["listings_errored"])
        + change_lines
        + error_lines + "\n\n"
        + "_Started " + s["started_at"][:19] + "Z \u2014 Finished " + s["finished_at"][:19] + "Z_"
    )

    payload = json.dumps({"channel": SLACK_CHANNEL_SCRAPER, "text": text}).encode("utf-8")
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=payload,
        headers={
            "Authorization": "Bearer " + slack_token,
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            if result.get("ok"):
                log.info("SLACK     Summary posted to #splyt-scraper-logs")
            else:
                log.warning("SLACK     Post failed: %s", result.get("error", "unknown"))
    except Exception as e:
        log.warning("SLACK     Could not post to Slack: %s", e)


def _print_final_summary(tracker):
    """Print the final run summary banner."""
    log.info("")
    log.info("=" * 70)
    log.info("RUN COMPLETE  run_id=%s", tracker.run_id)
    log.info("  %d scraped | %d new | %d updated | %d unchanged | %d errors",
             tracker.listings_scraped, tracker.listings_new,
             tracker.listings_updated, tracker.listings_unchanged,
             tracker.listings_errored)
    if tracker.changes:
        log.info("  %d total field changes detected", len(tracker.changes))
    if not tracker.changes and tracker.listings_scraped > 0 and tracker.listings_unchanged > 0:
        log.info("  Database is current — no changes detected")
    log.info("=" * 70)


if __name__ == "__main__":
    main()
