-- Migration 076: Summer tutor duties
-- Track which tutors are on duty for specific day+time_slot+location combinations

CREATE TABLE IF NOT EXISTS summer_tutor_duties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    tutor_id INT NOT NULL,
    location VARCHAR(255) NOT NULL,
    duty_day VARCHAR(20) NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (config_id) REFERENCES summer_course_configs(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    UNIQUE KEY uq_duty (config_id, tutor_id, location, duty_day, time_slot),
    INDEX idx_duty_lookup (config_id, location, duty_day, time_slot)
);
