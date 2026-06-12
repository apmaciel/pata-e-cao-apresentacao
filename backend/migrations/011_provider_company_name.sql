-- Armazena o nome legal/de registro separadamente do nome comercial público.
ALTER TABLE providers ADD COLUMN company_name VARCHAR(200);
-- Backfill: prestadores existentes mantêm seu business_name atual como company_name.
UPDATE providers SET company_name = business_name;
