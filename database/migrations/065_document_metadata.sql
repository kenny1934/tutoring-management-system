-- Migration 065: Add page_layout column to documents table
-- Stores page layout settings: margins, header/footer, watermark

ALTER TABLE documents ADD COLUMN page_layout JSON DEFAULT NULL
  COMMENT 'Page layout settings (margins, header/footer, watermark)';
