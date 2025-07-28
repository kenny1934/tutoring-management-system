# AppSheet Renewal Reminder Bot Configuration

## Bot Overview
**Name:** Weekly Renewal Reminder  
**Purpose:** Automatically notify admin team of students requiring renewal contact  
**Frequency:** Weekly (Mondays at 9:00 AM)  
**Data Source:** `active_enrollments_needing_renewal` view

## Bot Configuration

### 1. Bot Settings
- **Type:** Scheduled
- **Schedule:** Every Monday at 9:00 AM
- **Data Table:** `active_enrollments_needing_renewal`

### 2. Filter Condition
```
[remaining_sessions] <= 2
```
*(The view already filters for ≤2 sessions, but this ensures we catch any edge cases)*

### 3. Email Task Configuration

#### Recipients
- **To:** Admin team email list (configure as app setting)
- **Subject:** `Weekly Renewal Reminder - <<COUNT(active_enrollments_needing_renewal)>> Students Need Contact`

#### Email Template Body
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .urgent { background-color: #ffebee; }
        .warning { background-color: #fff3e0; }
    </style>
</head>
<body>
    <h2>📅 Weekly Renewal Reminder</h2>
    
    <p><strong>Generated:</strong> <<NOW()>></p>
    <p><strong>Total Students Requiring Contact:</strong> <<COUNT(active_enrollments_needing_renewal)>></p>
    
    <h3>Students Needing Renewal Contact</h3>
    
    <table>
        <thead>
            <tr>
                <th>Student Name</th>
                <th>Tutor</th>
                <th>Sessions Left</th>
                <th>Projected End Date</th>
                <th>Day & Time</th>
                <th>Location</th>
                <th>Payment Status</th>
            </tr>
        </thead>
        <tbody>
            <<Start: active_enrollments_needing_renewal>>
            <tr class="<<IF([remaining_sessions] = 1, "urgent", IF([remaining_sessions] = 2, "warning", ""))>>">
                <td><<[student_name]>></td>
                <td><<[tutor_name]>></td>
                <td><<[remaining_sessions]>></td>
                <td><<[end_date]>></td>
                <td><<[assigned_day]>> <<[assigned_time]>></td>
                <td><<[location]>></td>
                <td><<[payment_status]>></td>
            </tr>
            <<End>>
        </tbody>
    </table>
    
    <h3>Action Required</h3>
    <ul>
        <li>🔴 <strong>1 Session Left:</strong> URGENT - Contact immediately</li>
        <li>🟡 <strong>2 Sessions Left:</strong> Contact within 2 days</li>
    </ul>
    
    <p>
        <strong>Next Steps:</strong><br>
        1. Contact parents to confirm renewal interest<br>
        2. Use "Renew Enrollment" action in CSM Pro app<br>
        3. Process payment confirmation when received
    </p>
    
    <hr>
    <p><em>This is an automated reminder from CSM Pro. Please do not reply to this email.</em></p>
</body>
</html>
```

### 4. Alternative Plain Text Template
```
📅 WEEKLY RENEWAL REMINDER

Generated: <<NOW()>>
Total Students Requiring Contact: <<COUNT(active_enrollments_needing_renewal)>>

STUDENTS NEEDING RENEWAL CONTACT:
<<Start: active_enrollments_needing_renewal>>
---
Student: <<[student_name]>>
Tutor: <<[tutor_name]>>
Sessions Left: <<[remaining_sessions]>> <<IF([remaining_sessions] = 1, "🔴 URGENT", "🟡")>>
End Date: <<[end_date]>>
Schedule: <<[assigned_day]>> <<[assigned_time]>> at <<[location]>>
Payment Status: <<[payment_status]>>
---
<<End>>

ACTION REQUIRED:
• 🔴 1 Session Left = URGENT - Contact immediately
• 🟡 2 Sessions Left = Contact within 2 days

NEXT STEPS:
1. Contact parents to confirm renewal interest
2. Use "Renew Enrollment" action in CSM Pro app
3. Process payment confirmation when received

---
This is an automated reminder from CSM Pro.
```

## Implementation Steps

1. **Create the Bot:**
   - Go to Automation > Bots in AppSheet
   - Click "New Bot"
   - Name: "Weekly Renewal Reminder"

2. **Configure Schedule:**
   - Set Event: "Schedule"
   - Schedule: "Every Monday at 9:00 AM"
   - Timezone: Set to business timezone

3. **Add Email Task:**
   - Task Type: "Send an email"
   - From: Use app email or admin email
   - To: Admin team distribution list
   - Subject and Body: Use templates above

4. **Test the Bot:**
   - Use "Run Now" to test email generation
   - Verify formatting and data accuracy
   - Confirm recipient delivery

## Notes
- The view `active_enrollments_needing_renewal` already filters for paid enrollments with ≤2 sessions
- Email styling includes color coding: red for 1 session, yellow for 2 sessions
- Consider adding app settings for admin email list for easy management
- Bot will only send emails when there are students requiring renewal (empty list = no email)

## Future Enhancements
- Add push notifications to AppSheet mobile app
- Include enrollment ID links for quick app access
- Add "Mark as Contacted" tracking functionality