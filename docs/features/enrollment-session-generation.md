# Enrollment & Session Generation System (Webapp)

> **Note:** This is the Webapp implementation plan, replacing the legacy AppSheet workflow.

## Overview
Implement the core feature for creating enrollments and auto-generating sessions with holiday awareness, conflict detection, and renewal support.

---

## Backend Implementation

### 1. New Schemas (`webapp/backend/schemas.py`)

```python
class EnrollmentCreate(BaseModel):
    student_id: int
    tutor_id: int
    assigned_day: str  # "Monday", "Tuesday", etc.
    assigned_time: str  # "16:45 - 18:15"
    location: str
    first_lesson_date: date
    lessons_paid: int  # Number of sessions to generate
    enrollment_type: str = "Regular"  # Regular, Trial, One-Time
    remark: Optional[str] = None
    renewed_from_enrollment_id: Optional[int] = None
    discount_id: Optional[int] = None

class SessionPreview(BaseModel):
    session_date: date
    time_slot: str
    location: str
    is_holiday: bool = False
    conflict: Optional[str] = None  # Conflict description if any

class EnrollmentPreviewResponse(BaseModel):
    enrollment_data: EnrollmentCreate
    sessions: List[SessionPreview]
    effective_end_date: date
    conflicts: List[dict]  # Student conflicts with existing sessions
    warnings: List[str]  # Holiday shifts, etc.

class ConflictCheck(BaseModel):
    student_id: int
    dates_times: List[dict]  # [{date, time_slot}, ...]
```

### 2. New Endpoints (`webapp/backend/routers/enrollments.py`)

#### POST `/enrollments/preview`
Preview sessions before creating enrollment (no DB writes).

**Logic:**
1. Validate student/tutor exist
2. Generate session dates:
   - Start from `first_lesson_date`
   - For Trial/One-Time: 1 session only
   - For Regular: `lessons_paid` sessions
   - Skip holidays (query `holidays` table), push to next week
3. Check student conflicts (existing sessions on same date + time_slot)
4. Return preview with sessions, conflicts, warnings

#### POST `/enrollments`
Create enrollment and generate sessions.

**Logic:**
1. Create enrollment record (payment_status = 'Pending Payment')
2. Generate sessions using same holiday-aware logic
3. Insert all sessions as 'Scheduled' status
4. Return enrollment with generated session count

#### GET `/enrollments/{enrollment_id}/renewal-data`
Get pre-filled data for renewal enrollment.

**Logic:**
1. Load expiring enrollment
2. Calculate suggested first_lesson_date:
   - Find next occurrence of `assigned_day` after `effective_end_date`
3. Return all fields for form pre-fill

#### POST `/sessions/check-conflicts`
Check for student conflicts across multiple dates.

**Logic:**
1. Query existing sessions for student on given dates/times
2. Return list of conflicts with session details

### 3. Session Generation Logic

```python
def generate_session_dates(
    first_lesson_date: date,
    assigned_day: str,
    lessons_paid: int,
    enrollment_type: str,
    db: Session
) -> List[tuple[date, bool, Optional[str]]]:
    """
    Returns: [(session_date, is_skipped_holiday, skip_reason), ...]
    """
    sessions = []
    current_date = first_lesson_date
    sessions_generated = 0
    max_sessions = 1 if enrollment_type in ('Trial', 'One-Time') else lessons_paid

    # Load holidays for date range (first_lesson_date to first_lesson_date + 52 weeks)
    holidays = load_holidays_in_range(db, first_lesson_date, weeks=52)

    while sessions_generated < max_sessions:
        holiday = holidays.get(current_date)
        if holiday:
            # Record skipped holiday, move to next week
            sessions.append((current_date, True, holiday.name))
            current_date += timedelta(weeks=1)
            continue

        sessions.append((current_date, False, None))
        sessions_generated += 1
        current_date += timedelta(weeks=1)

    return sessions
```

### 4. Conflict Detection Logic

```python
def check_student_conflicts(
    db: Session,
    student_id: int,
    session_dates: List[date],
    time_slot: str,
    exclude_enrollment_id: Optional[int] = None
) -> List[dict]:
    """Check if student has existing sessions at given dates/times."""
    conflicts = []

    query = db.query(SessionLog).filter(
        SessionLog.student_id == student_id,
        SessionLog.session_date.in_(session_dates),
        SessionLog.time_slot == time_slot,
        # Exclude pending makeup sessions (available for reassignment)
        ~SessionLog.session_status.in_([
            'Rescheduled - Pending Make-up',
            'Sick Leave - Pending Make-up',
            'Weather Cancelled - Pending Make-up'
        ])
    )

    if exclude_enrollment_id:
        query = query.filter(SessionLog.enrollment_id != exclude_enrollment_id)

    for session in query.all():
        conflicts.append({
            'date': session.session_date,
            'time_slot': session.time_slot,
            'existing_tutor': session.tutor.tutor_name,
            'status': session.session_status
        })

    return conflicts
```

---

## Frontend Implementation

### 1. New Page: `/enrollments/new`

**File:** `webapp/frontend/app/enrollments/new/page.tsx`

**Layout:**
```
+------------------------------------------+
| New Enrollment                           |
+------------------------------------------+
| Step 1: Student & Tutor                  |
| [Student Dropdown] [Tutor Dropdown]      |
+------------------------------------------+
| Step 2: Schedule                         |
| [Day] [Time Slot] [Location]             |
+------------------------------------------+
| Step 3: Course Details                   |
| [First Lesson Date] [Lessons Paid]       |
| [Enrollment Type: Regular/Trial/One-Time]|
| [Renewal From: dropdown if applicable]   |
+------------------------------------------+
| [Preview Sessions]                       |
+------------------------------------------+
| Session Preview (read-only)              |
| +--------------------------------------+ |
| | Date       | Time       | Notes     | |
| | 2025-02-03 | 16:45-18:15| -         | |
| | 2025-02-10 | 16:45-18:15| -         | |
| | 2025-02-17 | 16:45-18:15| Holiday!  | |
| | 2025-02-24 | 16:45-18:15| -         | |
| +--------------------------------------+ |
| Effective End Date: 2025-03-31           |
+------------------------------------------+
| Conflicts Found: (if any)                |
| ! Student has session on 2025-02-10      |
|   with Tutor B at same time              |
+------------------------------------------+
| [Create Enrollment]                      |
+------------------------------------------+
```

### 2. Renewal Entry Point

Add "Renew" button to:
- `webapp/frontend/app/enrollments/page.tsx` - Renewal dashboard
- `webapp/frontend/components/EnrollmentDetailPopover.tsx` - Individual enrollment

**Renew Action:**
1. Call `GET /enrollments/{id}/renewal-data`
2. Navigate to `/enrollments/new?renew_from={id}`
3. Form pre-fills with previous enrollment data
4. First lesson date auto-calculated to next valid day after effective_end_date

### 3. API Functions (`webapp/frontend/lib/api.ts`)

```typescript
// Preview enrollment sessions
export async function previewEnrollment(data: EnrollmentCreate): Promise<EnrollmentPreviewResponse>

// Create enrollment with sessions
export async function createEnrollment(data: EnrollmentCreate): Promise<EnrollmentResponse>

// Get renewal pre-fill data
export async function getRenewalData(enrollmentId: number): Promise<EnrollmentCreate>

// Check student conflicts
export async function checkStudentConflicts(studentId: number, dates: string[], timeSlot: string): Promise<Conflict[]>
```

---

## Database Considerations

### Existing Constraints (No Changes Needed)
- `session_log`: Unique on (student_id, tutor_id, session_date, time_slot, location)
- `enrollments`: Unique on (student_id, tutor_id, assigned_day, assigned_time, location, first_lesson_date) excluding cancelled

### Holiday Table Usage
Query existing `holidays` table for session generation:
```sql
SELECT holiday_date, name FROM holidays
WHERE holiday_date BETWEEN ? AND ?
```

---

## Key Business Rules

1. **Enrollment First, Pay Later**: Enrollments created with `payment_status = 'Pending Payment'`
2. **Holiday Handling**: Skip holidays, extend span (same session count over longer period)
3. **Trial/One-Time**: Generate exactly 1 session
4. **Conflicts**: Block if student has existing session at same date + time (any tutor)
5. **Pending Makeups**: Sessions with "Pending Make-up" status don't count as conflicts
6. **Renewal Link**: Set `renewed_from_enrollment_id` to chain enrollments
7. **Session Status**: All generated sessions start as 'Scheduled'

---

## Files to Create/Modify

### Create
- `webapp/frontend/app/enrollments/new/page.tsx` - Enrollment creation form

### Modify
- `webapp/backend/routers/enrollments.py` - Add POST endpoints
- `webapp/backend/schemas.py` - Add new schemas
- `webapp/frontend/lib/api.ts` - Add API functions
- `webapp/frontend/components/EnrollmentDetailPopover.tsx` - Add Renew button

---

## Verification

1. **Create Regular Enrollment**
   - Select student, tutor, schedule
   - Set first lesson date and lessons_paid = 6
   - Preview shows 6 sessions, skipping any holidays
   - Create and verify sessions in DB

2. **Create Trial Enrollment**
   - Set enrollment_type = 'Trial'
   - Preview shows only 1 session
   - Create and verify

3. **Conflict Detection**
   - Create enrollment for student with existing sessions
   - Preview shows conflict warnings
   - Attempting to create shows error

4. **Renewal Flow**
   - From expiring enrollment, click Renew
   - Form pre-fills with previous data
   - First lesson date = next valid day after previous end
   - Create and verify `renewed_from_enrollment_id` set

5. **Holiday Skip**
   - Create enrollment spanning a holiday
   - Verify holiday date skipped, session pushed to next week

---

## Complete Admin Renewal Workflow

> Walk through the entire renewal process from an admin's perspective.

### Step 0: Daily View - What Needs My Attention?

**Admin opens the Renewals Dashboard** (`/enrollments/renewals`)

```
+----------------------------------------------------------+
| Renewals Dashboard                      [This Week ▼]     |
+----------------------------------------------------------+
| URGENT - Past Due (3)                                     |
| +------------------------------------------------------+ |
| | Student      | Tutor   | Schedule        | Days Over | |
| | Wong Ka Yan  | Kenny   | Mon 16:45 MSA   | -3 days   | |
| | Chan Mei Ling| Sarah   | Wed 14:00 MSB   | -1 day    | |
| | Lee Chi Ming | Kenny   | Fri 18:30 MSA   | -1 day    | |
| +------------------------------------------------------+ |
+----------------------------------------------------------+
| DUE THIS WEEK (5)                                         |
| +------------------------------------------------------+ |
| | Student      | Tutor   | Schedule        | Expires   | |
| | Ng Hoi Yan   | Kenny   | Tue 16:45 MSA   | Jan 30    | |
| | ...                                                   | |
| +------------------------------------------------------+ |
+----------------------------------------------------------+
| COMING UP - Next 2 Weeks (12)                             |
| [Collapsed by default - click to expand]                  |
+----------------------------------------------------------+
```

**Key information shown:**
- Student name (clickable → student profile)
- Current tutor
- Current schedule (day, time, location)
- Days until expiry / days overdue
- Pending makeups count (if any)
- Last payment date

**Filter options:**
- By tutor
- By location
- By urgency (overdue / this week / next 2 weeks)

---

### Step 1: Click on a Student to Review

**Admin clicks on "Wong Ka Yan"** → Opens enrollment detail modal

```
+----------------------------------------------------------+
| Wong Ka Yan - Enrollment Details                    [×]   |
+----------------------------------------------------------+
| CURRENT ENROLLMENT                                        |
| Tutor: Kenny Wong                                         |
| Schedule: Monday 16:45 - 18:15 @ MSA                      |
| Started: 2024-11-04 (12 weeks)                            |
| Effective End: 2025-01-27 (3 days overdue)                |
| Payment Status: Paid                                      |
| Sessions: 10/12 attended, 2 pending makeup                |
+----------------------------------------------------------+
| PENDING MAKEUPS (2)                                       |
| • Dec 23 - Rescheduled (Christmas break)                  |
| • Jan 13 - Sick Leave                                     |
| [These will carry over to renewal if not used]            |
+----------------------------------------------------------+
| CONTACT INFO                                              |
| Phone: 9123 4567 (if visible)                             |
| Last Contact: Jan 15 - Fee message sent                   |
+----------------------------------------------------------+
| ACTIONS                                                   |
| [Send Fee Message]  [Create Renewal]  [View History]      |
+----------------------------------------------------------+
```

---

### Step 2: Decide - Contact Parent or Create Renewal?

**Scenario A: Need to contact parent first**
- Click **[Send Fee Message]**
- Opens fee message composer (existing feature?)
- Message sent, admin moves to next student

**Scenario B: Parent already confirmed, ready to renew**
- Click **[Create Renewal]**

---

### Step 3: Create Renewal - Form Pre-filled

**Clicking [Create Renewal] navigates to `/enrollments/new?renew_from=123`**

```
+----------------------------------------------------------+
| New Enrollment                                            |
| Renewing from: Wong Ka Yan - Kenny - Mon 16:45 MSA        |
+----------------------------------------------------------+
| STUDENT                                                   |
| [Wong Ka Yan ▼] ← Pre-filled, can change                  |
|                                                           |
| TUTOR                                                     |
| [Kenny Wong ▼] ← Pre-filled, can change                   |
+----------------------------------------------------------+
| SCHEDULE                                                  |
| Day:      [Monday ▼]     ← Pre-filled                     |
| Time:     [16:45 - 18:15 ▼]  ← Pre-filled                 |
| Location: [MSA ▼]        ← Pre-filled                     |
+----------------------------------------------------------+
| COURSE DETAILS                                            |
| First Lesson:  [2025-02-03] ← Auto-calculated             |
|                (Next Monday after effective_end_date)      |
|                                                           |
| Lessons Paid:  [12 ▼]  (6 / 12 / 24 weeks)                |
| Type:          [Regular ▼]                                |
| Remarks:       [                    ]                     |
+----------------------------------------------------------+
| [Preview Sessions]                                        |
+----------------------------------------------------------+
```

**First Lesson Date Logic:**
1. Get `effective_end_date` of previous enrollment (2025-01-27)
2. Find next occurrence of `assigned_day` (Monday) after that date
3. Result: 2025-02-03

**What if admin wants different start date?**
- Admin can manually change the date picker
- System validates date matches assigned_day (must be a Monday)

---

### Step 4: Preview Sessions

**Admin clicks [Preview Sessions]**

```
+----------------------------------------------------------+
| SESSION PREVIEW                                           |
+----------------------------------------------------------+
| Date        | Time          | Status                      |
+----------------------------------------------------------+
| 2025-02-03  | 16:45-18:15   | ✓ Session 1                 |
| 2025-02-10  | 16:45-18:15   | ✓ Session 2                 |
| 2025-02-17  | 16:45-18:15   | ✓ Session 3                 |
| 2025-02-24  | 16:45-18:15   | ⚠ CONFLICT - has session    |
|             |               |   with Tutor B at same time |
| 2025-03-03  | 16:45-18:15   | ✓ Session 4                 |
| 2025-03-10  | 16:45-18:15   | ✓ Session 5                 |
| 2025-03-17  | 16:45-18:15   | ✓ Session 6                 |
| 2025-03-24  | 16:45-18:15   | ✓ Session 7                 |
| 2025-03-31  | 16:45-18:15   | ✓ Session 8                 |
| 2025-04-07  | 16:45-18:15   | ✓ Session 9                 |
| 2025-04-14  | 16:45-18:15   | ✓ Session 10                |
| 2025-04-21  | 16:45-18:15   | 🎌 HOLIDAY - Easter Monday  |
| 2025-04-28  | 16:45-18:15   | ✓ Session 11                |
| 2025-05-05  | 16:45-18:15   | ✓ Session 12                |
+----------------------------------------------------------+
| Effective End Date: 2025-05-05                            |
| (Note: Easter Monday skipped, extended by 1 week)         |
+----------------------------------------------------------+
| ⚠ 1 CONFLICT FOUND                                        |
| Student has existing session on 2025-02-24 at same time.  |
| [View Conflict Details]                                   |
+----------------------------------------------------------+
| [Back]  [Create Enrollment] ← Disabled if conflicts       |
+----------------------------------------------------------+
```

**Conflict Handling Options:**
1. **Hard block** - Cannot proceed until conflict resolved
2. **Admin resolves conflict** - Goes to reschedule the conflicting session first
3. **Change this enrollment's schedule** - Pick different day/time

---

### Step 5: Handle Conflicts (if any)

**Admin clicks [View Conflict Details]**

```
+----------------------------------------------------------+
| CONFLICT: 2025-02-24 16:45-18:15                         |
+----------------------------------------------------------+
| Existing Session:                                         |
| • Tutor: Sarah Chan                                       |
| • Enrollment: Trial Class (one-time)                      |
| • Status: Scheduled                                       |
+----------------------------------------------------------+
| OPTIONS                                                   |
| 1. Reschedule the trial class                             |
|    [Go to Session] → Opens session detail                 |
|                                                           |
| 2. Change this renewal to different schedule              |
|    [Back to Form] → Change day/time                       |
+----------------------------------------------------------+
```

---

### Step 6: Create Enrollment (No Conflicts)

**Admin clicks [Create Enrollment]**

```
+----------------------------------------------------------+
| ✅ ENROLLMENT CREATED                                      |
+----------------------------------------------------------+
| Wong Ka Yan - Kenny Wong                                  |
| Monday 16:45-18:15 @ MSA                                  |
| 12 sessions generated (2025-02-03 to 2025-05-05)          |
| Payment Status: Pending Payment                           |
+----------------------------------------------------------+
| NEXT STEPS                                                |
| • Send fee reminder when ready                            |
| • Mark as Paid when payment received                      |
+----------------------------------------------------------+
| [View Enrollment]  [Create Another]  [Back to Dashboard]  |
+----------------------------------------------------------+
```

---

### Step 7: Back to Dashboard - Student Removed from Urgent

After creating renewal:
- Wong Ka Yan disappears from "Urgent - Past Due"
- New enrollment shows in "Pending Payment" section (if we add that)
- Admin continues with next student

---

### Edge Cases & Scenarios

#### Scenario: Student Wants Different Schedule

1. Parent says "Can we change to Wednesday 4pm?"
2. Admin changes Day dropdown to "Wednesday"
3. Admin changes Time dropdown to "16:00 - 17:30"
4. System suggests new first_lesson_date (first Wed after previous end)
5. Preview shows new schedule
6. No conflicts? Create enrollment

#### Scenario: Student Wants Different Tutor

1. Parent says "Can we switch to Sarah?"
2. Admin changes Tutor dropdown to "Sarah Chan"
3. Might need to change time slot (Sarah's availability different)
4. System checks Sarah's capacity at selected slot
5. Preview and create

#### Scenario: Pending Makeups Exist

1. Student has 2 pending makeups from previous enrollment
2. When creating renewal, show reminder:
   ```
   ⚠ 2 Pending Makeups from Previous Enrollment
   These sessions are still available for scheduling.
   Consider extending deadline or scheduling makeups first.
   ```
3. Options:
   - Continue with renewal (makeups carry over conceptually)
   - Go back and schedule makeups first
   - Grant deadline extension instead of renewal

#### Scenario: Partial Attendance

1. Student only attended 8/12 sessions
2. Still has 4 sessions remaining
3. Show warning:
   ```
   ⚠ 4 Sessions Remaining
   Student still has unused sessions from current enrollment.
   Are you sure you want to create renewal?
   ```
4. This might indicate:
   - Missed sessions not properly recorded
   - Student wants to pre-pay for continuation
   - Admin made a mistake

---

### Data Flow Summary

```
[Renewals Dashboard]
       ↓ click student
[Enrollment Detail Modal]
       ↓ click Create Renewal
[New Enrollment Form] ← pre-filled from previous
       ↓ click Preview
[Session Preview] ← shows conflicts, holidays
       ↓ click Create (if no conflicts)
[Success] → Enrollment + Sessions created
       ↓
[Back to Dashboard] → Student removed from urgent list
```

---

## Open Questions - All Answered

| Question | Answer |
|----------|--------|
| Student Selection | From renewal or student profile page entry points |
| Tutor Selection | Filter by student's location (home_location) |
| Time Slot Options | Use constants.ts presets + custom time option |
| Location Options | Use student's home_location (MSA/MSB) |
| Lessons Paid | Default 6, allow custom input |
| First Lesson Date | Strict validation - must match assigned_day |
| Payment Status | Manual admin action ("Mark as Paid" button) |
| Conflict Handling | Hard block until resolved |
| Parallel Enrollments | Yes, allowed (Mon+Wed with same tutor) |
| Renewal Notifications | Sidebar badge + notification bell |

---

## Design Decisions (Confirmed)

### Dashboard
- **Dedicated Renewals Dashboard** at `/enrollments/renewals`
- Focused view for pending renewals, separate from main enrollments page

### Time Slots
- Use existing constants from `lib/constants.ts`:
  - **Weekday**: "16:45 - 18:15", "18:25 - 19:55"
  - **Weekend**: "10:00 - 11:30", "11:45 - 13:15", "14:30 - 16:00", "16:15 - 17:45", "18:00 - 19:30"
- Pattern from ScheduleMakeupModal: preset dropdown + "Use custom time" toggle
- Custom time shows two time pickers (start/end) with validation

### Conflict Handling
- **Hard block** - Cannot create enrollment until conflict is resolved
- Admin must go resolve the conflicting session first, then return to create renewal

### Entry Points & Enrollment Types
Three ways to create enrollments:

1. **Renewal Dashboard** → `/enrollments/new?renew_from={id}`
   - Student, tutor, schedule pre-filled from expiring enrollment
   - Type: Regular (default)
   - First lesson date auto-calculated

2. **Student Profile Page** → `/enrollments/new?student_id={id}`
   - Student pre-selected, choose tutor/schedule
   - Type: Regular, Trial, or One-Time
   - For existing students wanting early renewal or extra lessons

3. **New Student Trial** → `/enrollments/new?type=trial`
   - Create new student record first, then trial enrollment
   - Simpler form: just tutor, date, time slot
   - Type: Trial (single session)

### Fee Message
- "Send Fee Message" generates text and copies to clipboard
- Admin manually sends via WhatsApp/preferred channel

**Fee Calculation:**
- Base: $400 per lesson × lessons_paid
- Discount: Applied via discount_id (1 = coupon, 2 = staff referral)
- Student coupons tracked in `student_coupons` table

**Message Format (Chinese):**
```
家長您好，以下是 MathConcept中學教室 常規課程 之【繳費提示訊息】：

學生編號：{school_student_id}
學生姓名：{student_name}
上課時間：逢星期{day_chinese} {time_slot} (90分鐘)
上課日期：
                  {lesson_date_1}
                  {lesson_date_2}
                  ...
                  (共{lessons_paid}堂)

費用： ${total_fee} (已折扣${discount}，原價為${base_fee})

請於第一堂之前繳交學費...
[Bank details based on location]
```

**Day Translation:**
- Mon→一, Tue→二, Wed→三, Thu→四, Fri→五, Sat→六, Sun→日

**Location Translation:**
- MSA → 華士古分校
- MSB → 二龍喉分校

**Bank Accounts (by location):**
- MSA: 185000380468369
- MSB: 185000010473304

**Fee Message Templates (Bilingual - Ready for Implementation):**

**UI: Two buttons - [Copy 中文] [Copy English]**

```typescript
type Language = 'zh' | 'en';

function generateFeeMessage(enrollment: EnrollmentWithDetails, lang: Language): string {
  const dayMapZh: Record<string, string> = {
    'Mon': '一', 'Tue': '二', 'Wed': '三',
    'Thu': '四', 'Fri': '五', 'Sat': '六', 'Sun': '日'
  };

  const dayMapEn: Record<string, string> = {
    'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
    'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday'
  };

  const locationMapZh: Record<string, string> = {
    'MSA': '華士古分校',
    'MSB': '二龍喉分校'
  };

  const locationMapEn: Record<string, string> = {
    'MSA': 'Vasco Branch',
    'MSB': 'Flora Garden Branch'
  };

  const bankMap: Record<string, string> = {
    'MSA': '185000380468369',
    'MSB': '185000010473304'
  };

  const baseFee = 400 * enrollment.lessons_paid;
  const discount = enrollment.discount_value || 0;
  const totalFee = baseFee - discount;

  const lessonDates = enrollment.sessions
    .map(s => s.session_date.replace(/-/g, '/'))
    .join('\n                  ');

  if (lang === 'zh') {
    let discountText = '';
    if (discount > 0) {
      discountText = ` (已折扣$${discount}學費禮劵，原價為$${baseFee})`;
    }
    const closedDays = enrollment.location === 'MSB' ? ' (星期二三公休)' : '';

    return `家長您好，以下是 MathConcept中學教室 常規課程 之【繳費提示訊息】：

學生編號：${enrollment.school_student_id}
學生姓名：${enrollment.student_name}
上課時間：逢星期${dayMapZh[enrollment.assigned_day]} ${enrollment.assigned_time} (90分鐘)
上課日期：
                  ${lessonDates}
                  (共${enrollment.lessons_paid}堂)

費用： $${totalFee.toLocaleString()}${discountText}

請於第一堂之前繳交學費。逾期繳費者，本中心將收取$200手續費，並保留權利拒絕學生上課。
家長可親臨中學教室(${locationMapZh[enrollment.location]})${closedDays} 以現金方式繳交學費，或選擇把學費存入以下戶口：

銀行：中國銀行
名稱：弘教數學教育中心
號碼：${bankMap[enrollment.location]}
請於備註註明學生姓名及其編號，並發收條至中心微信號確認，謝謝

MathConcept 中學教室 (${locationMapZh[enrollment.location]})`;
  }

  // English version
  let discountText = '';
  if (discount > 0) {
    discountText = ` (Discounted $${discount}, original price $${baseFee})`;
  }
  const closedDays = enrollment.location === 'MSB' ? ' (Closed Tue & Wed)' : '';

  return `Dear Parent,

This is a payment reminder for MathConcept Secondary Academy regular course:

Student ID: ${enrollment.school_student_id}
Student Name: ${enrollment.student_name}
Schedule: Every ${dayMapEn[enrollment.assigned_day]} ${enrollment.assigned_time} (90 minutes)
Lesson Dates:
                  ${lessonDates}
                  (${enrollment.lessons_paid} lessons total)

Fee: $${totalFee.toLocaleString()}${discountText}

Please pay before the first lesson. Late payment will incur a $200 administrative fee, and we reserve the right to refuse admission.

Payment options:
1. Cash payment at our center (${locationMapEn[enrollment.location]})${closedDays}
2. Bank transfer:
   Bank: Bank of China
   Account Name: 弘教數學教育中心
   Account Number: ${bankMap[enrollment.location]}
   Please include student name and ID in the transfer remarks, and send the receipt to our WeChat for confirmation.

Thank you!
MathConcept Secondary Academy (${locationMapEn[enrollment.location]})`;
}
```

### Lessons Paid Package
- Default: 6 lessons
- Allow custom input (any positive integer)

### Location Source
- Use student's `home_location` field (actually class location: MSA/MSB)

### Discount Options
Available discounts (from database):
- No Discount
- Student Discount $300 (auto-apply if coupon available)
- Staff Referral Coupon $500 (for staff referrals)
- Student Discount $200
- Trial to Enrollment Discount $150 (when converting trial)

### Coupon System Integration
- Table: `student_coupons` (migration 026)
- Check `available_coupons` when creating enrollment
- Auto-apply "Student Discount $300" if coupon available
- Show coupon status in form: "1 coupon available" or "No coupons"
- Company Excel is source of truth - don't decrement locally

### First Lesson Date Validation
- **Strict validation**: Date must match assigned_day
- If user picks wrong day, show error: "Date must be a {assigned_day}"
- Calendar picker should highlight valid days

### Trial Enrollment Flow
- **For new students only**
- Entry points:
  1. Students page: "New Student + Trial" button
  2. Dedicated /trials page for trial management
- Step 1: Create new student record first
- Step 2: Create trial enrollment (lessons_paid=1, enrollment_type='Trial')
- Single session generated, **fee = $400** (same as regular)
- Simpler form: just tutor, date, time slot

### Session Editing After Generation
- **Tutors**: Use existing reschedule flow (no direct edit)
- **Admins**: Have edit button for individual sessions (existing functionality)
- No special new editing needed - leverage existing tools

### Schedule/Tutor Change on Enrollment (Complex UX)
When admin changes day/time/tutor on an enrollment with existing sessions:

**Show Review Modal:**
```
+----------------------------------------------------------+
| Enrollment Change Impact Review                           |
| Changing: Kenny Mon 16:45 → Sarah Thu 18:25              |
+----------------------------------------------------------+
| CANNOT CHANGE (4 sessions)                                |
| ✓ Mon Jan 6  - Attended (Kenny)                           |
| ✓ Mon Jan 13 - Attended (Kenny)                           |
| ✓ Mon Jan 20 - Attended (Make-up) (Kenny)                 |
| ✓ Mon Jan 27 - No Show (past) (Kenny)                     |
+----------------------------------------------------------+
| WILL BE UPDATED (3 sessions)                              |
| ┌─────────────┬───────────────┬──────────┬────────────┐   |
| │ Current     │ New Date      │ Tutor    │ Adjust     │   |
| ├─────────────┼───────────────┼──────────┼────────────┤   |
| │ Mon Feb 3   │ Thu Feb 6     │ Sarah    │ [📅]       │   |
| │ Mon Feb 10  │ Thu Feb 13    │ Sarah    │ [📅]       │   |
| │ Mon Feb 17  │ Thu Feb 20 ⚠  │ Sarah    │ [📅]       │   |
| │             │ → Thu Feb 27  │          │ Holiday!   │   |
| └─────────────┴───────────────┴──────────┴────────────┘   |
+----------------------------------------------------------+
| OPTIONS                                                   |
| [Keep All Sessions] - Only affects new enrollments        |
| [Apply Changes] - Update 3 sessions as shown              |
| [Cancel]                                                  |
+----------------------------------------------------------+
```

**Logic:**
- **Cannot change**: Attended, Attended (Make-up), No Show, or date < today
- **Cannot change**: Pending makeup statuses (still linked to original)
- **Can update**: Future Scheduled sessions only
- **Updates applied**: Date, time slot, location, AND tutor

**Holiday Handling in Reschedule:**
1. Calculate new date based on new day of week
2. Check if new date is a holiday
3. If holiday, suggest next week's date
4. Show ⚠ warning with holiday name
5. Admin can adjust via calendar picker

**Tutor Change:**
- Future sessions get new tutor_id
- Past sessions keep original tutor (history preserved)

### Renewal Notifications
- **Sidebar badge**: Show count of urgent renewals (overdue + this week) on Renewals menu item
- **Notification bell**: Urgent items appear in notification dropdown
- **Dashboard cards**: Visual count cards for Overdue / This Week / Coming Up

### Trials Page (/trials)
**Kanban-style pipeline view:**

```
+----------------------------------------------------------+
| Trial Pipeline                              [+ New Trial] |
+----------------------------------------------------------+
| SCHEDULED (3)     | ATTENDED (2)    | CONVERTED (5)      |
| ┌──────────────┐  | ┌─────────────┐ | ┌────────────────┐ |
| │ Chan Mei     │  | │ Wong Ka     │ | │ Lee Chi Ming   │ |
| │ Jan 30       │  | │ Jan 28      │ | │ → Regular Enr  │ |
| │ Kenny 16:45  │  | │ Sarah       │ | │ 6 weeks        │ |
| └──────────────┘  | │ Follow up?  │ | └────────────────┘ |
| ┌──────────────┐  | └─────────────┘ | ...                |
| │ Ng Hoi       │  | ...             |                    |
| │ Feb 3        │  |                 | LOST (2)           |
| │ Sarah 18:25  │  |                 | ┌────────────────┐ |
| └──────────────┘  |                 | │ Tam Wing       │ |
|                   |                 | │ No interest    │ |
|                   |                 | └────────────────┘ |
+----------------------------------------------------------+
```

**States:**
- Scheduled: Trial session upcoming
- Attended: Trial completed, awaiting conversion decision
- Converted: Student enrolled in regular course
- Lost: Did not convert (with reason)

**Actions:**
- Drag to change status (or click to open detail modal)
- "Convert to Regular" action → Opens enrollment form with student pre-filled
- "Mark as Lost" → Records reason

> Note: Trials page features can be discussed in more detail separately

### Performance Considerations
- **Scale**: ~50-200 renewals/week (small-medium)
- **Approach**: Simple queries with pagination
- **Session generation**: Bulk insert (single query for all sessions)

### Database View & Data Source

**Base view:** `active_enrollments_needing_renewal` (migration 017)

**View modifications needed:**
- Change date range from `-7 to +15` → **`-30 to +30 days`**
- This shows 1 month overdue to 1 month ahead

**Backend endpoint joins additional data:**
```python
# GET /enrollments/renewals
def get_renewals(location: Optional[str] = None):
    # 1. Query base view (with expanded date range)
    renewals = db.query(ActiveEnrollmentsNeedingRenewal)

    # 2. Join additional fields:
    #    - fee_message_sent from enrollments table
    #    - available_coupons from student_coupons table
    #    - pending_extension_request count from extension_requests table

    # 3. Return enriched data
```

**Fields returned by endpoint:**
- All fields from view (student, tutor, schedule, dates, sessions, extension status)
- `fee_message_sent` (boolean) - from enrollments table
- `available_coupons` (int) - from student_coupons table
- `pending_extension_requests` (int) - count from extension_requests table

**Note:** Phone number NOT needed - fee message is copied to clipboard, not auto-sent

---

## Admin Workflow Efficiency Features

> These features need detailed discussion before implementation

### Status Tracking (Uses existing fee_message_sent field)
States based on enrollment data:
- **Not Yet Renewed** - Enrollment expiring, no new enrollment created
- **Renewed, Message Pending** - New enrollment exists, fee_message_sent=false
- **Message Sent** - fee_message_sent=true, awaiting payment
- **Paid** - payment_status='Paid'

### Enrollment Detail View (Comprehensive Info)
When admin clicks on a renewal item, show all decision-relevant info:

```
+----------------------------------------------------------+
| Wong Ka Yan - Kenny Wong                                  |
| Mon 16:45-18:15 @ MSA                                     |
+----------------------------------------------------------+
| SESSIONS                                                  |
| ✓ Attended: 10/12                                         |
| ⏳ Pending Makeups: 2                                      |
|   • Dec 23 - Rescheduled (Christmas break)                |
|   • Jan 13 - Sick Leave                                   |
+----------------------------------------------------------+
| DEADLINE                                                  |
| Effective End: Jan 27 (3 days overdue)                    |
| Extension Status: None granted                            |
| Extension Request: ⚠️ 1 pending (from Jan 20)              |
+----------------------------------------------------------+
| CONTACT HISTORY                                           |
| Fee Message: Sent Jan 15                                  |
| Notes: "Parent said will pay next week"                   |
+----------------------------------------------------------+
| DISCOUNT                                                  |
| Coupons Available: 1 ($300)                               |
| Auto-apply: Student Discount $300                         |
+----------------------------------------------------------+
| ACTIONS                                                   |
| [Send Fee Message]  [Create Renewal]  [Grant Extension]   |
+----------------------------------------------------------+
```

### Batch Renewal (Option B: Check on Selection)
1. Admin selects multiple renewals from list
2. Click "Batch Renew (X selected)"
3. System checks eligibility:
   - No pending makeups
   - No conflicts on generated dates
   - No pending extension requests
4. Shows results:
   - "3 eligible for quick renewal"
   - "2 need attention:" with reasons
5. Admin proceeds with eligible ones

### Quick Actions
1. **Inline renew button** - Renew directly from list without opening detail
2. **Status badges** - Visual indicator of current status (color-coded)

### Keyboard Navigation
1. **Arrow keys** - Navigate through renewal list
2. **R key** - Open renewal form for selected student
3. **M key** - Copy fee message for selected student

### Batch Operations
1. **Batch renewal** - Create multiple enrollments with same settings
2. **Batch mark paid** - When payment received for multiple students

### Follow-up System (Deferred)
- Notes and reminders will be added in a later phase
- Currently `remark` field used for system info (renewal links)

---

---

## UI Integration Points

### Sidebar Navigation
- **Add "Renewals" to Admin section** (alongside Extensions)
- Show badge count for urgent renewals (overdue + this week)
- File: `webapp/frontend/components/layout/Sidebar.tsx`

```typescript
// In adminNavigation array:
const adminNavigation = [
  { name: "Renewals", href: "/admin/renewals", icon: RefreshCw },  // Add this
  { name: "Extensions", href: "/admin/extensions", icon: Clock },
];
```

### Student Profile Page
- Add "Add Enrollment" button in enrollments section
- Links to `/enrollments/new?student_id={id}`
- File: `webapp/frontend/app/students/[id]/page.tsx`

### Enrollment Detail Popover
- Add "Renew" button for expiring enrollments
- Links to `/enrollments/new?renew_from={id}`
- File: `webapp/frontend/components/EnrollmentDetailPopover.tsx`

### Notification Bell
- Use existing `NotificationBell` component
- **Admins only** - only Admin/Super Admin see renewal notifications
- File: `webapp/frontend/components/dashboard/NotificationBell.tsx`

**Two notification items (split by urgency):**

1. **Overdue Renewals** (danger severity - red)
   - Shows count of enrollments past effective_end_date without renewal
   - Links to `/admin/renewals?filter=overdue`

2. **Renewals Due Soon** (warning severity - orange)
   - Shows count due this week
   - Links to `/admin/renewals?filter=this-week`

**Implementation:**
```typescript
// Add to NotificationBell.tsx
// New hook: useRenewalCounts(location)
const { data: renewalCounts } = useRenewalCounts(location);

// In notifications array (admin only):
if (isAdmin && renewalCounts?.overdue > 0) {
  items.push({
    id: "renewals-overdue",
    icon: <RefreshCw className="h-4 w-4" />,
    label: "Overdue Renewals",
    count: renewalCounts.overdue,
    severity: "danger",
    href: "/admin/renewals?filter=overdue",
  });
}

if (isAdmin && renewalCounts?.dueThisWeek > 0) {
  items.push({
    id: "renewals-due",
    icon: <RefreshCw className="h-4 w-4" />,
    label: "Renewals Due Soon",
    count: renewalCounts.dueThisWeek,
    severity: "warning",
    href: "/admin/renewals?filter=this-week",
  });
}
```

**Backend endpoint needed:**
```
GET /enrollments/renewal-counts?location={location}
Returns: { overdue: 3, due_this_week: 5, due_next_two_weeks: 12 }
```

### New Pages to Create
1. `/admin/renewals/page.tsx` - Renewals dashboard
2. `/enrollments/new/page.tsx` - Enrollment creation form

---

## Recommended Implementation Phases

**Phase 1: Core MVP**
- Renewals dashboard with list view
- Create renewal form with session preview
- Fee message copy to clipboard
- Student profile enrollment button
- Sidebar menu item with badge

**Phase 2: Efficiency Features**
- Inline quick actions
- Status tracking
- Keyboard shortcuts
- Batch operations

**Phase 3: Trials System**
- Trials page with Kanban view
- New student + trial flow
- Convert to regular action

**Phase 4: Polish & Advanced**
- Schedule change review modal
- Notes/reminders system (if needed)
- Refined UX based on feedback
