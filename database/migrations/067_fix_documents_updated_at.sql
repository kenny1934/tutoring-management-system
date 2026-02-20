-- Migration 067: Remove ON UPDATE CURRENT_TIMESTAMP from documents.updated_at
-- The auto-update was overwriting HK timestamps with UTC on every heartbeat/lock operation.
-- updated_at is now only changed explicitly via Python (hk_now()) on document save.

ALTER TABLE documents
  MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
