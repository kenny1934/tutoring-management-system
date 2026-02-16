Do NOT npm run build and npm run dev unless the user told you to do so. The changes are hot reloaded on the server run on my end so there is no need to do that.

Do NOT include Claude Code Footer in commit message.

## Deployment

- **Auto-deploy**: Merging to `main` triggers automatic deployment to Cloud Run
- **Manual deploy**: Use `/deploy` skill for manual deployments
- **Rollback**: Use `/rollback` skill to revert to previous version

## Versioning & Releases

- **Versioning**: Semantic versioning via `release-please` (Google's GitHub Action)
- **Current version**: Tracked in `.release-please-manifest.json`
- **Changelog**: `CHANGELOG.md` at repo root, parsed into `webapp/frontend/lib/changelog-data.ts` at build time. **When manually updating CHANGELOG.md, always regenerate by running `cd webapp/frontend && npx tsx scripts/parse-changelog.ts` and commit both files together.**
- **Commit convention**: Use conventional commits (`feat:`, `fix:`, `perf:`, `refactor:`) — release-please uses these to generate changelog entries and determine version bumps
- **Release flow**:
  1. Merge PRs to `main` as normal (auto-deploys continue as before)
  2. `release.yml` automatically creates/updates a Release PR accumulating changes
  3. When ready to cut a release, merge the Release PR → creates git tag + GitHub Release + updates CHANGELOG.md
  4. Next deploy picks up the new version tag and bakes it into the frontend as `NEXT_PUBLIC_APP_VERSION`
- **Frontend version**: Passed via `NEXT_PUBLIC_APP_VERSION` build arg (Dockerfile → cloudbuild.yaml → deploy.yml)
- **What's New page**: `/whats-new` — reads `changelog-data.json`, marks version as seen in localStorage

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
