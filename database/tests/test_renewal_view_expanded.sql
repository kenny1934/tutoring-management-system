-- Temporary test view with expanded date range to validate logic

CREATE OR REPLACE VIEW test_renewal_view_expanded AS
SELECT
    e.id AS enrollment_id,
    e.student_id,
    e.tutor_id,
    e.lessons_paid,
    e.first_lesson_date,
    e.payment_status,
    e.deadline_extension_weeks,
    s.student_name,
    s.phone,
    t.tutor_name,

    -- Calculate original end date (what they paid for)
    calculate_end_date(e.first_lesson_date, e.lessons_paid) AS original_end_date,

    -- Calculate effective end date with any extensions
    DATE_ADD(
        calculate_end_date(e.first_lesson_date, e.lessons_paid),
        INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
    ) AS effective_end_date,

    -- Days until renewal is needed
    DATEDIFF(
        DATE_ADD(
            calculate_end_date(e.first_lesson_date, e.lessons_paid),
            INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
        ),
        CURDATE()
    ) AS days_until_renewal,

    -- Count scheduled sessions remaining
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status = 'Scheduled') AS scheduled_sessions,

    -- Count pending make-up sessions
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status IN (
         'Rescheduled - Pending Make-up',
         'Sick Leave - Pending Make-up',
         'Weather Cancelled - Pending Make-up'
     )) AS pending_makeups,

    -- Extension status for admin guidance
    CASE
        WHEN COALESCE(e.deadline_extension_weeks, 0) = 0 THEN 'No Extension'
        WHEN COALESCE(e.deadline_extension_weeks, 0) <= 2 THEN 'Standard Extension'
        WHEN COALESCE(e.deadline_extension_weeks, 0) <= 4 THEN 'Extended (Review Required)'
        ELSE 'Special Case (Management Review)'
    END AS extension_status

FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN tutors t ON e.tutor_id = t.id
WHERE
    -- Only show paid enrollments
    e.payment_status = 'Paid'
    -- EXPANDED RANGE: Show enrollments within 60 days (or 30 days overdue)
    AND DATEDIFF(
        DATE_ADD(
            calculate_end_date(e.first_lesson_date, e.lessons_paid),
            INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
        ),
        CURDATE()
    ) BETWEEN -30 AND 60
    -- Exclude if next enrollment already exists
    AND NOT EXISTS (
        SELECT 1
        FROM enrollments e2
        WHERE e2.student_id = e.student_id
        AND e2.tutor_id = e.tutor_id
        AND e2.first_lesson_date > e.first_lesson_date
        AND e2.payment_status IN ('Paid', 'Unpaid')
    )
ORDER BY days_until_renewal ASC;