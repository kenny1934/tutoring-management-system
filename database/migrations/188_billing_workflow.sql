-- Confirmed enrollments and combined payment records.
-- Additive schema only. Activation is controlled separately.

CREATE TABLE billing_preferences (
  account_id INTEGER NOT NULL,
  payment_method VARCHAR(16),
  mandate_ready BOOL NOT NULL,
  version INTEGER NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (account_id),
  FOREIGN KEY(account_id) REFERENCES billing_accounts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE billing_payments (
  id VARCHAR(36) NOT NULL,
  account_id INTEGER NOT NULL,
  draft_id VARCHAR(36) NOT NULL,
  draft_revision INTEGER NOT NULL,
  version INTEGER NOT NULL,
  status VARCHAR(32) NOT NULL,
  snapshot JSON NOT NULL,
  coupon_value INTEGER NOT NULL,
  coupon_status VARCHAR(32) NOT NULL,
  created_by INTEGER,
  created_at DATETIME NOT NULL,
  sent_at DATETIME,
  sent_language VARCHAR(2),
  paid_at DATETIME,
  payment_date DATE,
  received_amount INTEGER,
  received_method VARCHAR(16),
  receipt_reference VARCHAR(100),
  note TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY(account_id) REFERENCES billing_accounts (id),
  UNIQUE (draft_id),
  FOREIGN KEY(draft_id) REFERENCES billing_drafts (id),
  FOREIGN KEY(created_by) REFERENCES tutors (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX ix_billing_payments_account_id ON billing_payments (account_id);

CREATE TABLE billing_payment_lines (
  id INTEGER NOT NULL AUTO_INCREMENT,
  payment_id VARCHAR(36) NOT NULL,
  enrollment_id INTEGER NOT NULL,
  slot_index INTEGER NOT NULL,
  lesson_count INTEGER NOT NULL,
  gross_tuition INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL,
  tuition_amount INTEGER NOT NULL,
  materials_fee INTEGER NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_billing_payment_slot UNIQUE (payment_id, slot_index),
  FOREIGN KEY(payment_id) REFERENCES billing_payments (id),
  UNIQUE (enrollment_id),
  FOREIGN KEY(enrollment_id) REFERENCES enrollments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX ix_billing_payment_lines_payment_id ON billing_payment_lines (payment_id);

CREATE TABLE billing_lesson_claims (
  id INTEGER NOT NULL AUTO_INCREMENT,
  student_id INTEGER NOT NULL,
  payment_id VARCHAR(36) NOT NULL,
  enrollment_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  lesson_date DATE NOT NULL,
  time_slot VARCHAR(100) NOT NULL,
  location VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_billing_claim_slot UNIQUE (student_id, lesson_date, time_slot, location),
  FOREIGN KEY(student_id) REFERENCES students (id),
  FOREIGN KEY(payment_id) REFERENCES billing_payments (id),
  FOREIGN KEY(enrollment_id) REFERENCES enrollments (id),
  UNIQUE (session_id),
  FOREIGN KEY(session_id) REFERENCES session_log (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX ix_billing_lesson_claims_payment_id ON billing_lesson_claims (payment_id);

CREATE INDEX ix_billing_lesson_claims_student_id ON billing_lesson_claims (student_id);

CREATE TABLE billing_operations (
  id INTEGER NOT NULL AUTO_INCREMENT,
  account_id INTEGER NOT NULL,
  payment_id VARCHAR(36),
  idempotency_key VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  kind VARCHAR(32) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  result JSON NOT NULL,
  actor_id INTEGER,
  actor_name VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_billing_operation_retry UNIQUE (account_id, idempotency_key),
  FOREIGN KEY(account_id) REFERENCES billing_accounts (id),
  FOREIGN KEY(payment_id) REFERENCES billing_payments (id),
  FOREIGN KEY(actor_id) REFERENCES tutors (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX ix_billing_operations_payment_id ON billing_operations (payment_id);
