# Homework completion

Tutors mark whether homework set in an earlier lesson came back done. The
tables came from the legacy AppSheet app and sat unused for a year; this is the
build-out that makes them usable.

Branch: `feature/homework-completion`. Phases 0, 1 and 2 are done. Phase 3 is
specified below but not started.

---

## Locked decisions

These came from Kenny and should not be relitigated without asking.

| Decision | Detail |
| --- | --- |
| One four-state control | `Not Checked` / `Completed` / `Partially Completed` / `Not Completed`, as a segmented row of four buttons. The separate `submitted` flag only existed because of AppSheet limits. |
| Rating and comment both stay | Per homework item, alongside the status. Rating is emoji stars, matching `performance_rating`. |
| Rolling backlog, 3 sessions | Homework stays open across up to three sat sessions. The UI must always say which session an item came from, with date and tutor. |
| Marking lives in the rate modals | Kenny rejected auto-expanding the popover's Recap: it also holds the previous session and classwork, so opening it to reach 3 homework rows makes the popover too long for the value. Tutors already open Rate to close off a lesson. |
| Recap editors stay editable | The popover, exercise modal and session detail page keep their in-place marking. The rate modal is the primary path, not the only one. |

---

## Data model

**One completion record per assignment, not per checking session.** This is the
core change from the legacy design and everything else follows from it.

`homework_completion`
- Unique on `session_exercise_id` (was `(current_session_id, session_exercise_id)`).
- `current_session_id` records *where it was checked*, and moves if a later
  session marks it.
- `session_exercise_id` is nullable with `ON DELETE SET NULL`. `PUT /sessions/{id}/exercises`
  deletes and re-inserts exercise rows, so a cascade here silently destroyed
  completion history. The record carries its own snapshot (`pdf_name`,
  `page_start`, `page_end`, `url`, `exercise_remarks`, `assigned_date`,
  `assigned_by_tutor_id`) written at mark time, so history survives.
- `submitted` is legacy. It is written as a derived value
  (`completion_status IN ('Completed', 'Partially Completed')`) and read by
  nothing new. Safe to drop once nothing external depends on it.

`homework_files` — created by migration 013, still empty, waiting for phase 3.

`homework_to_check` (view) — decides what is open for a session:
- Looks back up to 3 *sat* sessions, excluding cancelled, no-show, rescheduled,
  sick leave and weather-cancelled from both the lookback and the `sessions_ago`
  count, plus a 60 day hard bound.
- Joins completion by `session_exercise_id` alone, so an item checked in an
  earlier session drops out of later backlogs. It still appears in the session
  where it *was* checked, via `OR hc.current_session_id = cur.id`.
- Exposes `sessions_ago`, `assigned_session_id`, `assigned_time_slot`,
  `assigned_by_tutor`, `completion_id`, `attachment_count`.

`student_homework_history` and `student_homework_statistics` are rebuilt off
`completion_status`. Nothing in the app reads them yet; they are for phase 4.

### Migrations

| # | What | State |
| --- | --- | --- |
| 154 | The rework above | Applied to prod 2026-08-10 |
| 155 | Restores `previous_session_id` and `submitted` on the view as aliases | Applied to prod 2026-08-10 |

**Migration 155 exists only because the deployed backend still selects those two
columns.** Once this branch's backend is live, a follow-up migration should drop
them from the view. Do not drop them before the deploy.

---

## API

All under `webapp/backend/routers/homework.py`.

- `PATCH /api/sessions/{session_id}/homework/{session_exercise_id}` — upsert one
  check. Body takes any of `completion_status`, `homework_rating`,
  `tutor_comments`; omitted fields are left alone. Snapshots the assignment,
  stamps `checked_by` and `checked_at`, and clears that stamp when set back to
  `Not Checked`. Rejects classwork and another student's homework.
- `GET /api/homework/to-check?session_ids=` — full detail for many sessions.
  Capped at 200.
- `GET /api/homework/counts?session_ids=` — `{session_id, total, checked}` only,
  for list badges.

`GET /api/sessions/{id}` fills `homework_completion` through the same shared
loader, `load_homework_to_check`.

### Performance, and why the endpoints are shaped this way

The view costs roughly 2.6 ms per session and scales linearly:

| Query | Cost |
| --- | --- |
| One session | ~10 ms |
| One day, ~50 sessions | ~130 ms |
| ±14 days, ~2,300 sessions | ~5.7 s |
| Unfiltered | Do not. Tens of seconds. |

So a list badge can never fetch the whole loaded list, which can hold 500
sessions (2,000 in monthly view). `HomeworkCountsProvider` collects the session
ids of badges that actually mount, debounces 60 ms, chunks at 100 and fires one
request per chunk. Rows behind "show more" cost nothing until rendered.

---

## Frontend

`components/homework/`
- `HomeworkCheckRow` — one item: name, pages, source label, the four buttons,
  stars, comment. Saves on tap, optimistic, reverts and toasts on failure.
- `HomeworkPanel` — titled group of rows with a `checked/total` chip. Renders
  nothing when the list is empty.
- `HomeworkCheckBadge` — the `HW 1/2` pill. Renders nothing at zero.
- `HomeworkCountsProvider` / `useHomeworkCounts` / `useRefreshHomeworkCounts`.

`useHomeworkToCheck(sessionIds)` in `lib/hooks.ts` fetches a whole set in one
request.

`useHomeworkMarked()` is what every marking surface passes as `onMarked`. The
same homework arrives through two endpoints, the session detail and the bulk
lookup, so a save has to reach both caches plus the badge counts. Doing that in
one hook is why a new surface needs no glue of its own.

`lib/homework-utils.ts` owns `isChecked` and the counts derived from it. Panel
chips, tab counters and badge colours all read it, and the counts endpoint
counts the same field, so nothing can disagree about whether an item is done.

Wired into:

| Surface | What shows |
| --- | --- |
| `RateSessionModal` | `HomeworkPanel` above the star rating. Primary path. |
| `BulkRateModal` | Panel per session, so a slot clears in one pass. |
| `SessionDetailPopover` | Rows inside Recap, collapsed by default. |
| `ExerciseModal` | Same, inside its Recap. |
| `BookmarkTab` (session detail page) | Rows inside the Homework section. |
| Sessions list rows, `TodaySessionsCard` | The badge. The provider must sit above the view-mode branch, or badges mount outside it and silently render nothing. |
| `LessonWideSidebar` | "To check" block per student, plus a slot counter in the header. |
| `ZenLessonSidebar` | "TO CHECK" list for the active student, and the `H` overlay to mark it. |
| `LessonExerciseSidebar` | Status tick on previous-session homework, read only. |

---

## Phase 2: wide lesson mode

Done. This was the surface Kenny most wanted.

Both wide modes fetch the whole slot in one request, via
`useHomeworkToCheck(sessions.map(s => s.id))`, and pass `useHomeworkMarked()`
straight through as `onMarked`. Switching student costs nothing.

**Normal mode.** `LessonWideSidebar`'s `StudentBlock` opens with a "To check"
section above Classwork, because settling last lesson's homework comes before
starting today's. It carries the `checked/total` chip and starts open only while
something is outstanding, since the sidebar is narrow and a student can hold six
items. The header shows the slot total, "HW 4/7", amber until it is clear.

**Zen mode.** Zen shows one student at a time, so `ZenLessonSidebar` gets a
`TO CHECK (n/m)` list with terminal glyphs (`[ ]`, `[x]`, `[~]`, `[!]`) and
`ZenHomeworkCheck` is the marking overlay, opened with `H` or by clicking the
list. It follows the print-menu idiom: the lesson's own keyboard handler owns
the cursor and keys, `j`/`k` move, `1`/`2`/`3` mark, `0` clears, anything else
closes. Marking advances the cursor, so a stack clears in one key per item. The
shortcuts are listed in `ZenLessonHelp` under "Homework".

Note: wide mode groups by student, and each student's homework comes from *their
own* earlier sessions, which for summer classes may be a different tutor's
lesson. The `assigned_by_tutor` label is doing real work there.

Adjacent, pre-existing, not fixed: `app/sessions/lesson/page.tsx` fetches the
day with `limit: 50` and filters to the slot client-side. A tutor with more than
50 sessions that day loses the tail, so a slot can render short. Unrelated to
homework, but it would hide the panel for the missing students.

## Phase 3: submissions

Not started. This is the "record what they handed in" half of the original ask.

Everything needed already exists:
- `homework_files` table: `file_path`, `file_type` (`image`/`pdf`/`document`),
  `file_name`, `file_size_kb`, `file_order`, `uploaded_at`, `uploaded_by`.
- `HomeworkFile` ORM model, and `attachment_count` already flows through the
  view, the response schema and `HomeworkCheckRow`'s paperclip.
- `services/image_storage.py` uploads to GCS with resize to 1920 and JPEG q80,
  10 MB cap. `upload_image` takes a `prefix`, so pass `homework`. Consider a
  separate bucket from `csm-inbox-images` if retention should differ.

To build:
1. `POST /api/homework/{completion_id}/files` (multipart) and
   `DELETE /api/homework/files/{file_id}`. A file can only attach to a
   completion record, so the record must exist first: create it on upload if the
   tutor attaches a photo before setting a status.
2. `homeworkAPI.uploadFile` / `deleteFile`, modelled on `messagesAPI.uploadImage`.
3. In `HomeworkCheckRow`, a camera button next to the comment icon. Use
   `capture="environment"` on the input so phones open the camera directly:
   tutors will photograph exercise books at the desk. Every marking surface
   renders that row, so this reaches all of them at once, Zen aside.
4. Thumbnails inline with a lightbox. `attachment_count` already drives the
   paperclip, so the badge work is done.
5. Zen needs its own treatment again: `ZenHomeworkCheck` would want an upload
   key, and photos do not really belong in a terminal overlay. Showing the count
   and leaving capture to the normal mode is a defensible answer.

## Phase 4: reporting

Only worth doing once phases 1 to 3 show real adoption. `student_homework_statistics`
already computes per-student checked rate, completion score, star average and
30 day recency. Feeds the student page and the parent report.

---

## Gotchas

- **MySQL commits DDL as it goes.** `run_migrations.py` wraps the run in a
  transaction, but a failure part way through cannot be rolled back. Migration
  154 died on statement 3 with two ALTERs already live. Guard index and key
  changes on `information_schema` so a migration can be replayed from a
  half-applied state, as 154 now does.
- **Dropping a composite unique key can break an unrelated foreign key** that
  was using its leftmost column as an index. That is what killed 154's first
  run: `current_session_id`'s FK was leaning on `unique_exercise_check`.
- **Prod migrations land before the code deploys.** Never rename or drop a
  column the deployed backend selects. See `docs/features/` sibling note in the
  migration 155 header.
- **Line endings.** Most files in this repo are CRLF. Scripted edits in Python
  normalise them to LF and inflate the diff to the whole file. Check
  `git diff --stat` against the lines actually changed.
- **The local dev backend runs on the fallback JWT secret**, because something
  imports `auth/jwt_handler.py` before `main.py` calls `load_dotenv()`. Tokens
  the server issues verify against itself, so browsers are fine, but minting a
  token for a manual API call needs `dev-secret-key-change-in-production`.
  Unrelated to this feature, and harmless on Cloud Run where the env var is set.

## Test baselines

`webapp/backend`: 1151 pass, of which `tests/test_homework.py` is 16.
`webapp/frontend`: 625 pass. `npx tsc --noEmit` reports 172 errors, all
pre-existing; `main` reports 173.

## Before the PR

- Changelog entry, then regenerate with
  `cd webapp/frontend && npx tsx scripts/parse-changelog.ts` and commit both.
- After the backend deploys, a migration to drop the 155 compatibility aliases.
- Consider capping `HomeworkPanel` at the 3 most recent items with an "N older"
  line: a student with 6 outstanding makes the rate modal tall.
