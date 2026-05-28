-- 008: Add ON DELETE CASCADE to pet_health_access_log FK (was missed in 001)

ALTER TABLE pet_health_access_log DROP CONSTRAINT pet_health_access_log_pet_id_fkey;
ALTER TABLE pet_health_access_log ADD CONSTRAINT pet_health_access_log_pet_id_fkey
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE;
