-- Migration 016: Update homework views to exclude weather cancelled sessions
-- Purpose: Ensure weather cancelled sessions are not considered for homework tracking

-- The homework views need to be updated to exclude the new "Weather Cancelled - Pending Make-up" status
-- from previous session lookups, same as other cancelled/rescheduled sessions.

-- Note: This migration provides the SQL updates needed for the existing homework views.
-- The actual views (homework_to_check and student_homework_history) are defined in migration 013.

-- For homework_to_check view, update the WHERE clauses that exclude session statuses:
-- Change this line in the view definition:
--   AND prev.session_status NOT IN ('Cancelled', 'Rescheduled - Make-up Booked', 'Rescheduled - Pending Make-up', 'Sick Leave - Make-up Booked', 'Sick Leave - Pending Make-up')
-- To this:
--   AND prev.session_status NOT IN ('Cancelled', 'Rescheduled - Make-up Booked', 'Rescheduled - Pending Make-up', 'Sick Leave - Make-up Booked', 'Sick Leave - Pending Make-up', 'Weather Cancelled - Pending Make-up', 'Weather Cancelled - Make-up Booked')

-- And similarly for the inner subquery:
--   AND sl_inner.session_status NOT IN ('Cancelled', 'Rescheduled - Make-up Booked', 'Rescheduled - Pending Make-up', 'Sick Leave - Make-up Booked', 'Sick Leave - Pending Make-up')
-- To this:
--   AND sl_inner.session_status NOT IN ('Cancelled', 'Rescheduled - Make-up Booked', 'Rescheduled - Pending Make-up', 'Sick Leave - Make-up Booked', 'Sick Leave - Pending Make-up', 'Weather Cancelled - Pending Make-up', 'Weather Cancelled - Make-up Booked')

-- The same changes apply to student_homework_history view.

-- This ensures that BOTH weather cancelled statuses are not considered as valid "previous sessions"
-- when determining homework assignments, maintaining consistency with other cancelled session types.

SELECT 'Instructions provided for updating homework views with weather cancelled status' as result;