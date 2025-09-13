# Parent Communication Tracking System (MVP)

## Overview
A lightweight system for tutors to log their communications with parents, providing accountability and gentle reminders for follow-ups. This MVP can be deployed quickly and enhanced over time.

## Database Components

### parent_communications Table
Tracks all parent-tutor communications with the following fields:
- **student_id**: Links to student
- **tutor_id**: Links to tutor who made contact
- **contact_date**: When communication occurred
- **contact_method**: WeChat, Phone, In-Person
- **contact_type**: Progress Update, Concern, Schedule, Payment, General, Homework, Behavior
- **brief_notes**: Quick summary (500 chars max)
- **follow_up_needed**: Boolean flag *(Future Enhancement)*
- **follow_up_date**: Optional date for follow-up *(Future Enhancement)*

## AppSheet Configuration

### 1. Data Sources Setup

#### Add parent_communications Table
1. **Data** → **Tables** → **Add New Table**
2. Select `parent_communications` from database
3. Set display name: "Parent Communications"
4. Configure column settings:
   - `student_id`: Type = Ref to students table
   - `tutor_id`: Type = Ref to tutors table  
   - `contact_date`: Type = DateTime
   - `brief_notes`: Type = LongText
   - `follow_up_date`: Type = Date

#### Add parent_communication_summary View (Read-Only)
1. Add as new table from database view
2. Set as **Read-Only** (no add/edit/delete)
3. Use for dashboard and reporting

### 2. Virtual Columns for Students Table

Add these virtual columns to enhance the student profile:

#### Last_Contact_Date
```appsheet
MAX(
  SELECT(
    parent_communications[contact_date],
    [student_id] = [_THISROW].[id]
  )
)
```

#### Days_Since_Contact
```appsheet
IF(
  ISBLANK([Last_Contact_Date]),
  999,
  ROUND(TODAY() - DATE([Last_Contact_Date]))
)
```

#### Contact_Status
```appsheet
IF(
  [Days_Since_Contact] = 999,
  "Never Contacted",
  IF(
    [Days_Since_Contact] <= 7,
    "Recent",
    IF(
      [Days_Since_Contact] <= 14,
      "Been a While",
      "Contact Needed"
    )
  )
)
```

#### Contact_Status_Icon
```appsheet
SWITCH(
  [Contact_Status],
  "Recent", "✅",
  "Been a While", "⚠️",
  "Contact Needed", "🔴",
  "Never Contacted", "❌",
  "❓"
)
```

#### Contact_Status_Color
```appsheet
SWITCH(
  [Contact_Status],
  "Recent", "Green",
  "Been a While", "Yellow", 
  "Contact Needed", "Red",
  "Never Contacted", "Red",
  "Gray"
)
```

### 3. Quick Actions

#### "Record Parent Communication" Action
Create action on Students table:
- **Action Name**: Record Parent Communication
- **For a record of this table**: Students
- **Do this**: App: go to another view within this app
- **Target**: LINKTOFORM("parent_communications_Form",
  "student_id", [id],
  "tutor_id", USEREMAIL(),
  "contact_date", NOW())
- **Icon**: Phone or Message icon
- **Prominence**: Display prominently
- **Only if**: TRUE

#### "View Communication History" Action  
- **Action Name**: View Communication History
- **Do this**: LINKTOROW([id], "Student_Communications_View")
- **Icon**: History/Clock icon

### 4. Views Configuration

#### Student Detail View Enhancement
Add inline view showing:
- Recent communications (last 3)
- Contact status badge with color
- Quick "Log Contact" button

#### Parent Communications Form
Streamlined form with:
1. **Pre-filled fields**: Student, Tutor, DateTime
2. **Required dropdowns**: Method, Type
3. **Optional**: Brief notes (with voice-to-text)
4. **Conditional**: If follow_up_needed = TRUE, show follow_up_date

Form UX settings:
- Auto save and add another: OFF
- Advance after save: Return to student
- Quick edit columns: Group dropdowns together

#### Tutor Dashboard - "My Parent Contacts"
Create dashboard view showing:
```
Sections:
1. Contact Needed (>14 days) - Red header
2. Been a While (8-14 days) - Yellow header  
3. Recent Contacts (0-7 days) - Green header
4. Never Contacted - Gray header
```

Use card or deck view with:
- Student name prominently displayed
- Days since contact
- Parent phone number
- Quick "Log Contact" action button

#### Communication Calendar View
Calendar view of parent_communications:
- Start date: contact_date
- Title: Student name + contact type
- Color rules based on contact_type

### 5. Slices for Filtering

#### "My Students Needing Contact"
```appsheet
AND(
  [assigned_tutor_id] = USEREMAIL(),
  [Days_Since_Contact] > 14
)
```

#### "This Week's Communications"
```appsheet
[contact_date] >= TODAY() - 7
```

#### "Pending Follow-ups"
```appsheet
AND(
  [follow_up_needed] = TRUE,
  [follow_up_date] <= TODAY() + 3
)
```

### 6. Format Rules

#### Student Row Highlighting
Apply to Students table views:
- **Red background**: Days_Since_Contact > 14
- **Yellow background**: Days_Since_Contact BETWEEN 8 AND 14
- **Green checkmark**: Days_Since_Contact <= 7

#### Follow-up Alert Badge
Show warning icon when:
```appsheet
AND(
  ISNOTBLANK([follow_up_date]),
  [follow_up_date] <= TODAY() + 1
)
```

### 7. Automation Suggestions (Optional)

#### Weekly Summary Bot
- **Schedule**: Every Monday 9 AM
- **Action**: Email tutors list of students needing contact
- **Condition**: Has students with Days_Since_Contact > 14

#### Follow-up Reminder Bot
- **Trigger**: Daily at 8 AM
- **Action**: Notify tutor of pending follow-ups
- **Condition**: follow_up_date = TODAY()

## Usage Workflow

### For Tutors
1. **After each parent interaction**: Tap student → Record Parent Communication
2. **Fill quick form**: Method, Type, Optional notes
3. **Save**: Returns to student profile showing updated status

### For Administrators  
1. **Monitor dashboard**: See which tutors are maintaining contact
2. **Weekly review**: Check students with no recent contact
3. **Export reports**: Communication frequency by tutor

## Best Practices

### Communication Frequency Guidelines
- **Minimum**: Every 2 weeks (14 days)
- **Ideal**: Weekly for struggling students
- **After concerns**: Follow up within 3-5 days

### What to Log
✅ **DO Log**:
- Progress updates
- Behavior concerns
- Schedule changes
- Homework discussions
- General check-ins

❌ **DON'T Log**:
- Payment reminders (use fee message system)
- Automated messages
- Failed call attempts (unless left voicemail)

### Effective Notes Examples
- "Discussed recent improvement in algebra, suggested extra practice"
- "Parent concerned about homework completion, will monitor"
- "Confirmed make-up class schedule for next week"
- "Student struggling with focus, recommended study space changes"

## Success Metrics

Monitor these KPIs monthly:
1. **Average days between contacts**: Target < 14
2. **Students never contacted**: Target = 0
3. **Tutor adoption rate**: Target > 80%
4. **Red status students**: Target < 10% (students needing contact)

## Future Enhancements

### Follow-up System (Database Ready, Not Implemented)
*(Fields `follow_up_needed` and `follow_up_date` are reserved in database)*
- **Follow-up Reminders**: Mark conversations requiring follow-up action
- **Scheduled Follow-ups**: Set specific dates for follow-up communications
- **Dashboard Alerts**: Automated reminders for pending follow-ups
- **Overdue Tracking**: Highlight missed follow-up commitments

### Phase 2 Additions
- WeChat integration for automatic logging
- Parent response tracking
- Communication templates
- Quality scoring system
- Parent portal access
- Automated reminder notifications

## Troubleshooting

### Common Issues

**Virtual columns not updating**:
- Sync the app
- Check formula syntax
- Verify table relationships

**Actions not appearing**:
- Check action conditions
- Verify user permissions
- Ensure prominence settings

**Slow performance**:
- Limit virtual column complexity
- Use security filters
- Archive old communications (>6 months)