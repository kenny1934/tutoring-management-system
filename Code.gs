function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const enrollmentId = parseInt(requestData.enrollmentId, 10);

    // Log that we received the ID
    Logger.log("Received Enrollment ID: " + enrollmentId);

    const connectionString = "jdbc:google:mysql://csm-database-project:asia-east2:csm-regular-course-db/csm_db";
    const username = "AppSheet";
    const password = "PASSWORD";

    const conn = Jdbc.getCloudSqlConnection(connectionString, username, password);
    const stmt = conn.prepareStatement("SELECT * FROM enrollments WHERE id = ?");
    stmt.setInt(1, enrollmentId);
    const results = stmt.executeQuery();
    
    let newSessionRows = [];

    if (results.next()) {
        const studentId = results.getInt("student_id");
        const tutorId = results.getInt("tutor_id");
        // ... (rest of the variables are the same)
        const lessonsPaid = results.getInt("lessons_paid");
        const firstLessonDate = new Date(results.getDate("first_lesson_date").getTime());
        const paymentStatus = results.getString("payment_status");
        const timeSlot = results.getString("assigned_time");
        const location = results.getString("location");

        const sessionsToCreate = (paymentStatus === "Pending Payment") ? 1 : lessonsPaid;
        const financialStatus = (paymentStatus === "Paid") ? "Paid" : "Unpaid";
        
        // Log the data we found
        Logger.log(`Found enrollment data. Creating ${sessionsToCreate} sessions.`);

        for (let i = 0; i < sessionsToCreate; i++) {
          const sessionDate = new Date(firstLessonDate);
          sessionDate.setDate(firstLessonDate.getDate() + (7 * i));
          
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
        }
    } else {
        Logger.log("Error: Could not find Enrollment with ID: " + enrollmentId);
    }
    
    results.close();
    stmt.close();
    conn.close();
    
    // Only call the API if we have rows to add
    if (newSessionRows.length > 0) {
      Logger.log("Sending " + newSessionRows.length + " rows to AppSheet API.");
      addRowsToAppSheet(newSessionRows);
    } else {
      Logger.log("No session rows were created, so not calling API.");
    }

    return ContentService.createTextOutput(JSON.stringify({ "Status": "Success" })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log("An error occurred: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ "Status": "Error", "Message": error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}


function addRowsToAppSheet(rowsToAdd) {
  // --- IMPORTANT: REPLACE THESE THREE VALUES ---
  const app_id = "1f760119-c3f7-4de2-ad91-3ce0d22c2f26";
  const api_key = "V2-u9kx4-HldQb-mxnVw-EBEVM-yxU5b-1zP0F-rvFDW-VOJQT";
  const table_name = "session_log";
  // ------------------------------------------

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
  // Log the response from the AppSheet API
  Logger.log("API Response: " + response.getContentText());
}