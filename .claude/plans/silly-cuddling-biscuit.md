# Summer Course Arrangement Redesign — Session-Based Scheduling

## Context

The current arrangement page uses a **weekly template grid** where each slot represents a recurring weekly session. This works for regular students (1x/week, same slot for all 8 weeks) but fails for:

- **Twice-a-week students**: They only occupy each slot for 4 weeks, so the template grid overstates capacity
- **Flexible students**: Different days each week — the template grid can't represent this at all
- **Late starters**: Joining mid-July means existing slots are mid-curriculum, causing scrambled lesson order (e.g., 3,7,4,8,5,1,6,2)
- **Admin pain**: Last year these were handled entirely by hand

**Core insight**: The template grid defines *what's available*. But placement decisions need to happen at the *per-date* level, with visibility into each student's *lesson progression*.

## Key Domain Constraint: Lesson Alignment

**All students in a session should be on the same lesson.** When finding a slot for a flexible student who needs Lesson 4, the admin is looking for a session where the class IS doing Lesson 4 — so the student joins a class where everyone is studying the same content. This is the primary optimization challenge.

### Lesson number is mutable, not derived

The slot's `course_type` (A/B) determines the **initial** lesson progression:
- **Type A**: Week 1→L1, Week 2→L2, ..., Week 8→L8
- **Type B**: Week 1→L5, Week 2→L6, ..., Week 4→L8, Week 5→L1, ..., Week 8→L4

But the actual lesson number **drifts** during the course:
- **Tutor slows pace**: Week 4's Type A class might still be on L3 because students need more time
- **Student mix changes**: Original students leave, make-up students on L7 become the majority — class effectively becomes L7
- **Rescheduling**: Holidays, tutor absence, etc. shift the progression

**Therefore**: Each session instance must be a **materialized database record** with an editable `lesson_number`. The course_type formula seeds the initial values, but admin/tutor can update them as reality changes. Find Slot queries the actual stored lesson_number, not a derived one.

## Architecture: Three-View Arrangement Page

| Tab | Purpose | When |
|-----|---------|------|
| **Slot Setup** | Define weekly slot templates (capacity, grade, tutor, course_type) | Admin sets up scheduling skeleton at start of summer |
| **Session Calendar** | Week-by-week dated view, per-date capacity and placement | Admin places flexible/twice-a-week students into specific dates |
| **Student Lessons** | Per-student 8-lesson progress, find-slot search | Admin tracks completion, finds optimal lesson-aligned placements |

The **unassigned panel** becomes smarter — shows students who need more placements (not just those with zero).

---

## Phase 1: Data Model + Form Changes

### 1a. Add `sessions_per_week` to SummerApplication

**Migration**: `077_add_sessions_per_week.sql`
```sql
ALTER TABLE summer_applications ADD COLUMN sessions_per_week INT NOT NULL DEFAULT 1;
```

**Files**:
- `webapp/backend/models.py` — add column to SummerApplication
- `webapp/backend/schemas.py` — add to SummerApplicationCreate, SummerApplicationResponse
- `webapp/frontend/types/index.ts` — add to SummerApplication type
- `webapp/frontend/components/summer/steps/ClassPreferencesStep.tsx` — add frequency selector (1x/week or 2x/week radio)
- `webapp/frontend/app/summer/apply/page.tsx` — wire up sessions_per_week in form state + submission

Start with just the frequency field. Admin handles 2nd slot placement manually for now.

### 1b. New table: `SummerSession` (materialized session instances)

**Migration**: `077_summer_sessions.sql` (combined with sessions_per_week)

```sql
CREATE TABLE summer_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    slot_id INT NOT NULL REFERENCES summer_course_slots(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    lesson_number INT NOT NULL,  -- starts from course_type formula, editable by admin/tutor
    session_status VARCHAR(20) NOT NULL DEFAULT 'Scheduled',  -- Scheduled, Completed, Cancelled
    notes TEXT NULL,  -- tutor can add notes about pace changes etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_slot_date (slot_id, session_date),
    INDEX idx_session_lookup (slot_id, session_date, lesson_number)
);

ALTER TABLE summer_applications ADD COLUMN sessions_per_week INT NOT NULL DEFAULT 1;
```

**Model** (`webapp/backend/models.py`):
```python
class SummerSession(Base):
    __tablename__ = "summer_sessions"
    id = Column(Integer, primary_key=True)
    slot_id = Column(Integer, ForeignKey("summer_course_slots.id", ondelete="CASCADE"))
    session_date = Column(Date, nullable=False)
    lesson_number = Column(Integer, nullable=False)  # editable!
    session_status = Column(String(20), default="Scheduled")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    slot = relationship("SummerCourseSlot")
    placements = relationship("SummerPlacement", back_populates="session")
```

**Session generation**: When admin clicks "Generate Sessions" (or auto-triggered when slots are finalized), the system creates 8 `SummerSession` rows per slot using the course_type formula. These can then be individually edited.

```python
def generate_sessions(slot, config):
    dates = get_slot_dates(slot.slot_day, config.course_start_date, config.course_end_date)
    for d in dates:
        week = (d - config.course_start_date).days // 7 + 1
        lesson = ((week - 1 + 4) % 8) + 1 if slot.course_type == "B" else week
        SummerSession(slot_id=slot.id, session_date=d, lesson_number=lesson)
```

### 1c. Update SummerPlacement to reference SummerSession

**Change**: Placement now references `session_id` instead of `slot_id` + `specific_date` + `lesson_number`.

```python
class SummerPlacement(Base):
    id = Column(Integer, primary_key=True)
    application_id = Column(Integer, ForeignKey("summer_applications.id"))
    session_id = Column(Integer, ForeignKey("summer_sessions.id"))  # NEW — replaces slot_id
    placement_status = Column(String(20), default="Tentative")
    placed_at = Column(DateTime, server_default=func.now())
    placed_by = Column(String(100))

    session = relationship("SummerSession", back_populates="placements")
    application = relationship("SummerApplication")
```

**Migration**: Add `session_id` column, migrate existing placements (match by slot_id + specific_date if populated), then drop `slot_id`, `lesson_number`, `specific_date` from placements.

**A placement now means**: "Student X attends Session Y" — where Session Y has a specific slot, date, and (editable) lesson number.

### 1d. Placement creation flow

**From template grid** (drag student to slot):
```python
# 1. Find all sessions for this slot
sessions = query(SummerSession).filter(slot_id=slot.id).order_by(session_date)
# 2. For sessions_per_week=1: create placement for all 8 sessions
# 3. For sessions_per_week=2: create placement for first 4 sessions (admin places 2nd slot separately)
# 4. Check per-session capacity before creating
```

**From calendar view** (drag student to specific session):
```python
# Create single placement for that session
# Validate: capacity not exceeded, student doesn't already have a placement on this date
```

**For twice-a-week students**: When admin places in 2nd slot, system detects existing placements and only generates for sessions that don't conflict with already-placed dates. The student ends up with 4 sessions from each slot = 8 total.

### 1e. Helper: compute slot dates

```python
def get_slot_dates(slot_day: str, start: date, end: date) -> list[date]:
    """Return all occurrences of slot_day (e.g., 'Tuesday') within [start, end]."""
```

### 1f. Lesson number editing

**Endpoint**: `PATCH /summer/sessions/{id}` — update `lesson_number`, `session_status`, `notes`

This is how admin records drift:
- Tutor reports class stayed on L3 → admin updates session's lesson_number from 4 to 3
- Holiday cancellation → admin sets session_status to "Cancelled"

The Find Slot feature queries the ACTUAL stored `lesson_number`, so drift is automatically accounted for.

### 1e. Update unassigned logic

**File**: `webapp/backend/routers/summer_course.py` — `list_unassigned()`

**Current**: Unassigned = 0 active placements.

**New**: Include students with fewer placements than needed. Return `placed_count` with each application so the panel can show "3/8".

```python
# A student needs: sessions_per_week * total_weeks_attending (usually 8)
# But simpler: total_lessons from config (always 8)
# Show anyone with active_placements < config.total_lessons
```

### 1f. Schema/type updates

**Backend schemas** (`webapp/backend/schemas.py`):
- `SummerApplicationCreate`: add `sessions_per_week: int = 1`
- `SummerApplicationResponse`: add `sessions_per_week: int`, `placed_count: int`
- `SummerPlacementCreate`: add optional `specific_date`, `lesson_number`
- New schema: `SummerSessionPlacementCreate` for per-date placement from calendar

**Frontend types** (`webapp/frontend/types/index.ts`):
- `SummerApplication`: add `sessions_per_week: number`, `placed_count: number`
- `SummerPlacement`: update to include `specific_date`, `lesson_number`

**Frontend API** (`webapp/frontend/lib/api.ts`):
- Add `createSessionPlacement()` for per-date placement
- Add `getSessionCalendar(configId, location, weekStart)` for calendar view
- Add `getStudentLessons(configId, location)` for student progress

---

## Phase 2: Session Calendar View

### 2a. Backend endpoint

```
GET /summer/sessions/calendar?config_id=1&location=X&week_start=2025-07-07
```

Returns materialized session data for one week:
```json
[{
  "session_id": 15,
  "slot_id": 1,
  "slot_day": "Tuesday",
  "time_slot": "10:00 - 11:30",
  "grade": "F1",
  "course_type": "A",
  "lesson_number": 2,
  "session_status": "Scheduled",
  "tutor_name": "Alice",
  "max_students": 6,
  "date": "2025-07-15",
  "notes": null,
  "placements": [
    { "id": 1, "student_name": "John", "grade": "F1", "placement_status": "Confirmed" },
    { "id": 2, "student_name": "Mary", "grade": "F1", "placement_status": "Tentative" }
  ]
}]
```

Key: `lesson_number` is the **actual stored value** (may differ from course_type formula if tutor adjusted pace). Admin can click to edit it directly in the calendar view.

Implementation: query `SummerSession` joined with slot and placements, filtered by `session_date` within the requested week and slot's config_id + location.

### 2b. Frontend: SummerSessionCalendar component

**Layout**: Same CSS grid pattern as `SummerArrangementGrid.tsx` but with actual dates as columns:

```
             Mon Jul 7    Tue Jul 8    Wed Jul 9    Thu Jul 10   ...
10:00-11:30  ┌──────────┐ ┌──────────┐              ┌──────────┐
             │ F1 L1 2/6│ │ F2 L1 4/6│              │ F1 L5 3/6│
             │ Alice    │ │ Bob      │              │ Carol    │
             └──────────┘ └──────────┘              └──────────┘
11:45-13:15              ┌──────────┐
                         │ F3 L1 1/6│
                         │ Alice    │
                         └──────────┘
```

Each card shows: **Grade + Lesson Number + Fill/Capacity + Tutor**

**Week navigation**: `[← Prev]  Week 1: Jul 7 - 13  [Next →]`
- Constrained to summer range (Jul 5 - Aug 29 = 8 weeks)
- Show week number (1-8) prominently

**Reusable**:
- `calendar-utils.ts` — `getWeekDates()`, `toDateString()`, `getDayName()`
- Grid CSS layout from `SummerArrangementGrid.tsx`
- Slot card pattern from `SummerSlotCard.tsx`
- Drag-drop from unassigned panel

**New**:
- Lesson number badge on each card (e.g., "L2" in a pill) — **clickable to edit** (admin adjusts when class pace drifts)
- Session status indicator (Scheduled/Completed/Cancelled)
- Per-date fill count
- Drop action creates placement via `POST /summer/placements` with `session_id`

### 2c. SummerSlotCard adaptations for calendar mode

The slot card already shows grade, tutor, capacity, student list. For the calendar view, add:
- Lesson number badge (e.g., "L3") — editable inline (click → number input → save via `PATCH /summer/sessions/{id}`)
- Session status badge (Cancelled sessions shown greyed out)
- Per-date student count (instead of template-level count)

Could use a prop like `mode: "template" | "calendar"` or create a lightweight `SummerSessionCard` wrapper.

### 2d. Tab integration

**File**: `webapp/frontend/app/admin/summer/arrangement/page.tsx`

Add tabs: `Slot Setup | Calendar | Students`

Shared state across tabs: `configId`, `location`, modals, unassigned panel.

Each tab has its own SWR data and independent rendering.

---

## Phase 3: Student Lessons View

### 3a. Backend endpoint

```
GET /summer/students/lessons?config_id=1&location=X
```

Returns per-student lesson progress:
```json
[{
  "application_id": 42,
  "student_name": "John",
  "grade": "F1",
  "sessions_per_week": 1,
  "total_lessons": 8,
  "placed_count": 5,
  "lessons": [
    { "lesson_number": 1, "date": "2025-07-08", "time_slot": "10:00-11:30", "slot_id": 1, "placement_id": 10, "status": "Confirmed" },
    { "lesson_number": 2, "date": "2025-07-15", "time_slot": "10:00-11:30", "slot_id": 1, "placement_id": 11, "status": "Confirmed" },
    { "lesson_number": 3, "date": null, "time_slot": null, "slot_id": null, "placement_id": null, "status": null },
    ...
  ]
}]
```

Lessons array always has 8 entries (L1-L8). Unplaced lessons have null fields.

### 3b. Frontend: SummerStudentLessons component

**Layout**: Table with 8 lesson columns

```
Student      Grade  Freq   Progress  L1         L2         L3         L4  ...  L8
─────────────────────────────────────────────────────────────────────────────────
John Chen    F1     1x     5/8 ██▓░  Jul 8 ✓   Jul 15 ✓   Jul 22 ✓   ?   ...  ?
Mary Wong    F2     2x     8/8 ████  Jul 8 ✓   Jul 10 ✓   Jul 15 ✓   ...
Bob Liu      F1     flex   3/8 █░░░  Jul 10 ✓   ?          Jul 22 ✓   ?   ...
```

- Progress bar per student (placed / 8)
- Placed lesson cells: show date, colored by status (green=confirmed, yellow=tentative)
- Empty lesson cells: "?" button → opens **Find Slot** dialog
- Sort by: completion %, grade, name
- Filter: incomplete only, by grade

### 3c. Find Slot dialog

When admin clicks an empty lesson cell (e.g., L4 for Bob):

**Constraints computed automatically**:
- Grade: F1 (from student)
- Lesson needed: 4
- Date range: after L3 date (Jul 22) and before L5 date (if set), within summer range

**Backend query**: `GET /summer/sessions/find-slot?config_id=1&location=X&grade=F1&lesson_number=4&after_date=2025-07-22&before_date=2025-08-29`

Queries the **actual stored** `lesson_number` on `SummerSession` rows — automatically accounts for pace drift, tutor adjustments, and class composition changes.

Returns candidate sessions:
```json
[{
  "session_id": 28,
  "slot_id": 3,
  "date": "2025-07-24",
  "time_slot": "10:00-11:30",
  "tutor_name": "Alice",
  "current_count": 3,
  "max_students": 6,
  "lesson_number": 4,
  "lesson_match": true
},
{
  "session_id": 35,
  "slot_id": 5,
  "date": "2025-07-28",
  "time_slot": "10:00-11:30",
  "tutor_name": "Carol",
  "current_count": 2,
  "max_students": 6,
  "lesson_number": 5,
  "lesson_match": false
}]
```

**Display** (sorted: matches first, then by date):
```
✓ Thu Jul 24, 10:00-11:30, Alice — 3/6, class on L4
✓ Sat Jul 26, 14:30-16:00, Bob — 4/6, class on L4
⚠ Mon Jul 28, 10:00-11:30, Carol — 2/6, class on L5 (mismatch)
```

Because lesson numbers are stored and editable, if a tutor changed a session's lesson from L5 to L4 (due to pace change), Find Slot will correctly surface it as a match — no formula drift issues.

Admin clicks one → placement created.

---

## Phase 4: Enhanced Auto-Suggest

### 4a. Regular student placement (1x/week)

Current algorithm with one change: auto-generate 8 dated placements with lesson numbers instead of 1 recurring placement.

### 4b. Twice-a-week student placement

For `sessions_per_week=2`, find the best pair of slots:
1. Find all grade-matching slots with capacity
2. For each pair (Slot A, Slot B), compute the lesson sequence:
   - Interleave dates in chronological order
   - Assign lesson numbers 1-8 sequentially
3. Score each pair by: lesson alignment (do the slot's lessons match the assigned numbers?) + capacity + preference match
4. Propose the top pair

The ideal pair: one Type A slot + one Type B slot where the interleaved dates produce perfect lesson alignment.

### 4c. Lesson alignment scoring

```python
def lesson_alignment_score(placements: list[dict]) -> float:
    """Score 0-1 for how well placement lesson_numbers match the slot's expected lessons.
    1.0 = every placement's lesson matches the slot's lesson for that date.
    Lower = more mismatches (student is out of sync with class).
    """
    matches = sum(1 for p in placements if p["assigned_lesson"] == p["slot_lesson_on_date"])
    return matches / len(placements)
```

---

## Phase 5: Publish to Main Session System

### The Bridge

Summer arrangement is a **planning phase**. Tutors manage sessions in the **main sessions page** using SessionLog. The bridge converts summer placements into real SessionLog records.

**Flow**: `SummerApplication → Student → Enrollment (type="Summer") → SessionLog`

### 5a. Prerequisite: Student linking

Before publishing, each application must be linked to a Student record via `existing_student_id`:
- **Existing students**: Admin searches and links in the detail modal (already works)
- **New students**: Admin clicks "Create Student" → modal pre-filled from application data (name, phone, grade, school) → creates Student record → auto-links

Add a "Create & Link" quick action in `SummerApplicationDetailModal.tsx` that:
1. Pre-fills `StudentCreate` form from application data
2. Creates the student
3. Sets `existing_student_id` on the application
4. Returns to the application detail

### 5b. Publish action

**Endpoint**: `POST /summer/publish`
```json
{
  "config_id": 1,
  "application_ids": [42, 43, 44]  // or omit for "publish all confirmed"
}
```

**Validation before publish**:
- Application must have `existing_student_id` set (linked to a Student)
- Application must have confirmed placements
- Application status must be appropriate (Paid or Placement Confirmed, depending on workflow)

**What publish creates**:
1. **Enrollment** per student:
   - `enrollment_type`: "Summer"
   - `student_id`: from `existing_student_id`
   - `tutor_id`: from the primary slot's tutor (or null if varies)
   - `lessons_paid`: config.total_lessons (8)
   - `first_lesson_date`: earliest placement date
   - `location`: from slot
   - `assigned_day`, `assigned_time`: from primary slot (informational)

2. **SessionLog** per placement:
   - `enrollment_id`: from created enrollment
   - `student_id`: from student
   - `tutor_id`: from the session's slot's tutor
   - `session_date`: from SummerSession.session_date
   - `time_slot`: from slot.time_slot
   - `location`: from slot.location
   - `session_status`: "Scheduled"

3. **Link back**: Store `enrollment_id` on SummerApplication (or a mapping table) so changes can be synced.

### 5c. Publish timing

**Initial implementation**: Explicit admin action (button in arrangement page).

**Future**: Auto-publish when application status reaches "Paid" — aligns with the payment-triggers-enrollment pattern used in regular courses.

### 5d. Transition period handling

During early July when regular and summer sessions coexist:
- Tutors see both on the sessions page (filter by date range already works)
- Summer sessions distinguishable by `enrollment_type="Summer"`
- Could add a filter chip on sessions page: "Regular | Summer | All"
- No conflict checking needed between regular and summer since they're for different students

### 5e. Post-publish sync

If arrangement changes after publish (admin moves a student to a different session):
- The system should update the corresponding SessionLog record
- Or: mark published sessions as "locked" and require admin to manage changes in the sessions page directly

Start simple: publish is a one-time action. If arrangement changes are needed after publish, admin manages in the sessions page. Sync can be added later if needed.

---

## Files to Create/Modify

### New files
- `database/migrations/077_summer_sessions.sql` (SummerSession table + sessions_per_week column)
- `webapp/frontend/components/admin/SummerSessionCalendar.tsx`
- `webapp/frontend/components/admin/SummerStudentLessons.tsx`
- `webapp/frontend/components/admin/SummerFindSlotDialog.tsx`

### Modified files
- `webapp/backend/models.py` — add SummerSession model, add sessions_per_week to SummerApplication, update SummerPlacement FK
- `webapp/backend/schemas.py` — update schemas, add new response types
- `webapp/backend/routers/summer_course.py` — new endpoints (calendar, find-slot, student-lessons, session CRUD, generate-sessions), update placement logic, update unassigned, add helpers
- `webapp/frontend/types/index.ts` — update types
- `webapp/frontend/lib/api.ts` — add new API functions
- `webapp/frontend/app/admin/summer/arrangement/page.tsx` — add tabs, integrate new views
- `webapp/frontend/components/summer/steps/ClassPreferencesStep.tsx` — add frequency selector
- `webapp/frontend/app/summer/apply/page.tsx` — wire sessions_per_week
- `webapp/frontend/components/admin/SummerSlotCard.tsx` — add lesson number badge, calendar mode
- `webapp/frontend/components/admin/SummerUnassignedPanel.tsx` — show progress (3/8)
- `webapp/frontend/components/admin/SummerAutoSuggestModal.tsx` — handle multi-session suggestions

### Reusable (import as-is)
- `webapp/frontend/lib/calendar-utils.ts` — date navigation, time parsing, week computation
- Grid CSS layout pattern from `SummerArrangementGrid.tsx`
- Drag-drop pattern from `SummerSlotCell.tsx`

---

## Implementation Order

1. **Phase 1** (foundation) — model changes, form update, placement logic, helpers
2. **Phase 2** (calendar) — session calendar view with per-date + lesson visibility
3. **Phase 3** (students) — lesson progress tracking + find-slot search
4. **Phase 4** (suggest) — enhanced auto-suggest for multi-session students
5. **Phase 5** (publish) — bridge to main session system (Enrollment + SessionLog)

Each phase is independently useful. Phase 1 unblocks the rest. Phase 2 is the highest-impact UI change. Phase 3 is the admin's daily tool. Phase 4 is optimization. Phase 5 connects summer arrangement to the tutor-facing workflow.

## Verification

- **Phase 1**: Generate sessions for a slot → verify 8 SummerSession rows with correct initial lesson numbers from course_type formula. Place a student via template grid → verify 8 placements created referencing session_ids. Check unassigned panel shows partial progress. Test form with sessions_per_week=2.
- **Phase 2**: Navigate session calendar week-by-week → verify each cell shows the stored lesson number (not derived). Edit a session's lesson_number → verify it persists and differs from formula. Drag student to session → verify placement created. Cancel a session → verify it shows greyed out.
- **Phase 3**: View student lessons table → verify 8-column display. Click empty lesson → find-slot queries stored lesson_numbers and returns matches. Verify a session whose lesson was manually changed from L5 to L4 appears as a match for students needing L4.
- **Phase 4**: Run auto-suggest with 1x and 2x students → verify 2x students get paired slots with good lesson alignment.
- **Phase 5**: Link an application to a student → publish → verify Enrollment (type="Summer") and 8 SessionLog records created. Check tutors see summer sessions on the sessions page. Verify unlinked applications are rejected with clear error. During transition period, verify regular and summer sessions coexist without conflict.
