function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action; 

    // --- Action Router ---
    if (action === "generate_sessions") {
      return handleGenerateSessions(requestData);
    } else if (action === "update_grade") {
      return handleUpdateGrade(requestData);
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

        const sessionsToCreate = (paymentStatus === "Pending Payment") ? 1 : lessonsPaid;
        const financialStatus = (paymentStatus === "Paid") ? "Paid" : "Unpaid";
        
        Logger.log(`Found enrollment data. Creating ${sessionsToCreate} sessions.`);

        let sessionDate = new Date(firstLessonDate);

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