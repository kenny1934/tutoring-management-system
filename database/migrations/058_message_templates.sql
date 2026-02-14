-- Message templates for quick replies and reusable messages
CREATE TABLE IF NOT EXISTS message_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tutor_id INT,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50),
    is_global BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    INDEX idx_template_tutor (tutor_id),
    INDEX idx_template_global (is_global)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed global templates
INSERT IGNORE INTO message_templates (tutor_id, title, content, is_global) VALUES
(NULL, 'Got it, thanks!', 'Got it, thanks!', TRUE),
(NULL, 'Will follow up', 'Will follow up on this shortly.', TRUE),
(NULL, 'Schedule change', 'There has been a change to the schedule. Please check the updated timetable.', TRUE);
