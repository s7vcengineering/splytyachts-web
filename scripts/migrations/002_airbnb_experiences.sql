-- Airbnb Experiences table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS airbnb_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_provider TEXT NOT NULL DEFAULT 'airbnb',
  source_listing_id TEXT NOT NULL,
  source_url TEXT,
  title TEXT NOT NULL,
  description TEXT,
  city TEXT,
  region TEXT,
  country TEXT DEFAULT 'United States',
  category TEXT,
  price_amount INTEGER,
  price_type TEXT DEFAULT 'per_guest',
  currency TEXT DEFAULT 'USD',
  duration_minutes INTEGER,
  rating NUMERIC(3,2),
  review_count INTEGER DEFAULT 0,
  host_name TEXT,
  badges TEXT[] DEFAULT '{}',
  photo_urls TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  scrape_status TEXT DEFAULT 'pending',
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_provider, source_listing_id)
);

CREATE INDEX IF NOT EXISTS idx_airbnb_exp_city ON airbnb_experiences(city);
CREATE INDEX IF NOT EXISTS idx_airbnb_exp_category ON airbnb_experiences(category);
CREATE INDEX IF NOT EXISTS idx_airbnb_exp_active ON airbnb_experiences(is_active);
CREATE INDEX IF NOT EXISTS idx_airbnb_exp_price ON airbnb_experiences(price_amount);
CREATE INDEX IF NOT EXISTS idx_airbnb_exp_rating ON airbnb_experiences(rating);
