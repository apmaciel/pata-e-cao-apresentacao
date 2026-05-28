-- One-time onboarding tokens. Pattern follows password_resets.
CREATE TABLE provider_onboarding_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_onboarding_tokens_provider ON provider_onboarding_tokens(provider_id);

-- Service preference flags.
ALTER TABLE providers ADD COLUMN accepts_dogs     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE providers ADD COLUMN accepts_cats     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE providers ADD COLUMN accepts_neutered BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE providers ADD COLUMN accepts_intact   BOOLEAN NOT NULL DEFAULT FALSE;

-- Contact and onboarding marker.
ALTER TABLE providers ADD COLUMN whatsapp               VARCHAR(20);
ALTER TABLE providers ADD COLUMN onboarding_completed_at TIMESTAMPTZ;

-- Provider gallery (separate table for referential integrity, like pet_images).
CREATE TABLE provider_gallery_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    image_id    VARCHAR(500) NOT NULL UNIQUE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_gallery_provider ON provider_gallery_images(provider_id);
