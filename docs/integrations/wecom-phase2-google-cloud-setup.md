# WeCom Phase 2: Google Cloud Setup Guide

## Your Situation

✅ **You have:**
- Google Workspace domain
- WeCom app created (corp_id, corp_secret)
- Access to WeCom admin panel

❌ **You need:**
- Static IP address for trusted IP configuration
- Backend server to host WeCom API integration
- Trusted domain configuration

**This guide solves everything using Google Cloud Free Tier!**

---

## Solution Overview

We'll use **Google Cloud Compute Engine** (free tier) to get:
- ✅ Static external IP address (for WeCom trusted IP)
- ✅ Free e2-micro VM (your backend server)
- ✅ Your Google Workspace domain (for trusted domain)

**Cost:** $0/month (within free tier limits)

---

## Part 1: Setup Google Cloud VM (15 minutes)

### Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Sign in with your Google Workspace account
3. Click **Select a project** → **New Project**
4. Enter:
   - **Project name:** `csm-pro-wecom`
   - **Organization:** Your Google Workspace organization
   - **Location:** Your organization
5. Click **Create**

### Step 2: Enable Compute Engine API

1. In Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Compute Engine API"
3. Click **Enable**
4. Wait for activation (30-60 seconds)

### Step 3: Create VM Instance (Free Tier)

1. Go to **Compute Engine** → **VM instances**
2. Click **Create Instance**

3. **Configure Instance:**

**Basic:**
- **Name:** `wecom-api-server`
- **Region:** Choose closest to Hong Kong/China
  - Recommended: `asia-east1` (Taiwan)
  - Alternative: `asia-southeast1` (Singapore)
- **Zone:** Any zone (e.g., `asia-east1-b`)

**Machine configuration:**
- **Series:** E2
- **Machine type:** `e2-micro` (0.25-1 vCPU, 1 GB memory)
  - ✅ This is **FREE TIER eligible** (1 instance per month)

**Boot disk:**
- Click **Change**
- **Operating system:** Ubuntu
- **Version:** Ubuntu 22.04 LTS
- **Boot disk type:** Standard persistent disk
- **Size:** 30 GB (free tier includes 30 GB)
- Click **Select**

**Firewall:**
- ✅ Check **Allow HTTP traffic**
- ✅ Check **Allow HTTPS traffic**

4. Click **Create** (wait 1-2 minutes)

### Step 4: Reserve Static IP

**CRITICAL:** By default, VMs get dynamic IPs that change on restart. We need static!

1. Go to **VPC network** → **IP addresses** → **External IP addresses**
2. Find your VM's IP (shows as "Ephemeral")
3. Click dropdown next to "Ephemeral" → **Reserve static address**
4. Enter:
   - **Name:** `wecom-api-static-ip`
   - **Description:** Static IP for WeCom trusted IP config
5. Click **Reserve**

**✅ IMPORTANT: Copy this IP address!** You'll need it for WeCom configuration.

Example: `34.80.123.456`

### Step 5: Configure Firewall Rule

1. Go to **VPC network** → **Firewall**
2. Click **Create Firewall Rule**
3. Enter:
   - **Name:** `allow-wecom-api`
   - **Direction:** Ingress
   - **Targets:** Specified target tags
   - **Target tags:** `wecom-api`
   - **Source IPv4 ranges:** `0.0.0.0/0`
   - **Protocols and ports:**
     - ✅ TCP: `3000`
4. Click **Create**

5. Go back to **Compute Engine** → **VM instances**
6. Click on `wecom-api-server`
7. Click **Edit**
8. Under **Network tags**, add: `wecom-api`
9. Click **Save**

---

## Part 2: Deploy Backend Server (20 minutes)

### Step 1: Connect to VM via SSH

1. In **Compute Engine** → **VM instances**
2. Click **SSH** button next to your VM
3. A terminal window will open

### Step 2: Install Node.js

```bash
# Update package list
sudo apt update

# Install Node.js 18 (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x
```

### Step 3: Create Project Directory

```bash
# Create directory
mkdir -p ~/wecom-api
cd ~/wecom-api

# Create server files
nano server.js
```

**Paste the entire contents of `backend/wecom-api/server.js`** (from your repo)

Press `Ctrl+O` to save, `Enter` to confirm, `Ctrl+X` to exit

```bash
# Create package.json
nano package.json
```

**Paste the entire contents of `backend/wecom-api/package.json`**

Press `Ctrl+O` to save, `Enter` to confirm, `Ctrl+X` to exit

### Step 4: Install Dependencies

```bash
cd ~/wecom-api
npm install
```

Should see:
```
added 50 packages
```

### Step 5: Set Environment Variables

```bash
# Edit startup script
nano start.sh
```

**Paste this (replace with YOUR actual corp_id and corp_secret):**

```bash
#!/bin/bash
export WECOM_CORP_ID="wwxxxxxxxxxxxxxxxx"
export WECOM_CORP_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export PORT=3000

node server.js
```

Press `Ctrl+O`, `Enter`, `Ctrl+X`

```bash
# Make executable
chmod +x start.sh
```

### Step 6: Test Server Manually

```bash
# Run server
./start.sh
```

You should see:
```
===========================================
🚀 WeCom API Server Started
===========================================
📡 Listening on port: 3000
🔑 Corp ID: ✅ Set
🔐 Corp Secret: ✅ Set
===========================================
```

**Test in new terminal** (keep server running):

Open another SSH window, then:

```bash
# Test health endpoint
curl http://localhost:3000/health
```

Should return:
```json
{"status":"ok","timestamp":"...","tokenCached":false,"tokenValid":false}
```

Press `Ctrl+C` in the first terminal to stop the server.

### Step 7: Setup as System Service (Auto-start)

```bash
# Create service file
sudo nano /etc/systemd/system/wecom-api.service
```

**Paste this:**

```ini
[Unit]
Description=WeCom API Server
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/wecom-api
Environment="WECOM_CORP_ID=wwxxxxxxxxxxxxxxxx"
Environment="WECOM_CORP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
Environment="PORT=3000"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Replace:**
- `YOUR_USERNAME` with your username (run `whoami` to check)
- `WECOM_CORP_ID` with your actual corp ID
- `WECOM_CORP_SECRET` with your actual corp secret

Press `Ctrl+O`, `Enter`, `Ctrl+X`

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable wecom-api

# Start service
sudo systemctl start wecom-api

# Check status
sudo systemctl status wecom-api
```

Should see:
```
● wecom-api.service - WeCom API Server
     Loaded: loaded
     Active: active (running)
```

### Step 8: Test External Access

**From your local computer** (not SSH), open browser or use curl:

```
http://YOUR_VM_EXTERNAL_IP:3000/health
```

Replace `YOUR_VM_EXTERNAL_IP` with the static IP from Step 4.

Should return:
```json
{"status":"ok",...}
```

✅ **If this works, your backend is deployed and accessible!**

---

## Part 3: Configure WeCom Trusted Domain & IP (10 minutes)

### Step 1: Setup Trusted Domain (Your Google Workspace Domain)

**Option A: If you have a subdomain for API:**

If you have `api.yourcompany.com`:

1. Log into WeCom Admin Panel
2. Go to **Applications** → Your app
3. Scroll to **Trusted Domain** (可信域名)
4. Click **Configure**
5. Enter: `api.yourcompany.com`
6. Follow verification steps (usually DNS TXT record)

**Option B: Use main domain temporarily:**

If you only have `yourcompany.com`:

1. Enter: `yourcompany.com`
2. Complete verification

**Verification Steps:**
1. WeCom will give you a TXT record
2. Go to Google Domains (or your DNS provider)
3. Add the TXT record
4. Wait 5-10 minutes for DNS propagation
5. Click "Verify" in WeCom

### Step 2: Setup Trusted IP (Your VM Static IP)

1. Still in WeCom Admin Panel → Your app
2. Scroll to **Trusted IP** (可信IP)
3. Click **Configure**
4. Enter your VM's static IP: `34.80.123.456` (your actual IP)
5. Click **Save**

**⚠️ CRITICAL:** Only add this ONE IP address. Don't add multiple IPs.

### Step 3: Verify Configuration

Back in your VM SSH terminal:

```bash
# Test getting access token
curl "http://localhost:3000/health"
```

Should show `tokenCached: false` initially.

**Make a test API call to trigger token fetch:**

```bash
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"YOUR_TEST_GROUP_CHAT_ID"}'
```

If successful, you'll see in the logs:
```
✅ Access token obtained successfully
```

**If you get an error about trusted IP:**
- Double-check the IP you entered in WeCom matches exactly
- Wait 5 minutes for WeCom to propagate changes
- Restart the service: `sudo systemctl restart wecom-api`

---

## Part 4: Test End-to-End (15 minutes)

### Step 1: Get One Parent Group Chat ID

**Manual Method:**

1. Open WeCom desktop app
2. Go to **Customers** → **Customer Groups**
3. Find one parent group (pick your test student)
4. Right-click → **Copy group info** or **Export**
5. Look for `chat_id` field
   - Format: `wrOgQhDgAAcwMTB7YmDQbcJocOb2gGww` (random string)

**OR use API:**

```bash
# From your local computer
curl "http://YOUR_VM_IP:3000/api/get-customer-groups?limit=10"
```

Returns list of all customer groups with their chat_ids.

### Step 2: Update Database

```sql
-- Update one test student with parent group chat_id
UPDATE students
SET parent_wecom_group_chat_id = 'wrOgQhDgAAcwMTB7YmDQbcJocOb2gGww',
    parent_wecom_group_name = 'Parent Group - Alice Wong Test',
    wecom_group_updated_at = NOW()
WHERE student_name = 'Alice Wong';
-- Or use student_id = 123
```

Verify:
```sql
SELECT student_name, parent_wecom_group_chat_id, parent_wecom_group_name
FROM students
WHERE parent_wecom_group_chat_id IS NOT NULL;
```

### Step 3: Test API Directly

**From local computer:**

```bash
curl -X POST http://YOUR_VM_IP:3000/api/send-fee-message \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "wrOgQhDgAAcwMTB7YmDQbcJocOb2gGww",
    "student_name": "Alice Wong",
    "message": "🧪 Test Message\n\nThis is a test from CSM Pro API server.\n\nIf you see this in the parent group, the integration is working!\n\nTimestamp: 2025-10-04 20:00"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "msgid": "...",
  "fail_list": [],
  "duration_ms": 234
}
```

**Check parent group in WeCom** - message should appear!

✅ **If message appears, your backend is fully working!**

### Step 4: Configure AppSheet Webhook

Now that backend is working, connect AppSheet:

1. Go to AppSheet → **Automation** → **Bots**
2. Create new bot or edit existing one
3. Add webhook task

**URL:**
```
http://YOUR_VM_EXTERNAL_IP:3000/api/send-fee-message
```

**HTTP Verb:** POST

**HTTP Headers:** Leave blank

**Body:**
```json
{
  "chat_id": "<<[student_id].[parent_wecom_group_chat_id]>>",
  "student_name": "<<[student_name]>>",
  "message": "<<[_fee_message]>>"
}
```

**Condition:**
```
AND(
  [days_until_renewal] <= 7,
  NOT(ISBLANK([student_id].[parent_wecom_group_chat_id]))
)
```

### Step 5: Test from AppSheet

1. Find the enrollment you updated
2. Trigger the bot (manually or via schedule)
3. Check AppSheet bot execution log
4. Check WeCom parent group

✅ **If message appears, end-to-end integration complete!**

---

## Part 5: Production Setup (Optional but Recommended)

### Setup HTTPS with SSL Certificate

**Why?** More secure, professional, enables future features.

**Quick Option: Use Cloudflare Tunnel (Free)**

1. Sign up for Cloudflare
2. Add your domain
3. Install cloudflared on VM:

```bash
# Install cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create wecom-api

# Configure tunnel
cat > ~/.cloudflared/config.yml <<EOF
url: http://localhost:3000
tunnel: wecom-api
credentials-file: /home/YOUR_USERNAME/.cloudflared/TUNNEL_ID.json
EOF

# Run tunnel as service
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

Now your API is available at: `https://wecom-api.yourcompany.com`

Update AppSheet webhook URL to HTTPS version.

### Setup Monitoring

**Simple log checking:**

```bash
# View logs
sudo journalctl -u wecom-api -f

# View last 100 lines
sudo journalctl -u wecom-api -n 100
```

**Add log rotation:**

```bash
sudo nano /etc/logrotate.d/wecom-api
```

```
/home/YOUR_USERNAME/wecom-api/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

---

## Troubleshooting

### Problem: Can't access http://VM_IP:3000/health

**Check:**
1. ✅ Firewall rule allows TCP 3000
2. ✅ Network tag `wecom-api` is on VM
3. ✅ Service is running: `sudo systemctl status wecom-api`
4. ✅ Using external IP (not internal)

**Fix:**
```bash
# Restart service
sudo systemctl restart wecom-api

# Check logs
sudo journalctl -u wecom-api -n 50
```

### Problem: "Access token error" or "IP not trusted"

**Check:**
1. ✅ Trusted IP in WeCom matches VM external IP exactly
2. ✅ Wait 5-10 minutes after adding trusted IP
3. ✅ Corp ID and corp secret are correct

**Fix:**
```bash
# Check environment variables
sudo systemctl show wecom-api | grep Environment

# Update if wrong
sudo nano /etc/systemd/system/wecom-api.service
# Edit WECOM_CORP_ID and WECOM_CORP_SECRET

sudo systemctl daemon-reload
sudo systemctl restart wecom-api
```

### Problem: Message sends but doesn't appear in group

**Check:**
1. ✅ Chat ID is correct (check for typos)
2. ✅ Group still exists in WeCom
3. ✅ Your service account has permission to message group

**Debug:**
```bash
# Check exact API response
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"YOUR_CHAT_ID"}' \
  -v
```

Look for error codes in response.

### Problem: VM stops/restarts and IP changes

**This shouldn't happen if you reserved static IP!**

**Verify:**
1. Go to **VPC network** → **IP addresses**
2. Check IP is "Static" not "Ephemeral"

**If it's still ephemeral:**
- Reserve it again (Step 4 in Part 1)
- Update trusted IP in WeCom

---

## Cost Tracking

### Free Tier Limits (per month):
- ✅ 1 e2-micro VM instance: FREE
- ✅ 30 GB standard persistent disk: FREE
- ✅ 1 GB network egress to China/HK: FREE
- ✅ 1 static external IP: $0.01/hour when not in use, FREE when attached to running VM

**Expected cost:** $0/month if VM runs 24/7

**If you stop the VM:** ~$7/month for idle static IP (don't stop it!)

---

## Maintenance Tasks

### Weekly:
- [ ] Check service status: `sudo systemctl status wecom-api`
- [ ] Review logs: `sudo journalctl -u wecom-api -n 100`

### Monthly:
- [ ] Update Node.js: `sudo apt update && sudo apt upgrade`
- [ ] Check disk usage: `df -h`
- [ ] Review Google Cloud billing

### As Needed:
- [ ] Add new student→group mappings to database
- [ ] Update message templates in AppSheet

---

## Next Steps

1. ✅ Complete Part 1-4 (get system working)
2. ✅ Test with ONE student thoroughly
3. ✅ Map remaining students to their parent groups
4. ✅ Enable AppSheet bot for all enrollments
5. ✅ Monitor for first week
6. ✅ Add HTTPS (Part 5) when ready

---

## Quick Reference

### Important URLs:
- Health Check: `http://YOUR_VM_IP:3000/health`
- Send Message: `http://YOUR_VM_IP:3000/api/send-fee-message`
- Get Groups: `http://YOUR_VM_IP:3000/api/get-customer-groups`

### Important Commands:
```bash
# Check service status
sudo systemctl status wecom-api

# Restart service
sudo systemctl restart wecom-api

# View logs
sudo journalctl -u wecom-api -f

# Test API
curl http://localhost:3000/health
```

### Important Files:
- Server code: `~/wecom-api/server.js`
- Service file: `/etc/systemd/system/wecom-api.service`
- Logs: `sudo journalctl -u wecom-api`

---

## Support

If you get stuck:
1. Check the troubleshooting section
2. Review logs: `sudo journalctl -u wecom-api -n 100`
3. Test with `curl` commands provided
4. Verify WeCom trusted IP/domain settings

**Common issues are usually:**
- Trusted IP mismatch (check IP exactly)
- Firewall not allowing port 3000
- Wrong corp_id or corp_secret
- Chat ID typo or group deleted

Good luck! 🚀
