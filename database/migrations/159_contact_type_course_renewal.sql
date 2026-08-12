-- =====================================================
-- Migration 159: a contact type for renewal chasing
-- =====================================================
-- Chasing a family about the September intake currently gets logged as
-- "General", which is the same label a caller uses for anything that is not a
-- progress update or a concern. This year that costs nothing, because the
-- table is effectively empty and every contact logged between now and October
-- is obviously renewal chasing. It costs a lot next year, when there are two
-- intakes of contacts in there and nothing can tell which calls were about
-- coming back. That question cannot be answered retroactively, which is why
-- the value goes in before the chasing starts rather than after.
--
-- The retention board is the reader. It already reports how many of the
-- families who have not answered have been contacted, and without a type of
-- its own that figure quietly counts a call about homework as a renewal chase.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the next statement in half and the
-- whole run aborts. Use a full stop.
--
-- MODIFY COLUMN restates the whole definition, and MySQL drops the DEFAULT
-- silently if it is left out, so both the default and the nullability are
-- written out again below even though neither is changing.
--
-- The four values the app has never offered are left exactly as they are.
-- Nothing has ever been logged under Schedule, Payment, Homework or Behavior,
-- because none of them has ever been in the dropdown. Removing them would be a
-- separate decision and would need the app's British spelling applied to the
-- last of them.

ALTER TABLE parent_communications
    MODIFY COLUMN contact_type ENUM(
        'Progress Update',
        'Concern',
        'Schedule',
        'Payment',
        'General',
        'Homework',
        'Behavior',
        'Course Renewal'
    ) NULL DEFAULT 'Progress Update';
