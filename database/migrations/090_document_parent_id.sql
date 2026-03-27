-- Link variant documents to their origin via parent_id (self-referential FK)
-- Supports chains: variant-of-variant
-- ON DELETE SET NULL: deleting origin makes variants standalone

ALTER TABLE documents ADD COLUMN parent_id INT NULL;
ALTER TABLE documents ADD INDEX idx_documents_parent_id (parent_id);
ALTER TABLE documents ADD CONSTRAINT fk_documents_parent
  FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE SET NULL;
