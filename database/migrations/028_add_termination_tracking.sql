-- =====================================================
-- Migration 028: Add Student Termination Tracking
-- =====================================================
-- Purpose: Track when students stop attending (for quarterly reporting)
--
-- Reuses existing infrastructure:
-- - calculate_effective_end_date() function (from migration 019)
-- - calculate_end_date() function (from migration 017)
-- - Accounts for holidays and deadline extensions automatically
-- - Includes both 'Paid' and 'Pending Payment' statuses

SELECT 'Adding termination tracking views...' as status;

-- =====================================================
-- VIEW: Currently Active Students
-- =====================================================
-- Students with at least one enrollment that hasn't ended yet
-- Includes both 'Paid' and 'Pending Payment' statuses
CREATE OR REPLACE VIEW active_students AS
SELECT DISTINCT
    s.id as student_id,
    s.student_name,
    s.school_student_id,
    s.home_location,
    COUNT(e.id) as active_enrollments,
    MAX(e.payment_date) as last_payment_date,
    MAX(
        calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        )
    ) as latest_lesson_end_date
FROM students s
INNER JOIN enrollments e ON s.id = e.student_id
WHERE e.payment_status IN ('Paid', 'Pending Payment')
  AND calculate_effective_end_date(
        e.first_lesson_date,
        e.lessons_paid,
        COALESCE(e.deadline_extension_weeks, 0)
      ) >= CURDATE()
GROUP BY s.id, s.student_name, s.school_student_id, s.home_location;

-- =====================================================
-- VIEW: Terminated Students (AppSheet-Friendly)
-- =====================================================
-- Students who have no active enrollments (all enrollments have ended)
-- Includes both 'Paid' and 'Pending Payment' statuses
-- Termination date = latest enrollment's effective end date
CREATE OR REPLACE VIEW terminated_students AS
SELECT
    s.id as student_id,
    s.student_name,
    s.school_student_id,
    s.home_location,
    CONCAT(s.home_location, s.school_student_id) as company_id,
    MAX(
        calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        )
    ) as termination_date,
    MAX(e.payment_date) as last_payment_date,
    MAX(e.first_lesson_date) as last_first_lesson_date,
    MAX(e.lessons_paid) as last_lessons_paid,
    TIMESTAMPDIFF(
        MONTH,
        MAX(
            calculate_effective_end_date(
                e.first_lesson_date,
                e.lessons_paid,
                COALESCE(e.deadline_extension_weeks, 0)
            )
        ),
        CURDATE()
    ) as months_since_termination,
    QUARTER(
        MAX(
            calculate_effective_end_date(
                e.first_lesson_date,
                e.lessons_paid,
                COALESCE(e.deadline_extension_weeks, 0)
            )
        )
    ) as termination_quarter,
    YEAR(
        MAX(
            calculate_effective_end_date(
                e.first_lesson_date,
                e.lessons_paid,
                COALESCE(e.deadline_extension_weeks, 0)
            )
        )
    ) as termination_year,
    CONCAT(
        YEAR(
            MAX(
                calculate_effective_end_date(
                    e.first_lesson_date,
                    e.lessons_paid,
                    COALESCE(e.deadline_extension_weeks, 0)
                )
            )
        ),
        '-Q',
        QUARTER(
            MAX(
                calculate_effective_end_date(
                    e.first_lesson_date,
                    e.lessons_paid,
                    COALESCE(e.deadline_extension_weeks, 0)
                )
            )
        )
    ) as termination_period
FROM students s
INNER JOIN enrollments e ON s.id = e.student_id
WHERE s.id NOT IN (SELECT student_id FROM active_students)
  AND e.payment_status IN ('Paid', 'Pending Payment')  -- Exclude cancelled
GROUP BY s.id, s.student_name, s.school_student_id, s.home_location
HAVING MAX(
    calculate_effective_end_date(
        e.first_lesson_date,
        e.lessons_paid,
        COALESCE(e.deadline_extension_weeks, 0)
    )
) IS NOT NULL;

SELECT 'Created active_students and terminated_students views.' as result;

-- =====================================================
-- EXAMPLE QUERIES FOR QUARTERLY REPORTING
-- =====================================================

-- Q4 2025 Terminations (Oct-Dec) - For quarterly submission
-- SELECT
--     company_id,
--     student_name,
--     termination_date as last_lesson_date,
--     last_payment_date,
--     months_since_termination
-- FROM terminated_students
-- WHERE termination_year = 2025
--   AND termination_quarter = 4
-- ORDER BY termination_date DESC;

-- Custom date range (e.g., Oct 1 - Dec 31, 2025)
-- SELECT
--     company_id,
--     student_name,
--     termination_date as last_lesson_date,
--     last_payment_date
-- FROM terminated_students
-- WHERE termination_date BETWEEN '2025-10-01' AND '2025-12-31'
-- ORDER BY termination_date DESC;

-- All currently terminated students
-- SELECT
--     student_name,
--     company_id,
--     termination_date,
--     termination_period,
--     months_since_termination
-- FROM terminated_students
-- ORDER BY termination_date DESC;

-- Students who might return (terminated < 6 months ago)
-- SELECT
--     student_name,
--     company_id,
--     termination_date,
--     months_since_termination
-- FROM terminated_students
-- WHERE months_since_termination <= 6
-- ORDER BY termination_date DESC;

-- Count by quarter for reporting
-- SELECT
--     termination_period,
--     COUNT(*) as students_terminated
-- FROM terminated_students
-- GROUP BY termination_period
-- ORDER BY termination_year DESC, termination_quarter DESC;

SELECT 'Migration 028 completed.' as final_status;
SELECT 'Use terminated_students view for quarterly termination reports.' as reminder;
SELECT 'Example: SELECT * FROM terminated_students WHERE termination_year=2025 AND termination_quarter=4;' as example;

-- =====================================================
-- END Migration 028
-- =====================================================
