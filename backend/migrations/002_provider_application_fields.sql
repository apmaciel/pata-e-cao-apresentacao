-- Campos de aplicação de prestador coletados via formulário público
-- "Seja um Parceiro Pet" (frontend/src/pages/providers/apply.astro).
--
-- account_type distingue pessoas físicas (PF) de jurídicas (PJ) e
-- determina quais tipos de documento são válidos na aplicação.
-- document_file_name é um stub para o upload real — o pipeline de
-- armazenamento de arquivos é implementado em seguida.

ALTER TABLE providers
    ADD COLUMN account_type        VARCHAR(20)  NOT NULL DEFAULT 'pessoa_fisica',
    ADD COLUMN birth_date          DATE,
    ADD COLUMN document_type       VARCHAR(20),
    ADD COLUMN document_file_name  VARCHAR(255),
    ADD COLUMN social_link         VARCHAR(500);

ALTER TABLE providers
    ADD CONSTRAINT providers_account_type_check
        CHECK (account_type IN ('pessoa_fisica', 'pessoa_juridica'));
