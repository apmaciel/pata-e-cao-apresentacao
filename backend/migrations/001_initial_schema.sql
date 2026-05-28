-- Initial schema for PATA & CÃO pet services marketplace.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ─────────────────────────────────────────────────────────────────────
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

-- ── Pets ──────────────────────────────────────────────────────────────────────
CREATE TABLE pets (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           VARCHAR(100)  NOT NULL,
    species        VARCHAR(50)   NOT NULL,
    breed          VARCHAR(100),
    age_years      INT,
    weight_kg      DECIMAL(5,2),
    photo_image_id VARCHAR(255),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Pet health records (sensitive) ───────────────────────────────────────────
CREATE TABLE pet_health_records (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id        UUID        NOT NULL UNIQUE REFERENCES pets(id) ON DELETE CASCADE,
    vaccinations  JSONB       NOT NULL DEFAULT '[]',
    allergies     TEXT[]      NOT NULL DEFAULT '{}',
    medications   TEXT[]      NOT NULL DEFAULT '{}',
    special_needs TEXT,
    vet_name      VARCHAR(100),
    vet_phone     VARCHAR(20),
    vet_email     VARCHAR(255),
    is_sensitive  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Health access audit log ───────────────────────────────────────────────────
CREATE TABLE pet_health_access_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id      UUID        NOT NULL REFERENCES pets(id),
    accessed_by UUID        NOT NULL REFERENCES users(id),
    context     VARCHAR(100) NOT NULL,
    booking_id  UUID,
    ip_address  VARCHAR(45),
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Providers ─────────────────────────────────────────────────────────────────
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

-- ── Provider verification audit ───────────────────────────────────────────────
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

-- ── Bookings ──────────────────────────────────────────────────────────────────
CREATE TABLE bookings (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         UUID        NOT NULL REFERENCES users(id),
    provider_id      UUID        NOT NULL REFERENCES providers(id),
    pet_id           UUID        NOT NULL REFERENCES pets(id),
    service_type     VARCHAR(50) NOT NULL,
    start_date       DATE        NOT NULL,
    end_date         DATE        NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    notes            TEXT,
    price_cents      INT,
    cancelled_reason TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Prevent double-booking the same provider for the same dates.
    CONSTRAINT bookings_no_overlap UNIQUE (provider_id, start_date, end_date)
);

-- ── Reviews ───────────────────────────────────────────────────────────────────
CREATE TABLE reviews (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id        UUID        NOT NULL UNIQUE REFERENCES bookings(id),
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
CREATE INDEX idx_pets_owner_id               ON pets(owner_id);
CREATE INDEX idx_providers_status            ON providers(status);
CREATE INDEX idx_providers_user_id           ON providers(user_id);
CREATE INDEX idx_bookings_owner_id           ON bookings(owner_id);
CREATE INDEX idx_bookings_provider_id        ON bookings(provider_id);
CREATE INDEX idx_bookings_status             ON bookings(status);
CREATE INDEX idx_reviews_provider_id         ON reviews(provider_id);
CREATE INDEX idx_reviews_status              ON reviews(status);
CREATE INDEX idx_refresh_tokens_user_id      ON refresh_tokens(user_id);
CREATE INDEX idx_pet_health_access_pet_id    ON pet_health_access_log(pet_id);
CREATE INDEX idx_pet_health_access_user_id   ON pet_health_access_log(accessed_by);
