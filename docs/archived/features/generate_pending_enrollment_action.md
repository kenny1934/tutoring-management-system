# Generate Pending Enrollment Action

## Overview

This action allows admins to create "Pending Payment" enrollments directly from MSA/B Assignments sheets for students who haven't paid yet but need to appear in tutor schedules for September start.

## Purpose

- Create enrollments with `payment_status = "Pending Payment"` 
- Generate only 1 session (first lesson) so tutors know who's expected
- Allow later payment confirmation to generate remaining sessions
- Provide visibility without overwhelming tutors with unpaid sessions

---

## Implementation Guide

### Step 1: Create the Action

**Navigate to:** Behavior > Actions > New Action

#### Basic Settings:
| Setting | Value |
|---------|-------|
| **Action Name** | `Generate Pending Enrollment` |
| **For a Record Of** | `MSA_Assignments` (create similar for MSB_Assignments) |
| **Do This** | `Data: execute an action on a set of rows` |
| **Referenced Table** | `MSA_Assignments` |
| **Referenced Rows** | `LIST([_THISROW])` |

### Step 2: Configure as Grouped Action

**Set up the sub-actions:**

#### Sub-Action 1: `_Create Pending Enrollment`
| Setting | Value |
|---------|-------|
| **Action Name** | `_Create Pending Enrollment` |
| **For a Record Of** | `MSA_Assignments` |  
| **Do This** | `Data: add a new row to another table` |
| **Target** | `enrollments` |

#### Sub-Action 1 Values:
```
id: RANDBETWEEN(1000000, 9999999)
student_id: LOOKUP([Student Name], "students", "student_name", "id") 
tutor_id: LOOKUP([Assigned Tutor], "tutors", "tutor_name", "id")
assigned_day: [Assigned Day]
assigned_time: [Assigned Time]  
location: [Location]
lessons_paid: 6
payment_date: ""
first_lesson_date: [First Lesson Date]
payment_status: "Pending Payment"
fee_message_sent: FALSE
remark: CONCATENATE("Generated from ", [Location], " Assignments - Pending Payment")
discount_id: IF(ISBLANK([Discount Amount]), "", LOOKUP([Discount Amount], "discounts", "discount_value", "id"))
last_modified_by: USEREMAIL()
```

#### Sub-Action 2: `_Mark as Pending Payment`
| Setting | Value |
|---------|-------|
| **Action Name** | `_Mark as Pending Payment` |
| **For a Record Of** | `MSA_Assignments` |
| **Do This** | `Data: set the values of some columns in this row` |

#### Sub-Action 2 Values:
```
Status: "Pending Payment"
Notes: CONCATENATE("Pending enrollment created - awaiting payment confirmation. Created at ", NOW())
```

---

## Key Differences from "Generate Sessions" Action

| Aspect | Generate Sessions | Generate Pending Enrollment |
|--------|-------------------|----------------------------|
| **Payment Status** | `"Paid"` | `"Pending Payment"` |
| **Sessions Created** | 6 sessions | 1 session (automatic via Code.gs) |
| **Assignment Status** | `"Processed"` | `"Pending Payment"` |
| **Use Case** | Confirmed paid students | Students who will pay later |

---

## Workflow Integration

### Before September Start:
1. Admin assigns students in MSA/B Assignments sheets
2. For unpaid students: Click **"Generate Pending Enrollment"**
3. System creates enrollment with `payment_status = "Pending Payment"`
4. Code.gs automatically creates 1 session only
5. Tutor sees student in schedule (knows to expect them)

### When Payment Received:
1. Admin finds enrollment in "Overdue Accounts" view
2. Click **"Confirm Payment"** action (existing action)
3. System updates `payment_status = "Paid"`
4. Bot automatically generates remaining 5 sessions
5. All sessions update to "Paid" financial status

---

## Action Button Configuration

### Button Settings:
| Setting | Value |
|---------|-------|
| **Display Name** | `📋 Generate Pending Enrollment` |
| **Show If** | `AND(NOT(ISBLANK([Student Name])), NOT(ISBLANK([Assigned Tutor])), NOT(ISBLANK([First Lesson Date])), OR([Status] = "", [Status] = "Unpaid"))` |
| **Confirmation** | `"Create pending enrollment for " & [Student Name] & "? This will generate 1 session and mark them as awaiting payment."` |

---

## Testing Checklist

- [ ] Action creates enrollment with `payment_status = "Pending Payment"`
- [ ] Only 1 session is generated (not 6)
- [ ] Session has `financial_status = "Unpaid"`  
- [ ] Assignment row marked as "Pending Payment"
- [ ] Student appears in tutor's schedule
- [ ] Action disabled after use (Status != blank/Unpaid)
- [ ] Payment confirmation works to generate remaining sessions

---

## Error Handling

The action should validate:
- Student Name exists in students table
- Assigned Tutor exists in tutors table  
- First Lesson Date is provided
- Row hasn't been processed already

If validation fails, the action should be hidden or show appropriate error message.

---

## Cancel Pending Enrollment System

### Purpose
For situations where students cancel their application after a pending enrollment has been created, this system uses a status-change approach with automated cascading updates.

### Implementation Architecture

The system uses a **manual action + automated bot** approach to handle cancellations cleanly:

1. **Manual Action**: Admin sets enrollment `payment_status` to "Cancelled" 
2. **Automated Bot**: Triggers cascading updates to sessions and assignment status
3. **Result**: Student returns to "Unpaid" planning stage automatically

### Step 1: Cancel Enrollment Action

#### Action Settings:
| Setting | Value |
|---------|-------|
| **Action Name** | `Cancel Enrollment` |
| **For a Record Of** | `enrollments` |
| **Do This** | `Data: set the values of some columns in this row` |

#### Action Values:
```
payment_status: "Cancelled"
```

#### Button Configuration:
| Setting | Value |
|---------|-------|
| **Display Name** | `❌ Cancel Enrollment` |
| **Show If** | `[payment_status] = "Pending Payment"` |
| **Confirmation** | `"Cancel enrollment for student? This will mark the enrollment and sessions as cancelled and return them to planning stage."` |

### Step 2: Automated Cancellation Bot

#### Bot Settings:
| Setting | Value |
|---------|-------|
| **Bot Name** | `Process Enrollment Cancellation` |
| **Event** | `Updates Only` |
| **Table** | `enrollments` |
| **Condition** | `AND([payment_status] = "Cancelled", [_THISROW_BEFORE].[payment_status] <> "Cancelled")` |

#### Bot Tasks:

**Task 1: Update Sessions**
| Setting | Value |
|---------|-------|
| **Task Type** | `Data: update some rows in the data` |
| **Table** | `session_log` |
| **Filter** | `[enrollment_id] = [_THISROW].[id]` |

**Task 1 Values:**
```
session_status: "Cancelled"
financial_status: "Waived"
```

**Task 2: Revert Assignment Status**
| Setting | Value |
|---------|-------|
| **Task Type** | `Data: update some rows in the data` |
| **Table** | `MSA_Assignments` (and similar for MSB_Assignments) |
| **Filter** | `[Student Name] = LOOKUP([_THISROW].[student_id], "students", "id", "student_name")` |

**Task 2 Values:**
```
Status: "Unpaid"
Notes: CONCATENATE("Enrollment cancelled and student returned to planning stage at ", NOW())
```

### Workflow Benefits:
- **Fully automated cascade** - One action triggers all necessary updates
- **No orphaned records** - All related data properly updated to "Cancelled" status
- **Returns to planning stage** - Student automatically reverts to "Unpaid" for re-processing
- **Audit trail preserved** - All records maintained with cancellation status
- **Foreign key compliant** - Uses status changes instead of deletions

### Complete Workflow:
```
Unpaid → Generate Pending Enrollment → Pending Payment → Cancel Action → Bot Updates:
                                                                        ├─ Sessions: "Cancelled"/"Waived"
                                                                        └─ Assignment: "Unpaid" (ready to retry)
```

### Testing Checklist:
- [ ] Action changes enrollment `payment_status` to "Cancelled"
- [ ] Bot updates all related sessions to "Cancelled"/"Waived"
- [ ] Bot reverts assignment status to "Unpaid" 
- [ ] Student disappears from tutor's active schedule
- [ ] Student can be re-processed with "Generate Pending Enrollment"
- [ ] All updates happen automatically after action click

---

## Confirm Payment from Assignments Action

### Purpose
Allows admins to confirm payment directly from MSA/B Assignments sheets, triggering the complete payment confirmation workflow including generation of remaining sessions.

### Implementation Architecture

Uses a **bot cascade system** where each action/status change triggers the next bot in sequence:

1. **Assignment Action**: Changes status from "Pending Payment" to "Enrolled"  
2. **Bot 1**: Detects assignment status change, updates enrollment to "Paid"
3. **Bot 2**: Detects enrollment status change, calls Code.gs to generate remaining sessions

### Step 1: Assignment Status Action

#### Action Settings:
| Setting | Value |
|---------|-------|
| **Action Name** | `Confirm Payment and Complete Enrollment` |
| **For a Record Of** | `MSA_Assignments` (create similar for MSB_Assignments) |
| **Do This** | `Data: set the values of some columns in this row` |

#### Action Values:
```
Status: "Enrolled"
Notes: CONCATENATE("Payment confirmed and enrollment completed at ", NOW())
```

#### Button Configuration:
| Setting | Value |
|---------|-------|
| **Display Name** | `✅ Confirm Payment` |
| **Show If** | `[Status] = "Pending Payment"` |
| **Confirmation** | `"Confirm payment for " & [Student Name] & "? This will generate their remaining sessions."` |

### Step 2: Enrollment Update Bot

#### Bot Settings:
| Setting | Value |
|---------|-------|
| **Bot Name** | `Update Enrollment on Payment Confirmation` |
| **Event** | `Updates Only` |
| **Table** | `MSA_Assignments` |
| **Condition** | `AND([Status] = "Enrolled", [_THISROW_BEFORE].[Status] = "Pending Payment")` |

#### Bot Task:
| Setting | Value |
|---------|-------|
| **Task Type** | `Data: update some rows in the data` |
| **Table** | `enrollments` |
| **Filter** | `[student_id] = LOOKUP([_THISROW].[Student Name], "students", "student_name", "id")` |

#### Bot Values:
```
payment_status: "Paid"
```

### Step 3: Session Generation Bot (Existing)

The existing "Confirm Payment" bot on enrollments table automatically triggers when `payment_status` changes to "Paid", calling the Code.gs webhook to generate remaining sessions.

### Complete Workflow:
```
MSA Assignment Status: "Pending Payment" 
    ↓ [Admin clicks "Confirm Payment"]
Assignment Status: "Enrolled" 
    ↓ [Bot 1 triggers]
Enrollment: payment_status = "Paid"
    ↓ [Bot 2 triggers] 
Code.gs: Generate 5 remaining sessions
    ↓ [Result]
Complete 6-session enrollment ready
```

### Benefits:
- **Single action** triggers complete workflow
- **Admin stays in Assignments view** - no need to switch to enrollments table
- **Reuses existing infrastructure** - leverages existing payment confirmation bot and Code.gs
- **Automatic session generation** - remaining 5 sessions created automatically
- **Audit trail** - all status changes tracked with timestamps