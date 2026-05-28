-- Password recovery tokens.
--
-- We store SHA-256(token) so a leaked DB snapshot never reveals usable links.
-- The raw token is only ever returned to the user via the recovery URL (and,
-- in dev mode, surfaced in the JSON response so engineers can test without
-- a real mail relay). Tokens are single-use: used_at flips on confirm.

CREATE TABLE password_resets (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64)  NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ  NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX idx_password_resets_expires_at ON password_resets(expires_at);
