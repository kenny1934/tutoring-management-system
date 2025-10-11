-- =====================================================
-- Data Quality Check: Tutor Mismatches
-- =====================================================
-- Purpose: Find enrollments where the assigned tutor doesn't match
--          the tutor who actually taught most sessions
--
-- Use case: Detect cases where tutor changed but enrollment wasn't updated
-- Note: Ignores non-sessions (Rescheduled - Pending Make-up, Rescheduled - Make-up Booked, Cancelled)

-- =====================================================
-- Query: Enrollments with Majority Tutor Different from Assigned Tutor
-- =====================================================

SELECT
    e.id as enrollment_id,
    s.student_name,
    s.school_student_id,

    -- Assigned tutor (in enrollment record)
    e.tutor_id as assigned_tutor_id,
    t_assigned.tutor_name as assigned_tutor_name,

    -- Majority tutor (who actually taught most sessions)
    majority_tutor.tutor_id as majority_tutor_id,
    majority_tutor.tutor_name as majority_tutor_name,
    majority_tutor.session_count as sessions_by_majority_tutor,

    -- Total actual sessions (excluding non-sessions)
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status NOT IN ('Rescheduled - Pending Make-up', 'Rescheduled - Make-up Booked', 'Cancelled')) as total_sessions,

    -- Enrollment details
    e.assigned_day,
    e.assigned_time,
    e.location,
    e.payment_status,
    e.first_lesson_date

FROM enrollments e
INNER JOIN students s ON e.student_id = s.id
INNER JOIN tutors t_assigned ON e.tutor_id = t_assigned.id

-- Subquery: Find the tutor who taught the most sessions for this enrollment
INNER JOIN (
    SELECT
        sl.enrollment_id,
        sl.tutor_id,
        t.tutor_name,
        COUNT(*) as session_count,
        ROW_NUMBER() OVER (PARTITION BY sl.enrollment_id ORDER BY COUNT(*) DESC) as rn
    FROM session_log sl
    INNER JOIN tutors t ON sl.tutor_id = t.id
    WHERE sl.enrollment_id IS NOT NULL
      AND sl.session_status NOT IN ('Rescheduled - Pending Make-up', 'Rescheduled - Make-up Booked', 'Cancelled')  -- Ignore non-sessions
    GROUP BY sl.enrollment_id, sl.tutor_id, t.tutor_name
) majority_tutor ON e.id = majority_tutor.enrollment_id AND majority_tutor.rn = 1

-- Only show where assigned tutor != majority tutor
WHERE e.tutor_id != majority_tutor.tutor_id

ORDER BY e.id DESC;

-- =====================================================
-- Alternative: Show session count breakdown by tutor for each enrollment
-- =====================================================

-- SELECT
--     e.id as enrollment_id,
--     s.student_name,
--     t_assigned.tutor_name as assigned_tutor,
--     t_session.tutor_name as session_tutor,
--     COUNT(*) as session_count
-- FROM enrollments e
-- INNER JOIN students s ON e.student_id = s.id
-- INNER JOIN tutors t_assigned ON e.tutor_id = t_assigned.id
-- INNER JOIN session_log sl ON e.id = sl.enrollment_id
-- INNER JOIN tutors t_session ON sl.tutor_id = t_session.id
-- WHERE e.tutor_id != sl.tutor_id
--   AND sl.session_status NOT IN ('Rescheduled - Pending Make-up', 'Rescheduled - Make-up Booked', 'Cancelled')  -- Ignore non-sessions
-- GROUP BY e.id, s.student_name, t_assigned.tutor_name, t_session.tutor_name
-- ORDER BY e.id DESC, session_count DESC;

-- =====================================================
-- END Query
-- =====================================================
