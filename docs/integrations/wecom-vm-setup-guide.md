# WeCom API Proxy: GCE VM Setup Guide

> **Status (Feb 2026): ON HOLD.** This guide is complete and tested, but the WeCom API
> integration is blocked by China's ICP filing (备案) requirement. Our Macau entity cannot
> obtain ICP filing for our domain. The VM was set up, tested, and then decommissioned.
> This guide is preserved for future use if the blocker is resolved — the full setup takes
> ~30 minutes. See `wecom-webapp-integration-plan.md` for details on the blocker.

This guide sets up a lightweight GCE VM to proxy WeCom API calls from our Cloud Run backend. The VM provides the **static IP** that WeCom requires for API authentication.

**Cost:** $0/month (GCP free tier)

**Time:** ~30 minutes

---

## Architecture

```
Cloud Run Backend (FastAPI)
        │
        │  HTTP request with X-API-Key
        ▼
GCE VM (Python proxy, static IP)
        │
        │  WeCom API call
        ▼
WeCom API (qyapi.weixin.qq.com)
```

The VM handles:
- WeCom access token management (2-hour expiry, auto-refresh)
- Proxying API requests from Cloud Run to WeCom
- API key validation (shared secret with Cloud Run)

---

## Part 1: Create the VM (15 minutes)

We use the existing `csm-database-project` to keep everything under one billing account.

### Step 1: Enable Compute Engine

1. Go to https://console.cloud.google.com/
2. Select project: **csm-database-project**
3. Go to **APIs & Services** → **Library**
4. Search "Compute Engine API" → **Enable**
5. Wait 30-60 seconds

### Step 2: Create VM Instance

1. Go to **Compute Engine** → **VM instances**
2. Click **Create Instance**

**Configuration:**

| Setting | Value | Why |
|---|---|---|
| Name | `wecom-proxy` | |
| Region | `us-west1` (Oregon) | Free tier eligible. Only us-west1, us-central1, us-east1 qualify |
| Zone | `us-west1-b` (any zone) | |
| Series | E2 | |
| Machine type | `e2-micro` | Free tier: 1 instance/month |
| Boot disk OS | Ubuntu 24.04 LTS | |
| Boot disk type | Standard persistent disk | |
| Boot disk size | 10 GB | Plenty for a proxy (free tier allows up to 30 GB) |
| Firewall | Allow HTTP, Allow HTTPS | Checked |

3. Click **Create** (wait 1-2 minutes)

### Step 3: Reserve Static IP

By default, the VM gets a dynamic IP that changes on restart. We need a static one.

1. Go to **VPC network** → **IP addresses** → **External IP addresses**
2. Find your VM's IP (shows as "Ephemeral")
3. Click the dropdown → **Reserve static address**
4. Name: `wecom-proxy-ip`
5. Click **Reserve**

**Copy this IP address** — you'll register it in WeCom.

> **Cost note:** The static IP is free while attached to a running VM. If you stop the VM without releasing the IP, Google charges ~$7/month for the idle IP. Don't stop the VM unless you also release the IP.

### Step 4: Firewall Rule

Allow Cloud Run to reach the proxy on port 8000.

1. Go to **VPC network** → **Firewall**
2. Click **Create Firewall Rule**

| Setting | Value |
|---|---|
| Name | `allow-wecom-proxy` |
| Direction | Ingress |
| Targets | Specified target tags |
| Target tags | `wecom-proxy` |
| Source IPv4 ranges | `0.0.0.0/0` |
| Protocols and ports | TCP: `8000` |

3. Click **Create**

4. Go to **Compute Engine** → **VM instances** → click `wecom-proxy`
5. Click **Edit** → add network tag: `wecom-proxy` → **Save**

> **Security note:** The firewall is open to all IPs because Cloud Run's egress IPs are dynamic. The proxy itself validates requests using an API key header (configured in Part 2).

---

## Part 2: Deploy the Proxy Service (15 minutes)

### Step 1: SSH into the VM

1. In **Compute Engine** → **VM instances**
2. Click **SSH** next to `wecom-proxy`

### Step 2: Install Python

```bash
sudo apt update && sudo apt install -y python3 python3-pip python3-venv
python3 --version  # Should show 3.12+
```

### Step 3: Create the Project

```bash
mkdir -p ~/wecom-proxy
cd ~/wecom-proxy
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn httpx pycryptodome
```

### Step 4: Create the Proxy Service

```bash
nano ~/wecom-proxy/main.py
```

Paste this:

```python
"""
WeCom API Proxy Service
Runs on GCE VM with static IP. Handles token management and proxies
API requests from our Cloud Run backend to WeCom.
"""

import os
import time
import hashlib
import hmac
import base64
import struct

import httpx
from fastapi import FastAPI, HTTPException, Header, Request, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from Crypto.Cipher import AES

app = FastAPI(title="WeCom Proxy")

# Configuration
CORP_ID = os.environ["WECOM_CORP_ID"]
CORP_SECRET = os.environ["WECOM_CORP_SECRET"]
AGENT_ID = os.environ.get("WECOM_AGENT_ID", "")
API_KEY = os.environ["WECOM_PROXY_API_KEY"]

# WeCom callback verification config
CALLBACK_TOKEN = os.environ.get("WECOM_CALLBACK_TOKEN", "")
CALLBACK_AES_KEY = os.environ.get("WECOM_CALLBACK_AES_KEY", "")

WECOM_BASE = "https://qyapi.weixin.qq.com/cgi-bin"

# Token cache
_token: str | None = None
_token_expiry: float = 0


def _decrypt_echostr(encoding_aes_key: str, echostr: str) -> str:
    """Decrypt WeCom callback verification echostr."""
    aes_key = base64.b64decode(encoding_aes_key + "=")
    iv = aes_key[:16]
    cipher = AES.new(aes_key, AES.MODE_CBC, iv)
    decrypted = cipher.decrypt(base64.b64decode(echostr))
    # Remove PKCS7 padding
    pad_len = decrypted[-1]
    decrypted = decrypted[:-pad_len]
    # 16 random bytes + 4 bytes msg length + msg + corp_id
    msg_len = struct.unpack("!I", decrypted[16:20])[0]
    return decrypted[20 : 20 + msg_len].decode()


def _verify_signature(
    token: str, timestamp: str, nonce: str, echostr: str, msg_signature: str
) -> bool:
    """Verify WeCom callback signature."""
    sort_list = sorted([token, timestamp, nonce, echostr])
    sha1 = hashlib.sha1("".join(sort_list).encode()).hexdigest()
    return sha1 == msg_signature


async def get_access_token() -> str:
    """Get WeCom access token, refreshing if expired."""
    global _token, _token_expiry

    if _token and time.time() < _token_expiry:
        return _token

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{WECOM_BASE}/gettoken",
            params={"corpid": CORP_ID, "corpsecret": CORP_SECRET},
        )
        data = resp.json()

    if data.get("errcode", 0) != 0:
        raise HTTPException(502, f"WeCom token error: {data.get('errmsg')}")

    _token = data["access_token"]
    _token_expiry = time.time() + 7000  # 2h minus buffer
    return _token


def verify_api_key(x_api_key: str = Header(...)):
    """Validate the shared API key from Cloud Run."""
    if not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(401, "Invalid API key")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "token_cached": _token is not None,
        "token_valid": time.time() < _token_expiry,
        "corp_id_set": bool(CORP_ID),
        "agent_id": AGENT_ID or "(not set)",
    }


@app.get("/callback")
async def callback_verify(
    msg_signature: str = Query(...),
    timestamp: str = Query(...),
    nonce: str = Query(...),
    echostr: str = Query(...),
):
    """
    WeCom callback URL verification.
    WeCom sends a GET request to verify we control this endpoint.
    We verify the signature and return the decrypted echostr.
    """
    if not CALLBACK_TOKEN or not CALLBACK_AES_KEY:
        raise HTTPException(500, "Callback token/key not configured")

    if not _verify_signature(
        CALLBACK_TOKEN, timestamp, nonce, echostr, msg_signature
    ):
        raise HTTPException(403, "Signature verification failed")

    decrypted = _decrypt_echostr(CALLBACK_AES_KEY, echostr)
    return PlainTextResponse(decrypted)


@app.post("/callback")
async def callback_receive(request: Request):
    """
    Receive messages/events from WeCom (POST).
    For now just acknowledge — we don't need to process incoming messages.
    """
    return PlainTextResponse("success")


@app.post("/proxy/message/send")
async def send_message(request: Request, x_api_key: str = Header(...)):
    """
    Proxy for WeCom message/send API.
    Sends application messages to individual WeCom users.
    """
    verify_api_key(x_api_key)
    body = await request.json()

    # Inject agent_id if not provided
    if "agentid" not in body and AGENT_ID:
        body["agentid"] = int(AGENT_ID)

    token = await get_access_token()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{WECOM_BASE}/message/send",
            params={"access_token": token},
            json=body,
        )

    data = resp.json()
    status = 200 if data.get("errcode", 0) == 0 else 502
    return JSONResponse(content=data, status_code=status)


@app.post("/proxy/appchat/send")
async def send_appchat(request: Request, x_api_key: str = Header(...)):
    """
    Proxy for WeCom appchat/send API.
    Sends messages to internal group chats.
    """
    verify_api_key(x_api_key)
    body = await request.json()
    token = await get_access_token()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{WECOM_BASE}/appchat/send",
            params={"access_token": token},
            json=body,
        )

    data = resp.json()
    status = 200 if data.get("errcode", 0) == 0 else 502
    return JSONResponse(content=data, status_code=status)


@app.post("/proxy/externalcontact/add_msg_template")
async def send_external_msg(request: Request, x_api_key: str = Header(...)):
    """
    Proxy for WeCom externalcontact/add_msg_template API.
    Sends messages to external customer groups (parents).
    """
    verify_api_key(x_api_key)
    body = await request.json()
    token = await get_access_token()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{WECOM_BASE}/externalcontact/add_msg_template",
            params={"access_token": token},
            json=body,
        )

    data = resp.json()
    status = 200 if data.get("errcode", 0) == 0 else 502
    return JSONResponse(content=data, status_code=status)


@app.get("/proxy/externalcontact/groupchat/list")
async def list_customer_groups(
    request: Request,
    x_api_key: str = Header(...),
    offset: int = 0,
    limit: int = 100,
):
    """
    Proxy for listing external customer groups.
    Useful for discovering group chat_ids.
    """
    verify_api_key(x_api_key)
    token = await get_access_token()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{WECOM_BASE}/externalcontact/groupchat/list",
            params={"access_token": token},
            json={"status_filter": 0, "offset": offset, "limit": limit},
        )

    return JSONResponse(content=resp.json())
```

Press `Ctrl+O`, `Enter`, `Ctrl+X` to save and exit.

### Step 5: Create Startup Script

```bash
nano ~/wecom-proxy/start.sh
```

Paste (replace with your actual values):

```bash
#!/bin/bash
cd ~/wecom-proxy
source venv/bin/activate

export WECOM_CORP_ID="ww_YOUR_CORP_ID"
export WECOM_CORP_SECRET="YOUR_CORP_SECRET"
export WECOM_AGENT_ID="YOUR_AGENT_ID"
export WECOM_PROXY_API_KEY="GENERATE_A_RANDOM_SECRET_HERE"
export WECOM_CALLBACK_TOKEN="YOUR_CALLBACK_TOKEN"
export WECOM_CALLBACK_AES_KEY="YOUR_CALLBACK_AES_KEY"

exec uvicorn main:app --host 0.0.0.0 --port 8000
```

To generate a random API key:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

```bash
chmod +x ~/wecom-proxy/start.sh
```

### Step 6: Test Manually

```bash
~/wecom-proxy/start.sh
```

You should see:
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8000
```

In a second SSH window:
```bash
curl http://localhost:8000/health
```

Should return:
```json
{"status":"ok","token_cached":false,"token_valid":false,"corp_id_set":true,"agent_id":"..."}
```

Press `Ctrl+C` to stop.

### Step 7: Set Up Systemd Service

```bash
sudo nano /etc/systemd/system/wecom-proxy.service
```

Paste (replace `YOUR_USERNAME` with output of `whoami`, and fill in credentials):

```ini
[Unit]
Description=WeCom API Proxy
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/wecom-proxy
Environment="WECOM_CORP_ID=ww_YOUR_CORP_ID"
Environment="WECOM_CORP_SECRET=YOUR_CORP_SECRET"
Environment="WECOM_AGENT_ID=YOUR_AGENT_ID"
Environment="WECOM_PROXY_API_KEY=YOUR_API_KEY"
Environment="WECOM_CALLBACK_TOKEN=YOUR_CALLBACK_TOKEN"
Environment="WECOM_CALLBACK_AES_KEY=YOUR_CALLBACK_AES_KEY"
ExecStart=/home/YOUR_USERNAME/wecom-proxy/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable wecom-proxy
sudo systemctl start wecom-proxy
sudo systemctl status wecom-proxy
```

Should show `active (running)`.

---

## Part 3: Configure WeCom Callback URL & Trusted IP (10 minutes)

WeCom requires either a trusted domain or a receiving message server URL before you can set a trusted IP. The receiving message URL is easier — it verifies by sending a request to your server (no domain entity verification needed).

### Step 1: Set Receiving Message Server URL

1. Log into WeCom Admin Panel: https://admin.work.weixin.qq.com/
2. Go to **Applications** → select your self-built app
3. Scroll to **Trusted IP** (企业可信IP)
4. Click **设置接收消息服务器URL** (Set receiving message server URL)
5. Fill in:
   - **URL:** `http://YOUR_VM_STATIC_IP:8000/callback`
   - **Token:** (generate random — copy it for `WECOM_CALLBACK_TOKEN` env var)
   - **EncodingAESKey:** (generate random — copy it for `WECOM_CALLBACK_AES_KEY` env var)
6. **Before clicking Save:** make sure the proxy service is running with the matching `WECOM_CALLBACK_TOKEN` and `WECOM_CALLBACK_AES_KEY` env vars in the systemd service
7. Click **Save** — WeCom will send a verification GET request to your `/callback` endpoint
8. If successful, you'll see a green checkmark

### Step 2: Set Trusted IP

Now that the callback URL is verified, the trusted IP option is unlocked:

1. Same app settings page → **Trusted IP** (企业可信IP)
2. Click **Configure**
3. Enter your VM's static IP
4. Save

Wait 5-10 minutes for propagation.

---

## Part 4: Test End-to-End (10 minutes)

### Test from your local machine

Replace `YOUR_VM_IP` with the static IP and `YOUR_API_KEY` with the key from Part 2.

**Health check (no auth needed):**
```bash
curl http://YOUR_VM_IP:8000/health
```

**Token test (triggers token fetch from WeCom):**
```bash
curl -X POST http://YOUR_VM_IP:8000/proxy/message/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "touser": "YOUR_WECOM_USERID",
    "msgtype": "text",
    "text": {
      "content": "Test message from CSM Pro WeCom proxy"
    }
  }'
```

**Expected success response:**
```json
{"errcode": 0, "errmsg": "ok", "msgid": "..."}
```

**Check your WeCom app** — the message should appear as a notification from your internal application.

### Common errors

| Error | Cause | Fix |
|---|---|---|
| `60020: not trusted ip` | VM IP not in WeCom trusted list | Check IP matches exactly, wait 10 min |
| `40001: invalid credential` | Wrong corp_id or corp_secret | Check env vars in systemd service |
| `401: Invalid API key` | Wrong X-API-Key header | Check `WECOM_PROXY_API_KEY` matches |
| Connection refused | Service not running | `sudo systemctl restart wecom-proxy` |
| Connection timeout | Firewall blocking port 8000 | Check firewall rule and network tag |

---

## Part 5: HTTPS with Cloudflare Tunnel (Optional)

For production, wrap the proxy in HTTPS using Cloudflare Tunnel (free).

### Install Cloudflare Tunnel

```bash
# On the VM
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Authenticate (opens browser link)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create wecom-proxy

# Configure
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: wecom-proxy
credentials-file: /home/YOUR_USERNAME/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: wecom-proxy.mathconceptsecondary.academy
    service: http://localhost:8000
  - service: http_status:404
EOF
```

Replace `YOUR_USERNAME` and `TUNNEL_ID` with actual values.

### Add DNS record in Cloudflare

```bash
cloudflared tunnel route dns wecom-proxy wecom-proxy.mathconceptsecondary.academy
```

### Run as service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

Now the proxy is available at: `https://wecom-proxy.mathconceptsecondary.academy`

Update your Cloud Run backend's `WECOM_PROXY_URL` to use this HTTPS URL.

> **Note:** The Cloudflare Tunnel approach means Cloud Run talks to the proxy through Cloudflare's network (HTTPS), which is more secure than hitting the VM's raw IP on port 8000. With this setup, you could even close the port 8000 firewall rule.

---

## Maintenance

### View logs

```bash
# Live logs
sudo journalctl -u wecom-proxy -f

# Last 100 lines
sudo journalctl -u wecom-proxy -n 100
```

### Restart service

```bash
sudo systemctl restart wecom-proxy
```

### Update the proxy code

```bash
# SSH into VM
cd ~/wecom-proxy
nano main.py  # Make changes
sudo systemctl restart wecom-proxy
```

### Monthly checks

- [ ] Service running: `sudo systemctl status wecom-proxy`
- [ ] Disk usage: `df -h` (should be well under 10 GB)
- [ ] System updates: `sudo apt update && sudo apt upgrade`
- [ ] Check GCP billing (should be $0)

---

## Cloud Run Backend Configuration

Once the VM is running, add these environment variables to the Cloud Run backend deployment:

```
WECOM_PROXY_URL=http://YOUR_VM_IP:8000
WECOM_PROXY_API_KEY=YOUR_API_KEY
```

Or if using Cloudflare Tunnel:
```
WECOM_PROXY_URL=https://wecom-proxy.mathconceptsecondary.academy
WECOM_PROXY_API_KEY=YOUR_API_KEY
```

These will be used by the webapp backend code (to be implemented in Phase 1B).
