-- Provider application fields collected via the public "Seja um Parceiro Pet"
-- registration form (frontend/src/pages/providers/apply.astro).
--
-- account_type distinguishes individuals (PF) from legal entities (PJ) and
-- governs which document types are valid on the application.
-- document_file_name is a stub for the actual upload — the file storage
-- pipeline lands in a follow-up.

ALTER TABLE providers
    ADD COLUMN account_type        VARCHAR(20)  NOT NULL DEFAULT 'pessoa_fisica',
    ADD COLUMN birth_date          DATE,
    ADD COLUMN document_type       VARCHAR(20),
    ADD COLUMN document_file_name  VARCHAR(255),
    ADD COLUMN social_link         VARCHAR(500);

ALTER TABLE providers
    ADD CONSTRAINT providers_account_type_check
        CHECK (account_type IN ('pessoa_fisica', 'pessoa_juridica'));
