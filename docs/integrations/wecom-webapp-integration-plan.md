# WeCom Webapp Integration Plan

## Overview

This document outlines the WeCom messaging integration roadmap for the CSM Pro webapp (FastAPI + Next.js). It supersedes the older AppSheet-era planning docs.

**Phases:**
- **Phase 1A** (Done): Send messages to internal WeCom groups via webhooks
- **Phase 1B** (Blocked): Send messages to individual WeCom users (tutors)
- **Phase 2** (Blocked): Send messages to parent customer groups (WeChat users)

> **ICP Filing Blocker (Feb 2026):** Phases 1B and 2 require the WeCom official API, which
> requires a trusted IP, which requires either a trusted domain or a receiving message server
> URL. Both paths require **domain ICP filing** (备案) where the filing entity matches the
> WeCom organization entity. Our domain (`mathconceptsecondary.academy`) has no ICP filing
> because the company is a Macau entity — mainland China ICP filing is not available to
> overseas companies. There is no technical workaround. Phases 1B and 2 are blocked until
> either: (a) we acquire a domain with matching ICP filing via a mainland partner, or
> (b) WeCom relaxes this requirement for overseas entities. A GCE VM proxy and setup guide
> were prepared (`docs/integrations/wecom-vm-setup-guide.md`) and can be redeployed in
> ~30 minutes if the blocker is resolved.

---

## Current State: Phase 1A (Complete)

Internal group messaging via webhook robots, operated from the webapp UI.

**What's built:**

| Layer | What | Location |
|---|---|---|
| Database | `wecom_webhooks`, `wecom_message_log` tables | Migration 023, 024 |
| Backend | Webhook CRUD, send text/markdown/image, message log | `webapp/backend/routers/wecom.py` |
| Frontend | SendToWecomModal, WecomRichEditor, HTML→WeCom markdown | `webapp/frontend/components/wecom/` |
| API | `wecomAPI` object with all endpoints | `webapp/frontend/lib/api.ts` |

**How it works:**
```
Admin (webapp UI) → Cloud Run Backend → POST webhook URL → WeCom Group Robot → Group Chat
```

No WeCom API authentication needed — webhooks are simple POST requests with a secret key in the URL.

**Limitations:**
- Webhooks only work for **internal** WeCom groups (employees only)
- Cannot message individual users
- Cannot reach external customer groups (parents on WeChat)

---

## Phase 1B: Individual Tutor Messaging

### Goal

Admin composes a message in the webapp and sends it to a specific tutor's WeCom app as a private notification. Later, extend to automated notifications (e.g. "attendance not marked").

### Why Webhooks Won't Work

Group robot webhooks broadcast to an entire group. To message a specific person, you need the WeCom Application Message API.

### WeCom API

**Endpoint:** `POST https://qyapi.weixin.qq.com/cgi-bin/message/send`

**Requires:**
- `access_token` (from `gettoken` API, expires every 2 hours)
- `touser` — the recipient's `wecom_userid`
- `agentid` — your internal application's ID
- Message content (text, markdown, textcard, etc.)

**Example request:**
```json
{
  "touser": "tutor.john",
  "msgtype": "text",
  "agentid": 1000002,
  "text": {
    "content": "Reminder: Alice Wong's attendance for today is not yet marked."
  }
}
```

### Infrastructure Requirement: Static IP

All WeCom API calls must originate from a **trusted static IP** registered in the WeCom admin panel. Cloud Run does not provide a static egress IP.

**Solution:** A lightweight GCE VM (free tier) acts as a proxy between Cloud Run and the WeCom API. See `docs/integrations/wecom-vm-setup-guide.md` for setup.

### Architecture

```
Webapp UI → Cloud Run Backend (FastAPI)
                    │
                    │  POST /proxy/message/send
                    │  (with X-API-Key header)
                    ▼
            GCE VM (Python proxy)
                    │
                    │  WeCom API call
                    │  (from trusted static IP)
                    ▼
              WeCom API Server
                    │
                    ▼
          Tutor's WeCom App (notification)
```

### What Needs to Be Built

**VM proxy service** (new, deployed on GCE VM):
- Lightweight Python/FastAPI app
- Token management: fetch from WeCom, cache in memory with 2-hour expiry
- Endpoint: `POST /proxy/message/send` — validates API key, gets token, calls WeCom
- Endpoint: `GET /health` — for monitoring
- Config via env vars: `WECOM_CORP_ID`, `WECOM_CORP_SECRET`, `WECOM_AGENT_ID`, `API_KEY`

**Cloud Run backend changes** (`webapp/backend/`):
- New env var: `WECOM_PROXY_URL` (pointing to VM)
- New env var: `WECOM_PROXY_API_KEY` (shared secret)
- New endpoint: `POST /api/wecom/send-individual`
  - Accepts: target tutor ID, message type, content
  - Resolves tutor → `wecom_userid`
  - Calls VM proxy
  - Logs to `wecom_message_log`

**Frontend changes** (`webapp/frontend/`):
- Extend SendToWecomModal or create variant with tutor selector dropdown
- Show only tutors who have `wecom_userid` populated
- Reuse existing rich text editor and message formatting

### Database

Already have:
- `tutors.wecom_userid` column (migration 023) — just needs populating with actual user IDs
- `wecom_message_log` table — works as-is for logging individual messages

---

## Phase 2: Parent Customer Group Messaging

### Goal

Send fee reminders and announcements to per-student parent customer groups. These groups contain external WeChat contacts (parents), not WeCom employees.

### Why Webhooks Won't Work

Group robot webhooks are **not available** for external customer groups (WeCom-to-WeChat groups). Only the official WeCom External Contact API can reach these groups.

### WeCom API

**Endpoint:** `POST https://qyapi.weixin.qq.com/cgi-bin/appchat/send`

Or for mass-send templates:
`POST https://qyapi.weixin.qq.com/cgi-bin/externalcontact/add_msg_template`

**Requires:** Same `access_token` and trusted IP as Phase 1B, plus each group's `chat_id`.

### What's Needed Beyond Phase 1B

Phase 2 builds on the same VM proxy infrastructure. Additional work:

**Database:**
- Migration 025 (already written, not yet run) adds `parent_wecom_group_chat_id`, `parent_wecom_group_name`, `wecom_group_updated_at` to `students` table
- Need to populate `chat_id` values — manually from WeCom desktop, or via API

**VM proxy:**
- Add endpoint: `POST /proxy/appchat/send` or `POST /proxy/externalcontact/add_msg_template`
- Same token management (already built for Phase 1B)

**Cloud Run backend:**
- New endpoint: `POST /api/wecom/send-to-parent-group`
- Resolves student → `parent_wecom_group_chat_id`
- Rate limiting awareness (WeCom: 20 messages/minute)

**Frontend:**
- Student/group selector UI
- Message templates for fee reminders (could pre-fill from existing fee message logic)
- Batch send support (select multiple students)

### Rate Limiting

WeCom allows ~20 API messages per minute. For batch sends:
- Queue messages and send with delays
- Show progress in the UI
- Log success/failure per student

---

## Prerequisites (Manual Steps)

These must be done before any code work:

### 1. Create WeCom Internal Application

1. Log into WeCom Admin Panel (admin.work.weixin.qq.com)
2. Go to **Applications** → **Self-built** → **Create Application**
3. Set name: `CSM Pro Notifications`
4. Note down:
   - `corp_id` (same for all apps in your WeCom organization)
   - `corp_secret` (specific to this application)
   - `agent_id` (the application's numeric ID)

### 2. Set Up GCE VM with Static IP

Follow `docs/integrations/wecom-vm-setup-guide.md` to:
- Create e2-micro VM in `us-west1` (free tier)
- Reserve static external IP
- Configure firewall and deploy Python proxy

### 3. Configure WeCom Trusted IP

1. In WeCom Admin Panel → Your application → **Trusted IP**
2. Add the VM's static IP address
3. Wait 5-10 minutes for propagation

### 4. Populate Tutor WeCom User IDs

For each tutor, find their WeCom user ID:
1. WeCom Admin Panel → **Contacts** → **Members**
2. Find each tutor, copy their User ID

Update database:
```sql
UPDATE tutors SET wecom_userid = 'john.smith' WHERE tutor_name = 'John Smith';
UPDATE tutors SET wecom_userid = 'jane.doe' WHERE tutor_name = 'Jane Doe';
-- Repeat for all tutors
```

---

## What's Already Built (Reusable)

| Asset | Location | Reuse For |
|---|---|---|
| Webhook management + send endpoints | `webapp/backend/routers/wecom.py` | Extend for API messaging |
| Message log table + audit trail | `wecom_message_log` (migration 023) | Log all message types |
| `wecom_userid` column on tutors | Migration 023 | Phase 1B — just populate |
| Parent group columns on students | Migration 025 (written, not run) | Phase 2 |
| Rich text editor | `components/wecom/WecomRichEditor.tsx` | All phases |
| HTML → WeCom markdown converter | `components/wecom/htmlToWecomMarkdown.ts` | All phases |
| Send modal UI | `components/wecom/SendToWecomModal.tsx` | Extend for new targets |
| Frontend API client | `webapp/frontend/lib/api.ts` (`wecomAPI`) | Extend |
| Frontend types | `webapp/frontend/types/index.ts` | Extend |

---

## Implementation Order

```
1. VM setup (manual)           ─── You
2. WeCom app + trusted IP      ─── You
3. Populate tutor wecom_userid  ─── You
4. Python proxy service         ─── Code
5. Backend: send-individual     ─── Code
6. Frontend: tutor selector     ─── Code
7. Test Phase 1B end-to-end     ─── Together
8. Run migration 025            ─── You
9. Populate parent chat_ids     ─── You
10. Backend: send-to-parent     ─── Code
11. Frontend: student selector  ─── Code
12. Test Phase 2 end-to-end     ─── Together
```

Steps 1-3 are prerequisites. Steps 4-7 are Phase 1B. Steps 8-12 are Phase 2.

---

## Reference: Old Planning Docs

These docs were written for the AppSheet + Node.js era. They contain useful WeCom API research but the implementation details are outdated:

- `wecom-integration-guide.md` — Phase 1 AppSheet bot setup (internal groups)
- `wecom-phase2-research-and-solutions.md` — WeCom API research (still relevant)
- `wecom-phase2-parent-messaging-plan.md` — Phase 2 AppSheet bot plan (outdated)
- `wecom-phase2-google-cloud-setup.md` — VM setup for Node.js (superseded by `wecom-vm-setup-guide.md`)
- `wecom-announcement-bot-setup.md` — AppSheet announcement bot (outdated)
- `wecom-manual-send-action-setup.md` — AppSheet manual send (outdated)
- `backend/wecom-api/server.js` — Node.js reference implementation (logic ported to Python)
