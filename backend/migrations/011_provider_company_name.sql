-- Store the legal / registration name separately from the public trade name.
ALTER TABLE providers ADD COLUMN company_name VARCHAR(200);
-- Backfill: existing providers keep their current business_name as company_name.
UPDATE providers SET company_name = business_name;
