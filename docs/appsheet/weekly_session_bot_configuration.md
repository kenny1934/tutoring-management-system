# AppSheet Bot Configuration for Weekly Session Generation

## Overview
This bot runs nightly to automatically generate next sessions for students with "Pending Payment" status who have attended their last session and have remaining lessons.

## Bot Configuration

### Basic Settings
| Setting | Value |
|---------|--------|
| **Bot Name** | `Generate Next Unpaid Sessions - Nightly` |
| **Purpose** | Generate weekly sessions for active unpaid enrollments |
| **Event** | Scheduled |
| **Schedule** | Daily at 00:30 (12:30 AM) |
| **Table** | enrollments |

### Schedule Configuration
- **Frequency:** Daily
- **Time:** 00:30 (runs after midnight when day transitions)
- **Timezone:** GMT+8 (Singapore/Malaysia time)
- **Enabled:** Yes

### Bot Condition
```appsheet
[Needs_Weekly_Session] = TRUE
```

**This condition identifies enrollments that:**
- Have `payment_status = "Pending Payment"`
- Last session was in the past and "Attended"
- Have remaining sessions in their quota
- Show recent activity (not abandoned)

### Bot Tasks

#### Task 1: Call Code.gs Webhook
| Setting | Value |
|---------|--------|
| **Task Type** | `Data: call a webhook` |
| **Webhook URL** | `https://script.google.com/macros/s/{SCRIPT_ID}/exec` |
| **HTTP Method** | POST |
| **Headers** | `Content-Type: application/json` |

#### Webhook Body:
```json
{
  "action": "generate_next_unpaid_session",
  "enrollmentIds": <<SELECT(enrollments[id], [Needs_Weekly_Session] = TRUE)>>
}
```

#### Task 2: Send Notification Email (Optional)
| Setting | Value |
|---------|--------|
| **Task Type** | `Send an email` |
| **To** | `admin@tutoring.com` |
| **Subject** | `Nightly Session Generation - {{TODAY()}}` |
| **Body** | See template below |

#### Email Template:
```
Nightly Session Generation Report - {{TODAY()}}

Sessions generated for:
{{SELECT(enrollments[student_name], [Needs_Weekly_Session] = TRUE)}}

Total enrollments processed: {{COUNT(SELECT(enrollments[id], [Needs_Weekly_Session] = TRUE))}}

Next sessions will be created automatically.
Monitor the system for any errors.

- Tutoring Management System
```

## Prerequisites

### 1. Virtual Columns Must Be Added First
Ensure all virtual columns from `virtual_columns_weekly_sessions.md` are added to the enrollments table:
- ✅ Actual_Sessions_Used
- ✅ Sessions_Remaining  
- ✅ Last_Session_Date
- ✅ Last_Session_Status
- ✅ Has_Recent_Activity
- ✅ Last_Session_In_Past
- ✅ Last_Session_Attended
- ✅ Needs_Weekly_Session

### 2. Code.gs Deployment
- ✅ Deploy Code.gs as web app with public access
- ✅ Copy the web app URL for webhook configuration
- ✅ Test the webhook manually first

### 3. Database Permissions
- ✅ AppSheet service account has read/write access to session_log table
- ✅ Code.gs has database connection permissions

## Testing the Bot

### Manual Testing
1. **Create Test Enrollment:**
   - Student: "Test Student"  
   - Payment Status: "Pending Payment"
   - Lessons Paid: 6

2. **Create Test Session:**
   - Session Date: Yesterday
   - Session Status: "Attended"  
   - Financial Status: "Unpaid"

3. **Verify Virtual Columns:**
   - Check `Needs_Weekly_Session` = TRUE for test enrollment

4. **Run Bot Manually:**
   - Go to Behavior > Bots
   - Click "Test" on the bot
   - Verify webhook is called
   - Check Code.gs logs
   - Confirm new session created

### Production Testing
1. **Enable bot** in production after manual testing succeeds
2. **Monitor first few runs** via email notifications
3. **Check Code.gs execution logs** for any errors
4. **Verify sessions created** have correct dates/times

## Monitoring & Troubleshooting

### Daily Monitoring
- **Email notifications** show how many students processed
- **Code.gs logs** show detailed success/failure per enrollment
- **AppSheet sync logs** show webhook call status

### Common Issues
1. **No students found:**
   - Check virtual column logic
   - Verify payment statuses are "Pending Payment"
   - Confirm students have attended recent sessions

2. **Webhook failures:**
   - Verify Code.gs web app URL is correct
   - Check Code.gs permissions and database connection
   - Confirm JSON format in webhook body

3. **Wrong session dates:**
   - Review holiday data in database
   - Check Code.gs holiday skipping logic
   - Verify timezone settings match

### Debug Mode (Temporary)
For initial deployment, add a debug task:

#### Task 3: Log Debug Info
| Setting | Value |
|---------|--------|
| **Task Type** | `Data: set the values of some columns in the data` |
| **Table** | enrollments |
| **Referenced Rows** | `LIST([_THISROW])` |

**Set Values:**
```
debug_last_bot_run: NOW()
debug_needs_session: [Needs_Weekly_Session]
```

Add temporary debug columns to track bot execution.

## Performance Considerations

### Bot Timing
- **00:30 daily** avoids peak usage hours
- **After midnight** ensures date calculations are accurate
- **Before 6 AM** completes before admin staff arrive

### Webhook Optimization
- **Batch processing** sends all enrollment IDs in one call
- **Parallel processing** in Code.gs handles multiple enrollments efficiently
- **Connection pooling** minimizes database overhead

### Error Handling
- **Individual enrollment errors** don't stop entire batch
- **Detailed logging** helps identify specific issues  
- **Email notifications** alert admins to problems
- **Retry logic** not needed (will try again next day)

## Security Notes

- **Webhook URL** should use HTTPS (Google Apps Script provides this)
- **No sensitive data** exposed in webhook body (only enrollment IDs)
- **Database permissions** limited to necessary tables only
- **Access logs** available in both AppSheet and Google Apps Script

## Rollback Plan

If issues arise:
1. **Disable the bot** immediately via AppSheet interface
2. **Review Code.gs logs** to identify problematic enrollments
3. **Manually delete** incorrect sessions if needed  
4. **Fix virtual column logic** or Code.gs function
5. **Test manually** before re-enabling

The system is designed to be safe - it only generates sessions, doesn't modify existing data.