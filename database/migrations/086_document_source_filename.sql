-- 086: Track source filename for imported documents (e.g., OCR worksheet import)
ALTER TABLE documents ADD COLUMN source_filename VARCHAR(500) NULL
  COMMENT 'Original filename or courseware path of imported source';
