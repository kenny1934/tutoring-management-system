-- Columns backing the regular-course seasonal offer (2026 Back to School).
--
-- verified_branch_origin mirrors summer_applications: an admin confirms where
-- the applicant came from, since the form only asks which centre they attend
-- *now* and a family that left last year answers "none" in good faith. A
-- new-student offer keys off the verified value, never the self-declaration.
--
-- promo_code snapshots the offer a published enrollment was sold under, so a
-- fee message re-copied months later still names it and still knows the
-- materials fee was waived. The offer's terms are re-read from the config by
-- this code, the same way the base fee is.

ALTER TABLE regular_applications
    ADD COLUMN verified_branch_origin VARCHAR(20) NULL
    COMMENT 'Admin-verified origin: branch code, or New for no MathConcept history'
    AFTER current_centers;

ALTER TABLE enrollments
    ADD COLUMN promo_code VARCHAR(32) NULL
    COMMENT 'Seasonal offer this enrollment was published under, e.g. 26BTSSA'
    AFTER is_new_student;
