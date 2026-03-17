-- Airbnb Stays (rental listings) table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS airbnb_stays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_provider TEXT NOT NULL DEFAULT 'airbnb',
  source_listing_id TEXT NOT NULL,
  source_url TEXT,
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT,
  city TEXT,
  region TEXT,
  country TEXT DEFAULT 'United States',
  neighborhood TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  nightly_rate INTEGER,
  total_price INTEGER,
  currency TEXT DEFAULT 'USD',
  bedrooms INTEGER,
  beds INTEGER,
  bathrooms NUMERIC(3,1),
  max_guests INTEGER,
  rating NUMERIC(3,2),
  review_count INTEGER DEFAULT 0,
  host_name TEXT,
  is_superhost BOOLEAN DEFAULT false,
  amenities TEXT[] DEFAULT '{}',
  badges TEXT[] DEFAULT '{}',
  photo_urls TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  scrape_status TEXT DEFAULT 'pending',
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_provider, source_listing_id)
);

CREATE INDEX IF NOT EXISTS idx_airbnb_stays_city ON airbnb_stays(city);
CREATE INDEX IF NOT EXISTS idx_airbnb_stays_active ON airbnb_stays(is_active);
CREATE INDEX IF NOT EXISTS idx_airbnb_stays_price ON airbnb_stays(nightly_rate);
CREATE INDEX IF NOT EXISTS idx_airbnb_stays_rating ON airbnb_stays(rating);
CREATE INDEX IF NOT EXISTS idx_airbnb_stays_guests ON airbnb_stays(max_guests);
CREATE INDEX IF NOT EXISTS idx_airbnb_stays_bedrooms ON airbnb_stays(bedrooms);
