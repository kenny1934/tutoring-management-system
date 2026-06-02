# Primary Prototypes — Next Session Handoff

Status: the previous session's CSM-alignment audit landed in full. The prototypes' session/exercise/completion data model now mirrors CSM in shape and field names; the deliberate prototype-only abstractions (Checktable, Assessment) stay as-is and are verified internally consistent.

---

## Where we are

- **Branch:** `feature/primary-prototypes`
- **Worktree:** `.claude/worktrees/feature-primary-prototypes/`
- **App:** `prototypes/primary-handoff/` — standalone Next.js 15 + Tailwind v4, mock data only, no backend
- **No `npm run build` / `npm run dev`** — hot reload runs on the user's side (per CLAUDE.md)
- **Commits:** conventional (`feat(prototypes):`, `fix(prototypes):`, `refactor(prototypes):`), no Claude footer, do not push without explicit ask

### Shipped this session

The audit-driven refactor came in four commits on top of the prior 13:

```
ed6b997e feat(prototypes): surface hwLoad as a chip on session student rows
af76bd37 feat(prototypes): add HomeworkCompletion as a separate entity
725c1942 refactor(prototypes): rename RecordedExercise to SessionExercise with CSM-aligned fields
4d406280 refactor(prototypes): enrollment-bound Session, SessionStatus, makeup linkage
```

### Data model — now CSM-aligned where it counts

| Concept | Prototype before | Prototype now | CSM equivalent |
|---|---|---|---|
| Session | `ClassSession` (class-wide, `students: SessionStudent[]`) | `Session` (per-student row, enrollment-bound) | `Session` |
| Enrollment | implicit | `Enrollment { student_id, class_code, lessons_total, … }` | `Enrollment` |
| Attendance | `AttendanceStatus` enum (5 values) | `session_status: SessionStatusValue` (13 values) + `attendance_status?: string` for Late | `session_status` + `attendance_status` |
| Makeup | `isMakeup: boolean` + `rescheduledFrom: string` label | `make_up_for_id` / `rescheduled_to_id` / `root_original_session_date` | same |
| Exercise record | `RecordedExercise { kind, itemCode, pageRange, note }` | `SessionExercise { exercise_type, pdf_name, page_start, page_end, remarks, item_id? }` | `SessionExercise` |
| HW completion | implicit (`ChecktableAssignment.status = "done"`) | separate `HomeworkCompletion` entity recorded in a later session | `HomeworkCompletion` |

Field naming: types that mirror CSM use snake_case. Prototype-only types (`Checktable`, `ChecktableAssignment`, `Assessment`, `ParentContact`, `Student`) keep their existing camelCase.

### UI changes you should know about

- **SessionsApp** now derives `ClassMeeting` groups from per-student `Session` rows by `(class_code, session_date, start_time)`. The visible card UX is unchanged; the data under the hood is N rows per meeting instead of 1 with N students inside.
- **AttendancePicker** writes `session_status` (and `attendance_status="Late"` for the Late button). System-set sub-chips render for `Make-up Class`, `Attended (Make-up)`, `Make-up Booked`, and `Cancelled`.
- **MakeupModal**'s confirm now calls `createMakeupSession` which:
  1. Creates a new `Session` with `session_status = "Make-up Class"`, `make_up_for_id = source.id`, `root_original_session_date = source.session_date`.
  2. Transitions the source's status via `statusAfterMakeupBooked` — `SICK_LEAVE_PENDING → SICK_LEAVE_BOOKED`, `WEATHER_PENDING → WEATHER_BOOKED`, else `RESCHEDULED_BOOKED` — and sets its `rescheduled_to_id = newSession.id`.
- **AssignDialog**'s "Mark done" flips the `ChecktableAssignment` status directly via the store. The richer next-session-checks-previous-HW flow now lives on `/sessions` as a `PreviousHomeworkToCheck` row per student — that path calls `recordHomeworkCompletion`, which picks the student's next session after the assignment as `current_session_id`, creates the completion row, and flips the matching assignment as a side effect.
- **HistoryDrawer** surfaces completion info on each assignment card with a deep link to the session where the HW was checked.
- **hwLoad** now appears as a chip on session student rows (when non-Normal), in addition to the existing checktable header and AssignDialog warning.

### Verified

- All seeded `ChecktableAssignment.itemId`s resolve to real `ChecktableItem`s in the seeded checktables (sanity-checked manually).
- All session-id references in seeds (including `make_up_for_id`, `rescheduled_to_id`, `source_recorded_exercise_id`, `current_session_id`) resolve to existing session/exercise rows.
- ItemIDs are unique by construction — `${scope}/${seriesId}/${code}` where scope is per-cell.
- Supplementary items use a different scope prefix (`supp-01`, `supp-02`, …) and series (`supp`) — no collision with chapter items.

The **Checktable + ChecktableAssignment** model is internally consistent. It remains a deliberate prototype-only abstraction with no CSM counterpart; if it ever lands, the integration design will need to spec (a) a backend table for the curriculum inventory with versioning, and (b) uniqueness constraint on `(checktable_id, scope, series_id, code)`.

---

## What works today (end-to-end)

- Per-student session rows under class-meeting groupings on `/sessions`, with `Today / Upcoming / Past` filter and counts.
- Mark attendance via `Present | Late | Absent`; system-set Makeup chips display when the session is in a makeup-related status.
- Schedule a make-up from an absent/sick/weather-pending session → new linked `Session`, source transitions to the matching `*_BOOKED` status.
- Record CW/HW from the session row → `SessionExercise` is added to the session, auto-linked `ChecktableAssignment` flips to `done` (CW) or `assigned` (HW).
- Picker shows per-student status (green/amber/neutral dots), `All | Pending | Untouched | Hide done` filter, and a `List | Grid` view toggle reusing `<ChecktableGrid>`.
- Checktable lives as a per-student tab (`/students/[id]/checktables`) with a status × section filter strip; tutor-note badges on chips; per-student print batch. The same surface is also reachable from `/sessions` as a slide-out drawer per session row.
- HistoryDrawer groups by date / chapter / session and shows completion info pulled from `HomeworkCompletion`.
- "Next suggested item" chip on session rows pointing at the lowest-numbered chapter the student has touched.
- HW-load warning fires in AssignDialog when assigning to a `hwLoad: Little` student would push them to ≥3 open items.

---

## Suggested next-session priorities

Most of the alignment work is done. Remaining items below are scoped narrow.

1. **Wire previous-session-HW-check into the session view.** Now that `HomeworkCompletion` exists, the most natural place to mark HW complete is the *next* session row, not the checktable's AssignDialog. Add a "Previous HW to check" affordance per student row on session cards that lists HW assigned in their last attended session and lets the tutor mark each as Complete / Partial / Not done. The store action (`recordHomeworkCompletion`) is already in place.
2. **Surface `session_status` more richly.** Today the picker only writes `ATTENDED / NO_SHOW`. Add sub-pickers for "Absent — why?" (Sick Leave / Weather / No Show / Generic Reschedule) so the right pending-status transitions fire. The makeup workflow already handles the *_BOOKED side correctly.
3. **Verify ParentContact shape against CSM's real backend response.** The prototype invents the type (`lib/types.ts:213+`). CSM exposes parent contacts via `useStudentParentContacts` + `ZenContactForm` but doesn't have a named exported type in `types/index.ts`. A 15-minute backend check before this part lands would prevent a rename later.
4. **Item code uniqueness within a cell.** Defensive: a tutor adding the same code twice to the same cell would create an id collision (since id is `${scope}/${seriesId}/${code}`). Either dedupe at seed time or make the id include an index suffix. Low risk today, worth flagging.
5. **Cosmetic alignment with CSM palette** (low priority, intentional divergence per original spec).

### Deliberately out of scope

- `Checktable` and `ChecktableAssignment` types: net-new prototype concepts. Keep camelCase, no CSM rename required.
- `Assessment` kanban: net-new prototype concept; CSM has `HandoverProspect` but no kanban view.
- Drawer-vs-modal pattern: stylistic difference; CSM uses Modal throughout, prototype uses Drawer for read-only history. Cosmetic.
- Hand-rolled ESC handling in each modal: trivial to consolidate when converging with CSM's `Modal` primitive.

---

## Architecture pointers (still current)

- **All shared state lives in `PrimaryStoreProvider`** (`lib/store/PrimaryStore.tsx`). Selectors follow the same pattern: data on the value, ref-backed callbacks for actions, `useMemo` keyed on the data dependencies.
- **`itemMeta`** (`Map<itemId, {item, checktableId, chapter?, sectionLabel}>`) is the canonical item lookup. Don't re-walk the checktable structure.
- **`DEMO_DAY`** (`lib/mock-data/sessions.ts`) is the pinned "today" anchor. No new `"2026-05-19"` literals.
- **`sessionLabel(sessionId)`** is the canonical human-readable session label formatter.
- **`primaryChecktableId(studentId)`** picks the checktable a student is most active in.
- **`parsePageRange` / `formatPageRange`** in the store convert between the "1-2" UI string and the `page_start / page_end` numbers on `SessionExercise`.
- **URL params owned by the prototypes:**
  - `/sessions?session=<id>` — highlights and scrolls to a session row

### Mock-data layout

- `lib/mock-data/students.ts` — `students[]`
- `lib/mock-data/sessions.ts` — `enrollments[]`, `sessions[]` (per-student), `makeupSuggestions[]`
- `lib/mock-data/assignments.ts` — `seedAssignments[]` (ChecktableAssignment)
- `lib/mock-data/homework-completions.ts` — `seedHomeworkCompletions[]`
- `lib/mock-data/checktables.ts` — `checktables[]`
- `lib/mock-data/parent-contacts.ts` — `parentContacts[]`
- `lib/mock-data/assessments.ts` — assessment kanban seed

---

## Demo script

1. Open `/` — today snapshot card shows pending makeups, today's sessions, follow-ups due. Click into Sessions.
2. On `/sessions`, three filter tabs show counts. Today's 4pm class shows three per-student rows under a single card; Lee Tsz Kit has a `HW: Little` chip next to his grade.
3. Click HW on a student → modal opens with per-student status dots; flip to `Grid` view to use the checktable grid for picking.
4. Record 2 items → HW chips appear on the session row; status `Attended` is preserved.
5. Open the row's kebab → **Open checktable** → checktable drawer slides in scoped to that student, ready for further editing without leaving the session view.
6. On another student, click **Absent** → **Schedule makeup** → pick a slot → confirmation panel links through to the newly-created `Session`. The source row now shows `Make-up booked` and the new session shows `Make-up class` with `make_up_for_id` linking back.
7. Open `/students/<id>` → the History tab groups assignments by date / chapter / session; pick an entry that has a completion → see `Complete in <next session>` line + the tutor comment.

---

## UX Audit Checklist (2026-06-03)

Findings from a full-surface UX audit, grouped into the five parallel work-packages used to fix them. Files are disjoint per package so the fixes can land independently.

### Cross-cutting pattern (applied per modal, inline — no shared hook yet)
- [ ] Modal a11y: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (title gets an id), focus first field on open, restore focus on close, trap Tab.
- [ ] Backdrop click only closes when the form is pristine (dirty form → no accidental close / data loss). Cancel/Close button still always closes.
- [ ] Replace `alert()` / native `confirm()` "Demo only" stubs with in-app styled feedback; drop jarring "Demo only" phrasing.
- [ ] Normalise "makeup" → "make-up" in user-facing copy.

### Pkg 1 — Dashboard + Sessions core (`app/page.tsx`, `SessionsApp.tsx`, `WeeklyView.tsx`)
- [ ] Dashboard "Pending make-ups" tile deep-link (`?filter=pending-makeups`) is dead — implement the `filter` param in `SessionsApp` so the tile actually narrows to pending-makeup statuses.
- [ ] Star rater (`PerformanceRater`) is hover-only and unusable on touch — make stars visible/ tappable by default.
- [ ] No way to correct attendance once marked — add a "Change status" path (fold into the row kebab, which currently holds only one item).
- [ ] Removing a logged exercise (bare `×`) has no confirm — add a light confirm.
- [ ] Increase hit areas on the dense Sessions-row controls (remove/eye/lightbulb/stars/kebab) for tablet use.
- [ ] `WeeklyView` "Today" marker uses the real clock — anchor it to `DEMO_DAY`.

### Pkg 2 — Sessions modals (`MakeupModal.tsx`, `RecordExerciseModal.tsx`, `WorksheetModal.tsx`)
- [ ] Apply modal a11y + dirty-backdrop guard (all three).
- [ ] `MakeupModal` re-asks the reason already chosen in "Can't attend ▾" — prefill from the pending status.
- [ ] `WorksheetModal` PDF iframe has no loading state — add one.

### Pkg 3 — Student hub modals + overview (`StudentFormModal.tsx`, `CreateEnrollmentModal.tsx`, `StudentOverview.tsx`, `StudentChecktablesTab.tsx`, `AssignDialog.tsx`)
- [ ] Apply modal a11y + dirty-backdrop guard to `StudentFormModal`, `CreateEnrollmentModal`, `AssignDialog`.
- [ ] `StudentOverview` calls hooks after an early `return null` (rules-of-hooks violation) — move the guard above all hooks.
- [ ] `StudentChecktablesTab` Print → `alert("Demo only")` — replace with in-app feedback.

### Pkg 4 — Parent Comms (`ContactCalendar.tsx`, `RecordContactModal.tsx`, `ParentContactsApp.tsx`, `StudentList.tsx`)
- [ ] Calendar places events by host-local timezone — key the grid + `byDay` via `lib/datetime.ts` HKT helpers.
- [ ] `RecordContactModal` crashes on an empty student list (`students[0].id`) — guard; apply modal a11y.
- [ ] Calendar event chips show only a time — add student name + tooltip; make `+N more` clickable.
- [ ] Three-panel layout keeps fixed `h-[640px]` on mobile — let panels stack at natural height.
- [ ] Calendar-event selection strands the detail pane — add "back to history".
- [ ] Dedupe the four "Record contact" button styles; remove "Demo only" from the delete confirm.
- [ ] Verify `/comms?student=<id>` deep-link (from dashboard follow-ups) selects that student.

### Pkg 5 — Assessments + Courseware (`AssessmentKanban.tsx`, `CoursewareBrowser.tsx`)
- [ ] Kanban is drag-only — add a per-card stage select/menu (keyboard + touch, any direction) reusing the existing stage-change mechanism.
- [ ] "Move next" arrow is hover-only — make it visible/focusable.
- [ ] Add ARIA to lanes/cards + an `aria-live` move announcement.
- [ ] "New booking" → `alert("Demo only")` — make it a labelled placeholder or mock flow.
- [ ] Toolbar stats computed from unfiltered set while cards are filtered — add "showing N of M" / compute from visible.
- [ ] Courseware has no search over thousands of PDFs — add a code/chapter search box.
- [ ] Courseware grid never reflects already-assigned worksheets — feed real status from the store.
- [ ] Assign toast not announced — wrap in `aria-live`, add manual dismiss.

### Out of scope — needs a product/design decision (not auto-fixed)
- Logging CW/HW has 3–4 overlapping entry points (inline suggestion, RecordExerciseModal, WorksheetModal, AssignDialog) — rationalise into a clear "two ways" model.
- Sessions suggestion-chip (lightbulb / code / eye on one chip) is dense/cryptic — needs a redesign pass, not a mechanical tweak.
- Primary-CTA colour split (red page-level vs ink-800 in-modal) — confirm the intended convention before sweeping changes.
- Consolidating the per-modal hand-rolled ESC/focus logic into a shared `useModalA11y` hook (do after the parallel fixes land, to avoid races).
