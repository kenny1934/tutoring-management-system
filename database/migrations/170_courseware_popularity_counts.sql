-- Migration 170: a counts-only popularity view for the suggestions router
--
-- Why: courseware_popularity_summary also builds two GROUP_CONCAT strings per
-- file (every path the file was assigned under, and every school-grade that
-- used it). The courseware page needs those, but the School Progress
-- suggestions only need the counts and the latest use, and the strings are
-- more than half the view's cost on a cold cache (about 440 ms against 170 ms
-- for the counts alone, measured server-side after migration 169).
--
-- What: the same grouping and the same joins as the summary view, so the
-- counts agree with it row for row, minus the string columns.

CREATE OR REPLACE VIEW courseware_popularity_counts AS
SELECT
    se.filename_key AS filename,
    COUNT(*) AS assignment_count,
    COUNT(DISTINCT sl.student_id) AS unique_student_count,
    MAX(sl.session_date) AS latest_use
FROM session_exercises se
JOIN session_log sl ON se.session_id = sl.id
JOIN students s ON sl.student_id = s.id
GROUP BY se.filename_key;
