# Extension Request System Implementation Guide

## Overview

This system allows **tutors** to request deadline extensions when they encounter sessions that are blocked by Valid If constraints (sessions scheduled beyond the enrollment period). **Admins** can review these requests with full context and approve them, which automatically extends the enrollment deadline and reschedules the session.

---

## Problem Solved

**Scenario**: Tutor tries to reschedule a session but it's beyond the enrollment period
1. Valid If blocks the rescheduling with "Cannot schedule after enrollment ends"
2. Previously: Tutor had to contact admin manually
3. Now: Tutor clicks "Request Extension" button → Admin approves → Session becomes reschedule-able

---

## Database Structure

### Main Table: `extension_requests`

**Purpose**: Stores all tutor extension requests with full audit trail and approval workflow

### Key Fields:
- **Request Context**: session_id, enrollment_id, student, tutor
- **Extension Details**: weeks requested, reason, proposed new date/time
- **Workflow Status**: Pending → Approved/Rejected
- **Audit Trail**: who requested, when reviewed, admin notes
- **Integration**: tracks if session was rescheduled

### Admin Views:
- **`pending_extension_requests_admin`**: Rich context for admin decision-making
- **`extension_requests_tutor`**: Tutor's view of their request history

---

## AppSheet Implementation

### Step 1: Add Data Sources

**Navigate to:** Data > Tables

Add these tables/views:
- `extension_requests` (main table)
- `pending_extension_requests_admin` (for admin management)
- `extension_requests_tutor` (for tutor history)

---

### Step 2: Add Virtual Columns to `extension_requests`

**Navigate to:** Data > Tables > extension_requests

#### 1. `Student_Name` (Text)
```
LOOKUP([student_id], "students", "id", "student_name")
```

#### 2. `Tutor_Name` (Text)
```
LOOKUP([tutor_id], "tutors", "id", "tutor_name")
```

#### 3. `Session_Date` (Date)
```
LOOKUP([session_id], "session_log", "id", "session_date")
```

#### 4. `Request_Summary` (Text)
```
CONCATENATE(
  [Student_Name], " (", [Tutor_Name], ") - ",
  [requested_extension_weeks], " week extension for session on ",
  TEXT([Session_Date], "MMM DD, YYYY")
)
```

#### 5. `Status_Badge` (Text)
```
SWITCH([request_status],
  "Pending", "🟡 Pending Admin Review",
  "Approved", "✅ Extension Granted",
  "Rejected", "❌ Request Denied",
  "❓ Unknown"
)
```

#### 6. `Days_Pending` (Number)
```
IF([request_status] = "Pending", TODAY() - [requested_at], 0)
```

#### 7. `Enrollment_Context` (Text)
```
CONCATENATE(
  "Currently ",
  LOOKUP([enrollment_id], "enrollments", "id", "deadline_extension_weeks"),
  " weeks extended, ",
  COUNT(
    SELECT(session_log[id],
      AND([enrollment_id] = [_THISROW].[enrollment_id],
          IN([session_status], LIST("Rescheduled - Pending Make-up", "Sick Leave - Pending Make-up", "Weather Cancelled - Pending Make-up"))
      )
    )
  ),
  " pending makeups"
)
```

---

### Step 3: Create Tutor Action - Request Extension

**Navigate to:** Behavior > Actions > New Action

#### Action Settings:
| Setting | Value |
|---------|-------|
| **Action Name** | `Request Extension` |
| **For a Record Of** | `session_log` |
| **Do This** | `Data: add a new row to another table using values from this row` |
| **Target** | `extension_requests` |

#### Show If Condition:
```
AND(
  USEREMAIL() = [tutor_id].[user_email],
  NOT(ISBLANK([enrollment_id])),
  [enrollment_id].[payment_status] = "Paid",
  IN([session_status], LIST("Scheduled", "Make-up Class")),
  [session_date] > [enrollment_id].[Related_Enrollment_Dates].[effective_end_date]
)
```

**Logic**: Only show when tutor owns session, it's for a paid enrollment, and session date is beyond current enrollment period.

#### Auto-filled Values:
```
id: 0
session_id: [id]
enrollment_id: [enrollment_id]
student_id: [student_id]
tutor_id: [tutor_id]
requested_extension_weeks: [Prompt: "How many weeks extension needed? (1-2 typical)"]
reason: [Prompt: "Why is extension needed? (e.g., pending makeups, special circumstances)"]
proposed_reschedule_date: [Prompt: "Proposed new date for this session?"]
proposed_reschedule_time: [time_slot]
request_status: "Pending"
requested_by: USEREMAIL()
requested_at: NOW()
```

---

### Step 4: Create Admin Management View

**Navigate to:** UX > Views > New View

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `Extension Requests Management` |
| **For This Data** | `pending_extension_requests_admin` |
| **View Type** | `Deck` (shows rich details) or `Table` |
| **Show If** | `LOOKUP(USEREMAIL(), "tutors", "user_email", "role") = "Admin"` |
| **Sort Order** | `requested_at` DESC (newest first) |

#### Columns to Show:
- `request_summary`
- `admin_guidance` (🚨 URGENT, ⚠️ REVIEW, ✅ STANDARD)
- `pending_makeups_count`
- `days_since_request`
- `reason`
- `proposed_reschedule_date`
- `current_extension_weeks`

#### Grouping:
- **Group By**: `request_status`
- **Sort**: Pending first, then by urgency

---

### Step 5: Create Admin Actions

#### Action A: Approve Extension Request

**Navigate to:** Behavior > Actions > New Action

| Setting | Value |
|---------|-------|
| **Action Name** | `Approve Extension Request` |
| **For a Record Of** | `extension_requests` |
| **Do This** | `Data: execute an action on a set of rows` |
| **Show If** | `AND([request_status] = "Pending", LOOKUP(USEREMAIL(), "tutors", "user_email", "role") = "Admin")` |

**Sub-Action 1: Update Enrollment Extension**
| Setting | Value |
|---------|-------|
| **Action Name** | `_Grant Extension to Enrollment` |
| **Do This** | `Data: set the values of some columns in another table` |
| **Target** | `enrollments` |
| **Referenced Rows** | `[enrollment_id]` |

**Enrollment Values:**
```
deadline_extension_weeks: [deadline_extension_weeks] + [_THISROW].[requested_extension_weeks]
extension_notes: CONCATENATE([extension_notes], CHAR(10), TEXT(NOW(), "yyyy-mm-dd HH:mm"), ": +", [_THISROW].[requested_extension_weeks], " weeks extension granted via tutor request #", [_THISROW].[id], " - ", [_THISROW].[reason])
last_extension_date: TODAY()
extension_granted_by: USEREMAIL()
```

**Sub-Action 2: Reschedule Session**
| Setting | Value |
|---------|-------|
| **Action Name** | `_Reschedule Session` |
| **Do This** | `Data: set the values of some columns in another table` |
| **Target** | `session_log` |
| **Referenced Rows** | `[session_id]` |

**Session Values:**
```
session_date: [_THISROW].[proposed_reschedule_date]
time_slot: [_THISROW].[proposed_reschedule_time]
notes: CONCATENATE([notes], " | Rescheduled via extension request #", [_THISROW].[id])
```

**Sub-Action 3: Mark Request Approved**
| Setting | Value |
|---------|-------|
| **Action Name** | `_Mark Request Approved` |
| **Do This** | `Data: set the values of some columns in this row` |

**Request Values:**
```
request_status: "Approved"
reviewed_by: USEREMAIL()
reviewed_at: NOW()
extension_granted_weeks: [requested_extension_weeks]
session_rescheduled: TRUE
review_notes: "Extension granted and session rescheduled"
```

#### Action B: Reject Extension Request

| Setting | Value |
|---------|-------|
| **Action Name** | `Reject Extension Request` |
| **For a Record Of** | `extension_requests` |
| **Do This** | `Data: set the values of some columns in this row` |
| **Show If** | `AND([request_status] = "Pending", LOOKUP(USEREMAIL(), "tutors", "user_email", "role") = "Admin")` |

**Values:**
```
request_status: "Rejected"
reviewed_by: USEREMAIL()
reviewed_at: NOW()
review_notes: [Prompt: "Reason for rejection?"]
```

#### Action C: Grant Extension Only (No Reschedule)

**Use Case**: Admin wants to extend deadline but let tutor reschedule manually

Same as Action A but skip Sub-Action 2 (reschedule), and set:
```
session_rescheduled: FALSE
review_notes: "Extension granted - tutor can now reschedule manually"
```

---

### Step 6: Create Tutor History View

**Navigate to:** UX > Views > New View

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `My Extension Requests` |
| **For This Data** | `extension_requests_tutor` |
| **View Type** | `Table` |
| **Show If** | `USEREMAIL() = [requested_by]` |
| **Sort Order** | `requested_at` DESC |

#### Columns to Show:
- `status_display`
- `student_name`
- `original_session_date`
- `proposed_reschedule_date`
- `reason`
- `review_notes`

---

### Step 7: Menu Structure

#### For Tutors:
- **Menu Item**: "My Extension Requests"
- **Icon**: 📝
- **Links to**: `My Extension Requests` view
- **Show If**: `LOOKUP(USEREMAIL(), "tutors", "user_email", "role") IN LIST("Tutor", "Admin")`

#### For Admins:
- **Menu Item**: "Extension Requests"
- **Icon**: ⏰
- **Links to**: `Extension Requests Management` view
- **Show If**: `LOOKUP(USEREMAIL(), "tutors", "user_email", "role") = "Admin"`
- **Badge**: `COUNT(SELECT(extension_requests[id], [request_status] = "Pending"))`

---

### Step 8: Optional Notification System

#### Bot 1: New Extension Request (To Admins)
| Setting | Value |
|---------|-------|
| **Trigger** | `ADDS_ONLY` on `extension_requests` |
| **Condition** | `[request_status] = "Pending"` |
| **Task** | Send notification |
| **Recipients** | Admin email addresses |

**Notification Template:**
- **Title**: `Extension request needs review`
- **Body**: `<<[Tutor_Name]>> requested <<[requested_extension_weeks]>> week extension for <<[Student_Name]>> session on <<[Session_Date]>>. Reason: <<[reason]>>`

#### Bot 2: Extension Decision (To Tutor)
| Setting | Value |
|---------|-------|
| **Trigger** | `UPDATES_ONLY` on `extension_requests` |
| **Condition** | `[_THISROW_BEFORE].[request_status] = "Pending"` |
| **Task** | Send notification |
| **Recipients** | `[requested_by]` |

**Notification Template:**
- **Title**: `Your extension request was <<[request_status]>>`
- **Body**: `Extension request for <<[Student_Name]>> session has been <<[request_status]>>. <<IF([review_notes], "Admin notes: " & [review_notes], "")>>`

---

## User Workflows

### Tutor Workflow (Requesting):
1. Try to reschedule session → Valid If blocks with "beyond enrollment period"
2. See "Request Extension" action button on session
3. Click button → Fill extension weeks, reason, proposed new date
4. Submit → Admin receives notification
5. Receive notification when admin makes decision
6. If approved: Can now reschedule session to the new date

### Admin Workflow (Approving):
1. Receive notification of new extension request
2. Open "Extension Requests" dashboard
3. See request with context:
   - Current enrollment extension status
   - Number of pending makeups (justification)
   - Tutor's proposed reschedule date
   - Admin guidance flags (urgent, review needed, etc.)
4. Click "Approve Extension Request" → Enrollment extended + Session rescheduled
5. Or click "Reject Extension Request" with reason
6. Tutor receives notification of decision

---

## Business Rules

### When Tutors Can Request Extensions:
✅ Session is for a paid enrollment
✅ Session date is beyond current enrollment effective end date
✅ Session status is "Scheduled" or "Make-up Class"
✅ Tutor owns the session

### Admin Approval Guidelines:
- **Auto-approve**: Student has pending makeups, requesting ≤2 weeks, no current extensions
- **Review required**: Already 4+ weeks extended, requesting >2 weeks, no pending makeups
- **Urgent**: Request pending >7 days

### Extension Limits:
- Standard: 1-2 weeks (tutor can request)
- Extended: 3-4 weeks (admin review recommended)
- Special: 5+ weeks (management approval)

---

## Benefits

- **Seamless Integration**: Works with existing Valid If system
- **Tutor Self-Service**: No need to email/call admin
- **Rich Context**: Admin sees full enrollment situation
- **One-Click Approval**: Extension + Reschedule in single action
- **Complete Audit Trail**: Track all extension requests and decisions
- **Prevents Manual Errors**: Automated enrollment updates
- **Business Intelligence**: Monitor extension patterns and tutors

---

## Testing Checklist

### Setup Testing:
- [ ] Migration 020 executed successfully
- [ ] Views created and accessible
- [ ] Virtual columns calculate correctly

### Tutor Workflow:
- [ ] "Request Extension" only shows when session is beyond enrollment period
- [ ] Tutor can fill all required fields (weeks, reason, proposed date)
- [ ] Request appears in admin view immediately
- [ ] Tutor sees request in "My Extension Requests" view

### Admin Workflow:
- [ ] Admin sees requests with full context (pending makeups, days pending, etc.)
- [ ] "Approve" action extends enrollment + reschedules session
- [ ] "Reject" action updates request with admin notes
- [ ] Admin guidance flags appear correctly (urgent, review, standard)

### Integration Testing:
- [ ] After approval, Valid If allows the new session date
- [ ] Enrollment effective_end_date updates correctly
- [ ] Session appears on tutor's schedule at new date/time
- [ ] Extension appears in enrollment audit trail

### Edge Cases:
- [ ] Multiple extension requests for same enrollment
- [ ] Requesting extension when already at limit
- [ ] Session deletion after extension request submitted
- [ ] Enrollment status changes during pending request

---

## Monitoring and Analytics

### Key Metrics to Track:
- Extension request volume by tutor
- Average approval time
- Most common rejection reasons
- Extensions by enrollment vs pending makeups correlation
- Peak request periods

### Useful Queries:
```sql
-- Extension request summary by month
SELECT
    DATE_FORMAT(requested_at, '%Y-%m') as month,
    COUNT(*) as total_requests,
    SUM(CASE WHEN request_status = 'Approved' THEN 1 ELSE 0 END) as approved,
    AVG(DATEDIFF(reviewed_at, requested_at)) as avg_review_days
FROM extension_requests
GROUP BY DATE_FORMAT(requested_at, '%Y-%m');

-- Tutors with most extension requests
SELECT
    t.tutor_name,
    COUNT(*) as request_count,
    AVG(er.requested_extension_weeks) as avg_weeks_requested
FROM extension_requests er
JOIN tutors t ON er.tutor_id = t.id
GROUP BY er.tutor_id
ORDER BY request_count DESC;
```

---

*This system integrates seamlessly with the holiday-aware extension deadline system (migration 019) and follows the same approval pattern as the existing class_requests system.*