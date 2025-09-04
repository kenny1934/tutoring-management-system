-- Test queries for session_curriculum_reference view
-- Run these after creating the view to verify it works correctly

-- 1. Test: Check if view was created successfully
SHOW TABLES LIKE 'session_curriculum_reference';

-- 2. Test: Check view structure
DESCRIBE session_curriculum_reference;

-- 3. Test: Get sample sessions with curriculum reference
-- This should show sessions with matching curriculum data from last year
SELECT 
    session_date,
    student_name,
    school,
    grade,
    lang_stream,
    last_year_curriculum,
    curriculum_status,
    curriculum_confidence,
    current_week_number
FROM session_curriculum_reference
WHERE session_date >= '2025-09-01'  -- Current September sessions
LIMIT 10;

-- 4. Test: Count how many sessions have curriculum reference available
SELECT 
    curriculum_status,
    COUNT(*) as session_count
FROM session_curriculum_reference
WHERE session_date >= '2025-09-01'
GROUP BY curriculum_status;

-- 5. Test: Check specific school's curriculum reference
-- Replace 'PCMS' with any school code from your data
SELECT 
    session_date,
    student_name,
    school,
    grade,
    lang_stream,
    last_year_curriculum,
    curriculum_confidence
FROM session_curriculum_reference
WHERE school = 'PCMS'
    AND curriculum_status = 'Available'
    AND session_date >= '2025-09-01'
LIMIT 5;

-- 6. Test: Verify week number mapping is correct
-- Should show sessions grouped by week with their curriculum
SELECT 
    current_week_number,
    MIN(session_date) as week_start,
    MAX(session_date) as week_end,
    COUNT(DISTINCT id) as sessions_in_week,
    COUNT(DISTINCT last_year_curriculum) as unique_topics
FROM session_curriculum_reference
WHERE session_date BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY current_week_number
ORDER BY current_week_number;

-- 7. Test: Find sessions without curriculum data (gaps to fill)
SELECT 
    school,
    grade,
    lang_stream,
    COUNT(*) as sessions_without_data
FROM session_curriculum_reference
WHERE curriculum_status = 'No Data'
    AND session_date >= '2025-09-01'
GROUP BY school, grade, lang_stream
HAVING COUNT(*) > 0
ORDER BY sessions_without_data DESC;

-- 8. Test: Performance check - ensure view responds quickly
-- This should execute in under 1 second
SELECT COUNT(*) as total_sessions
FROM session_curriculum_reference;

-- Expected results:
-- - View should exist and be accessible
-- - Sessions in September 2025 should show curriculum from September 2024
-- - Schools like PCMS, SRL-C, etc. should have matching curriculum data
-- - curriculum_confidence should be 5 for all imported historical data