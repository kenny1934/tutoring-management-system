# WeCom Manual Send Action Setup Guide

## Overview

This guide shows how to configure a **Super Admin-only action** in AppSheet that lets you manually send any tutor message to a WeCom group of your choice - without touching the terminal!

**Features:**
- ✅ Send messages to any WeCom group (admin, tutor, or parent)
- ✅ Support for images via `image_attachment`
- ✅ Tracks who sent and when
- ✅ Only accessible by Super Admin role
- ✅ Works with existing `tutor_messages` table

---

## Step 1: Run Database Migration

Run this migration to add the required fields:

```sql
-- File: database/migrations/024_add_manual_wecom_send.sql

ALTER TABLE tutor_messages
ADD COLUMN target_wecom_group VARCHAR(50) NULL COMMENT 'Which WeCom group to send to: admin_group, tutor_group, parent_group',
ADD COLUMN wecom_sent_manually BOOLEAN DEFAULT FALSE COMMENT 'TRUE if manually sent via action button',
ADD COLUMN wecom_sent_manually_at TIMESTAMP NULL COMMENT 'When manually sent to WeCom',
ADD COLUMN wecom_sent_manually_by VARCHAR(255) COMMENT 'Email of user who manually sent';

CREATE INDEX idx_wecom_manual ON tutor_messages(wecom_sent_manually, target_wecom_group);
```

---

## Step 2: AppSheet Column Configuration

### 1. Sync Table Structure

1. Go to **Data** → **Columns** → `tutor_messages`
2. Click **Regenerate Structure**
3. Verify new columns appear:
   - `target_wecom_group`
   - `wecom_sent_manually`
   - `wecom_sent_manually_at`
   - `wecom_sent_manually_by`

### 2. Configure `target_wecom_group` Column

**Type:** Enum

**Values:**
```
admin_group
tutor_group
parent_group
```

**Display Labels (optional):**
```
admin_group: 📧 Admin Team
tutor_group: 👥 Tutor Team
parent_group: 👨‍👩‍👧 Parent Group
```

**Show?:** YES

**Editable?:** YES

**Show_If:**
```
USERROLE() = "Super Admin"
```

**Initial Value:** (leave blank)

**Required?:** NO (only required when using the Send action)

### 3. Hide Tracking Columns

For `wecom_sent_manually`, `wecom_sent_manually_at`, `wecom_sent_manually_by`:

**Show?:** NO (or show in read-only view for audit trail)

**Editable?:** NO

---

## Step 3: Create the Action

### Action Configuration

**Action Name:** `Send to WeCom Group`

**For a record of this table:** `tutor_messages`

**Do this:**
- **Action Type:** Grouped: execute a sequence of actions

**Accessibility:**

**Only if this condition is true:**
```
AND(
  USERROLE() = "Super Admin",
  NOT(ISBLANK([target_wecom_group])),
  NOT(ISBLANK([message]))
)
```

**Needs confirmation?:** YES (recommended)

**Confirmation message:**
```
Send this message to <<[target_wecom_group]>>?
```

---

### Step 3.1: First Action - Call Webhook

**Action 1 Name:** `Call WeCom Webhook`

**Action Type:** Call a webhook

**URL:**
```
LOOKUP([target_wecom_group], "wecom_webhooks", "webhook_name", "webhook_url")
```

**HTTP Verb:** POST

**HTTP Headers:** (leave blank)

**Body:**

```json
{
  "msgtype": "news",
  "news": {
    "articles": [{
      "title": "<<[subject]>>",
      "description": "<<[message]>>\n\nFrom: <<[from_tutor_id].[tutor_name]>> | Priority: <<[priority]>> | Posted: <<TEXT([created_at], 'MMM DD HH:mm')>>",
      "url": "<<APPLINK()>>",
      "picurl": "<<[image_attachment]>>"
    }]
  }
}
```

**Alternative Body (Simple Text - for testing):**

```json
{
  "msgtype": "text",
  "text": {
    "content": "<<[subject]>>\n\n<<[message]>>\n\nFrom: <<[from_tutor_id].[tutor_name]>>"
  }
}
```

---

### Step 3.2: Second Action - Mark as Sent

**Action 2 Name:** `Mark as Sent`

**Action Type:** Data: set the values of some columns in this row

**Set these columns:**

1. **Column:** `wecom_sent_manually`
   **Value:** `TRUE`

2. **Column:** `wecom_sent_manually_at`
   **Value:** `NOW()`

3. **Column:** `wecom_sent_manually_by`
   **Value:** `USEREMAIL()`

---

### Step 3.3: Link Actions Together

In the **Grouped Action** configuration:

**Steps:**
1. Call WeCom Webhook
2. Mark as Sent

**Order matters!** Webhook first, then mark as sent.

---

## Step 4: Add Action to View

### Option A: Add to Detail View

1. Go to **UX** → **Views** → `tutor_messages_Detail`
2. Under **View Options** → **Actions**
3. Add action: `Send to WeCom Group`
4. **Display prominently?** YES

### Option B: Add to Form View

1. Go to **UX** → **Views** → `tutor_messages_Form`
2. Under **Form Settings** → **Actions**
3. Add action: `Send to WeCom Group`

### Option C: Add to Table/Card View

1. Go to **UX** → **Views** → `tutor_messages` (main view)
2. Under **View Options** → **Row actions**
3. Add action: `Send to WeCom Group`

---

## Step 5: Test the Action

### Test Scenario 1: Simple Message

1. Go to tutor_messages
2. Create or open a message:
   - **Subject:** "Test Manual Send"
   - **Message:** "Testing WeCom manual send feature"
   - **From:** Your tutor account
   - **Target WeCom Group:** tutor_group
3. Click **Send to WeCom Group** button
4. Confirm when prompted
5. Check your WeCom tutor group - message should appear!

### Test Scenario 2: Message with Image

1. Create a message with:
   - **Subject:** "Photo Test"
   - **Message:** "Testing image attachment"
   - **Image Attachment:** Upload an image
   - **Target WeCom Group:** admin_group
2. Send via action button
3. Check WeCom admin group - should show news card with image!

### Test Scenario 3: Non-Admin User

1. Log out and log in as a regular tutor
2. Try to view a tutor message
3. **Verify:** The `target_wecom_group` field should be hidden
4. **Verify:** The "Send to WeCom Group" action should not appear

---

## Usage Workflow

### Sending a Quick Update

**Scenario:** You want to notify all tutors about an app update.

1. Go to **tutor_messages**
2. Click **+ New**
3. Fill in:
   - **From:** Your tutor account
   - **Subject:** "App Update Notice (v 1.001373)"
   - **Message:** "Sync speed improved by up to 60%"
   - **Category:** "Announcement"
   - **Priority:** "Normal"
   - **Target WeCom Group:** tutor_group
4. **Save**
5. Click **Send to WeCom Group**
6. **Confirm** → Done! ✅

### Sending to Multiple Groups

**Scenario:** You want to send the same message to both tutors and admins.

1. Create the message once
2. Set **Target WeCom Group:** tutor_group
3. Click **Send to WeCom Group** → Sent to tutors ✅
4. Edit the message
5. Change **Target WeCom Group:** admin_group
6. Click **Send to WeCom Group** again → Sent to admins ✅

The `wecom_sent_manually` field tracks that it was sent, but you can send multiple times to different groups.

### Sending with Images

**Scenario:** Share a classroom setup photo.

1. Create message with:
   - **Subject:** "New Classroom Layout"
   - **Message:** "Please review the new whiteboard arrangement"
   - **Image Attachment:** Upload photo
   - **Target WeCom Group:** tutor_group
2. Send → WeCom shows news card with image! 📸

---

## Advanced Filtering

### View Only Manually Sent Messages

Create a slice:

**Slice Name:** `Manually Sent WeCom Messages`

**Filter:**
```
[wecom_sent_manually] = TRUE
```

**Use case:** Audit trail of all manual sends.

### View Pending Messages

Create a slice:

**Slice Name:** `Ready to Send to WeCom`

**Filter:**
```
AND(
  NOT(ISBLANK([target_wecom_group])),
  [wecom_sent_manually] = FALSE
)
```

**Use case:** Draft messages waiting to be sent.

---

## Troubleshooting

### Action button not appearing

**Check:**
1. ✅ You're logged in with Super Admin role
2. ✅ Action accessibility condition: `USERROLE() = "Super Admin"`
3. ✅ Action is added to the view's action list

### "Target group is blank" error

**Fix:** Make sure you selected a target group before clicking Send.

**Better:** Update action condition to:
```
AND(
  USERROLE() = "Super Admin",
  NOT(ISBLANK([target_wecom_group]))
)
```

This prevents the button from appearing until group is selected.

### Webhook fails with 404

**Check:**
1. ✅ Webhook URL is correct in `wecom_webhooks` table
2. ✅ Group robot is still active in WeCom
3. ✅ Test webhook with PowerShell (see main WeCom guide)

### Message sent but not marked

**Check:**
1. ✅ Second action "Mark as Sent" is included in grouped action
2. ✅ Column names match exactly: `wecom_sent_manually`, `wecom_sent_manually_at`, `wecom_sent_manually_by`

### Image not showing in WeCom

**Check:**
1. ✅ Using `news` msgtype (not `text`)
2. ✅ Image uploaded to AppSheet (not external link)
3. ✅ `picurl` field in webhook body: `"picurl": "<<[image_attachment]>>"`

---

## Security Notes

### Why Super Admin Only?

**Reasons:**
- ✅ Prevents accidental spam to parent group
- ✅ Controls who can message external groups
- ✅ Maintains accountability (tracks who sent what)
- ✅ Prevents abuse of WeCom group messaging

### Audit Trail

Every manual send is tracked:
- **Who sent:** `wecom_sent_manually_by`
- **When sent:** `wecom_sent_manually_at`
- **What was sent:** Original message + target_group

**Query to see all manual sends:**
```sql
SELECT
    id,
    subject,
    message,
    target_wecom_group,
    wecom_sent_manually_by,
    wecom_sent_manually_at
FROM tutor_messages
WHERE wecom_sent_manually = TRUE
ORDER BY wecom_sent_manually_at DESC;
```

### Preventing Duplicate Sends

**Option 1: Hide action after sent**

Update action condition:
```
AND(
  USERROLE() = "Super Admin",
  NOT(ISBLANK([target_wecom_group])),
  [wecom_sent_manually] = FALSE
)
```

**Option 2: Allow re-sends**

Keep current setup - useful if you want to re-send to another group.

---

## Best Practices

### 1. Draft First, Send Later

Create messages without `target_wecom_group` set → saves as draft.

When ready to send → select target group → click Send.

### 2. Use Categories

Mark manual messages with appropriate categories:
- **Announcement** - General updates
- **Urgent** - Time-sensitive alerts
- **System** - App updates, maintenance

### 3. Preview Before Send

The confirmation dialog shows:
```
Send this message to tutor_group?
```

Always double-check:
- ✅ Message content is correct
- ✅ Target group is correct
- ✅ No typos

### 4. Keep a Log

Create a view filtered by `[wecom_sent_manually] = TRUE` to track all your manual sends.

---

## Comparison: Manual Action vs Auto Bot

### Manual Action (This Feature)

**Pros:**
- ✅ Full control - send when you want
- ✅ Choose target group each time
- ✅ No complex bot setup
- ✅ Great for ad-hoc updates

**Cons:**
- ❌ Requires manual trigger
- ❌ Can forget to send

**Best for:** App updates, urgent announcements, one-time messages

### Automated Bot (Phase 1)

**Pros:**
- ✅ Automatic - no human action needed
- ✅ Consistent schedule
- ✅ Never forgets

**Cons:**
- ❌ Fixed target group
- ❌ Requires bot configuration
- ❌ Runs on schedule only

**Best for:** Recurring reminders, automated notifications (fee renewals, attendance alerts)

### Recommendation

**Use both!**
- **Auto bots:** Recurring tasks (fee reminders, attendance)
- **Manual action:** Ad-hoc updates (app updates, urgent announcements)

---

## Quick Reference

### Action Condition
```
AND(
  USERROLE() = "Super Admin",
  NOT(ISBLANK([target_wecom_group])),
  NOT(ISBLANK([message]))
)
```

### Webhook URL
```
LOOKUP([target_wecom_group], "wecom_webhooks", "webhook_name", "webhook_url")
```

### News Format Body
```json
{
  "msgtype": "news",
  "news": {
    "articles": [{
      "title": "<<[subject]>>",
      "description": "<<[message]>>\n\nFrom: <<[from_tutor_id].[tutor_name]>>",
      "url": "<<APPLINK()>>",
      "picurl": "<<[image_attachment]>>"
    }]
  }
}
```

### Mark as Sent Fields
- `wecom_sent_manually` = TRUE
- `wecom_sent_manually_at` = NOW()
- `wecom_sent_manually_by` = USEREMAIL()

---

## Next Steps

After setting this up:

1. ✅ Test with simple text message
2. ✅ Test with image attachment
3. ✅ Test with different target groups
4. ✅ Create audit trail view
5. ✅ Train other Super Admins on usage
6. ✅ Document your message templates

---

## Related Documentation

- **Phase 1 Setup:** `docs/wecom-integration-guide.md`
- **Announcement Bot:** `docs/wecom-announcement-bot-setup.md`
- **Phase 2 Plan:** `docs/wecom-phase2-parent-messaging-plan.md`
- **Database Migration:** `database/migrations/024_add_manual_wecom_send.sql`
