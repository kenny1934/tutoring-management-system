-- =====================================================
-- Migration 181: correct the verified branch origin on regular
-- applications 681 and 682
-- =====================================================
-- Both rows currently read MSB, and neither of them should. When an admin
-- links an application to a student record, the origin is filled from that
-- student's home location, and for a brand new student record that home
-- location is the Secondary Academy branch they are joining. So the column
-- ended up holding where the applicant landed instead of where they came
-- from, which is the one thing it is supposed to say.
--
-- Application 681 (RC2026-H5DPB, Aiden Choi) came from the primary side.
-- The admin note on the row already records the old account, MAC-1806,
-- termed on 2023-12-24, so the origin is MAC.
--
-- Application 682 (RC2026-3U9X2, Celine) has never attended any MathConcept
-- centre, so the origin is New. The published enrollment for this one
-- already carries discount 8, which is the Back to School new student
-- offer's own discount, so this only makes the application agree with what
-- was actually charged. Nothing about the money moves either way, because a
-- published enrollment snapshots its own promo code and reads that rather
-- than re-deciding from the application.
--
-- Both applications are published, and a published application locks the
-- origin selector on screen, which is why this goes through the runner.
-- The origin is written without an audit row when an admin changes it on
-- screen, so there is no edit history entry to write here either.
--
-- Each statement is guarded on the old value, so running this a second time
-- changes nothing.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the statement in half.

UPDATE regular_applications
SET verified_branch_origin = 'MAC'
WHERE reference_code = 'RC2026-H5DPB' AND verified_branch_origin = 'MSB';

UPDATE regular_applications
SET verified_branch_origin = 'New'
WHERE reference_code = 'RC2026-3U9X2' AND verified_branch_origin = 'MSB'
