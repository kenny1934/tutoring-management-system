# SVG Test/Exam Reminder Widget Setup Guide

## Overview
Visual reminder widget showing upcoming tests/exams/quizzes for each student in the next 14 days, displayed on session_log rows.

## Prerequisites
- Tests and Exams table synced from Google Calendar
- _event_category virtual column in Tests and Exams table (Test/Exam/Quiz)
- Existing _student_school and _student_grade virtual columns in session_log

## Step 1: Create Supporting Virtual Columns

Add these virtual columns to **session_log** table:

### Test Count
- **Column Name**: `_test_count`
- **Type**: Number
- **Formula**: See test_reminder_virtual_columns.txt

### First Test Columns
- `_test_1_date` (Date)
- `_test_1_title` (Text)
- `_test_1_description` (Text)
- `_test_1_category` (Text)
- `_test_1_days_until` (Number)

### Second Test Columns (Optional for multiple tests)
- `_test_2_date` - Use INDEX(..., 2) instead of INDEX(..., 1)
- `_test_2_title`
- `_test_2_description`
- `_test_2_category`
- `_test_2_days_until`

### Third Test Columns (Optional)
- `_test_3_date` - Use INDEX(..., 3)
- `_test_3_title`
- `_test_3_description`
- `_test_3_category`
- `_test_3_days_until`

## Step 2: Create SVG Widget Virtual Column

### Column Settings
| Setting | Value |
|---------|-------|
| **Column Name** | `_svg_test_reminder` |
| **Type** | LongText |
| **App Formula** | Use formula from svg_test_reminder_complete.txt |
| **Show?** | Yes |
| **Display Name** | Test Reminders |

## Step 3: Add to Session Views

### Session Detail View
1. Navigate to **UX** → **Views** → Edit Session Detail View
2. Add `_svg_test_reminder` column
3. **Column Type**: Image
4. **Position**: After student information

### Session Form View
1. Add as read-only field
2. Shows tutors upcoming assessments during session planning

## Visual Features

### Color Coding
- **Red Circle** (#FF4444): Tests
- **Purple Circle** (#9C27B0): Exams
- **Green Circle** (#4CAF50): Quizzes

### Urgency Indicators (Days Until)
- **Red Text**: < 3 days
- **Orange Text**: 3-7 days
- **Yellow Text**: 8-14 days

### Layout
- Shows up to 3 upcoming assessments
- Each assessment displays:
  - Color-coded category badge
  - Exact date (format: "Tue 24/09")
  - Days until assessment
  - Full title from calendar
  - Description text

## Testing

### Test Scenarios
1. **Student with no tests**: Shows "No upcoming assessments"
2. **Student with 1 test**: Shows single test details
3. **Multiple tests**: Shows up to 3 tests sorted by date
4. **Various categories**: Test color coding for Test/Exam/Quiz
5. **Urgency colors**: Check <3, 3-7, 8-14 day ranges

### Sample Data
Create test calendar entries like:
- Title: "PCMS F2 Test"
- Description: "Mathematics Unit 3: Functions and Graphs"
- Date: Within next 14 days

## Benefits

### For Tutors
- **Proactive Planning**: See upcoming assessments during sessions
- **Preparation**: Know what to focus on
- **Visual Urgency**: Color-coded days remaining

### For Students
- **Awareness**: Tutors remind them of upcoming tests
- **Better Preparation**: Focus on relevant topics

### For Parents
- **Transparency**: Can see test preparation focus
- **Planning**: Understand session priorities

## Troubleshooting

### Widget Not Showing
- Check Tests and Exams table is synced
- Verify _student_school and _student_grade have values
- Ensure calendar events contain school and grade in title

### Wrong Tests Showing
- Check CONTAINS logic matches title format
- Verify school/grade extraction is correct
- Test date range filters

### Colors Not Working
- Verify _event_category values are exactly "Test", "Exam", or "Quiz"
- Check %23 encoding for colors in formula

## Performance Notes
- Virtual columns calculate on view load
- Consider caching if many sessions viewed
- Limit to 3 tests maximum for performance

**Status**: Ready for implementation. Formula tested with proper SVG encoding and color coding.