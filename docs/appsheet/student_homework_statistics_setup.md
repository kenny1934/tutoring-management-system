# Student Homework Statistics Setup

## Overview
Add homework performance statistics to the Students table in AppSheet. These statistics track submission rates, completion quality, and trends over time.

## Method 1: Using Database View (Recommended for Performance)

### Step 1: Run Database Migration
⚠️ **IMPORTANT**: Use the FIXED version: `012_student_homework_statistics_fixed.sql`

This corrected version:
- Counts assigned homework from `session_exercises` (not `homework_completion`)
- Fixes star rating calculation: "⭐⭐⭐" = 3 stars (not 4.5)
- Only counts homework for attended sessions

### Step 2: Add Statistics Table to AppSheet

#### Data Source Setup
1. **Data** → **Tables** → **Add New Table**
2. Select `student_homework_statistics` from database
3. **Table Name**: `Student Homework Statistics`

#### Key Columns Available:
- `submission_rate_percent` - Overall submission rate as percentage
- `avg_completion_score` - Average homework completion quality (0-100%)
- `avg_star_rating` - Average star rating (1-5 stars)
- `recent_submission_rate_30d` - Submission rate for last 30 days
- `submission_summary` - Formatted text: "15 of 20 submitted (75%)"
- `recent_summary` - Formatted text: "3 of 4 submitted (last 30 days)"

### Step 3: Create Virtual Columns in Students Table

#### Virtual Column 1: Homework Submission Rate
| Setting | Value |
|---------|-------|
| **Column Name** | `hw_submission_rate` |
| **Type** | Text |
| **App Formula** | `LOOKUP([_THISROW].[id], "Student Homework Statistics", "student_id", "submission_summary")` |
| **Show** | Yes |
| **Editable** | No |

#### Virtual Column 2: Recent Homework Trend
| Setting | Value |
|---------|-------|
| **Column Name** | `hw_recent_trend` |
| **Type** | Text |
| **App Formula** | `LOOKUP([_THISROW].[id], "Student Homework Statistics", "student_id", "recent_summary")` |
| **Show** | Yes |
| **Editable** | No |

#### Virtual Column 3: Average Completion Score
| Setting | Value |
|---------|-------|
| **Column Name** | `hw_avg_completion` |
| **Type** | Text |
| **App Formula** | `CONCATENATE(LOOKUP([_THISROW].[id], "Student Homework Statistics", "student_id", "avg_completion_score"), "%")` |
| **Show** | Yes |
| **Editable** | No |

#### Virtual Column 4: Average Star Rating
| Setting | Value |
|---------|-------|
| **Column Name** | `hw_avg_rating` |
| **Type** | Text |
| **App Formula** | `CONCATENATE(LOOKUP([_THISROW].[id], "Student Homework Statistics", "student_id", "avg_star_rating"), " ⭐")` |
| **Show** | Yes |
| **Editable** | No |

---

## Method 2: Pure AppSheet Virtual Columns (Alternative)

If you prefer not to use a database view, add these virtual columns directly to the Students table:

### ⚠️ IMPORTANT: Pure AppSheet Method Issues

**The pure AppSheet virtual column approach has the same fundamental flaw**: it counts from `homework_completion` table instead of `session_exercises`, so it only counts homework that was submitted, not assigned.

**Recommendation**: Use the Database View Method instead for accurate statistics.

If you must use pure AppSheet columns, you would need complex formulas joining multiple tables, which would be very slow:

### Virtual Column 1: Homework Submission Rate (CORRECTED but SLOW)
```yaml
Column Name: hw_submission_rate
Type: Text
App Formula: |
  CONCATENATE(
    COUNT(
      SELECT(homework_completion[id],
        AND(
          [student_id] = [_THISROW].[id],
          [submitted] = TRUE
        )
      )
    ),
    " of ",
    COUNT(
      SELECT(session_exercises[id],
        AND(
          LOOKUP([session_id], session_log, id, student_id) = [_THISROW].[id],
          [exercise_type] = "HW",
          IN(LOOKUP([session_id], session_log, id, session_status), LIST("Attended", "Attended (Make-up)", "Completed"))
        )
      )
    ),
    " submitted (",
    ROUND(
      (COUNT(
        SELECT(homework_completion[id],
          AND(
            [student_id] = [_THISROW].[id],
            [submitted] = TRUE
          )
        )
      ) * 100.0) /
      MAX(
        COUNT(
          SELECT(session_exercises[id],
            AND(
              LOOKUP([session_id], session_log, id, student_id) = [_THISROW].[id],
              [exercise_type] = "HW",
              IN(LOOKUP([session_id], session_log, id, session_status), LIST("Attended", "Attended (Make-up)", "Completed"))
            )
          )
        ),
        1
      ),
      1
    ),
    "%)"
  )
```

### Virtual Column 2: Average Completion Score
```yaml
Column Name: hw_avg_completion
Type: Text
App Formula: |
  CONCATENATE(
    ROUND(
      AVERAGE(
        SELECT(homework_completion[completion_score],
          [student_id] = [_THISROW].[id]
        )
      ) * 100,
      1
    ),
    "%"
  )
```

### Virtual Column 3: Recent Homework Trend (Last 30 Days)
```yaml
Column Name: hw_recent_trend
Type: Text
App Formula: |
  CONCATENATE(
    COUNT(
      SELECT(homework_completion[id],
        AND(
          [student_id] = [_THISROW].[id],
          [submitted] = TRUE,
          [assigned_date] >= (TODAY() - 30)
        )
      )
    ),
    " of ",
    COUNT(
      SELECT(homework_completion[id],
        AND(
          [student_id] = [_THISROW].[id],
          [assigned_date] >= (TODAY() - 30)
        )
      )
    ),
    " submitted (last 30 days)"
  )
```

### Virtual Column 4: Average Star Rating (CORRECTED)
```yaml
Column Name: hw_avg_rating
Type: Text
App Formula: |
  IF(
    COUNT(
      SELECT(homework_completion[homework_rating],
        AND(
          [student_id] = [_THISROW].[id],
          ISNOTBLANK([homework_rating])
        )
      )
    ) > 0,
    CONCATENATE(
      ROUND(
        AVERAGE(
          SELECT(
            homework_completion[homework_rating],
            AND(
              [student_id] = [_THISROW].[id],
              ISNOTBLANK([homework_rating])
            )
          )[LEN([homework_rating])]  -- FIXED: Use LEN directly, not /2
        ),
        1
      ),
      " ⭐"
    ),
    "No ratings"
  )
```

---

## Adding to Student Views

### Update Student Detail View
Add the new virtual columns to student detail views:

#### Columns to Add:
- `hw_submission_rate` - Overall submission statistics
- `hw_recent_trend` - Recent 30-day performance
- `hw_avg_completion` - Average homework quality
- `hw_avg_rating` - Average star rating

#### Display Names:
```yaml
hw_submission_rate: "📊 Homework Submission Rate"
hw_recent_trend: "📈 Recent Trend (30 days)"
hw_avg_completion: "✅ Average Completion"
hw_avg_rating: "⭐ Average Rating"
```

### Create Homework Performance Dashboard
Create a dedicated view showing all students with their homework statistics:

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `Student Homework Performance` |
| **For This Data** | `Students` |
| **View Type** | `Table` |
| **Sort Order** | `hw_submission_rate` (descending) |

#### Columns to Show:
- `student_name`
- `grade`
- `hw_submission_rate`
- `hw_recent_trend`
- `hw_avg_completion`
- `hw_avg_rating`

---

## Performance Considerations

### Database View Method (Recommended):
- ✅ **Faster**: Calculations done in database
- ✅ **Consistent**: All users see same values
- ✅ **Less app sync time**: Pre-calculated values
- ❌ **Requires database access**: Need to run migration

### Virtual Columns Method:
- ✅ **No database changes**: Pure AppSheet solution
- ✅ **Real-time**: Always current data
- ❌ **Slower**: Calculations done on device
- ❌ **Sync intensive**: Complex formulas slow down app

## Recommendation
Use the **Database View Method** for better performance, especially as homework data grows over time.