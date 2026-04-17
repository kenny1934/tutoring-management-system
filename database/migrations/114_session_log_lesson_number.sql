-- Surface which lesson material a session covers.
--
-- For summer sessions this is populated at publish time from the parent
-- SummerSession, and is shown as an "L3" badge across session UIs. Tutors
-- will eventually edit this per-session to reflect what they actually
-- covered based on student progress (deferred to a follow-up pass).
--
-- Nullable: non-summer enrollments do not carry a lesson number today.

ALTER TABLE session_log
  ADD COLUMN lesson_number INT NULL
    COMMENT 'Lesson material number (e.g., 1-8 for summer). NULL for non-summer sessions.';

-- Backfill existing published summer rows from the source placement.
UPDATE session_log sl
JOIN summer_sessions ss ON ss.id = sl.summer_session_id
SET sl.lesson_number = ss.lesson_number
WHERE sl.summer_session_id IS NOT NULL
  AND ss.lesson_number IS NOT NULL;
