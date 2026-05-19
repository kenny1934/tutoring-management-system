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
- **AssignDialog**'s "Mark done" routes through `recordHomeworkCompletion`, which picks the student's next session after the assignment as `current_session_id` (mirroring CSM's next-session-checks-previous-HW pattern), creates the completion row, and flips the matching `ChecktableAssignment` to done as a side effect.
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
- Checktable page has a status × section filter strip; tutor-note badges on chips; per-student print batch (Fix A); session-prep mode via `?prep-session=<id>` that records HW in one shot (Fix B).
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
  - `/checktables?student=<id>` — selects current student
  - `/checktables?student=<id>&prep-session=<sessionId>` — session-prep mode
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

1. Open `/sessions` — three filter tabs show counts. Today's 4pm class shows three per-student rows under a single card; Lee Tsz Kit has a `HW: Little` chip next to his grade.
2. Click HW on a student → modal opens with per-student status dots; flip to `Grid` view to use the checktable grid for picking.
3. Record 2 items → HW chips appear on the session row; status `Attended` is preserved.
4. Click **Prep print batch** → checktables page opens with accent banner ("Prepping HW for …"); add 3 chips, click **Print & record 3** → returns to `/sessions?session=<id>` with the new HW visible.
5. On another student, click **Absent** → **Schedule makeup** → pick a slot → confirmation panel links through to the newly-created `Session`. The source row now shows `Make-up booked` and the new session shows `Make-up class` with `make_up_for_id` linking back.
6. Open History drawer on the checktable; pick an entry that has a completion → see `Complete in <next session>` line + the tutor comment.
