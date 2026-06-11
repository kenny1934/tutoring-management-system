# Cloudflare edge security: OriginGuard + Access

This documents the rollout for two related hardening features added to the
backend:

1. **OriginGuard** — refuses `/api/*` traffic that did not transit Cloudflare,
   closing direct access to the backend `*.run.app` URL.
2. **Cloudflare Access** on the prospect / buddy-tracker branch tools — replaces
   the weak branch-phone PIN as the real perimeter with Google SSO restricted to
   `@mathconcept.com` and `@mathconceptsecondary.academy`.

## Why

The backend Cloud Run service is publicly addressable. Hitting it directly
bypasses Cloudflare entirely, which defeats:

- **per-IP rate limiting** — a direct caller sets `CF-Connecting-IP` itself and
  rotates it for unlimited request budget (verified: rotating the header gave 0
  throttling vs. a fixed IP throttling at the configured limit);
- the **Cloudflare WAF / bot** rules;
- any **Cloudflare Access** policy (Access only runs at the edge).

OriginGuard makes the edge non-bypassable, which in turn makes edge Access a
trustworthy gate and lets the backend safely trust the `Cf-Access-*` headers.

## Code behaviour (already merged, fail-open)

All three switches are **no-ops until their env vars are set**, so the backend
can ship before any infra change:

| Env var | Effect when set |
| --- | --- |
| `CF_ORIGIN_SECRET` | `/api/*` requests without `X-Origin-Verify: <secret>` → `403 Forbidden`. Health checks (`/`, `/health`) and CORS preflight are exempt. |
| `CF_ACCESS_REQUIRED` | Public `/api/prospects*` and `/api/buddy-tracker*` (excluding `/admin` sub-routes) require `Cf-Access-Authenticated-User-Email` in an allowed domain → else `403`. |
| `CF_ACCESS_ALLOWED_DOMAINS` | Comma-separated allow-list (default `mathconcept.com,mathconceptsecondary.academy`). |

`is_office_ip` was also fixed to read `CF-Connecting-IP` (unspoofable) instead of
the left-most `X-Forwarded-For`.

## Rollout order (do NOT reorder — wrong order causes an outage)

### Phase 1 — OriginGuard

1. **Generate a secret:** `openssl rand -hex 32`.
2. **Update the Cloudflare Worker** (`cloud-run-proxy`) to inject the header on
   every request it forwards to the backend, and to keep forwarding the
   `Cf-Access-*` headers it receives:
   ```js
   // when proxying /api/* to the backend origin:
   const headers = new Headers(request.headers);
   headers.set("X-Origin-Verify", env.CF_ORIGIN_SECRET); // Worker secret/binding
   return fetch(backendUrl, { method: request.method, headers, body: request.body });
   ```
   Add `CF_ORIGIN_SECRET` as a Worker secret (`wrangler secret put CF_ORIGIN_SECRET`).
   Deploy the Worker.
3. **Verify the header arrives** (backend still fail-open, so nothing is blocked
   yet): a normal request via `https://csm.mathconceptsecondary.academy/api/holidays`
   should still work.
4. **Set the backend env var** and redeploy the backend:
   ```
   gcloud run services update tutoring-backend --region asia-east2 \
     --update-env-vars CF_ORIGIN_SECRET=<secret>
   ```
5. **Verify enforcement:**
   - Direct: `curl -s -o /dev/null -w '%{http_code}' https://tutoring-backend-284725664511.asia-east2.run.app/api/holidays` → **403**.
   - Via Cloudflare: `…/api/holidays` via `csm.mathconceptsecondary.academy` → **200**.

   > Note: the `next.config.ts` "direct frontend Cloud Run" fallback for `/api`
   > stops working after this — that path bypasses Cloudflare and is exactly what
   > we are closing. Real users go through `csm*.mathconceptsecondary.academy`.

### Phase 2 — Cloudflare Access on the prospect tool

1. **Zero Trust → Access → Applications → Add (Self-hosted).** Create the
   application covering both the page and its API:
   - **Page:** `csm.mathconceptsecondary.academy/summer/prospect` (and `csm-pro…`
     if branch staff use it there).
   - **API:** `csm.mathconceptsecondary.academy/api/prospects` and
     `…/api/buddy-tracker` (path = `/api/prospects*`, `/api/buddy-tracker*`).
   - **Policy:** *Allow* — Selector **Emails ending in** `@mathconcept.com`
     **OR** `@mathconceptsecondary.academy`. Identity provider: Google (or OTP).
2. **Exempt the admin sub-routes** so CSM admins using the main app are not
   forced through Access: add a second, more-specific application for
   `/api/prospects/admin*` and `/api/buddy-tracker/admin*` with a **Bypass**
   policy (Everyone). Cloudflare matches the most specific path first. (The
   backend already exempts `/admin` from the Access check and keeps cookie auth.)
3. **Enable backend enforcement** (defence in depth) and redeploy:
   ```
   gcloud run services update tutoring-backend --region asia-east2 \
     --update-env-vars CF_ACCESS_REQUIRED=true,CF_ACCESS_ALLOWED_DOMAINS=mathconcept.com,mathconceptsecondary.academy
   ```
4. **Verify:**
   - Logged-out / wrong-domain user hitting `/summer/prospect` → Access login,
     then denied unless on an allowed domain.
   - `curl …/api/prospects?branch=MAC&year=2026` with no Access cookie → **403
     "Cloudflare Access authentication required"**.
   - Branch staff on an allowed-domain Google account → page + list work as
     before (branch PIN still applies for branch scoping).

## Notes

- The branch **PIN is intentionally kept** for branch scoping; it is no longer
  the security perimeter (Access is), so its low entropy is no longer a concern.
- If branch staff do **not** have allowed-domain Google accounts, use Cloudflare
  Access **one-time PIN** to an allow-list of their email addresses instead of a
  domain rule.
