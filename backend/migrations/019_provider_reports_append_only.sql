-- Denúncias passam a ser um log append-only: cada envio cria uma nova linha,
-- inclusive do mesmo denunciante. Antes, UNIQUE(provider_id,
-- reporter_fingerprint) + ON CONFLICT DO UPDATE fazia uma nova denúncia do
-- mesmo navegador sobrescrever a anterior, então a contagem no painel do
-- admin nunca passava de 1 por denunciante e o horário da última denúncia
-- não avançava. O reporter_fingerprint continua salvo para o admin
-- identificar envios repetidos; o abuso é contido pelo rate limiter global.
ALTER TABLE provider_reports
    DROP CONSTRAINT IF EXISTS provider_reports_provider_id_reporter_fingerprint_key;

CREATE INDEX IF NOT EXISTS idx_provider_reports_provider_created
    ON provider_reports(provider_id, created_at DESC);
