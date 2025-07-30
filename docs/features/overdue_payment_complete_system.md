# Complete Overdue Payment Management System

## Overview

This document provides a comprehensive implementation guide for the overdue payment workflow, including real-time overdue detection, payment confirmation actions, and automated session management.

## Architecture Overview

**Flow:** Overdue Detection (Virtual Columns) → Overdue Accounts View → Confirm Payment Action → Payment Confirmation Bot → Apps Script Updates

---

## Part 1: Real-Time Overdue Detection

### Step 1: Add Virtual Columns to `enrollments` Table

Navigate to **Data > Tables > enrollments** and add these virtual columns:

#### 1. `Dynamic_Payment_Status` (Text)
**Expression:**
```
IF(
  AND(
    [payment_status] = "Pending Payment",
    TODAY() >= [first_lesson_date]
  ),
  "Overdue",
  [payment_status]
)
```
**Purpose:** Real-time overdue detection - immediately flags enrollments as overdue when first lesson date passes

#### 2. `Days_Overdue` (Number)
**Expression:**
```
IF(
  [Dynamic_Payment_Status] = "Overdue",
  TODAY() - [first_lesson_date],
  0
)
```
**Purpose:** Calculates days overdue from first lesson date

#### 3. `Urgency_Level` (Text)
**Expression:**
```
IF(
  [Dynamic_Payment_Status] = "Overdue",
  IF(
    [Days_Overdue] > 30, "🔴 Critical",
    IF(
      [Days_Overdue] > 7, "🟡 Urgent", 
      "🟢 Recent"
    )
  ),
  "⏳ Pending"
)
```
**Purpose:** Visual urgency indicators for admin prioritization

#### 4. `Outstanding_Sessions` (Number)
**Expression:**
```
COUNT(
  SELECT(
    session_log[id], 
    AND(
      [enrollment_id] = [_THISROW].[id],
      [financial_status] = "Unpaid"
    )
  )
)
```
**Purpose:** Shows number of unpaid sessions for each enrollment

#### 5. `Contact_Action_Required` (Text)
**Expression:**
```
IF(
  [Dynamic_Payment_Status] = "Overdue",
  CONCATENATE("URGENT: Contact parent - ", [Days_Overdue], " days overdue"),
  "Follow up on pending payment"
)
```
**Purpose:** Clear action guidance for administrators

---

## Part 2: Overdue Accounts View

### Step 2: Create Overdue Accounts View

Navigate to **UX > Views > New View**

#### View Configuration:
| Setting | Value |
|---------|-------|
| **View Name** | `Overdue Accounts` |
| **For This Data** | `enrollments` |
| **View Type** | `Table` or `Cards` |

#### Filter Condition:
```
OR(
  [Dynamic_Payment_Status] = "Overdue",
  [payment_status] = "Pending Payment"
)
```

#### Columns to Display:
- `student_name` (from related students table)
- `tutor_name` (from related tutors table)  
- `Dynamic_Payment_Status`
- `Urgency_Level`
- `Days_Overdue`
- `Outstanding_Sessions`
- `first_lesson_date`
- `lessons_paid`
- `assigned_day`
- `assigned_time`
- `location`
- `Contact_Action_Required`

#### Sorting:
- **Primary:** `Dynamic_Payment_Status` (Overdue first)
- **Secondary:** `Days_Overdue` (most overdue first)

---

## Part 3: Payment Confirmation System

### Step 3: Create Confirm Payment Action

Navigate to **Behavior > Actions > New Action**

#### Action Configuration:
| Setting | Value |
|---------|-------|
| **Action Name** | `Confirm Payment` |
| **For a Record Of** | `enrollments` |
| **Do This** | `Data: set the values of some columns in this row` |

#### Fields to Update:
| Column | Expression |
|--------|------------|
| `payment_status` | `"Paid"` |
| `payment_date` | `TODAY()` |
| `last_modified_by` | `USEREMAIL()` |
| `last_modified_time` | `NOW()` |

#### Availability Settings:
**Show If:**
```
OR(
  [payment_status] = "Pending Payment",
  [Dynamic_Payment_Status] = "Overdue"
)
```

**Behavior:**
- ✅ **Needs Confirmation:** `"Confirm payment for <<[student_name]>>? This will mark all related sessions as paid and generate any missing sessions."`
- ✅ **Prominent:** Yes
- **Icon:** 💰 or ✅

### Step 4: Create Payment Confirmation Bot

Navigate to **Automation > Bots > New Bot**

#### Bot Configuration:
| Setting | Value |
|---------|-------|
| **Bot Name** | `Payment Confirmation Processor` |
| **Table** | `enrollments` |
| **Event** | `Updates only` |
| **Condition** | `AND([payment_status] = "Paid", [_THISROW_BEFORE].[payment_status] <> "Paid")` |

#### Bot Task - Call Webhook:
| Setting | Value |
|---------|-------|
| **Task Type** | `Call a webhook` |
| **Webhook URL** | `https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec` |
| **HTTP Method** | `POST` |

#### Webhook Body:
```json
{
  "action": "confirm_payment",
  "enrollmentId": "<<[id]>>"
}
```

---

## Part 4: Google Apps Script Implementation

### Step 5: Update Your Google Apps Script

**File:** `Code.gs`

```javascript
function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action; 

    // --- Action Router ---
    if (action === "generate_sessions") {
      return handleGenerateSessions(requestData);
    } else if (action === "update_grade") {
      return handleUpdateGrade(requestData);
    } else if (action === "confirm_payment") {
      return handleConfirmPayment(requestData);
    }
    // ---------------------

    return ContentService.createTextOutput(JSON.stringify({ "Status": "Unknown action" })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log("An error occurred in doPost: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ "Status": "Error", "Message": error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleUpdateGrade(data) {
  const studentName = data.studentName;
  const newGrade = data.newGrade;

  const connectionString = "jdbc:google:mysql://YOUR_INSTANCE_CONNECTION_NAME/csm_db";
  const username = "AppSheet";
  const password = "PASSWORD";

  const conn = Jdbc.getCloudSqlConnection(connectionString, username, password);
  const stmt = conn.prepareStatement("UPDATE students SET grade = ? WHERE student_name = ?");
  stmt.setString(1, newGrade);
  stmt.setString(2, studentName);
  stmt.execute();
  
  stmt.close();
  conn.close();
  
  Logger.log(`Updated grade for ${studentName} to ${newGrade}`);
  return ContentService.createTextOutput(JSON.stringify({ "Status": "Success" })).setMimeType(ContentService.MimeType.JSON);
}

function isHoliday(date, holidays) {
    for (let i = 0; i < holidays.length; i++) {
        if (date.getTime() === holidays[i].getTime()) {
            return true;
        }
    }
    return false;
}

function handleGenerateSessions(data) {
    const enrollmentId = parseInt(data.enrollmentId, 10);

    // Log that we received the ID
    Logger.log("Received Enrollment ID: " + enrollmentId);

    const connectionString = "jdbc:google:mysql://YOUR_INSTANCE_CONNECTION_NAME/csm_db";
    const username = "AppSheet";
    const password = "PASSWORD";

    const conn = Jdbc.getCloudSqlConnection(connectionString, username, password);

    // Get holidays
    const holidayStmt = conn.prepareStatement("SELECT holiday_date FROM holidays");
    const holidayResults = holidayStmt.executeQuery();
    const holidays = [];
    while (holidayResults.next()) {
        holidays.push(new Date(holidayResults.getDate("holiday_date").getTime()));
    }
    holidayResults.close();
    holidayStmt.close();

    const stmt = conn.prepareStatement("SELECT * FROM enrollments WHERE id = ?");
    stmt.setInt(1, enrollmentId);
    const results = stmt.executeQuery();

    let newSessionRows = [];

    if (results.next()) {
        const studentId = results.getInt("student_id");
        const tutorId = results.getInt("tutor_id");
        const lessonsPaid = results.getInt("lessons_paid");
        const firstLessonDate = new Date(results.getDate("first_lesson_date").getTime());
        const paymentStatus = results.getString("payment_status");
        const timeSlot = results.getString("assigned_time");
        const location = results.getString("location");

        // Enhanced logic for payment confirmation scenarios
        const existingSessionsStmt = conn.prepareStatement(
            "SELECT COUNT(*) as session_count FROM session_log WHERE enrollment_id = ?"
        );
        existingSessionsStmt.setInt(1, enrollmentId);
        const existingResults = existingSessionsStmt.executeQuery();
        
        let existingSessions = 0;
        if (existingResults.next()) {
            existingSessions = existingResults.getInt("session_count");
        }
        existingResults.close();
        existingSessionsStmt.close();

        // Calculate sessions to create
        let sessionsToCreate = 0;
        if (paymentStatus === "Paid") {
            sessionsToCreate = Math.max(0, lessonsPaid - existingSessions);
        } else if (paymentStatus === "Pending Payment") {
            sessionsToCreate = Math.min(1, Math.max(0, lessonsPaid - existingSessions));
        }

        const financialStatus = (paymentStatus === "Paid") ? "Paid" : "Unpaid";
        
        Logger.log(`Found enrollment data. Existing sessions: ${existingSessions}, Creating ${sessionsToCreate} sessions.`);

        if (sessionsToCreate > 0) {
            // Calculate starting date for new sessions
            let sessionDate = new Date(firstLessonDate);
            
            // If sessions already exist, start from the next week after the last session
            if (existingSessions > 0) {
                sessionDate.setDate(sessionDate.getDate() + (existingSessions * 7));
            }

            for (let i = 0; i < sessionsToCreate; i++) {
                // Find the next valid session date, skipping holidays
                while (isHoliday(sessionDate, holidays)) {
                    sessionDate.setDate(sessionDate.getDate() + 7);
                }
                
                const newRow = {
                "id": 0,
                "enrollment_id": enrollmentId,
                "student_id": studentId,
                "tutor_id": tutorId,
                "location": location,
                "time_slot": timeSlot,
                "financial_status": financialStatus,
                "session_date": sessionDate.toISOString().slice(0, 10)
                };
                newSessionRows.push(newRow);

                // Move to the next week for the next session
                sessionDate.setDate(sessionDate.getDate() + 7);
            }
        }
    } else {
        Logger.log("Error: Could not find Enrollment with ID: " + enrollmentId);
    }

    results.close();
    stmt.close();
    conn.close();

    if (newSessionRows.length > 0) {
        Logger.log("Sending " + newSessionRows.length + " rows to AppSheet API.");
        addRowsToAppSheet(newSessionRows);
    } else {
        Logger.log("No session rows were created, so not calling API.");
    }

    return ContentService.createTextOutput(JSON.stringify({ "Status": "Success" })).setMimeType(ContentService.MimeType.JSON);
}

function addRowsToAppSheet(rowsToAdd) {
  const app_id = "APP_ID";
  const api_key = "API_KEY";
  const table_name = "session_log";

  const url = `https://api.appsheet.com/api/v2/apps/${app_id}/tables/${table_name}/Action`;
  
  const payload = {
    "Action": "Add",
    "Properties": {
      "Locale": "en-US"
    },
    "Rows": rowsToAdd
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'ApplicationAccessKey': api_key
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  const response = UrlFetchApp.fetch(url, options);
  Logger.log("API Response: " + response.getContentText());
}

function handleConfirmPayment(data) {
    const enrollmentId = parseInt(data.enrollmentId, 10);
    
    Logger.log("Processing payment confirmation for Enrollment ID: " + enrollmentId);
    
    const connectionString = "jdbc:google:mysql://YOUR_INSTANCE_CONNECTION_NAME/csm_db";
    const username = "AppSheet";
    const password = "PASSWORD";
    
    const conn = Jdbc.getCloudSqlConnection(connectionString, username, password);
    
    try {
        // Step 1: Update all related sessions to "Paid"
        const updateStmt = conn.prepareStatement(
            "UPDATE session_log SET financial_status = 'Paid', last_modified_by = 'System', last_modified_time = NOW() WHERE enrollment_id = ?"
        );
        updateStmt.setInt(1, enrollmentId);
        const updatedRows = updateStmt.executeUpdate();
        Logger.log(`Updated ${updatedRows} sessions to 'Paid' status`);
        updateStmt.close();
        
        // Step 2: Check if we need to generate additional sessions
        const countStmt = conn.prepareStatement(
            "SELECT COUNT(*) as session_count FROM session_log WHERE enrollment_id = ?"
        );
        countStmt.setInt(1, enrollmentId);
        const countResults = countStmt.executeQuery();
        
        let sessionCount = 0;
        if (countResults.next()) {
            sessionCount = countResults.getInt("session_count");
        }
        countResults.close();
        countStmt.close();
        
        // Step 3: Get enrollment details to check if more sessions needed
        const enrollStmt = conn.prepareStatement("SELECT lessons_paid FROM enrollments WHERE id = ?");
        enrollStmt.setInt(1, enrollmentId);
        const enrollResults = enrollStmt.executeQuery();
        
        if (enrollResults.next()) {
            const lessonsPaid = enrollResults.getInt("lessons_paid");
            Logger.log(`Enrollment has ${lessonsPaid} lessons paid, ${sessionCount} sessions exist`);
            
            if (sessionCount < lessonsPaid) {
                // Generate remaining sessions
                Logger.log(`Generating ${lessonsPaid - sessionCount} additional sessions`);
                enrollResults.close();
                enrollStmt.close();
                conn.close();
                
                // Call the existing session generation function
                return handleGenerateSessions({enrollmentId: enrollmentId});
            } else {
                Logger.log("All sessions already exist, no additional generation needed");
            }
        }
        enrollResults.close();
        enrollStmt.close();
        
    } catch (error) {
        Logger.log("Error in handleConfirmPayment: " + error.toString());
        conn.close();
        return ContentService.createTextOutput(JSON.stringify({ 
            "Status": "Error", 
            "Message": error.toString() 
        })).setMimeType(ContentService.MimeType.JSON);
    }
    
    conn.close();
    Logger.log("Payment confirmation completed successfully");
    
    return ContentService.createTextOutput(JSON.stringify({ 
        "Status": "Success",
        "Message": "Payment confirmed and sessions updated"
    })).setMimeType(ContentService.MimeType.JSON);
}
```

---

## Part 5: Testing & Validation

### Testing Checklist

#### 1. Virtual Columns Test
- [X] Create enrollment with "Pending Payment" status
- [X] Set `first_lesson_date` to yesterday
- [X] Verify `Dynamic_Payment_Status` shows "Overdue"
- [X] Check `Days_Overdue` calculation is correct
- [X] Confirm `Urgency_Level` displays appropriate emoji

#### 2. Overdue Accounts View Test
- [X] Navigate to Overdue Accounts view
- [X] Verify overdue enrollments appear
- [X] Check sorting (overdue first, then by days overdue)
- [X] Confirm all virtual columns display correctly

#### 3. Confirm Payment Action Test
- [X] Click "Confirm Payment" on overdue enrollment
- [X] Verify confirmation dialog appears
- [X] Check enrollment updates to "Paid" status
- [X] Confirm `payment_date` is set to today

#### 4. Payment Confirmation Bot Test
- [ ] Verify bot triggers when payment_status changes to "Paid"
- [ ] Check Google Apps Script execution logs
- [ ] Confirm all related sessions update to "Paid"
- [ ] Verify missing sessions are generated

#### 5. End-to-End Integration Test
- [ ] Create test enrollment with 6 lessons, "Pending Payment"
- [ ] Generate 1 session (should be "Unpaid")
- [ ] Use "Confirm Payment" action
- [ ] Verify:
   - Enrollment becomes "Paid"
   - Existing session becomes "Paid"
   - 5 additional sessions are created as "Paid"
   - All sessions respect holiday calendar

### Troubleshooting

#### Common Issues:

**Bot not triggering:**
- Check bot condition matches payment status change
- Verify bot is enabled and deployed
- Review AppSheet automation logs

**Webhook failures:**
- Confirm Google Apps Script is deployed as Web App
- Check webhook URL is correct
- Verify Apps Script permissions

**Sessions not updating:**
- Review Google Apps Script execution logs
- Check database connection credentials
- Verify enrollment ID is being passed correctly

**Virtual columns not calculating:**
- Check expression syntax
- Verify column names match database schema
- Test expressions individually

---

## Part 6: Deployment Steps

### Deployment Checklist

1. **✅ Add virtual columns to enrollments table**
2. **✅ Create Overdue Accounts view with filters**
3. **✅ Create Confirm Payment action**
4. **✅ Create Payment Confirmation bot**
5. **✅ Update and redeploy Google Apps Script**
6. **✅ Update bot webhook URL with new deployment**
7. **✅ Test complete workflow end-to-end**
8. **✅ Train admin users on new workflow**

### Security Considerations

- Virtual columns provide real-time calculations without database changes
- Action requires user confirmation before executing
- Bot only triggers on specific payment status changes
- Apps Script updates include audit trail information
- Webhook uses HTTPS for secure communication

### Performance Notes

- Virtual columns are calculated in real-time (efficient for small datasets)
- Bot triggers only on payment confirmations (minimal overhead)
- Apps Script includes error handling and logging
- Session generation respects existing holiday logic

This complete system provides a professional, automated solution for managing overdue payments while maintaining data integrity and providing clear audit trails.