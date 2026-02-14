-- Track @mentions in messages for notification routing
CREATE TABLE IF NOT EXISTS message_mentions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    mentioned_tutor_id INT NOT NULL,
    mentioned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES tutor_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (mentioned_tutor_id) REFERENCES tutors(id),
    UNIQUE KEY uq_mention (message_id, mentioned_tutor_id),
    INDEX idx_mention_tutor (mentioned_tutor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
