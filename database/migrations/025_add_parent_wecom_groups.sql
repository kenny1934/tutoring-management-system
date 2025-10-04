-- =====================================================
-- Migration 025: Add Parent WeCom Customer Group Mapping
-- =====================================================
-- Purpose: Map students to their parent WeCom customer groups for automated messaging

SELECT 'Adding parent WeCom customer group mapping...' as status;

-- ============================================================================
-- ADD CUSTOMER GROUP FIELDS TO STUDENTS
-- ============================================================================

ALTER TABLE students
ADD COLUMN parent_wecom_group_chat_id VARCHAR(255) NULL COMMENT 'WeCom customer group chat ID (format: wrOgQhDgAAcwMTB7YmDQbcJocOb2gGww)',
ADD COLUMN parent_wecom_group_name VARCHAR(255) NULL COMMENT 'Name of parent customer group for reference',
ADD COLUMN wecom_group_updated_at TIMESTAMP NULL COMMENT 'Last time group mapping was updated';

-- Add index for filtering and lookups
CREATE INDEX idx_students_wecom_group ON students(parent_wecom_group_chat_id);

SELECT 'Added WeCom customer group fields to students table.' as result;

-- ============================================================================
-- NOTES FOR DATA POPULATION
-- ============================================================================

-- After running this migration, populate data:
--
-- Method 1: Manual update for each student
-- UPDATE students
-- SET parent_wecom_group_chat_id = 'wrOgQhDgAAcwMTB7YmDQbcJocOb2gGww',
--     parent_wecom_group_name = 'Parent Group - Alice Wong',
--     wecom_group_updated_at = NOW()
-- WHERE student_name = 'Alice Wong';
--
-- Method 2: Get chat_ids from WeCom API
-- Use backend script to fetch all customer groups and auto-match by name
--
-- Method 3: CSV import
-- Export students, add chat_ids in Excel, import back

SELECT 'MIGRATION 025 COMPLETED - Ready for parent customer group messaging (Phase 2).' as final_status;

-- =====================================================
-- END Migration 025
-- =====================================================
