Do NOT npm run build and npm run dev unless the user told you to do so. The changes are hot reloaded on the server run on my end so there is no need to do that.

Do NOT include Claude Code Footer in commit message.

## Deployment

- **Auto-deploy**: Merging to `main` triggers automatic deployment to Cloud Run
- **Manual deploy**: Use `/deploy` skill for manual deployments
- **Rollback**: Use `/rollback` skill to revert to previous version
- Production URLs:
  - Backend: https://tutoring-backend-284725664511.asia-east2.run.app
  - Frontend: https://csm.mathconceptsecondary.academy

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

## CI/CD Pipeline (GitHub Actions → GCP)

**Authentication:** Workload Identity Federation (no secrets stored in GitHub)

**Workload Identity Pool:**
- Pool: `github-pool`
- Provider: `github-provider`
- Project: `csm-database-project` (284725664511)

**Service Account:** `284725664511-compute@developer.gserviceaccount.com`

**Required IAM Roles on the service account:**

| Role | Purpose |
|------|---------|
| `roles/cloudbuild.builds.builder` | Submit Cloud Build jobs |
| `roles/serviceusage.serviceUsageConsumer` | Use GCP services |
| `roles/iam.serviceAccountUser` (on self) | Cloud Build impersonation |
| `roles/run.admin` | Deploy to Cloud Run |
| `roles/artifactregistry.writer` | Push Docker images |
| `roles/storage.objectAdmin` | Upload build sources |

**To grant permissions (if needed):**
```bash
export CLOUDSDK_PYTHON_SITEPACKAGES=1  # Faster on WSL

# Project-level roles
gcloud projects add-iam-policy-binding csm-database-project \
  --member="serviceAccount:284725664511-compute@developer.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"

# Service account impersonation (required for Cloud Build)
gcloud iam service-accounts add-iam-policy-binding \
  284725664511-compute@developer.gserviceaccount.com \
  --project=csm-database-project \
  --member="serviceAccount:284725664511-compute@developer.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## Custom Domain Setup (Cloudflare)

Custom domains `csm.mathconceptsecondary.academy` and `csm-pro.mathconceptsecondary.academy` are routed through Cloudflare Workers because Cloud Run rejects requests with non-matching Host headers.

**Architecture:**
```
User → Cloudflare (csm.domain) → Worker → /api/* → Cloud Run Backend
                                        → /*     → Cloud Run Frontend
```

**Cloudflare Worker:** `cloud-run-proxy`
- Location: dash.cloudflare.com → Workers & Pages → cloud-run-proxy
- Routes `/api/*` to `tutoring-backend-284725664511.asia-east2.run.app` (backend)
- Routes everything else to `tutoring-frontend-284725664511.asia-east2.run.app` (frontend)
- Sets `X-Forwarded-Host` header with the original custom domain hostname
- Uses `redirect: 'manual'` to pass through 302 redirects (important for OAuth flow)

**Why the Worker proxies API calls:**
- Auth cookies must be first-party (same domain as the page) to avoid third-party cookie blocking
- Without the proxy, cookies set by the backend (different domain) are blocked by modern browsers
- The Worker makes the cookie appear as first-party by routing both frontend and API through the same domain

**Cloud Run direct access (dev testing):**
- `next.config.ts` has production rewrites that proxy `/api/*` to the backend
- This allows using the Cloud Run frontend URL without Cloudflare (saves free tier quota)
- OAuth works if the Cloud Run frontend callback URI is registered in Google OAuth console

**Limits:**
- Free tier: 100,000 requests/day (frontend pages + API calls through Worker)
- Check usage: Workers & Pages → cloud-run-proxy → Metrics
- If exceeded: Upgrade to $5/month for 10M requests/month

**DNS (Cloudflare):**
- CNAME `csm` → `tutoring-frontend-284725664511.asia-east2.run.app` (Proxied)
- CNAME `csm-pro` → `tutoring-frontend-284725664511.asia-east2.run.app` (Proxied)
- SSL/TLS mode: Full

**Google OAuth Authorized Redirect URIs:**
- `https://csm.mathconceptsecondary.academy/api/auth/google/callback`
- `https://csm-pro.mathconceptsecondary.academy/api/auth/google/callback`
- `https://tutoring-frontend-284725664511.asia-east2.run.app/api/auth/google/callback`
- `http://localhost:8000/api/auth/google/callback` (development)
