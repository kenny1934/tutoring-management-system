# Renewal Reminder Bot - Testing & Validation Plan

## Pre-Implementation Testing

### 1. Database View Validation

#### Test Query: Verify View Returns Correct Data
```sql
-- Test the active_enrollments_needing_renewal view
SELECT 
    student_name,
    tutor_name,
    remaining_sessions,
    end_date,
    assigned_day,
    assigned_time,
    location,
    payment_status
FROM active_enrollments_needing_renewal
ORDER BY remaining_sessions ASC, end_date ASC;
```

#### Expected Results Validation:
- [ ] Only shows enrollments with `payment_status = 'Paid'`
- [ ] Only shows enrollments with 1-2 remaining scheduled sessions
- [ ] `end_date` is calculated correctly using holiday logic
- [ ] All joins work correctly (student_name, tutor_name populated)

### 2. Test Data Setup

#### Create Test Enrollments (if needed):
```sql
-- Example test enrollment with 1 session left
INSERT INTO enrollments (student_id, tutor_id, assigned_day, assigned_time, location, lessons_paid, payment_date, first_lesson_date, payment_status)
VALUES (1, 1, 'Monday', '16:45-18:15', 'MSA', 6, '2024-01-15', '2024-01-22', 'Paid');

-- Create 5 attended sessions and 1 scheduled session for above enrollment
-- (This would make it appear in renewal reminder)
```

#### Test Scenarios to Create:
1. **Urgent Case:** Student with 1 session left
2. **Warning Case:** Student with 2 sessions left  
3. **Edge Case:** Student with 0 sessions (should not appear)
4. **Edge Case:** Student with "Pending Payment" (should not appear)
5. **Edge Case:** Student with 3+ sessions (should not appear)

## AppSheet Bot Testing

### 3. Manual Bot Execution Test

#### Test Steps:
1. **Navigate to:** Automation > Bots > Weekly Renewal Reminder
2. **Click:** "Run Now" 
3. **Monitor:** Execution log for errors
4. **Verify:** Email delivery to test address

#### Test Checklist:
- [ ] Bot executes without errors
- [ ] Email is generated and sent
- [ ] HTML formatting displays correctly
- [ ] All student data appears accurately
- [ ] Color coding works (red for 1 session, yellow for 2)
- [ ] Summary counts are correct

### 4. Email Content Validation

#### Email Template Tests:
- [ ] **Subject Line:** Shows correct student count
- [ ] **Header:** Company name and timestamp correct
- [ ] **Summary Section:** Accurate counts for urgent/warning cases
- [ ] **Student Table:** All columns populated correctly
- [ ] **Action Section:** Clear next steps displayed
- [ ] **Footer:** Contact info and automation notice

#### Cross-Client Testing:
Test email display in:
- [ ] Gmail web interface
- [ ] Outlook desktop client  
- [ ] Mobile email apps
- [ ] Check spam/junk folder delivery

### 5. Schedule Testing

#### Schedule Validation:
- [ ] **Timezone:** Correct business timezone set
- [ ] **Day/Time:** Matches business requirements (Monday 9 AM)
- [ ] **Frequency:** Weekly recurrence configured
- [ ] **Test Execution:** Run at scheduled time

#### Schedule Test Plan:
1. Set bot to run in 5 minutes for immediate test
2. Verify execution occurs at scheduled time
3. Reset to production schedule (Monday 9 AM)

## Edge Case Testing

### 6. Data Edge Cases

#### Test Scenarios:
- [ ] **Empty Result Set:** No students need renewal
- [ ] **Large Result Set:** 20+ students need renewal  
- [ ] **Data Anomalies:** Missing tutor/student names
- [ ] **Holiday Impact:** End dates during holiday periods
- [ ] **Weekend Sessions:** Saturday/Sunday classes

#### Expected Behaviors:
- Empty result: "No students need renewal" message
- Large result: Email sent with full list (check size limits)
- Missing data: Error handling or default values
- Holiday dates: Proper calculation in end_date field

### 7. Performance Testing

#### Load Testing:
- [ ] **Database Query:** View performs well with full dataset
- [ ] **Email Generation:** Large student lists don't timeout
- [ ] **Bot Execution:** Completes within reasonable time (<2 minutes)

#### Monitoring Points:
- Query execution time for the view
- Email generation time
- Bot completion time in AppSheet logs

## Production Rollout

### 8. Staging Environment Test

#### Pre-Production Checklist:
- [ ] **Admin Email List:** Set to staging/test emails
- [ ] **Schedule:** Set to daily for initial monitoring
- [ ] **Data:** Use production data copy
- [ ] **Monitor:** Daily execution for 1 week

### 9. Production Deployment

#### Go-Live Checklist:
- [ ] **Email Recipients:** Update to production admin list
- [ ] **Schedule:** Set to weekly (Monday 9 AM)
- [ ] **Monitoring:** Set up automated execution monitoring
- [ ] **Backup:** Document rollback procedures

#### Launch Week Monitoring:
- **Day 1:** Verify first production email sent correctly
- **Day 2-3:** Monitor for any admin team feedback
- **Week 1:** Confirm renewal conversion tracking
- **Week 2:** Review effectiveness metrics

## Validation SQL Queries

### 10. Data Validation Queries

#### Verify Students in Renewal List:
```sql
-- Cross-check: Students who should be in renewal reminder
SELECT 
    e.id as enrollment_id,
    s.student_name,
    t.tutor_name,
    COUNT(CASE WHEN sl.session_status = 'Scheduled' THEN 1 END) as scheduled_sessions,
    COUNT(CASE WHEN sl.session_status = 'Attended' THEN 1 END) as attended_sessions,
    e.payment_status,
    calculate_end_date(e.first_lesson_date, e.lessons_paid) as calculated_end_date
FROM enrollments e
JOIN students s ON e.student_id = s.id  
JOIN tutors t ON e.tutor_id = t.id
LEFT JOIN session_log sl ON sl.enrollment_id = e.id
WHERE e.payment_status = 'Paid'
GROUP BY e.id, s.student_name, t.tutor_name, e.payment_status, e.first_lesson_date, e.lessons_paid
HAVING scheduled_sessions <= 2 AND scheduled_sessions > 0
ORDER BY scheduled_sessions ASC;
```

#### Verify View Accuracy:
```sql
-- Compare view results with manual calculation
SELECT 
    'View Count' as source,
    COUNT(*) as student_count
FROM active_enrollments_needing_renewal

UNION ALL

SELECT 
    'Manual Count' as source,
    COUNT(DISTINCT e.id) as student_count
FROM enrollments e
WHERE e.payment_status = 'Paid' 
AND e.id IN (
    SELECT enrollment_id 
    FROM session_log 
    WHERE enrollment_id IS NOT NULL 
    AND session_status = 'Scheduled'
    GROUP BY enrollment_id 
    HAVING COUNT(*) <= 2 AND COUNT(*) > 0
);
```

## Success Metrics

### 11. KPI Tracking

#### Metrics to Monitor:
- **Email Delivery Rate:** 100% successful delivery
- **Admin Response Time:** Time from email to parent contact
- **Renewal Conversion:** % of reminded students who renew
- **False Positives:** Students incorrectly flagged for renewal

#### Weekly Reports:
- Number of students identified for renewal
- Number of successful parent contacts
- Number of completed renewals
- System accuracy rate

## Troubleshooting Guide

### 12. Common Issues & Solutions

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Bot doesn't run | Schedule/timezone wrong | Check AppSheet automation settings |
| Empty emails sent | View returning no data | Verify test data exists |
| HTML broken | Template syntax error | Test template with sample data |
| Wrong student count | View logic error | Run validation SQL queries |
| Missing students | Payment status filter | Check enrollment payment_status |
| Email to spam | Sender reputation | Use company domain, check content |

### 13. Rollback Plan

#### If Issues Arise:
1. **Immediate:** Disable bot in AppSheet
2. **Investigation:** Export automation logs
3. **Communication:** Notify admin team of temporary manual process  
4. **Resolution:** Fix issue and re-test
5. **Re-deployment:** Gradual rollout with enhanced monitoring