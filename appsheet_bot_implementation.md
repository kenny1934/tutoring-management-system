# AppSheet Renewal Reminder Bot - Complete Implementation Guide

## Overview

This guide uses **virtual columns for configuration** and a **clean email template** approach, leveraging AppSheet's native expression system for easy maintenance.

## Step 1: Create Configuration Virtual Columns

Before creating the bot, set up virtual columns for easy configuration management.

**Go to: Data > Tables > (select any table or create a simple 'config' table)**

### Add These Virtual Columns:

| Column Name | Type | Expression | Description |
|-------------|------|------------|-------------|
| `AdminEmailList` | Text | `"admin@yourcompany.com"` | Admin email addresses |
| `CompanyName` | Text | `"CSM Tutoring"` | Company name for emails |
| `ReminderDay` | Text | `"Monday"` | Day of week for reminders |
| `ReminderTime` | Text | `"09:00"` | Time for reminders (24hr) |

**Note:** Replace the email address with your actual admin email. For multiple emails, use: `"admin1@company.com,admin2@company.com"`

## Step 2: Bot Configuration in AppSheet

**Navigate to: Automation > Bots > New Bot**

#### Basic Settings
- **Bot Name:** `Weekly Renewal Reminder`
- **Table:** `active_enrollments_needing_renewal`
- **Event:** `Scheduled`

#### Schedule Configuration
- **Schedule Type:** `Recurring`
- **Repeat:** `Weekly`
- **Day:** `<<SELECT(config[ReminderDay], TRUE)>>`
- **Time:** `<<SELECT(config[ReminderTime], TRUE)>>`
- **Timezone:** `Asia/Hong_Kong` (or appropriate timezone)

#### Filter Condition
```
AND(
  [remaining_sessions] <= 2,
  [remaining_sessions] > 0,
  [payment_status] = "Paid"
)
```

**Note:** Replace `config` with the actual table name where you created the virtual columns.

## Step 3: Email Task Configuration

#### Task Settings
- **Task Type:** `Send an email`
- **Task Name:** `Send Renewal Reminder Email`

#### Email Recipients
- **From:** App email or admin email
- **To:** `admin@yourcompany.com` *(replace with actual admin email)*
- **CC:** *(leave blank or add specific managers)*
- **BCC:** *(optional for record keeping)*

**Note:** Replace `admin@yourcompany.com` with your actual admin email address. For multiple recipients, use comma-separated format: `admin1@company.com,admin2@company.com`

#### Email Subject
```
Weekly Renewal Reminder - Students Need Contact
```

#### Email Body Template
**Use this in the "Email Body Template" field (not "Email Body"):**

```
WEEKLY RENEWAL REMINDER
Generated: <<NOW()>>

The following students need renewal contact:

<<Start>>
Student: <<[student_name]>>
Tutor: <<[tutor_name]>>
Sessions Left: <<[remaining_sessions]>>
End Date: <<[end_date]>>
Schedule: <<[assigned_day]>> <<[assigned_time]>> at <<[location]>>
---
<<End>>

ACTION REQUIRED:
- Students with 1 session left: URGENT - Contact immediately
- Students with 2 sessions left: Contact within 2 days

NEXT STEPS:
1. Contact parents to confirm renewal interest
2. Use "Renew Enrollment" action in CSM Pro app
3. Process payment confirmation when received

This is an automated reminder from CSM Pro.
```

**Important:** Put this template in the **"Email Body Template"** field, not the regular "Email Body" field.

## Step 4: Bot Conditions (Prevent Empty Emails)

Add this condition to prevent emails when no students need renewal:

**Run Condition:**
```
COUNT(SELECT(active_enrollments_needing_renewal[student_name], TRUE)) > 0
```

## Step 5: Testing the Bot

### Test Steps:
1. **Manual Test:** Click "Run Now" on the bot
2. **Verify Email Delivery:** Check admin email inbox
3. **Check Data Accuracy:** Verify student list matches database
4. **Test Virtual Columns:** Confirm configuration values appear correctly

### Test Scenarios:
- Students with exactly 1 session left (urgent)
- Students with exactly 2 sessions left (warning)
- Students with 0 sessions (should not appear)
- Students with "Pending Payment" status (should not appear)
- Empty renewal list (should not send email)

## Benefits of This Approach

### ✅ **Easy Configuration Management:**
- **Change admin emails:** Edit `AdminEmailList` virtual column
- **Update company name:** Edit `CompanyName` virtual column  
- **Modify schedule:** Edit `ReminderDay` and `ReminderTime` virtual columns
- **No hardcoded values** in bot configuration

### ✅ **Professional & Readable:**
- Clean plain text with emojis for visual appeal
- Works across all email clients (no HTML compatibility issues)
- Easy to scan and understand for busy administrators
- Native AppSheet expressions for dynamic content

### ✅ **Maintainable:**
- Simple template structure
- Easy to modify content
- Virtual columns for all configuration
- No complex HTML/CSS to maintain

## Configuration Summary

### Required Virtual Columns:
Create these in any table (suggest creating a simple 'config' table):
- `AdminEmailList`: `"your.admin@email.com"`
- `CompanyName`: `"CSM Tutoring"`  
- `ReminderDay`: `"Monday"`
- `ReminderTime`: `"09:00"`

### Quick Setup Checklist:
- [ ] Create virtual columns for configuration
- [ ] Create bot in AppSheet Automation
- [ ] Set schedule using virtual column expressions
- [ ] Configure email task with virtual column recipient
- [ ] Copy/paste clean email template
- [ ] Set run condition to prevent empty emails
- [ ] Test with "Run Now" feature
- [ ] Monitor first scheduled execution

### Easy Updates:
- **Change recipients:** Update `AdminEmailList` virtual column
- **Modify schedule:** Update `ReminderDay`/`ReminderTime` virtual columns
- **Rebrand:** Update `CompanyName` virtual column
- **All changes:** Take effect immediately, no bot reconfiguration needed

## Troubleshooting

### Common Issues:
| Issue | Cause | Solution |
|-------|-------|----------|
| Bot not running | Schedule/timezone wrong | Check virtual column values and timezone |
| Wrong recipients | Email expression error | Verify `AdminEmailList` virtual column |
| Missing company name | Virtual column reference | Check `CompanyName` virtual column |
| Template errors | Expression syntax | Test expressions individually |

### Virtual Column Issues:
- Ensure virtual column expressions use correct syntax
- Replace `config` with your actual table name in bot expressions
- Test virtual column values in app preview before using in bot