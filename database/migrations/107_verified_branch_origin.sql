-- Admin-verified branch of origin for summer applicants.
-- Raw claimed_branch_code from the form is unreliable (applicants often
-- confuse "which branch are you from" with "which branch do you want to
-- attend"), so this column stores the admin-verified ground truth.
-- "New" means the applicant has no prior connection to any branch.

ALTER TABLE summer_applications
  ADD COLUMN verified_branch_origin VARCHAR(20) NULL AFTER is_existing_student;

-- Auto-populate for applications already linked to a Secondary student
UPDATE summer_applications sa
  JOIN students s ON sa.existing_student_id = s.id
SET sa.verified_branch_origin = s.home_location
WHERE sa.existing_student_id IS NOT NULL
  AND s.home_location IS NOT NULL
  AND sa.verified_branch_origin IS NULL;

-- Auto-populate for applications linked to a Primary prospect
UPDATE summer_applications sa
  JOIN primary_prospects pp ON pp.summer_application_id = sa.id
SET sa.verified_branch_origin = pp.source_branch
WHERE sa.verified_branch_origin IS NULL;
