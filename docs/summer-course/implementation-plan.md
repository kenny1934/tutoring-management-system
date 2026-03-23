# Summer Course Feature — Implementation Plan

## Context

The tutoring center runs an annual 8-session summer course for F1–F3 students (Macau). Currently managed via Google Forms/Sheets — form collects preferred class times, admin manually arranges 150+ students into time slots, then confirms via WeChat. This feature brings the workflow into CSM.

**Timeline**: Public form live by mid-April 2026. Timetable arrangement tools by late April.

### Key Decisions (from discussion)
- **No Fixed/Flexible distinction** on form — keep 2 ranked preferences (1st/2nd choice day+time) to mentally commit parents to regular attendance
- **Buddy = group discount** only (3+ friends = cheaper rate), not placement preference. Support both buddy code AND entering friends' names
- **10 statuses** confirmed — Waitlisted/Withdrawn/Rejected are side exits from main flow
- **Grade = "entering grade"** (2026年9月份的就讀年級 / Grade in September 2026)
- **WeChat ID** required field (primary communication channel in Macau)
- **Bilingual** form with Chinese/English toggle
- **Branch-first flow**: pick location → see that location's available days/times
- **Locations configurable** in summer course config (not hardcoded)
- **Fee**: $3200/8 lessons ($400/lesson). Early bird before deadline: $3000 individual, $2700 group of 3+

### Form Fields (matching old Google Form + improvements)
1. Language selector (中文 / English)
2. Student English name (required)
3. School (required)
4. Grade in September 2026: Form 1/2/3 (required)
5. Language stream: CMI / EMI (admin can override later via `LangStream_Overrides` equivalent)
6. Are you a MathConcept student? (MathConcept Education / MathConcept Secondary Academy / None)
7. If yes: which center(s) (checkboxes, conditional)
8. Branch selection (with address, open days, images)
9. 1st preference: day + time slot (radio each, filtered by branch's open days)
10. 2nd preference: day + time slot (radio each, filtered by branch's open days)
11. Unavailability dates (free text, optional)
12. WeChat ID (required)
13. Contact phone (required)
14. Buddy group: "Have a buddy code?" OR "Enter friends' names" OR skip
15. Confirmation checkbox (this is preference collection, not guaranteed schedule)

**Note on grades**: Form collects student's actual grade. During arrangement (Phase 3), admin assigns a "class grade" which may differ (e.g., F2 student in F1 class for review). The class grade determines which slot/tutor/lesson content applies.

---

## Step 0: Setup

1. **Create worktree**: `git worktree add ../tutoring-summer-course feature/summer-course` — work in a separate directory so main app keeps running undisturbed
2. **Copy this plan** to `docs/summer-course/implementation-plan.md` (tracked in git)
3. **Add to `.gitignore`**: `docs/summer-course/*.xlsx` and `docs/summer-course/*.gs` (Sheet + Apps Script contain private student data)

---

## Step 1: Database Migration

**Create `database/migrations/073_summer_course_tables.sql`**

### `summer_course_configs`

```sql
CREATE TABLE IF NOT EXISTS summer_course_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year INT NOT NULL,
    title VARCHAR(500) NOT NULL COMMENT 'Bilingual display title',
    description TEXT COMMENT 'Bilingual description shown on form',
    application_open_date DATETIME NOT NULL,
    application_close_date DATETIME NOT NULL,
    course_start_date DATE NOT NULL,
    course_end_date DATE NOT NULL,
    total_lessons INT NOT NULL DEFAULT 8,
    -- Pricing (JSON for full flexibility)
    pricing_config JSON NOT NULL COMMENT 'See example below',
    -- Config (JSON for flexibility)
    locations JSON NOT NULL DEFAULT ('[]'),
    available_grades JSON NOT NULL DEFAULT ('[]'),
    time_slots JSON NOT NULL DEFAULT ('[]'),
    existing_student_options JSON DEFAULT ('[]'),
    center_options JSON DEFAULT ('[]'),
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_summer_year (year),
    INDEX idx_summer_active (is_active)
);
```

**pricing_config example:**
```json
{
  "base_fee": 3200,
  "registration_fee": 100,
  "discounts": [
    {"code": "EB", "name_zh": "早鳥優惠", "name_en": "Early Bird", "amount": 200,
     "conditions": {"before_date": "2026-06-15"}},
    {"code": "EB3P", "name_zh": "早鳥三人同行", "name_en": "Early Bird Group of 3", "amount": 500,
     "conditions": {"before_date": "2026-06-15", "min_group_size": 3}},
    {"code": "3P", "name_zh": "三人同行", "name_en": "Group of 3", "amount": 300,
     "conditions": {"min_group_size": 3}}
  ]
}
```

**locations JSON example:**
```json
[{"name":"華士古分校","name_en":"Jardim de Vasco Center","address":"澳門若翰亞美打街10號東輝閣地下B座","address_en":"Rua de João de Almeida No 10","open_days":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]}]
```

### `summer_buddy_groups`

```sql
CREATE TABLE IF NOT EXISTS summer_buddy_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    buddy_code VARCHAR(20) NOT NULL COMMENT 'Shareable code like BG-7X3K',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (config_id) REFERENCES summer_course_configs(id) ON DELETE CASCADE,
    UNIQUE KEY uq_buddy_code (buddy_code),
    INDEX idx_buddy_config (config_id)
);
```

### `summer_applications`

```sql
CREATE TABLE IF NOT EXISTS summer_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    reference_code VARCHAR(20) NOT NULL COMMENT 'SC2026-00042',
    -- Student info
    student_name VARCHAR(255) NOT NULL,
    school VARCHAR(255),
    grade VARCHAR(50) NOT NULL COMMENT 'F1/F2/F3 — grade entering in September',
    lang_stream VARCHAR(10) COMMENT 'CMI or EMI',
    is_existing_student VARCHAR(100) COMMENT 'MathConcept Education / Secondary Academy / None',
    current_centers JSON DEFAULT NULL COMMENT 'Selected center names if existing student',
    -- Contact
    wechat_id VARCHAR(100),
    contact_phone VARCHAR(50),
    -- Location & preferences
    preferred_location VARCHAR(255) COMMENT 'Selected branch name',
    preference_1_day VARCHAR(20),
    preference_1_time VARCHAR(50),
    preference_2_day VARCHAR(20),
    preference_2_time VARCHAR(50),
    unavailability_notes TEXT COMMENT 'Dates student cannot attend',
    -- Buddy group
    buddy_group_id INT NULL,
    buddy_names TEXT COMMENT 'Friends names entered manually (for admin matching)',
    -- Existing student link
    existing_student_id INT NULL COMMENT 'Linked student record if identified',
    -- Status workflow
    application_status ENUM(
        'Submitted', 'Under Review', 'Placement Offered', 'Placement Confirmed',
        'Fee Sent', 'Paid', 'Enrolled', 'Waitlisted', 'Withdrawn', 'Rejected'
    ) NOT NULL DEFAULT 'Submitted',
    admin_notes TEXT,
    -- Metadata
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(255),
    reviewed_at DATETIME,
    -- Language preference
    form_language VARCHAR(10) DEFAULT 'zh' COMMENT 'zh or en',
    --
    FOREIGN KEY (config_id) REFERENCES summer_course_configs(id),
    FOREIGN KEY (buddy_group_id) REFERENCES summer_buddy_groups(id) ON DELETE SET NULL,
    FOREIGN KEY (existing_student_id) REFERENCES students(id) ON DELETE SET NULL,
    UNIQUE KEY uq_app_reference (reference_code),
    INDEX idx_app_config (config_id),
    INDEX idx_app_status (application_status),
    INDEX idx_app_phone (contact_phone),
    INDEX idx_app_grade (grade),
    INDEX idx_app_buddy (buddy_group_id)
);
```

### `summer_course_slots` (for Phase 3 timetable arrangement)

```sql
CREATE TABLE IF NOT EXISTS summer_course_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    slot_day VARCHAR(20) NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    location VARCHAR(255) NOT NULL,
    grade VARCHAR(50) COMMENT 'Target grade',
    course_type VARCHAR(10) COMMENT 'A or B for lesson offset',
    tutor_id INT NULL,
    max_students INT NOT NULL DEFAULT 6,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (config_id) REFERENCES summer_course_configs(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE SET NULL,
    UNIQUE KEY uq_slot (config_id, slot_day, time_slot, location),
    INDEX idx_slot_config (config_id)
);
```

### `summer_placements` (for Phase 3)

```sql
CREATE TABLE IF NOT EXISTS summer_placements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    slot_id INT NOT NULL,
    lesson_number INT NULL COMMENT '1-8 for flexible students',
    specific_date DATE NULL,
    placement_status ENUM('Tentative', 'Confirmed', 'Cancelled') NOT NULL DEFAULT 'Tentative',
    placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    placed_by VARCHAR(255),
    FOREIGN KEY (application_id) REFERENCES summer_applications(id) ON DELETE CASCADE,
    FOREIGN KEY (slot_id) REFERENCES summer_course_slots(id) ON DELETE CASCADE,
    INDEX idx_placement_app (application_id),
    INDEX idx_placement_slot (slot_id)
);
```

**Update `database/run_migrations.py`**: Replace migration list with `["073_summer_course_tables.sql"]`.

---

## Step 2: Backend Models + Constants

**Modify `webapp/backend/models.py`** — Add 5 model classes:
- `SummerCourseConfig` — JSON columns with `Column(JSON, default=list)`
- `SummerBuddyGroup` — simple table with buddy_code
- `SummerApplication` — Enum column for status, FK to config/buddy_group/student
- `SummerCourseSlot` — relationships to config, tutor, placements
- `SummerPlacement` — relationships to application and slot

**Modify `webapp/backend/constants.py`** — Add:
- `SummerApplicationStatus(str, Enum)` — 10 statuses
- `SummerPlacementStatus(str, Enum)` — Tentative/Confirmed/Cancelled

---

## Step 3: Backend Schemas

**Modify `webapp/backend/schemas.py`** — New section:

**Public schemas:**
- `SummerCourseFormConfig` — Config data for form display (title, description, locations, grades, time_slots, pricing, existing_student_options, center_options). No internal fields exposed.
- `SummerApplicationCreate` — Form submission fields matching form structure above.
- `SummerApplicationSubmitResponse` — `{reference_code, buddy_code (if created), message}`
- `SummerApplicationStatusResponse` — reference_code, student_name, status, submitted_at

**Admin schemas:**
- `SummerCourseConfigCreate/Update/Response`
- `SummerApplicationResponse` — Full admin view
- `SummerApplicationUpdate` — status, admin_notes, existing_student_id
- `SummerApplicationStats` — counts by status, grade, location

---

## Step 4: Backend Router

**Create `webapp/backend/routers/summer_course.py`**

### Public endpoints (no auth):

```
GET  /api/summer/public/config                     → SummerCourseFormConfig
POST /api/summer/public/apply                      → SummerApplicationSubmitResponse
GET  /api/summer/public/status/{ref}?phone=...     → SummerApplicationStatusResponse
POST /api/summer/public/buddy-group                → {buddy_code} (create new group)
GET  /api/summer/public/buddy-group/{code}         → {buddy_code, member_count}
```

Reference code: `f"SC{config.year}-{app.id:05d}"` (generated after insert).
Buddy code: 6-char alphanumeric, generated on demand.

Rate limits: apply=3/10min, config_read=30/min, status=10/min, buddy=10/min.

### Admin endpoints:

```
GET/POST        /api/summer/configs                → CRUD configs (require_admin_write for POST)
PATCH           /api/summer/configs/{id}            → Update config (require_admin_write)
GET             /api/summer/applications            → List with filters (require_admin_view)
GET             /api/summer/applications/stats      → Aggregate stats (require_admin_view)
GET             /api/summer/applications/{id}       → Single application (require_admin_view)
PATCH           /api/summer/applications/{id}       → Update status/notes (require_admin_write)
```

**Modify `webapp/backend/utils/rate_limiter.py`** — Add summer rate limit entries.
**Modify `webapp/backend/main.py`** — Import + register `summer_course` router.

---

## Step 5: Frontend Public Route Infrastructure

**Modify `webapp/frontend/components/auth/AuthGuard.tsx`**:
```typescript
const PUBLIC_ROUTE_PREFIXES = ["/summer"];
const isPublicRoute = PUBLIC_ROUTES.includes(pathname) ||
  PUBLIC_ROUTE_PREFIXES.some(p => pathname.startsWith(p));
```

**Modify `webapp/frontend/components/layout/LayoutShell.tsx`**:
```typescript
if (pathname?.startsWith("/zen") || pathname?.startsWith("/summer")) {
  return <>{children}</>;
}
```

**Create `webapp/frontend/app/summer/layout.tsx`** — Lightweight public layout with school branding header, centered content (max-w-2xl), footer.

**Create `webapp/frontend/components/summer/SummerHeader.tsx`** — Logo + "Summer Course" / "暑期課程" branding.
**Create `webapp/frontend/components/summer/SummerFooter.tsx`** — Contact info, copyright.

---

## Step 6: Frontend Types & API

**Modify `webapp/frontend/types/index.ts`** — Add all summer types mirroring backend schemas.

**Modify `webapp/frontend/lib/api.ts`** — Add `summerAPI` object:
- Public: `getFormConfig()`, `submitApplication()`, `checkStatus()`, `createBuddyGroup()`, `getBuddyGroup()`
- Admin: `getConfigs()`, `createConfig()`, `updateConfig()`, `getApplications()`, `getApplication()`, `updateApplication()`, `getApplicationStats()`

---

## Step 7: Public Application Form Page

**Create `webapp/frontend/app/summer/apply/page.tsx`**

Bilingual form (Chinese/English toggle at top). Single-page flow:

1. **Language toggle** — switches all labels/descriptions between zh/en
2. **Student info section**: name, school, grade (dropdown from config.available_grades)
3. **Existing student check**: radio from config.existing_student_options → conditional center checkboxes
4. **Branch selection**: radio with location cards (name, address, open days — from config.locations). Show images if available.
5. **1st preference**: day (radio, filtered by selected location's open_days) + time (radio from config.time_slots)
6. **2nd preference**: same as above
7. **Unavailability dates**: free text textarea
8. **Contact info**: WeChat ID (required) + phone (required)
9. **Buddy group section**:
   - "Have a buddy code?" → text input to join existing group
   - "Want to create a buddy group?" → button → generates code, shows it to share
   - "Or enter your friends' names" → text input
10. **Confirmation checkbox**: bilingual acknowledgment text
11. **Submit** → shows confirmation with reference code (+ buddy code if applicable)

Mobile-first design (parents share link via WeChat). Controlled components with `useState`.

---

## Step 8: Public Status Page

**Create `webapp/frontend/app/summer/status/page.tsx`**

- **Lookup form**: reference code + phone number
- **Status display**: visual step indicator showing progress through main workflow
- **Status text**: bilingual description of current status + next steps

---

## Step 9: Admin Application Dashboard (post-launch)

**Create `webapp/frontend/app/(protected)/admin/summer/page.tsx`** — Config list, create/edit config form.

**Create `webapp/frontend/app/(protected)/admin/summer/applications/page.tsx`** — Filterable table of applications with status badges, grade/location/status filters, bulk status update.

**Modify `webapp/frontend/components/layout/Sidebar.tsx`** — Add "Summer" link in admin section.

---

## Phase 3: Timetable Arrangement

### Overview

Admin arranges 150+ applications into class slots via an interactive grid UI. The workflow is **demand-driven**: grade and class structure emerge from where students actually want to go, not from a pre-defined timetable.

**Key insight**: Admin looks at preference clusters, identifies natural groupings (e.g., 6 F1 students all want MSA Mon 10:00), creates a slot for that, assigns students, then repeats. The tool should make this pattern fast and visual.

### Design Decisions (from interview)

- **Grade emerges from demand** — slots start grade-less; admin assigns grade after seeing who wants the slot
- **Fixed capacity**: 6–8 students per class (configurable per slot, default 6)
- **Parallel classes**: Multiple slots at same location/day/time (e.g., F1 + F2 + F3, or F1(a) + F1(b))
- **Class Type A/B**: A = standard lessons 1–8, B = offset lessons 5–8 then 1–4. Type B is for twice-a-week students and make-up scheduling
- **Tutor auto-suggest**: Based on students' current enrollment tutors (who already knows these kids?)
- **Buddy group**: Discount-only, not a hard placement constraint — but nice to place together when possible

### Unified Grid UI

The arrangement page uses a **single grid view** where demand and placement information are layered together. There are not separate "stages" — the grid evolves as the admin works:

**Grid layout** (follows existing `WeeklyGridView` / `MyStudentsWeeklyGrid` pattern):
- **Columns**: Days of the week (only open days for selected location)
- **Rows**: Discrete time slots (from config, e.g., 10:00–11:30, 14:00–15:30, 16:15–17:45)
- **Empty columns collapse** like the existing weekly grid
- **Location selector** filters the whole view

**Cell states evolve as work progresses:**

1. **Demand only** (no slots created yet):
   - Heat-colored background based on total student preference count
   - Grade breakdown inside cell (F1: 6, F2: 4, F3: 2)
   - Click to see individual students

2. **Slot created** (slot card appears in cell):
   - Slot card shows: grade, course type (A/B), fill level (3/6), tutor name
   - Multiple slot cards stack vertically for parallel classes
   - Remaining unplaced demand count still visible above/below slots

3. **Students placed** (names appear in slot cards):
   - Placed students listed inside their slot card
   - Students placed from a different preference marked (e.g., "2nd choice" or "reassigned")
   - Demand count ticks down as students are placed — becomes a live "still-to-do" counter
   - A student placed in Wed disappears from Mon's demand (where they originally wanted to go)

4. **Fully arranged**:
   - All demand counts at 0, all slots show full capacity
   - Ready for bulk confirm (Tentative → Confirmed)

**Right panel**: Unassigned students list
- Filterable by grade, preference match, buddy group
- Drag student → drop onto slot card in grid, or click-assign
- Shows each student's 1st/2nd preferences for quick reference

### Auto-Suggest Algorithm

Greedy, least-flexible-first approach:
1. Score each unassigned student by flexibility (fewer matching open slots = higher priority)
2. For each student (least flexible first), find best slot: 1st preference > 2nd preference > any open slot of matching grade
3. Tie-break by buddy group proximity (place near buddy if possible)
4. Return proposals with confidence scores — admin reviews in a modal before accepting
5. Admin can cherry-pick which suggestions to accept

### Schema Change

The existing `UNIQUE(config_id, slot_day, time_slot, location)` constraint on `summer_course_slots` must be **dropped** — it prevents parallel classes at the same location/day/time (F1 + F2, or F1(a) + F1(b)). The slot identity is the row `id`; uniqueness is managed by admin judgment, not a DB constraint.

```sql
-- Migration 075
ALTER TABLE summer_course_slots DROP INDEX uq_slot;
```

### Backend Endpoints

**Slot CRUD** (require_admin_write):
```
GET    /api/summer/slots?config_id=X              → list all slots with placement counts
POST   /api/summer/slots                           → create slot
PATCH  /api/summer/slots/{id}                      → update grade/tutor/capacity/course_type
DELETE /api/summer/slots/{id}                       → delete (only if no confirmed placements)
```

**Placement CRUD** (require_admin_write):
```
POST   /api/summer/placements                      → assign student to slot (Tentative)
PATCH  /api/summer/placements/{id}                  → update status (Tentative → Confirmed)
DELETE /api/summer/placements/{id}                   → unassign student
```

**Demand & suggestions** (require_admin_view):
```
GET    /api/summer/demand?config_id=X&location=Y   → demand heatmap data (preference counts by day×time×grade)
POST   /api/summer/auto-suggest                     → run algorithm, return ranked proposals
```

### Frontend Route & Components

New tab "Arrangement" in `/admin/summer/layout.tsx`:
```
app/admin/summer/
├── arrangement/
│   └── page.tsx          ← main arrangement page
```

Components (in `webapp/frontend/components/admin/`):
- `SummerArrangementGrid.tsx` — the weekly-style grid (days × time slots), renders cells
- `SummerSlotCell.tsx` — single cell: demand overlay + slot cards
- `SummerSlotCard.tsx` — a slot within a cell: grade badge, fill bar, student list, tutor
- `SummerUnassignedPanel.tsx` — right sidebar: filterable student list, drag source
- `SummerAutoSuggestModal.tsx` — review & accept/reject algorithm proposals

### Key Existing Code to Reuse

- `WeeklyGridView.tsx` / `MyStudentsWeeklyGrid.tsx` — grid layout pattern, empty column collapse, CSS grid approach
- `MonthlyCalendarView.tsx` — heat color scaling for demand intensity
- `calendar-utils.ts` — `parseTimeSlot()`, time slot handling utilities
- `SummerApplicationCard.tsx` — student card styling for the unassigned panel

### Phase 4: Enrollment Conversion & Session Generation
- **Session generation logic** (from current Apps Script `generatePaidStudentCourseSessions()`):
  - Find first occurrence of assigned day within course period
  - Generate 8 weekly sessions from that date
  - Lesson numbers: Type A = [1,2,3,4,5,6,7,8], Type B = [5,6,7,8,1,2,3,4]
  - Deduplicate by date+time+student
  - Assign tutor from Complete Schedules
- **Fee calculation** (driven by `pricing_config` JSON):
  - Base fee from config (e.g., $3200)
  - Iterate discounts, check conditions (before_date, min_group_size, etc.)
  - Apply best matching discount (highest amount that satisfies all conditions)
  - Add registration fee for new students
  - Generate promo code from discount code + year prefix
- Migration 074: Add `lesson_number` to session_log, `summer_application_id` to enrollments

### Phase 5: Summer Operations
- Attendance tracking (existing SessionLog flow)
- Flexible student session management
- Progress dashboard (lessons 1-8 completion)

---

## Files Summary

### New files:
| File | Purpose |
|------|---------|
| `database/migrations/073_summer_course_tables.sql` | 5 new tables |
| `webapp/backend/routers/summer_course.py` | Public + admin endpoints |
| `webapp/frontend/app/summer/layout.tsx` | Public layout (no auth) |
| `webapp/frontend/app/summer/apply/page.tsx` | Application form |
| `webapp/frontend/app/summer/status/page.tsx` | Status check page |
| `webapp/frontend/components/summer/SummerHeader.tsx` | Public header |
| `webapp/frontend/components/summer/SummerFooter.tsx` | Public footer |
| `webapp/frontend/app/(protected)/admin/summer/page.tsx` | Admin config management |
| `webapp/frontend/app/(protected)/admin/summer/applications/page.tsx` | Admin application review |

### Modified files:
| File | Change |
|------|--------|
| `database/run_migrations.py` | Add migration 073 |
| `webapp/backend/models.py` | Add 5 model classes |
| `webapp/backend/constants.py` | Add status enums |
| `webapp/backend/schemas.py` | Add summer schemas |
| `webapp/backend/main.py` | Register summer_course router |
| `webapp/backend/utils/rate_limiter.py` | Add summer rate limits |
| `webapp/frontend/components/auth/AuthGuard.tsx` | Add /summer to public prefixes |
| `webapp/frontend/components/layout/LayoutShell.tsx` | Bypass shell for /summer |
| `webapp/frontend/types/index.ts` | Add summer types |
| `webapp/frontend/lib/api.ts` | Add summerAPI object |
| `webapp/frontend/components/layout/Sidebar.tsx` | Add Summer admin link |

### Key existing code to reuse:
- `webapp/backend/utils/rate_limiter.py` — `check_ip_rate_limit()` for public endpoints
- `webapp/backend/auth/dependencies.py` — `require_admin_view`, `require_admin_write`
- `webapp/frontend/lib/api.ts` — `fetchAPI` helper (works for public endpoints as-is)

---

## Verification

1. Run migration: `python database/run_migrations.py`
2. Start backend, test public endpoints via curl:
   - `GET /api/summer/public/config` → 404 (no active config)
   - Create config via admin endpoint → set is_active=true
   - `GET /api/summer/public/config` → returns config
   - `POST /api/summer/public/apply` → returns reference code
   - `GET /api/summer/public/status/{ref}?phone=...` → returns status
3. Rate limiting: hit apply 4 times → 429 on 4th
4. Frontend: `/summer/apply` without login → form renders
5. Submit form → redirect to status page
6. Admin: login → /admin/summer → see applications
7. Backend tests: `cd webapp/backend && ./venv/bin/pytest tests/ -v`

## Execution Order

Steps 1-4 (backend) → Steps 5-6 (frontend infra) → Steps 7-8 (form pages) → Step 9 (admin). Steps 1-8 must ship by mid-April.
