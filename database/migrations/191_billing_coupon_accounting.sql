-- Immutable KMS observations and separate reviewed coupon commitments.
-- Additive only. Storage and writes remain separately gated.

CREATE TABLE billing_coupon_imports (
	id VARCHAR(36) NOT NULL,
	branch VARCHAR(3) NOT NULL,
	observed_on DATE NOT NULL,
	source_sha256 VARCHAR(64) NOT NULL,
	source_filename VARCHAR(500) NOT NULL,
	parsed_rows JSON NOT NULL,
	applied_at DATETIME,
	applied_review JSON,
	created_by_name VARCHAR(100) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_coupon_import_source UNIQUE (branch, observed_on, source_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE billing_coupon_observations (
	id VARCHAR(36) NOT NULL,
	student_id INTEGER NOT NULL,
	import_id VARCHAR(36) NOT NULL,
	remaining_count INTEGER NOT NULL,
	observed_on DATE NOT NULL,
	processed_at DATETIME NOT NULL,
	source_filename VARCHAR(500) NOT NULL,
	source_sha256 VARCHAR(64) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(student_id) REFERENCES students (id),
	FOREIGN KEY(import_id) REFERENCES billing_coupon_imports (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE INDEX ix_billing_coupon_observations_student_id ON billing_coupon_observations (student_id);

CREATE TABLE billing_coupon_verifications (
	id VARCHAR(36) NOT NULL,
	student_id INTEGER NOT NULL,
	observation_id VARCHAR(36) NOT NULL,
	checked_at DATETIME NOT NULL,
	checked_by INTEGER,
	checked_by_name VARCHAR(100) NOT NULL,
	`groups` JSON NOT NULL,
	reconciliations JSON NOT NULL,
	reason TEXT NOT NULL,
	recorded_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(student_id) REFERENCES students (id),
	FOREIGN KEY(observation_id) REFERENCES billing_coupon_observations (id),
	FOREIGN KEY(checked_by) REFERENCES tutors (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE INDEX ix_billing_coupon_verifications_student_id ON billing_coupon_verifications (student_id);

CREATE TABLE billing_coupon_accounts (
	student_id INTEGER NOT NULL,
	version INTEGER NOT NULL,
	observation_id VARCHAR(36),
	verification_id VARCHAR(36),
	PRIMARY KEY (student_id),
	FOREIGN KEY(student_id) REFERENCES students (id),
	FOREIGN KEY(observation_id) REFERENCES billing_coupon_observations (id),
	FOREIGN KEY(verification_id) REFERENCES billing_coupon_verifications (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE billing_coupon_uses (
	id VARCHAR(36) NOT NULL,
	student_id INTEGER NOT NULL,
	payment_id VARCHAR(36),
	legacy_enrollment_id INTEGER,
	verification_id VARCHAR(36),
	group_key VARCHAR(64),
	value INTEGER NOT NULL,
	expires_on DATE,
	state VARCHAR(24) NOT NULL,
	accounted_observation_id VARCHAR(36),
	receipt_reference VARCHAR(100),
	coupon_used_on DATE,
	receipt_recorded_at DATETIME,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(student_id) REFERENCES students (id),
	UNIQUE (payment_id),
	FOREIGN KEY(payment_id) REFERENCES billing_payments (id),
	UNIQUE (legacy_enrollment_id),
	FOREIGN KEY(legacy_enrollment_id) REFERENCES enrollments (id),
	FOREIGN KEY(verification_id) REFERENCES billing_coupon_verifications (id),
	FOREIGN KEY(accounted_observation_id) REFERENCES billing_coupon_observations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE INDEX ix_billing_coupon_uses_student_id ON billing_coupon_uses (student_id);

CREATE TABLE billing_coupon_operations (
	id INTEGER NOT NULL AUTO_INCREMENT,
	student_id INTEGER,
	import_id VARCHAR(36),
	actor_id INTEGER,
	idempotency_key VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
	kind VARCHAR(32) NOT NULL,
	payload_hash VARCHAR(64) NOT NULL,
	result JSON NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_coupon_operation_retry UNIQUE (actor_id, idempotency_key),
	FOREIGN KEY(student_id) REFERENCES students (id),
	FOREIGN KEY(import_id) REFERENCES billing_coupon_imports (id),
	FOREIGN KEY(actor_id) REFERENCES tutors (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
