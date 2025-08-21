# Testing Checklist - Planned Reschedules Feature

## Pre-Deployment Validation

### ✅ **Phase 1: Database Verification**
- [ ] SQL script ran without errors
- [ ] `planned_reschedules` table exists
- [ ] Table structure matches specification (9 columns)
- [ ] Foreign key constraint works (try invalid enrollment_id)
- [ ] Test data can be inserted and retrieved

**SQL Test Commands:**
```sql
-- Verify table
DESCRIBE planned_reschedules;

-- Test insert
INSERT INTO planned_reschedules 
(enrollment_id, planned_date, reason, requested_date, requested_by) 
VALUES (1, '2025-09-15', 'Test leave', '2025-08-21', 'test@admin.com');

-- Test select  
SELECT * FROM planned_reschedules;

-- Cleanup test data
DELETE FROM planned_reschedules WHERE reason = 'Test leave';
```

### ✅ **Phase 2: Code.gs Verification**  
- [ ] Code changes applied to Apps Script
- [ ] Script saves without syntax errors
- [ ] Deployment updated (new version number)
- [ ] Test webhook responds (check execution logs)

**Test URL:** `https://script.google.com/macros/d/YOUR_SCRIPT_ID/exec`

### ✅ **Phase 3: AppSheet Configuration**
- [ ] `planned_reschedules` table added to AppSheet
- [ ] All column types configured correctly
- [ ] enrollment_id reference works (shows enrollment dropdown)
- [ ] Virtual columns calculate properly
- [ ] Views display data correctly
- [ ] Actions create/update data as expected

## End-to-End Testing Scenarios

### ✅ **Test Case 1: Leave Request Only**
**Scenario:** Student requests leave without specifying make-up date

**Steps:**
1. [ ] Open "Add Planned Reschedule" in AppSheet
2. [ ] Select an enrollment from dropdown  
3. [ ] Set planned_date to future date (e.g., next week)
4. [ ] Enter reason: "Family vacation"
5. [ ] Leave reschedule_to_date blank
6. [ ] Save record

**Expected Results:**
- [ ] Record created with status = "Pending"
- [ ] Shows in "Manage Planned Reschedules" view
- [ ] enrollment's Pending_Reschedules_Count increases by 1

### ✅ **Test Case 2: Leave with Preferred Make-up Date**
**Scenario:** Student requests leave and specifies preferred make-up date

**Steps:**
1. [ ] Add planned reschedule as above
2. [ ] Set reschedule_to_date to different future date
3. [ ] Save record

**Expected Results:**  
- [ ] Record created successfully
- [ ] Both dates visible in management view

### ✅ **Test Case 3: Session Generation - Leave Only**
**Scenario:** Generate sessions when planned leave exists (no make-up date)

**Prerequisites:**
- [ ] Create test enrollment 
- [ ] Add planned reschedule for enrollment (leave only)

**Steps:**
1. [ ] Click "Generate Sessions" on the enrollment
2. [ ] Check Apps Script execution logs
3. [ ] Verify sessions created in session_log table
4. [ ] Check planned_reschedule status

**Expected Results:**
- [ ] Original session created with status = "Rescheduled - Pending Make-up"
- [ ] No additional make-up session created  
- [ ] planned_reschedule status changed to "Applied"
- [ ] Apps Script logs show reschedule was found and applied

### ✅ **Test Case 4: Session Generation - Leave with Make-up**  
**Scenario:** Generate sessions when planned leave has preferred make-up date

**Prerequisites:**
- [ ] Create test enrollment
- [ ] Add planned reschedule with reschedule_to_date specified

**Steps:**
1. [ ] Click "Generate Sessions" on enrollment
2. [ ] Check session_log table
3. [ ] Verify both original and make-up sessions exist

**Expected Results:**
- [ ] Original session: status = "Rescheduled - Pending Make-up" 
- [ ] Make-up session: status = "Make-up Class" on reschedule_to_date
- [ ] Both sessions have same enrollment_id, student_id, tutor_id
- [ ] planned_reschedule status = "Applied"

### ✅ **Test Case 5: Cancel Planned Reschedule**
**Scenario:** Admin cancels a pending reschedule request

**Steps:**
1. [ ] Go to "Manage Planned Reschedules"  
2. [ ] Find pending reschedule
3. [ ] Click "Cancel" action
4. [ ] Verify status changes to "Cancelled"
5. [ ] Generate sessions for that enrollment

**Expected Results:**
- [ ] Reschedule status = "Cancelled"
- [ ] Sessions generate normally (no reschedule applied)
- [ ] Cancelled reschedules don't affect session generation

### ✅ **Test Case 6: Multiple Reschedules**
**Scenario:** One enrollment has multiple planned reschedules

**Steps:**
1. [ ] Add 2-3 planned reschedules for same enrollment
2. [ ] Mix leave-only and leave-with-makeup types
3. [ ] Generate sessions

**Expected Results:**  
- [ ] All applicable reschedules processed
- [ ] Correct session statuses applied
- [ ] All reschedules marked "Applied"

## Performance & Error Testing

### ✅ **Error Scenarios**
- [ ] **Invalid enrollment_id:** Try non-existent enrollment - should fail gracefully
- [ ] **Past dates:** Try planned_date in the past - should work but show warning
- [ ] **Duplicate dates:** Multiple reschedules for same date/enrollment
- [ ] **Invalid make-up date:** reschedule_to_date before planned_date

### ✅ **Performance Testing**
- [ ] **Large enrollment:** Test with enrollment having many sessions
- [ ] **Multiple reschedules:** 5+ reschedules for one enrollment  
- [ ] **Database load:** Monitor query performance during session generation

## Production Readiness

### ✅ **Security Checklist**
- [ ] No sensitive data exposed in logs
- [ ] User permissions restrict access appropriately
- [ ] Database queries use parameterized statements (prevents SQL injection)

### ✅ **Documentation Updated**
- [ ] Feature documented for admin team
- [ ] Workflow procedures written
- [ ] Troubleshooting guide available

### ✅ **Monitoring Setup**
- [ ] Apps Script execution alerts configured
- [ ] Database performance monitoring in place
- [ ] Error logging/notification system active

---

## 🚀 **GO/NO-GO Decision**

**✅ ALL TESTS PASSED:** Ready for production deployment
**❌ TESTS FAILED:** Address issues before deployment

**Deployment Date:** _______________
**Deployed By:** _______________
**Rollback Plan:** Disable AppSheet views/actions, keep database table for data integrity