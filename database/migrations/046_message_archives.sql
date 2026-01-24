-- Migration 046: Message Archives
-- Per-user archiving similar to MessageReadReceipt pattern

-- Create message_archives table
CREATE TABLE IF NOT EXISTS message_archives (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    tutor_id INT NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (message_id) REFERENCES tutor_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    UNIQUE KEY unique_archive (message_id, tutor_id),
    INDEX idx_tutor_archived (tutor_id, archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
