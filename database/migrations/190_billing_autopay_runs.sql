-- Immutable Autopay files, separate bank submission and reviewed outcomes.
-- Additive only. Activation remains separately gated.

CREATE TABLE billing_bank_runs (
	id VARCHAR(36) NOT NULL,
	version INTEGER NOT NULL,
	status VARCHAR(24) NOT NULL,
	collection_month VARCHAR(7) NOT NULL,
	branch VARCHAR(3) NOT NULL,
	content_hash VARCHAR(64) NOT NULL,
	export_snapshot JSON NOT NULL,
	payment_evidence JSON NOT NULL,
	file_sha256 VARCHAR(64) NOT NULL,
	export_sha256 VARCHAR(64) NOT NULL,
	workbook LONGBLOB NOT NULL,
	created_by INTEGER,
	created_by_name VARCHAR(100) NOT NULL,
	created_at DATETIME NOT NULL,
	submitted_at DATETIME,
	submitted_by_name VARCHAR(100),
	bank_batch_no VARCHAR(100),
	discarded_at DATETIME,
	discard_reason TEXT,
	latest_import_id VARCHAR(36),
	PRIMARY KEY (id),
	FOREIGN KEY(created_by) REFERENCES tutors (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX ix_billing_bank_runs_collection_month ON billing_bank_runs (collection_month);

CREATE TABLE billing_bank_run_claims (
	payment_id VARCHAR(36) NOT NULL,
	run_id VARCHAR(36) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (payment_id),
	FOREIGN KEY(payment_id) REFERENCES billing_payments (id),
	FOREIGN KEY(run_id) REFERENCES billing_bank_runs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX ix_billing_bank_run_claims_run_id ON billing_bank_run_claims (run_id);

CREATE TABLE billing_bank_run_imports (
	id VARCHAR(36) NOT NULL,
	run_id VARCHAR(36) NOT NULL,
	bank_identity_hash VARCHAR(64) NOT NULL,
	report_hash VARCHAR(64) NOT NULL,
	report JSON NOT NULL,
	applied JSON NOT NULL,
	created_by_name VARCHAR(100) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_bank_run_report UNIQUE (run_id, report_hash),
	FOREIGN KEY(run_id) REFERENCES billing_bank_runs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX ix_billing_bank_run_imports_bank_identity_hash ON billing_bank_run_imports (bank_identity_hash);

CREATE INDEX ix_billing_bank_run_imports_run_id ON billing_bank_run_imports (run_id);

CREATE TABLE billing_bank_result_identities (
	bank_identity_hash VARCHAR(64) NOT NULL,
	run_id VARCHAR(36) NOT NULL,
	import_id VARCHAR(36) NOT NULL,
	report_hash VARCHAR(64) NOT NULL,
	PRIMARY KEY (bank_identity_hash),
	FOREIGN KEY(run_id) REFERENCES billing_bank_runs (id),
	FOREIGN KEY(import_id) REFERENCES billing_bank_run_imports (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE billing_bank_run_operations (
	id INTEGER NOT NULL AUTO_INCREMENT,
	run_id VARCHAR(36) NOT NULL,
	actor_id INTEGER,
	actor_name VARCHAR(100) NOT NULL,
	idempotency_key VARCHAR(64) COLLATE utf8mb4_bin,
	payload_hash VARCHAR(64) NOT NULL,
	kind VARCHAR(32) NOT NULL,
	result JSON NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_bank_run_operation_retry UNIQUE (actor_id, idempotency_key),
	FOREIGN KEY(run_id) REFERENCES billing_bank_runs (id),
	FOREIGN KEY(actor_id) REFERENCES tutors (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX ix_billing_bank_run_operations_run_id ON billing_bank_run_operations (run_id);
