-- Summer publish creates session_log rows born as 'Rescheduled - Pending Make-up'
-- (placement rescheduled before publish) without a previous_session_status,
-- so the Undo action never unlocks and the session cannot be reverted to
-- Scheduled. Backfill the undo target for those rows.
--
-- Safe to scope by NULL previous_session_status: every post-publish reschedule
-- goes through the sessions router, which always snapshots the prior status,
-- so a NULL on a pending-make-up summer row can only be publish-born.

UPDATE session_log sl
JOIN enrollments e ON e.id = sl.enrollment_id
SET sl.previous_session_status = 'Scheduled'
WHERE e.enrollment_type = 'Summer'
  AND sl.summer_session_id IS NOT NULL
  AND sl.session_status = 'Rescheduled - Pending Make-up'
  AND sl.previous_session_status IS NULL;
