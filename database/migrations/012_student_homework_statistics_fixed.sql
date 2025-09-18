-- =====================================================
-- Migration 012 FIXED: Student Homework Statistics View (CORRECTED)
-- =====================================================
-- FIXES:
-- 1. Count assigned homework from session_exercises (not homework_completion)
-- 2. Fix star rating calculation (CHAR_LENGTH instead of LENGTH/2)

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

-- Create corrected student homework statistics view
CREATE OR REPLACE VIEW student_homework_statistics AS
SELECT
    s.id as student_id,
    s.student_name,
    s.grade,
    s.school,

    -- Count homework assignments from session_exercises (actual assignments)
    COUNT(DISTINCT se.id) as total_homework_assigned,

    -- Count submitted homework from homework_completion
    SUM(CASE WHEN hc.submitted = TRUE THEN 1 ELSE 0 END) as total_submitted,

    -- Submission rate as percentage (submitted / assigned)
    ROUND(
        CASE
            WHEN COUNT(DISTINCT se.id) > 0 THEN
                (SUM(CASE WHEN hc.submitted = TRUE THEN 1 ELSE 0 END) * 100.0) / COUNT(DISTINCT se.id)
            ELSE 0
        END,
        1
    ) as submission_rate_percent,

    -- Average completion score (Completed=100%, Partially=50%, Not Completed=0%)
    ROUND(
        AVG(
            CASE
                WHEN hc.completion_status = 'Completed' THEN 100
                WHEN hc.completion_status = 'Partially Completed' THEN 50
                WHEN hc.completion_status = 'Not Completed' THEN 0
                ELSE NULL
            END
        ),
        1
    ) as avg_completion_score,

    -- Average star rating (count actual star emoji characters)
    ROUND(
        AVG(
            CASE
                WHEN hc.homework_rating IS NOT NULL AND CHAR_LENGTH(hc.homework_rating) > 0
                THEN CHAR_LENGTH(hc.homework_rating)  -- Count actual star characters (⭐⭐⭐ = 3)
                ELSE NULL
            END
        ),
        1
    ) as avg_star_rating,

    -- Count of rated homework
    SUM(CASE WHEN hc.homework_rating IS NOT NULL AND CHAR_LENGTH(hc.homework_rating) > 0 THEN 1 ELSE 0 END) as total_rated,

    -- Last 30 days statistics (count assignments from session_exercises)
    COUNT(
        CASE
            WHEN sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            THEN se.id ELSE NULL
        END
    ) as recent_assigned_30d,

    SUM(
        CASE
            WHEN sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND hc.submitted = TRUE
            THEN 1 ELSE 0
        END
    ) as recent_submitted_30d,

    -- Recent submission rate (last 30 days)
    ROUND(
        CASE
            WHEN COUNT(CASE WHEN sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN se.id ELSE NULL END) > 0
            THEN (SUM(CASE WHEN sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND hc.submitted = TRUE THEN 1 ELSE 0 END) * 100.0) /
                 COUNT(CASE WHEN sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN se.id ELSE NULL END)
            ELSE 0
        END,
        1
    ) as recent_submission_rate_30d,

    -- Latest homework assignment date (from sessions with homework)
    MAX(sl.session_date) as last_homework_date,

    -- Latest homework check date
    MAX(hc.checked_at) as last_checked_date,

    -- Formatted summary strings for AppSheet display
    CONCAT(
        IFNULL(SUM(CASE WHEN hc.submitted = TRUE THEN 1 ELSE 0 END), 0),
        ' of ',
        COUNT(DISTINCT se.id),
        ' submitted (',
        ROUND(
            CASE
                WHEN COUNT(DISTINCT se.id) > 0 THEN
                    (IFNULL(SUM(CASE WHEN hc.submitted = TRUE THEN 1 ELSE 0 END), 0) * 100.0) / COUNT(DISTINCT se.id)
                ELSE 0
            END,
            1
        ),
        '%)'
    ) as submission_summary,

    CONCAT(
        IFNULL(SUM(CASE WHEN sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND hc.submitted = TRUE THEN 1 ELSE 0 END), 0),
        ' of ',
        COUNT(CASE WHEN sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN se.id ELSE NULL END),
        ' submitted (last 30 days)'
    ) as recent_summary

FROM students s
-- Join with session_exercises to get ALL assigned homework (the source of truth)
LEFT JOIN session_log sl ON s.id = sl.student_id
    AND sl.session_status IN ('Scheduled', 'Attended', 'Attended (Make-up)', 'Make-up Class', 'Trial Class')
LEFT JOIN session_exercises se ON sl.id = se.session_id
    AND se.exercise_type = 'HW'
-- Join with homework_completion to get submission/completion data (only exists when submitted/checked)
LEFT JOIN homework_completion hc ON se.id = hc.session_exercise_id

GROUP BY s.id, s.student_name, s.grade, s.school
ORDER BY s.student_name;

-- Test the corrected view
SELECT 'Testing CORRECTED student_homework_statistics view...' as test_step;
SELECT COUNT(*) as total_students_with_stats FROM student_homework_statistics;

-- Show sample data with corrected calculations
SELECT 'Sample CORRECTED homework statistics:' as test_step;
SELECT
    student_name,
    total_homework_assigned,
    total_submitted,
    submission_summary,
    recent_summary,
    CONCAT(IFNULL(avg_completion_score, 0), '%') as avg_completion,
    CONCAT(IFNULL(avg_star_rating, 0), ' stars') as avg_rating
FROM student_homework_statistics
WHERE total_homework_assigned > 0
LIMIT 5;

-- Test star rating calculation specifically
SELECT 'Testing star rating calculation:' as test_step;
SELECT
    CHAR_LENGTH('⭐') as single_star,
    CHAR_LENGTH('⭐⭐⭐') as three_stars,
    CHAR_LENGTH('⭐⭐⭐⭐⭐') as five_stars;

SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1);
SET UNIQUE_CHECKS=IFNULL(@OLD_UNIQUE_CHECKS, 1);

SELECT 'MIGRATION 012 FIXED COMPLETED - Homework statistics now count correctly from session_exercises' as final_status;

-- =====================================================
-- END Migration 012 FIXED: Student Homework Statistics
-- =====================================================