-- Add ON DELETE CASCADE to provider child tables so that deleting a
-- provider (or its parent user row) cascades cleanly without FK errors.
-- This supports the provider self-delete feature (DELETE /api/providers/me).

-- provider_verification_audit.provider_id → providers(id)
ALTER TABLE provider_verification_audit DROP CONSTRAINT IF EXISTS provider_verification_audit_provider_id_fkey;
ALTER TABLE provider_verification_audit ADD CONSTRAINT provider_verification_audit_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;

-- bookings.provider_id → providers(id)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_provider_id_fkey;
ALTER TABLE bookings ADD CONSTRAINT bookings_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;

-- reviews.provider_id → providers(id)
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_provider_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
