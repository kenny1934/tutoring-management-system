-- Migration 035: Create calendar_events table for Google Calendar integration
-- This table caches test/exam events from Google Calendar to reduce API calls
-- Events are matched to students by school and grade

CREATE TABLE IF NOT EXISTS calendar_events (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Google Calendar event ID (for sync tracking)
    event_id VARCHAR(255) NOT NULL UNIQUE,

    -- Event details
    title VARCHAR(500) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,

    -- Parsed information for matching
    school VARCHAR(100),  -- e.g., TIS, PCMS, SRL-E
    grade VARCHAR(20),    -- e.g., F1, F2, F3, F4, F5, F6
    academic_stream VARCHAR(10),  -- e.g., A (Arts), S (Science), C (Commerce) - only for F4-F6
    event_type VARCHAR(100),  -- e.g., Test, Quiz, Exam, Final Exam

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexes for fast lookups
    INDEX idx_school_grade_date (school, grade, start_date),
    INDEX idx_date_range (start_date, end_date),
    INDEX idx_last_synced (last_synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Cached Google Calendar events for test/exam tracking';
