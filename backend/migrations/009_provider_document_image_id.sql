-- Provider document upload — stores the storage-backed image ID of the
-- uploaded identity/registration document (e.g. CPF, RG, CNH, CNPJ,
-- Contrato Social). The document_file_name column remains as the original
-- filename for display purposes. The actual file bytes are stored via the
-- image storage layer (local or SeaweedFS depending on IMAGE_STORAGE_TYPE).

ALTER TABLE providers
    ADD COLUMN document_image_id VARCHAR(500);
