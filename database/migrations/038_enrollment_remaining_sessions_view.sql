-- =====================================================
-- Migration 038: Enrollment Remaining Sessions View
-- =====================================================
-- Purpose: Offload AppSheet virtual column calculation to MySQL
--          for displaying remaining sessions per enrollment
--
-- Replaces the need for an expensive AppSheet formula that would:
-- CONCATENATE(SELECT(session_log[formatted_session],
--   AND([enrollment_id] = [_THISROW].[id],
--       IN([session_status], LIST("Scheduled", "Make-up Class"))
--   )
-- ))
--
-- Format: YYYY-MM-DD (Day) time_slot
-- Example output:
--   2024-01-15 (Mon) 3:00 PM - 4:00 PM
--   2024-01-22 (Mon) 3:00 PM - 4:00 PM
--   2024-01-29 (Mon) 3:00 PM - 4:00 PM
-- =====================================================

SELECT 'Creating enrollment remaining sessions view...' as status;

-- =====================================================
-- VIEW: enrollment_remaining_sessions
-- =====================================================
-- Pre-computed text of remaining sessions for each enrollment
-- Sessions with status 'Scheduled' or 'Make-up Class'
-- Sorted by session_date (earliest first)
-- =====================================================
CREATE OR REPLACE VIEW enrollment_remaining_sessions AS
SELECT
    sl.enrollment_id,

    -- Count of remaining sessions
    COUNT(*) as remaining_session_count,

    -- Formatted text of all remaining sessions
    -- Format: YYYY-MM-DD (Day) time_slot, one per line
    GROUP_CONCAT(
        CONCAT(
            DATE_FORMAT(sl.session_date, '%Y-%m-%d'),
            ' (',
            DATE_FORMAT(sl.session_date, '%a'),
            ') ',
            sl.time_slot
        )
        ORDER BY sl.session_date ASC
        SEPARATOR '\n'
    ) as remaining_sessions_text,

    -- First upcoming session date (useful for sorting/filtering)
    MIN(sl.session_date) as next_session_date,

    -- Last scheduled session date
    MAX(sl.session_date) as last_session_date

FROM session_log sl
WHERE sl.enrollment_id IS NOT NULL
  AND sl.session_status IN ('Scheduled', 'Make-up Class')
GROUP BY sl.enrollment_id;

SELECT 'Created enrollment_remaining_sessions view.' as result;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

-- Example 1: Get remaining sessions for a specific enrollment
-- SELECT remaining_sessions_text, remaining_session_count
-- FROM enrollment_remaining_sessions
-- WHERE enrollment_id = 123;

-- Example 2: Join with enrollments to see all enrollment info
-- SELECT e.*, ers.remaining_session_count, ers.remaining_sessions_text
-- FROM enrollments e
-- LEFT JOIN enrollment_remaining_sessions ers ON e.id = ers.enrollment_id
-- WHERE e.payment_status = 'Paid';

-- Example 3: Find enrollments with no remaining sessions
-- SELECT e.id, e.student_id, e.tutor_id
-- FROM enrollments e
-- LEFT JOIN enrollment_remaining_sessions ers ON e.id = ers.enrollment_id
-- WHERE e.payment_status = 'Paid'
--   AND ers.enrollment_id IS NULL;

-- =====================================================
-- APPSHEET INTEGRATION NOTES
-- =====================================================
-- 1. Add the view as a table in AppSheet (enrollment_remaining_sessions)
-- 2. Set enrollment_id as the key column
-- 3. In the enrollments table, create a virtual column:
--    LOOKUP([id], "enrollment_remaining_sessions", "enrollment_id", "remaining_sessions_text")
--
-- Or alternatively:
-- 1. Create a REF column from enrollment_remaining_sessions to enrollments
-- 2. Use [Related enrollment_remaining_sessions].[remaining_sessions_text]
-- =====================================================

SELECT 'Migration 038 completed successfully.' as final_status;
SELECT 'View created: enrollment_remaining_sessions' as views_created;

-- =====================================================
-- ROLLBACK SCRIPT (if needed):
-- DROP VIEW IF EXISTS enrollment_remaining_sessions;
-- =====================================================
