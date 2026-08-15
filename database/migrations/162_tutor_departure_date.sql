-- =====================================================
-- Migration 162: when a tutor's employment ends
-- =====================================================
-- CSM has never had a way to say that somebody has left. The closest thing is
-- is_active_tutor, which means "this person teaches students" and is already
-- set to 0 for the Supervisors and Guests who log in every day. Overloading it
-- would either lock those people out or leave a leaver's login working, so the
-- fact needs a column of its own.
--
-- The column holds a date rather than a flag because the date is the useful
-- part. Somebody who resigns in August with a month of notice is still here in
-- August, still teaching, still marking attendance. What must not happen is a
-- September lesson being booked under their name. A flag cannot express that
-- and a date can, so every rule in the app compares the date of the work being
-- scheduled against this column.
--
-- ARK is the system of record. This column mirrors ARK's staff.end_date for
-- anyone whose employment_status is resigned or terminated, and the nightly
-- sync fills it in. Two cases resolve at sync time rather than being stored as
-- they arrive. A departed status with no end date in ARK means gone right now,
-- which the sync writes as the day it saw it, matching ARK's own reading of a
-- blank leaving date. An end date sitting on an active record is stale data,
-- a withdrawn resignation or a legacy import, and is ignored.
--
-- NULL means nobody is leaving, which is the answer for almost every row
-- almost all of the time. The Supervisor and Guest accounts that exist only in
-- CSM have no ARK record at all, so theirs stays editable by hand.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the next statement in half and the
-- whole run aborts. Use a full stop.

ALTER TABLE tutors
    ADD COLUMN departure_effective_on DATE NULL
    COMMENT 'Last working day, mirrored from ARK. NULL means not leaving. Work dated after this cannot be assigned to them.'
