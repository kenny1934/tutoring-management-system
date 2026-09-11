-- =====================================================
-- Migration 175: correct the grade on regular application 584
-- =====================================================
-- The family entered F3 on this application, but the student is entering F4
-- this September. Their summer application said F4, the student record says
-- F4, and the class they were placed in (slot 124, Sunday 16:15 at
-- 華士古分校) is an F4 class. The application is already published, and a
-- published application's grade cannot be edited on screen, which is why
-- this goes through the runner.
--
-- The edit is written to regular_application_edits first so it shows up in
-- the application's edit history like any change made on screen. Both
-- statements are guarded on the old value, so running this twice changes
-- nothing the second time.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the statement in half.

INSERT INTO regular_application_edits
    (application_id, edited_at, field_name, old_value, new_value, edited_via, edited_by)
SELECT id, CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'), 'grade', grade, 'F4',
       'admin', 'Kenny Chiu'
FROM regular_applications
WHERE id = 584 AND grade = 'F3';

UPDATE regular_applications
SET grade = 'F4'
WHERE id = 584 AND grade = 'F3'
