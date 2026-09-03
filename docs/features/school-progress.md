# School Progress

School Progress is the part of the app that knows which maths topic each
school's classes are on in each week of the school year, and uses that to
suggest worksheets while a tutor sets a session's exercises. It also gives
the Curriculum page, where anyone can see a school's year laid out week by
week, compare schools, browse the topic map, and open a revision pack for an
upcoming test.

Branch: `feature/rev-paper-archive`, which carries `feature/curriculum-suggestions`
underneath it. The data has been live in production since July 2026; the
interface ships with the merge of this branch. It covers F1 to F3 only.

The name matters. In copy the feature is "School Progress", and the place
tutors meet it is "School Progress while setting a session's exercises".
Never call that the exercise window.

---

## Locked decisions

These came from Kenny during the build and should not be relitigated without
asking him.

| Decision | Detail |
| --- | --- |
| F1 to F3 only | F4 and above have sparse evidence and no coded courseware series. Senior sessions show one muted line saying the feature covers F1 to F3 for now. |
| The vocabulary is an open set | Chapters from the two courseware series form the spine, and "extension" concepts cover topics with no junior chapter code (remainder theorem, sets, sequences, travel graphs, circles for international schools). New spaces and concepts are data, not code. |
| Series is not language | The MAS series follows the 人教 order; the HK series follows the Hong Kong order and exists in two generations with shifted codes. A file's language is an attribute of the file, not of the topic. Concepts carry bilingual names. |
| School-specific timelines | No borrowing between schools that share a textbook. The textbook column in the sheets is unreliable. |
| Explicit confirmations only | Assigning a suggested worksheet does not record an observation. Only a tutor's one-tap confirm or correction does. The assignment log is harvested by the backfill instead, at a lower confidence. |
| Revision does not move the timeline | Observations flagged as revision are kept but left out of the consensus that drives the timeline and the suggestions. |
| Revision or New Topic is asked, never assumed | During a test window a confirm tap opens a two-answer question before anything is written. An earlier section-wide "Test prep" toggle silently recorded corrections as revision and was removed. |
| Labels follow the school's stream | A Chinese-stream school sees Chinese topic names, an English-stream school English ones; bilingual names appear only where there is no school context. There is no stream picker: each school and grade resolves to its dominant stream. |
| "Covers" versus "Likely covers" | A revision paper's topics say "Covers" only when they come from the test's recorded scope or a manual mapping. Anything estimated from a filename or a similar test says "Likely covers". |
| Tailored papers lead the pack | In a revision pack, papers tutors made for that test come first, then papers from similar tests, then the per-topic worksheets. Newest year first, because newer folders track the current syllabus and edition. |
| Evidence only in the atlas | Earlier grades are painted from the same cohort's own recorded history, never assumed covered. |
| No timeline evidence from dated paper filenames | A worksheet's date lags the teaching by an unknowable offset, so the 中學參考教材 filenames are used for the content map only. Do not revive without new reasoning. |
| AI passes are reviewed before they write | Every AI mapping step writes a review file first and only writes on a second, explicit run. |

---

## The two layers

Everything rests on two layers of data. A topic-to-content map says which
worksheets teach which topic and never changes with time. School timelines
say which topic each school and grade was on in each week of each year. A
suggestion is the timeline predicting a topic and the content map ranking
worksheets for it.

### Vocabulary

`curriculum_concepts` holds one row per topic: `name_en`, `name_zh`, `kind`
(chapter, subtopic or extension), `grade`, `strand` (number, algebra,
geometry, data) and `atlas_grade` for the extension topics that have no grade
of their own, plus `display_order`. Names are the identity: the seed resolves
concepts by name, so re-seeding after a name change would create duplicates.

`concept_code_aliases` attaches codes to concepts per code space: `MAS`,
`HK_OLD`, `HK_NEW`, `SM` (summer) and `SS` (senior). One HK_OLD code can
alias two concepts where the newer edition split a chapter. Bilingual names
collide across series (MAS 704 and HK 704 both read 一元一次方程), so lookups
disambiguate through the aliases, never by name alone.

`concept_links` holds curated relations: `equivalent` links the same chapter
across the two series so pacing comparisons line up, and `prerequisite` edges
draw the atlas. Both were seeded from reviewed JSON, not authored by AI.

### Content map

`courseware_concepts` maps a file to a concept with a `role` (master, exercise,
quiz, mc, revision, question_bank, past_paper, mock), a `lang`, a `source`
(code, filename_term, ai, manual) and a confidence. It stores three path
forms. `file_path` is the alias form, such as `Center\Courseware (Eng)\...`,
which is what a suggestion returns because it drops straight into an
exercise's `pdf_name` and works with the existing preview plumbing.
`match_path` is the same path with the alias or drive prefix stripped, used
as the join key. `file_basename` is the fallback key.

Drive letters are never trusted. Each share is recognised by its root folder:
`Courseware (Chi|Eng)\` is the Center share and `Secondary\` is the secondary
courseware developer share. Migration 124 rewrote nineteen thousand historic
`session_exercises` paths into the alias form, keeping the originals in
`session_exercises_path_backup`.

### Timelines

`school_topic_observations` is one piece of evidence: school, grade,
`lang_stream`, `academic_year`, `week_number`, `concept_id`, `source`,
`confidence`, `is_revision` and a `source_ref` that says where it came from.
Sources and their confidence:

| Source | What it is | Confidence |
| --- | --- | --- |
| `prep_folder` | A worksheet filed in a weekly prep folder on the V: drive under a school's name | 0.90 for the current school year, 0.10 less per year older, floor 0.60 |
| `assignment` | A worksheet actually assigned to a student of that school and grade in that week | 0.70 |
| `sheet` | A cell in the curriculum sheet a tutor filled in | 0.85 for a mechanical match, 0.75 for a fuzzy one, 0.55 to 0.75 for an AI answer |
| `exam_scope` | A topic named in a test's scope (kept on the exam tables, see below) | per line |
| `tutor_confirm` | A tutor's one-tap confirm or correction in the app | 1.0 for a confirm, 0.7 for accepting a suggestion (unused in v1) |

Two views turn evidence into a timeline. `school_week_topic_consensus` ranks
the concepts seen in each school-grade-week by summed confidence, with
revision rows excluded. `school_concept_pacing` gives each school-grade-topic
a mean week and a spread across the years observed, which draws the pacing
bands and fills in when a year has no direct evidence.

### Exams and revision papers

`exam_scope_concepts` holds AI and manual mappings from a test's description
lines to concepts. Mechanical matches are recomputed on every read and never
stored. Rows are keyed by the description line they came from, so an edited
description retires its own stale rows.

`exam_rev_papers` is the archive of tailor-made revision papers found in the
weekly folders, one row per paper with its answer key and source variants
folded into `variant_paths`. Each paper links to the calendar event it was
made for (same school, grade and year, folder week within two weeks of the
test) with a `link_confidence`, and carries a `scope_source` saying where its
topic index came from: `event` copies the linked test's scope, `code` reads a
chapter code from the filename, `ai` is the filename pass, `proxy` borrows
the scope of the same school and grade's test in another year, and `none`
means no index. `exam_rev_paper_concepts` holds the index itself.

### The calendar

`academic_weeks` turns a date into a school-year week number and back. Week 1
is the week of 1 September, matching how the centre numbers its weekly
folders, and each year is seeded by its own migration (005 for 2025-26, 167
for 2026-27). A session date outside the table gives no suggestions and no
"Now" marker, so the next year's rows have to land before September.

### Migrations

All of these were applied to production before the merge and need no
re-running: 123 (vocabulary, content map, observations; drops the old
`curriculum_current_week` view), 124 (path normalisation), 125 (views), 126
(concept links), 127 (strands and atlas grade), 128 and 129 (exam scope
mappings and their key), 167 (the 2026-27 calendar) and 168 (the revision
paper archive, applied under its original number 130 before main took that
number for something else).

---

## The pipeline

The scripts live in `database/curriculum/` and run from the repo root with the
backend venv. `_common.py` gives them the repo paths, the backend `.env`, a
database connection, the Gemini client and the shared school canonicaliser.
Their data lives under `private/curriculum_data/`, which is gitignored and
reached from a worktree through a symlink.

### One-off seeds and fills

`seed_concepts.py` loads the vocabulary from `concept_seed.json`;
`fill_concept_names.py` fills the bilingual names; `seed_concept_links.py`
and `seed_concept_prereqs.py` load the curated links; `fill_concept_strands.py`
sets strands and atlas grades; `map_courseware_eng.py` hand-maps the English
materials folder; `apply_school_aliases.py` re-applies the school name fixes
to existing rows. All are idempotent and were run once.

### Backfills

`backfill_courseware.py` builds the content map from the two drive tree
snapshots and the assignment log. `backfill_observations.py` rebuilds the
prep folder, assignment and sheet observations and never touches tutor
confirms. It shifts each student's current grade back by the number of
school years since the session, because grades move every September.
`backfill_rev_papers.py` rebuilds the paper archive from the weekly folders,
preserving AI and manual index rows, and deletes rows for files no longer in
the tree.

### AI passes

Four scripts send residual strings to Gemini and share one shape: a plain run
classifies and writes a review file with per-batch checkpoints, and only a
run with `--write` stores the result. `ai_map_reference.py` classifies the
scanned school materials; `ai_map_exam_scopes.py` resolves test description
lines the parser could not, with the school's already-resolved lines as
calibration; `ai_map_rev_papers.py` indexes revision papers from their
filenames; `ai_map_sheet_strings.py` resolves curriculum sheet entries.

### The nightly re-scan

`rescan_weekly_folders.py` refreshes everything that depends on the V: drive.
It lists the drive through PowerShell, keeps the four roots the snapshot has
always covered (Finalised, Summer Course, 題庫 and 題庫 (分章節); Archived,
教案 and 講義 stay out because they would pollute the timelines), compares the
listing with the current snapshot and stops if any root came back empty or
more than a hundred files vanished, since the paper backfill deletes what it
no longer sees. It then writes the snapshot with a dated backup, imports the
curriculum sheet, and runs the three backfills as separate processes. Logs go
to `private/curriculum_data/rescan_logs/` with a `latest.log` link; exit 0 is
success, 2 the guard, 1 a failure.

Because a mapped drive letter only exists on the machine that mapped it, the
job runs on Kenny's Windows machine through Task Scheduler as "CSM School
Progress re-scan", daily at 23:30, in the logged-on session. The task
definition is `windows_task_rescan.xml` next to the script, with the register
command in its comment. Its path points at the checkout that holds the
script, so after this branch merges and the worktree goes, the path needs
re-pointing at the main checkout and the task re-registering.

### The curriculum sheet import

`import_curriculum_sheets.py` reads each year's "School Curriculum YYYY-YYYY"
Google Sheet through the backend's service account. The sheet must be shared
with that account as a viewer, and the sheet id goes in
`curriculum_sheets.json`. It resolves every cell with the exam-scope parser,
falls back to this pipeline's reviewed AI answers and then the July residual
maps, and writes `private/curriculum_data/sheets/sheet_<year>.json`, which the
observation backfill reads. A match that sits two grades above the tab is held
back for the AI pass, because on last year's sheet such matches were wrong two
times in three. The 2024-25 and 2025-26 sheets stay on the July import.

---

## The API

All routes live in `routers/curriculum.py` under `/api/curriculum`.

| Route | What it returns |
| --- | --- |
| `GET /suggestions?student_id&date` | Topics and ranked worksheets for a student on a date, with the tier the evidence came from, the upcoming test if any, and tailored past papers in revision mode |
| `GET /concepts` | The vocabulary with codes, strands, equivalents and prerequisite links, for pickers and the atlas |
| `GET /search?q&school&grade&...` | Topics by name or code, optionally annotated with a school's evidence, with files per topic |
| `GET /timeline?school&grade&year` | Weeks with ranked concepts and sources, pacing bands, the years available, the current week and the week dates |
| `GET /coverage` | How much evidence each school-grade-year has, for the pickers and the thin-records warning |
| `GET /exams?school&grade` | The school year's tests and exams with their parsed scope |
| `GET /revision-pack/{event_id}` | A test's scope topics with ranked worksheets, the tailored papers, and the scope lines nothing matched |
| `POST /observations` | A tutor confirm or correction; idempotent per tutor, student week, concept and action |
| `DELETE /observations/{id}` | Undo, own tutor confirms only |

Suggestion evidence comes in tiers. `exam_scope` replaces the timeline when
an upcoming test's scope parses. Otherwise `this_year` uses the consensus of
the current week and the two before it with decaying weight, `last_year`
uses the prior year around the same week, and `pacing` uses the mean week
across years. The response carries the tier and, per concept, why it was
suggested.

Worksheets for a concept are ranked by the school's own usage first, then
language match to the student's stream, then role order (which flips to
revision, quiz and mock when a test is within fourteen days), then
confidence, then global popularity, then name. Files are deduplicated on the
extension-stripped basename, preferring the PDF, and only files whose path
carries a usable alias prefix are ever suggested.

Past papers are ranked with papers made for this very test first, then the
same school and grade, then papers filed within the test's own window of the
year, then the newest year, then topic overlap. The pack shows up to twenty
and the modal section up to four.

The router caches its expensive lookups (popularity maps, the scope matcher,
school series) with a small TTL helper, keyed per process, because Cloud Run
runs several processes and nothing can invalidate across them.

### The exam-scope parser

`curriculum/exam_scope.py` turns free text into concepts and is shared by the
test-scope feature and the sheet import. Two channels: names, matched against
the bilingual vocabulary and a hand alias table, and 人教 chapter codes, which
resolve positionally for MAS-series schools only, because Hong Kong textbook
chapter numbers change by edition. When both channels fire, agreement raises
confidence and a name wins a conflict. Candidates are weighed by match
strength, then the school's series (extension topics count as the school's
own), then the text's grade within that series, so 角平分線 resolves to the F1
geometry chapter on an F1 line and to the F2 congruence property on an F2
line. English plurals fold on both sides of a match.

---

## What tutors see

### School Progress in the exercise modal

A teal collapsible below Trending, collapsed by default with the top topic
named in its header. Inside: the topics the school is likely on with an
evidence line each, ranked worksheets with preview, add and "already
assigned" badges, and a green "School is on this" button per topic. Outside a
test window the button records new teaching at once. Inside one it opens
"Revision or New Topic?" and writes only when answered. A sticky footer
offers "School is on something else?" with a topic picker for corrections.
When a test is coming up the section switches to the test's scope, shows the
tailored papers, and offers the full revision pack when the scope holds more
topics than fit.

### The Curriculum page

Timeline view is a Gantt of topics per week for one school and grade, with a
"Now" marker, jump to week by number or date, deep links, a pacing card that
can overlay up to two other schools, and a thin-records warning when the
picked school has little evidence. Atlas view is the topic map by grade and
strand with prerequisite edges, this year's progress painted on the school's
grade and earlier grades painted from the cohort's own history, plus
fullscreen, zoom, drag to pan and a minimap. A topic search sits on top, and
a Tests and exams strip lists the school year's tests with their revision
packs. Every topic opens a worksheet list, and every worksheet previews in
place.

### The session page

The curriculum tab on a session's page shows the school's weeks either side
of the session from the same timelines, replacing the old view that only
knew last year's sheet.

---

## Operations

**Checking the nightly run.** Open `private/curriculum_data/rescan_logs/latest.log`
on Kenny's machine, or read the last result in Task Scheduler.

**Running an AI pass.** Run the script without flags, read the sample it
prints, then run it again with `--write`. The sheet and exam-scope passes are
worth running about monthly once entries accumulate. To correct a sheet
answer, edit `sheets/ai_sheet_mappings.json` and re-run the importer.

**A new school year.** Add a migration with the year's `academic_weeks` rows
in the shape of 167, create the sheet from the template, share it with the
service account, add its id to `curriculum_sheets.json`, and check the first
weekly folder's date range matches week 1.

**A school the pipeline does not recognise.** Unknown labels show up as counts
in the backfill and importer stats. Add the spelling to the `FIX` table in
`private/curriculum_data/school_aliases.json` and re-run.

**Refreshing the Z: courseware tree.** The nightly job scans V: only. The
canonical courseware tree `tree_z_courseware.txt` is refreshed by hand with
the same PowerShell listing against `Z:\Courseware (Chi)` and
`Z:\Courseware (Eng)`.

---

## Known limits and backlog

- Papers whose files move into Archived at a year-end tidy-up trip the
  guard, and a forced run deletes them from the archive, index and all.
  Keeping archived papers needs a design change in the paper backfill.
- The old `session_curriculum_suggestions` view and the `school_curriculum`
  table are still in the database and can be dropped by a migration.
- F4 to F6 materials in the scanned folder are not classified.
- There is no way to flag a mislinked paper from the interface yet; curation
  exists only for topic observations.
- The equivalence links bridge the two series for pacing comparison only;
  the parser does not use them, so a school can still occasionally resolve to
  the other series' copy of a chapter.
- Edition drift inside the HK series is collapsed into one concept per
  chapter and is not visible on any surface.
