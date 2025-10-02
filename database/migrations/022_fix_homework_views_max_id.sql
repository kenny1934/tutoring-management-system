-- =====================================================
-- Migration 022: Fix MAX(id) in Homework Views
-- =====================================================
-- Problem: homework_to_check view uses MAX(id) to find most recent previous session
-- Since IDs are random (RANDBETWEEN), MAX(id) doesn't work correctly
-- Solution: Use MAX(session_date) instead

SELECT 'Fixing homework_to_check view to use MAX(session_date) instead of MAX(id)...' as status;

-- Drop and recreate homework_to_check view with the fix
CREATE OR REPLACE VIEW homework_to_check AS
SELECT
    current.id as current_session_id,
    current.student_id,
    current.tutor_id as current_tutor_id,
    current.session_date as current_session_date,
    s.student_name,
    t_current.tutor_name as current_tutor_name,

    -- Previous session info (any tutor, at least 1 day before)
    prev.id as previous_session_id,
    DATE(prev.session_date) as homework_assigned_date,
    prev.tutor_id as assigned_by_tutor_id,
    t_prev.tutor_name as assigned_by_tutor,

    -- Specific homework assignment details from session_exercises
    se.id as session_exercise_id,
    se.pdf_name,
    CASE
        WHEN se.page_start IS NOT NULL AND se.page_end IS NOT NULL
        THEN CONCAT('p.', se.page_start, '-', se.page_end)
        WHEN se.page_start IS NOT NULL
        THEN CONCAT('p.', se.page_start)
        ELSE ''
    END as pages,
    se.remarks as assignment_remarks,

    -- Completion status and rating (from homework_completion)
    COALESCE(hc.completion_status, 'Not Checked') as completion_status,
    hc.homework_rating,
    COALESCE(hc.submitted, FALSE) as submitted,
    hc.tutor_comments,
    hc.checked_by,
    hc.checked_at,

    -- File attachment summary
    COUNT(hf.id) as attachment_count,
    GROUP_CONCAT(
        DISTINCT CASE
            WHEN hf.file_type = 'image' THEN 'Photos'
            WHEN hf.file_type = 'pdf' THEN 'PDFs'
            WHEN hf.file_type = 'document' THEN 'Documents'
            ELSE hf.file_type
        END
        ORDER BY hf.file_type
        SEPARATOR ', '
    ) as attachment_types,

    -- Status indicators for AppSheet
    CASE
        WHEN hc.id IS NULL THEN 'Pending'
        ELSE 'Checked'
    END as check_status,

    CASE
        WHEN hc.id IS NULL THEN 'Yes'
        ELSE 'Already Checked'
    END as has_homework_to_check

FROM session_log current
JOIN students s ON current.student_id = s.id
LEFT JOIN tutors t_current ON current.tutor_id = t_current.id

-- Find most recent previous session for this student (any tutor, at least 1 day before)
-- FIXED: Use MAX(session_date) instead of MAX(id) since IDs are random
JOIN session_log prev ON (
    prev.student_id = current.student_id
    AND prev.session_date < current.session_date
    AND DATE(prev.session_date) <= DATE_SUB(DATE(current.session_date), INTERVAL 1 DAY)  -- At least 1 day before
    AND prev.session_status NOT IN ('Cancelled', 'Rescheduled - Make-up Booked', 'Rescheduled - Pending Make-up', 'Sick Leave - Make-up Booked', 'Sick Leave - Pending Make-up', 'Weather Cancelled - Pending Make-up', 'Weather Cancelled - Make-up Booked')
    AND prev.session_date = (
        SELECT MAX(sl_inner.session_date)
        FROM session_log sl_inner
        WHERE sl_inner.student_id = current.student_id
        AND sl_inner.session_date < current.session_date
        AND DATE(sl_inner.session_date) <= DATE_SUB(DATE(current.session_date), INTERVAL 1 DAY)
        AND sl_inner.session_status NOT IN ('Cancelled', 'Rescheduled - Make-up Booked', 'Rescheduled - Pending Make-up', 'Sick Leave - Make-up Booked', 'Sick Leave - Pending Make-up', 'Weather Cancelled - Pending Make-up', 'Weather Cancelled - Make-up Booked')
    )
)

-- Get ALL homework assignments from that previous session
JOIN session_exercises se ON (
    se.session_id = prev.id
    AND se.exercise_type = 'HW'
)

-- Join tutor info for who assigned the homework
LEFT JOIN tutors t_prev ON prev.tutor_id = t_prev.id

-- Check if this specific homework assignment has already been checked
LEFT JOIN homework_completion hc ON (
    hc.current_session_id = current.id
    AND hc.session_exercise_id = se.id
)

-- Join file attachments for this homework
LEFT JOIN homework_files hf ON hc.id = hf.homework_completion_id

WHERE current.session_status IN ('Scheduled', 'Attended', 'Attended (Make-up)', 'Make-up Class', 'Trial Class')
GROUP BY
    current.id, current.student_id, current.tutor_id, current.session_date,
    s.student_name, t_current.tutor_name,
    prev.id, prev.session_date, prev.tutor_id, t_prev.tutor_name,
    se.id, se.pdf_name, se.page_start, se.page_end, se.remarks,
    hc.id, hc.completion_status, hc.homework_rating, hc.submitted,
    hc.tutor_comments, hc.checked_by, hc.checked_at
ORDER BY current.session_date DESC, s.student_name, se.pdf_name;

SELECT 'homework_to_check view updated successfully with MAX(session_date)' as result;

-- Test the view
SELECT 'Testing homework_to_check view...' as test_step;
SELECT COUNT(*) as pending_homework_checks FROM homework_to_check WHERE check_status = 'Pending';

SELECT 'MIGRATION 022 COMPLETED - Homework views now use MAX(session_date) for random IDs' as final_status;

-- =====================================================
-- END Migration 022
-- =====================================================
