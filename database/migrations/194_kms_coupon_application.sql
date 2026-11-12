-- Add source provenance without changing existing financial tables.
CREATE TABLE billing_kms_coupon_verifications (
    verification_id VARCHAR(36) NOT NULL,
    student_id INTEGER NOT NULL,
    company_id VARCHAR(40) NOT NULL,
    check_id VARCHAR(36) NOT NULL,
    snapshot JSON NOT NULL,
    PRIMARY KEY (verification_id),
    FOREIGN KEY (verification_id) REFERENCES billing_coupon_verifications (id),
    FOREIGN KEY (student_id) REFERENCES students (id),
    FOREIGN KEY (check_id) REFERENCES billing_kms_coupon_checks (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE INDEX ix_billing_kms_coupon_verifications_student_id ON billing_kms_coupon_verifications (student_id);
CREATE TABLE billing_kms_coupon_redemptions (
    branch VARCHAR(3) NOT NULL,
    number VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
    use_id VARCHAR(36) NOT NULL,
    student_id INTEGER NOT NULL,
    check_id VARCHAR(36) NOT NULL,
    value INTEGER NOT NULL,
    expires_on DATE NOT NULL,
    coupon JSON NOT NULL,
    PRIMARY KEY (branch, number),
    UNIQUE KEY uq_kms_coupon_redemption_use (use_id),
    FOREIGN KEY (use_id) REFERENCES billing_coupon_uses (id),
    FOREIGN KEY (student_id) REFERENCES students (id),
    FOREIGN KEY (check_id) REFERENCES billing_kms_coupon_checks (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE INDEX ix_billing_kms_coupon_redemptions_student_id ON billing_kms_coupon_redemptions (student_id);
CREATE TABLE billing_kms_coupon_locks (
    branch VARCHAR(3) NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO billing_kms_coupon_locks (branch) VALUES ('MSA'), ('MSB');
CREATE TABLE billing_kms_coupon_seen_used (
    branch VARCHAR(3) NOT NULL,
    number VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
    check_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (branch, number),
    FOREIGN KEY (check_id) REFERENCES billing_kms_coupon_checks (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Preserve Used identities from preview checks captured before this upgrade.
INSERT INTO billing_kms_coupon_seen_used (branch, number, check_id)
SELECT branch, coupon_number, check_id FROM (
    SELECT c.branch, j.coupon_number, c.id AS check_id,
           ROW_NUMBER() OVER (PARTITION BY c.branch, BINARY j.coupon_number ORDER BY c.sequence) AS occurrence
    FROM billing_kms_coupon_checks c
    CROSS JOIN JSON_TABLE(c.snapshot, '$.coupons[*]' COLUMNS (
        coupon_number VARCHAR(80) PATH '$.number',
        coupon_state VARCHAR(10) PATH '$.state'
    )) AS j
    WHERE j.coupon_state = 'used'
) AS history WHERE occurrence = 1;
