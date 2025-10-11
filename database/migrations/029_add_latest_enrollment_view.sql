-- =====================================================
-- Migration 029: Add Latest Enrollment View for Looker Studio
-- =====================================================
-- Purpose: Create view showing each student's latest enrollment
--          (for external reporting without AppSheet access)
--
-- Replicates AppSheet slice logic:
-- - payment_status <> "Cancelled"
-- - latest enrollment per student (by first_lesson_date)

SELECT 'Creating latest enrollment view for Looker Studio...' as status;

-- =====================================================
-- VIEW: Latest Enrollments (One per Active Student)
-- =====================================================
-- Only includes students with active enrollments (effective_end_date >= today)
-- Includes both 'Paid' and 'Pending Payment' statuses
-- Excludes terminated students
CREATE OR REPLACE VIEW latest_enrollments AS
SELECT
    e.*,
    -- Calculate effective end date with holidays and extensions
    calculate_effective_end_date(
        e.first_lesson_date,
        e.lessons_paid,
        COALESCE(e.deadline_extension_weeks, 0)
    ) AS effective_end_date,
    -- Original end date without extensions
    calculate_end_date(e.first_lesson_date, e.lessons_paid) AS original_end_date,
    -- Days until enrollment ends
    DATEDIFF(
        calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ),
        CURDATE()
    ) as days_until_end
FROM enrollments e
INNER JOIN (
    -- Get the enrollment with the max first_lesson_date for each student
    SELECT
        student_id,
        MAX(first_lesson_date) as max_first_lesson_date
    FROM enrollments
    WHERE payment_status IN ('Paid', 'Pending Payment')
    GROUP BY student_id
) latest ON e.student_id = latest.student_id
        AND e.first_lesson_date = latest.max_first_lesson_date
WHERE e.payment_status IN ('Paid', 'Pending Payment')
  AND calculate_effective_end_date(
        e.first_lesson_date,
        e.lessons_paid,
        COALESCE(e.deadline_extension_weeks, 0)
      ) >= CURDATE();  -- Only active students

SELECT 'Created latest_enrollments view.' as result;

-- =====================================================
-- VIEW: Latest Enrollments by Location (for Looker Studio)
-- =====================================================
-- Includes all latest ACTIVE enrollments with student/tutor/discount details
-- Plus effective_end_date for tracking when enrollment ends
CREATE OR REPLACE VIEW latest_enrollments_by_location AS
SELECT
    e.id,
    e.student_id,
    e.tutor_id,
    e.assigned_day,
    e.assigned_time,
    e.location,
    e.lessons_paid,
    e.payment_date,
    e.first_lesson_date,
    e.payment_status,
    e.discount_id,
    e.remark,
    e.deadline_extension_weeks,
    e.enrollment_type,
    e.is_new_student,

    -- Date tracking
    e.effective_end_date,
    e.original_end_date,
    e.days_until_end,

    -- Student details
    s.student_name,
    s.school_student_id,
    s.home_location as student_home_location,
    s.grade,
    s.lang_stream,
    s.school,

    -- Tutor details
    t.tutor_name,

    -- Discount details
    d.discount_name,
    d.discount_value

FROM latest_enrollments e
LEFT JOIN students s ON e.student_id = s.id
LEFT JOIN tutors t ON e.tutor_id = t.id
LEFT JOIN discounts d ON e.discount_id = d.id;

SELECT 'Created latest_enrollments_by_location view with joins.' as result;

-- =====================================================
-- EXAMPLE QUERIES FOR LOOKER STUDIO
-- =====================================================

-- Latest enrollments for MSA location
-- SELECT * FROM latest_enrollments_by_location
-- WHERE location = 'MSA';

-- Latest enrollments for MSB location
-- SELECT * FROM latest_enrollments_by_location
-- WHERE location = 'MSB';

-- Count by location
-- SELECT location, COUNT(*) as student_count
-- FROM latest_enrollments
-- GROUP BY location;

-- Count by payment status
-- SELECT payment_status, COUNT(*) as enrollment_count
-- FROM latest_enrollments
-- GROUP BY payment_status;

SELECT 'Migration 029 completed.' as final_status;
SELECT 'Use latest_enrollments_by_location view in Looker Studio.' as reminder;

-- =====================================================
-- END Migration 029
-- =====================================================
