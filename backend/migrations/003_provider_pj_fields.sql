-- Campos de registro de Pessoa Jurídica (PJ).
--
-- legal_representative_name armazena o nome da pessoa titular da conta quando o
-- prestador é uma empresa. Para PJ, a coluna business_name armazena a Razão
-- Social; user.full_name mantém o representante legal para fins de autenticação.
--
-- tax_id armazena o identificador estruturado capturado diretamente no formulário:
-- CNPJ para PJ, CPF opcional para PF (o formulário não pede PF hoje, mas a
-- coluna permite uso futuro sem outra migration). A validação do formato do
-- identificador é feita na camada de aplicação.

ALTER TABLE providers
    ADD COLUMN legal_representative_name VARCHAR(100),
    ADD COLUMN tax_id                    VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_tax_id_unique
    ON providers(tax_id)
    WHERE tax_id IS NOT NULL;
