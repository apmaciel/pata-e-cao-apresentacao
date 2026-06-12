-- Adiciona ON DELETE CASCADE a reviews.reviewer_id → users(id) para que
-- quando um usuário exclui sua conta (fluxo de autoexclusão de prestador),
-- suas próprias avaliações sejam automaticamente limpas também.
-- Sem esta FK, um usuário que escreveu avaliações não pode ser excluído.

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_reviewer_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_reviewer_id_fkey
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE;
