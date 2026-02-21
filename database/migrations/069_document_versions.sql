-- Document version history: automatic snapshots + manual checkpoints
CREATE TABLE IF NOT EXISTS document_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  version_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content JSON NOT NULL,
  page_layout JSON,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version_type VARCHAR(20) NOT NULL DEFAULT 'auto',  -- auto | manual | session_start
  label VARCHAR(255) DEFAULT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES tutors(id),
  INDEX idx_docver_doc_created (document_id, created_at DESC),
  UNIQUE KEY uq_docver_doc_number (document_id, version_number)
);

ALTER TABLE documents ADD COLUMN last_version_at TIMESTAMP NULL DEFAULT NULL;
