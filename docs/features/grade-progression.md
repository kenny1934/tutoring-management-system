# Annual grade progression

Stored grades on `students.grade` advance one step on Sept 1 each year
(P6 → F1 → … → F6 → Graduated). Between the school year ending and Sept 1
the badge renders "Pre-Fx" so tutors know the next-year curriculum to
assign without flipping the underlying value early.

## Pieces

- **Backend constants & helpers** — `webapp/backend/utils/grades.py`
  (`PROMOTE_MAP`, `TARGET_TO_PRE_GRADE`, `display_grade`, `resolve_pre_grade_window`).
- **Frontend mirror** — `webapp/frontend/lib/grade-utils.ts` plus the
  `useSummerPreGradeWindow` hook (`webapp/frontend/lib/hooks/`).
- **Promotion endpoint** — `POST /api/admin/promote-grades` (admin cookie
  OR `X-Cron-Secret` matching `GRADE_PROMOTION_CRON_SECRET`). Idempotent
  via `students.last_promoted_year`.
- **Standalone script** — `webapp/backend/scripts/promote_grades.py` for
  one-off runs against Cloud MySQL.
- **Pre-grade window endpoint** — `GET /api/summer/pre-grade-window`
  returns `{start, end}` from the active `SummerCourseConfig`. Defaults to
  `(course_start_date, Aug 31 of course year)` unless
  `pre_grade_window_start/end` are set explicitly via the admin editor.

## Data migration

Migration `116_grade_progression.sql` adds:

- `students.last_promoted_year INT NULL` (existing rows backfilled to 2025
  so the first scheduled run on 2026-09-01 promotes everyone exactly once).
- `summer_course_configs.pre_grade_window_start/end DATE NULL` (override
  for the default window).

## Cloud Scheduler setup

Run the promotion at 00:00 Asia/Hong_Kong on Sept 1 each year. Mirrors the
existing `summer-marketing-snapshot` job — same Cloudflare custom-domain
URL, same `X-Cron-Secret` header pattern.

```bash
export CLOUDSDK_PYTHON_SITEPACKAGES=1

# 1. Generate a shared secret and set it on the backend Cloud Run service.
SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

gcloud run services update tutoring-backend \
  --region asia-east2 --project csm-database-project \
  --update-env-vars "GRADE_PROMOTION_CRON_SECRET=$SECRET"

# 2. Create the scheduler job (via the Cloudflare-fronted domain, matching
#    summer-marketing-snapshot).
gcloud scheduler jobs create http promote-grades-yearly \
  --location asia-east2 --project csm-database-project \
  --schedule "0 0 1 9 *" \
  --time-zone "Asia/Hong_Kong" \
  --uri "https://csm.mathconceptsecondary.academy/api/admin/promote-grades" \
  --http-method POST \
  --headers "X-Cron-Secret=$SECRET,Content-Type=application/json" \
  --message-body "{}"
```

To preview before the real run:

```bash
curl -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}' \
  https://csm.mathconceptsecondary.academy/api/admin/promote-grades
```

## Manual one-off

If Scheduler hasn't been configured (or you need to rerun with a custom
year), use the script via the backend venv:

```bash
cd webapp/backend
./venv/bin/python scripts/promote_grades.py --dry-run   # preview
./venv/bin/python scripts/promote_grades.py             # apply
./venv/bin/python scripts/promote_grades.py --year 2027
```

## Display logic recap

- Outside the window: badge shows raw `student.grade` (e.g. `F1C`).
- Inside the window: badge shows `Pre-{next_grade}` (e.g. `Pre-F2C`).
  Color is still keyed on the stored grade so the visual grouping stays
  consistent until promotion fires.
- F6 students inside the window keep showing `F6` — `Pre-Graduated`
  isn't a useful tutor signal.

## Summer create-student translation

When admin creates a Student record from a `SummerApplication`, the
application's `grade` is the *target* (post-summer) grade. Before Sept 1
of `config.year` (the promotion date) the create-student flow back-translates:

- target `F1` → store `P6`
- target `F2` → store `F1`
- target `F3` → store `F2`
- target `F4` → store `F3`

On or after Sept 1 the target IS the current grade — pass through.

The cutoff is intentionally wider than the badge display window: a pre-F1
summer applicant is currently in P6 in May, June, July, August — not just
during the summer course itself.
