-- Track when an applicant joined their current buddy group.
--
-- Buddy group membership changes over time: applicants can leave/join via
-- the public status page, and admins can reassign via the detail modal.
-- For group-size discount eligibility we need "when did this group reach N
-- members", which is derived as the Nth-smallest buddy_joined_at among the
-- group's current members. submitted_at alone is wrong whenever someone
-- joins a group after their original submission.
--
-- On leave, the column is set back to NULL alongside buddy_group_id.
-- On rejoin, the clock resets to the new join time — we deliberately do
-- not preserve historical joins, since a deliberate leave-and-rejoin should
-- count as a fresh join for discount-window purposes.

ALTER TABLE summer_applications
  ADD COLUMN buddy_joined_at DATETIME NULL AFTER buddy_group_id;

-- Backfill: for rows currently in a buddy group, assume they joined at
-- submission time. This is the best approximation given the absence of
-- historical data.
UPDATE summer_applications
SET buddy_joined_at = submitted_at
WHERE buddy_group_id IS NOT NULL
  AND buddy_joined_at IS NULL;
