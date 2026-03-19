-- Migration 083: Drop unique constraint on (application_id, slot_id) from summer_sessions
-- Now that Slot Setup creates one session per lesson (8 rows per student per slot),
-- the old 1:1 constraint must go.
ALTER TABLE summer_sessions DROP INDEX uq_placement_app_slot;
