function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action; 

    // --- Action Router ---
    if (action === "generate_sessions") {
      return handleGenerateSessions(requestData);
    } else if (action === "update_student_info") {
      return handleUpdateStudentInfo(requestData);
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


function handleUpdateStudentInfo(data) {
  const studentName = data.studentName;
  const newGrade = data.newGrade;
  const newPhone = data.newPhone;

  Logger.log(`Processing student info update for: ${studentName}`);
  Logger.log(`New Grade: ${newGrade}, New Phone: ${newPhone}`);

  const connectionString = "jdbc:google:mysql://YOUR_INSTANCE_CONNECTION_NAME/csm_db";
  const username = "AppSheet";
  const password = "PASSWORD";

  const conn = Jdbc.getCloudSqlConnection(connectionString, username, password);
  
  try {
    // Build dynamic SQL based on what fields are provided
    let updateFields = [];
    let params = [];
    let paramIndex = 1;

    if (newGrade !== undefined && newGrade !== null && newGrade !== "") {
      updateFields.push("grade = ?");
      params.push({ value: newGrade, type: "string" });
    }

    if (newPhone !== undefined && newPhone !== null && newPhone !== "") {
      updateFields.push("phone = ?");
      params.push({ value: newPhone, type: "string" });
    }

    if (updateFields.length === 0) {
      Logger.log("No fields to update");
      return ContentService.createTextOutput(JSON.stringify({ 
        "Status": "Warning", 
        "Message": "No fields provided for update" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const sql = `UPDATE students SET ${updateFields.join(", ")} WHERE student_name = ?`;
    Logger.log(`Executing SQL: ${sql}`);

    const stmt = conn.prepareStatement(sql);
    
    // Set parameters
    for (let i = 0; i < params.length; i++) {
      stmt.setString(i + 1, params[i].value);
    }
    stmt.setString(params.length + 1, studentName); // WHERE clause parameter

    const rowsUpdated = stmt.executeUpdate();
    Logger.log(`Updated ${rowsUpdated} rows`);
    
    stmt.close();
    conn.close();
    
    if (rowsUpdated > 0) {
      const updateSummary = params.map((p, i) => `${updateFields[i].split(' = ')[0]}: ${p.value}`).join(', ');
      Logger.log(`Successfully updated ${studentName}: ${updateSummary}`);
      return ContentService.createTextOutput(JSON.stringify({ 
        "Status": "Success", 
        "Message": `Updated ${updateSummary} for ${studentName}` 
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      Logger.log(`No student found with name: ${studentName}`);
      return ContentService.createTextOutput(JSON.stringify({ 
        "Status": "Warning", 
        "Message": `No student found with name: ${studentName}` 
      })).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    Logger.log(`Error updating student info: ${error.toString()}`);
    conn.close();
    return ContentService.createTextOutput(JSON.stringify({ 
      "Status": "Error", 
      "Message": error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
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