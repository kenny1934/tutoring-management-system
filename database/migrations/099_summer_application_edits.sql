-- Audit trail for summer application edits.
--
-- Applicants can now self-edit their submission via the status page while the
-- application is still in Submitted state. Admins can edit at any time. Each
-- changed field writes one row here so the admin modal can render an
-- edit timeline grouped by date.
--
-- Per-field rows (rather than a JSON blob) make it cheap to filter, e.g.
-- show all slot changes this week, and keep individual diffs human-readable.
-- edited_via distinguishes self-service edits from admin overrides, and
-- edited_by_user_id is populated only for admin edits.

CREATE TABLE summer_application_edits (
  id BIGINT NOT NULL AUTO_INCREMENT,
  application_id INT NOT NULL,
  edited_at DATETIME NOT NULL,
  field_name VARCHAR(64) NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  edited_via VARCHAR(16) NOT NULL,
  edited_by VARCHAR(255) NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_summer_edit_application
    FOREIGN KEY (application_id) REFERENCES summer_applications(id)
    ON DELETE CASCADE,
  INDEX idx_summer_edit_app_time (application_id, edited_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
