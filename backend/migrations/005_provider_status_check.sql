-- Enforce valid provider status values at the database level so no code
-- path can accidentally persist an invalid status.
--
-- suspended hides an approved provider from search and prevents new bookings
-- but preserves their data. The transition is reversible (unsuspend returns
-- the provider to approved).

ALTER TABLE providers
    ADD CONSTRAINT providers_status_check
        CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'suspended'));
