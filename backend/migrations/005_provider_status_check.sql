-- Impõe valores válidos de status de prestador no nível do banco para que
-- nenhum caminho de código possa acidentalmente persistir um status inválido.
--
-- suspended esconde um prestador aprovado da busca e impede novas reservas
-- mas preserva seus dados. A transição é reversível (unsuspend retorna o
-- prestador para approved).

ALTER TABLE providers
    ADD CONSTRAINT providers_status_check
        CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'suspended'));
