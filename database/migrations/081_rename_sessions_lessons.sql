-- Migration 081: Rename tables to match CSM terminology
-- SummerSession (class meeting) → SummerLesson
-- SummerPlacement (per-student) → SummerSession

-- Step 1: Rename summer_sessions → summer_lessons (class meetings)
RENAME TABLE summer_sessions TO summer_lessons;

-- Step 2: Rename summer_placements → summer_sessions (per-student bookings)
RENAME TABLE summer_placements TO summer_sessions;

-- Step 3: Rename session_id → lesson_id on per-student table
ALTER TABLE summer_sessions CHANGE COLUMN session_id lesson_id INT NULL;
