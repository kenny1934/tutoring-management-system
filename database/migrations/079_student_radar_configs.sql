-- Student radar chart configs: persists per-student attribute/score presets
CREATE TABLE IF NOT EXISTS student_radar_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL UNIQUE,
    tutor_id INT NOT NULL,
    config JSON NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (tutor_id) REFERENCES tutors(id)
);
