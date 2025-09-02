# AppSheet Attendance Reminder System Setup Guide

## Overview
This guide helps you set up an attendance reminder system in your CSM Pro AppSheet app that alerts tutors about past sessions with unchecked attendance.

## Prerequisites
- Execute the SQL views in `/database/views/unchecked_attendance_reminders.sql`
- AppSheet app with tutor authentication configured
- Push notifications enabled (optional)

## Step 1: Add Data Sources

### 1.1 Add Reminder Views to AppSheet

1. Go to **Data** → **Tables** → **+ New Table**
2. Add these three views:

#### A. `unchecked_attendance_reminders`
- **Type**: Read-only
- **Key Column**: `reminder_id`
- **Label**: "Attendance Reminders"
- **Security Filter**: `[tutor_email] = USEREMAIL()`

#### B. `unchecked_attendance_summary`
- **Type**: Read-only
- **Key Column**: `tutor_id`
- **Label**: "Reminder Summary"
- **Security Filter**: `[tutor_email] = USEREMAIL()`

#### C. `attendance_reminder_stats`
- **Type**: Read-only
- **Label**: "Overall Stats"
- **No security filter needed** (admin view)

### 1.2 Configure Virtual Columns

In `unchecked_attendance_reminders` table, add:

1. **Quick Action Link**
   - Name: `mark_attendance_link`
   - Type: Action
   - Formula: `LINKTOROW([session_id], "session_log_Detail")`

2. **Days Overdue Text**
   - Name: `overdue_text`
   - Type: Text
   - Formula: `CONCATENATE([days_overdue], " days ago")`

## Step 2: Create Views

### 2.1 Dashboard Alert Card

1. Go to **UX** → **Views** → **+ New View**
2. Create a **Card** view:
   - **Name**: "Attendance Alert"
   - **For this data**: `unchecked_attendance_summary`
   - **Position**: Dashboard (prominent)
   - **Show if**: `COUNT([total_unchecked]) > 0`

3. Configure the card:
   ```
   Primary Header: [reminder_badge]
   Primary Content: [summary_message]
   Secondary Content: "Oldest: " & [oldest_days_overdue] & " days ago"
   Action: Navigate to "Unchecked Attendance List"
   ```

### 2.2 Unchecked Attendance List View

1. Create a **Table** or **Deck** view:
   - **Name**: "Unchecked Attendance"
   - **For this data**: `unchecked_attendance_reminders`
   - **Sort**: `[days_overdue] DESC`
   - **Group by**: `[urgency_level]`

2. Configure columns:
   - Show: `session_date`, `time_slot`, `student_name`, `urgency_icon`
   - Quick edit columns: Enable inline actions

3. Row coloring:
   ```
   Format Rules:
   - If [urgency_level] = "Critical" → Red background
   - If [urgency_level] = "High" → Orange background
   - If [urgency_level] = "Medium" → Yellow background
   ```

### 2.3 Enhanced Session Detail View

1. Modify existing `session_log_Detail` view:
2. Add a **Show** column:
   - **Name**: "Attendance Warning"
   - **Show if**: `AND([session_date] < TODAY(), 
                      IN([session_status], LIST("Scheduled", "Make-up Class", "Trial Class")),
                      ISBLANK([attendance_marked_by]))`
   - **Content**: "⚠️ ATTENDANCE NOT MARKED"
   - **Text color**: Red
   - **Text size**: Large

## Step 3: Create Actions

### 3.1 Quick Mark Present Action

1. Go to **Behavior** → **Actions** → **+ New Action**
2. Configure:
   - **Name**: "Quick Mark Present"
   - **For this data**: `session_log`
   - **Do this**: Data: set values of columns
   - **Set these columns**:
     - `session_status` = "Attended"
     - `attendance_marked_by` = USEREMAIL()
     - `attendance_mark_time` = NOW()
   - **Prominence**: Display prominently
   - **Icon**: ✓

### 3.2 Quick Mark Absent Action

Similar to above but set:
- `session_status` = "No Show"

## Step 4: Configure Automation (Bots)

### 4.1 Daily Reminder Bot

1. Go to **Automation** → **Bots** → **+ New Bot**
2. Configure:

**Event:**
- **Name**: "Daily Attendance Check"
- **Type**: Scheduled
- **Schedule**: Daily at 9:00 AM

**Process:**
- **Name**: "Check Unchecked Attendance"
- **Run a task**: 
  - **Table**: `unchecked_attendance_summary`
  - **Filter**: `[total_unchecked] > 0`

**Task:**
- **Name**: "Send Reminder"
- **Type**: Send a notification
- **To**: `[tutor_email]`
- **Subject**: "Attendance Reminder"
- **Body**: 
  ```
  You have [total_unchecked] sessions with unmarked attendance.
  
  Critical: [critical_count]
  High Priority: [high_count]
  
  Please mark attendance as soon as possible.
  ```

### 4.2 Weekly Summary Email Bot

1. Create another bot:

**Event:**
- **Name**: "Weekly Summary"
- **Type**: Scheduled
- **Schedule**: Weekly, Monday at 8:00 AM

**Process:**
- **Table**: `unchecked_attendance_summary`
- **Filter**: `[total_unchecked] > 5`

**Task:**
- **Type**: Send an email
- **To**: `[tutor_email]`
- **Subject**: "Weekly Attendance Summary - Action Required"
- **Body**: Create a template with the list of unchecked sessions

### 4.3 Escalation Bot (Optional)

For sessions > 14 days overdue, send to admin:

**Event:**
- **Type**: Scheduled
- **Schedule**: Weekly

**Process:**
- **Table**: `unchecked_attendance_reminders`
- **Filter**: `[days_overdue] > 14`
- **Group by**: `[tutor_id]`

**Task:**
- **Type**: Send an email
- **To**: Admin email
- **Subject**: "Critical: Very Overdue Attendance Records"

## Step 5: Dashboard Configuration

### 5.1 Main Dashboard Layout

Arrange views in this order:
1. **Attendance Alert Card** (top, full width)
2. **Today's Schedule** (existing)
3. **Quick Actions** (existing)
4. **Unchecked Attendance** (if count > 0)

### 5.2 Navigation

1. Add to main menu:
   - **Label**: "Attendance Reminders"
   - **Icon**: ⚠️
   - **Badge**: `COUNT(unchecked_attendance_reminders[reminder_id])`
   - **Show if**: `COUNT(...) > 0`

## Step 6: Testing

### 6.1 Test Scenarios

1. **Create test data**: Add past sessions without attendance
2. **Verify views**: Check that reminders appear correctly
3. **Test actions**: Ensure marking attendance removes from reminder list
4. **Test notifications**: Trigger bots manually to test

### 6.2 User Acceptance Testing

1. Have tutors test:
   - Dashboard alert visibility
   - List view functionality
   - Quick actions
   - Notification timing

## Step 7: Performance Optimization

### 7.1 Sync Settings

1. Go to **Data** → **Tables** → `unchecked_attendance_reminders`
2. Set **Update mode**: "Sync on start"
3. Set **Update delay**: 5 minutes (for real-time updates)

### 7.2 Security Filters

Ensure security filters are properly set to show only relevant data to each tutor.

## Step 8: User Training

### 8.1 Create User Guide

Include:
- How to read reminder badges
- How to mark attendance
- Understanding urgency levels
- Setting notification preferences

### 8.2 Initial Communication

Send announcement to all tutors:
```
Subject: New Feature - Attendance Reminders

We've added an attendance reminder system to help you keep track of unmarked sessions.

What's New:
- Dashboard alerts for unchecked attendance
- Color-coded urgency levels
- Quick mark actions
- Daily reminders (optional)

Please ensure you mark attendance within 3 days of each session.
```

## Monitoring & Maintenance

### Weekly Review
- Check `attendance_reminder_stats` view
- Identify tutors with chronic delays
- Adjust reminder frequency if needed

### Monthly Cleanup
- Archive very old unchecked sessions (>30 days)
- Review bot performance
- Gather user feedback

## Troubleshooting

### Common Issues

1. **Reminders not showing**
   - Check security filters
   - Verify view executed successfully
   - Check user email matches

2. **Notifications not sending**
   - Verify bot is enabled
   - Check notification settings in app
   - Ensure user has allowed notifications

3. **Performance issues**
   - Add indexes to database
   - Reduce sync frequency
   - Limit view to 30 days of data

## Additional Features (Optional)

### Gamification
- Add a "streak" counter for consistent attendance marking
- Create a leaderboard for best attendance tracking

### Integration
- Connect with calendar apps
- Send SMS reminders (via Zapier/Make)
- Integrate with parent communication system

### Analytics
- Create charts showing attendance marking trends
- Generate monthly compliance reports
- Track improvement over time