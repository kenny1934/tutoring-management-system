-- Migration 054: Message Pins (Starring)
-- Per-user pinning similar to message_archives pattern

CREATE TABLE IF NOT EXISTS message_pins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    tutor_id INT NOT NULL,
    pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (message_id) REFERENCES tutor_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    UNIQUE KEY unique_pin (message_id, tutor_id),
    INDEX idx_tutor_pinned (tutor_id, pinned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
