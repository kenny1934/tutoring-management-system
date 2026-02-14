-- Migration 056: Add file_attachments column to tutor_messages
-- Supports document attachments (PDF, Word, Excel, etc.) alongside existing image_attachments

ALTER TABLE tutor_messages
ADD COLUMN file_attachments JSON DEFAULT NULL
COMMENT 'Document attachments as JSON array of {url, filename, content_type} objects';
