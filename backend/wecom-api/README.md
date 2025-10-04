# WeCom API Backend

Backend server for CSM Pro WeCom external customer group messaging integration.

## Purpose

Enables AppSheet to send fee renewal messages to individual student parent customer groups via WeCom API.

## Features

- ✅ WeCom API authentication with token management
- ✅ Send messages to external customer groups
- ✅ Get list of all customer groups
- ✅ Health check endpoint
- ✅ Test endpoint for debugging

## Prerequisites

- Node.js 18+
- WeCom app with corp_id and corp_secret
- Static IP address configured as trusted IP in WeCom
- Domain configured as trusted domain in WeCom

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
# Edit .env with your actual credentials
```

### 3. Run Server

```bash
npm start
```

Server starts on port 3000 (or PORT from env).

## API Endpoints

### Health Check

```
GET /health
```

Returns server status and token cache info.

### Send Fee Message

```
POST /api/send-fee-message
Content-Type: application/json

{
  "chat_id": "wrOgQhDgAAcwMTB7YmDQbcJocOb2gGww",
  "student_name": "Alice Wong",
  "message": "Fee renewal message here..."
}
```

### Get Customer Groups

```
GET /api/get-customer-groups?offset=0&limit=100
```

Returns list of all customer groups with chat_ids.

### Test Message

```
POST /api/test
Content-Type: application/json

{
  "chat_id": "wrOgQhDgAAcwMTB7YmDQbcJocOb2gGww"
}
```

Sends a test message to verify integration.

## Deployment

See `docs/wecom-phase2-google-cloud-setup.md` for complete deployment guide on Google Cloud.

## AppSheet Integration

Configure AppSheet webhook to call `/api/send-fee-message`:

**URL:**
```
http://YOUR_SERVER_IP:3000/api/send-fee-message
```

**Body:**
```json
{
  "chat_id": "<<[student_id].[parent_wecom_group_chat_id]>>",
  "student_name": "<<[student_name]>>",
  "message": "<<[_fee_message]>>"
}
```

## Troubleshooting

### Access Token Error

Check:
- Corp ID and corp secret are correct
- Server IP is added to WeCom trusted IP list
- Domain is added to WeCom trusted domain list

### Message Not Appearing

Check:
- Chat ID is correct
- Group still exists in WeCom
- Service account has permission to message group

### Logs

```bash
# If deployed as systemd service
sudo journalctl -u wecom-api -f

# If running manually
# Check console output
```

## Security Notes

- Never commit `.env` file to git
- Keep corp_secret secure
- Use HTTPS in production (see deployment guide)
- Restrict API access with firewall rules

## License

MIT
