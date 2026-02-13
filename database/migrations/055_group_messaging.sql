-- Migration 055: Group Messaging (Multi-Recipient)
-- Enables sending messages to multiple specific tutors (not just one or all).
-- Uses to_tutor_id = -1 as sentinel for group messages, with recipients in junction table.
-- AppSheet compatibility: group messages invisible (to_tutor_id = -1 matches neither direct nor broadcast queries).

-- Drop FK constraint on to_tutor_id so we can store -1 sentinel
ALTER TABLE tutor_messages DROP FOREIGN KEY tutor_messages_ibfk_2;

-- Junction table for group message recipients
CREATE TABLE IF NOT EXISTS message_recipients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    tutor_id INT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES tutor_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    UNIQUE KEY uq_message_recipient (message_id, tutor_id),
    INDEX idx_tutor_id (tutor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
