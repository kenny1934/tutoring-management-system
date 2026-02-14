-- Thread muting: suppress notifications for noisy threads
CREATE TABLE IF NOT EXISTS thread_mutes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    tutor_id INT NOT NULL,
    muted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES tutor_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    UNIQUE KEY uq_thread_mute (message_id, tutor_id),
    INDEX idx_mute_tutor (tutor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
