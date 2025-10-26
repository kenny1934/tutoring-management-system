# Renewal Reminder Bot - Complete System Documentation

## Overview

This system automatically notifies the admin team of students requiring renewal contact, using AppSheet's bot automation with virtual columns for easy configuration management.

**Key Features:**
- Weekly automated email reminders (Mondays at 9:00 AM)
- Color-coded urgency levels (red for 1 session, yellow for 2 sessions)
- Professional HTML email formatting
- Uses `active_enrollments_needing_renewal` database view
- Virtual column configuration for easy maintenance

---

## Implementation Guide

### Step 1: Create Configuration Virtual Columns

Before creating the bot, set up virtual columns for easy configuration management.

**Go to: Data > Tables > (select any table or create a simple 'config' table)**

#### Add These Virtual Columns:

| Column Name | Type | Expression | Description |
|-------------|------|------------|-------------|
| `AdminEmailList` | Text | `"admin@yourcompany.com"` | Admin email addresses |
| `CompanyName` | Text | `"CSM Tutoring"` | Company name for emails |
| `ReminderDay` | Text | `"Monday"` | Day of week for reminders |
| `ReminderTime` | Text | `"09:00"` | Time for reminders (24hr) |

**Note:** Replace the email address with your actual admin email. For multiple emails, use: `"admin1@company.com,admin2@company.com"`

### Step 2: Bot Configuration in AppSheet

**Navigate to: Automation > Bots > New Bot**

#### Basic Settings
- **Bot Name:** `Weekly Renewal Reminder`
- **Table:** `active_enrollments_needing_renewal`
- **Event:** `Schedule`
- **Schedule:** Every Monday at 9:00 AM
- **Timezone:** Set to business timezone

#### Filter Condition
```
[remaining_sessions] <= 2
```
*(The view already filters for ≤2 sessions, but this ensures we catch any edge cases)*

### Step 3: Email Task Configuration

#### Recipients
- **To:** Admin team email list (configure as app setting)
- **Subject:** `Weekly Renewal Reminder - <<COUNT(active_enrollments_needing_renewal)>> Students Need Contact`

#### Email Template Body (HTML)
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

---

## Testing & Validation Plan

### Pre-Implementation Testing

#### 1. Database View Validation

**Test Query: Verify View Returns Correct Data**
```sql
-- Test the active_enrollments_needing_renewal view
SELECT 
    student_name,
    tutor_name,
    remaining_sessions,
    end_date,
    assigned_day,
    assigned_time,
    location,
    payment_status
FROM active_enrollments_needing_renewal
ORDER BY remaining_sessions ASC, end_date ASC;
```

**Expected Results Validation:**
- [ ] Only shows enrollments with `payment_status = 'Paid'`
- [ ] Only shows enrollments with 1-2 remaining scheduled sessions
- [ ] `end_date` is calculated correctly using holiday logic
- [ ] All joins work correctly (student_name, tutor_name populated)

#### 2. AppSheet Bot Testing

**Manual Bot Execution Test:**
1. **Navigate to:** Automation > Bots > Weekly Renewal Reminder
2. **Click:** "Run Now" 
3. **Monitor:** Execution log for errors
4. **Verify:** Email delivery to test address

**Test Checklist:**
- [ ] Bot executes without errors
- [ ] Email is generated and sent
- [ ] HTML formatting displays correctly
- [ ] All student data appears accurately
- [ ] Color coding works (red for 1 session, yellow for 2)
- [ ] Summary counts are correct

### Production Deployment

#### Go-Live Checklist:
- [ ] **Email Recipients:** Update to production admin list
- [ ] **Schedule:** Set to weekly (Monday 9 AM)
- [ ] **Monitoring:** Set up automated execution monitoring
- [ ] **Backup:** Document rollback procedures

---

## Troubleshooting Guide

### Common Issues & Solutions

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Bot doesn't run | Schedule/timezone wrong | Check AppSheet automation settings |
| Empty emails sent | View returning no data | Verify test data exists |
| HTML broken | Template syntax error | Test template with sample data |
| Wrong student count | View logic error | Run validation SQL queries |
| Missing students | Payment status filter | Check enrollment payment_status |
| Email to spam | Sender reputation | Use company domain, check content |

### Rollback Plan

**If Issues Arise:**
1. **Immediate:** Disable bot in AppSheet
2. **Investigation:** Export automation logs
3. **Communication:** Notify admin team of temporary manual process  
4. **Resolution:** Fix issue and re-test
5. **Re-deployment:** Gradual rollout with enhanced monitoring

---

## Success Metrics

### KPI Tracking

**Metrics to Monitor:**
- **Email Delivery Rate:** 100% successful delivery
- **Admin Response Time:** Time from email to parent contact
- **Renewal Conversion:** % of reminded students who renew
- **False Positives:** Students incorrectly flagged for renewal

**Weekly Reports:**
- Number of students identified for renewal
- Number of successful parent contacts
- Number of completed renewals
- System accuracy rate

---

## Notes

- The view `active_enrollments_needing_renewal` already filters for paid enrollments with ≤2 sessions
- Email styling includes color coding: red for 1 session, yellow for 2 sessions
- Consider adding app settings for admin email list for easy management
- Bot will only send emails when there are students requiring renewal (empty list = no email)

## Future Enhancements

- Add push notifications to AppSheet mobile app
- Include enrollment ID links for quick app access
- Add "Mark as Contacted" tracking functionality