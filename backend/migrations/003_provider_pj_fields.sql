-- Pessoa Jurídica (PJ) registration fields.
--
-- legal_representative_name holds the human account holder's name when the
-- provider is a company. For PJ the business_name column stores the Razão
-- Social; user.full_name keeps the legal representative for auth purposes.
--
-- tax_id stores the structured identifier captured directly on the form:
-- CNPJ for PJ, optional CPF for PF (the form doesn't ask PF today but the
-- column allows future use without another migration). Validation of the
-- identifier's format is handled at the application layer.

ALTER TABLE providers
    ADD COLUMN legal_representative_name VARCHAR(100),
    ADD COLUMN tax_id                    VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_tax_id_unique
    ON providers(tax_id)
    WHERE tax_id IS NOT NULL;
