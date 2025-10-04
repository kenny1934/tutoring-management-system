# WeCom Phase 2: Parent Customer Group Messaging - Research & Solutions

## Executive Summary

**Problem:** Send fee renewal messages from AppSheet to individual student parent customer groups (external WeChat users).

**Key Discovery:** Phase 1 webhook approach **DOES NOT work** for external customer groups. Webhooks only work for internal WeCom groups.

**Two Solutions Found:**
1. **Official WeCom API** - Complex setup, reliable, won't get banned
2. **WorkTool Bot** - Simple setup, ToS violation, ban risk

**Recommendation:** Start with MVP manual test using official API, then decide based on complexity vs. risk tolerance.

---

## Background: Why Phase 1 Approach Won't Work

### Phase 1 Recap (What Works)

✅ **Internal WeCom Groups:**
- Admin group (WeCom employees only)
- Tutor group (WeCom employees only)
- Uses: Group robot webhooks
- Method: `POST webhook_url` with JSON body
- Setup: 5 minutes, no backend needed

### Phase 2 Challenge (What Doesn't Work)

❌ **External Customer Groups:**
- Parent groups (WeChat users, not WeCom employees)
- Each student has their own parent customer group
- Group robot webhooks **NOT available** for external groups
- Requires: Official API or third-party automation

**Critical Difference:**
- Internal groups = WeCom to WeCom
- Customer groups = WeCom to WeChat (external contacts)

---

## Solution 1: Official WeCom API (Recommended)

### Overview

Use WeCom's External Contact API to send messages to customer groups.

**API Endpoint:** `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/add_msg_template`

**Official Docs:** https://developer.work.weixin.qq.com/document/path/93563

### Architecture

```
AppSheet → Webhook → Your Backend Server → WeCom API → Customer Group
```

**Components:**
1. **AppSheet:** Triggers webhook when renewal needed
2. **Backend Server:** Node.js/Python service (Cloud Function or VPS)
3. **WeCom API:** Official messaging endpoints
4. **Database:** Maps student_id → customer_group_chat_id

### Requirements

#### 1. WeCom Admin Configuration

**a) Create Internal Application:**
1. Go to WeCom Admin Panel → Applications
2. Create new self-built application
3. Get `corp_id` and `corp_secret`
4. Note down `agent_id`

**b) Configure Trusted Domain:**
- **What:** Your backend server's domain (e.g., `api.yourcompany.com`)
- **Why:** Required for web authorization and JS-SDK
- **Requirements:**
  - Must match your enterprise entity
  - Valid SSL certificate from trusted CA
  - Certificate status normal
  - Independent of protocol/path

**Example:**
```
Trusted Domain: api.csmpro.com
Certificate: Let's Encrypt (valid)
Issued to: *.csmpro.com
Status: ✅ Active
```

**c) Configure Trusted IP:**
- **What:** Your backend server's public IP address
- **Why:** Required for API authentication
- **CRITICAL:** IP can only be used by ONE WeCom enterprise
  - If shared (e.g., cloud provider), API calls will fail
  - Must be dedicated static IP

**Example:**
```
Trusted IP: 203.0.113.42
Server: DigitalOcean Droplet (dedicated)
Type: Static IPv4
```

**⚠️ Trap:** Don't use shared hosting IPs (Vercel, Netlify, etc.)

#### 2. Backend Server Setup

**Option A: Cloud Function (Simplest)**
- Google Cloud Functions
- AWS Lambda
- Azure Functions
- Cloudflare Workers

**Option B: VPS (More Control)**
- DigitalOcean Droplet ($6/month)
- Linode VPS
- AWS EC2
- Vultr

**Must Have:**
- Static public IP
- HTTPS endpoint
- Token storage (Redis/Database)
- Cron job for token refresh

#### 3. Database Schema Changes

**Add to `students` table:**
```sql
ALTER TABLE students
ADD COLUMN parent_wecom_group_chat_id VARCHAR(255) NULL COMMENT 'WeCom customer group chat ID for parents',
ADD COLUMN parent_wecom_group_name VARCHAR(255) NULL COMMENT 'Name of parent customer group for reference';

CREATE INDEX idx_students_wecom_group ON students(parent_wecom_group_chat_id);
```

**Why chat_id not group_id?**
- WeCom uses `chat_id` for customer groups in API calls
- Format: `wrOgQhDgAAcwMTB7YmDQbcJocOb2gGww`

#### 4. Authentication Flow

**Token Management:**

```javascript
// Pseudo-code
async function getAccessToken() {
  // Check if cached token is valid
  const cached = await redis.get('wecom_access_token');
  if (cached && !isExpired(cached)) {
    return cached.token;
  }

  // Request new token
  const response = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?` +
    `corpid=${CORP_ID}&corpsecret=${CORP_SECRET}`
  );

  const data = await response.json();

  // Cache for 2 hours (minus buffer)
  await redis.setex('wecom_access_token', 7000, data.access_token);

  return data.access_token;
}
```

**Token Lifecycle:**
- Expires every 2 hours
- Must refresh before expiry
- Store in Redis/database, not memory
- Include retry logic for failures

### Implementation Steps

#### Step 1: Get Customer Group Chat IDs

**Manual Method (MVP):**

1. Open WeCom desktop app
2. Go to Customers → Customer Groups
3. Right-click each parent group → Copy group link
4. Extract `chat_id` from URL

**API Method (Future):**

```bash
# Get all customer groups
curl -X GET \
  "https://qyapi.weixin.qq.com/cgi-bin/externalcontact/groupchat/list?access_token=ACCESS_TOKEN&offset=0&limit=100"
```

Response includes chat_id for each group.

#### Step 2: Map Students to Groups

**SQL:**
```sql
-- Update student with parent group
UPDATE students
SET parent_wecom_group_chat_id = 'wrOgQhDgAAcwMTB7YmDQbcJocOb2gGww',
    parent_wecom_group_name = 'Parent Group - Alice Wong'
WHERE student_name = 'Alice Wong';
```

**OR create mapping table:**
```sql
CREATE TABLE student_parent_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    wecom_group_chat_id VARCHAR(255) NOT NULL,
    wecom_group_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE KEY unique_student_group (student_id, wecom_group_chat_id)
);
```

#### Step 3: Create Backend Endpoint

**Node.js Example (Google Cloud Function):**

```javascript
const functions = require('@google-cloud/functions-framework');
const axios = require('axios');

functions.http('sendFeeMessage', async (req, res) => {
  try {
    // Verify request from AppSheet
    const { student_name, fee_message, chat_id } = req.body;

    // Get access token
    const token = await getAccessToken();

    // Send message to customer group
    const response = await axios.post(
      `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/add_msg_template?access_token=${token}`,
      {
        chat_type: "group",
        external_userid: [], // Leave empty for whole group
        sender: "SERVICE_USER_ID", // Your service account
        text: {
          content: fee_message
        },
        attachments: []
      }
    );

    // Log result
    console.log('Message sent:', response.data);

    res.json({ success: true, msgid: response.data.msgid });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

#### Step 4: Configure AppSheet

**Bot Webhook:**

**URL:**
```
https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/sendFeeMessage
```

**Body:**
```json
{
  "student_name": "<<[student_name]>>",
  "fee_message": "<<[_fee_message]>>",
  "chat_id": "<<[student_id].[parent_wecom_group_chat_id]>>"
}
```

**Condition:**
```
AND(
  [days_until_renewal] <= 7,
  NOT(ISBLANK([student_id].[parent_wecom_group_chat_id]))
)
```

### Costs

**Infrastructure:**
- Cloud Function: Free (first 2M invocations)
- OR VPS: $6-12/month (DigitalOcean)
- Domain + SSL: $10/year (Cloudflare free SSL)
- **Total: $0-15/month**

**Development Time:**
- Initial setup: 4-8 hours
- Testing: 2-4 hours
- **Total: 1 day**

### Pros & Cons

**Pros:**
- ✅ Official, won't violate ToS
- ✅ No account ban risk
- ✅ Reliable and supported
- ✅ Scales to thousands of groups
- ✅ Professional solution

**Cons:**
- ❌ Complex initial setup
- ❌ Requires backend server
- ❌ Needs trusted domain/IP config
- ❌ Ongoing maintenance (token refresh)
- ❌ Learning curve for API

### Risks

**Low Risk:**
- API changes (WeCom is stable)
- Rate limits (reasonable limits)

**Medium Risk:**
- Trusted IP conflicts (if using shared hosting)
- SSL certificate expiry (use auto-renewal)

---

## Solution 2: WorkTool Third-Party Bot

### Overview

Use WorkTool (worktool-wechat-bot) to automate WeCom via Android emulator.

**GitHub:** https://github.com/haodaohong/worktool-wechat-bot

### Architecture

```
AppSheet → Webhook → WorkTool SaaS → Android Emulator → WeCom App → Customer Group
```

**How It Works:**
1. Install WeCom app on Android emulator
2. Log in with your real WeCom account
3. WorkTool controls app via accessibility APIs
4. Exposes REST API for sending messages
5. You call API from AppSheet webhook

### Requirements

#### 1. Android Emulator

**Options:**
- **Cloud:** Genymotion Cloud ($10-30/month)
- **Local:** BlueStacks, NoxPlayer (free, but 24/7 PC)
- **VPS:** Android-x86 on VPS (complex)

**Specs:**
- Android 7.0+
- 2GB RAM minimum
- Accessibility API support

#### 2. WorkTool Setup

**Installation:**
```bash
# Clone repository
git clone https://github.com/haodaohong/worktool-wechat-bot.git

# Follow setup guide (Chinese docs)
# Install APK on emulator
# Configure accessibility permissions
```

**SaaS Platform:**
- Register for WorkTool cloud service
- Get `robot_id` and API key
- Link emulator to cloud account

#### 3. Database Schema

Same as Solution 1:
```sql
ALTER TABLE students
ADD COLUMN parent_wecom_group_chat_id VARCHAR(255) NULL;
```

OR use group name mapping if WorkTool uses names instead of chat_ids.

### Implementation Steps

#### Step 1: Setup Emulator & WorkTool

1. Install Android emulator
2. Install WeCom app in emulator
3. Log in with service account (NOT your main account)
4. Install WorkTool APK
5. Grant accessibility permissions
6. Link to WorkTool SaaS platform

#### Step 2: Get Group Identifiers

WorkTool may use:
- Group chat names
- OR chat_ids
- OR group numbers

Check API docs for format.

#### Step 3: Create Webhook Handler

**Simple Option:** Call WorkTool API directly from AppSheet

**AppSheet Webhook URL:**
```
https://worktool-api.example.com/api/send_group_message
```

**AppSheet Webhook Body:**
```json
{
  "robot_id": "YOUR_ROBOT_ID",
  "api_key": "YOUR_API_KEY",
  "group_name": "<<[student_id].[parent_wecom_group_name]>>",
  "message": "<<[_fee_message]>>"
}
```

**Better Option:** Add security layer

Create your own Cloud Function that:
1. Validates AppSheet request
2. Calls WorkTool API
3. Logs results

#### Step 4: Test & Monitor

- Send test message to one group
- Monitor emulator for issues
- Check for crashes/disconnects
- Set up health checks

### Costs

**Infrastructure:**
- Emulator (cloud): $10-30/month
- OR Emulator (local): $0 (but 24/7 PC)
- WorkTool SaaS: Unknown (check pricing)
- **Total: $10-50/month**

**Development Time:**
- Setup: 2-4 hours
- Testing: 2-4 hours
- **Total: 4-8 hours**

### Pros & Cons

**Pros:**
- ✅ No trusted domain/IP setup
- ✅ No token management
- ✅ Simple API calls
- ✅ Quick to implement
- ✅ Detailed docs (Chinese)

**Cons:**
- ❌ **Violates WeCom ToS**
- ❌ **Account ban risk**
- ❌ Reliability issues (emulator crashes)
- ❌ Security concern (third-party access)
- ❌ Single point of failure
- ❌ Not scalable (one emulator = one account)
- ❌ Requires 24/7 emulator runtime

### Risks

**High Risk:**
- **Account suspension** - WeCom detects automation
- **Data loss** - If banned, lose all customer contacts
- **Security breach** - Third-party has full WeCom access

**Medium Risk:**
- Emulator crashes (need monitoring)
- WorkTool service shutdown
- API changes breaking integration

**Legal Risk:**
- ToS violation could void WeCom enterprise contract
- Potential liability if parents' data exposed

---

## Comparison Matrix

| Factor | Official API | WorkTool |
|--------|-------------|----------|
| **Setup Complexity** | High (4-8 hours) | Medium (2-4 hours) |
| **Ongoing Maintenance** | Medium (token refresh) | High (emulator monitoring) |
| **Reliability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Ban Risk** | ❌ None | ⚠️ **HIGH** |
| **ToS Compliant** | ✅ Yes | ❌ **NO** |
| **Cost** | $0-15/month | $10-50/month |
| **Scalability** | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Security** | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Professional** | ✅ Yes | ❌ No |
| **Learning Curve** | Steep | Moderate |

---

## My Recommendation: Phased Approach

### Phase 2A: MVP Manual Test (Week 1)

**Goal:** Validate concept without full build

**Steps:**
1. ✅ Manually get ONE customer group's chat_id
2. ✅ Add to database for one test student
3. ✅ Create simple Cloud Function (copy-paste from examples)
4. ✅ Test with AppSheet action (manual trigger)
5. ✅ Send ONE test message

**Decision Point:**
- ✅ If works → Proceed to Phase 2B
- ❌ If too complex → Reconsider WorkTool

**Time:** 1 day
**Cost:** $0

### Phase 2B: Scale Official API (Week 2-3)

**If Phase 2A succeeds:**

1. ✅ Get all customer group chat_ids (script or manual)
2. ✅ Map all students to groups in database
3. ✅ Build full backend with error handling
4. ✅ Implement token refresh automation
5. ✅ Add logging and monitoring
6. ✅ Configure AppSheet bot for all enrollments

**Time:** 1-2 weeks
**Cost:** $0-15/month

### Phase 2C: WorkTool Fallback (Only If Desperate)

**Only consider if:**
- ❌ Official API test fails completely
- ❌ Trusted IP/domain issues unsolvable
- ✅ You accept account ban risk
- ✅ This is temporary solution

**Use throw-away test account, not production!**

---

## Implementation Priorities

### Must-Have (MVP)

1. ✅ Database field for customer group mapping
2. ✅ Backend endpoint (basic function)
3. ✅ Token management (can be manual refresh initially)
4. ✅ AppSheet webhook integration
5. ✅ Error logging

### Nice-to-Have (V2)

1. Auto-sync customer groups from WeCom API
2. Message templates with variables
3. Delivery confirmation tracking
4. Admin dashboard for sent messages
5. Retry logic for failed sends

### Future Enhancements

1. Individual parent messaging (not group)
2. Two-way communication (receive replies)
3. Rich media (images, files)
4. Multiple message types (renewal, attendance, progress)

---

## Next Steps

### Immediate Actions (This Week)

**1. Database Migration**
```sql
-- Add customer group mapping
ALTER TABLE students
ADD COLUMN parent_wecom_group_chat_id VARCHAR(255) NULL COMMENT 'WeCom customer group chat ID',
ADD COLUMN parent_wecom_group_name VARCHAR(255) NULL COMMENT 'Group name for reference';
```

**2. Get WeCom Credentials**
- [ ] Log into WeCom Admin Panel
- [ ] Create internal application
- [ ] Copy corp_id and corp_secret
- [ ] Note agent_id

**3. Manual Test**
- [ ] Get ONE parent group's chat_id
- [ ] Update one student record in database
- [ ] Create test Cloud Function (I can provide code)
- [ ] Send test message

### Decision Point (End of Week)

**If test succeeds:**
→ Continue with official API implementation

**If test fails:**
→ Analyze what went wrong
→ Consider if WorkTool is acceptable risk
→ OR keep Phase 1 (tutor group only) and manually message parents

---

## Code Samples

### Sample Cloud Function (Node.js)

```javascript
// index.js
const functions = require('@google-cloud/functions-framework');
const axios = require('axios');

// Configuration
const CORP_ID = process.env.WECOM_CORP_ID;
const CORP_SECRET = process.env.WECOM_CORP_SECRET;

// In-memory cache (use Redis in production)
let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  // Return cached token if valid
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  // Fetch new token
  const response = await axios.get(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken`,
    { params: { corpid: CORP_ID, corpsecret: CORP_SECRET } }
  );

  if (response.data.errcode !== 0) {
    throw new Error(`Token error: ${response.data.errmsg}`);
  }

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + (7000 * 1000); // 7000 seconds

  return accessToken;
}

functions.http('sendFeeMessage', async (req, res) => {
  // Enable CORS for AppSheet
  res.set('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  try {
    const { student_name, fee_message, chat_id } = req.body;

    // Validate inputs
    if (!chat_id || !fee_message) {
      return res.status(400).json({
        success: false,
        error: 'Missing chat_id or fee_message'
      });
    }

    // Get access token
    const token = await getAccessToken();

    // Send message to customer group
    const response = await axios.post(
      `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/add_msg_template?access_token=${token}`,
      {
        chat_type: "group",
        external_userid: [],
        sender: "YOUR_SERVICE_USER_ID",
        text: {
          content: fee_message
        },
        attachments: []
      }
    );

    console.log('WeCom API response:', response.data);

    if (response.data.errcode !== 0) {
      throw new Error(`WeCom API error: ${response.data.errmsg}`);
    }

    res.json({
      success: true,
      msgid: response.data.msgid,
      fail_list: response.data.fail_list || []
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Deploy Command

```bash
gcloud functions deploy sendFeeMessage \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars WECOM_CORP_ID=your_corp_id,WECOM_CORP_SECRET=your_secret \
  --region asia-east1
```

### AppSheet Webhook Configuration

**URL:**
```
https://asia-east1-your-project.cloudfunctions.net/sendFeeMessage
```

**Body:**
```json
{
  "student_name": "<<[student_name]>>",
  "fee_message": "<<[_fee_message]>>",
  "chat_id": "<<[student_id].[parent_wecom_group_chat_id]>>"
}
```

---

## FAQ

### Q: Can I use AppSheet's webhook directly without backend?

**A:** No. WeCom API requires:
- Access token that expires every 2 hours
- Server-side token management
- CORS headers
- IP address whitelisting

AppSheet webhooks can't handle these requirements.

### Q: What if I don't have a static IP?

**A:** Options:
1. Use Cloud Functions (Google, AWS, Azure provide static IPs)
2. Use VPS with dedicated IP ($6/month)
3. Use WorkTool (no IP requirement, but risky)

### Q: Is WorkTool legal?

**A:** Technically violates WeCom ToS (unauthorized automation). Not recommended for production.

### Q: How do I get all customer group chat_ids?

**A:** Two methods:
1. **Manual:** Right-click each group → Copy link → Extract chat_id
2. **API:** Call `externalcontact/groupchat/list` endpoint

### Q: What if a parent leaves the group?

**A:** WeCom API will return error for that user. Your backend should:
- Log the failure
- Continue sending to other group members
- Alert you to update database

### Q: Can parents reply to fee messages?

**A:** Not with this MVP. Replies go to regular group chat. Two-way messaging requires additional API setup (Phase 3).

---

## Resources

### Official Documentation
- WeCom Developer Center: https://developer.work.weixin.qq.com/
- External Contact API: https://developer.work.weixin.qq.com/document/path/92698
- Customer Group Messaging: https://developer.work.weixin.qq.com/document/path/93563

### Code Examples
- Node.js: https://github.com/Juicern/WecomMessageIntegration
- Python: https://github.com/loonghao/wecom-bot-mcp-server

### WorkTool
- GitHub: https://github.com/haodaohong/worktool-wechat-bot
- (Docs in Chinese)

### Cloud Platforms
- Google Cloud Functions: https://cloud.google.com/functions
- AWS Lambda: https://aws.amazon.com/lambda/
- DigitalOcean: https://www.digitalocean.com/

---

## Conclusion

**Recommended Path:**

1. ✅ **Start with MVP test** (1 day, $0)
2. ✅ **If successful, build official API** (1-2 weeks, $0-15/month)
3. ❌ **Avoid WorkTool for production** (ban risk too high)

**Why Official API Despite Complexity:**
- Professional solution
- No account risk
- Scales properly
- One-time setup pain, long-term reliability

**When to Consider WorkTool:**
- Official API test completely fails
- Temporary solution only
- Use throw-away test account
- Accept risk of losing that account

---

## Support

For implementation help:
1. Check `docs/wecom-phase2-parent-messaging-plan.md` for original plan
2. Review Phase 1 docs for webhook examples
3. Test with one student first
4. Iterate based on results

**Next document:** MVP test implementation guide (once you decide to proceed)
