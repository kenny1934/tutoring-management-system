# Primary Prototypes — Next Session Handoff

Status: the previous session's punch list (Tier 1 + Tier 2 + Tier 3 + the two optional items) all landed. Next session's job is the **CSM-alignment audit findings** below — most are naming/shape mismatches the prototypes will need to fix before any real integration.

---

## Where we are

- **Branch:** `feature/primary-prototypes`
- **Worktree:** `.claude/worktrees/feature-primary-prototypes/`
- **App:** `prototypes/primary-handoff/` — standalone Next.js 15 + Tailwind v4, mock data only, no backend, intentionally not sharing code with main CSM
- **No `npm run build` / `npm run dev`** — hot reload runs on the user's side (per CLAUDE.md)
- **Commits:** conventional (`feat(prototypes):`, `fix(prototypes):`), no Claude footer, do not push without explicit ask

### Shipped this session (14 commits)

```
1a97c11e feat(prototypes): scope print batch to a session via Prep print batch
7e74f7c1 feat(prototypes): add List/Grid view toggle to record modal
4aac3849 feat(prototypes): tighten session row by collapsing recent chips
acf08abd feat(prototypes): make Makeup attendance system-set, not a manual pick
1af9b3d8 feat(prototypes): show session counts on sessions filter bar
7087e495 feat(prototypes): warn when assigning to a low-HW-load student
ab130b84 feat(prototypes): show tutor-note badge on checktable item chips
6413efd0 feat(prototypes): MakeupModal creates a real makeup session
d8755395 feat(prototypes): group HistoryDrawer entries by date, chapter, or session
c3a9b47a feat(prototypes): suggest next checktable item on session rows
0d7ac8ce feat(prototypes): add status and section filters to checktable grid
f2df2d46 fix(prototypes): scope checktable print batch per student
f7c898ed feat(prototypes): show per-student status in record modal picker
(plus the previous handoff doc commit)
```

### What works today (don't redo)

- Shared store at `lib/store/PrimaryStore.tsx` — sessions, assignments, contacts, students, checktables; `itemMeta: Map<itemId, {item, checktableId, chapter?, sectionLabel}>` lookup; per-student print batch; `nextSuggestedItem(studentId, checktableId)`; `primaryChecktableId(studentId)`; `createMakeupSession(...)`.
- Recording CW/HW in a session auto-creates a `ChecktableAssignment` (CW=done, HW=assigned). Grid chips reflect it.
- Cross-nav: session row → `/checktables?student=<id>`; "Prep print batch" → `/checktables?student=X&prep-session=Y`; history drawer → `/sessions?session=<id>` with ring highlight + scroll.
- HW modal picker shows per-student status dots + `All | Pending | Untouched | Hide done` filter and a `List | Grid` view toggle.
- Checktable grid has `All | Pending | Untouched` × `All | section… | 補充` filter strip; tutor-note badges; AssignDialog warns when assigning to a `hwLoad: Little` student would push them to ≥3 open items.
- Makeup modal actually creates a new `ClassSession` (with `isMakeup`, `rescheduledFrom`, the moved student) and flips the source attendance.
- "Prep print batch" mode on the checktable: accent banner + tray, "Print & record" loops the batch into `recordExercise` as HW and lands the user back on the session.

---

## Audit: deviations from CSM

The prototypes are intentionally a separate app, but several places diverge from CSM in ways the next integration will trip on. Citations are file + line.

### Breaks the mental model (decision needed before integrating)

**1. `ClassSession` is class-wide; CSM's `Session` is enrollment-bound (1:1 with a student's lesson).**
- Prototype: `lib/types.ts:124–137` has `ClassSession` with `students: SessionStudent[]` — one record per scheduled class.
- CSM: `webapp/frontend/types/index.ts:354–395` has `Session` with `enrollment_id`, `student_id`, `tutor_id` — one record *per student per occurrence*.
- Consequence: every interaction in the prototypes that says "find the student inside this session" doesn't map onto CSM's data — there's no inside. A class meeting is N rows in CSM.
- Decision needed: do we keep the class-wide `ClassSession` view as a derived UI grouping (with N CSM `Session` rows underneath), or rebuild around CSM's per-student session?

**2. `AttendanceStatus` enum vs `session_status` state machine.**
- Prototype: `lib/types.ts:96–101` — `"pending" | "present" | "absent" | "late" | "makeup"`.
- CSM: `webapp/frontend/types/index.ts:16–43` exports `SessionStatus` with 15+ values including `Make-up Class`, `Attended (Make-up)`, `Rescheduled - Pending Make-up`, `Rescheduled - Make-up Booked`, `Sick Leave - Pending Make-up`, `Weather Cancelled - …`. Attendance is *not* a separate enum — it's part of the session-status state machine. `attendance_status` exists as a free-form string field but the state lives in `session_status`.
- Consequence: the prototype's attendance picker, the makeup workflow, and the "Makeup" pill all model state CSM tracks through transitions, not flags.

**3. Makeup is a flag in prototypes, a status + linkage chain in CSM.**
- Prototype: `lib/types.ts:135` — `isMakeup?: boolean`, with `rescheduledFrom: string` (a human label).
- CSM: `webapp/frontend/types/index.ts:376–381` — `rescheduled_to_id`, `make_up_for_id`, `root_original_session_date` (for the 60-day rule), `rescheduled_to` / `make_up_for` linked-session info.
- The prototype's `createMakeupSession` action stores `rescheduledFrom` as a label string; CSM expects a foreign-key chain that supports walking source ↔ makeup and enforcing the 60-day rule.

### Data-shape mismatches (silent rename risk on integration)

**4. `RecordedExercise.kind: "CW" | "HW"` vs `SessionExercise.exercise_type: string`.**
- Prototype: `lib/types.ts:103–113` — `RecordedExercise { kind, itemCode, pageRange?, note? }`.
- CSM: `webapp/frontend/types/index.ts:221–238` — `SessionExercise { exercise_type, pdf_name, page_start, page_end, remarks, … }` plus answer-key fields. CW/HW is encoded in `exercise_type` (string), not a closed enum. Page is split into start/end numbers, not a free-form range string.
- Prototype's `note` ↔ CSM's `remarks`. Prototype's `itemCode` ↔ CSM's `pdf_name`.

**5. Homework completion is a separate entity in CSM, implicit in prototypes.**
- Prototype: a `ChecktableAssignment.status` of `"done"` represents completion.
- CSM: `webapp/frontend/types/index.ts:254+` — `HomeworkCompletion { current_session_id, session_exercise_id, submitted, completion_status, tutor_comments, checked_by, checked_at, … }`. Completion is tracked separately from the exercise record, and the *next* session is the one that marks completion of the previous.
- The prototype's tidy CW=done / HW=assigned auto-link doesn't map onto CSM's "exercise assigned in session N, completion recorded in session N+1" model.

**6. Field-naming convention: camelCase vs snake_case.**
- Prototype: `lessonNumber`, `studentId`, `checktableId`, `pageRange`, `tutorNote`.
- CSM: `lesson_number`, `student_id`, `pdf_name`, `page_start`, `remarks`.
- Mechanical to fix at integration, but worth noting now so the prototype types match an eventual API client.

**7. `hwLoad: "NO" | "Little" | "Normal" | "Many"` has no CSM equivalent.**
- Prototype: `lib/types.ts:3,11`. The new HW-load warning in `AssignDialog` reads from it.
- CSM: `webapp/frontend/types/index.ts:111+` — `Student` carries no homework-load property. Either this is a real product extension the prototype is proposing, or it should be derived from CSM data (e.g., from recent assignment density).

**8. `Checktable` + `ChecktableAssignment` are net-new abstractions; intentional.**
- Prototype: `lib/types.ts:14–71`. Curriculum-aligned exercise inventory + per-student progress on it.
- CSM: no equivalent — exercises are ad-hoc per session.
- This is the *point* of the prototypes (proposing a curriculum-map model), so flag it as a deliberate design proposal rather than a fix. Just make sure the next integration step has a real backend design before this part lands.

**9. `Assessment` kanban pipeline doesn't exist in CSM.**
- Prototype: `lib/types.ts:74–93`, stages `booked | attended | follow-up | enrolled | lost`.
- CSM: has `HandoverProspect` (`webapp/frontend/types/index.ts:100+`) for the trial→enrollment handover, but no kanban view or staged pipeline.
- Same call as Checktable — intentional product proposal, but flag the gap.

**10. `ParentContact` invents a shape CSM doesn't expose as a type.**
- Prototype: `lib/types.ts:148–159`.
- CSM: parent contacts are accessed through `useStudentParentContacts` and `ZenContactForm`, but the response type isn't a named export in `types/index.ts`. The prototype's shape (method, type, follow-up fields) may or may not match the backend — needs verification next session.

### Visual / UI conventions (cosmetic, mostly intentional)

**11. Color palette: `ink-*` neutrals vs CSM's warm `oak`/`paper-cream`.**
- Prototype: `app/globals.css:4–24` defines a custom `ink-*` scale.
- CSM: `webapp/frontend/app/globals.css:28–76` uses warm cream backgrounds, oak primary (`#a0704b`), and semantic tokens (`--color-success: #16a34a`).
- Intentional per the prototype's framing ("doesn't read as CSM"). No action needed unless these eventually merge.

**12. Drawer for exercise history; everything else in CSM is a modal.**
- Prototype: `components/checktable/HistoryDrawer.tsx` uses a right-side drawer.
- CSM: no drawer pattern in the frontend — overlays are uniformly `Modal` (e.g., `webapp/frontend/components/sessions/EditSessionModal.tsx`).
- Cosmetic but inconsistent. If the prototype's UX is right, this is a pattern CSM should adopt; if not, swap to a modal at integration.

**13. ESC handling is hand-rolled in each modal.**
- Prototype: every modal has its own `useEffect` for ESC (`RecordExerciseModal.tsx`, `AssignDialog.tsx`, `MakeupModal.tsx`).
- CSM: shared modal component handles this once.
- Trivial to consolidate when the prototypes converge with CSM's Modal primitive.

---

## Suggested next-session priorities

Ordered by impact-per-commit; each = one commit (don't bundle).

1. **Decide the `ClassSession` vs `Session` question (#1).** Either rewrite the prototype's data model to CSM's per-student session, or document explicitly that `ClassSession` is a UI grouping that flattens to N `Session` rows. The current prototype hides the question.
2. **Replace `AttendanceStatus` with the real `SessionStatus` values (#2).** Wire the attendance picker and makeup flow to the right state values (`Attended`, `No Show`, `Rescheduled - Pending Make-up`, etc.). The picker will need to surface fewer manual options and more system-driven ones — the work done in 2c (`createMakeupSession`) already moves in this direction.
3. **Switch makeup to id-based linkage (#3).** Replace `rescheduledFrom: string` with `make_up_for_id` / `rescheduled_to_id`, and add `root_original_session_date` so the 60-day rule has a place to live. Update `createMakeupSession` to set the link on both sides.
4. **Align `RecordedExercise` field names with `SessionExercise` (#4 + #6).** Rename `kind` → `exercise_type`, `itemCode` → `pdf_name`, split `pageRange` into `page_start`/`page_end`, `note` → `remarks`. Keep the value space (`CW` / `HW`) as the seed but type it as a string.
5. **Decide where homework-completion lives (#5).** Either keep the implicit "assignment.status = done" model and document it as a prototype-only simplification, or model `HomeworkCompletion` as a separate entity and have the *next* session's record write it.
6. **Verify or remove `hwLoad` (#7).** If it's a real proposal, document it in the project memory and write a backend schema sketch. If it's only there because the warning needed something to read, derive it instead.
7. **Verify the `ParentContact` shape against the real backend response (#10).** A 10-minute check now that prevents a rename later.

Items #8 (Checktable model) and #9 (Assessment) are deliberate product proposals — leave them as-is, but flag in the project memory that they don't exist in CSM yet.

Cosmetic items #11 / #12 / #13 can wait until the prototypes converge with CSM proper.

---

## Architecture pointers (still current)

- **All shared state lives in `PrimaryStoreProvider`** (`lib/store/PrimaryStore.tsx`). When adding selectors, follow the existing pattern: data on the value, ref-backed callbacks for actions, `useMemo` keyed on the data dependencies. Refs are how `recordExercise` / `removeExercise` / `createMakeupSession` read fresh state without becoming new function identities each render.
- **Use `itemMeta`** for any item-id lookup. It now carries `chapter` and `sectionLabel` (added during 2a), so chapter grouping is a direct read instead of a re-walk.
- **`DEMO_DAY`** (`lib/mock-data/sessions.ts`) and **`DEMO_NOW`** (`lib/mock-data/parent-contacts.ts`) are the pinned "today" anchors. Do not introduce new `"2026-05-19"` literals.
- **`sessionLabel(sessionId)`** from the store is the canonical human-readable session label formatter. Reuse rather than reimplementing date formatting.
- **`primaryChecktableId(studentId)`** picks the checktable a student is most active in — use this when the calling site needs "the" checktable for a student.
- **URL params owned by the prototypes:** `?student=<id>` (selects current student on checktables page), `?session=<id>` (highlights a session on sessions page), `?prep-session=<id>` (puts checktables into session-prep mode).

---

## Demo script

1. Open `/sessions`. Filter chips show counts: `Today (N) · Upcoming (N) · Past (N)`.
2. Click HW on a student in tonight's session → modal opens with per-student status dots in the picker. Flip to `List | Grid` view; the grid uses the same chips as the checktable page.
3. Record 2 items; close modal; HW chips appear on the row.
4. Click **Prep print batch** on the row → checktable opens with an accent banner ("Prepping HW for …"). Add 3 chips, click **Print & record 3** → records HW + lands back on the session showing 5 HW chips.
5. On the same student, mark a different session **Absent** → **Schedule makeup** → pick a slot → modal confirms inline with a link to the new makeup session. The source row's attendance shows `Makeup · scheduled` (read-only chip).
6. Open the new makeup session via the link → it's marked `Makeup`, scheduled correctly, and links back to the original.
7. Open the History drawer on the checktable → switch grouping `By date | By chapter | By session`. Click a session label → navigates to `/sessions` with that session ring-highlighted.
