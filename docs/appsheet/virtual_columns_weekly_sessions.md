# AppSheet Virtual Columns for Weekly Session Generation

## Overview
These virtual columns enable the automated weekly session generation system by tracking enrollment status, session usage, and determining when students need new sessions.

## Virtual Columns to Add to `enrollments` Table

### 1. Actual_Sessions_Used
**Type:** Number  
**Expression:**
```appsheet
COUNT(
  SELECT(
    session_log[id],
    AND(
      [enrollment_id] = [_THISROW].[id],
      NOT(IN([session_status], LIST(
        "Rescheduled - Make-up Booked",
        "Sick Leave - Make-up Booked",
        "Weather Cancelled - Make-up Booked",
        "Cancelled"
      )))
    )
  )
)
```
**Purpose:** Count sessions that actually consume lesson quota

### 2. Sessions_Remaining
**Type:** Number  
**Expression:**
```appsheet
[lessons_paid] - [Actual_Sessions_Used]
```
**Purpose:** Show how many sessions are left in this enrollment

### 3. Last_Session_Date
**Type:** Date  
**Expression:**
```appsheet
MAX(
  SELECT(
    session_log[session_date],
    [enrollment_id] = [_THISROW].[id]
  )
)
```
**Purpose:** Find the most recent session date

### 4. Last_Session_Status
**Type:** Text  
**Expression:**
```appsheet
INDEX(
  SELECT(
    session_log[session_status],
    AND(
      [enrollment_id] = [_THISROW].[id],
      [session_date] = [_THISROW].[Last_Session_Date]
    )
  ),
  1
)
```
**Purpose:** Get status of the most recent session

### 5. Has_Recent_Activity
**Type:** Yes/No  
**Expression:**
```appsheet
COUNT(
  SELECT(
    session_log[id],
    AND(
      [enrollment_id] = [_THISROW].[id],
      [session_date] >= TODAY() - 28,
      IN([session_status], LIST(
        "Attended",
        "Attended (Make-up)",
        "Rescheduled", 
        "Scheduled"
      ))
    )
  )
) > 0
```
**Purpose:** Check if student has been active in last 4 weeks

### 6. Last_Session_In_Past
**Type:** Yes/No  
**Expression:**
```appsheet
IF(
  ISBLANK([Last_Session_Date]),
  FALSE,
  [Last_Session_Date] <= TODAY() - 3
)
```
**Purpose:** Check if most recent session is at least 3 days in the past (grace period for attendance marking)

### 7. Last_Session_Attended
**Type:** Yes/No  
**Expression:**
```appsheet
IN([Last_Session_Status], LIST("Attended", "Attended (Make-up)"))
```
**Purpose:** Check if student attended their last session

### 8. Needs_Weekly_Session (Main Logic)
**Type:** Yes/No  
**Expression:**
```appsheet
AND(
  [payment_status] = "Pending Payment",
  [Last_Session_In_Past] = TRUE,
  [Last_Session_Attended] = TRUE,
  [Sessions_Remaining] > 0,
  [Has_Recent_Activity] = TRUE
)
```
**Purpose:** Master logic to identify enrollments that need weekly session generation

## Implementation Steps

### Step 1: Add Virtual Columns
1. Navigate to **Data > Tables > enrollments**
2. Add each virtual column with the expressions above
3. Set appropriate column types (Number, Date, Text, Yes/No)
4. Test with sample data

### Step 2: Create Test View (Optional)
Create a view to monitor the virtual columns:
- **View Name:** "Weekly Session Candidates"  
- **Filter:** `[Needs_Weekly_Session] = TRUE`
- **Columns:** Student name, Last session date, Sessions remaining, etc.

### Step 3: Verification
Test virtual columns with various scenarios:
- ✅ Pending Payment enrollment with attended last session → Should show TRUE
- ❌ Paid enrollment → Should show FALSE  
- ❌ Last session was No Show → Should show FALSE
- ❌ No sessions remaining → Should show FALSE
- ❌ No recent activity → Should show FALSE

## Usage in Bot Configuration

The nightly bot will use:
```appsheet
// Bot Condition
[Needs_Weekly_Session] = TRUE

// Referenced Rows  
SELECT(enrollments[id], [Needs_Weekly_Session] = TRUE)
```

This provides the enrollment IDs that need new sessions for the Code.gs webhook call.

## Monitoring & Troubleshooting

### Debug Columns (Optional)
Add these temporary columns to troubleshoot logic:

**Debug_Info (Text):**
```appsheet
CONCATENATE(
  "Payment: ", [payment_status], 
  " | Last: ", IF(ISBLANK([Last_Session_Date]), "None", TEXT([Last_Session_Date])),
  " | Status: ", IF(ISBLANK([Last_Session_Status]), "None", [Last_Session_Status]),
  " | Remaining: ", TEXT([Sessions_Remaining]),
  " | Active: ", IF([Has_Recent_Activity], "Yes", "No")
)
```

This single column shows all the logic inputs for easy debugging.

## Timing Logic Explanation

### 3-Day Grace Period
The `Last_Session_In_Past` formula includes a 3-day grace period (`TODAY() - 3`) for several important reasons:

1. **Tutor Attendance Marking**: Gives tutors 2-3 days to mark attendance after a session
2. **Prevents Daily Generation**: Avoids creating sessions the very next day after attendance  
3. **Reasonable Weekly Cadence**: Still generates sessions with plenty of time for next week
4. **System Reliability**: Reduces false triggering due to delayed attendance updates

### Example Timeline:
- **Wednesday**: Student attends lesson
- **Thursday-Saturday**: Grace period (no session generation) 
- **Sunday**: Bot detects attendance and generates next Wednesday's session
- **Next Wednesday**: Student has new session ready

This ensures sessions are generated 3-6 days in advance, giving both tutors and students adequate notice.

## Performance Notes

- Virtual columns update automatically when session data changes
- Complex SELECT expressions may slow down on large datasets
- Consider adding indexes on `enrollment_id` and `session_date` in session_log table
- Monitor AppSheet sync times after adding these columns