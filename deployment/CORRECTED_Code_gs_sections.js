// =======================================================
// PLANNED RESCHEDULES FEATURE - CODE.GS CORRECTIONS
// =======================================================
// Replace the specified sections in your Code.gs file with these corrected versions

// SECTION 1: Add after line 147 (after holiday logic)
// ===================================================
// FIND THIS SECTION (around line 148):
//     holidayResults.close();
//     holidayStmt.close();
// 
// ADD THIS NEW CODE IMMEDIATELY AFTER:

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

// SECTION 2: Replace the session generation loop (around line 197-230)
// ====================================================================
// FIND THIS SECTION:
//         for (let i = 0; i < sessionsToCreate; i++) {
//             // Find the next valid session date, skipping holidays
//             while (isHoliday(sessionDate, holidays)) {
//                 sessionDate.setDate(sessionDate.getDate() + 7);
//             }
//             
//             // Check for planned reschedules on this date
//             const dateKey = sessionDate.toISOString().slice(0, 10);
//             const plannedReschedule = plannedReschedules.get(dateKey);
//             
//             let sessionStatus = "Scheduled"; // Default status
//             let rescheduledToId = null;
//             let makeUpForId = null;
//             
//             if (plannedReschedule) {
//                 // Always mark original session as rescheduled
//                 sessionStatus = "Rescheduled - Pending Make-up";
//                 Logger.log(`Marking session on ${dateKey} as 'Rescheduled - Pending Make-up' due to planned leave`);
//                 
//                 // If there's a specific make-up date, create the make-up session too
//                 if (plannedReschedule.rescheduleToDate) {
//                     const makeUpSession = {
//                         "id": 0,
//                         "enrollment_id": enrollmentId,
//                         "student_id": studentId,
//                         "tutor_id": tutorId,
//                         "location": location,
//                         "time_slot": timeSlot,
//                         "financial_status": financialStatus,
//                         "session_date": plannedReschedule.rescheduleToDate.toISOString().slice(0, 10),
//                         "session_status": "Make-up Class",
//                         "make_up_for_id": "PLACEHOLDER_ORIGINAL", // Will be updated after original is created
//                         "rescheduled_to_id": null
//                     };
//                     newSessionRows.push(makeUpSession);
//                     Logger.log(`Creating make-up session on ${plannedReschedule.rescheduleToDate.toISOString().slice(0, 10)}`);
//                     
//                     // Mark that original session should reference the make-up
//                     rescheduledToId = "PLACEHOLDER_MAKEUP";
//                 }
//             }
//             
//             const newRow = {
//             "id": 0,
//             "enrollment_id": enrollmentId,
//             "student_id": studentId,
//             "tutor_id": tutorId,
//             "location": location,
//             "time_slot": timeSlot,
//             "financial_status": financialStatus,
//             "session_date": sessionDate.toISOString().slice(0, 10),
//             "session_status": sessionStatus,
//             "rescheduled_to_id": rescheduledToId,
//             "make_up_for_id": makeUpForId
//             };
//             newSessionRows.push(newRow);
// 
//             // Move to the next week for the next session
//             sessionDate.setDate(sessionDate.getDate() + 7);
//         }
//
// REPLACE WITH THIS CORRECTED VERSION:

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
                        "id": 0,
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
                "id": 0,
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

// SECTION 3: Fix connection closing order (around line 238-258)
// ============================================================
// FIND THIS SECTION:
//     if (newSessionRows.length > 0) {
//         Logger.log("Sending " + newSessionRows.length + " rows to AppSheet API.");
//         addRowsToAppSheet(newSessionRows);
//         
//         // Mark applied planned reschedules as "Applied"
//         if (rescheduleIds.length > 0) {
//             const updateRescheduleStmt = conn.prepareStatement(
//                 `UPDATE planned_reschedules SET status = 'Applied' WHERE id IN (${rescheduleIds.map(() => '?').join(',')})`
//             );
//             for (let i = 0; i < rescheduleIds.length; i++) {
//                 updateRescheduleStmt.setInt(i + 1, rescheduleIds[i]);
//             }
//             const updatedReschedules = updateRescheduleStmt.executeUpdate();
//             Logger.log(`Marked ${updatedReschedules} planned reschedules as 'Applied'`);
//             updateRescheduleStmt.close();
//         }
//     } else {
//         Logger.log("No session rows were created, so not calling API.");
//     }
//     
//     conn.close();
//
// REPLACE WITH THIS CORRECTED VERSION:

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

// =======================================================
// SUMMARY OF CHANGES:
// 1. Added planned reschedules query logic
// 2. Removed placeholder IDs that would break AppSheet
// 3. Fixed database connection closing order
// 4. Simplified session linking (removed for now)
// =======================================================