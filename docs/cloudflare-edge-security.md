# Cloudflare edge security: origin trust + Access

This documents two related hardening features added to the backend:

1. **Origin trust** — the backend stays directly reachable on its `*.run.app`
   URL (the frontend run.app URL is used deliberately to save Cloudflare Worker
   invocations), but it only *trusts* Cloudflare-only headers when the request
   carries the Worker's `X-Origin-Verify` secret. Login-gated data is already
   protected by the auth cookie, so direct access is not itself a hole — the
   risk was *trusting forged headers* on the direct path.
2. **Cloudflare Access** on the prospect / buddy-tracker branch tools — replaces
   the weak branch-phone PIN as the real perimeter with Google SSO restricted to
   `@mathconcept.com` and `@mathconceptsecondary.academy`.

## Why

The backend Cloud Run service is publicly addressable. A caller hitting it
directly could forge headers that only Cloudflare should set:

- **`CF-Connecting-IP`** — used for per-IP rate limiting. A direct caller can set
  and rotate it for unlimited request budget (verified: rotating the header gave
  0 throttling vs. a fixed IP throttling at the configured limit).
- **`Cf-Access-Authenticated-User-Email`** — used by the Access gate. A direct
  caller could forge it to bypass Cloudflare Access on the prospect/buddy pages.

We do **not** block direct access (that broke the legitimate frontend run.app
path). Instead the backend only honours those two headers when
`is_cloudflare_origin` confirms the `X-Origin-Verify` secret. Off-Cloudflare,
`CF-Connecting-IP` is ignored (real connecting IP used instead) and the Access
email is not trusted (so prospect/buddy endpoints are only reachable through
Cloudflare, where Access lives — exactly the intent).

## Code behaviour (fail-open)

All switches are **no-ops until their env vars are set**:

| Env var | Effect when set |
| --- | --- |
| `CF_ORIGIN_SECRET` | Requests carrying `X-Origin-Verify: <secret>` are treated as Cloudflare-origin → `CF-Connecting-IP` / `Cf-Access-*` are trusted. Other requests are **not blocked**; those headers are simply ignored. |
| `CF_ACCESS_REQUIRED` | Public `/api/prospects*` and `/api/buddy-tracker*` (excluding `/admin` sub-routes) require a trusted `Cf-Access-Authenticated-User-Email` in an allowed domain → else `403`. |
| `CF_ACCESS_ALLOWED_DOMAINS` | Comma-separated allow-list (default `mathconcept.com,mathconceptsecondary.academy`). |

`is_office_ip` uses the same hardened `get_client_ip`, so it can no longer be
unlocked by forging the left-most `X-Forwarded-For`.

> The backend Cloud Run URL stays reachable by design. The Cloudflare Worker
> still injects `X-Origin-Verify` on `/api/*`; that header is the *trust signal*,
> not a gate. There is no longer any blanket `403`.

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
5. **Verify:** both still return **200** (direct access is intentionally kept) —
   `…/api/holidays` direct on the `run.app` URL **and** via
   `csm.mathconceptsecondary.academy`. The difference is invisible on a public
   endpoint; what changed is that the rate limiter now ignores a client-set
   `CF-Connecting-IP` on the direct path (see `tests/test_origin_guard.py`).

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
