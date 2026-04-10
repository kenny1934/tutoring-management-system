-- =====================================================
-- Migration 109: Add url_title to session exercises
-- =====================================================
-- Stores the fetched page title for URL exercises.

SELECT 'Adding url_title to session_exercises...' as status;

ALTER TABLE session_exercises
  ADD COLUMN url_title VARCHAR(500) NULL AFTER url;

SELECT 'MIGRATION 109 COMPLETED - url_title column added' as final_status;
