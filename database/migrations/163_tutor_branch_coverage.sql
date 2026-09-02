-- =====================================================
-- Migration 163: when a tutor works at a branch that is not their own
-- =====================================================
-- A tutor from MSA went to MSB to cover somebody else's lessons, and until now
-- there was no way to say so. Every tutor picker in the app narrows by
-- tutors.default_location, so the MSB dropdowns simply did not contain them.
--
-- The data model was never the problem. session_log carries its own location
-- column, independent of the tutor's, so a lesson at MSB taught by an MSA tutor
-- has always been representable and the revenue views already credit it to the
-- tutor who taught it while counting it towards the branch that hosted it. What
-- was missing was a way for an admin to say that the arrangement exists, so the
-- pickers can offer the name.
--
-- One row per coverage window. The shape deliberately covers three different
-- arrangements without special-casing any of them.
--
--   Open ended        every column null, they simply also work there
--   A specific date   effective_from and effective_until set to the same day
--   A recurring day   weekday set, with or without a date range around it
--
-- Two days a week is two rows, which is how summer_tutor_duties and
-- regular_tutor_duties already handle the same question for course cycles.
--
-- The date and weekday columns are here from the start even though the first
-- version of the editor only writes the open-ended case. They cost nothing
-- empty, and having them means the day somebody needs "Saturdays in October"
-- it is a form change rather than another migration and a backfill.
--
-- What this table must never grow is a time_slot column. Per-slot rostering is
-- what the duty tables are for, and a second copy of them would be a mistake.
-- This one answers exactly one question, which is whether a tutor may be
-- offered at a branch on a given date.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the next statement in half and the
-- whole run aborts. Use a full stop.

CREATE TABLE IF NOT EXISTS tutor_branch_coverage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tutor_id INT NOT NULL,
    location VARCHAR(255) NOT NULL COMMENT 'The branch they cover, which is never their own default_location',
    effective_from DATE NULL COMMENT 'First day covered. NULL means no start bound.',
    effective_until DATE NULL COMMENT 'Last day covered. NULL means open ended.',
    weekday VARCHAR(20) NULL COMMENT 'Short day name such as Sat, matching session_log day naming. NULL means any day.',
    note VARCHAR(255) NULL COMMENT 'Why the arrangement exists, for whoever reads it later',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NULL,
    CONSTRAINT fk_coverage_tutor FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    INDEX idx_coverage_tutor (tutor_id),
    INDEX idx_coverage_location (location)
) COMMENT 'Branches a tutor covers besides their own. See migration 163.'
