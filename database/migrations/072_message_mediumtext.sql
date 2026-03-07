-- Migration: Change message column from TEXT (64KB) to MEDIUMTEXT (16MB)
-- Reason: Geometry diagrams in messages can exceed 64KB TEXT limit
ALTER TABLE tutor_messages MODIFY COLUMN message MEDIUMTEXT NOT NULL;
