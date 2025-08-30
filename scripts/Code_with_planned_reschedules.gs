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
  const schoolStudentId = data.schoolStudentId;
  const homeLocation = data.homeLocation;
  const studentName = data.studentName; // For logging purposes
  const newGrade = data.newGrade;
  const newPhone = data.newPhone;

  Logger.log(`Processing student info update for: ${studentName} (ID: ${schoolStudentId}, Location: ${homeLocation})`);
  Logger.log(`New Grade: ${newGrade}, New Phone: ${newPhone}`);

  const connectionString = "";
  const username = "";
  const password = "";

  const conn = Jdbc.getCloudSqlConnection(connectionString, username, password);
  
  try {
    // Validate required identifiers
    if (!schoolStudentId || !homeLocation) {
      Logger.log("Missing required identifiers: schoolStudentId or homeLocation");
      return ContentService.createTextOutput(JSON.stringify({ 
        "Status": "Error", 
        "Message": "Missing required identifiers: Student ID or Location" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Build dynamic SQL based on what fields are provided
    let updateFields = [];
    let params = [];

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

    const sql = `UPDATE students SET ${updateFields.join(", ")} WHERE school_student_id = ? AND home_location = ?`;
    Logger.log(`Executing SQL: ${sql}`);
    Logger.log(`Parameters: schoolStudentId=${schoolStudentId}, homeLocation=${homeLocation}`);

    const stmt = conn.prepareStatement(sql);
    
    // Set update field parameters
    for (let i = 0; i < params.length; i++) {
      stmt.setString(i + 1, params[i].value);
    }
    
    // Set WHERE clause parameters
    stmt.setString(params.length + 1, schoolStudentId);
    stmt.setString(params.length + 2, homeLocation);

    const rowsUpdated = stmt.executeUpdate();
    Logger.log(`Updated ${rowsUpdated} rows`);
    
    stmt.close();
    conn.close();
    
    if (rowsUpdated > 0) {
      const updateSummary = params.map((p, i) => `${updateFields[i].split(' = ')[0]}: ${p.value}`).join(', ');
      Logger.log(`Successfully updated student ${schoolStudentId} (${homeLocation}): ${updateSummary}`);
      return ContentService.createTextOutput(JSON.stringify({ 
        "Status": "Success", 
        "Message": `Updated ${updateSummary} for student ${schoolStudentId} at ${homeLocation}` 
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      Logger.log(`No student found with ID: ${schoolStudentId} at location: ${homeLocation}`);
      return ContentService.createTextOutput(JSON.stringify({ 
        "Status": "Warning", 
        "Message": `No student found with ID ${schoolStudentId} at ${homeLocation}` 
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
    // Remove commas from the ID string before parsing
    const cleanEnrollmentId = data.enrollmentId.toString().replace(/,/g, '');
    const enrollmentId = parseInt(cleanEnrollmentId, 10);

    // Log that we received the ID
    Logger.log("Raw Enrollment ID: " + data.enrollmentId);
    Logger.log("Cleaned Enrollment ID: " + enrollmentId);

    // Log that we received the ID
    Logger.log("Received Enrollment ID: " + enrollmentId);

    const connectionString = "";
    const username = "";
    const password = "";

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

    // Get planned reschedules for this enrollment
    const rescheduleStmt = conn.prepareStatement(
        "SELECT planned_date, reschedule_to_date, id FROM planned_reschedules WHERE enrollment_id = ? AND status = 'Pending'"
    );
    rescheduleStmt.setInt(1, enrollmentId);
    const rescheduleResults = rescheduleStmt.executeQuery();
    const plannedReschedules = new Map();
    const rescheduleIds = [];
    
    while (rescheduleResults.next()) {
        const plannedDate = new Date(rescheduleResults.getDate("planned_date").getTime());
        const dateKey = plannedDate.toISOString().slice(0, 10);
        plannedReschedules.set(dateKey, {
            rescheduleToDate: rescheduleResults.getDate("reschedule_to_date") ? 
                new Date(rescheduleResults.getDate("reschedule_to_date").getTime()) : null,
            id: rescheduleResults.getInt("id")
        });
        rescheduleIds.push(rescheduleResults.getInt("id"));
    }
    rescheduleResults.close();
    rescheduleStmt.close();
    
    Logger.log(`Found ${plannedReschedules.size} planned reschedules for enrollment ${enrollmentId}`);

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

        // Check if sessions already exist for this enrollment to prevent duplicates
        const existingSessionsStmt = conn.prepareStatement(
            "SELECT COUNT(*) as session_count FROM session_log WHERE enrollment_id = ?"
        );
        existingSessionsStmt.setInt(1, enrollmentId);
        const existingResults = existingSessionsStmt.executeQuery();

        let existingSessionCount = 0;
        if (existingResults.next()) {
            existingSessionCount = existingResults.getInt("session_count");
        }
        existingResults.close();
        existingSessionsStmt.close();

        // If sessions already exist, don't create more
        if (existingSessionCount > 0) {
            Logger.log(`Sessions already exist for enrollment ${enrollmentId} (${existingSessionCount} sessions found). Skipping generation.`);
            results.close();
            stmt.close();
            conn.close();
            return ContentService.createTextOutput(JSON.stringify({ 
                "Status": "Warning", 
                "Message": `Sessions already exist for this enrollment (${existingSessionCount} sessions found)` 
            })).setMimeType(ContentService.MimeType.JSON);
        }

        Logger.log(`No existing sessions found for enrollment ${enrollmentId}. Proceeding with session generation.`);

        const sessionsToCreate = (paymentStatus === "Pending Payment") ? 1 : lessonsPaid;
        const financialStatus = (paymentStatus === "Paid") ? "Paid" : "Unpaid";
        
        Logger.log(`Found enrollment data. Creating ${sessionsToCreate} sessions.`);

        let sessionDate = new Date(firstLessonDate);

        for (let i = 0; i < sessionsToCreate; i++) {
            // Find the next valid session date, skipping holidays
            while (isHoliday(sessionDate, holidays)) {
                sessionDate.setDate(sessionDate.getDate() + 7);
            }
            
            // Check for planned reschedules on this date
            const dateKey = sessionDate.toISOString().slice(0, 10);
            const plannedReschedule = plannedReschedules.get(dateKey);
            
            let sessionStatus = "Scheduled"; // Default status
            
            if (plannedReschedule) {
                // Always mark original session as rescheduled
                sessionStatus = "Rescheduled - Pending Make-up";
                Logger.log(`Marking session on ${dateKey} as 'Rescheduled - Pending Make-up' due to planned leave`);
                
                // If there's a specific make-up date, create the make-up session too
                if (plannedReschedule.rescheduleToDate) {
                    const makeUpSession = {
                        "id": Math.floor(Math.random() * (9999999 - 1000000 + 1)) + 1000000,
                        "enrollment_id": enrollmentId,
                        "student_id": studentId,
                        "tutor_id": tutorId,
                        "location": location,
                        "time_slot": timeSlot,
                        "financial_status": financialStatus,
                        "session_date": plannedReschedule.rescheduleToDate.toISOString().slice(0, 10),
                        "session_status": "Make-up Class"
                    };
                    newSessionRows.push(makeUpSession);
                    Logger.log(`Creating make-up session on ${plannedReschedule.rescheduleToDate.toISOString().slice(0, 10)}`);
                }
            }
            
            const newRow = {
                "id": Math.floor(Math.random() * (9999999 - 1000000 + 1)) + 1000000,
                "enrollment_id": enrollmentId,
                "student_id": studentId,
                "tutor_id": tutorId,
                "location": location,
                "time_slot": timeSlot,
                "financial_status": financialStatus,
                "session_date": sessionDate.toISOString().slice(0, 10),
                "session_status": sessionStatus
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

    if (newSessionRows.length > 0) {
        // Update reschedule status FIRST (while connection is open)
        if (rescheduleIds.length > 0) {
            const updateRescheduleStmt = conn.prepareStatement(
                `UPDATE planned_reschedules SET status = 'Applied' WHERE id IN (${rescheduleIds.map(() => '?').join(',')})`
            );
            for (let i = 0; i < rescheduleIds.length; i++) {
                updateRescheduleStmt.setInt(i + 1, rescheduleIds[i]);
            }
            const updatedReschedules = updateRescheduleStmt.executeUpdate();
            Logger.log(`Marked ${updatedReschedules} planned reschedules as 'Applied'`);
            updateRescheduleStmt.close();
        }
        
        // THEN close connection
        conn.close();
        
        // THEN call AppSheet API
        Logger.log("Sending " + newSessionRows.length + " rows to AppSheet API.");
        addRowsToAppSheet(newSessionRows);
    } else {
        Logger.log("No session rows were created, so not calling API.");
        conn.close();
    }

    return ContentService.createTextOutput(JSON.stringify({ "Status": "Success" })).setMimeType(ContentService.MimeType.JSON);
}


function addRowsToAppSheet(rowsToAdd) {

  const app_id = "YOUR_APP_ID";
  const api_key = "YOUR_API_KEY";
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
    // Remove commas from the ID string before parsing
    const cleanEnrollmentId = data.enrollmentId.toString().replace(/,/g, '');
    const enrollmentId = parseInt(cleanEnrollmentId, 10);
    
    Logger.log("Raw Enrollment ID: " + data.enrollmentId);
    
    Logger.log("Processing payment confirmation for Enrollment ID: " + enrollmentId);
    
    const connectionString = "";
    const username = "";
    const password = "";
    
    const conn = Jdbc.getCloudSqlConnection(connectionString, username, password);
    
    try {
        // Step 1: Update all related sessions to "Paid"
        const updateStmt = conn.prepareStatement(
            "UPDATE session_log SET financial_status = 'Paid', last_modified_by = 'System', last_modified_time = CONVERT_TZ(NOW(), '+00:00', '+08:00') WHERE enrollment_id = ?"
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
                // Generate remaining sessions directly (no duplicate check needed)
                const remainingSessions = lessonsPaid - sessionCount;
                Logger.log(`Generating ${remainingSessions} additional sessions`);
                
                // Get enrollment details for session generation (same as handleGenerateSessions)
                const detailsStmt = conn.prepareStatement("SELECT * FROM enrollments WHERE id = ?");
                detailsStmt.setInt(1, enrollmentId);
                const detailsResults = detailsStmt.executeQuery();
                
                if (detailsResults.next()) {
                    const studentId = detailsResults.getInt("student_id");
                    const tutorId = detailsResults.getInt("tutor_id");
                    const firstLessonDate = new Date(detailsResults.getDate("first_lesson_date").getTime());
                    const timeSlot = detailsResults.getString("assigned_time");
                    const location = detailsResults.getString("location");
                    
                    detailsResults.close();
                    detailsStmt.close();
                    
                    // Generate remaining sessions starting from the next week after existing sessions
                    let sessionDate = new Date(firstLessonDate);
                    // Skip ahead to account for existing sessions
                    sessionDate.setDate(sessionDate.getDate() + (sessionCount * 7));
                    
                    const newSessionRows = [];
                    
                    // Get holidays once before the loop
                    const holidayStmt = conn.prepareStatement("SELECT holiday_date FROM holidays");
                    const holidayResults = holidayStmt.executeQuery();
                    const holidays = [];
                    while (holidayResults.next()) {
                        holidays.push(new Date(holidayResults.getDate("holiday_date").getTime()));
                    }
                    holidayResults.close();
                    holidayStmt.close();
                    
                    for (let i = 0; i < remainingSessions; i++) {
                        // Skip holidays
                        while (isHoliday(sessionDate, holidays)) {
                            sessionDate.setDate(sessionDate.getDate() + 7);
                        }
                        
                        const sessionRow = {
                            "id": Math.floor(Math.random() * (9999999 - 1000000 + 1)) + 1000000,
                            "enrollment_id": enrollmentId,
                            "student_id": studentId,
                            "tutor_id": tutorId,
                            "location": location,
                            "time_slot": timeSlot,
                            "financial_status": "Paid",
                            "session_date": sessionDate.toISOString().slice(0, 10),
                            "session_status": "Scheduled"
                        };
                        
                        newSessionRows.push(sessionRow);
                        sessionDate.setDate(sessionDate.getDate() + 7);
                    }
                    
                    enrollResults.close();
                    enrollStmt.close();
                    conn.close();
                    
                    // Add the new sessions via AppSheet API
                    if (newSessionRows.length > 0) {
                        addRowsToAppSheet(newSessionRows);
                        Logger.log(`Successfully generated ${newSessionRows.length} additional sessions`);
                    }
                    
                    return ContentService.createTextOutput(JSON.stringify({ 
                        "Status": "Success", 
                        "Message": `Payment confirmed. Generated ${remainingSessions} additional sessions.` 
                    })).setMimeType(ContentService.MimeType.JSON);
                }
                
                detailsResults.close();
                detailsStmt.close();
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