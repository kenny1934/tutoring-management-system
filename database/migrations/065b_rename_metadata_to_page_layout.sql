-- Migration 065b: Rename metadata column to page_layout (metadata is reserved by SQLAlchemy)

ALTER TABLE documents CHANGE COLUMN metadata page_layout JSON DEFAULT NULL
  COMMENT 'Page layout settings (margins, header/footer, watermark)';
