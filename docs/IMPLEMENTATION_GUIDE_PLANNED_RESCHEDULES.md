# Implementation Guide: Planned Reschedules System

## Step-by-Step Implementation Procedure

### Step 1: Database Setup

#### 1.1 Update Database Schema
**If setting up new database:**
```bash
# The init.sql file already contains the planned_reschedules table
mysql -h YOUR_HOST -u YOUR_USER -p csm_db < database/init.sql
```

**If updating existing database:**
```sql
-- Run this SQL command in your Cloud SQL instance
CREATE TABLE planned_reschedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL,
    planned_date DATE NOT NULL,
    reschedule_to_date DATE NULL,
    reason VARCHAR(500),
    status VARCHAR(20) DEFAULT 'Pending',
    requested_date DATE NOT NULL,
    requested_by VARCHAR(255),
    notes TEXT,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    INDEX idx_enrollment_date (enrollment_id, planned_date)
);

-- Also add the unique constraint for students if not done yet
ALTER TABLE students ADD CONSTRAINT unique_student_location UNIQUE (school_student_id, home_location);
```

#### 1.2 Verify Database Changes
```sql
-- Verify table exists
DESCRIBE planned_reschedules;

-- Verify foreign key constraint
SHOW CREATE TABLE planned_reschedules;
```

### Step 2: Update Apps Script Code

#### 2.1 Replace Code.gs Content
**File:** `/scripts/Code.gs`
**Status:** ✅ Already updated with planned reschedule logic

**Key changes made:**
- Added planned reschedules query in `handleGenerateSessions()`
- Added logic to mark sessions as "Rescheduled - Pending Make-up"
- Added logic to create linked make-up sessions when preferred date specified
- Added automatic status update to mark reschedules as "Applied"

#### 2.2 Deploy Updated Script
1. Copy updated Code.gs to your Google Apps Script project
2. Save and deploy as web app
3. Note the new deployment URL if it changes

### Step 3: AppSheet Configuration

#### 3.1 Add planned_reschedules Table to AppSheet
1. **Go to AppSheet Editor → Data → Tables**
2. **Add new table:** `planned_reschedules`
3. **Connect to your Cloud SQL database**
4. **Verify column types:**
   - `id`: Number (Key)
   - `enrollment_id`: Ref (to enrollments)
   - `planned_date`: Date
   - `reschedule_to_date`: Date
   - `reason`: Text
   - `status`: Enum (Pending, Applied, Cancelled)
   - `requested_date`: Date
   - `requested_by`: Text
   - `notes`: LongText

#### 3.2 Configure Table Settings
```javascript
// Column: enrollment_id
Type: Ref
Referenced Table: enrollments
Referenced Column: id

// Column: status  
Type: Enum
Values: Pending, Applied, Cancelled
Initial Value: Pending

// Column: requested_date
Type: Date
Initial Value: TODAY()

// Column: requested_by
Type: Text
Initial Value: USEREMAIL()
```

#### 3.3 Create Views

**View 1: "Manage Planned Reschedules"**
```javascript
// View Configuration
Table: planned_reschedules
Type: Table
Filter: [status] = "Pending"

// Columns to Show:
- Student Name (Virtual Column)
- planned_date
- reschedule_to_date  
- reason
- requested_by
- status

// Virtual Column: Student_Name
LOOKUP([enrollment_id], "enrollments", "id", 
   LOOKUP(LOOKUP([enrollment_id], "enrollments", "id", "student_id"), "students", "id", "student_name")
)
```

**View 2: "Add Planned Reschedule"**
```javascript
// View Configuration  
Table: planned_reschedules
Type: Form
Position: Menu

// Show Columns:
- enrollment_id (Dropdown)
- planned_date
- reschedule_to_date
- reason
- notes
```

#### 3.4 Add Virtual Columns to Enrollments

```javascript
// Virtual Column: Pending_Reschedules_Count
COUNTIFS(
  planned_reschedules[enrollment_id], [id],
  planned_reschedules[status], "Pending"
)

// Virtual Column: Next_Planned_Reschedule  
MINIFS(
  planned_reschedules[planned_date],
  planned_reschedules[enrollment_id], [id],
  planned_reschedules[status], "Pending",
  planned_reschedules[planned_date], ">=" & TODAY()
)
```

#### 3.5 Create Actions

**Action 1: "Add Planned Reschedule"**
```javascript
// Action Configuration
Name: Add Planned Reschedule
Display Name: 📅 Plan Reschedule
Type: App: add new row to another table using values from this row
Target: planned_reschedules

// Column Values:
enrollment_id: <<[_THISROW].[id]>>
requested_date: <<TODAY()>>
requested_by: <<USEREMAIL()>>
status: "Pending"
```

**Action 2: "Cancel Planned Reschedule"**
```javascript
// Action Configuration
Name: Cancel Planned Reschedule  
Display Name: ❌ Cancel
Type: App: edit this row using values from a form
Condition: [status] = "Pending"

// Column Values:
status: "Cancelled"
```

### Step 4: Testing Procedure

#### 4.1 Test Database Connection
```sql
-- Insert test data
INSERT INTO planned_reschedules 
(enrollment_id, planned_date, reason, requested_date, requested_by) 
VALUES (1, '2025-09-15', 'Test leave', '2025-08-21', 'admin@test.com');

-- Verify data
SELECT * FROM planned_reschedules;
```

#### 4.2 Test AppSheet Interface
1. **Navigate to "Manage Planned Reschedules" view**
2. **Verify test data appears**
3. **Test "Add Planned Reschedule" action from enrollments view**
4. **Test adding both leave-only and leave-with-makeup scenarios**

#### 4.3 Test Session Generation
1. **Create test enrollment with planned reschedule**
2. **Run "Generate Sessions" action**
3. **Verify sessions created with correct status:**
   - Leave only: "Rescheduled - Pending Make-up"
   - Leave + makeup: Original + linked make-up session
4. **Verify planned_reschedule status changed to "Applied"**

### Step 5: Production Deployment

#### 5.1 Backup Current System
```sql
-- Backup existing data
mysqldump -h YOUR_HOST -u YOUR_USER -p csm_db > backup_before_reschedules.sql
```

#### 5.2 Deploy Changes
1. **Apply database schema changes**
2. **Update Apps Script deployment**  
3. **Publish AppSheet app changes**
4. **Test with small subset of real data**

#### 5.3 User Training
1. **Document new workflow for admin team**
2. **Train staff on:**
   - When to use planned reschedules
   - Difference between leave-only vs leave-with-makeup
   - How to check if reschedules were applied

### Step 6: Monitoring & Maintenance

#### 6.1 Regular Checks
```sql
-- Monitor planned reschedules usage
SELECT status, COUNT(*) FROM planned_reschedules GROUP BY status;

-- Check for old pending reschedules (may need cleanup)
SELECT * FROM planned_reschedules 
WHERE status = 'Pending' AND planned_date < CURDATE();
```

#### 6.2 Performance Monitoring
- Monitor session generation time (should remain fast)
- Check Apps Script execution logs for errors
- Verify database query performance

## Troubleshooting

### Common Issues

**Issue 1: "Table planned_reschedules doesn't exist"**
- Solution: Run database schema update SQL

**Issue 2: "Foreign key constraint fails"**  
- Solution: Verify enrollment_id exists in enrollments table

**Issue 3: "Sessions not getting reschedule status"**
- Solution: Check Apps Script logs, verify planned_reschedule data

**Issue 4: "AppSheet not showing planned reschedules"**
- Solution: Verify table connection and column types in AppSheet

### Debug Queries
```sql
-- Check planned reschedules for specific enrollment
SELECT * FROM planned_reschedules WHERE enrollment_id = ? AND status = 'Pending';

-- Verify session creation with reschedule status
SELECT * FROM session_log WHERE session_status = 'Rescheduled - Pending Make-up';

-- Check linked make-up sessions  
SELECT * FROM session_log WHERE session_status = 'Make-up Class';
```

## Success Criteria

✅ Admin can add planned reschedules through AppSheet
✅ Session generation automatically applies reschedule status
✅ Make-up sessions created when preferred date specified
✅ Planned reschedules marked as "Applied" after use
✅ System maintains performance with new functionality
✅ Admin team trained and comfortable with new workflow

---

*Complete this implementation during a maintenance window to avoid disrupting active enrollment processing.*