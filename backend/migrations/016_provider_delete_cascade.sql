-- Adiciona ON DELETE CASCADE às tabelas filhas de providers para que
-- excluir um prestador cascadeie limpo sem erros de FK.
-- Isso suporta a funcionalidade de autoexclusão de prestador (DELETE /api/providers/me).

-- provider_verification_audit.provider_id → providers(id)
ALTER TABLE provider_verification_audit DROP CONSTRAINT IF EXISTS provider_verification_audit_provider_id_fkey;
ALTER TABLE provider_verification_audit ADD CONSTRAINT provider_verification_audit_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;

-- reviews.provider_id → providers(id)
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_provider_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
