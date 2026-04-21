-- Ad-hoc "Make-up Slot" support on summer_course_slots.
--
-- Context: Admins sometimes negotiate schedules with applicants whose
-- availability doesn't fit any regular slot. Rather than rejecting those
-- applicants, admins want to open a one-off Make-up Slot — a single lesson
-- on a specific date, with a chosen tutor, which flows through the existing
-- publish → session_log pipeline the same as any regular slot.
--
-- Shape:
--   - `is_adhoc=TRUE` marks the slot as an admin-created Make-up Slot.
--   - `adhoc_date` holds the one specific date the slot runs on. Only set
--     when is_adhoc=TRUE.
--   - `_ensure_lessons_for_slot` branches on is_adhoc and creates exactly
--     one SummerLesson at adhoc_date with a NULL lesson_number (admins can
--     set the lesson_number per-session later via session_log edits).
--
-- lesson_number becomes nullable because an ad-hoc lesson doesn't belong to
-- the numbered curriculum sequence at creation time. Existing regular-slot
-- rows all have non-null values, so relaxing the constraint is safe.

ALTER TABLE summer_course_slots
  ADD COLUMN is_adhoc BOOL NOT NULL DEFAULT FALSE
    COMMENT 'TRUE when this slot is an admin-created one-off Make-up Slot',
  ADD COLUMN adhoc_date DATE NULL
    COMMENT 'Specific date for ad-hoc slots. NULL for regular recurring slots.';

ALTER TABLE summer_lessons
  MODIFY COLUMN lesson_number INT NULL
    COMMENT 'Lesson material number. NULL for ad-hoc slots that have not been assigned a lesson yet.';
