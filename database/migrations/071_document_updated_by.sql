ALTER TABLE documents ADD COLUMN updated_by INT NULL;
ALTER TABLE documents ADD CONSTRAINT fk_documents_updated_by FOREIGN KEY (updated_by) REFERENCES tutors(id);
-- Backfill: set updated_by = created_by for existing documents
UPDATE documents SET updated_by = created_by WHERE updated_by IS NULL;
