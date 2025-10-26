# WeCom Internal Messaging Integration Guide

## Overview

This guide covers setting up WeCom group robot webhooks for internal team notifications from CSM Pro (AppSheet).

**What this enables:**
- ✅ Send notifications to WeCom groups (tutors, admins)
- ✅ Automated reminders for fee renewals, attendance, homework
- ✅ No backend server required (direct AppSheet → WeCom)

**What this does NOT include (Phase 2):**
- ❌ Messaging individual parents on WeChat
- ❌ Two-way communication

---

## Step 1: Create WeCom Group Robots (5 minutes)

### 1.1 Create Groups in WeCom

If you don't have them already, create these groups:
- **Admin Team** - for fee reminders and urgent alerts
- **Tutor Team** - for attendance and homework notifications

### 1.2 Add Group Robots

For each group:

1. Open group in WeCom desktop/mobile app
2. Right-click → **Group Management**
3. Click **Group Robot** (群机器人)
4. Click **Add Robot**
5. Enter name: `CSM Pro Notifications`
6. **Copy the Webhook URL** - looks like:
   ```
   https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=693a91f6-7xxx-4xxx-8xxx-xxxxxxxxx
   ```

### 1.3 Update Database

Run these SQL commands with your actual webhook URLs:

```sql
-- Update admin group webhook
UPDATE wecom_webhooks
SET webhook_url = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_ADMIN_KEY_HERE'
WHERE webhook_name = 'admin_group';

-- Update tutor group webhook
UPDATE wecom_webhooks
SET webhook_url = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_TUTOR_KEY_HERE'
WHERE webhook_name = 'tutor_group';
```

---

## Step 2: Test Your Webhooks (2 minutes)

Test each webhook with curl or Postman:

```bash
curl 'YOUR_WEBHOOK_URL' \
  -H 'Content-Type: application/json' \
  -d '{
    "msgtype": "text",
    "text": {
      "content": "✅ Test message from CSM Pro - webhook working!"
    }
  }'
```

You should see the message appear in your WeCom group.

---

## Step 3: Configure AppSheet Webhooks

### 3.1 Sync New Tables

In AppSheet:
1. Go to **Data** → **Tables**
2. Click **Regenerate Structure**
3. Verify these new tables appear:
   - `wecom_webhooks`
   - `wecom_message_log`

### 3.2 Create Bots

#### Bot 1: Fee Renewal Reminders (Daily)

**Create New Bot:**
- **Name:** WeCom Fee Reminders
- **Event:** Schedule
- **Schedule:** Every day at 10:00 AM
- **Table:** active_enrollments_needing_renewal
- **Condition:**
  ```
  AND(
    [renewal_action_status] = "🔴 Not Yet Renewed",
    [days_until_renewal] <= 7
  )
  ```

**Process (Task):**
- **Run a task:** Call a webhook

**Webhook Configuration:**
- **URL:**
  ```
  LOOKUP("admin_group", "wecom_webhooks", "webhook_name", "webhook_url")
  ```
- **HTTP Verb:** POST
- **HTTP Headers:**
  ```json
  {
    "Content-Type": "application/json"
  }
  ```
- **Body (Template):**
  ```json
  {
    "msgtype": "markdown",
    "markdown": {
      "content": "## 💰 Fee Renewal Reminder\n\n**Student:** <<[student_name]>>\n**Tutor:** <<[tutor_name]>>\n**Schedule:** <<[assigned_day]>> <<[assigned_time]>>\n**Days Until Renewal:** <<[days_until_renewal]>>\n**Credits Remaining:** <<[total_credits_remaining]>>\n\n<<IF([days_until_renewal] <= 0, '⚠️ **EXPIRED** - Please handle immediately!', IF([days_until_renewal] <= 3, '🔴 **URGENT** - Expiring soon!', '🟡 Please arrange renewal'))>>\n\n[View in AppSheet](https://www.appsheet.com/start/YOUR_APP_ID)"
    }
  }
  ```

#### Bot 2: Attendance Reminders (Daily)

**Create New Bot:**
- **Name:** WeCom Attendance Alerts
- **Event:** Schedule
- **Schedule:** Every day at 6:00 PM
- **Table:** session_log
- **Condition:**
  ```
  AND(
    [session_date] < TODAY(),
    [session_date] >= TODAY() - 7,
    ISBLANK([attendance_marked_by]),
    IN([session_status], LIST("Scheduled", "Make-up Class"))
  )
  ```

**Process (Task):**
- **Run a task:** Call a webhook

**Webhook Configuration:**
- **URL:**
  ```
  LOOKUP("tutor_group", "wecom_webhooks", "webhook_name", "webhook_url")
  ```
- **HTTP Verb:** POST
- **HTTP Headers:**
  ```json
  {
    "Content-Type": "application/json"
  }
  ```
- **Body (Template):**
  ```json
  {
    "msgtype": "text",
    "text": {
      "content": "⏰ Attendance Check Reminder\n\nDate: <<TEXT([session_date], 'MMM DD, YYYY')>>\nStudent: <<[_THISROW].[student_id].[student_name]>>\nTime: <<[time_slot]>>\nLocation: <<[location]>>\nOverdue: <<(TODAY() - [session_date])>> days\n\nPlease mark attendance in AppSheet",
      "mentioned_list": ["@all"]
    }
  }
  ```

#### Bot 3: Homework Check Reminders (Daily)

**Create New Bot:**
- **Name:** WeCom Homework Alerts
- **Event:** Schedule
- **Schedule:** Every day at 5:00 PM
- **Table:** homework_to_check
- **Condition:**
  ```
  [check_status] = "Pending"
  ```

**Process (Task):**
- **Run a task:** Call a webhook

**Webhook Configuration:**
- **URL:**
  ```
  LOOKUP("tutor_group", "wecom_webhooks", "webhook_name", "webhook_url")
  ```
- **HTTP Verb:** POST
- **HTTP Headers:**
  ```json
  {
    "Content-Type": "application/json"
  }
  ```
- **Body (Template):**
  ```json
  {
    "msgtype": "markdown",
    "markdown": {
      "content": "## 📝 Homework to Check\n\n**Student:** <<[student_name]>>\n**Assignment:** <<[pdf_name]>> <<[pages]>>\n**Assigned:** <<TEXT([homework_assigned_date], 'MMM DD')>> by <<[assigned_by_tutor]>>\n**Attachments:** <<COALESCE([attachment_types], 'None')>>\n\nPlease check homework in AppSheet\n[Open AppSheet](https://www.appsheet.com/start/YOUR_APP_ID)"
    }
  }
  ```

---

## Step 4: Optional - Add @Mentions for Tutors

To mention specific tutors in group messages:

### 4.1 Get WeCom User IDs

In WeCom admin panel:
1. Go to **Contacts** → **Members**
2. Find each tutor
3. Copy their **User ID** (usually their email or username)

### 4.2 Update Tutors Table

```sql
UPDATE tutors
SET wecom_userid = 'john.smith@company.com'
WHERE tutor_name = 'John Smith';

UPDATE tutors
SET wecom_userid = 'jane.doe@company.com'
WHERE tutor_name = 'Jane Doe';

-- Repeat for all tutors...
```

### 4.3 Modify Attendance Alert to Mention Tutor

Update the attendance webhook body to include:

```json
{
  "msgtype": "text",
  "text": {
    "content": "<<IF(NOT(ISBLANK([_THISROW].[tutor_id].[wecom_userid])), CONCATENATE('@', [_THISROW].[tutor_id].[wecom_userid], ' '), '')>>⏰ Attendance Check Reminder\n\n...",
    "mentioned_list": <<IF(NOT(ISBLANK([_THISROW].[tutor_id].[wecom_userid])), CONCATENATE('["', [_THISROW].[tutor_id].[wecom_userid], '"]'), '[]')>>
  }
}
```

---

## Message Format Examples

### Text Message (Simple)
```json
{
  "msgtype": "text",
  "text": {
    "content": "Your message here",
    "mentioned_list": ["@all"]
  }
}
```

### Markdown Message (Rich Formatting)
```json
{
  "msgtype": "markdown",
  "markdown": {
    "content": "## Title\n\n**Bold text**\n*Italic text*\n\n- Bullet 1\n- Bullet 2\n\n[Link text](https://example.com)"
  }
}
```

### Template Card (Professional)
```json
{
  "msgtype": "template_card",
  "template_card": {
    "card_type": "text_notice",
    "source": {
      "desc": "CSM Pro System"
    },
    "main_title": {
      "title": "⚠️ Urgent Alert",
      "desc": "Action required"
    },
    "emphasis_content": {
      "title": "15",
      "desc": "Items pending"
    },
    "jump_list": [{
      "type": 1,
      "url": "https://www.appsheet.com/start/YOUR_APP_ID",
      "title": "Open AppSheet"
    }]
  }
}
```

---

## Troubleshooting

### Webhook returns error "invalid webhook url"
- Check the webhook URL is copied correctly (including `?key=` part)
- Verify the robot is still active in the WeCom group
- Robot may have been deleted - create a new one

### Messages not sending from AppSheet
- Check bot is enabled in AppSheet
- Verify schedule/condition is triggering
- Check execution log in AppSheet for errors
- Test webhook URL directly with curl

### Messages sending but not appearing in group
- Check you're in the correct WeCom group
- Verify robot wasn't removed from group
- Check robot settings allow messages

### Rate limit errors
- WeCom group robots have ~20 messages/minute limit
- If hitting limit, batch messages or reduce frequency
- Consider using multiple robots for different message types

---

## Next Steps (Phase 2)

Once internal messaging is working well, you can expand to:

1. **Individual parent messaging** (requires backend server + API)
2. **Two-way communication** (receive messages from WeCom)
3. **Rich attachments** (images, files)
4. **Analytics** (track message open rates, clicks)

For Phase 2 implementation, refer to the full WeCom API integration plan.

---

## Quick Reference

**Admin Group Webhook Use Cases:**
- Fee renewal reminders
- Payment issues
- Emergency alerts
- System notifications

**Tutor Group Webhook Use Cases:**
- Attendance reminders
- Homework check alerts
- Schedule changes
- Student updates

**Update Webhook URL:**
```sql
UPDATE wecom_webhooks
SET webhook_url = 'NEW_URL'
WHERE webhook_name = 'admin_group';
```

**Check Message Log:**
```sql
SELECT * FROM wecom_message_log
ORDER BY created_at DESC
LIMIT 10;
```

**Disable Webhook:**
```sql
UPDATE wecom_webhooks
SET is_active = FALSE
WHERE webhook_name = 'admin_group';
```