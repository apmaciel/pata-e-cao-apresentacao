-- Schema inicial para o marketplace de serviços pet PATA & CÃO.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Usuários ──────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'owner',
    full_name     VARCHAR(100) NOT NULL DEFAULT '',
    phone         VARCHAR(20),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Prestadores ──────────────────────────────────────────────────────────────
CREATE TABLE providers (
    id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_name           VARCHAR(100)  NOT NULL,
    bio                     TEXT,
    location                VARCHAR(255),
    services                TEXT[]        NOT NULL DEFAULT '{}',
    status                  VARCHAR(20)   NOT NULL DEFAULT 'pending',
    status_changed_at       TIMESTAMPTZ,
    status_changed_by       UUID          REFERENCES users(id),
    rejection_reason        TEXT,
    background_check_status VARCHAR(20)   NOT NULL DEFAULT 'pending',
    background_check_date   TIMESTAMPTZ,
    avg_rating              DECIMAL(3,2)  NOT NULL DEFAULT 0,
    review_count            INT           NOT NULL DEFAULT 0,
    response_time_minutes   INT,
    logo_image_id           VARCHAR(255),
    certifications          JSONB         NOT NULL DEFAULT '[]',
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT providers_user_id_unique UNIQUE (user_id)
);

-- ── Auditoria de verificação de prestadores ────────────────────────────────────
CREATE TABLE provider_verification_audit (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id     UUID        NOT NULL REFERENCES providers(id),
    admin_id        UUID        NOT NULL REFERENCES users(id),
    action          VARCHAR(20) NOT NULL,
    previous_status VARCHAR(20),
    new_status      VARCHAR(20),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Reviews ───────────────────────────────────────────────────────────────────
CREATE TABLE reviews (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reviewer_id       UUID        NOT NULL REFERENCES users(id),
    provider_id       UUID        NOT NULL REFERENCES providers(id),
    rating            INT         NOT NULL,
    text              TEXT,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    provider_response TEXT,
    flagged_reason    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5)
);

-- ── Refresh tokens ────────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_providers_status            ON providers(status);
CREATE INDEX idx_providers_user_id           ON providers(user_id);
CREATE INDEX idx_reviews_provider_id         ON reviews(provider_id);
CREATE INDEX idx_reviews_status              ON reviews(status);
CREATE INDEX idx_refresh_tokens_user_id      ON refresh_tokens(user_id);
