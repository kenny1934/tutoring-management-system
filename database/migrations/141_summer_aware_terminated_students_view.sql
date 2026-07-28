-- =====================================================
-- Migration 141: Summer-Aware Terminated Students View
-- =====================================================
-- Purpose: Stop the summer course period from reading as mass termination.
--
-- Regular lessons pause while the summer course runs (summer_course_configs
-- .course_start_date .. .course_end_date), so that stretch belongs to no quarter.
-- Without this, every student whose paid lessons finished before the pause looks
-- terminated, because their next enrolment does not exist until the school year
-- restarts. For summer 2026 that was 529 students in Q2, against 41 in Q1.
--
-- Attribution rule (matches routers/terminations.py):
--   Lessons ending from (course_start_date - 28 days) through course_end_date are
--   judged in the quarter that resumes after the pause, not the one they fall in.
--   Everything else keeps its plain custom quarter.
--
--   2026 example: pause 5 Jul - 29 Aug, handover from 7 Jun
--     ends up to 6 Jun      -> Q2 2026 (its own quarter)
--     ends 7 Jun - 29 Aug   -> Q3 2026 (the quarter that resumes after)
--     ends from 30 Aug      -> plain quarter
--
-- Custom quarters (unchanged):
--   Q1: Jan 22 - Apr 21   Q2: Apr 22 - Jul 21
--   Q3: Jul 22 - Oct 21   Q4: Oct 22 - Jan 21 (next year)
--
-- Also rewrites the view over a derived table so the effective end date is
-- calculated once per student instead of ~40 times per row.

SELECT 'Rebuilding terminated_students view with summer-aware quarters...' as status;

CREATE OR REPLACE VIEW terminated_students AS
WITH student_ends AS (
    SELECT
        s.id as student_id,
        s.student_name,
        s.school_student_id,
        s.home_location,
        MAX(
            calculate_effective_end_date(
                e.first_lesson_date,
                e.lessons_paid,
                COALESCE(e.deadline_extension_weeks, 0)
            )
        ) as termination_date,
        MAX(e.payment_date) as last_payment_date,
        MAX(e.first_lesson_date) as last_first_lesson_date,
        MAX(e.lessons_paid) as last_lessons_paid
    FROM students s
    INNER JOIN enrollments e ON s.id = e.student_id
    WHERE s.id NOT IN (SELECT student_id FROM active_students)
      AND e.payment_status IN ('Paid', 'Pending Payment')
      AND e.enrollment_type = 'Regular'
    GROUP BY s.id, s.student_name, s.school_student_id, s.home_location
    HAVING termination_date IS NOT NULL
),
-- The date each student's quarter is worked out from. Ends in the run-up to the
-- summer pause, and inside it, are read as if they fell on the day the pause ends,
-- which lands them in the quarter that resumes afterwards.
judged AS (
    SELECT
        se.*,
        CASE
            WHEN sc.course_start_date IS NOT NULL
                 AND se.termination_date >= DATE_SUB(sc.course_start_date, INTERVAL 28 DAY)
                 AND se.termination_date <= sc.course_end_date
            THEN DATE_ADD(sc.course_end_date, INTERVAL 1 DAY)
            ELSE se.termination_date
        END as judged_date
    FROM student_ends se
    LEFT JOIN summer_course_configs sc ON sc.year = YEAR(se.termination_date)
),
classified AS (
    SELECT
        j.*,
        CASE
            -- Oct 22 or later -> Q4
            WHEN (MONTH(j.judged_date) = 10 AND DAY(j.judged_date) >= 22) OR MONTH(j.judged_date) > 10 THEN 4
            -- Jul 22 to Oct 21 -> Q3
            WHEN (MONTH(j.judged_date) = 7 AND DAY(j.judged_date) >= 22)
                 OR (MONTH(j.judged_date) > 7 AND MONTH(j.judged_date) < 10)
                 OR (MONTH(j.judged_date) = 10 AND DAY(j.judged_date) < 22) THEN 3
            -- Apr 22 to Jul 21 -> Q2
            WHEN (MONTH(j.judged_date) = 4 AND DAY(j.judged_date) >= 22)
                 OR (MONTH(j.judged_date) > 4 AND MONTH(j.judged_date) < 7)
                 OR (MONTH(j.judged_date) = 7 AND DAY(j.judged_date) < 22) THEN 2
            -- Jan 22 to Apr 21 -> Q1
            WHEN (MONTH(j.judged_date) = 1 AND DAY(j.judged_date) >= 22)
                 OR (MONTH(j.judged_date) > 1 AND MONTH(j.judged_date) < 4)
                 OR (MONTH(j.judged_date) = 4 AND DAY(j.judged_date) < 22) THEN 1
            -- Jan 1-21 -> Q4 of previous year
            ELSE 4
        END as termination_quarter,
        CASE
            WHEN MONTH(j.judged_date) = 1 AND DAY(j.judged_date) < 22
            THEN YEAR(j.judged_date) - 1
            ELSE YEAR(j.judged_date)
        END as termination_year
    FROM judged j
)
SELECT
    c.student_id,
    c.student_name,
    c.school_student_id,
    c.home_location,
    CONCAT(c.home_location, c.school_student_id) as company_id,
    c.termination_date,
    c.last_payment_date,
    c.last_first_lesson_date,
    c.last_lessons_paid,
    TIMESTAMPDIFF(MONTH, c.termination_date, CURDATE()) as months_since_termination,
    c.termination_quarter,
    c.termination_year,
    CONCAT(c.termination_year, '-Q', c.termination_quarter) as termination_period
FROM classified c;

SELECT 'Migration 141 completed.' as final_status;
SELECT 'terminated_students now judges ends around the summer pause in the quarter that resumes after it.' as info;

-- =====================================================
-- END Migration 141
-- =====================================================
