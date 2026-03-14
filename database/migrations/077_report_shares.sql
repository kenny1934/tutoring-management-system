-- Report share links for parent progress reports
CREATE TABLE report_shares (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token CHAR(36) NOT NULL UNIQUE,
    report_data JSON NOT NULL COMMENT 'Frozen {student, progress, config}',
    created_by INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME DEFAULT NULL,
    view_count INT NOT NULL DEFAULT 0,
    INDEX idx_token (token),
    FOREIGN KEY (created_by) REFERENCES tutors(id)
);
