-- Audited participation changes for the regular academic-year makeup policy.
-- Additive storage only. Both makeup feature flags remain disabled until activation.

CREATE TABLE makeup_participation (
  id INTEGER NOT NULL AUTO_INCREMENT,
  student_id INTEGER NOT NULL,
  academic_start DATE NOT NULL,
  version INTEGER NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_makeup_participation_year UNIQUE (student_id, academic_start),
  FOREIGN KEY(student_id) REFERENCES students (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE makeup_participation_events (
  id VARCHAR(36) NOT NULL,
  participation_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  effective_on DATE NOT NULL,
  reason TEXT NOT NULL,
  return_enrollment_id INTEGER,
  idempotency_key VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  review_hash VARCHAR(64) NOT NULL,
  snapshot JSON NOT NULL,
  result JSON NOT NULL,
  actor_id INTEGER,
  actor_name VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_makeup_participation_version UNIQUE (participation_id, version),
  CONSTRAINT uq_makeup_participation_retry UNIQUE (participation_id, idempotency_key),
  FOREIGN KEY(participation_id) REFERENCES makeup_participation (id),
  FOREIGN KEY(return_enrollment_id) REFERENCES enrollments (id),
  FOREIGN KEY(actor_id) REFERENCES tutors (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX ix_makeup_participation_events_participation_id ON makeup_participation_events (participation_id);
