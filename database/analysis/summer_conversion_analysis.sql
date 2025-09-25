-- Summer Course to Regular Course Conversion Analysis
-- Purpose: Analyze how many summer course students continued to regular courses
-- Key Insight: school_student_id is unique per location (MSA/MSB), not globally

-- ============================================================================
-- STEP 1: CREATE TEMPORARY TABLE FOR SUMMER STUDENTS
-- ============================================================================

SELECT 'Creating temporary table for summer course data...' as status;

DROP TEMPORARY TABLE IF EXISTS summer_students;

CREATE TEMPORARY TABLE summer_students (
    student_id VARCHAR(100),
    student_name VARCHAR(255),
    coupon_code VARCHAR(100),
    location VARCHAR(10),
    category VARCHAR(50),
    INDEX idx_student_location (student_id, location),
    INDEX idx_name_location (student_name, location)
);

SELECT 'Temporary table created. Ready for data loading.' as result;

-- ============================================================================
-- STEP 2: MAIN CONVERSION ANALYSIS QUERIES
-- ============================================================================

SELECT 'Running conversion analysis with location-aware matching...' as status;

-- Overall conversion summary by category
SELECT 'CONVERSION SUMMARY BY CATEGORY' as report_section;

SELECT
    ss.category,
    COUNT(*) as total_summer_students,
    COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) as students_converted,
    ROUND(
        COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) * 100.0 / COUNT(*),
        2
    ) as conversion_rate_percent
FROM summer_students ss
LEFT JOIN students s ON (
    ss.student_id = s.school_student_id
    AND ss.location = s.home_location
)
LEFT JOIN enrollments e ON (
    s.id = e.student_id
    AND e.payment_status IN ('Paid', 'Pending Payment')
    -- Filter for regular course enrollments starting September 2025
    AND e.first_lesson_date >= '2025-09-01'
)
GROUP BY ss.category
ORDER BY
    CASE ss.category
        WHEN '25SSNEW (全新生)' THEN 1
        WHEN '25SummerMC (MathConcept 學生升讀)' THEN 2
        WHEN '25SummerRT (回歸學生)' THEN 3
    END;

-- Conversion breakdown by location
SELECT 'CONVERSION SUMMARY BY LOCATION' as report_section;

SELECT
    ss.location,
    COUNT(*) as total_summer_students,
    COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) as students_converted,
    ROUND(
        COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) * 100.0 / COUNT(*),
        2
    ) as conversion_rate_percent
FROM summer_students ss
LEFT JOIN students s ON (
    ss.student_id = s.school_student_id
    AND ss.location = s.home_location
)
LEFT JOIN enrollments e ON (
    s.id = e.student_id
    AND e.payment_status IN ('Paid', 'Pending Payment')
    AND e.first_lesson_date >= '2025-09-01'
)
GROUP BY ss.location
ORDER BY ss.location;

-- Detailed breakdown by category and location
SELECT 'DETAILED CONVERSION BREAKDOWN' as report_section;

SELECT
    ss.category,
    ss.location,
    COUNT(*) as total_summer,
    COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) as converted,
    ROUND(
        COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) * 100.0 / COUNT(*),
        2
    ) as conversion_rate
FROM summer_students ss
LEFT JOIN students s ON (
    ss.student_id = s.school_student_id
    AND ss.location = s.home_location
)
LEFT JOIN enrollments e ON (
    s.id = e.student_id
    AND e.payment_status IN ('Paid', 'Pending Payment')
    AND e.first_lesson_date >= '2025-09-01'
)
GROUP BY ss.category, ss.location
ORDER BY
    CASE ss.category
        WHEN '25SSNEW (全新生)' THEN 1
        WHEN '25SummerMC (MathConcept 學生升讀)' THEN 2
        WHEN '25SummerRT (回歸學生)' THEN 3
    END,
    ss.location;

-- ============================================================================
-- STEP 3: DETAILED STUDENT MATCHING REPORT
-- ============================================================================

SELECT 'DETAILED STUDENT MATCHING STATUS' as report_section;

SELECT
    ss.student_id,
    ss.student_name,
    ss.location,
    ss.category,
    CASE
        WHEN e.id IS NOT NULL THEN 'Converted to Regular Course'
        WHEN s.id IS NOT NULL THEN 'In Database - Not Enrolled'
        ELSE 'Not Found in Database'
    END as matching_status,
    s.id as database_student_id,
    e.id as enrollment_id,
    e.first_lesson_date,
    e.payment_status,
    e.lessons_paid
FROM summer_students ss
LEFT JOIN students s ON (
    ss.student_id = s.school_student_id
    AND ss.location = s.home_location
)
LEFT JOIN enrollments e ON (
    s.id = e.student_id
    AND e.payment_status IN ('Paid', 'Pending Payment')
    AND e.first_lesson_date >= '2025-09-01'
)
ORDER BY
    ss.category,
    ss.location,
    CAST(ss.student_id AS UNSIGNED);

-- ============================================================================
-- STEP 4: NON-CONVERTED STUDENTS FOR FOLLOW-UP
-- ============================================================================

SELECT 'NON-CONVERTED STUDENTS (POTENTIAL FOLLOW-UP)' as report_section;

SELECT
    ss.category,
    ss.location,
    ss.student_id,
    ss.student_name,
    CASE
        WHEN s.id IS NOT NULL THEN 'In Database - Not Enrolled'
        ELSE 'Not Found in Database'
    END as reason_not_converted
FROM summer_students ss
LEFT JOIN students s ON (
    ss.student_id = s.school_student_id
    AND ss.location = s.home_location
)
LEFT JOIN enrollments e ON (
    s.id = e.student_id
    AND e.payment_status IN ('Paid', 'Pending Payment')
    AND e.first_lesson_date >= '2025-09-01'
)
WHERE e.id IS NULL  -- No regular course enrollment found
ORDER BY
    ss.category,
    ss.location,
    CAST(ss.student_id AS UNSIGNED);

-- ============================================================================
-- STEP 5: ALTERNATIVE NAME MATCHING (FOR DATA QUALITY CHECK)
-- ============================================================================

SELECT 'NAME-BASED MATCHING CHECK (for students not found by ID+location)' as report_section;

SELECT
    ss.student_id as summer_id,
    ss.student_name as summer_name,
    ss.location as summer_location,
    s.school_student_id as db_id,
    s.student_name as db_name,
    s.home_location as db_location,
    'Name match but different ID or location' as note
FROM summer_students ss
LEFT JOIN students s_primary ON (
    ss.student_id = s_primary.school_student_id
    AND ss.location = s_primary.home_location
)
JOIN students s ON (
    LOWER(TRIM(ss.student_name)) = LOWER(TRIM(s.student_name))
    AND (ss.student_id != s.school_student_id OR ss.location != s.home_location)
)
WHERE s_primary.id IS NULL  -- Only show students not found by primary match
ORDER BY ss.student_name;

SELECT 'Summer course conversion analysis completed.' as result;

-- ============================================================================
-- USAGE INSTRUCTIONS
-- ============================================================================

/*
TO RUN THIS ANALYSIS:

1. Load the summer course data into the temporary table:
   Use the Python script or manually import the CSV data

2. Execute all queries in sequence to get comprehensive reports

3. Key reports generated:
   - Overall conversion rates by student category
   - Conversion rates by location (MSA vs MSB)
   - Detailed student-by-student matching results
   - List of non-converted students for follow-up
   - Data quality check via name matching

EXPECTED RESULTS FORMAT:
- Total summer students: 206
- Categories: 54 new, 111 MathConcept, 41 returning
- Locations: MSA and MSB breakdown
- Conversion rates as percentages

IMPORTANT NOTES:
- school_student_id is unique PER LOCATION, not globally
- Must match on both student_id AND location for accuracy
- Regular course enrollments filtered by first_lesson_date >= '2025-09-01'
- Payment status must be 'Paid' or 'Pending Payment' to count as converted
*/