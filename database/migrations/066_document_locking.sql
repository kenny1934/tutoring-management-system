-- Document locking: prevent simultaneous editing conflicts
ALTER TABLE documents
  ADD COLUMN locked_by INT NULL AFTER is_archived,
  ADD COLUMN lock_expires_at DATETIME NULL AFTER locked_by,
  ADD CONSTRAINT fk_documents_locked_by FOREIGN KEY (locked_by) REFERENCES tutors(id) ON DELETE SET NULL;
