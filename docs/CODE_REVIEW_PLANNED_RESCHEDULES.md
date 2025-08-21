# Code Review: Planned Reschedules Implementation

## Issues Identified

### Issue 1: Placeholder ID Problem ⚠️
**Problem:** The current code uses placeholder strings for `rescheduled_to_id` and `make_up_for_id`, but AppSheet expects actual numeric IDs.

**Current problematic code:**
```javascript
"make_up_for_id": "PLACEHOLDER_ORIGINAL"
"rescheduled_to_id": "PLACEHOLDER_MAKEUP" 
```

**Impact:** AppSheet will reject these sessions or create broken references.

### Issue 2: Connection Closing Timing ⚠️
**Problem:** Database connection is closed before updating planned reschedule status.

**Current code flow:**
1. Query planned reschedules ✅
2. Generate sessions ✅  
3. Close connection ❌
4. Try to update reschedule status ❌ (connection closed)

## Recommended Fixes

### Fix 1: Remove Placeholder IDs (Immediate Solution)
**Approach:** Create sessions without linking initially, then link them in a separate update.

```javascript
// Remove placeholder IDs - create sessions as separate entities
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
    // Remove: "make_up_for_id": "PLACEHOLDER_ORIGINAL"
    // Remove: "rescheduled_to_id": null
};

const originalSession = {
    // ... other fields
    "session_status": sessionStatus
    // Remove: "rescheduled_to_id": rescheduledToId,
    // Remove: "make_up_for_id": makeUpForId
};
```

### Fix 2: Move Connection Closing
**Move `conn.close()` to after all database operations:**

```javascript
// Current (incorrect):
conn.close();
if (newSessionRows.length > 0) {
    // ... update reschedule status (fails - connection closed)
}

// Fixed:
if (newSessionRows.length > 0) {
    addRowsToAppSheet(newSessionRows);
    
    // Update reschedule status BEFORE closing connection
    if (rescheduleIds.length > 0) {
        // ... update operations
    }
}
conn.close(); // Move to end
```

### Fix 3: Enhanced Linking (Future Enhancement)
**For proper session linking, implement a follow-up process:**

1. **Phase 1:** Create sessions without links (current fix)
2. **Phase 2:** After AppSheet creates sessions with real IDs, link them via separate action
3. **Phase 3:** Use session metadata (date, enrollment) to identify and link related sessions

## Recommended Implementation Order

### Immediate (Fix Critical Issues):
1. **Remove placeholder IDs** - prevents AppSheet errors
2. **Fix connection closing order** - ensures reschedule status updates work

### Future Enhancement:
3. **Implement proper session linking** via separate linking action/process

## Updated Code Sections Needed

### Section 1: Remove Placeholder Logic
```javascript
// Simplified approach - no linking initially
if (plannedReschedule) {
    sessionStatus = "Rescheduled - Pending Make-up";
    
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
```

### Section 2: Fix Connection Management
```javascript
// Move all database operations before connection close
if (newSessionRows.length > 0) {
    // Update reschedule status FIRST (while connection open)
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
    addRowsToAppSheet(newSessionRows);
} else {
    conn.close();
}
```

## Testing Requirements

After implementing fixes:

1. **Test leave-only scenario:**
   - Add planned reschedule without make-up date
   - Generate sessions
   - Verify: Original session status = "Rescheduled - Pending Make-up"
   - Verify: Planned reschedule status = "Applied"

2. **Test leave-with-makeup scenario:**
   - Add planned reschedule with make-up date
   - Generate sessions  
   - Verify: Original session status = "Rescheduled - Pending Make-up"
   - Verify: Make-up session status = "Make-up Class"
   - Verify: Both sessions created successfully

3. **Test database integrity:**
   - Ensure no orphaned planned reschedules
   - Verify all connections properly closed
   - Check Apps Script execution logs

## Priority: HIGH ⚠️

These fixes are critical for production deployment. The current code will fail when trying to create sessions with placeholder IDs.

---

*Implement these fixes before deploying to production to ensure system stability.*