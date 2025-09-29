-- Migration 020: Extension Request System
-- Purpose: Allow tutors to request deadline extensions for specific sessions
-- Provides admin approval workflow with integrated session rescheduling

-- ============================================================================
-- CREATE EXTENSION REQUESTS TABLE
-- ============================================================================

SELECT 'Creating extension_requests table...' as status;

CREATE TABLE extension_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL COMMENT 'The session that needs extension',
    enrollment_id INT NOT NULL COMMENT 'The enrollment to extend',
    student_id INT NOT NULL,
    tutor_id INT NOT NULL,

    -- Request details
    requested_extension_weeks INT DEFAULT 1 COMMENT 'How many weeks of extension requested (1-2 typical)',
    reason TEXT NOT NULL COMMENT 'Why is extension needed (pending makeups, special circumstances, etc.)',
    proposed_reschedule_date DATE COMMENT 'When tutor wants to reschedule this session',
    proposed_reschedule_time VARCHAR(100) COMMENT 'Proposed time for rescheduled session',

    -- Workflow status
    request_status VARCHAR(20) DEFAULT 'Pending' COMMENT 'Pending, Approved, Rejected',

    -- Audit trail
    requested_by VARCHAR(255) NOT NULL COMMENT 'Tutor email who made request',
    requested_at TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    reviewed_by VARCHAR(255) NULL COMMENT 'Admin who approved/rejected',
    reviewed_at TIMESTAMP NULL,
    review_notes TEXT COMMENT 'Admin notes on approval/rejection',

    -- Extension tracking (if approved)
    extension_granted_weeks INT NULL COMMENT 'Actual weeks granted (may differ from requested)',
    session_rescheduled BOOLEAN DEFAULT FALSE COMMENT 'Whether the session was rescheduled as part of approval',

    FOREIGN KEY (session_id) REFERENCES session_log(id),
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    INDEX idx_status (request_status),
    INDEX idx_tutor (tutor_id),
    INDEX idx_enrollment (enrollment_id),
    INDEX idx_requested_at (requested_at)
) COMMENT 'Stores tutor requests for enrollment deadline extensions with session rescheduling';

SELECT 'extension_requests table created successfully.' as result;

-- ============================================================================
-- CREATE ADMIN VIEW FOR PENDING REQUESTS
-- ============================================================================

SELECT 'Creating pending_extension_requests_admin view...' as status;

CREATE OR REPLACE VIEW pending_extension_requests_admin AS
SELECT
    er.id AS request_id,
    er.session_id,
    er.enrollment_id,
    er.request_status,
    er.requested_extension_weeks,
    er.extension_granted_weeks,
    er.session_rescheduled,

    -- Student and tutor info
    s.student_name,
    s.school_student_id,
    t.tutor_name,
    er.requested_by AS tutor_email,

    -- Session details
    sl.session_date AS original_session_date,
    sl.time_slot AS original_time_slot,
    sl.location,
    sl.session_status,
    er.proposed_reschedule_date,
    er.proposed_reschedule_time,

    -- Enrollment context
    e.first_lesson_date,
    e.lessons_paid,
    e.deadline_extension_weeks AS current_extension_weeks,
    e.assigned_day,
    e.assigned_time,

    -- Calculated dates for admin decision making
    calculate_end_date(e.first_lesson_date, e.lessons_paid) AS original_end_date,
    calculate_effective_end_date(
        e.first_lesson_date,
        e.lessons_paid,
        COALESCE(e.deadline_extension_weeks, 0)
    ) AS current_effective_end_date,
    calculate_effective_end_date(
        e.first_lesson_date,
        e.lessons_paid,
        COALESCE(e.deadline_extension_weeks, 0) + er.requested_extension_weeks
    ) AS projected_effective_end_date,

    -- Request context
    er.reason,
    er.requested_at,
    er.reviewed_by,
    er.reviewed_at,
    er.review_notes,

    -- Days info for admin priority
    DATEDIFF(CURDATE(), er.requested_at) AS days_since_request,
    DATEDIFF(
        calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ),
        CURDATE()
    ) AS days_until_current_end,

    -- Pending makeups count (justification for extension)
    (SELECT COUNT(*)
     FROM session_log sl_pending
     WHERE sl_pending.enrollment_id = er.enrollment_id
     AND sl_pending.session_status IN (
         'Rescheduled - Pending Make-up',
         'Sick Leave - Pending Make-up',
         'Weather Cancelled - Pending Make-up'
     )) AS pending_makeups_count,

    -- Total sessions used vs paid (enrollment utilization)
    (SELECT COUNT(*)
     FROM session_log sl_used
     WHERE sl_used.enrollment_id = er.enrollment_id
     AND sl_used.session_status IN ('Attended', 'Attended (Make-up)', 'No Show')) AS sessions_completed,

    -- Display summary for admin dashboard
    CONCAT(
        s.student_name, ' (', t.tutor_name, ') - ',
        er.requested_extension_weeks, 'w extension for session on ',
        DATE_FORMAT(sl.session_date, '%b %d, %Y')
    ) AS request_summary,

    -- Admin guidance based on enrollment status
    CASE
        WHEN COALESCE(e.deadline_extension_weeks, 0) >= 4 THEN 'REVIEW REQUIRED: Already 4+ weeks extended'
        WHEN (SELECT COUNT(*) FROM session_log sl_pending WHERE sl_pending.enrollment_id = er.enrollment_id
              AND sl_pending.session_status LIKE '%Pending Make-up%') = 0 THEN 'QUESTION: No pending makeups - why extend?'
        WHEN DATEDIFF(CURDATE(), er.requested_at) > 7 THEN 'URGENT: Request pending over 7 days'
        WHEN er.requested_extension_weeks > 2 THEN 'REVIEW: Requesting >2 weeks extension'
        ELSE 'STANDARD: Normal extension request'
    END AS admin_guidance

FROM extension_requests er
JOIN session_log sl ON er.session_id = sl.id
JOIN enrollments e ON er.enrollment_id = e.id
JOIN students s ON er.student_id = s.id
JOIN tutors t ON er.tutor_id = t.id
ORDER BY
    CASE er.request_status
        WHEN 'Pending' THEN 1
        WHEN 'Approved' THEN 2
        WHEN 'Rejected' THEN 3
    END,
    er.requested_at ASC;

SELECT 'pending_extension_requests_admin view created successfully.' as result;

-- ============================================================================
-- CREATE TUTOR VIEW FOR THEIR REQUESTS
-- ============================================================================

SELECT 'Creating extension_requests_tutor view...' as status;

CREATE OR REPLACE VIEW extension_requests_tutor AS
SELECT
    er.id AS request_id,
    er.session_id,
    er.enrollment_id,
    er.request_status,
    er.requested_extension_weeks,
    er.extension_granted_weeks,
    er.session_rescheduled,

    -- Student info
    s.student_name,
    s.school_student_id,

    -- Session details
    sl.session_date AS original_session_date,
    sl.time_slot AS original_time_slot,
    sl.location,
    er.proposed_reschedule_date,
    er.proposed_reschedule_time,

    -- Request details
    er.reason,
    er.requested_at,
    er.reviewed_by,
    er.reviewed_at,
    er.review_notes,

    -- Status for tutor
    CASE er.request_status
        WHEN 'Pending' THEN CONCAT('🟡 Pending Admin Review (', DATEDIFF(CURDATE(), er.requested_at), ' days)')
        WHEN 'Approved' THEN CONCAT('✅ Approved - ', COALESCE(er.extension_granted_weeks, 0), ' weeks granted')
        WHEN 'Rejected' THEN '❌ Request Denied'
        ELSE '❓ Unknown Status'
    END AS status_display,

    -- Tutor info for filtering
    er.tutor_id,
    er.requested_by

FROM extension_requests er
JOIN session_log sl ON er.session_id = sl.id
JOIN students s ON er.student_id = s.id
ORDER BY er.requested_at DESC;

SELECT 'extension_requests_tutor view created successfully.' as result;

-- ============================================================================
-- APPSHEET INTEGRATION GUIDANCE
-- ============================================================================

/*
APPSHEET CONFIGURATION GUIDANCE:

1. ADD DATA SOURCES:
   - Add "extension_requests" table as data source
   - Add "pending_extension_requests_admin" view as data source for admins
   - Add "extension_requests_tutor" view as data source for tutors

2. TUTOR ACTION - REQUEST EXTENSION (on session_log table):

   Action Name: Request Extension

   Show If:
   AND(
     USEREMAIL() = [tutor_id].[user_email],
     NOT(ISBLANK([enrollment_id])),
     [enrollment_id].[payment_status] = "Paid",
     IN([session_status], LIST("Scheduled", "Make-up Class")),
     [session_date] > [enrollment_id].[Related_Enrollment_Dates].[effective_end_date]
   )

   Do This: Data: add a new row to another table using values from this row
   Target Table: extension_requests

   Values:
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

3. VIRTUAL COLUMNS FOR EXTENSION_REQUESTS:

   Student_Name (Text):
   LOOKUP([student_id], "students", "id", "student_name")

   Tutor_Name (Text):
   LOOKUP([tutor_id], "tutors", "id", "tutor_name")

   Session_Date (Date):
   LOOKUP([session_id], "session_log", "id", "session_date")

   Request_Summary (Text):
   CONCATENATE(
     [Student_Name], " (", [Tutor_Name], ") - ",
     [requested_extension_weeks], " week extension for session on ",
     TEXT([Session_Date], "MMM DD, YYYY")
   )

   Status_Badge (Text):
   SWITCH([request_status],
     "Pending", "🟡 Pending Admin Review",
     "Approved", "✅ Extension Granted",
     "Rejected", "❌ Request Denied",
     "❓ Unknown"
   )

   Days_Pending (Number):
   IF([request_status] = "Pending", TODAY() - [requested_at], 0)

4. ADMIN ACTIONS:

   Action A: Approve Extension Request

   Show If:
   AND(
     [request_status] = "Pending",
     LOOKUP(USEREMAIL(), "tutors", "user_email", "role") = "Admin"
   )

   Do This: Data: execute an action on a set of rows

   Sub-Actions:
   1. Update Enrollment Extension (target: enrollments, ref: [enrollment_id])
      deadline_extension_weeks: [deadline_extension_weeks] + [_THISROW].[requested_extension_weeks]
      extension_notes: CONCATENATE([extension_notes], CHAR(10), TEXT(NOW(), "yyyy-mm-dd HH:mm"), ": +", [_THISROW].[requested_extension_weeks], " weeks extension granted via tutor request #", [_THISROW].[id], " - ", [_THISROW].[reason])
      last_extension_date: TODAY()
      extension_granted_by: USEREMAIL()

   2. Reschedule Session (target: session_log, ref: [session_id])
      session_date: [_THISROW].[proposed_reschedule_date]
      time_slot: [_THISROW].[proposed_reschedule_time]
      notes: CONCATENATE([notes], " | Rescheduled via extension request #", [_THISROW].[id])

   3. Mark Request Approved (target: extension_requests, this row)
      request_status: "Approved"
      reviewed_by: USEREMAIL()
      reviewed_at: NOW()
      extension_granted_weeks: [requested_extension_weeks]
      session_rescheduled: TRUE
      review_notes: "Extension granted and session rescheduled"

   Action B: Reject Extension Request

   request_status: "Rejected"
   reviewed_by: USEREMAIL()
   reviewed_at: NOW()
   review_notes: [Prompt: "Reason for rejection?"]

5. ADMIN VIEW CONFIGURATION:

   View Name: Extension Requests Management
   For This Data: pending_extension_requests_admin
   View Type: Table or Deck
   Show If: LOOKUP(USEREMAIL(), "tutors", "user_email", "role") = "Admin"
   Sort: requested_at DESC
   Group By: request_status

   Columns to Show:
   - request_summary
   - admin_guidance
   - pending_makeups_count
   - days_since_request
   - reason
   - proposed_reschedule_date

6. TUTOR VIEW CONFIGURATION:

   View Name: My Extension Requests
   For This Data: extension_requests_tutor
   View Type: Table
   Show If: USEREMAIL() = [requested_by]
   Sort: requested_at DESC

   Columns to Show:
   - status_display
   - student_name
   - original_session_date
   - proposed_reschedule_date
   - reason
   - review_notes

WORKFLOW EXAMPLE:
1. Tutor tries to reschedule session beyond enrollment period → Valid If blocks
2. Tutor sees "Request Extension" action → Clicks it
3. Tutor fills reason and proposed date → Submits request
4. Admin receives notification of new request
5. Admin reviews context (pending makeups, enrollment status)
6. Admin approves → Enrollment extended + Session rescheduled
7. Valid If now allows the session date
8. Tutor receives notification of approval

NOTIFICATION BOTS (OPTIONAL):
- New Request: Notify admins when request created
- Decision Made: Notify tutor when request approved/rejected
*/

-- ============================================================================
-- EXAMPLE TESTING QUERIES
-- ============================================================================

/*
-- Test extension request workflow:

-- 1. Insert test request (simulating tutor action)
INSERT INTO extension_requests (
    session_id, enrollment_id, student_id, tutor_id,
    requested_extension_weeks, reason,
    proposed_reschedule_date, proposed_reschedule_time,
    requested_by
) VALUES (
    [session_id], [enrollment_id], [student_id], [tutor_id],
    2, 'Student has 3 pending makeup classes that need to be completed',
    '2025-02-15', '4:00 PM',
    'tutor@school.com'
);

-- 2. View admin dashboard
SELECT * FROM pending_extension_requests_admin WHERE request_status = 'Pending';

-- 3. Simulate admin approval (would be done via AppSheet actions)
UPDATE enrollments
SET deadline_extension_weeks = deadline_extension_weeks + 2,
    extension_notes = CONCAT(extension_notes, '\n2025-01-15 10:30: +2 weeks extension granted via tutor request #1'),
    last_extension_date = CURDATE(),
    extension_granted_by = 'admin@school.com'
WHERE id = [enrollment_id];

UPDATE session_log
SET session_date = '2025-02-15',
    time_slot = '4:00 PM',
    notes = CONCAT(notes, ' | Rescheduled via extension request #1')
WHERE id = [session_id];

UPDATE extension_requests
SET request_status = 'Approved',
    reviewed_by = 'admin@school.com',
    reviewed_at = NOW(),
    extension_granted_weeks = 2,
    session_rescheduled = TRUE,
    review_notes = 'Extension granted and session rescheduled'
WHERE id = 1;

-- 4. Verify the workflow
SELECT * FROM pending_extension_requests_admin WHERE request_id = 1;
SELECT * FROM enrollment_effective_dates WHERE enrollment_id = [enrollment_id];
*/

SELECT 'Migration 020: Extension request system completed successfully.' as result;

-- ============================================================================
-- SUMMARY
-- ============================================================================

/*
CREATED:
1. extension_requests table - stores all extension requests with full audit trail
2. pending_extension_requests_admin view - rich context for admin decision making
3. extension_requests_tutor view - tutor's view of their requests

ENABLES:
1. Tutors can request extensions when blocked by Valid If
2. Admins see full context (pending makeups, enrollment status, urgency)
3. One-click approval that extends enrollment AND reschedules session
4. Complete audit trail of all extension requests
5. Integration with existing enrollment_effective_dates system

NEXT STEPS:
1. Configure AppSheet actions and views per guidance above
2. Set up notification bots (optional)
3. Train tutors and admins on new workflow
4. Monitor usage and adjust business rules as needed
*/