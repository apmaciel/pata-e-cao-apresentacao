-- Tokens de recuperação de senha.
--
-- Armazenamos SHA-256(token) para que um snapshot vazado do BD nunca revele
-- links utilizáveis. O token bruto só é retornado ao usuário via URL de
-- recuperação (e, em modo dev, exposto na resposta JSON para testes sem
-- relay de email real). Tokens são de uso único: used_at é preenchido na confirmação.

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
