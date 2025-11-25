-- Migration: 036_courseware_popularity_views
-- Description: Create views for tracking courseware file popularity
-- Purpose: Allow tutors to see which PDF files are most commonly assigned,
--          filtered by grade, language stream, location, exercise type, etc.

-- ============================================================================
-- View 1: courseware_usage_detail (Flat View)
-- Purpose: Flexible filtering by date range (this week, this month, etc.)
-- ============================================================================
CREATE OR REPLACE VIEW courseware_usage_detail AS
SELECT
    se.id AS exercise_id,
    -- Normalize path: strip surrounding quotes, then strip drive letter
    -- e.g., '"V:\Secondary\...\file.pdf"' -> '\Secondary\...\file.pdf'
    CASE
        WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
        THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
        ELSE TRIM(BOTH '"' FROM se.pdf_name)
    END AS normalized_path,
    -- Extract just the filename (for joining with summary views)
    SUBSTRING_INDEX(
        CASE
            WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
            THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
            ELSE TRIM(BOTH '"' FROM se.pdf_name)
        END,
        '\\', -1
    ) AS filename,
    se.pdf_name AS original_pdf_name,
    se.exercise_type,
    se.page_start,
    se.page_end,
    sl.session_date,
    sl.location,
    sl.student_id,
    s.student_name,
    s.grade,
    s.lang_stream,
    s.school,
    s.academic_stream,
    sl.tutor_id,
    t.tutor_name
FROM session_exercises se
JOIN session_log sl ON se.session_id = sl.id
JOIN students s ON sl.student_id = s.id
JOIN tutors t ON sl.tutor_id = t.id;

-- ============================================================================
-- View 2: courseware_popularity_summary (Aggregated View)
-- Purpose: Simple all-time popularity rankings, one row per filename
-- ============================================================================
CREATE OR REPLACE VIEW courseware_popularity_summary AS
SELECT
    -- Group by filename only
    SUBSTRING_INDEX(
        CASE
            WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
            THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
            ELSE TRIM(BOTH '"' FROM se.pdf_name)
        END,
        '\\', -1
    ) AS filename,

    -- All unique normalized paths for this filename
    GROUP_CONCAT(DISTINCT
        CASE
            WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
            THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
            ELSE TRIM(BOTH '"' FROM se.pdf_name)
        END
        SEPARATOR ', '
    ) AS normalized_paths,

    -- School/grade/lang_stream combinations as a list
    GROUP_CONCAT(DISTINCT
        CONCAT(s.school, ' ', s.grade, s.lang_stream)
        ORDER BY s.school, s.grade, s.lang_stream
        SEPARATOR ', '
    ) AS used_by,

    -- Popularity metrics
    COUNT(*) AS assignment_count,
    COUNT(DISTINCT sl.student_id) AS unique_student_count,

    -- Time range
    MIN(sl.session_date) AS earliest_use,
    MAX(sl.session_date) AS latest_use
FROM session_exercises se
JOIN session_log sl ON se.session_id = sl.id
JOIN students s ON sl.student_id = s.id
GROUP BY
    SUBSTRING_INDEX(
        CASE
            WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
            THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
            ELSE TRIM(BOTH '"' FROM se.pdf_name)
        END,
        '\\', -1
    );

-- ============================================================================
-- View 3: courseware_popularity_recent (Last 14 Days)
-- Purpose: Recent popularity rankings, same structure as summary but last 14 days only
-- ============================================================================
CREATE OR REPLACE VIEW courseware_popularity_recent AS
SELECT
    -- Group by filename only
    SUBSTRING_INDEX(
        CASE
            WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
            THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
            ELSE TRIM(BOTH '"' FROM se.pdf_name)
        END,
        '\\', -1
    ) AS filename,

    -- All unique normalized paths for this filename
    GROUP_CONCAT(DISTINCT
        CASE
            WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
            THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
            ELSE TRIM(BOTH '"' FROM se.pdf_name)
        END
        SEPARATOR ', '
    ) AS normalized_paths,

    -- School/grade/lang_stream combinations as a list
    GROUP_CONCAT(DISTINCT
        CONCAT(s.school, ' ', s.grade, s.lang_stream)
        ORDER BY s.school, s.grade, s.lang_stream
        SEPARATOR ', '
    ) AS used_by,

    -- Popularity metrics
    COUNT(*) AS assignment_count,
    COUNT(DISTINCT sl.student_id) AS unique_student_count,

    -- Time range
    MIN(sl.session_date) AS earliest_use,
    MAX(sl.session_date) AS latest_use
FROM session_exercises se
JOIN session_log sl ON se.session_id = sl.id
JOIN students s ON sl.student_id = s.id
WHERE sl.session_date >= CURDATE() - INTERVAL 14 DAY
GROUP BY
    SUBSTRING_INDEX(
        CASE
            WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
            THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
            ELSE TRIM(BOTH '"' FROM se.pdf_name)
        END,
        '\\', -1
    );
