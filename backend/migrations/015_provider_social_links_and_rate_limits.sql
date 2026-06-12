-- Adiciona coluna social_links JSONB aos prestadores (espelha users.social_links).
ALTER TABLE providers ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';

-- Controle de rate-limit para campos restritos.
-- business_name e logo_image_id: uma alteração por mês.
-- flags de serviço accepts_*: uma alteração por mês.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_business_name_change TIMESTAMPTZ;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_logo_change TIMESTAMPTZ;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_service_change TIMESTAMPTZ;
