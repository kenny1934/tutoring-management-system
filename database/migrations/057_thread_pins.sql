-- Thread pins: pin threads to top of thread list (separate from star/favorite)
CREATE TABLE thread_pins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    tutor_id INT NOT NULL,
    pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES tutor_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    UNIQUE KEY uq_thread_pin (message_id, tutor_id)
);
