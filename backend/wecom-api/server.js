/**
 * WeCom API Backend Server
 * Handles authentication and message sending to external customer groups
 *
 * Requirements:
 * - Node.js 18+
 * - Environment variables: WECOM_CORP_ID, WECOM_CORP_SECRET
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const CORP_ID = process.env.WECOM_CORP_ID;
const CORP_SECRET = process.env.WECOM_CORP_SECRET;

if (!CORP_ID || !CORP_SECRET) {
  console.error('ERROR: Missing WECOM_CORP_ID or WECOM_CORP_SECRET environment variables');
  process.exit(1);
}

// Access token cache (in-memory)
// For production, use Redis or database
let accessToken = null;
let tokenExpiry = 0;

/**
 * Get WeCom access token (cached)
 * Token expires every 2 hours (7200 seconds)
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && Date.now() < tokenExpiry) {
    console.log('Using cached access token');
    return accessToken;
  }

  console.log('Fetching new access token from WeCom API...');

  try {
    const response = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/gettoken', {
      params: {
        corpid: CORP_ID,
        corpsecret: CORP_SECRET
      }
    });

    if (response.data.errcode && response.data.errcode !== 0) {
      throw new Error(`WeCom API Error ${response.data.errcode}: ${response.data.errmsg}`);
    }

    accessToken = response.data.access_token;
    // Cache for 7000 seconds (leave 200s buffer before expiry)
    tokenExpiry = Date.now() + (7000 * 1000);

    console.log('✅ Access token obtained successfully');
    return accessToken;

  } catch (error) {
    console.error('❌ Failed to get access token:', error.message);
    throw error;
  }
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    tokenCached: accessToken !== null,
    tokenValid: Date.now() < tokenExpiry
  });
});

/**
 * Send fee message to customer group
 *
 * POST /api/send-fee-message
 * Body:
 * {
 *   "chat_id": "wrOgQhDgAAcwMTB7YmDQbcJocOb2gGww",
 *   "student_name": "Alice Wong",
 *   "message": "Fee renewal reminder message..."
 * }
 */
app.post('/api/send-fee-message', async (req, res) => {
  const startTime = Date.now();

  try {
    const { chat_id, student_name, message } = req.body;

    // Validate inputs
    if (!chat_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: chat_id'
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: message'
      });
    }

    console.log(`\n📤 Sending message for student: ${student_name || 'Unknown'}`);
    console.log(`   Chat ID: ${chat_id}`);

    // Get access token
    const token = await getAccessToken();

    // Send message to customer group
    // API: https://developer.work.weixin.qq.com/document/path/93563
    const response = await axios.post(
      `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/add_msg_template?access_token=${token}`,
      {
        chat_type: 'group',
        external_userid: [], // Empty = send to all group members
        text: {
          content: message
        }
      }
    );

    const duration = Date.now() - startTime;

    // Check WeCom API response
    if (response.data.errcode && response.data.errcode !== 0) {
      console.error(`❌ WeCom API Error ${response.data.errcode}: ${response.data.errmsg}`);

      return res.status(500).json({
        success: false,
        error: `WeCom API Error: ${response.data.errmsg}`,
        errcode: response.data.errcode,
        duration_ms: duration
      });
    }

    console.log(`✅ Message sent successfully in ${duration}ms`);
    console.log(`   msgid: ${response.data.msgid}`);
    if (response.data.fail_list && response.data.fail_list.length > 0) {
      console.warn(`   ⚠️  Failed for some users: ${JSON.stringify(response.data.fail_list)}`);
    }

    res.json({
      success: true,
      msgid: response.data.msgid,
      fail_list: response.data.fail_list || [],
      duration_ms: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Error sending message:', error.message);

    res.status(500).json({
      success: false,
      error: error.message,
      duration_ms: duration
    });
  }
});

/**
 * Get all customer groups (for setup/debugging)
 *
 * GET /api/get-customer-groups?offset=0&limit=100
 */
app.get('/api/get-customer-groups', async (req, res) => {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

    console.log(`\n📋 Fetching customer groups (offset: ${offset}, limit: ${limit})`);

    const token = await getAccessToken();

    const response = await axios.post(
      `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/groupchat/list?access_token=${token}`,
      {
        status_filter: 0, // 0 = all groups
        offset: offset,
        limit: limit
      }
    );

    if (response.data.errcode && response.data.errcode !== 0) {
      throw new Error(`WeCom API Error ${response.data.errcode}: ${response.data.errmsg}`);
    }

    const groups = response.data.group_chat_list || [];
    console.log(`✅ Retrieved ${groups.length} customer groups`);

    res.json({
      success: true,
      total: groups.length,
      groups: groups,
      has_more: response.data.next_cursor ? true : false,
      next_cursor: response.data.next_cursor
    });

  } catch (error) {
    console.error('❌ Error fetching customer groups:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test endpoint - send simple test message
 *
 * POST /api/test
 * Body: { "chat_id": "xxx" }
 */
app.post('/api/test', async (req, res) => {
  try {
    const { chat_id } = req.body;

    if (!chat_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing chat_id'
      });
    }

    const token = await getAccessToken();

    const response = await axios.post(
      `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/add_msg_template?access_token=${token}`,
      {
        chat_type: 'group',
        external_userid: [],
        text: {
          content: '✅ Test message from CSM Pro WeCom API server\n\n' +
                   `Timestamp: ${new Date().toISOString()}\n` +
                   'If you see this, the integration is working!'
        }
      }
    );

    if (response.data.errcode && response.data.errcode !== 0) {
      throw new Error(`WeCom API Error ${response.data.errcode}: ${response.data.errmsg}`);
    }

    res.json({
      success: true,
      msgid: response.data.msgid,
      message: 'Test message sent successfully!'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 WeCom API Server Started');
  console.log('===========================================');
  console.log(`📡 Listening on port: ${PORT}`);
  console.log(`🔑 Corp ID: ${CORP_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`🔐 Corp Secret: ${CORP_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log('===========================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
