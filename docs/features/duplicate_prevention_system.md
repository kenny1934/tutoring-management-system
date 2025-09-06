# Duplicate Prevention System

## Overview
Database-level constraints that prevent scheduling conflicts by ensuring no student can have duplicate sessions with the same tutor at the same time and location.

## Database Constraints

### Enrollments Table
```sql
UNIQUE KEY unique_student_tutor_schedule (student_id, tutor_id, assigned_day, assigned_time, location)
```
Prevents duplicate recurring schedule assignments for the same student-tutor combination.

### Session Log Table  
```sql
UNIQUE KEY unique_student_tutor_session (student_id, tutor_id, session_date, time_slot, location)
```
Prevents duplicate individual session bookings for the same student-tutor combination.

## What's Prevented ❌

- **Same student** with **same tutor** at **same day/time/location** (enrollments)
- **Same student** with **same tutor** at **same date/time/location** (sessions)

## What's Still Allowed ✅

- **Different students** with same tutor at same time/location
- **Same student** with **different tutors** at same time/location  
- **Same student-tutor** at **different times** or **different locations**

## Example Scenarios

### Enrollments
```sql
-- ✅ ALLOWED
INSERT: Student A, Tutor 1, Monday 3PM, Location X
INSERT: Student B, Tutor 1, Monday 3PM, Location X  -- Different student
INSERT: Student A, Tutor 2, Monday 3PM, Location X  -- Different tutor
INSERT: Student A, Tutor 1, Monday 4PM, Location X  -- Different time

-- ❌ PREVENTED  
INSERT: Student A, Tutor 1, Monday 3PM, Location X  -- Exact duplicate
```

### Sessions
```sql
-- ✅ ALLOWED
INSERT: Student A, Tutor 1, 2025-09-15 3PM, Location X
INSERT: Student B, Tutor 1, 2025-09-15 3PM, Location X  -- Different student
INSERT: Student A, Tutor 2, 2025-09-15 3PM, Location X  -- Different tutor
INSERT: Student A, Tutor 1, 2025-09-16 3PM, Location X  -- Different date

-- ❌ PREVENTED
INSERT: Student A, Tutor 1, 2025-09-15 3PM, Location X  -- Exact duplicate
```

## Error Handling

When a duplicate is attempted, MySQL returns:
```
Error 1062 (23000): Duplicate entry '[values]' for key 'unique_student_tutor_[schedule|session]'
```

Applications should catch this error and show user-friendly messages like:
- "This student already has a session with this tutor at this time"
- "Please choose a different time slot or tutor"

## Make-up Classes & Rescheduling

The constraints work correctly for rescheduling scenarios:
- **Make-up classes** must find different time slots (prevents tutor conflicts)
- **Rescheduling** automatically works (different date/time creates new valid combination)

## Testing

Use `database/tests/test_duplicate_constraints.sql` to verify constraints are working:
- Run script to test valid insertions
- Uncomment duplicate sections to test constraint violations
- Confirms both success cases and proper error handling

## Implementation Notes

- Constraints added to `database/init.sql` for fresh database setups
- Migration `006_duplicate_prevention_constraints.sql` for existing databases
- Includes data cleanup procedures for pre-existing duplicates

## Benefits

- **Data integrity** - Eliminates double-booking at database level
- **Error prevention** - Catches conflicts before they cause issues  
- **Consistency** - Applies regardless of which application inserts data
- **Performance** - Database-level validation is faster than application logic