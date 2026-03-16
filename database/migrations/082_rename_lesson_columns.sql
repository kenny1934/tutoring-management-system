-- Migration 082: Rename columns to match new naming convention
-- On summer_lessons (was summer_sessions): session_date → lesson_date, session_status → lesson_status
-- On summer_sessions (was summer_placements): placement_status → session_status

ALTER TABLE summer_lessons CHANGE COLUMN session_date lesson_date DATE NOT NULL;
ALTER TABLE summer_lessons CHANGE COLUMN session_status lesson_status VARCHAR(20) NOT NULL DEFAULT 'Scheduled';

ALTER TABLE summer_sessions CHANGE COLUMN placement_status session_status ENUM('Tentative','Confirmed','Cancelled') NOT NULL DEFAULT 'Tentative';
