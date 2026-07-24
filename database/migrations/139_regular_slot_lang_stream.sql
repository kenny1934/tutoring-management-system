-- Regular arrangement: language stream on the weekly slot.
--
-- A slot is keyed by grade today (F1-F4, nullable = any). Kenny wants classes
-- further split by language stream so the real taxonomy is F1C, F1E, ... F4E.
-- Stream lives in its own column, orthogonal to grade, so grade and stream stay
-- independently queryable (demand, reporting, any-stream slots). Nullable and
-- unset = any, preserving the draft-the-timetable-first behaviour.
--
-- No backfill needed. Prod holds a single regular slot today and it is a test
-- row (no NOT NULL constraint, no default beyond NULL).

ALTER TABLE regular_course_slots
  ADD COLUMN lang_stream VARCHAR(20) NULL COMMENT 'Optional stream C or E, unset = any';
