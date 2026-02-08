-- Migration 051: Prevent duplicate make-up sessions
--
-- Bug: Two make-up classes were created at the same time slot for the same student
-- (one from web app, one from AppSheet). This happened because:
-- 1. AppSheet writes directly to DB, bypassing backend validation
-- 2. The existing unique constraint includes tutor_id, so different tutors at
--    the same slot for the same student was allowed
-- 3. No DB-level constraint on make_up_for_id (multiple make-ups per original)
--
-- DATA AUDIT: Run these queries BEFORE applying this migration.
-- If they return rows, clean up the duplicates first.
--
-- Check 1: Active student slot conflicts
-- SELECT student_id, session_date, time_slot, location, COUNT(*) as cnt,
--        GROUP_CONCAT(id ORDER BY id) as session_ids,
--        GROUP_CONCAT(session_status ORDER BY id) as statuses
-- FROM session_log
-- WHERE session_status NOT LIKE '%Pending Make-up%'
--   AND session_status NOT LIKE '%Make-up Booked%'
--   AND session_status != 'Cancelled'
-- GROUP BY student_id, session_date, time_slot, location
-- HAVING cnt > 1;
--
-- Check 2: Duplicate active make_up_for_id
-- SELECT make_up_for_id, COUNT(*) as cnt,
--        GROUP_CONCAT(id ORDER BY id) as session_ids,
--        GROUP_CONCAT(session_status ORDER BY id) as statuses
-- FROM session_log
-- WHERE make_up_for_id IS NOT NULL
--   AND session_status NOT LIKE '%Pending Make-up%'
--   AND session_status NOT LIKE '%Make-up Booked%'
--   AND session_status != 'Cancelled'
-- GROUP BY make_up_for_id
-- HAVING cnt > 1;

-- 1. Prevent same student from having two active sessions at the same slot,
--    regardless of tutor. "Inactive" statuses get NULL, which MySQL allows
--    to repeat in UNIQUE indexes.
ALTER TABLE session_log ADD COLUMN active_student_slot_guard INT
  GENERATED ALWAYS AS (
    CASE
      WHEN session_status LIKE '%Pending Make-up%' THEN NULL
      WHEN session_status LIKE '%Make-up Booked%' THEN NULL
      WHEN session_status = 'Cancelled' THEN NULL
      ELSE student_id
    END
  ) STORED;

CREATE UNIQUE INDEX unique_active_student_slot
  ON session_log (active_student_slot_guard, session_date, time_slot, location);

-- 2. Enforce 1:1 relationship: at most one active make-up per original session.
--    Inactive make-ups (rescheduled, cancelled) get NULL so a replacement can be created.
--    Legitimate pattern: make-up gets rescheduled → "Make-up Booked", replacement created
--    pointing to same original. Both coexist; only one is "active".
ALTER TABLE session_log ADD COLUMN active_makeup_for_guard INT
  GENERATED ALWAYS AS (
    CASE
      WHEN make_up_for_id IS NULL THEN NULL
      WHEN session_status LIKE '%Pending Make-up%' THEN NULL
      WHEN session_status LIKE '%Make-up Booked%' THEN NULL
      WHEN session_status = 'Cancelled' THEN NULL
      ELSE make_up_for_id
    END
  ) STORED;

CREATE UNIQUE INDEX unique_active_makeup_source
  ON session_log (active_makeup_for_guard);
