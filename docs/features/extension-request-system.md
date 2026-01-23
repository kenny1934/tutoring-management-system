# Enrollment Extension Request System

## Overview

When scheduling make-up sessions, there may be cases where the proposed date falls after the enrollment's effective end date. This system allows tutors to request deadline extensions from admins, ensuring transparent handling of enrollment periods.

## Problem Statement

**Scenario:** Tutor A needs to schedule a make-up class for Student X. The make-up date falls after the enrollment's effective end date (calculated as first_lesson_date + lessons_paid weeks + any previous extensions). Without this system, the tutor would be unable to schedule the make-up.

**Solution:** When a tutor attempts to schedule a make-up past the deadline, the system:
1. Blocks the action with a clear error message
2. Displays the enrollment's effective end date
3. Provides a "Request Extension" button to submit a formal request to admins
4. Admin reviews and approves/rejects, optionally adjusting the extension duration

---

## Business Rules

### Core Rules
1. **Session-specific extensions**: Each request is tied to a specific session needing makeup
2. **Regular slot deadline enforcement**: The deadline block ONLY applies when scheduling to the student's regular slot (`assigned_day` + `assigned_time`) past the enrollment end date. Non-regular slots are NOT blocked, even if past the deadline.
3. **All need admin review**: No auto-approval - every extension request requires admin decision
4. **Same rules for everyone**: Admins are also blocked (they must approve the extension first)

### When is Scheduling Blocked?

| Scenario | Blocked? |
|----------|----------|
| Non-regular slot, past deadline | NO (allowed) |
| Regular slot, before deadline | NO (allowed) |
| Regular slot, past deadline | YES (blocked, requires extension) |

### Deadline Calculation
```
effective_end_date = first_lesson_date + (lessons_paid + deadline_extension_weeks) weeks
```

---

## Database Schema

The system uses the existing `extension_requests` table (created in migration 020):

### Table: `extension_requests`

```sql
CREATE TABLE extension_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,           -- Session needing makeup
    enrollment_id INT NOT NULL,        -- Parent enrollment
    student_id INT NOT NULL,
    tutor_id INT NOT NULL,             -- Requesting tutor

    -- Request details
    requested_extension_weeks INT DEFAULT 1,
    reason TEXT NOT NULL,
    proposed_reschedule_date DATE NULL,
    proposed_reschedule_time VARCHAR(100) NULL,

    -- Status workflow
    request_status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    requested_by VARCHAR(255) NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Review details
    reviewed_by VARCHAR(255) NULL,
    reviewed_at TIMESTAMP NULL,
    review_notes TEXT NULL,
    extension_granted_weeks INT NULL,
    session_rescheduled BOOLEAN DEFAULT FALSE,

    FOREIGN KEY (session_id) REFERENCES session_log(id),
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (tutor_id) REFERENCES tutors(id)
);
```

### Supporting Views

- `enrollment_effective_dates` - Calculates effective end dates for all enrollments
- `extension_requests_tutor` - Tutor's view of their requests with status
- `pending_extension_requests_admin` - Admin queue with full context

### Enrollment Fields

When an extension is approved, these fields are updated on the enrollment:
- `deadline_extension_weeks` - Total weeks of extensions granted
- `extension_notes` - Notes about the extension
- `last_extension_date` - When the last extension was granted
- `extension_granted_by` - Admin who granted the extension

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/extension-requests` | Tutor creates request |
| GET | `/extension-requests` | List requests (with filters) |
| GET | `/extension-requests/{id}` | Get request with full enrollment context |
| PATCH | `/extension-requests/{id}/approve` | Admin approves (updates enrollment) |
| PATCH | `/extension-requests/{id}/reject` | Admin rejects |
| GET | `/extension-requests/pending-count` | Badge count for admin nav |

### Error Response Format

When scheduling is blocked due to deadline:

```json
{
  "detail": "Cannot schedule past enrollment end date (2026-02-15). Request extension first."
}
```

The frontend parses this to extract the effective_end_date and show the extension request option.

---

## Workflow

### Tutor Flow

```
1. Tutor opens ScheduleMakeupModal or EditSessionModal
2. Selects a date/time that matches the student's regular slot (assigned_day + assigned_time)
   AND the date is past the enrollment end date
3. Early warning appears immediately (before clicking Save/Book):
   - Amber warning box showing the regular slot and deadline
   - "Request Extension" and "Pick Different Date/Revert" buttons
4. If tutor proceeds and clicks "Book Make-up" or "Save"
5. API returns ENROLLMENT_DEADLINE_EXCEEDED error
6. Modal shows error with:
   - Clear message about the regular slot and deadline
   - The enrollment's effective end date
   - "Request Extension" button
7. Tutor clicks "Request Extension"
8. ExtensionRequestModal opens with:
   - Session details
   - Extension duration selector (1-4 weeks)
   - Reason field (required, min 10 chars)
   - Optional proposed reschedule date/time
9. Tutor submits request
10. Request status = 'Pending', awaits admin review

Note: If tutor selects a non-regular slot (different day or time),
scheduling is allowed even if past the deadline - no warning or block.
```

### Admin Flow

```
1. Admin sees badge count on "Extension Requests" nav item
2. Opens Extension Requests list
3. Sees pending requests with summary info:
   - Student name
   - Requesting tutor
   - Weeks requested
   - Reason preview
4. Clicks a request to open review modal
5. Review modal shows full context:
   - Enrollment context (current extensions, pending makeups, etc.)
   - Projected end date if approved
   - Admin guidance (URGENT/REVIEW/OK)
6a. APPROVE:
    - Select weeks to grant (can differ from requested)
    - Optional notes
    - Optionally trigger session reschedule
    - Submit → enrollment.deadline_extension_weeks updated

6b. REJECT:
    - Enter rejection reason (required)
    - Submit → request marked rejected, tutor notified
```

### Post-Approval

After approval:
- Enrollment's `deadline_extension_weeks` is increased
- Tutor can now schedule makeup within the extended period
- The system shows the new effective end date everywhere

---

## UI Components

### ExtensionRequestModal (Tutor)
**File:** `webapp/frontend/components/sessions/ExtensionRequestModal.tsx`

- Triggered from ScheduleMakeupModal/EditSessionModal when deadline error occurs
- Shows session info and current deadline
- Form fields:
  - Extension duration (1-4 weeks dropdown)
  - Reason (required textarea, min 10 chars)
  - Proposed reschedule date (optional)
  - Proposed time slot (optional)

### ExtensionRequestsList (Admin)
**File:** `webapp/frontend/components/admin/ExtensionRequestsList.tsx`

- List view of all extension requests
- Status filter tabs: Pending, Approved, Rejected, All
- Auto-refresh every 30 seconds
- Pending count badge
- Click to open review modal

### ExtensionRequestReviewModal (Admin)
**File:** `webapp/frontend/components/admin/ExtensionRequestReviewModal.tsx`

- Three modes: review, approve, reject
- Review mode shows full context:
  - Student and tutor info
  - Original session date
  - Extension weeks requested
  - Reason
  - Enrollment context (current extensions, pending makeups, sessions completed)
  - Current vs projected end dates
  - Admin guidance banner
- Approve mode:
  - Weeks to grant selector
  - Optional notes
  - Reschedule option (if proposed date provided)
- Reject mode:
  - Rejection reason (required)

### Enrollment Detail Enhancements

**Files:**
- `webapp/frontend/app/enrollments/[id]/page.tsx`
- `webapp/frontend/components/enrollments/EnrollmentDetailPopover.tsx`

Added display of:
- Effective end date (calculated from first_lesson_date + weeks + extensions)
- Visual indicator when past deadline (red text)
- Extension weeks badge when extensions have been granted

---

## Files Modified/Created

### Backend

| File | Action |
|------|--------|
| `webapp/backend/models.py` | Added ExtensionRequest model |
| `webapp/backend/schemas.py` | Added extension request schemas + effective_end_date to EnrollmentResponse |
| `webapp/backend/routers/extension_requests.py` | **Created** - New router |
| `webapp/backend/routers/enrollments.py` | Added calculate_effective_end_date helper |
| `webapp/backend/routers/sessions.py` | Added deadline validation in schedule_makeup() and update_session() |
| `webapp/backend/routers/makeup_proposals.py` | Added deadline validation in approve_slot() |
| `webapp/backend/main.py` | Registered extension_requests router |

### Frontend

| File | Action |
|------|--------|
| `webapp/frontend/types/index.ts` | Added extension request types + effective_end_date to Enrollment |
| `webapp/frontend/lib/api.ts` | Added extensionRequestsAPI |
| `webapp/frontend/components/sessions/ExtensionRequestModal.tsx` | **Created** |
| `webapp/frontend/components/admin/ExtensionRequestReviewModal.tsx` | **Created** |
| `webapp/frontend/components/admin/ExtensionRequestsList.tsx` | **Created** |
| `webapp/frontend/components/sessions/ScheduleMakeupModal.tsx` | Integrated deadline error handling |
| `webapp/frontend/components/sessions/EditSessionModal.tsx` | Integrated deadline error handling |
| `webapp/frontend/app/enrollments/[id]/page.tsx` | Added effective end date display |
| `webapp/frontend/components/enrollments/EnrollmentDetailPopover.tsx` | Added effective end date display |

---

## Implementation Phases

### Phase 1: Backend Foundation
- ExtensionRequest SQLAlchemy model
- Pydantic schemas for all operations
- API router with CRUD endpoints

### Phase 2: Backend Validation
- Add deadline check to schedule_makeup()
- Add deadline check to approve_slot()
- Add deadline check to update_session()
- Return structured error with effective_end_date

### Phase 3: Frontend Types & API
- TypeScript interfaces
- API client functions

### Phase 4: Tutor Components
- ExtensionRequestModal for creating requests

### Phase 5: Admin Components
- ExtensionRequestsList for viewing queue
- ExtensionRequestReviewModal for approve/reject

### Phase 6: Integration
- Error handling in ScheduleMakeupModal
- Error handling in EditSessionModal
- Effective end date display in enrollment views

---

## Verification Checklist

### Deadline Enforcement
- [ ] Try scheduling makeup past enrollment end date - should get blocked
- [ ] Try editing session date past enrollment end date - should get blocked
- [ ] Verify error message shows the effective end date
- [ ] Verify "Request Extension" button appears

### Extension Request Creation
- [ ] Submit extension request from ScheduleMakeupModal
- [ ] Submit extension request from EditSessionModal
- [ ] Verify request appears in admin queue
- [ ] Verify all required fields validated (reason min 10 chars)

### Admin Review
- [ ] View pending requests list
- [ ] Open review modal - verify all context shown
- [ ] Approve with different weeks than requested
- [ ] Reject with reason
- [ ] Verify enrollment.deadline_extension_weeks updated on approve

### Post-Approval
- [ ] Verify tutor can now schedule within extended period
- [ ] Verify effective end date updated in enrollment views
- [ ] Verify extension badge shows in enrollment detail

### Edge Cases
- [ ] Multiple pending requests for same enrollment
- [ ] Request after previous extension already granted
- [ ] Admin guidance for unusual situations

---

## Decision Rationale

### Why Hard Block vs Soft Warning?
- Hard block ensures enrollment periods are respected
- Prevents accidental scheduling past deadlines
- Creates audit trail for all extensions

### Why Session-Specific?
- Ties extension need to a concrete case
- Provides context for admin review
- Prevents generic "give me more time" requests

### Why Admin Review Required?
- Extensions may have business/financial implications
- Admins can see full enrollment context
- Can adjust weeks granted vs requested

### Why Show Effective End Date Everywhere?
- Transparency for tutors and admins
- Proactive awareness before hitting deadline
- Clear communication about enrollment periods
