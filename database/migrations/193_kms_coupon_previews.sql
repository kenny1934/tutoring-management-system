-- Preview history only. No change to coupon observations, stock or payments.
CREATE TABLE billing_kms_coupon_checks (
    sequence INTEGER NOT NULL AUTO_INCREMENT,
    id VARCHAR(36) NOT NULL,
    branch VARCHAR(3) NOT NULL,
    fetched_at DATETIME NOT NULL,
    source_sha256 VARCHAR(64) NOT NULL,
    snapshot JSON NOT NULL,
    previous_id VARCHAR(36),
    created_by INTEGER,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (sequence),
    UNIQUE KEY uq_kms_coupon_check_id (id),
    FOREIGN KEY (previous_id) REFERENCES billing_kms_coupon_checks (id),
    FOREIGN KEY (created_by) REFERENCES tutors (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE INDEX ix_billing_kms_coupon_checks_branch ON billing_kms_coupon_checks (branch);
