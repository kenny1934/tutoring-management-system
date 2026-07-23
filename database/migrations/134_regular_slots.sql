-- Regular arrangement: weekly slots + application assignment.
--
-- Stripped-down mirror of summer_course_slots: no course_type, no lesson
-- materialization, no ad-hoc make-up slots. One application is assigned to
-- at most one slot (assigned_slot_id). Publishing derives day/time/location/
-- tutor from the assigned slot when the publish request omits them.
--
-- No unique key on (config, day, time, location): a cell may hold several
-- slots for different grades or tutors.

CREATE TABLE IF NOT EXISTS regular_course_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    slot_day VARCHAR(20) NOT NULL COMMENT 'Full day name, e.g. Saturday',
    time_slot VARCHAR(50) NOT NULL COMMENT 'Display time band, e.g. 10:00 - 11:30',
    location VARCHAR(255) NOT NULL COMMENT 'Branch display name',
    grade VARCHAR(50) NULL COMMENT 'Optional target grade label (F1-F4)',
    tutor_id INT NULL,
    max_students INT NOT NULL DEFAULT 6,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (config_id) REFERENCES regular_course_configs(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE SET NULL,
    INDEX idx_rslot_config (config_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT 'Weekly slots for regular course arrangement';

ALTER TABLE regular_applications
  ADD COLUMN assigned_slot_id INT NULL,
  ADD CONSTRAINT fk_rapp_assigned_slot
    FOREIGN KEY (assigned_slot_id) REFERENCES regular_course_slots(id)
    ON DELETE SET NULL,
  ADD INDEX idx_rapp_assigned_slot (assigned_slot_id);
