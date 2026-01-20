-- Migration: Add unique constraint to prevent duplicate enrollment in revision slots
-- This prevents race conditions where a student could be enrolled twice in the same revision slot

ALTER TABLE session_log
ADD CONSTRAINT uq_revision_slot_student
UNIQUE (exam_revision_slot_id, student_id);

-- Note: MySQL allows multiple NULL values in unique indexes, so this constraint
-- only applies when exam_revision_slot_id is NOT NULL, which is the desired behavior.
-- Students can still have multiple regular sessions (where exam_revision_slot_id IS NULL).
