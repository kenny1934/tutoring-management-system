-- Migration 079: Summer Sessions table + sessions_per_week on applications
-- Materializes per-date session instances for flexible scheduling

-- 1. Add sessions_per_week to applications
ALTER TABLE summer_applications ADD COLUMN sessions_per_week INT NOT NULL DEFAULT 1;

-- 2. Create summer_sessions table (materialized session instances)
CREATE TABLE summer_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    slot_id INT NOT NULL,
    session_date DATE NOT NULL,
    lesson_number INT NOT NULL,
    session_status VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_session_slot FOREIGN KEY (slot_id) REFERENCES summer_course_slots(id) ON DELETE CASCADE,
    UNIQUE KEY uq_slot_date (slot_id, session_date),
    INDEX idx_session_lookup (slot_id, session_date, lesson_number),
    INDEX idx_session_date (session_date),
    INDEX idx_session_status (session_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Add session_id to placements (nullable initially for migration)
ALTER TABLE summer_placements ADD COLUMN session_id INT NULL AFTER slot_id;
ALTER TABLE summer_placements ADD CONSTRAINT fk_placement_session
    FOREIGN KEY (session_id) REFERENCES summer_sessions(id) ON DELETE SET NULL;
ALTER TABLE summer_placements ADD INDEX idx_placement_session (session_id);
