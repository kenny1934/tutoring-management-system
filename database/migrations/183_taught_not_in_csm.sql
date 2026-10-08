-- =====================================================
-- Migration 183: lessons taught but not in CSM yet
-- =====================================================
-- The tutor memo becomes a lesson a tutor taught that CSM does not have yet,
-- usually because the enrolment was not renewed in time. From May to October
-- 2026, 111 attended lessons were taught before CSM had them, and only 36% of
-- those ended up with any classwork or homework recorded. The rebuilt feature
-- keeps the tutor's record until the real lesson exists, fills that lesson in
-- by itself, and shows admins each student taught without an enrolment on
-- the Renewals page. The table keeps its name, since only the UI is renamed.
--
-- What changes:
-- - status gains its new values. waiting means no lesson in CSM yet, filled
--   means it went into a real lesson, and dismissed means an admin set it
--   aside. The one existing row, an imported memo, becomes filled.
-- - filled_at and filled_by record when a lesson was filled in and whose
--   action did it. dismissed_at, dismissed_by and dismiss_reason do the same
--   for dismissing.
-- - The exercises JSON is untouched. Its items simply start carrying url and
--   url_title, which the old schema dropped.
--
-- This only adds columns and changes a default. The deployed backend never
-- selects the new columns, and it only reads status to count rows that are
-- pending, so it keeps working when this lands before the code that uses it.
-- The default changes with ALTER COLUMN SET DEFAULT rather than MODIFY
-- COLUMN, because MODIFY drops anything it does not restate.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the next statement in half and the
-- whole run aborts. Use a full stop.

ALTER TABLE tutor_memos
    ADD COLUMN filled_at DATETIME NULL COMMENT 'When the lesson was filled into a real session, HK time',
    ADD COLUMN filled_by VARCHAR(255) NULL COMMENT 'Email of the user whose action filled it in',
    ADD COLUMN dismissed_at DATETIME NULL COMMENT 'When an admin set it aside, HK time',
    ADD COLUMN dismissed_by VARCHAR(255) NULL COMMENT 'Email of the admin who set it aside',
    ADD COLUMN dismiss_reason VARCHAR(30) NULL COMMENT 'mistake or handled_elsewhere';

ALTER TABLE tutor_memos
    ALTER COLUMN status SET DEFAULT 'waiting';

UPDATE tutor_memos SET status = 'waiting' WHERE status = 'pending';
UPDATE tutor_memos SET status = 'filled', filled_at = updated_at WHERE status = 'linked';

SELECT 'Migration 183 completed successfully.' as result;

-- ROLLBACK:
-- UPDATE tutor_memos SET status = 'pending' WHERE status = 'waiting'
-- UPDATE tutor_memos SET status = 'linked' WHERE status = 'filled'
-- ALTER TABLE tutor_memos ALTER COLUMN status SET DEFAULT 'pending'
-- ALTER TABLE tutor_memos DROP COLUMN filled_at, DROP COLUMN filled_by, DROP COLUMN dismissed_at, DROP COLUMN dismissed_by, DROP COLUMN dismiss_reason
