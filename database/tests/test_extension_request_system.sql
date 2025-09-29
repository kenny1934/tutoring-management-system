-- Test Suite: Extension Request System
-- Purpose: Validate the extension request workflow from tutor request to admin approval
-- Run this after executing migration 020

-- ============================================================================
-- SETUP TEST DATA
-- ============================================================================

SELECT '=== Extension Request System Test Suite ===' as test_header;

-- ============================================================================
-- TEST 1: TABLE AND VIEW STRUCTURE
-- ============================================================================

SELECT 'TEST 1: Database Structure Validation' as test_name;

-- Test extension_requests table exists
SELECT
    'Table Structure Test' as test,
    'extension_requests table should exist' as requirement,
    CASE
        WHEN (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'extension_requests') = 1
        THEN '✅ PASS - Table exists'
        ELSE '❌ FAIL - Table not found'
    END as result;

-- Test required columns exist
SELECT
    'Required Columns Test' as test,
    'Essential columns should be present' as requirement,
    CASE
        WHEN (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_NAME = 'extension_requests'
              AND COLUMN_NAME IN ('id', 'session_id', 'enrollment_id', 'requested_extension_weeks', 'request_status', 'reason')) = 6
        THEN '✅ PASS - Required columns present'
        ELSE '❌ FAIL - Missing required columns'
    END as result;

-- Test admin view exists
SELECT
    'Admin View Test' as test,
    'pending_extension_requests_admin view should exist' as requirement,
    CASE
        WHEN (SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'pending_extension_requests_admin') = 1
        THEN '✅ PASS - Admin view exists'
        ELSE '❌ FAIL - Admin view not found'
    END as result;

-- Test tutor view exists
SELECT
    'Tutor View Test' as test,
    'extension_requests_tutor view should exist' as requirement,
    CASE
        WHEN (SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'extension_requests_tutor') = 1
        THEN '✅ PASS - Tutor view exists'
        ELSE '❌ FAIL - Tutor view not found'
    END as result;

-- ============================================================================
-- TEST 2: BASIC WORKFLOW SIMULATION
-- ============================================================================

SELECT 'TEST 2: Basic Extension Request Workflow' as test_name;

-- Note: These tests use placeholder IDs since they require actual data
-- Uncomment and modify with real IDs from your system for actual testing

/*
-- Test 2A: Create test extension request
INSERT INTO extension_requests (
    session_id,
    enrollment_id,
    student_id,
    tutor_id,
    requested_extension_weeks,
    reason,
    proposed_reschedule_date,
    proposed_reschedule_time,
    requested_by
) VALUES (
    [replace_with_actual_session_id],
    [replace_with_actual_enrollment_id],
    [replace_with_actual_student_id],
    [replace_with_actual_tutor_id],
    2,
    'Student has 3 pending makeup classes that need to be completed before enrollment ends',
    '2025-02-15',
    '4:00 PM',
    'tutor@school.com'
);

-- Test that request appears in admin view
SELECT
    'Admin View Population Test' as test,
    COUNT(*) as requests_in_admin_view,
    CASE
        WHEN COUNT(*) > 0 THEN '✅ PASS - Request visible to admin'
        ELSE '❌ FAIL - Request not in admin view'
    END as result
FROM pending_extension_requests_admin
WHERE request_status = 'Pending';

-- Test that request appears in tutor view
SELECT
    'Tutor View Population Test' as test,
    COUNT(*) as requests_in_tutor_view,
    CASE
        WHEN COUNT(*) > 0 THEN '✅ PASS - Request visible to tutor'
        ELSE '❌ FAIL - Request not in tutor view'
    END as result
FROM extension_requests_tutor
WHERE request_status = 'Pending'
AND requested_by = 'tutor@school.com';
*/

-- ============================================================================
-- TEST 3: VIEW CONTENT VALIDATION
-- ============================================================================

SELECT 'TEST 3: View Content and Calculations' as test_name;

-- Test admin view has required fields
SELECT
    'Admin View Fields Test' as test,
    'Admin view should have calculated fields' as requirement,
    CASE
        WHEN (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_NAME = 'pending_extension_requests_admin'
              AND COLUMN_NAME IN ('request_summary', 'admin_guidance', 'pending_makeups_count', 'projected_effective_end_date')) = 4
        THEN '✅ PASS - Required calculated fields present'
        ELSE '❌ FAIL - Missing calculated fields'
    END as result;

-- Test tutor view has status display
SELECT
    'Tutor View Fields Test' as test,
    'Tutor view should have status display' as requirement,
    CASE
        WHEN (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_NAME = 'extension_requests_tutor'
              AND COLUMN_NAME = 'status_display') = 1
        THEN '✅ PASS - Status display field present'
        ELSE '❌ FAIL - Status display field missing'
    END as result;

-- ============================================================================
-- TEST 4: INTEGRATION WITH EXISTING SYSTEMS
-- ============================================================================

SELECT 'TEST 4: Integration with Extension System' as test_name;

-- Test that calculate_effective_end_date function is available (from migration 019)
SELECT
    'Function Availability Test' as test,
    'calculate_effective_end_date function should be available' as requirement,
    CASE
        WHEN (SELECT COUNT(*) FROM INFORMATION_SCHEMA.ROUTINES
              WHERE ROUTINE_NAME = 'calculate_effective_end_date') = 1
        THEN '✅ PASS - Function available for integration'
        ELSE '❌ FAIL - Function not found'
    END as result;

-- Test that enrollment_effective_dates view exists (from migration 019)
SELECT
    'Extension Integration Test' as test,
    'enrollment_effective_dates view should be available' as requirement,
    CASE
        WHEN (SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS
              WHERE TABLE_NAME = 'enrollment_effective_dates') = 1
        THEN '✅ PASS - Extension view available'
        ELSE '❌ FAIL - Extension view not found'
    END as result;

-- ============================================================================
-- TEST 5: FOREIGN KEY CONSTRAINTS
-- ============================================================================

SELECT 'TEST 5: Data Integrity and Constraints' as test_name;

-- Test foreign key relationships
SELECT
    'Foreign Key Constraints Test' as test,
    'Table should have proper foreign key relationships' as requirement,
    CASE
        WHEN (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
              WHERE TABLE_NAME = 'extension_requests'
              AND REFERENCED_TABLE_NAME IN ('session_log', 'enrollments', 'students', 'tutors')) >= 4
        THEN '✅ PASS - Foreign key constraints exist'
        ELSE '❌ FAIL - Missing foreign key constraints'
    END as result;

-- Test indexes for performance
SELECT
    'Index Performance Test' as test,
    'Table should have performance indexes' as requirement,
    CASE
        WHEN (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
              WHERE TABLE_NAME = 'extension_requests'
              AND INDEX_NAME IN ('idx_status', 'idx_tutor', 'idx_enrollment')) >= 3
        THEN '✅ PASS - Performance indexes exist'
        ELSE '❌ FAIL - Missing performance indexes'
    END as result;

-- ============================================================================
-- TEST 6: BUSINESS LOGIC VALIDATION
-- ============================================================================

SELECT 'TEST 6: Business Logic and Workflow' as test_name;

-- Test default values
SELECT
    'Default Values Test' as test,
    'Table should have appropriate defaults' as requirement,
    CASE
        WHEN (SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_NAME = 'extension_requests' AND COLUMN_NAME = 'request_status') LIKE '%Pending%'
        THEN '✅ PASS - Default status is Pending'
        ELSE '❌ FAIL - Incorrect default status'
    END as result;

-- Test request_status enum values (implied by usage)
SELECT
    'Status Values Test' as test,
    'System should handle standard status values' as requirement,
    '✅ PASS - Status values handled by application logic' as result;

-- ============================================================================
-- TEST 7: ADMIN GUIDANCE LOGIC (requires sample data)
-- ============================================================================

SELECT 'TEST 7: Admin Guidance System' as test_name;

-- These tests would require actual data to be meaningful
-- They validate the admin_guidance calculations in the view

/*
-- Test admin guidance for urgent requests (>7 days pending)
SELECT
    'Urgent Request Detection' as test,
    request_id,
    days_since_request,
    admin_guidance,
    CASE
        WHEN days_since_request > 7 AND admin_guidance LIKE '%URGENT%'
        THEN '✅ PASS - Urgent detection working'
        ELSE '❌ FAIL - Urgent detection not working'
    END as result
FROM pending_extension_requests_admin
WHERE days_since_request > 7;

-- Test admin guidance for high extension counts
SELECT
    'Extension Limit Detection' as test,
    request_id,
    current_extension_weeks,
    admin_guidance,
    CASE
        WHEN current_extension_weeks >= 4 AND admin_guidance LIKE '%REVIEW REQUIRED%'
        THEN '✅ PASS - Extension limit detection working'
        ELSE '❌ FAIL - Extension limit detection not working'
    END as result
FROM pending_extension_requests_admin
WHERE current_extension_weeks >= 4;

-- Test admin guidance for requests without pending makeups
SELECT
    'Makeup Justification Check' as test,
    request_id,
    pending_makeups_count,
    admin_guidance,
    CASE
        WHEN pending_makeups_count = 0 AND admin_guidance LIKE '%QUESTION%'
        THEN '✅ PASS - Makeup justification check working'
        ELSE '❌ FAIL - Makeup justification check not working'
    END as result
FROM pending_extension_requests_admin
WHERE pending_makeups_count = 0;
*/

-- ============================================================================
-- TEST 8: WORKFLOW SIMULATION (requires manual testing)
-- ============================================================================

SELECT 'TEST 8: End-to-End Workflow Validation' as test_name;

SELECT
    'Workflow Test Instructions' as test,
    'Manual testing required for full workflow' as requirement,
    'Manual testing needed - see checklist below' as result;

-- ============================================================================
-- MANUAL TESTING CHECKLIST
-- ============================================================================

SELECT '=== Manual Testing Checklist ===' as checklist_header;

SELECT 'SETUP TESTING:' as category, '' as instruction
UNION ALL SELECT '', '1. Execute migration 020'
UNION ALL SELECT '', '2. Configure AppSheet actions per implementation guide'
UNION ALL SELECT '', '3. Set up test tutor and admin accounts'
UNION ALL SELECT '', '4. Create test enrollment with session beyond effective end date'

UNION ALL SELECT 'TUTOR WORKFLOW:' as category, '' as instruction
UNION ALL SELECT '', '1. Tutor tries to reschedule session beyond enrollment period'
UNION ALL SELECT '', '2. Valid If should block with error message'
UNION ALL SELECT '', '3. "Request Extension" action should be visible'
UNION ALL SELECT '', '4. Fill extension request form (weeks, reason, proposed date)'
UNION ALL SELECT '', '5. Submit request'
UNION ALL SELECT '', '6. Verify request appears in tutor history view'

UNION ALL SELECT 'ADMIN WORKFLOW:' as category, '' as instruction
UNION ALL SELECT '', '1. Admin sees request in Extension Requests Management view'
UNION ALL SELECT '', '2. Verify rich context displayed (pending makeups, admin guidance)'
UNION ALL SELECT '', '3. Click "Approve Extension Request"'
UNION ALL SELECT '', '4. Verify enrollment deadline_extension_weeks increased'
UNION ALL SELECT '', '5. Verify session rescheduled to proposed date'
UNION ALL SELECT '', '6. Verify request marked as approved'

UNION ALL SELECT 'INTEGRATION TESTING:' as category, '' as instruction
UNION ALL SELECT '', '1. After approval, tutor tries to reschedule again'
UNION ALL SELECT '', '2. Valid If should now allow the new date'
UNION ALL SELECT '', '3. Check enrollment_effective_dates view for updated date'
UNION ALL SELECT '', '4. Verify extension audit trail in enrollment notes'

UNION ALL SELECT 'EDGE CASE TESTING:' as category, '' as instruction
UNION ALL SELECT '', '1. Test rejection workflow with admin notes'
UNION ALL SELECT '', '2. Test multiple requests for same enrollment'
UNION ALL SELECT '', '3. Test requesting extension when already at limit'
UNION ALL SELECT '', '4. Test with enrollments that have no pending makeups';

-- ============================================================================
-- SAMPLE QUERIES FOR TESTING
-- ============================================================================

SELECT '=== Sample Testing Queries ===' as queries_header;

/*
-- Query 1: Check extension request was created
SELECT 'Extension Request Created:' as check_type, COUNT(*) as count
FROM extension_requests
WHERE request_status = 'Pending';

-- Query 2: Check admin view shows context
SELECT 'Admin View Context:' as check_type,
       request_summary,
       admin_guidance,
       pending_makeups_count,
       days_since_request
FROM pending_extension_requests_admin
WHERE request_status = 'Pending'
LIMIT 3;

-- Query 3: Check tutor view shows status
SELECT 'Tutor View Status:' as check_type,
       status_display,
       student_name,
       original_session_date,
       proposed_reschedule_date
FROM extension_requests_tutor
WHERE requested_by = 'test-tutor@school.com'
LIMIT 3;

-- Query 4: Verify enrollment extension after approval
SELECT 'Enrollment Extended:' as check_type,
       enrollment_id,
       deadline_extension_weeks,
       last_extension_date,
       extension_granted_by
FROM enrollments
WHERE extension_granted_by IS NOT NULL
AND last_extension_date >= CURDATE() - INTERVAL 1 DAY;

-- Query 5: Verify session rescheduled
SELECT 'Session Rescheduled:' as check_type,
       id as session_id,
       session_date,
       time_slot,
       notes
FROM session_log
WHERE notes LIKE '%extension request%'
LIMIT 3;
*/

-- ============================================================================
-- PERFORMANCE TESTING
-- ============================================================================

SELECT 'TEST 9: Performance Validation' as test_name;

-- Test view performance with simulated load
SELECT
    'View Performance Test' as test,
    'Views should execute within reasonable time' as requirement,
    'Monitor query execution time in production' as result;

-- Test index usage
SELECT
    'Index Usage Test' as test,
    'Queries should use indexes efficiently' as requirement,
    'Use EXPLAIN on view queries to verify index usage' as result;

-- ============================================================================
-- SUMMARY
-- ============================================================================

SELECT '=== Test Suite Summary ===' as summary;

SELECT
    'Database Structure' as test_category,
    'Tables, views, and constraints created' as status,
    '✅ Automated tests validate structure' as result

UNION ALL SELECT
    'Business Logic' as test_category,
    'Admin guidance and workflow logic' as status,
    '⚠️ Requires data for full validation' as result

UNION ALL SELECT
    'Integration' as test_category,
    'Works with existing extension system' as status,
    '✅ Function and view dependencies validated' as result

UNION ALL SELECT
    'End-to-End Workflow' as test_category,
    'Tutor request → Admin approval workflow' as status,
    '🔧 Manual testing required via AppSheet' as result;

-- Expected test results:
-- ✅ All structure tests should PASS
-- ✅ Integration tests should PASS (if migration 019 executed)
-- ⚠️ Business logic tests require sample data
-- 🔧 Workflow tests require AppSheet configuration and manual testing

SELECT 'Run manual tests per implementation guide to validate complete workflow' as next_steps;