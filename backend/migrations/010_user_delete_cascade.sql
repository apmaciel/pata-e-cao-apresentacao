-- Fix FK constraints to allow user deletion to cascade properly.
-- These tables reference users(id) without ON DELETE CASCADE, which would block deletion.

-- pet_health_access_log.accessed_by → users(id): log becomes meaningless when user is deleted
ALTER TABLE pet_health_access_log DROP CONSTRAINT IF EXISTS pet_health_access_log_accessed_by_fkey;
ALTER TABLE pet_health_access_log ADD CONSTRAINT pet_health_access_log_accessed_by_fkey
    FOREIGN KEY (accessed_by) REFERENCES users(id) ON DELETE CASCADE;

-- providers.status_changed_by → users(id): set to NULL when admin is deleted
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_status_changed_by_fkey;
ALTER TABLE providers ADD CONSTRAINT providers_status_changed_by_fkey
    FOREIGN KEY (status_changed_by) REFERENCES users(id) ON DELETE SET NULL;

-- provider_verification_audit.admin_id → users(id): set to NULL when admin is deleted
ALTER TABLE provider_verification_audit DROP CONSTRAINT IF EXISTS provider_verification_audit_admin_id_fkey;
ALTER TABLE provider_verification_audit ADD CONSTRAINT provider_verification_audit_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;

-- bookings.owner_id → users(id): booking becomes meaningless when owner is deleted
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_owner_id_fkey;
ALTER TABLE bookings ADD CONSTRAINT bookings_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

-- reviews.reviewer_id → users(id): review becomes orphaned, cascade delete
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_reviewer_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_reviewer_id_fkey
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE;
