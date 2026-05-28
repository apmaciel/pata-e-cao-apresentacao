-- 006: Extend pets + pet_health_records + users for pet owner registration flow

-- pets: add slug, birth_date, color, height_cm, size
ALTER TABLE pets ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS color VARCHAR(50);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS height_cm DECIMAL(5,2);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS size VARCHAR(20) NOT NULL DEFAULT 'medium';

-- Backfill slugs for existing rows: name-kebab + first 4 chars of id
UPDATE pets SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING(id::text, 1, 4) WHERE slug IS NULL;

ALTER TABLE pets ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pets_slug_unique ON pets(slug);

ALTER TABLE pets ADD CONSTRAINT pets_size_check CHECK (size IN ('small', 'medium', 'large'));

-- pet_health_records: add is_neutered, behavior_notes
ALTER TABLE pet_health_records ADD COLUMN IF NOT EXISTS is_neutered BOOLEAN;
ALTER TABLE pet_health_records ADD COLUMN IF NOT EXISTS behavior_notes TEXT;

-- users: add cpf for pet owner profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cpf_unique ON users(cpf) WHERE cpf IS NOT NULL;
