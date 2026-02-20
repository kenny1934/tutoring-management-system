-- Document folders (hierarchical)
CREATE TABLE IF NOT EXISTS document_folders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  parent_id INT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES document_folders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES tutors(id)
);

-- Add tags + folder_id to documents
ALTER TABLE documents ADD COLUMN tags JSON DEFAULT NULL;
ALTER TABLE documents ADD COLUMN folder_id INT NULL,
  ADD FOREIGN KEY (folder_id) REFERENCES document_folders(id) ON DELETE SET NULL;
