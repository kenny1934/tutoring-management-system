Do NOT npm run build and npm run dev unless the user told you to do so. The changes are hot reloaded on the server run on my end so there is no need to do that.

Do NOT include Claude Code Footer in commit message.

## Deployment

- **Auto-deploy**: Merging to `main` triggers automatic deployment to Cloud Run
- **Manual deploy**: Use `/deploy` skill for manual deployments
- **Rollback**: Use `/rollback` skill to revert to previous version

## Versioning & Releases

Releases are cut by hand. `release-please` used to run here and was retired on
2026-09-05, after 2.0.128: every release from 2.0.115 onward had been written
manually anyway, because the notes it generated from commit subjects were not
the user-facing sentences this changelog wants.

- **Current version**: `.release-please-manifest.json`. Keep the filename, the
  tool is gone but `deploy.yml` reads the version straight out of this file and
  so does the `/deploy` skill and the README badge.
- **Changelog**: `CHANGELOG.md` at repo root, parsed into
  `webapp/frontend/lib/changelog-data.ts`. **After editing CHANGELOG.md, always
  regenerate by running `cd webapp/frontend && npx tsx scripts/parse-changelog.ts`
  and commit both files together.**
- **Release flow**, all five steps in one commit plus a tag:
  1. Bump the version in `.release-please-manifest.json`.
  2. Add the entry at the top of `CHANGELOG.md`, following the shape of the one
     below it. Write user-facing sentences about what changed for the reader,
     not commit subjects, and never name a table, a column or a component.
  3. `cd webapp/frontend && npx tsx scripts/parse-changelog.ts`
  4. Commit all three files together as `chore(release): X.Y.Z`.
  5. `git tag vX.Y.Z && git push origin main vX.Y.Z`. The tag is what makes the
     release findable later, so do not skip it.
- **Commit convention**: still conventional commits (`feat:`, `fix:`, `perf:`,
  `refactor:`), now purely so the log reads well. Nothing parses them any more,
  and no commit message reaches the changelog on its own.
- **Frontend version**: passed via the `NEXT_PUBLIC_APP_VERSION` build arg
  (Dockerfile, then cloudbuild.yaml, then deploy.yml).
- **What's New page**: `/whats-new` reads `changelog-data.json` and marks the
  version as seen in localStorage.

## Branch Workflow

- Create feature branches: `git checkout -b feature/description`
- All changes require PR to `main`
- Tests must pass before merge
- Branch naming: `feature/xxx`, `fix/xxx`, `hotfix/xxx`

## Common Commands

- Run backend tests: `cd webapp/backend && pytest tests/ -v`
- Run frontend tests: `cd webapp/frontend && npm run test:run`
- Run E2E tests: `cd webapp/frontend && npm run test:e2e`
- Create PR: `gh pr create --fill`
