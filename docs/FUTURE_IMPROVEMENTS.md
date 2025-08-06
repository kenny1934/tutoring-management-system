# Future System Improvements

This document tracks important enhancements and fixes that should be implemented when time allows.

## 🛡️ **Duplicate Session Prevention System** 
**Priority: High** | **Identified: July 2025**

### **Problem:**
Currently possible to generate duplicate sessions for same student at same time/location/date, which is logically impossible and indicates data integrity issues.

### **Root Cause:**
No constraints preventing duplicate session creation in database or application logic.

### **Proposed Solution - Multi-Level Prevention:**

#### **Level 1: Database Constraints (Most Critical)**
```sql
-- Prevent duplicate sessions in session_log
ALTER TABLE session_log 
ADD CONSTRAINT unique_session 
UNIQUE (student_id, session_date, time_slot, location);

-- Optional: Prevent duplicate active enrollments
ALTER TABLE enrollments 
ADD CONSTRAINT unique_active_enrollment 
UNIQUE (student_id, tutor_id, assigned_day, assigned_time, location, payment_status);
```

#### **Level 2: Apps Script Prevention**
Update `handleGenerateSessions` in Code.gs to check for existing sessions before creation:
```javascript
// Check for existing sessions before creating new ones
const checkStmt = conn.prepareStatement(
  `SELECT COUNT(*) FROM session_log 
   WHERE student_id = ? AND tutor_id = ? AND session_date = ? AND time_slot = ? AND location = ?`
);
// Skip session creation if duplicate found
```

#### **Level 3: AppSheet Validation**
Add data validity rule to enrollments table:
```
COUNTIFS(
  enrollments[student_id], [student_id],
  enrollments[assigned_day], [assigned_day], 
  enrollments[assigned_time], [assigned_time],
  enrollments[location], [location],
  enrollments[payment_status], "Paid"
) <= 1
```

### **Implementation Order:**
1. Add database unique constraint (session_log)
2. Test constraint behavior with duplicate attempts
3. Update Apps Script with duplicate checking logic
4. Add AppSheet user-friendly validation
5. Test entire workflow end-to-end

### **Benefits:**
- ✅ Data integrity protection
- ✅ Prevents impossible scheduling conflicts  
- ✅ Catches application logic errors early
- ✅ User-friendly error messages
- ✅ Maintains make-up class flexibility

### **Considerations:**
- Make-up classes still allowed (different dates)
- Multiple time slots per student still possible
- Graceful error handling in Apps Script
- May need to handle existing duplicates before constraint addition

---

## 📝 **Future Enhancement Areas**

### **Data Quality & Integrity**
- [ ] Implement comprehensive data validation rules
- [ ] Add automated data consistency checks
- [ ] Create data cleanup utilities

### **Performance Optimization**
- [ ] Database indexing optimization
- [ ] Apps Script execution time improvements
- [ ] AppSheet view performance tuning

### **User Experience**
- [ ] Enhanced error messaging
- [ ] Streamlined workflows
- [ ] Mobile interface optimization

---

*This document should be reviewed monthly and updated as priorities change.*