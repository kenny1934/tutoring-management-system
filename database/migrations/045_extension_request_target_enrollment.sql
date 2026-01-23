-- =====================================================
-- Migration 045: Add target_enrollment_id to extension_requests
-- Run on Google Cloud SQL (MySQL)
--
-- Purpose: Track which enrollment should be extended (student's current enrollment)
--          when makeup is from a different (older) enrollment
-- AppSheet compatibility: Column is nullable, AppSheet continues to work without changes
-- =====================================================

-- Add column to track which enrollment to extend
-- NULL = use enrollment_id (current behavior, for AppSheet backward compatibility)
ALTER TABLE extension_requests
ADD COLUMN target_enrollment_id INT NULL
COMMENT 'The enrollment to extend (student current enrollment). When NULL, falls back to enrollment_id for AppSheet backward compatibility.';

-- Add foreign key constraint
ALTER TABLE extension_requests
ADD CONSTRAINT fk_extension_request_target_enrollment
FOREIGN KEY (target_enrollment_id) REFERENCES enrollments(id)
ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX idx_extension_requests_target_enrollment
ON extension_requests(target_enrollment_id);

SELECT 'Migration 045: target_enrollment_id column added successfully.' as result;

-- =====================================================
-- SUMMARY
-- =====================================================

/*
CHANGES:
1. Added target_enrollment_id - tracks which enrollment to extend (student's current)
2. Added foreign key constraint to enrollments table
3. Added index for performance

BUSINESS LOGIC:
- When student has makeup from Enrollment A but is now on Enrollment B:
  - enrollment_id = A (source - where the session is from)
  - target_enrollment_id = B (target - what gets extended)
- When target_enrollment_id is NULL, falls back to enrollment_id (AppSheet compat)

WEBAPP BEHAVIOR:
- Create extension request: Sets target_enrollment_id to student's latest Regular enrollment
- Approve extension: Extends target_enrollment (not source)
- Deadline validation: Checks against student's current Regular enrollment

APPSHEET BEHAVIOR:
- No changes required
- AppSheet won't set target_enrollment_id (will be NULL)
- Existing approval logic uses enrollment_id as fallback
*/
