-- Analysis script to identify school name mismatches (Fixed for strict GROUP BY)
-- Find sessions showing "No Coverage" due to school name differences

-- 1. Schools in students table that have no matching curriculum
SELECT 
    'Students Only' as source,
    s.school as school_name,
    s.grade,
    s.lang_stream,
    COUNT(DISTINCT s.id) as student_count,
    COUNT(DISTINCT CASE WHEN sl.session_date >= '2025-09-01' THEN sl.id END) as session_count
FROM students s
LEFT JOIN session_log sl ON sl.student_id = s.id 
LEFT JOIN school_curriculum sc ON sc.school = s.school 
    AND sc.grade = s.grade 
    AND sc.lang_stream = s.lang_stream
WHERE sc.id IS NULL  -- No matching curriculum
GROUP BY s.school, s.grade, s.lang_stream
HAVING session_count > 0
ORDER BY session_count DESC, school_name;

-- 2. Schools in curriculum that have no current students
SELECT 
    'Curriculum Only' as source,
    sc.school as school_name,
    sc.grade,
    sc.lang_stream,
    0 as student_count,
    0 as session_count
FROM school_curriculum sc
LEFT JOIN students s ON s.school = sc.school 
    AND s.grade = sc.grade 
    AND s.lang_stream = sc.lang_stream
WHERE s.id IS NULL  -- No matching students
    AND sc.academic_year = '2024-2025'
GROUP BY sc.school, sc.grade, sc.lang_stream
ORDER BY sc.school, sc.grade, sc.lang_stream;

-- 3. Potential fuzzy matches with session impact
SELECT 
    s.school as student_school,
    sc.school as curriculum_school,
    s.grade,
    s.lang_stream,
    COUNT(DISTINCT sl.id) as affected_sessions,
    -- Simple similarity indicators
    CASE 
        WHEN UPPER(s.school) = UPPER(sc.school) THEN 'EXACT'
        WHEN LOCATE(UPPER(s.school), UPPER(sc.school)) > 0 OR LOCATE(UPPER(sc.school), UPPER(s.school)) > 0 THEN 'CONTAINS'
        WHEN SOUNDEX(s.school) = SOUNDEX(sc.school) THEN 'SOUNDS_LIKE'
        WHEN (LENGTH(s.school) > 3 AND LENGTH(sc.school) > 3 AND 
             (LOCATE(LEFT(UPPER(s.school), 4), UPPER(sc.school)) > 0 OR
              LOCATE(LEFT(UPPER(sc.school), 4), UPPER(s.school)) > 0)) THEN 'PREFIX_MATCH'
        ELSE 'OTHER'
    END as match_type
FROM students s
CROSS JOIN school_curriculum sc
LEFT JOIN session_log sl ON sl.student_id = s.id AND sl.session_date >= '2025-09-01'
WHERE s.school != sc.school  -- Different names
    AND s.grade = sc.grade 
    AND s.lang_stream = sc.lang_stream
    AND sc.academic_year = '2024-2025'
    AND (
        -- Only show likely matches
        UPPER(s.school) LIKE CONCAT('%', LEFT(UPPER(sc.school), 3), '%') OR
        UPPER(sc.school) LIKE CONCAT('%', LEFT(UPPER(s.school), 3), '%') OR
        SOUNDEX(s.school) = SOUNDEX(sc.school) OR
        LOCATE(UPPER(s.school), UPPER(sc.school)) > 0 OR
        LOCATE(UPPER(sc.school), UPPER(s.school)) > 0
    )
GROUP BY s.school, sc.school, s.grade, s.lang_stream
HAVING affected_sessions > 0
ORDER BY affected_sessions DESC, match_type;

-- 4. Sessions with "No Coverage" breakdown  
SELECT 
    scs.school,
    scs.grade,
    scs.lang_stream,
    COUNT(*) as no_coverage_sessions,
    -- Check if there's curriculum for potentially similar school names
    (SELECT COUNT(DISTINCT sc.school) 
     FROM school_curriculum sc 
     WHERE sc.grade = scs.grade 
       AND sc.lang_stream = scs.lang_stream
       AND sc.academic_year = '2024-2025'
       AND (LOCATE(UPPER(LEFT(scs.school, 3)), UPPER(sc.school)) > 0
            OR LOCATE(UPPER(LEFT(sc.school, 3)), UPPER(scs.school)) > 0)
    ) as potentially_matching_schools
FROM session_curriculum_suggestions scs
WHERE scs.coverage_status = 'No Coverage'
    AND scs.session_date >= '2025-09-01'
GROUP BY scs.school, scs.grade, scs.lang_stream
ORDER BY no_coverage_sessions DESC;

-- 5. Coverage summary
SELECT 
    COUNT(*) as total_sessions,
    COUNT(CASE WHEN coverage_status != 'No Coverage' THEN 1 END) as with_curriculum,
    COUNT(CASE WHEN coverage_status = 'No Coverage' THEN 1 END) as no_curriculum,
    ROUND(COUNT(CASE WHEN coverage_status != 'No Coverage' THEN 1 END) * 100.0 / COUNT(*), 1) as coverage_percentage
FROM session_curriculum_suggestions
WHERE session_date >= '2025-09-01';

-- 6. Quick diagnostic: Show actual school names for manual review
SELECT DISTINCT
    'Student Schools' as type,
    school as name
FROM students
WHERE id IN (SELECT student_id FROM session_log WHERE session_date >= '2025-09-01')
UNION ALL
SELECT DISTINCT
    'Curriculum Schools' as type,
    school as name  
FROM school_curriculum
WHERE academic_year = '2024-2025'
ORDER BY type, name;