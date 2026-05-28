-- Add social_links JSONB column to providers (mirrors users.social_links).
ALTER TABLE providers ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';

-- Rate-limit tracking for restricted fields.
-- business_name and logo_image_id: one change per calendar month.
-- accepts_* service flags: one change per calendar month.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_business_name_change TIMESTAMPTZ;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_logo_change TIMESTAMPTZ;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_service_change TIMESTAMPTZ;
