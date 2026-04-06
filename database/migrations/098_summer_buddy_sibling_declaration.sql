-- Self-declared primary-branch siblings on summer buddy groups.
--
-- Secondary applicants can now declare a sibling who is applying to a Primary
-- branch (or KidsConcept) so the sibling counts toward the 3-person buddy
-- group discount. Admin cross-checks against the proprietary primary system
-- and flips Pending → Confirmed (or Rejected). Pending counts optimistically.
--
-- The legacy primary-branch buddy tracker has been abandoned, so existing
-- rows are not relevant, so no backfill is required. New rows default to
-- Pending. Legacy rows in the table also become Pending after this migration,
-- which is harmless because the data is no longer in use.

ALTER TABLE summer_buddy_members
  MODIFY COLUMN student_id VARCHAR(50) NULL,
  MODIFY COLUMN source_branch VARCHAR(20) NOT NULL,
  ADD COLUMN verification_status VARCHAR(20) NOT NULL DEFAULT 'Pending' AFTER is_sibling,
  ADD COLUMN declared_by_application_id INT NULL AFTER verification_status,
  ADD CONSTRAINT fk_buddy_member_declared_by
    FOREIGN KEY (declared_by_application_id) REFERENCES summer_applications(id)
    ON DELETE SET NULL,
  ADD INDEX idx_buddy_member_group_status (buddy_group_id, verification_status);
