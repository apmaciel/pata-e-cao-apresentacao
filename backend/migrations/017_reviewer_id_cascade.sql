-- Add ON DELETE CASCADE to reviews.reviewer_id → users(id) so that
-- when a user deletes their account (provider self-delete flow), their
-- own reviews are automatically cleaned up as well.
-- Without this FK, a user who has authored reviews cannot be deleted.

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_reviewer_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_reviewer_id_fkey
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE;
