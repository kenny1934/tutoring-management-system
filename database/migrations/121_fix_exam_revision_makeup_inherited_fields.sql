-- Backfill exam-revision make-up sessions that were created with the wrong
-- enrollment_id and financial_status.
--
-- Bug (fixed in routers/exam_revision.py enroll_student): when a student was
-- enrolled into an exam-revision slot, the new make-up session
--   * took its enrollment_id from an arbitrary same-location enrollment found
--     via Enrollment.query(...).first(), instead of the enrollment of the
--     session being consumed, and
--   * had financial_status hard-coded to 'Unpaid', even when the consumed
--     session was already 'Paid'.
--
-- A make-up session must mirror the session it is a make-up for (make_up_for_id):
-- the consumed session is the source of truth for both fields. This statement
-- copies enrollment_id and financial_status from that consumed session.
--
-- Idempotent: the null-safe (<=>) guards mean re-running it touches 0 rows once
-- the data is corrected. Only exam-revision-created make-ups are in scope, where
-- exam_revision_slot_id IS NOT NULL. Ordinary make-ups already inherit correctly
-- via schedule_makeup and are left untouched.

UPDATE session_log rev
JOIN session_log orig ON rev.make_up_for_id = orig.id
SET rev.enrollment_id    = orig.enrollment_id,
    rev.financial_status = orig.financial_status
WHERE rev.exam_revision_slot_id IS NOT NULL
  AND ( NOT (rev.enrollment_id    <=> orig.enrollment_id)
        OR NOT (rev.financial_status <=> orig.financial_status) );
