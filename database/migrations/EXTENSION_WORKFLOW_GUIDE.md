# Extension Workflow Guide

## Overview

The deadline extension system allows administrators to grant additional time for students to use their remaining lesson credits when they have pending make-up classes or special circumstances. This guide covers the complete workflow from identifying candidates to managing the extended deadlines.

## How Extensions Work

### Core Concept
- **Original End Date**: When the paid lessons are scheduled to complete (calculated by `calculate_end_date()`)
- **Extension Weeks**: Additional weeks granted for using remaining credits
- **Effective End Date**: Original end date + extension weeks (holiday-aware via `calculate_effective_end_date()`)

### Extension Types
- **Standard Extension**: 1-2 weeks (admin level approval)
- **Extended Case**: 3-4 weeks (requires review)
- **Special Case**: 5+ weeks (management approval required)

## Admin Workflow

### Step 1: Identify Extension Candidates

Access the **Active Enrollments Needing Renewal** view to see:

```sql
-- Enrollments approaching renewal with extension opportunities
SELECT
    student_name,
    days_until_renewal,
    pending_makeups,
    extension_status,
    available_actions
FROM active_enrollments_needing_renewal
WHERE available_actions = 'Can Grant Extension'
ORDER BY days_until_renewal ASC;
```

**Look for:**
- Students with `pending_makeups > 0`
- `days_until_renewal` between 0-14 days
- `available_actions` showing "Can Grant Extension"

### Step 2: Review Extension Criteria

**Standard Reasons for Extensions:**
- Student has pending make-up classes (rescheduled, sick leave, weather cancelled)
- Approaching enrollment end date with unused credits
- Need time to schedule accumulated make-ups

**Special Circumstances:**
- Medical emergencies or hospitalization
- Family emergencies
- Extended travel or temporary relocation
- Technical issues preventing scheduling

### Step 3: Grant Extension (AppSheet)

#### Method A: Using Admin Action Button
1. Open the enrollment record
2. Click "Grant 2-Week Extension" action button
3. System automatically:
   - Adds 2 weeks to `deadline_extension_weeks`
   - Updates `extension_notes` with timestamp and admin email
   - Sets `last_extension_date` to today
   - Records `extension_granted_by` as current user email

#### Method B: Manual Field Update
1. Edit the enrollment record
2. Update `deadline_extension_weeks` field (add 1-2 weeks typically)
3. Add explanation in `extension_notes`:
   ```
   2025-01-15 14:30: +2 weeks extension granted due to 3 pending make-ups - admin@school.com
   ```
4. Update `last_extension_date` to today
5. Set `extension_granted_by` to your email

### Step 4: Communicate with Student/Parent

**Extension Notification Template:**
```
Dear [Student/Parent Name],

Your enrollment deadline has been extended by [X] weeks until [New End Date].

Original end date: [Original Date]
Extended end date: [New End Date]
Reason: [Brief explanation]

Remaining credits: [Number] lessons
Pending make-ups to schedule: [Number]

Please coordinate with your tutor to schedule the remaining sessions before the new deadline.

Best regards,
[Admin Name]
```

### Step 5: Monitor Extension Usage

Check the renewal view regularly for:
- `extension_status` showing current extension level
- `days_until_renewal` counting down from extended deadline
- Students approaching limits (extension_status = "Max Extension Reached")

## AppSheet Configuration

### Critical Fix for Extension Issue

**Problem Solved**: Previously, when an extension was granted, the enrollment would disappear from `active_enrollments_needing_renewal` view (due to time filters), causing Valid If to fail because `[enrollment_id].[_effective_end_date]` was no longer accessible.

**Solution**: The new `enrollment_effective_dates` view has NO time restrictions and is always available for ALL paid enrollments.

### Setup Steps

#### Step 1: Add New Data Source
1. In AppSheet, go to Data > Tables
2. Add new data source: `enrollment_effective_dates` view
3. This view provides accurate, holiday-aware effective end dates
4. Available for ALL paid enrollments (no time restrictions)

#### Step 2: Create REF Relationship
In the **Session_Log** table, add a new column:

**Column Configuration:**
- **Name**: `Related_Enrollment_Dates`
- **Type**: `Ref`
- **Referenced Table**: `enrollment_effective_dates`
- **Formula**: `[enrollment_id]`
- **Show?**: `No` (this is a background relationship)

#### Step 3: Update Valid If Formula

```javascript
// session_log.session_date Valid If (UPDATED)
AND(
  NOT(IN([session_date], holidays[holiday_date])),
  [session_date] <= [_THISROW_BEFORE].[session_date] + 60,
  NOT(
    AND(
      [session_date] > [Related_Enrollment_Dates].[effective_end_date],
      [time_slot] = [enrollment_id].[assigned_time],
      TEXT([session_date], "ddd") = [enrollment_id].[assigned_day]
    )
  )
)
```

**Key Change**: Use `[Related_Enrollment_Dates].[effective_end_date]` instead of `[enrollment_id].[_effective_end_date]`

### Optional Virtual Columns (Enrollments Table)

```javascript
// _extension_status_display
IF(
  [deadline_extension_weeks] = 0,
  "",
  CONCATENATE("Extended by ", [deadline_extension_weeks], " weeks until ", TEXT([Related_Enrollment_Dates].[effective_end_date], "MMM DD"))
)

// _days_until_effective_end
[Related_Enrollment_Dates].[effective_end_date] - TODAY()
```

### Admin Actions

```javascript
// Action: Grant Standard Extension
// Condition: AND([payment_status] = "Paid", [deadline_extension_weeks] < 2)
// Updates:
deadline_extension_weeks: [deadline_extension_weeks] + 2
extension_notes: CONCATENATE([extension_notes], CHAR(10), TEXT(NOW(), "yyyy-mm-dd HH:mm"), ": +2 weeks extension granted by ", USEREMAIL())
last_extension_date: TODAY()
extension_granted_by: USEREMAIL()
```

## Business Rules

### Extension Limits
- **Standard**: Up to 2 weeks total per enrollment
- **Extended**: 3-4 weeks (flag for review)
- **Special**: 5+ weeks (requires management approval)

### Extension Guidelines
1. **Primary Purpose**: Allow time to use existing paid credits
2. **Not for New Sessions**: Extensions don't add more lessons, just more time
3. **Holiday Awareness**: System automatically accounts for holidays in deadline calculation
4. **One-Time Policy**: Generally one extension per enrollment (exceptions for special circumstances)

### Documentation Requirements
- Always record reason in `extension_notes`
- Include admin email and timestamp
- For special cases (>2 weeks), include management approval reference

## Common Scenarios

### Scenario 1: Student with Multiple Make-ups
**Situation**: Student has 3 pending make-ups, enrollment ends in 5 days
**Action**: Grant 2-week extension
**Result**: Student has 19 days to schedule and complete make-ups

### Scenario 2: Medical Emergency
**Situation**: Student hospitalized, needs 4 weeks recovery time
**Action**: Grant 4-week special extension with medical documentation
**Result**: Enrollment deadline extended 4 weeks, flagged for management review

### Scenario 3: Repeated Extensions
**Situation**: Student already has 2-week extension, requesting more time
**Action**: Review individual circumstances, may require enrollment renewal instead
**Result**: Case-by-case decision, typically max 4 weeks total

## Monitoring and Reporting

### Weekly Admin Tasks
1. Review `active_enrollments_needing_renewal` for extension candidates
2. Follow up on granted extensions approaching new deadlines
3. Monitor extension usage patterns for policy adjustments

### Monthly Reporting
```sql
-- Extension usage summary
SELECT
    extension_status,
    COUNT(*) as enrollment_count,
    AVG(deadline_extension_weeks) as avg_weeks_extended
FROM active_enrollments_needing_renewal
GROUP BY extension_status;

-- Recent extensions granted
SELECT
    student_name,
    deadline_extension_weeks,
    last_extension_date,
    extension_granted_by,
    LEFT(extension_notes, 100) as notes_preview
FROM enrollments
WHERE last_extension_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
ORDER BY last_extension_date DESC;
```

## Troubleshooting

### Common Issues

**Issue**: Extension granted but student still can't reschedule
**Solution**:
1. Check if `enrollment_effective_dates` view is accessible in AppSheet
2. Verify `Related_Enrollment_Dates` REF relationship is properly configured
3. Refresh AppSheet data if needed

**Issue**: Error message still shows original end date
**Solution**: Ensure Valid If and error message reference `[Related_Enrollment_Dates].[effective_end_date]` not virtual columns

**Issue**: Extension not showing in renewal view
**Solution**: This is expected behavior - the renewal view has time filters. Extensions should be visible in `enrollment_effective_dates` view

**Issue**: Valid If breaks after granting extension
**Solution**: This was the original issue - ensure you're using the new `enrollment_effective_dates` view approach, not virtual columns

### Technical Support
- Check database function: `SELECT calculate_effective_end_date('2025-01-01', 12, 2);`
- Verify view exists: `SELECT * FROM enrollment_effective_dates LIMIT 5;`
- Check holiday data in `holidays` table
- Test REF relationship in AppSheet
- Review migration 019 execution logs

## Implementation Checklist

### Database Setup
- [ ] Execute migration 019 in database
- [ ] Verify `calculate_effective_end_date` function works correctly
- [ ] Verify `enrollment_effective_dates` view is created
- [ ] Run test suite to validate functionality

### AppSheet Configuration
- [ ] Add `enrollment_effective_dates` view as data source
- [ ] Create `Related_Enrollment_Dates` REF relationship in Session_Log table
- [ ] Update session_date Valid If formula to use new REF
- [ ] Update error message for session rescheduling
- [ ] Configure admin action for granting extensions
- [ ] Test extension workflow end-to-end

### Training and Testing
- [ ] Train admin staff on extension workflow
- [ ] Test with sample scenarios (no extension, standard extension, holiday periods)
- [ ] Verify Valid If works correctly after extensions are granted
- [ ] Test error messages provide clear guidance
- [ ] Document any customizations for your specific needs

### Verification Tests
- [ ] Grant extension to enrollment and verify it stays in `enrollment_effective_dates` view
- [ ] Test rescheduling within extended period (should work)
- [ ] Test rescheduling beyond extended period (should be blocked)
- [ ] Verify error messages show correct effective end dates

---

*This guide assumes migration 019 has been successfully executed and AppSheet has been configured according to the migration documentation.*