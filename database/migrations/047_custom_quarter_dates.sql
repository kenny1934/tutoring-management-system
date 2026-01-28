-- =====================================================
-- Migration 047: Custom Quarter Dates for Termination Tracking
-- =====================================================
-- Purpose: Update terminated_students view to use custom quarter schedule
--
-- New Quarter Schedule:
--   Q1: Jan 22 - Apr 21 (opening period: Jan 22-28)
--   Q2: Apr 22 - Jul 21 (opening period: Apr 22-28)
--   Q3: Jul 22 - Oct 21 (opening period: Jul 22-28)
--   Q4: Oct 22 - Jan 21 of next year (opening period: Oct 22-28)
--
-- Key change: Q4 crosses the year boundary
--   - Jan 15, 2026 is Q4 2025
--   - Jan 25, 2026 is Q1 2026
--
-- Note: Uses inline CASE statements instead of stored functions
--       for better compatibility across MySQL clients.

SELECT 'Updating terminated_students view with custom quarter logic...' as status;

-- =====================================================
-- VIEW: Terminated Students (Updated with Custom Quarters)
-- =====================================================
-- Uses inline CASE statements for quarter/year calculation
-- to avoid DELIMITER syntax issues

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

    -- Custom Quarter Calculation (inline CASE)
    -- Q1: Jan 22 - Apr 21, Q2: Apr 22 - Jul 21, Q3: Jul 22 - Oct 21, Q4: Oct 22 - Jan 21
    CASE
        -- Oct 22 or later (Oct 22 - Dec 31) -> Q4
        WHEN (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 10
              AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) >= 22)
             OR MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) > 10
        THEN 4
        -- Jul 22 to Oct 21 -> Q3
        WHEN (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 7
              AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) >= 22)
             OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) > 7
                 AND MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 10)
             OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 10
                 AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 22)
        THEN 3
        -- Apr 22 to Jul 21 -> Q2
        WHEN (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 4
              AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) >= 22)
             OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) > 4
                 AND MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 7)
             OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 7
                 AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 22)
        THEN 2
        -- Jan 22 to Apr 21 -> Q1
        WHEN (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 1
              AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) >= 22)
             OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) > 1
                 AND MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 4)
             OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 4
                 AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 22)
        THEN 1
        -- Jan 1-21 -> Q4 of previous year
        ELSE 4
    END as termination_quarter,

    -- Custom Year Calculation (inline CASE)
    -- Jan 1-21 belongs to Q4 of the PREVIOUS year
    CASE
        WHEN MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 1
             AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 22
        THEN YEAR(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) - 1
        ELSE YEAR(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0))))
    END as termination_year,

    -- Combined period string (e.g., "2025-Q4")
    CONCAT(
        -- Year part
        CASE
            WHEN MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 1
                 AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 22
            THEN YEAR(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) - 1
            ELSE YEAR(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0))))
        END,
        '-Q',
        -- Quarter part
        CASE
            WHEN (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 10
                  AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) >= 22)
                 OR MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) > 10
            THEN 4
            WHEN (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 7
                  AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) >= 22)
                 OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) > 7
                     AND MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 10)
                 OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 10
                     AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 22)
            THEN 3
            WHEN (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 4
                  AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) >= 22)
                 OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) > 4
                     AND MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 7)
                 OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 7
                     AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 22)
            THEN 2
            WHEN (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 1
                  AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) >= 22)
                 OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) > 1
                     AND MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 4)
                 OR (MONTH(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) = 4
                     AND DAY(MAX(calculate_effective_end_date(e.first_lesson_date, e.lessons_paid, COALESCE(e.deadline_extension_weeks, 0)))) < 22)
            THEN 1
            ELSE 4
        END
    ) as termination_period

FROM students s
INNER JOIN enrollments e ON s.id = e.student_id
WHERE s.id NOT IN (SELECT student_id FROM active_students)
  AND e.payment_status IN ('Paid', 'Pending Payment')
  AND e.enrollment_type = 'Regular'
GROUP BY s.id, s.student_name, s.school_student_id, s.home_location
HAVING MAX(
    calculate_effective_end_date(
        e.first_lesson_date,
        e.lessons_paid,
        COALESCE(e.deadline_extension_weeks, 0)
    )
) IS NOT NULL;

SELECT 'Migration 047 completed.' as final_status;
SELECT 'terminated_students view now uses custom quarter dates:' as info;
SELECT '  Q1: Jan 22 - Apr 21' as q1;
SELECT '  Q2: Apr 22 - Jul 21' as q2;
SELECT '  Q3: Jul 22 - Oct 21' as q3;
SELECT '  Q4: Oct 22 - Jan 21 (next year)' as q4;

-- =====================================================
-- END Migration 047
-- =====================================================
