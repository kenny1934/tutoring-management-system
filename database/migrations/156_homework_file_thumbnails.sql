-- Migration 156: store a small derivative for each homework photo
--
-- Thumbnails render at 48px but were loading the full 1920px upload, so three
-- photos cost over a megabyte to paint three postage stamps. Uploads now write
-- a second, small blob alongside the original and record it here.
--
-- Additive and nullable, so the deployed backend keeps working: rows written
-- before this ships have no thumbnail and the UI falls back to the full image.
-- Safe to replay.

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'homework_files'
       AND COLUMN_NAME = 'thumbnail_path'
);

SET @sql := IF(@col_exists > 0,
    'DO 0',
    'ALTER TABLE homework_files ADD COLUMN thumbnail_path VARCHAR(500) NULL COMMENT "Small derivative for list previews, NULL means use file_path" AFTER file_path');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
