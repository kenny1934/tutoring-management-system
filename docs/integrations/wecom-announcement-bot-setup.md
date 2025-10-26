# WeCom Announcement Bot Setup Guide

## Overview

This bot automatically forwards messages from the AppSheet `tutor_messages` table (with category = "Announcement") to your WeCom tutor group.

---

## AppSheet Bot Configuration

### Step 1: Create the Bot

1. Open your AppSheet app
2. Go to **Automation** → **Bots**
3. Click **New Bot**
4. Name: `WeCom Announcement Forwarder`
5. Description: `Automatically sends announcement messages to WeCom tutor group`

### Step 2: Configure Event

**Event Settings:**
- **Event:** Data Change
- **Table:** tutor_messages
- **Change Type:** Adds only (trigger when new message is created)
- **Condition:**
  ```
  [category] = "Announcement"
  ```

### Step 3: Add Process/Task

1. Click **Add a step**
2. Choose **Run a task**
3. Select **Call a webhook**

### Step 4: Webhook Configuration

**Webhook Settings:**

**URL:**
```
LOOKUP("tutor_group", "wecom_webhooks", "webhook_name", "webhook_url")
```

**HTTP Verb:** POST

**HTTP Headers:**
Leave blank (AppSheet auto-adds Content-Type for JSON) OR enter:
```
Content-Type: application/json
```
**Do NOT use JSON format `{ }` for headers - use plain text only!**

**Body (choose one of the formats below):**

---

## Message Format Options

### Format 1: News Article with Image (RECOMMENDED) ⭐

**Best for:** Announcements with or without images, professional card appearance, supports AppSheet image attachments

**Why recommended:**
- ✅ Supports images via direct URL (no base64 conversion needed!)
- ✅ Works with AppSheet's `image_attachment` field directly
- ✅ Beautiful card-like appearance in WeCom
- ✅ Clickable - links to your AppSheet app
- ✅ Handles text-only announcements gracefully

**JSON Body:**
```json
{
  "msgtype": "news",
  "news": {
    "articles": [{
      "title": "<<[subject]>>",
      "description": "<<[message]>>\n\nFrom: <<[from_tutor_id].[tutor_name]>> | Priority: <<[priority]>> | Posted: <<TEXT([created_at], 'MMM DD HH:mm')>>",
      "url": "https://www.appsheet.com/start/YOUR_APP_ID",
      "picurl": "<<[image_attachment]>>"
    }]
  }
}
```

**Preview (with image):**
```
┌─────────────────────────────────────────┐
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │   [Classroom Setup Image]       │   │
│  │        1068 x 455               │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  New Classroom Setup                    │
│                                         │
│  Please see the new whiteboard          │
│  arrangement in Room 3. All tutors      │
│  should review before Monday classes.   │
│                                         │
│  From: Sarah Johnson | Priority: High  │
│  Posted: Jan 15 14:30                  │
│                                         │
│  [Tap to open in AppSheet] ──────────► │
└─────────────────────────────────────────┘
```

**Preview (without image):**
```
┌─────────────────────────────────────────┐
│  Office Closed Tomorrow                 │
│                                         │
│  Please note that the office will be   │
│  closed tomorrow for maintenance. All  │
│  classes will be conducted online via  │
│  Zoom.                                 │
│                                         │
│  From: Admin | Priority: Urgent        │
│  Posted: Jan 15 09:00                  │
│                                         │
│  [Tap to open in AppSheet] ──────────► │
└─────────────────────────────────────────┘
```

**Image Requirements:**
- Format: JPG or PNG
- Recommended size: 1068×455 (large) or 150×150 (small)
- AppSheet image URLs work directly as `picurl`
- If no image, leave `picurl` empty (card shows text only)

**Field Limits:**
- Title: Max 128 bytes (auto-truncated)
- Description: Max 512 bytes (auto-truncated)
- Can send 1-8 articles per message

---

### Format 2: Ultimate Template Card with Image & Deep Links (MOST POWERFUL) 🔥

**Best for:** Maximum features - images, color-coding, clickable cards, direct thread links

**Why most powerful:**
- ✅ Full-width card image support via `card_image`
- ✅ Priority-based color coding (red/orange/grey)
- ✅ Entire card clickable via `card_action` with deep links
- ✅ Deep links directly to message thread (not just app home)
- ✅ Professional quote area for message content
- ✅ Emphasis field for priority display
- ✅ Works with AppSheet's `image_attachment` field

**JSON Body:**
```json
{
  "msgtype": "template_card",
  "template_card": {
    "card_type": "news_notice",
    "card_image": {
      "url": "<<[image_attachment]>>",
      "aspect_ratio": 2.25
    },
    "source": {
      "desc": "CSM Pro - Announcements",
      "desc_color": <<IF([priority] = "Urgent", 1, IF([priority] = "High", 2, 0))>>
    },
    "main_title": {
      "title": "<<IF([priority] = 'Urgent', '🔴 ', IF([priority] = 'High', '🟠 ', ''))>><<[subject]>>",
      "desc": "From: <<[from_tutor_id].[tutor_name]>>"
    },
    "emphasis_content": {
      "title": "<<[priority]>>",
      "desc": "Priority"
    },
    "quote_area": {
      "type": 1,
      "quote_text": "<<[message]>>"
    },
    "sub_title_text": "Posted: <<TEXT([created_at], 'MMM DD HH:mm')>>",
    "card_action": {
      "type": 1,
      "url": "<<LINKTOFILTEREDVIEW(\"Thread View\", [_thread_root_id] = [_THISROW].[_thread_root_id])>>"
    }
  }
}
```

**Visual Preview (with image):**
```
┌─────────────────────────────────────────┐
│ 🟠 CSM Pro - Announcements             │  ← ORANGE (High priority)
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │   [Classroom Setup Image]       │   │
│  │        Full width banner        │   │
│  │         Aspect ratio 2.25       │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🟠 New Classroom Setup                 │
│  From: Sarah Johnson                    │
│                                         │
│  ┌─────────────┐                       │
│  │    High     │  Priority             │
│  └─────────────┘                       │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Please see the new whiteboard   │   │
│  │ arrangement in Room 3. All      │   │
│  │ tutors should review before     │   │
│  │ Monday classes.                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Posted: Jan 15 14:30                  │
│                                         │
│  [Entire card is clickable] ──────────►│
└─────────────────────────────────────────┘
```

**Visual Preview (without image - Urgent):**
```
┌─────────────────────────────────────────┐
│ 🔴 CSM Pro - Announcements             │  ← RED (Urgent priority)
├─────────────────────────────────────────┤
│                                         │
│  🔴 Emergency: System Maintenance       │
│  From: IT Team                          │
│                                         │
│  ┌─────────────┐                       │
│  │   Urgent    │  Priority             │
│  └─────────────┘                       │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ System will be down from 2-4pm  │   │
│  │ for urgent maintenance. Please  │   │
│  │ reschedule any classes.         │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Posted: Jan 15 13:45                  │
│                                         │
│  [Entire card is clickable] ──────────►│
└─────────────────────────────────────────┘
```

**Features:**
- **card_image**: Displays AppSheet image at top (leave field empty for text-only)
- **aspect_ratio**: 2.25 creates wide banner (adjust to 1.3 for more square)
- **desc_color**: Auto-colors based on priority (0=grey, 1=red, 2=orange)
- **card_action**: Makes entire card tappable - opens directly to message thread
- **Deep links**: `LINKTOFILTEREDVIEW` opens directly to message thread, not app home

**Image Requirements:**
- Format: JPG or PNG
- Recommended sizes:
  - 2.25 aspect ratio: 900×400 pixels (wide banner)
  - 1.3 aspect ratio: 650×500 pixels (more square)
- If `image_attachment` is empty, card displays without image section
- Max file size: Usually 2MB for WeCom

**Note:** `jump_list` (button options) are not included because AppSheet's `LINKTOFILTEREDVIEW` URLs exceed WeCom's 1024 character limit. The entire card is clickable via `card_action` instead.

---

### Format 3: Simple Text (Recommended for Testing)

**Best for:** Quick setup, guaranteed to work, supports @mentions

**JSON Body:**
```json
{
  "msgtype": "text",
  "text": {
    "content": "📢 ANNOUNCEMENT\n\nFrom: <<[from_tutor_id].[tutor_name]>>\nSubject: <<[subject]>>\nPriority: <<[priority]>>\n\n<<[message]>>\n\nPosted: <<TEXT([created_at], 'MMM DD HH:mm')>>",
    "mentioned_list": ["@all"]
  }
}
```

**Preview:**
```
📢 ANNOUNCEMENT

From: Sarah Johnson
Subject: Office Closed Tomorrow
Priority: High

Please note that the office will be closed tomorrow for maintenance. All classes will be conducted online via Zoom.

Posted: Jan 15 14:30
@all
```

---

### Format 4: Markdown (Better Formatting)

**Best for:** Professional look with headers and formatting

**JSON Body:**
```json
{
  "msgtype": "markdown",
  "markdown": {
    "content": "## 📢 Announcement\n\n**From:** <<[from_tutor_id].[tutor_name]>>\n**Subject:** <<[subject]>>\n**Priority:** <<[priority]>>\n\n---\n\n<<[message]>>\n\n---\n\n*Posted at <<TEXT([created_at], 'MMM DD, YYYY HH:mm')>>*"
  }
}
```

**Preview:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━
📢 Announcement

From: Sarah Johnson
Subject: Office Closed Tomorrow
Priority: High

───────────────────────────

Please note that the office will be closed tomorrow for maintenance. All classes will be conducted online via Zoom.

───────────────────────────

Posted at Jan 15, 2025 14:30
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Format 5: Template Card (Text-Only, No Image)

**Best for:** Maximum visual impact, interactive elements

**JSON Body:**
```json
{
  "msgtype": "template_card",
  "template_card": {
    "card_type": "text_notice",
    "source": {
      "desc": "CSM Pro - Tutor Messages",
      "desc_color": 0
    },
    "main_title": {
      "title": "<<[subject]>>",
      "desc": "From: <<[from_tutor_id].[tutor_name]>>"
    },
    "emphasis_content": {
      "title": "<<[priority]>>",
      "desc": "Priority Level"
    },
    "quote_area": {
      "type": 1,
      "quote_text": "<<[message]>>"
    },
    "sub_title_text": "Posted: <<TEXT([created_at], 'MMM DD, YYYY HH:mm')>>",
    "horizontal_content_list": [
      {
        "keyname": "Category",
        "value": "<<[category]>>"
      },
      {
        "keyname": "From",
        "value": "<<[from_tutor_id].[tutor_name]>>"
      }
    ]
  }
}
```

**Visual Preview:**

```
┌─────────────────────────────────────────┐
│ CSM Pro - Tutor Messages                │
├─────────────────────────────────────────┤
│                                         │
│  Office Closed Tomorrow                 │
│  From: Sarah Johnson                    │
│                                         │
│  ┌─────────────┐                       │
│  │    High     │  Priority Level       │
│  └─────────────┘                       │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Please note that the office     │   │
│  │ will be closed tomorrow for     │   │
│  │ maintenance. All classes will   │   │
│  │ be conducted online via Zoom.   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Category: Announcement                 │
│  From: Sarah Johnson                    │
│                                         │
│  Posted: Jan 15, 2025 14:30            │
└─────────────────────────────────────────┘
```

---

### Format 6: Template Card with Color-Coded Priority (Text-Only)

**Best for:** Urgent messages that need attention

**JSON Body:**
```json
{
  "msgtype": "template_card",
  "template_card": {
    "card_type": "text_notice",
    "source": {
      "icon_url": "https://wework.qpic.cn/wwpic/252813_jOfDHtcISzuodLa_1629280209/0",
      "desc": "CSM Pro Announcements",
      "desc_color": <<IF([priority] = "Urgent", 1, IF([priority] = "High", 2, 0))>>
    },
    "main_title": {
      "title": "<<IF([priority] = 'Urgent', '🔴 ', IF([priority] = 'High', '🟠 ', ''))>><<[subject]>>",
      "desc": "<<[from_tutor_id].[tutor_name]>>"
    },
    "emphasis_content": {
      "title": "<<[priority]>>",
      "desc": "Priority"
    },
    "quote_area": {
      "type": 1,
      "quote_text": "<<[message]>>"
    },
    "sub_title_text": "<<TEXT([created_at], 'MMM DD, YYYY HH:mm')>>"
  }
}
```

**Color Legend:**
- **desc_color: 0** = Grey (Normal priority)
- **desc_color: 1** = Red (Urgent priority)
- **desc_color: 2** = Orange/Yellow (High priority)
- **desc_color: 3** = Green (info/success)

**Preview (Urgent Priority):**

```
┌─────────────────────────────────────────┐
│ 🔴 CSM Pro Announcements               │  ← RED
├─────────────────────────────────────────┤
│                                         │
│  🔴 Emergency: System Maintenance       │
│  Sarah Johnson                          │
│                                         │
│  ┌─────────────┐                       │
│  │   Urgent    │  Priority             │
│  └─────────────┘                       │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ System will be down from 2-4pm  │   │
│  │ for urgent maintenance. Please  │   │
│  │ reschedule any classes during   │   │
│  │ this time.                      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Jan 15, 2025 13:45                    │
└─────────────────────────────────────────┘
```

---

## Step 5: Save and Test

1. Click **Save** in AppSheet
2. Test the bot by creating a new message:
   - Go to tutor_messages table
   - Create new entry:
     - **From:** Your user
     - **Category:** Announcement
     - **Subject:** Test Announcement
     - **Message:** This is a test message
     - **Priority:** Normal
3. Check your WeCom tutor group - message should appear immediately!

---

## Troubleshooting

### Bot not triggering
- Check bot is **enabled** in AppSheet
- Verify condition: `[category] = "Announcement"` (case sensitive)
- Check execution log in AppSheet → Automation → Bots → View Runs

### Message not appearing in WeCom
- Verify webhook URL is correct in database
- Test webhook URL directly with PowerShell (see main guide)
- Check WeCom group robot is still active
- Check AppSheet webhook response in execution log

### Formatting issues
- Start with Format 1 (simple text) to verify webhook works
- Then upgrade to Format 2 (markdown) or Format 3 (template card)
- Template cards require exact JSON structure - check for syntax errors

### Priority colors not working
- Verify priority field values exactly match: "Normal", "High", "Urgent"
- Check the IF statement syntax in AppSheet
- Template card desc_color only accepts integers 0-3

---

## Advanced: Track Sent Status

To track which announcements were sent to WeCom, add a tracking field:

### Database Migration:

```sql
ALTER TABLE tutor_messages
ADD COLUMN wecom_sent BOOLEAN DEFAULT FALSE COMMENT 'Sent to WeCom group',
ADD COLUMN wecom_sent_at TIMESTAMP NULL COMMENT 'When sent to WeCom';
```

### Update AppSheet Bot:

Add a second step after the webhook:

**Step 2: Mark as Sent**
- **Action Type:** Data: set the values of some columns in this row
- **Set values:**
  - `wecom_sent = TRUE`
  - `wecom_sent_at = NOW()`

### Update Bot Condition:

Change condition to:
```
AND(
  [category] = "Announcement",
  [wecom_sent] = FALSE
)
```

This prevents duplicate sends if the row is edited later.

---

## Recommended Configuration

**For most users, I recommend:**

1. **Start with Format 3 (Simple Text)** - guaranteed to work, verify webhook is functioning
2. **Upgrade to Format 1 (News)** ⭐ **RECOMMENDED** - best balance of features:
   - ✅ Image support via picurl
   - ✅ Larger text limits (512 bytes description)
   - ✅ Clickable cards with deep links
   - ✅ Professional card appearance
   - ✅ No complex text length restrictions
3. **Alternative: Format 2 (Template Card)** - fancier look but has strict text limits on quote_area (not suitable for longer announcements)

**Format 1 (News) is the BEST choice for announcements** - it supports images, has reasonable text limits, and looks professional!

---

## Example Messages

### Normal Priority
```json
Subject: "Weekly Schedule Update"
Priority: "Normal"
Message: "Next week's schedule has been updated. Please check AppSheet for any changes to your assigned classes."
```
→ Grey card with standard formatting

### High Priority
```json
Subject: "Payment Deadline Reminder"
Priority: "High"
Message: "Reminder: All fee collection must be completed by Friday. Please follow up with outstanding payments."
```
→ Orange/yellow card with 🟠 indicator

### Urgent Priority
```json
Subject: "Emergency: Typhoon Warning"
Priority: "Urgent"
Message: "All classes are cancelled today due to typhoon signal 8. Stay safe and check your email for updates."
```
→ Red card with 🔴 indicator and @all mention