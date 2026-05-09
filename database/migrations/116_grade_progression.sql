-- Annual grade progression infrastructure.
--
-- Context: Student.grade is a free-form string (P6, F1..F6) that needs to
-- auto-progress on Sept 1 each year. The summer course also runs through a
-- transitional window during which a current F1 student is finishing F1 but
-- attending the pre-F2 summer class — tutors need to see that "Pre-F2"
-- intent on the badge without flipping the stored grade early.
--
-- Design:
--   - last_promoted_year on students records the most recent calendar year
--     a promotion was applied. The promotion job (Cloud Scheduler -> POST
--     /admin/promote-grades) only promotes students where this value is
--     less than the target year, so reruns are no-ops.
--   - Existing students are backfilled to 2025 so the first scheduled run
--     in Sept 2026 promotes everyone exactly once.
--   - pre_grade_window_start/end on summer_course_configs let admins set the
--     window during which the frontend renders "Pre-Fx" labels and the
--     summer create-student flow back-translates target grade to current
--     grade. NULL falls back to (course_start_date, Aug 31 of course year).

ALTER TABLE students
  ADD COLUMN last_promoted_year INT NULL
    COMMENT 'Calendar year of last applied grade promotion. NULL means never promoted.';

UPDATE students SET last_promoted_year = 2025 WHERE last_promoted_year IS NULL;

ALTER TABLE summer_course_configs
  ADD COLUMN pre_grade_window_start DATE NULL
    COMMENT 'Start of pre-grade display window. NULL falls back to course_start_date.',
  ADD COLUMN pre_grade_window_end DATE NULL
    COMMENT 'End of pre-grade display window (inclusive). NULL falls back to Sept 1 of (year+1).';
