-- Thread snooze: temporarily hide threads, auto-resurface at chosen time
CREATE TABLE IF NOT EXISTS message_snoozes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    tutor_id INT NOT NULL,
    snooze_until DATETIME NOT NULL,
    snoozed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES tutor_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    UNIQUE KEY uq_snooze (message_id, tutor_id),
    INDEX idx_snooze_tutor (tutor_id),
    INDEX idx_snooze_until (snooze_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
