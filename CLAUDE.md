Do NOT npm run build and npm run dev unless the user told you to do so. The changes are hot reloaded on the server run on my end so there is no need to do that.

Do NOT include Claude Code Footer in commit message.

## Deployment

- **Auto-deploy**: Merging to `main` triggers automatic deployment to Cloud Run
- **Manual deploy**: Use `/deploy` skill for manual deployments
- **Rollback**: Use `/rollback` skill to revert to previous version
- Production URLs:
  - Backend: https://tutoring-backend-284725664511.asia-east2.run.app
  - Frontend: https://csm.mathconceptsecondary.academy

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

## Custom Domain Setup (Cloudflare)

Custom domains `csm.mathconceptsecondary.academy` and `csm-pro.mathconceptsecondary.academy` are routed through Cloudflare Workers because Cloud Run rejects requests with non-matching Host headers.

**Architecture:**
```
User → Cloudflare (csm.domain) → Worker (rewrites Host header) → Cloud Run
```

**Cloudflare Worker:** `cloud-run-proxy`
- Location: dash.cloudflare.com → Workers & Pages → cloud-run-proxy
- Code rewrites Host header to `tutoring-frontend-284725664511.asia-east2.run.app`
- Routes: `csm.mathconceptsecondary.academy/*` and `csm-pro.mathconceptsecondary.academy/*`

**Limits:**
- Free tier: 100,000 requests/day (only frontend pages, not API calls)
- Check usage: Workers & Pages → cloud-run-proxy → Metrics
- If exceeded: Upgrade to $5/month for 10M requests/month

**DNS (Cloudflare):**
- CNAME `csm` → `tutoring-frontend-284725664511.asia-east2.run.app` (Proxied)
- CNAME `csm-pro` → `tutoring-frontend-284725664511.asia-east2.run.app` (Proxied)
- SSL/TLS mode: Full
