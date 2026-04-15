-- Partial-session mode: record how many lessons an applicant has committed to.
--
-- Applicants all submit the public form for the full course length (stored on
-- summer_course_configs.total_lessons, currently 8). In rare negotiated cases
-- admin lowers an applicant to a shorter plan (4-7 sessions). Those apps pay
-- a flat per-session rate with no group/early-bird discounts and do NOT count
-- toward any buddy group's size for discount eligibility.
--
-- Stored on the application row rather than derived from placed session count,
-- because placement can lag the agreement and we need the target up front to
-- drive fee math, the partial badge, and buddy group exclusion.

ALTER TABLE summer_applications
  ADD COLUMN lessons_paid INT NULL AFTER sessions_per_week;

-- Backfill from each config's total_lessons so every existing app stays on
-- the full plan (no accidental partials).
UPDATE summer_applications a
JOIN summer_course_configs c ON a.config_id = c.id
SET a.lessons_paid = c.total_lessons
WHERE a.lessons_paid IS NULL;

ALTER TABLE summer_applications
  MODIFY COLUMN lessons_paid INT NOT NULL;
