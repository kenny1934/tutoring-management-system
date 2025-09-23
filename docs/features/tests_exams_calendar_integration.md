# Tests and Exams Calendar Integration

## Overview
Integration with Google Calendar to display school tests and exams in AppSheet, with automatic categorization, color coding, and intelligent data extraction for tutor preparation reminders.

## Purpose
- **For Tutors**: Visual calendar of upcoming tests/exams for student preparation
- **For Students**: Awareness of upcoming assessment dates
- **For Admin**: Centralized view of all school assessment schedules
- **For Planning**: Advanced preparation and review material scheduling

## Key Features

### 📅 **Google Calendar Data Source**
- Syncs with existing "Tests and Exams" Google Calendar
- Real-time updates from calendar changes
- Preserves original calendar formatting and details
- No manual data entry required

### 🎨 **Automatic Color Coding**
- **Red**: Tests (titles containing "Test")
- **Purple**: Exams (titles containing "Exam")
- **Green**: Quizzes and other assessments
- Visual distinction for quick identification

### 🏫 **Smart Data Extraction**
- **School**: Automatically extracted from event titles (e.g., "PCMS" from "PCMS F2 Test")
- **Grade**: Automatically parsed grade levels (e.g., "F2" from "PCMS F2 Test")
- **Category**: Test/Exam/Quiz classification for filtering and organization

## Database Integration

### Data Source Setup
1. **Google Calendar** connected as external data source
2. **Calendar ID**: Tests and Exams calendar
3. **Sync Frequency**: Real-time updates
4. **Fields Imported**: title, description, start_date, end_date

### Virtual Columns Added

#### Event Categorization
```yaml
_event_category:
  Type: Enum
  Values: ["Test", "Exam", "Quiz", "Other"]
  App Formula:
    IF(
      CONTAINS(UPPER([title]), "TEST"),
      "Test",
      IF(
        CONTAINS(UPPER([title]), "EXAM"),
        "Exam",
        IF(
          CONTAINS(UPPER([title]), "QUIZ"),
          "Quiz",
          "Other"
        )
      )
    )
```

#### Color Assignment
```yaml
_event_colour:
  Type: Color
  App Formula:
    SWITCH(
      [_event_category],
      "Test", "Red",
      "Exam", "Purple",
      "Quiz", "Green",
      "Green"
    )
```

#### School Extraction
```yaml
_school:
  Type: Text
  App Formula:
    IF(
      CONTAINS([title], " F"),
      LEFT([title], FIND(" F", [title]) - 1),
      LEFT([title], FIND(" ", [title] & " ") - 1)
    )
```

#### Grade Extraction
```yaml
_grade:
  Type: Text
  App Formula:
    IF(
      CONTAINS([title], " F"),
      MID([title], FIND(" F", [title]) + 1, 2),
      ""
    )
```

## AppSheet Configuration

### Calendar View Setup
1. **View Type**: Calendar
2. **Data Source**: Tests and Exams calendar table
3. **Date Field**: start_date
4. **Category Field**: _event_category
5. **Color Field**: _event_colour
6. **Title Display**: [title]
7. **Detail Display**: [description]

### View Settings
- **Default Period**: Month view
- **Allow Navigation**: Previous/Next month
- **Show Weekends**: Yes
- **Event Grouping**: By category
- **Filtering**: By school, grade, category

## Example Data Processing

### Input Calendar Event:
- **Title**: "PCMS F2 Test"
- **Description**: "Mathematics Unit 3: Functions and Graphs"
- **Date**: 2025-02-15

### Processed AppSheet Data:
- **_event_category**: "Test"
- **_event_colour**: "Red"
- **_school**: "PCMS"
- **_grade**: "F2"
- **Display**: Red event on calendar

## Future Enhancement: Test Preparation Reminders

### Planned Integration with session_log
The calendar data will be used to create intelligent reminders in session logs:

#### Session Reminder Virtual Column (Implementation Ready)
```yaml
_test_reminder:
  Type: Text
  App Formula:
    IF(
      COUNT(
        SELECT(tests_exams_calendar[title],
          AND(
            [_school] = LOOKUP([_THISROW].[student_id], students, id, school),
            [_grade] = LOOKUP([_THISROW].[student_id], students, id, grade),
            [start_date] >= TODAY(),
            [start_date] <= TODAY() + 7
          )
        )
      ) > 0,
      CONCATENATE(
        "📚 Upcoming: ",
        COUNT(
          SELECT(tests_exams_calendar[title],
            AND(
              [_school] = LOOKUP([_THISROW].[student_id], students, id, school),
              [_grade] = LOOKUP([_THISROW].[student_id], students, id, grade),
              [start_date] >= TODAY(),
              [start_date] <= TODAY() + 7
            )
          )
        ),
        " test(s) next week - ",
        LIST(
          SELECT(tests_exams_calendar[title],
            AND(
              [_school] = LOOKUP([_THISROW].[student_id], students, id, school),
              [_grade] = LOOKUP([_THISROW].[student_id], students, id, grade),
              [start_date] >= TODAY(),
              [start_date] <= TODAY() + 7
            )
          )
        )
      ),
      ""
    )
```

#### Alternative Simplified Formula (Recommended)
```yaml
_upcoming_tests:
  Type: Text
  App Formula:
    IF(
      ISNOTBLANK(
        LOOKUP([student_id], students, id, school)
      ),
      CONCATENATE(
        "📚 Tests: ",
        SUBSTITUTE(
          LIST(
            SELECT(tests_exams_calendar[title],
              AND(
                CONTAINS([title], LOOKUP([student_id], students, id, school)),
                CONTAINS([title], LOOKUP([student_id], students, id, grade)),
                [start_date] >= TODAY(),
                [start_date] <= TODAY() + 7
              )
            )
          ),
          ", ", " • "
        )
      ),
      ""
    )
```

### AppSheet Implementation Steps

#### Step 1: Add Virtual Column to session_log Table
**Navigate to:** Data > Columns > session_log table

| Setting | Value |
|---------|-------|
| **Column Name** | `_upcoming_tests` |
| **Type** | Text |
| **App Formula** | Use simplified formula above |
| **Show?** | Yes |
| **Editable?** | No |

#### Step 2: Add to Session Views
**Update Session Detail View:**
- Add `_upcoming_tests` column to form/detail view
- Position after student information
- Display as prominent notification box
- Use conditional formatting for visibility

#### Step 3: Conditional Formatting
```yaml
Show If: ISNOTBLANK([_upcoming_tests])
Text Color: Orange
Background: Light Yellow
Font Weight: Bold
```

#### Benefits of Test Reminder Integration:
1. **Proactive Preparation**: Tutors see upcoming tests during session planning
2. **Student-Specific**: Only shows tests relevant to each student's school/grade
3. **Timely Alerts**: 1-week advance notice for adequate preparation time
4. **Action-Oriented**: Clear reminder to prepare review materials
5. **Automated**: No manual tracking of test schedules needed

## Implementation Benefits

### For Tutors:
- **Visual Planning**: See all upcoming assessments at a glance
- **Preparation Time**: Advance notice for review material preparation
- **Student Context**: Understand assessment pressure on students
- **Scheduling**: Avoid intensive lessons before major exams

### For Students:
- **Assessment Awareness**: Clear view of upcoming tests/exams
- **Preparation Planning**: Time to request additional support
- **Stress Management**: Better planning reduces last-minute panic

### For Administration:
- **Centralized Tracking**: All school assessment schedules in one place
- **Resource Planning**: Anticipate increased tutoring demand before exams
- **Performance Analysis**: Correlate tutoring intensity with assessment results

## Technical Architecture

### Data Flow:
1. **Google Calendar** (Source) → Events created/updated
2. **AppSheet Sync** → Automatic data import
3. **Virtual Columns** → Process and categorize data
4. **Calendar View** → Display color-coded events
5. **Session Integration** → Generate preparation reminders

### Performance Considerations:
- **Sync Frequency**: Real-time updates without overwhelming API limits
- **Data Volume**: Optimized for school calendar scale (hundreds of events)
- **Formula Efficiency**: Simple string operations for fast processing
- **Cache Strategy**: AppSheet handles caching automatically

## Security and Privacy

### Data Access:
- **Read-Only**: AppSheet only reads calendar data, cannot modify
- **School Data**: Only accesses Tests and Exams calendar, not personal calendars
- **User Permissions**: Respects existing Google Calendar sharing settings
- **Data Retention**: Follows Google Calendar retention policies

### Compliance:
- **Educational Use**: Appropriate for school assessment scheduling
- **No Personal Data**: Only academic schedule information
- **Transparent**: Clear data usage for educational purposes

## Maintenance and Updates

### Regular Tasks:
- **Calendar Permissions**: Ensure continued access to calendar
- **Formula Testing**: Verify extraction formulas with new naming patterns
- **Color Scheme**: Adjust colors based on user feedback
- **Integration Testing**: Ensure session reminder functionality works correctly

### Troubleshooting:
- **Missing Events**: Check calendar sync permissions
- **Wrong Categories**: Verify title naming conventions
- **Color Issues**: Review SWITCH formula logic
- **Integration Problems**: Test student/school matching logic

## Success Metrics

### Usage Indicators:
- **Calendar View Engagement**: Frequency of tutor calendar access
- **Preparation Effectiveness**: Correlation between advance notice and session quality
- **Student Performance**: Improvement in test preparation and results
- **Tutor Satisfaction**: Reduced last-minute preparation stress

### Expected Outcomes:
- **Improved Planning**: 80% of tutors report better lesson preparation
- **Student Readiness**: Increased advance test preparation requests
- **Reduced Stress**: Fewer last-minute "emergency" review sessions
- **Better Results**: Correlation with improved student test performance

**Status**: Core calendar integration LIVE, session reminder integration planned for next phase.