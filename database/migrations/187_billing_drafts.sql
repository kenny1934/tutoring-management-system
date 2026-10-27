-- Reviewed payment drafts only. These records do not activate monthly billing.
-- No teaching, payment, coupon or legacy data is changed by this migration.
CREATE TABLE billing_accounts (
  id INT NOT NULL AUTO_INCREMENT,
  student_id INT NOT NULL,
  academic_start DATE NOT NULL,
  policy_version VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_billing_account_student_year (student_id, academic_start),
  CONSTRAINT fk_billing_account_student FOREIGN KEY (student_id) REFERENCES students(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE billing_drafts (
  id VARCHAR(36) NOT NULL,
  account_id INT NOT NULL,
  current_revision INT NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_billing_drafts_account_id (account_id),
  CONSTRAINT fk_billing_draft_account FOREIGN KEY (account_id) REFERENCES billing_accounts(id),
  CONSTRAINT fk_billing_draft_creator FOREIGN KEY (created_by) REFERENCES tutors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE billing_draft_revisions (
  id INT NOT NULL AUTO_INCREMENT,
  draft_id VARCHAR(36) NOT NULL,
  account_id INT NOT NULL,
  revision INT NOT NULL,
  idempotency_key VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  review_hash VARCHAR(64) NOT NULL,
  snapshot JSON NOT NULL,
  note TEXT NULL,
  created_by INT NULL,
  actor_name VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_billing_draft_revision (draft_id, revision),
  UNIQUE KEY uq_billing_draft_idempotency (account_id, idempotency_key),
  CONSTRAINT fk_billing_revision_draft FOREIGN KEY (draft_id) REFERENCES billing_drafts(id),
  CONSTRAINT fk_billing_revision_account FOREIGN KEY (account_id) REFERENCES billing_accounts(id),
  CONSTRAINT fk_billing_revision_creator FOREIGN KEY (created_by) REFERENCES tutors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
