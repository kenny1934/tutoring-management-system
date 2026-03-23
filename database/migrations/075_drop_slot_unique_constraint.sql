-- Drop unique constraint on summer_course_slots to allow parallel classes
-- at the same location/day/time (e.g., F1 + F2, or F1(a) + F1(b))
-- Depends on migration 073 which creates the table and uq_slot index.
ALTER TABLE summer_course_slots DROP INDEX uq_slot;

-- Add display label for distinguishing parallel classes
ALTER TABLE summer_course_slots ADD COLUMN slot_label VARCHAR(100) NULL AFTER grade;

-- Prevent duplicate placements (same student in same slot)
ALTER TABLE summer_placements ADD UNIQUE KEY uq_placement_app_slot (application_id, slot_id);
