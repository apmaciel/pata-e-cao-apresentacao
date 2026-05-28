-- Widen avatar_image_id to match other image ID columns (255+ chars).
-- UUIDs + file extension can exceed 36 characters.
ALTER TABLE users ALTER COLUMN avatar_image_id TYPE VARCHAR(500);
