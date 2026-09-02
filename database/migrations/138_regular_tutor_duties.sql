-- Regular arrangement: tutor duty roster.
--
-- Mirror of summer_tutor_duties, keyed on the regular config instead. Kept as
-- its own table rather than folded into summer's so each side keeps a real
-- foreign key onto its own config, with the same ON DELETE CASCADE.
--
-- A row means "this tutor is on duty at this branch, on this weekday, in this
-- time band" for the given course cycle. The arrangement grid reads it to show
-- who is available before a slot is staffed.

CREATE TABLE IF NOT EXISTS regular_tutor_duties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    tutor_id INT NOT NULL,
    location VARCHAR(255) NOT NULL COMMENT 'Branch display name',
    duty_day VARCHAR(20) NOT NULL COMMENT 'Full day name, e.g. Saturday',
    time_slot VARCHAR(50) NOT NULL COMMENT 'Display time band, e.g. 10:00 - 11:30',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (config_id) REFERENCES regular_course_configs(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    UNIQUE KEY uq_rduty (config_id, tutor_id, location, duty_day, time_slot),
    INDEX idx_rduty_lookup (config_id, location, duty_day, time_slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT 'Tutor duty roster for regular course arrangement';
