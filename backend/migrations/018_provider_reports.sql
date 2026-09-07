-- Denúncias de prestadores enviadas por visitantes (autenticados ou não) a
-- partir do perfil público. Identidade do denunciante é um fingerprint
-- anônimo persistido no navegador (localStorage), não um user_id — a
-- denúncia funciona sem login.
--
-- UNIQUE(provider_id, reporter_fingerprint) garante no máximo uma linha por
-- denunciante por prestador: uma nova denúncia do mesmo navegador atualiza a
-- linha existente (via ON CONFLICT DO UPDATE na camada de repositório) em vez
-- de criar uma duplicata. Isso faz da contagem de linhas a contagem de
-- denúncias únicas, e cada created_at forma o log de data/hora exibido ao
-- admin.
--
-- status: open (aguardando avaliação) | reviewed (avaliado pelo admin).
-- Uma nova denúncia do mesmo denunciante reabre (volta para 'open').
CREATE TABLE provider_reports (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id           UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    reporter_fingerprint  VARCHAR(64) NOT NULL,
    reason                VARCHAR(30) NOT NULL
        CHECK (reason IN ('fraud', 'inappropriate_behavior', 'false_information', 'other')),
    details               TEXT,
    status                VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'reviewed')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_id, reporter_fingerprint)
);

CREATE INDEX idx_provider_reports_provider ON provider_reports(provider_id);
CREATE INDEX idx_provider_reports_status ON provider_reports(status);
