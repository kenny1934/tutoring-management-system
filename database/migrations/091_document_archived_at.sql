-- Add archived_at timestamp and set ON DELETE SET NULL for parent_id FK
ALTER TABLE documents ADD COLUMN archived_at DATETIME NULL;

-- Backfill: set archived_at for existing archived documents
UPDATE documents SET archived_at = updated_at WHERE is_archived = TRUE AND archived_at IS NULL;
