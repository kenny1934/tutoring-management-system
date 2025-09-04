-- Test queries for session_curriculum_suggestions view
-- Verify the improved 3-week suggestion system works correctly

-- 1. Test: Check if view was created successfully
SHOW TABLES LIKE 'session_curriculum_suggestions';

-- 2. Test: Check view structure
DESCRIBE session_curriculum_suggestions;

-- 3. Test: Get sample sessions with 3-week curriculum suggestions
-- This should show sessions with Week N-1, N, N+1 options
SELECT 
    session_date,
    student_name,
    school,
    grade,
    lang_stream,
    current_week_number,
    suggestions_display,
    coverage_status
FROM session_curriculum_suggestions
WHERE session_date >= '2025-09-01'  -- Current September sessions
LIMIT 5;

-- 4. Test: Check early September recommendations (Sep 1-10)
-- Should show "👈 Likely" for Week N-1
SELECT 
    session_date,
    school,
    current_week_number,
    suggestions_display
FROM session_curriculum_suggestions
WHERE session_date BETWEEN '2025-09-01' AND '2025-09-10'
    AND coverage_status != 'No Coverage'
LIMIT 3;

-- 5. Test: Count coverage quality across all current sessions
SELECT 
    coverage_status,
    COUNT(*) as session_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
FROM session_curriculum_suggestions
WHERE session_date >= '2025-09-01'
GROUP BY coverage_status
ORDER BY session_count DESC;

-- 6. Test: Individual week columns work correctly
SELECT 
    session_date,
    school,
    current_week_number,
    week_before_topic,
    same_week_topic,
    week_after_topic,
    suggestion_count
FROM session_curriculum_suggestions
WHERE school = 'PCMS' 
    AND session_date >= '2025-09-01'
LIMIT 3;

-- 7. Test: User-friendly display formatting
SELECT 
    session_date,
    school,
    user_friendly_display,
    options_for_buttons
FROM session_curriculum_suggestions
WHERE session_date >= '2025-09-01'
    AND coverage_status != 'No Coverage'
LIMIT 3;

-- 8. Test: Performance check
-- Should execute quickly even with all the JOINs
SELECT 
    COUNT(*) as total_sessions,
    COUNT(CASE WHEN coverage_status != 'No Coverage' THEN 1 END) as with_curriculum,
    ROUND(COUNT(CASE WHEN coverage_status != 'No Coverage' THEN 1 END) * 100.0 / COUNT(*), 1) as coverage_percentage
FROM session_curriculum_suggestions;

-- Expected results:
-- - Early September should show "👈 Likely" recommendations
-- - Most sessions should have at least partial coverage
-- - No confusing star symbols, just clear language
-- - 3 weeks of options available for context