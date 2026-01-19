-- Migration: 042_exam_revision_slots.sql
-- Description: Create exam_revision_slots table for exam revision classes feature
-- Date: 2026-01-19

-- Create the exam_revision_slots table
CREATE TABLE IF NOT EXISTS exam_revision_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    calendar_event_id INT NOT NULL,
    session_date DATE NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    tutor_id INT NOT NULL,
    location VARCHAR(100) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),

    FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,

    UNIQUE KEY unique_revision_slot (calendar_event_id, session_date, time_slot, tutor_id, location),
    INDEX idx_revision_slots_event (calendar_event_id),
    INDEX idx_revision_slots_date (session_date),
    INDEX idx_revision_slots_tutor (tutor_id)
) COMMENT 'Exam revision slots for dedicated revision sessions linked to upcoming exams';

-- Add exam_revision_slot_id column to session_log
ALTER TABLE session_log ADD COLUMN exam_revision_slot_id INT NULL;
ALTER TABLE session_log ADD CONSTRAINT fk_session_revision_slot
    FOREIGN KEY (exam_revision_slot_id) REFERENCES exam_revision_slots(id) ON DELETE SET NULL;
ALTER TABLE session_log ADD INDEX idx_session_revision_slot (exam_revision_slot_id);
