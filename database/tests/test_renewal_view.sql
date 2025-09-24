-- Test queries to validate the renewal view functionality

-- 1. Check all paid enrollments and their end dates
SELECT
    'All Paid Enrollments' as test_section;

SELECT
    e.id as enrollment_id,
    s.student_name,
    e.lessons_paid,
    e.first_lesson_date,
    e.payment_status,
    COALESCE(e.deadline_extension_weeks, 0) as extension_weeks,
    calculate_end_date(e.first_lesson_date, e.lessons_paid) as original_end_date,
    DATE_ADD(
        calculate_end_date(e.first_lesson_date, e.lessons_paid),
        INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
    ) as effective_end_date,
    DATEDIFF(
        DATE_ADD(
            calculate_end_date(e.first_lesson_date, e.lessons_paid),
            INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
        ),
        CURDATE()
    ) as days_until_renewal,
    CURDATE() as today_date
FROM enrollments e
JOIN students s ON e.student_id = s.id
WHERE e.payment_status = 'Paid'
ORDER BY days_until_renewal ASC
LIMIT 15;

-- 2. Check if any enrollments fall within the view's criteria (14 days out, -7 days back)
SELECT
    'Enrollments within View Range (-7 to +14 days)' as test_section;

SELECT
    e.id as enrollment_id,
    s.student_name,
    DATEDIFF(
        DATE_ADD(
            calculate_end_date(e.first_lesson_date, e.lessons_paid),
            INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
        ),
        CURDATE()
    ) as days_until_renewal
FROM enrollments e
JOIN students s ON e.student_id = s.id
WHERE
    e.payment_status = 'Paid'
    AND DATEDIFF(
        DATE_ADD(
            calculate_end_date(e.first_lesson_date, e.lessons_paid),
            INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
        ),
        CURDATE()
    ) BETWEEN -7 AND 14;

-- 3. Test the actual renewal view
SELECT
    'Active Renewal View Results' as test_section;

SELECT * FROM active_enrollments_needing_renewal;

-- 4. Expanded test - let's see enrollments within 30 days to get more data
SELECT
    'Enrollments within 30 days (expanded test)' as test_section;

SELECT
    e.id as enrollment_id,
    s.student_name,
    e.first_lesson_date,
    calculate_end_date(e.first_lesson_date, e.lessons_paid) as end_date,
    DATEDIFF(calculate_end_date(e.first_lesson_date, e.lessons_paid), CURDATE()) as days_until_end
FROM enrollments e
JOIN students s ON e.student_id = s.id
WHERE
    e.payment_status = 'Paid'
    AND DATEDIFF(calculate_end_date(e.first_lesson_date, e.lessons_paid), CURDATE()) BETWEEN -30 AND 30
ORDER BY days_until_end ASC;

-- 5. Check for any duplicate enrollments (which would be excluded by the view)
SELECT
    'Checking for enrollment overlaps' as test_section;

SELECT
    s.student_name,
    t.tutor_name,
    COUNT(*) as enrollment_count,
    GROUP_CONCAT(e.id) as enrollment_ids,
    GROUP_CONCAT(e.first_lesson_date ORDER BY e.first_lesson_date) as start_dates
FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN tutors t ON e.tutor_id = t.id
WHERE e.payment_status IN ('Paid', 'Unpaid')
GROUP BY s.student_name, t.tutor_name
HAVING COUNT(*) > 1;