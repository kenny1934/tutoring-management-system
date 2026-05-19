# Primary Prototypes — Next Session Handoff

Goal of the next session: take the Sessions and Checktable pages from "demo of the wiring" to "feels like a real product" by working the priority list below.

---

## Where we are

- **Branch:** `feature/primary-prototypes`
- **Worktree:** `.claude/worktrees/feature-primary-prototypes/`
- **App:** `prototypes/primary-handoff/` — standalone Next.js 15 + Tailwind v4, mock data only, no backend, intentionally not sharing code with main CSM
- **No `npm run build` / `npm run dev`** — hot reload runs on the user's side (per CLAUDE.md)
- **Commits:** conventional (`feat(prototypes):`, `fix(prototypes):`), no Claude footer, do not push without explicit ask

Most recent commits:

```
455c6e35 refactor(prototypes): consolidate item lookups, memoize store, drop hard-coded today
1324b932 feat(prototypes): show recently covered chips on session rows
4099e050 feat(prototypes): cross-navigate between sessions and checktable
3aecf710 feat(prototypes): replace AssignDialog session free-text with picker
b4884056 feat(prototypes): share sessions+assignments via context, auto-link session records to checktable
592c3087 feat(prototypes): group parent comms student list by urgency or grade
b6fc0377 fix(prototypes): scope checktable item ids by chapter
```

## What works today (don't redo)

- Shared store at `lib/store/PrimaryStore.tsx` holds sessions, assignments, contacts, students, checktables, plus an `itemMeta: Map<itemId, {item, checktableId}>` lookup
- Recording CW/HW in a session auto-creates a `ChecktableAssignment` (CW=done, HW=assigned). Chips on the grid reflect it.
- Cross-nav links: session row → `/checktables?student=<id>`; history drawer → `/sessions?session=<id>` with ring highlight + scroll
- AssignDialog's session label is a real picker scoped to the student's upcoming sessions
- Parent comms student list has urgency/grade grouping toggle

## Where it still feels like two separate apps

These are the gaps the next session should close. Ordered by tier; tackle Tier 1 first.

---

## Tier 1 — High impact, kills the "two apps" feeling

### 1a. RecordExerciseModal picker should show per-student status

**File:** `components/sessions/RecordExerciseModal.tsx`

The picker today is a flat list of every item in the checktable — no signal that "this student already did 607A" or "this is already assigned for next week". A tutor can record duplicates without noticing.

**Do:**
- Look up the per-student status map for items in the active checktable (same logic as `statusByItemId` in `ChecktableApp.tsx`)
- Show a small status dot or chip per row: green=done, amber=assigned, neutral=untouched
- Add a filter toggle in the picker header: `All | Pending | Untouched | Hide done`
- Keep the existing search

**Acceptance:** Open the HW modal for a student with done items — those rows render with the done indicator; flipping "Hide done" removes them from the list.

### 1b. Optional: List ↔ Grid view toggle inside the modal

Same file. Tutor mental model matches the grid more than a flat list. Consider a `List | Grid` toggle in the modal header that swaps the picker between the current list and a reused `<ChecktableGrid>` with `onItemClick={submit}`. Skip this if 1a alone closes the gap — the per-student status colors are the bigger win.

### 1c. Print-batch cross-student bug + session-scoped print

**Files:** `components/checktable/ChecktableApp.tsx`, `components/checktable/PrintTray.tsx`

**Bug today:** `printBatchIds` is local state on `ChecktableApp` and persists when you switch students. The tray header says "for {newStudent}" but the items inside were added for the previous student. Chips on the new student's grid show as "in print batch" too.

**Two fixes — pick one:**

- **Fix A (small):** Lift `printBatchIds` into the store, keyed by `studentId`. Switching students shows the right batch. Clear on print.
- **Fix B (bigger, better workflow):** Print batch is session-scoped. Add a "Prep print batch" button on each `SessionCard`. Opening from a session sets the tray context to `{sessionId, studentId}`. "Print" creates HW assignments for that session in one shot — closes the audit's deferred item #6.

Recommendation: ship Fix A first (kills the bug in a few minutes), evaluate Fix B as a follow-up.

**Acceptance:** Add 3 items for student A, switch to student B → batch is empty for B. Or with Fix B: open from a session card → tray says "for Wed 4pm — Chan Ho Yin" → print → 3 HW records appear on that session.

### 1d. Grid filter on the checktable

**Files:** `components/checktable/ChecktableGrid.tsx`, `components/checktable/ChecktableApp.tsx`

34 chapters × ~6 series doesn't scale. The grid needs to focus.

**Do:** Above the grid, add filter chips: `All | Pending (assigned-not-done) | Untouched | Section: 上學期 / 下學期 / 補充`. When a filter is active, hide rows with no matching items. Counts in each filter chip if cheap.

**Acceptance:** Click "Pending" — only chapters containing assigned-not-done items render.

---

## Tier 2 — Medium

### 2a. HistoryDrawer grouping

**File:** `components/checktable/HistoryDrawer.tsx`

Pure chronological today. Add a select `By date | By chapter | By session` and group rows accordingly. Lets the tutor answer "what has Chan done in ch.6?" without scrolling.

### 2b. "Next suggested item" per student on session rows

**Files:** `components/sessions/SessionsApp.tsx` (consume), `lib/store/PrimaryStore.tsx` (new selector)

Add a store selector `nextSuggestedItem(studentId, checktableId)`:
- Find the lowest-numbered chapter that has any assignment for this student
- Within that chapter, return the first item with no assignment yet
- Fall back to the next chapter's first item if the current chapter is fully covered

In each session row, render it as a small chip: `Next: 608A · Ch.6 圓周`. Probably replaces or sits next to the "Recent" chips. If you swap, move the recent-covered chips into the HW modal instead, where they actually prevent double-assigns.

### 2c. MakeupModal actually creates a makeup session

**File:** `components/sessions/MakeupModal.tsx`, `lib/store/PrimaryStore.tsx`

Today `onConfirm` just alerts. Wire it to:
1. Create a new `ClassSession` with `isMakeup: true`, `rescheduledFrom: "<source session label>"`, and that one student
2. Mark the source session student's `attendance: "makeup"` (status already exists, currently a dead-end pill)
3. Replace the alert with inline confirmation linking to the new makeup session via `/sessions?session=<id>`

Suggested slots in mock data (`makeupSuggestions` in `lib/mock-data/sessions.ts`) need a `sessionId` or template so the new session inherits class/room/tutor.

### 2d. Tutor-note badge on assigned chips

**File:** `components/checktable/ItemChip.tsx`

If the assignment has `tutorNote`, render a small dot or asterisk in the chip's corner. Extend the existing `title=` to include the note so hover surfaces it. The note's stored on the assignment, not the item, so ChecktableGrid will need to pass `tutorNote` through (or pass a lookup map).

---

## Tier 3 — Low (sweeps)

- **HW-load warning** in `AssignDialog` when student `hwLoad === "Little"` and they'd have ≥3 open assignments after this one. Currently the load chip is shown but inert.
- **Picker reset between records** in `RecordExerciseModal` — clear `pageRange` and `note` after each Record click so they don't silently inherit.
- **Filter bar counts** in `SessionsApp` — `Today (3) · Upcoming (4) · Past`.
- **Attendance "Makeup" pill** — until 2c lands, visually mark it as a dead-end state instead of a normal option.
- **Session card density** — collapse "Recent" chips into the HW modal (per 2b decision) and move the "Open checktable" link into a row-level action cluster on the right.

---

## Architecture pointers

- **All shared state lives in `PrimaryStoreProvider`** (`lib/store/PrimaryStore.tsx`). When adding selectors, follow the existing pattern: data on the value, ref-backed callbacks for actions, `useMemo` keyed on the data dependencies. Refs are how `recordExercise`/`removeExercise` read fresh state without becoming new function identities each render.
- **Use `itemMeta`** anywhere you're tempted to re-walk `checktable.sections[].chapters[].cells[].items` + `supplementary`. There are still 1–2 spots in `RecordExerciseModal.tsx` doing it the old way — switch them while you're there.
- **`DEMO_DAY`** (`lib/mock-data/sessions.ts`) and **`DEMO_NOW`** (`lib/mock-data/parent-contacts.ts`) are the pinned "today" anchors. Do not introduce new `"2026-05-19"` literals.
- **`sessionLabel(sessionId)`** from the store is the canonical "human-readable session label" formatter. Reuse rather than reimplementing date formatting.

---

## Where to start

Order optimized for visible impact per commit:

1. **1a — picker shows per-student status** (one file, immediate "same app" feel)
2. **1c Fix A — print batch cross-student bug** (kills the silent bug)
3. **1d — grid filter** (makes the checktable usable beyond a demo)
4. **2b — next-suggested-item** (gives the page a recommendation narrative)
5. **1c Fix B** if time allows; otherwise defer
6. Continue Tier 2, then Tier 3 as polish

Each item = one commit. Don't bundle.

---

## Demo script after Tier 1 lands

1. Open `/sessions`, click HW on a student in tonight's session
2. Picker shows green dots on items they've already done; flip "Hide done"
3. Record 2 items; close modal; recorded chips appear
4. Click "Open checktable" link on the same row → that student's grid is preselected, chips reflect what was just recorded
5. Use grid filter to show "Pending only" — just their open work
6. Add 3 items to print batch; switch to another student — batch is per-student (Fix A) or scoped to a session (Fix B)
7. Open history drawer; click a session label → returns to `/sessions` with that session ring-highlighted
