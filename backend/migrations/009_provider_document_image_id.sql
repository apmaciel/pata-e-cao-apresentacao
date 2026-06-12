-- Upload de documento do prestador — armazena o ID da imagem do documento
-- de identidade/registro enviado (ex.: CPF, RG, CNH, CNPJ, Contrato Social).
-- A coluna document_file_name permanece como nome original do arquivo para
-- exibição. Os bytes reais são armazenados via camada de storage de imagens
-- (local ou SeaweedFS dependendo de IMAGE_STORAGE_TYPE).

ALTER TABLE providers
    ADD COLUMN document_image_id VARCHAR(500);
