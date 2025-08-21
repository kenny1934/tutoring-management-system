# Planned Reschedules System

## Overview

The Planned Reschedules system allows admin staff to record future leave requests before sessions are generated, ensuring that when sessions are created, they automatically have the correct status ("Rescheduled - Pending Make-up" or linked make-up sessions).

## Database Design

### New Table: `planned_reschedules`

```sql
CREATE TABLE planned_reschedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL,
    planned_date DATE NOT NULL,
    reschedule_to_date DATE NULL, -- Optional: if specified, creates linked make-up session
    reason VARCHAR(500),
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Applied', 'Cancelled'
    requested_date DATE NOT NULL,
    requested_by VARCHAR(255),
    notes TEXT,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    INDEX idx_enrollment_date (enrollment_id, planned_date)
);
```

## Two Workflows

### 1. Leave Only (No Specific Make-up Date)
**When admin records:** Leave request without make-up date specified
**When sessions generate:** Creates original session with status "Rescheduled - Pending Make-up"
**Admin action:** Use make-up recommendation system later to schedule

### 2. Leave + Preferred Make-up Date  
**When admin records:** Leave request with preferred make-up date
**When sessions generate:** 
- Creates original session: "Rescheduled - Pending Make-up" 
- Creates make-up session: "Make-up Class" on specified date
- Links them with `rescheduled_to_id` and `make_up_for_id`

## AppSheet Interface Design

### View 1: "Manage Planned Reschedules"
**Purpose:** View and manage all planned reschedules

**Columns to display:**
- Student Name (lookup from enrollment)
- Planned Date
- Make-up Date (if specified)
- Reason  
- Status
- Requested By
- Requested Date

**Filters:**
- Status = 'Pending' (default)
- Show all statuses (option)

### View 2: "Add Planned Reschedule"
**Purpose:** Form to add new planned reschedule

**Required fields:**
- Enrollment ID (dropdown from active enrollments)
- Planned Date (date picker)
- Reason (text)
- Requested By (text, default to current user)

**Optional fields:**
- Make-up Date (date picker)
- Notes (long text)

### Actions

#### Action 1: "Add Planned Reschedule"
**Trigger:** Button in enrollments view
**Purpose:** Quick add reschedule for specific enrollment

```javascript
// Action configuration
{
  "Type": "Add",
  "Table": "planned_reschedules",
  "Values": {
    "enrollment_id": "<<[_THISROW].[id]>>",
    "requested_date": "<<TODAY()>>",
    "requested_by": "<<USEREMAIL()>>",
    "status": "Pending"
  }
}
```

#### Action 2: "Cancel Planned Reschedule"
**Trigger:** Button in planned reschedules view
**Purpose:** Mark reschedule as cancelled

```javascript
// Action configuration
{
  "Type": "Data Change", 
  "Table": "planned_reschedules",
  "Values": {
    "status": "Cancelled"
  }
}
```

### Virtual Columns

#### For Enrollments Table:
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
  planned_reschedules[status], "Pending"
)
```

#### For Planned Reschedules Table:
```javascript
// Virtual Column: Student_Info  
LOOKUP([enrollment_id], "enrollments", "id", "student_name")

// Virtual Column: Days_Until_Leave
[planned_date] - TODAY()
```

## Code.gs Integration

The system automatically:
1. **Queries planned reschedules** when generating sessions
2. **Applies appropriate status** to sessions based on planned reschedules
3. **Creates linked make-up sessions** when make-up date is specified
4. **Marks planned reschedules as "Applied"** after sessions are generated

## Benefits

✅ **Proactive leave management** - Record leaves before sessions exist
✅ **Automatic status application** - No manual session status updates needed  
✅ **Flexible workflow** - Supports both immediate and delayed make-up scheduling
✅ **Full audit trail** - Track who requested what and when
✅ **Seamless integration** - Works with existing session generation process

## Implementation Notes

- Planned reschedules are only applied to **new sessions** during generation
- Existing sessions are **not affected** by adding planned reschedules
- Status automatically changes from "Pending" to "Applied" after use
- Make-up sessions inherit same tutor, location, and time slot as original
- Admin can cancel planned reschedules before they're applied

---

*This feature enhances the CSM system's ability to handle complex scheduling scenarios proactively.*