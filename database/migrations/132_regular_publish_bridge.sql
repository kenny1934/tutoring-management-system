-- Publish bridge from regular applications into native enrollments.
--
-- Mirror of 112's enrollments half: a published regular application maps to
-- at most one Enrollment (unique key makes double-publish impossible at the
-- DB layer). No session_log column is needed — regular sessions are
-- cadence-generated from the enrollment, so unpublish cleans up by
-- session_log.enrollment_id alone.

ALTER TABLE enrollments
  ADD COLUMN regular_application_id INT NULL,
  ADD CONSTRAINT fk_enrollments_regular_application
    FOREIGN KEY (regular_application_id) REFERENCES regular_applications(id)
    ON DELETE SET NULL,
  ADD UNIQUE KEY uq_enrollments_regular_application (regular_application_id);
