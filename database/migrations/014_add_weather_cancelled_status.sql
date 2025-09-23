-- Migration 014: Add Weather Cancelled Session Status
-- Purpose: Add support for sessions cancelled due to bad weather conditions
-- This allows tracking sessions where the student wasn't at fault, preserving their lesson credit

-- Add weather cancelled status as a new session status option
-- This status indicates the session was cancelled due to unavoidable weather conditions
-- (typhoons, flooding, severe storms, etc.) and the student should receive a make-up lesson

-- Note: The session_status column already allows VARCHAR(100) so no schema change needed
-- This migration serves as documentation and can include any future constraints if needed

-- Example usage:
-- UPDATE session_log
-- SET session_status = 'Weather Cancelled - Pending Make-up',
--     notes = CONCAT(COALESCE(notes, ''), ' - Cancelled due to typhoon warning'),
--     last_modified_by = 'admin@example.com',
--     last_modified_time = NOW()
-- WHERE id = [session_id];

-- The following session statuses are now supported:
-- Regular Sessions:
--   - 'Scheduled'
--   - 'Attended'
--   - 'Attended (Make-up)'
--   - 'No Show'
--
-- Rescheduled Sessions:
--   - 'Rescheduled - Make-up Booked'
--   - 'Rescheduled - Pending Make-up'
--   - 'Sick Leave - Make-up Booked'
--   - 'Sick Leave - Pending Make-up'
--   - 'Weather Cancelled - Pending Make-up'  -- NEW
--   - 'Weather Cancelled - Make-up Booked'   -- NEW
--
-- Other:
--   - 'Cancelled'
--   - 'Make-up Class'
--   - 'Trial Class'

-- Financial implications:
-- Weather cancelled sessions should KEEP their original financial_status (Unpaid/Paid)
-- DO NOT change to 'Waived' as this ensures make-up sessions inherit correct payment status
-- The student retains their lesson credit for a make-up session

-- Workflow:
-- 1. Session scheduled with normal financial_status
-- 2. Weather cancellation → 'Weather Cancelled - Pending Make-up' (financial_status unchanged)
-- 3. Make-up scheduled → Original becomes 'Weather Cancelled - Make-up Booked'
-- 4. New make-up session created with 'Make-up Class' status (inherits financial_status)

-- When weather conditions prevent safe travel or force school closures,
-- this status preserves the student's enrollment lesson count while
-- allowing proper tracking and scheduling of make-up sessions.

SELECT 'Migration 014: Weather cancelled session status support added' as result;