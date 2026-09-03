-- Migration 169: store the courseware filename key on session_exercises
--
-- Why: the migration-036 popularity views derive their grouping key (the
-- assigned file's basename with the extension stripped) from every
-- session_exercises row on every query, through a seven-branch CASE over
-- nested SUBSTRING_INDEX calls. That is the whole cost of the School
-- Progress suggestions on a cold cache (about 0.7 s for the all-time view
-- and 0.4 s per school on the server, measured on 34,000 rows), and the
-- Trending strip and the courseware page pay the same per-row work.
--
-- What: a stored generated column carries that key once per row, with an
-- index, and the three views read it instead of recomputing it. The
-- expression produces exactly what the views produced (checked row by row
-- against courseware_usage_detail before this migration was written), so
-- every view still returns the same rows. Only the cost changes.
--
-- The key is case-preserving like the views were. Callers that want a
-- case-insensitive join lowercase it themselves, which is what the
-- suggestions router already does.

ALTER TABLE session_exercises
    ADD COLUMN filename_key VARCHAR(255)
        GENERATED ALWAYS AS (
            REGEXP_REPLACE(
                SUBSTRING_INDEX(
                    CASE
                        WHEN TRIM(BOTH '"' FROM TRIM(pdf_name)) REGEXP '^[A-Za-z]:'
                        THEN SUBSTRING(TRIM(BOTH '"' FROM TRIM(pdf_name)), 3)
                        ELSE TRIM(BOTH '"' FROM TRIM(pdf_name))
                    END,
                    '\\', -1),
                '\\.(docx|xlsx|pptx|pdf|doc|jpg)$', '', 1, 0, 'i')
        ) STORED
        COMMENT 'basename of pdf_name without a known extension, the popularity grouping key',
    ADD INDEX idx_se_filename_key (filename_key);

-- ============================================================================
-- View 1: courseware_usage_detail (flat view), same columns as migration 036
-- ============================================================================
CREATE OR REPLACE VIEW courseware_usage_detail AS
SELECT
    se.id AS exercise_id,
    CASE
        WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
        THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
        ELSE TRIM(BOTH '"' FROM se.pdf_name)
    END AS normalized_path,
    se.filename_key AS filename,
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
-- View 2: courseware_popularity_summary (all time), same columns as 036
-- ============================================================================
CREATE OR REPLACE VIEW courseware_popularity_summary AS
SELECT
    se.filename_key AS filename,
    GROUP_CONCAT(DISTINCT
        CASE
            WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
            THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
            ELSE TRIM(BOTH '"' FROM se.pdf_name)
        END
        SEPARATOR ', '
    ) AS normalized_paths,
    GROUP_CONCAT(DISTINCT
        CONCAT(s.school, ' ', s.grade, s.lang_stream)
        ORDER BY s.school, s.grade, s.lang_stream
        SEPARATOR ', '
    ) AS used_by,
    COUNT(*) AS assignment_count,
    COUNT(DISTINCT sl.student_id) AS unique_student_count,
    MIN(sl.session_date) AS earliest_use,
    MAX(sl.session_date) AS latest_use
FROM session_exercises se
JOIN session_log sl ON se.session_id = sl.id
JOIN students s ON sl.student_id = s.id
GROUP BY se.filename_key;

-- ============================================================================
-- View 3: courseware_popularity_recent (last 14 days), same columns as 036
-- ============================================================================
CREATE OR REPLACE VIEW courseware_popularity_recent AS
SELECT
    se.filename_key AS filename,
    GROUP_CONCAT(DISTINCT
        CASE
            WHEN TRIM(BOTH '"' FROM se.pdf_name) REGEXP '^[A-Za-z]:'
            THEN SUBSTRING(TRIM(BOTH '"' FROM se.pdf_name), 3)
            ELSE TRIM(BOTH '"' FROM se.pdf_name)
        END
        SEPARATOR ', '
    ) AS normalized_paths,
    GROUP_CONCAT(DISTINCT
        CONCAT(s.school, ' ', s.grade, s.lang_stream)
        ORDER BY s.school, s.grade, s.lang_stream
        SEPARATOR ', '
    ) AS used_by,
    COUNT(*) AS assignment_count,
    COUNT(DISTINCT sl.student_id) AS unique_student_count,
    MIN(sl.session_date) AS earliest_use,
    MAX(sl.session_date) AS latest_use
FROM session_exercises se
JOIN session_log sl ON se.session_id = sl.id
JOIN students s ON sl.student_id = s.id
WHERE sl.session_date >= CURDATE() - INTERVAL 14 DAY
GROUP BY se.filename_key;
