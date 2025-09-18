-- =====================================================
-- Migration 011: Add Star Rating and Photo Upload to Homework Completion
-- =====================================================
-- Adds star rating (1-5 emoji stars) and photo upload capability
-- to homework completion tracking

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

-- Add star rating and photo columns to homework_completion table
ALTER TABLE homework_completion
ADD COLUMN homework_rating VARCHAR(10) NULL COMMENT 'Star rating as emojis (⭐⭐⭐), NULL = not rated' AFTER completion_status,
ADD COLUMN homework_photo VARCHAR(500) NULL COMMENT 'Photo/image file path for uploaded homework picture' AFTER tutor_comments;

-- Add index for rating queries
ALTER TABLE homework_completion
ADD INDEX idx_homework_rating (homework_rating);

-- Update the homework_to_check view to include new columns
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

    -- Completion status and new rating/photo fields
    COALESCE(hc.completion_status, 'Not Checked') as completion_status,
    hc.homework_rating,
    COALESCE(hc.submitted, FALSE) as submitted,
    hc.tutor_comments,
    hc.homework_photo,
    hc.checked_by,
    hc.checked_at,

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
JOIN session_log prev ON (
    prev.student_id = current.student_id
    AND prev.session_date < current.session_date
    AND DATE(prev.session_date) <= DATE_SUB(DATE(current.session_date), INTERVAL 1 DAY)  -- At least 1 day before
    AND prev.session_status NOT IN ('Cancelled', 'Rescheduled - Make-up Booked', 'Rescheduled - Pending Make-up', 'Sick Leave - Make-up Booked', 'Sick Leave - Pending Make-up')
    AND prev.id = (
        SELECT MAX(id)
        FROM session_log sl_inner
        WHERE sl_inner.student_id = current.student_id
        AND sl_inner.session_date < current.session_date
        AND DATE(sl_inner.session_date) <= DATE_SUB(DATE(current.session_date), INTERVAL 1 DAY)
        AND sl_inner.session_status NOT IN ('Cancelled', 'Rescheduled - Make-up Booked', 'Rescheduled - Pending Make-up', 'Sick Leave - Make-up Booked', 'Sick Leave - Pending Make-up')
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

WHERE current.session_status IN ('Scheduled', 'Attended', 'Attended (Make-up)', 'Make-up Class', 'Trial Class')
ORDER BY current.session_date DESC, s.student_name, se.pdf_name;

-- Update student_homework_history view to include rating and photo
CREATE OR REPLACE VIEW student_homework_history AS
SELECT
    hc.id as completion_id,
    hc.student_id,
    s.student_name,
    hc.assigned_date,
    hc.pdf_name,
    CASE
        WHEN hc.page_start IS NOT NULL AND hc.page_end IS NOT NULL
        THEN CONCAT('p.', hc.page_start, '-', hc.page_end)
        WHEN hc.page_start IS NOT NULL
        THEN CONCAT('p.', hc.page_start)
        ELSE ''
    END as pages,
    hc.exercise_remarks as assignment_notes,

    -- Completion details with new rating and photo
    hc.completion_status,
    hc.homework_rating,
    hc.submitted,
    hc.tutor_comments,
    hc.homework_photo,

    -- Session context
    current_session.session_date as checked_date,
    t_checked.tutor_name as checked_by_tutor,
    t_assigned.tutor_name as assigned_by_tutor,

    -- Visual indicators
    CASE
        WHEN hc.completion_status = 'Completed' THEN '✅'
        WHEN hc.completion_status = 'Partially Completed' THEN '⚠️'
        WHEN hc.completion_status = 'Not Completed' THEN '❌'
        ELSE '❓'
    END as status_icon,

    -- Completion score for analytics
    CASE
        WHEN hc.completion_status = 'Completed' THEN 1
        WHEN hc.completion_status = 'Partially Completed' THEN 0.5
        WHEN hc.completion_status = 'Not Completed' THEN 0
        ELSE NULL
    END as completion_score

FROM homework_completion hc
JOIN session_log current_session ON hc.current_session_id = current_session.id
JOIN students s ON hc.student_id = s.id
LEFT JOIN tutors t_checked ON current_session.tutor_id = t_checked.id
LEFT JOIN tutors t_assigned ON hc.assigned_by_tutor_id = t_assigned.id

ORDER BY s.student_name, hc.assigned_date DESC, hc.pdf_name;

-- Test the updated views
SELECT 'Testing updated homework_to_check view with rating and photo...' as test_step;
SELECT COUNT(*) as pending_homework_checks FROM homework_to_check WHERE check_status = 'Pending';

SELECT 'Testing updated student_homework_history view...' as test_step;
SELECT COUNT(*) as total_homework_records FROM student_homework_history;

SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1);
SET UNIQUE_CHECKS=IFNULL(@OLD_UNIQUE_CHECKS, 1);

SELECT 'MIGRATION 011 COMPLETED SUCCESSFULLY - Star rating and photo added to homework completion' as final_status;

-- =====================================================
-- END Migration 011: Homework Completion Rating & Photo
-- =====================================================