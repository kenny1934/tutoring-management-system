# WeCom Phase 2: Parent Customer Group Messaging

## Overview

**Goal:** Send automated fee renewal reminders to parents via WeCom customer group.

**Status:** Planning (Phase 1 internal messaging completed)

**MVP Scope:**
- ✅ Send text/card messages to WeCom parent customer group
- ✅ Automated fee renewal reminders based on enrollment data
- ✅ Use same webhook infrastructure as Phase 1
- ❌ No individual parent messaging (requires API - Phase 3)
- ❌ No two-way communication yet (Phase 3)

---

## Architecture

### Current Setup (Phase 1)
- **Internal messaging:** Tutor group + Admin group
- **Infrastructure:** wecom_webhooks table, wecom_message_log table
- **Method:** Group robot webhooks (no backend required)

### Phase 2 Addition
- **External messaging:** Parent customer group
- **Reuses:** Same database tables, same AppSheet bot approach
- **New:** parent_group webhook configuration

---

## Prerequisites

### 1. WeCom Customer Group Setup

Your parents' WeChat accounts should already be added to a WeCom customer group. Verify:

1. Open WeCom desktop/mobile app
2. Navigate to **Customers** → **Customer Groups**
3. Confirm your parent group exists (e.g., "CSM Pro Parents")
4. Group should contain parent WeChat accounts

**Customer Group Limits:**
- Maximum members: 200-500 (varies by account type)
- Can add multiple group robots if needed

### 2. Database Requirements

Already completed in Phase 1 - no schema changes needed!

Existing tables:
- ✅ `wecom_webhooks` - stores webhook URLs
- ✅ `wecom_message_log` - audit trail
- ✅ `active_enrollments_needing_renewal` - data source for reminders

---

## Implementation Steps

### Step 1: Create Parent Group Robot (5 minutes)

1. Open the parent customer group in WeCom
2. Click **Group Management** (group settings)
3. Click **Group Robot** (群机器人)
4. Click **Add Robot**
5. Enter name: `CSM Pro Fee Reminders`
6. **Copy the Webhook URL** - looks like:
   ```
   https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=693a91f6-XXXX-XXXX-XXXX-XXXXXXXXXX
   ```

### Step 2: Update Database (1 minute)

Run this SQL command:

```sql
-- Add parent group webhook
INSERT INTO wecom_webhooks (webhook_name, webhook_url, target_description, notes)
VALUES (
    'parent_group',
    'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_PARENT_GROUP_KEY_HERE',
    'Parent customer group for fee renewal notifications',
    'External customer group - max 20 messages per minute'
);
```

Or if already exists (from testing):
```sql
UPDATE wecom_webhooks
SET webhook_url = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY_HERE'
WHERE webhook_name = 'parent_group';
```

### Step 3: Test Webhook (2 minutes)

**PowerShell (Windows):**
```powershell
Invoke-RestMethod -Uri 'YOUR_PARENT_GROUP_WEBHOOK_URL' -Method Post -ContentType 'application/json' -Body '{"msgtype":"text","text":{"content":"✅ Test from CSM Pro - Fee reminder bot ready!"}}'
```

**Bash (Linux/Mac):**
```bash
curl 'YOUR_PARENT_GROUP_WEBHOOK_URL' \
  -H 'Content-Type: application/json' \
  -d '{"msgtype":"text","text":{"content":"✅ Test from CSM Pro - Fee reminder bot ready!"}}'
```

You should see the message in the parent group!

### Step 4: Create AppSheet Bot (10 minutes)

#### Bot Configuration

**Name:** WeCom Fee Renewal Reminders

**Event:** Schedule
- **Schedule Type:** Daily
- **Time:** 9:00 AM (or your preferred time)

**Table:** active_enrollments_needing_renewal

**Condition:**
```
AND(
  [renewal_action_status] = "🔴 Not Yet Renewed",
  [days_until_renewal] <= 7,
  [days_until_renewal] >= 0
)
```

This triggers for enrollments expiring within 7 days that haven't been renewed yet.

#### Webhook Task Configuration

**Task Type:** Call a webhook

**URL:**
```
LOOKUP("parent_group", "wecom_webhooks", "webhook_name", "webhook_url")
```

**HTTP Verb:** POST

**HTTP Headers:**
Leave blank or:
```
Content-Type: application/json
```

**Body Template (News Format - RECOMMENDED):**

```json
{
  "msgtype": "news",
  "news": {
    "articles": [{
      "title": "💰 Fee Renewal Reminder - <<[student_name]>>",
      "description": "Student: <<[student_name]>>\nTutor: <<[tutor_name]>>\nSchedule: <<[assigned_day]>> <<[assigned_time]>>\n\n⏰ Expires in: <<[days_until_renewal]>> days\n📊 Credits remaining: <<[total_credits_remaining]>>\n\n<<IF([days_until_renewal] <= 3, '🔴 URGENT - Please renew soon!', '🟡 Please arrange renewal')>>\n\nThank you!",
      "url": "<<LINKTOFILTEREDVIEW(\"Enrollment Details\", [id] = [_THISROW].[id])>>",
      "picurl": ""
    }]
  }
}
```

**Alternative: Simple Text Format (for testing):**

```json
{
  "msgtype": "text",
  "text": {
    "content": "💰 Fee Renewal Reminder\n\nStudent: <<[student_name]>>\nTutor: <<[tutor_name]>>\nSchedule: <<[assigned_day]>> <<[assigned_time]>>\n\nExpires in: <<[days_until_renewal]>> days\nCredits remaining: <<[total_credits_remaining]>>\n\n<<IF([days_until_renewal] <= 3, '🔴 URGENT - Please renew immediately!', '🟡 Please arrange renewal soon')>>\n\nContact us to renew. Thank you!"
  }
}
```

### Step 5: Enable Bot & Test

1. **Save** the bot in AppSheet
2. **Enable** the bot (toggle switch)
3. Test by:
   - Creating a test enrollment with expiry in 5 days
   - OR wait for scheduled run at 9 AM
   - OR manually trigger the bot in AppSheet

4. Check the parent group - messages should appear!

---

## Rate Limiting & Batch Messaging

### WeCom Limits

**Per Robot:**
- **Maximum:** 20 messages per minute
- **Exceeded:** Returns error code 45009

### Handling Multiple Renewals

If you have >20 renewals to send at once:

**Option 1: Multiple Robots (Simplest)**
1. Create 2-3 group robots in the same parent group
2. Add webhooks: parent_group_1, parent_group_2, parent_group_3
3. Use round-robin logic in AppSheet (e.g., `MOD([id], 3)` to select webhook)

**Option 2: Staggered Scheduling**
1. Create multiple bots with different schedules:
   - Bot 1: 9:00 AM (first 20 renewals)
   - Bot 2: 9:05 AM (next 20 renewals)
   - Bot 3: 9:10 AM (remaining renewals)

**Option 3: Filter by Days Remaining**
1. Bot 1 (Urgent): days_until_renewal <= 3
2. Bot 2 (Soon): days_until_renewal 4-7
3. Runs at different times to spread load

**Recommendation:** Start with Option 1 (multiple robots) - simplest and most reliable.

---

## Message Customization

### Priority-Based Formatting

**Urgent (≤3 days):**
```
🔴 URGENT FEE RENEWAL

Student: [Name]
Expires: [Date] (IN 2 DAYS!)

Please renew immediately to avoid class interruption.
```

**Normal (4-7 days):**
```
💰 Fee Renewal Reminder

Student: [Name]
Expires: [Date] (in 5 days)

Please arrange renewal at your convenience.
```

### Including Payment Links

If you have a payment portal:
```json
{
  "msgtype": "news",
  "news": {
    "articles": [{
      "title": "Fee Renewal - <<[student_name]>>",
      "description": "...",
      "url": "https://your-payment-portal.com/pay?student_id=<<[student_id]>>",
      "picurl": ""
    }]
  }
}
```

### Multi-Language Support

If you have English and Chinese speaking parents:

```
💰 Fee Renewal / 学费续费提醒

Student / 学生: <<[student_name]>>
Expires / 到期: <<[days_until_renewal]>> days / 天

Please renew soon / 请尽快续费
```

---

## Monitoring & Analytics

### Track Message Delivery

**Option 1: Use wecom_message_log (Manual)**

After webhook call, add a second bot step:
- **Action:** Execute action on rows in a table
- **Table:** wecom_message_log
- **Action:** Add new row with:
  - webhook_name: "parent_group"
  - message_type: "fee_reminder"
  - enrollment_id: [id]
  - message_content: [JSON payload]
  - send_status: "sent"
  - send_timestamp: NOW()

**Option 2: AppSheet Bot Execution Log**

Check built-in logs:
1. Go to **Automation** → **Bots**
2. Click on your fee reminder bot
3. Click **View Runs**
4. See success/failure status for each execution

### Success Metrics

Track:
- **Messages sent per day** (from bot runs)
- **Renewal conversion rate** (enrollments renewed / reminders sent)
- **Response time** (time between reminder and payment)

Query example:
```sql
SELECT
    DATE(send_timestamp) as date,
    COUNT(*) as reminders_sent,
    COUNT(DISTINCT enrollment_id) as unique_students
FROM wecom_message_log
WHERE webhook_name = 'parent_group'
  AND message_type = 'fee_reminder'
GROUP BY DATE(send_timestamp)
ORDER BY date DESC;
```

---

## Troubleshooting

### Messages not appearing in parent group

**Check:**
1. ✅ Webhook URL is correct (test with curl/PowerShell)
2. ✅ Group robot is still active (not deleted)
3. ✅ Bot condition matches data (view active_enrollments_needing_renewal)
4. ✅ Bot is enabled in AppSheet
5. ✅ Check bot execution log for errors

### Rate limit errors (error code 45009)

**Solution:**
- Reduce frequency (change schedule from daily to every 2 days)
- Add multiple robots (see Rate Limiting section)
- Stagger bot execution times

### Parents not seeing messages

**Check:**
1. Parents are in the WeCom customer group (not just WeChat)
2. Parents have accepted group invitation
3. Message format is compatible (use simple text first, then upgrade to news)

### Wrong data in messages

**Verify:**
- AppSheet expressions use correct field references
- View `active_enrollments_needing_renewal` has correct data
- Bot condition matches your intended logic

---

## Phase 3: Future Enhancements

Once Phase 2 is working well:

### 1. Individual Parent Messaging
- **Requires:** WeCom API + backend server (not webhook)
- **Benefit:** Personalized messages, not broadcast to group
- **Use cases:** Payment confirmations, individual student reports

### 2. Two-Way Communication
- **Requires:** Backend to receive webhooks from WeCom
- **Benefit:** Parents can reply, confirm payments, ask questions
- **Use cases:** Payment confirmations, rescheduling requests

### 3. Rich Media
- **Add:** Student progress charts, attendance images
- **Method:** Upload to AppSheet, include as picurl in news messages
- **Use cases:** Monthly progress reports with charts

### 4. Multiple Customer Groups
- **Segment:** By location, grade, language
- **Example:**
  - group_parents_hk (Hong Kong parents)
  - group_parents_mo (Macau parents)
  - group_parents_cn (Chinese-speaking)
  - group_parents_en (English-speaking)

### 5. Template Messages
- **Create:** Reusable templates for different scenarios
- **Examples:**
  - Fee renewal reminder
  - Payment received confirmation
  - Class rescheduling notification
  - Holiday closure announcement
  - Progress report notification

---

## Summary Checklist

**Setup (One-time):**
- [ ] Create group robot in WeCom parent customer group
- [ ] Add webhook URL to wecom_webhooks table
- [ ] Test webhook with curl/PowerShell
- [ ] Create AppSheet bot for fee reminders
- [ ] Configure schedule and conditions
- [ ] Test with real data

**Daily Operations:**
- [ ] Monitor bot execution log
- [ ] Review parent group for delivery
- [ ] Track renewal conversion rates
- [ ] Adjust message timing/content based on feedback

**Scaling (As needed):**
- [ ] Add multiple robots if >20 renewals/day
- [ ] Create separate bots for urgent vs normal reminders
- [ ] Segment by customer group if needed
- [ ] Move to Phase 3 for individual messaging

---

## Quick Reference

### Webhook URLs
```sql
-- View all webhooks
SELECT * FROM wecom_webhooks;

-- Update parent group webhook
UPDATE wecom_webhooks
SET webhook_url = 'NEW_URL'
WHERE webhook_name = 'parent_group';
```

### Message Log
```sql
-- View recent messages
SELECT * FROM wecom_message_log
WHERE webhook_name = 'parent_group'
ORDER BY created_at DESC
LIMIT 20;

-- Count messages by day
SELECT DATE(send_timestamp) as date, COUNT(*) as count
FROM wecom_message_log
WHERE webhook_name = 'parent_group'
GROUP BY DATE(send_timestamp);
```

### Rate Limit Monitoring
```sql
-- Messages sent in last hour
SELECT COUNT(*) as messages_last_hour
FROM wecom_message_log
WHERE webhook_name = 'parent_group'
  AND send_timestamp >= NOW() - INTERVAL 1 HOUR;
```

---

## Support

**WeCom Documentation:**
- https://developer.work.weixin.qq.com/ (Chinese)
- Group robot limits: 20 messages/minute per robot

**Internal Docs:**
- Phase 1 Guide: `docs/wecom-integration-guide.md`
- Announcement Bot: `docs/wecom-announcement-bot-setup.md`
- Database Schema: `database/migrations/023_add_wecom_internal_messaging.sql`

**Next Steps:**
Once Phase 2 is stable and providing value, evaluate Phase 3 requirements for individual messaging and two-way communication.
