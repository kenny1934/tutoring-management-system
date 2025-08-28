# Class Request System Implementation Guide (Admin-Only)

## Overview

This system allows **admins** to submit requests for additional sessions that require **your approval** before being added to the schedule. These are typically make-up classes or sessions from previous school year that need to be added outside the regular enrollment system.

---

## Database Structure

The `class_requests` table stores all admin requests with full audit trail and approval workflow tracking.

### Key Fields:
- **Request Details**: student, tutor, date, time, location, type, reason
- **Workflow Status**: Pending → Approved/Rejected  
- **Audit Trail**: which admin requested, when you reviewed, with notes
- **Session Link**: Links to created session if approved

---

## AppSheet Implementation

### Step 1: Add Virtual Columns to `class_requests`

**Navigate to:** Data > Tables > class_requests

#### 1. `Student_Name` (Text)
```
LOOKUP([student_id], "students", "id", "student_name")
```

#### 2. `Tutor_Name` (Text)
```
LOOKUP([tutor_id], "tutors", "id", "tutor_name")
```

#### 3. `Request_Summary` (Text)
```
CONCATENATE([Student_Name], " with ", [Tutor_Name], " on ", [requested_date], " at ", [requested_time])
```

#### 4. `Status_Badge` (Text)
```
SWITCH([request_status],
  "Pending", "🟡 Pending Your Approval",
  "Approved", "✅ Approved", 
  "Rejected", "❌ Rejected",
  "❓ Unknown"
)
```

#### 5. `Requesting_Admin` (Text)
```
LOOKUP([requested_by], "tutors", "user_email", "tutor_name")
```

#### 6. `Days_Pending` (Number)
```
IF([request_status] = "Pending", TODAY() - [requested_at], 0)
```

---

### Step 2: Create Admin Request Submission View

**Navigate to:** UX > Views > New View

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `Submit Class Request` |
| **For This Data** | `class_requests` |
| **View Type** | `Form` |
| **Show If** | `LOOKUP(USEREMAIL(), "tutors", "user_email", "role") = "Admin"` |

#### Form Fields:
- `student_id` (Dropdown from students)
- `tutor_id` (Dropdown from tutors)
- `requested_date` (Date picker)
- `requested_time` (Text or dropdown)
- `location` (Dropdown)
- `session_type` (Enum: "Make-up Class", "Extra Session", "Previous Year Session")
- `reason` (Long text - why is this session needed)

---

### Step 3: Create Your Approval Management View

**Navigate to:** UX > Views > New View

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `Class Requests Management` |
| **For This Data** | `class_requests` |
| **View Type** | `Table` |
| **Show If** | `USEREMAIL() = "your-email@domain.com"` |
| **Sort Order** | `requested_at` (newest first) |

#### Columns to Show:
- `Status_Badge`
- `Request_Summary`
- `session_type`
- `reason`
- `Days_Pending`
- `Requesting_Admin`

#### Grouping:
- **Group By**: `request_status`
- **Sort**: Pending first

---

### Step 4: Create Actions

#### Action 1: Submit Request (For Other Admins)

**Action Settings:**
| Setting | Value |
|---------|-------|
| **Action Name** | `Submit Class Request` |
| **For a Record Of** | `class_requests` |
| **Do This** | `Data: add a new row to this table` |
| **Show If** | `LOOKUP(USEREMAIL(), "tutors", "user_email", "role") = "Admin"` |

**Auto-filled Values:**
```
id: RANDBETWEEN(1000000, 9999999)
request_status: "Pending"
requested_by: USEREMAIL()
requested_at: NOW()
```

#### Action 2: Approve Request and Create Session (You Only)

**Action Settings:**
| Setting | Value |
|---------|-------|
| **Action Name** | `Approve and Create Session` |
| **For a Record Of** | `class_requests` |
| **Do This** | `Data: execute an action on a set of rows` |
| **Show If** | `AND([request_status] = "Pending", USEREMAIL() = "your-email@domain.com")` |

**Sub-Action 1: Create Session**
| Setting | Value |
|---------|-------|
| **Action Name** | `_Create Approved Session` |
| **Do This** | `Data: add a new row to another table` |
| **Target** | `session_log` |

**Session Values:**
```
id: 0
enrollment_id: NULL
student_id: [_THISROW].[student_id]
tutor_id: [_THISROW].[tutor_id]
session_date: [_THISROW].[requested_date]
time_slot: [_THISROW].[requested_time]
location: [_THISROW].[location]
session_status: "Scheduled"
financial_status: "Pending"
notes: CONCATENATE("Approved admin request: ", [_THISROW].[reason])
```

**Sub-Action 2: Update Request Status**
| Setting | Value |
|---------|-------|
| **Action Name** | `_Mark Request Approved` |
| **Do This** | `Data: set the values of some columns in this row` |

**Values:**
```
request_status: "Approved"
reviewed_by: USEREMAIL()
reviewed_at: NOW()
review_notes: "Request approved and session created"
```

#### Action 3: Reject Request (You Only)

**Action Settings:**
| Setting | Value |
|---------|-------|
| **Action Name** | `Reject Request` |
| **For a Record Of** | `class_requests` |
| **Do This** | `Data: set the values of some columns in this row` |
| **Show If** | `AND([request_status] = "Pending", USEREMAIL() = "your-email@domain.com")` |

**Values:**
```
request_status: "Rejected"
reviewed_by: USEREMAIL()
reviewed_at: NOW()
review_notes: [Prompt for rejection reason]
```

---

### Step 5: Menu Structure

#### For Other Admins:
- **Menu Item**: "Request Class"
- **Icon**: 📋
- **Links to**: `Submit Class Request` form view
- **Show If**: `LOOKUP(USEREMAIL(), "tutors", "user_email", "role") = "Admin"`

#### For You (Super Admin):
- **Menu Item**: "Approve Class Requests"
- **Icon**: ✅
- **Links to**: `Class Requests Management` view  
- **Show If**: `USEREMAIL() = "your-email@domain.com"`
- **Badge**: Show count of pending requests

---

### Step 6: Optional Notification System

#### Bot 1: New Request Notification (To You)
| Setting | Value |
|---------|-------|
| **Trigger** | `ADDS_ONLY` on `class_requests` |
| **Condition** | `[request_status] = "Pending"` |
| **Task** | Send notification |
| **Recipients** | Your email address |

**Notification Template:**
- **Title**: `New class request needs approval`
- **Body**: `<<[Requesting_Admin]>> requested <<[Request_Summary]>> for <<[session_type]>>. Reason: <<[reason]>>`

#### Bot 2: Decision Notification (To Requesting Admin)
| Setting | Value |
|---------|-------|
| **Trigger** | `UPDATES_ONLY` on `class_requests` |
| **Condition** | `[_THISROW_BEFORE].[request_status] = "Pending"` |
| **Task** | Send notification |
| **Recipients** | `[requested_by]` |

**Notification Template:**
- **Title**: `Your class request was <<[request_status]>>`
- **Body**: `Request for <<[Request_Summary]>> has been <<[request_status]>>. <<IF([review_notes], "Notes: " & [review_notes], "")>>`

---

## User Workflows

### Admin Workflow (Requesting):
1. Click "Request Class" in menu
2. Select student, tutor, date, time, location
3. Choose session type and provide reason
4. Submit → You receive notification
5. Receive notification when you make decision

### Your Workflow (Approving):
1. Receive notification of new request
2. Open "Approve Class Requests" dashboard
3. Review request details and reason
4. Click "Approve and Create Session" → Session appears in tutor's schedule
5. Or click "Reject Request" with reason
6. Requesting admin gets notification of decision

---

## Benefits

- **Admin Control**: Only admins can request, only you can approve
- **Full Audit Trail**: Track who requested what and when
- **Automatic Session Creation**: Approved requests become real sessions
- **Headless Sessions**: No fake enrollments needed
- **Clear Workflow**: Pending → Approved/Rejected with notifications
- **Flexible Types**: Make-up classes, extra sessions, previous year sessions

---

## Testing Checklist

- [ ] Only admins see "Request Class" menu item
- [ ] Only you see "Approve Class Requests" menu item  
- [ ] Admin can submit requests with all fields
- [ ] You receive notifications for new requests
- [ ] Approve action creates session AND updates status
- [ ] Reject action updates status with your notes
- [ ] Requesting admin receives decision notifications
- [ ] Created sessions appear in tutor schedules
- [ ] Sessions have `enrollment_id = NULL` (headless)
- [ ] Virtual columns display correctly
- [ ] Grouping shows pending requests first