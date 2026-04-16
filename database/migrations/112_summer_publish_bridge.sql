-- Phase 5: Publish bridge from summer applications into native enrollments.
--
-- Adds two cross-system foreign keys so a published summer application can
-- be traced back from the canonical enrollments / session_log tables, and
-- so publishing twice is impossible at the DB layer.
--
-- enrollments.summer_application_id is UNIQUE — one application maps to at
-- most one native enrollment. session_log.summer_session_id is a plain
-- index because each summer placement becomes exactly one session_log row,
-- but we don't enforce that 1:1 here (cancelled placements are skipped).

ALTER TABLE enrollments
  ADD COLUMN summer_application_id INT NULL,
  ADD CONSTRAINT fk_enrollments_summer_application
    FOREIGN KEY (summer_application_id) REFERENCES summer_applications(id)
    ON DELETE SET NULL,
  ADD UNIQUE KEY uq_enrollments_summer_application (summer_application_id);

ALTER TABLE session_log
  ADD COLUMN summer_session_id INT NULL,
  ADD CONSTRAINT fk_session_log_summer_session
    FOREIGN KEY (summer_session_id) REFERENCES summer_sessions(id)
    ON DELETE SET NULL,
  ADD INDEX idx_session_log_summer_session (summer_session_id);
