# MC Drive Integration — Prototype Demo Handoff

## Why this exists

The `feature/primary-prototypes` branch has a working AssignDialog with a placeholder PDF preview (`prototypes/primary-handoff/components/checktable/AssignDialog.tsx`, around line 162: "PDF preview would render here"). We've identified a way to wire that placeholder up to real PDFs from HK IT's existing **MC Drive** site (`mcdrive.mathconcept.com`), with zero infrastructure on our side and zero ask of HK IT.

This doc captures what was discovered, what to build, and the constraints to respect.

## What was discovered (background)

MC Drive is a Laravel + Filament + Livewire app backed by **AWS S3 in Singapore** (`imms-fms-sg.s3.ap-southeast-1.amazonaws.com`). PDFs are served via PDF.js wrapped in a viewer page:

```
https://mcdrive.mathconcept.com/viewer/pdf-js/generic/web/viewer_readonly.html?file=<URL-encoded S3 URL>
```

Two layers of access control verified by `curl` testing:

1. **S3 bucket is Referer-gated.** Direct fetches succeed only when the `Referer` header is `https://mcdrive.mathconcept.com/*`. Returns 403 without it. So we can't fetch the raw PDF bytes from CSM's frontend (browser strips/replaces Referer cross-origin), but the viewer page's own requests work because they originate from MC Drive's domain.
2. **MC Drive itself blocks known cloud / data-center IP ranges.** A standard WAF-style block. Residential ISPs everywhere (HK, Taiwan, UK confirmed) work fine. Cloud Run, AWS, GCP IPs get `403 host_not_allowed`. So end users on real ISPs can hit MC Drive globally; our backend cannot.

S3 itself is NOT IP-restricted, only Referer-gated. Presigned URLs (signed requests) work from any IP. That matters for any future server-side fetching (stamp/print flow).

CORS on S3 is `Access-Control-Allow-Origin: *`, so once the Referer gate is passed, the bytes are accessible to JS.

## What this means for the prototype

**Just iframe the MC Drive viewer URL.** When the iframe loads, its requests carry `Referer: https://mcdrive.mathconcept.com/...`, so S3 lets them through. No backend involvement, no proxy, no credentials. Works on desktop, Android, iOS — anywhere the end user has internet on a residential connection.

The single open question before committing to iframe vs. new-tab: does MC Drive's viewer page set `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors`? Test this from the browser console while logged into MC Drive:

```js
fetch('/viewer/pdf-js/generic/web/viewer_readonly.html?file=...')
  .then(r => console.log([...r.headers.entries()]))
```

- If you see `x-frame-options: SAMEORIGIN` or `DENY`, or `content-security-policy: ... frame-ancestors 'self'` → iframe is dead. Use `window.open()` in a new tab instead.
- If neither is present → iframe works.

## The actual change in AssignDialog

In `prototypes/primary-handoff/components/checktable/AssignDialog.tsx`, the placeholder div (~line 156-171) becomes a conditional iframe.

Sketch:

```tsx
// Above the return, derive the viewer URL from the item's S3 path
const S3_BASE = "https://imms-fms-sg.s3.ap-southeast-1.amazonaws.com";
const VIEWER_BASE = "https://mcdrive.mathconcept.com/viewer/pdf-js/generic/web/viewer_readonly.html";

const previewUrl = item.mcDriveS3Path
  ? `${VIEWER_BASE}?file=${encodeURIComponent(`${S3_BASE}/${item.mcDriveS3Path}`)}`
  : null;

// Replace the placeholder div with:
<div className="aspect-[3/4] surface-muted">
  {previewUrl ? (
    <iframe
      src={previewUrl}
      className="w-full h-full border-0"
      title={`Preview of ${item.code}`}
    />
  ) : (
    /* existing placeholder fallback */
  )}
</div>
```

If iframe is blocked, swap the iframe element for a "Click to open" button that calls `window.open(previewUrl, "_blank", "noopener")`.

The `ChecktableItem` type in `prototypes/primary-handoff/lib/types.ts` (around line 20) will need a new optional field:

```ts
export type ChecktableItem = {
  id: string;
  code: string;
  pdfPath?: string;        // existing placeholder UNC path
  mcDriveS3Path?: string;  // NEW: S3 key under imms-fms-sg, e.g. "MC_Drive/Answer/01_SG_Letter Size/SG Level 1/SG133C1_add.within.100_ANS.pdf"
};
```

## Seed data — what we have

Confirmed real path (verified to return 200 with proper Referer):

```
MC_Drive/Answer/01_SG_Letter Size/SG Level 1/SG133C1_add.within.100_ANS.pdf
```

Confirmed top-level Answer-folder children from a single navigation snapshot:

| id | name |
|----|------|
| 1 | Answer (root) |
| 2 | 01_SG_Letter Size |
| 9 | 02_Math 1 to 6_A4 Size |
| 16 | 03_PS_2types(SG+PS) |
| 23 | 04_Kindergarten Supplementary_v1.0 |
| 42 | 05_CA_new code_Answer Set_Level 1&2_v2.0 |

That's enough to wire ONE item in the prototype seeds (e.g. `SG133C1_add.within.100_ANS.pdf`) to a real PDF, leaving the rest with the existing placeholder fallback. Sufficient for a "this proves it works" demo.

For deeper / richer seed data, run the scraper (next section).

## Getting more seed data — run the scraper

A Playwright-based scraper lives at `scripts/scrape_mc_drive.py`. It walks MC Drive's folder tree using your authenticated session and dumps everything to `scripts/mc-drive-tree.json`.

```bash
pip install playwright
playwright install chromium

# First run — opens a browser, you log in to MC Drive manually
python scripts/scrape_mc_drive.py --login

# Subsequent runs — headless, uses saved session
python scripts/scrape_mc_drive.py --max-depth 3
```

Output JSON shape:

```json
{
  "folders": [
    { "id": 1, "name": "Answer", "parent_id": null, "user_id": 1, "created_at": "...", "updated_at": "..." },
    ...
  ],
  "materials": [
    { "id": 42, "folder_id": 7, "filename": "...", "s3_path": "MC_Drive/...", ... }
  ]
}
```

Notes:

- The scraper runs from your laptop, which is on a residential connection — so it passes MC Drive's IP allowlist. Don't try to run it from Cloud Run / CI.
- The session cookie is saved in `scripts/.mc-drive-session.json` (gitignored). If your MC Drive login expires, re-run with `--login`.
- The `materials` schema is best-guess based on Filament conventions; the actual column names (`s3_path` vs `path` vs `storage_path`) will surface in the scraped data and may need a rename.
- Sweep folders incrementally — the first run with `--max-depth 2` to confirm the script works, then expand.

## Mapping prototype items to real PDFs

The prototype's seeded `ChecktableItem.code`s (e.g. `640A`, `607B`) don't correspond to MC Drive's real filenames (e.g. `SG133C1_add.within.100_ANS.pdf`). Two options for the demo:

1. **Hand-pick 3-5 real items from scraped data and reseed those specific entries with their `mcDriveS3Path`.** Keep the rest as placeholders. Cheapest path to a "look, real PDFs" demo.
2. **Rebuild the seed structure from scraped data so every item is real.** Bigger change but more representative.

(1) is recommended for a first cut. Promote to (2) only if the prototype's structure naturally maps to MC Drive's folder hierarchy.

## Production architecture — what NOT to do here

This is a prototype demo. The iframe-the-MC-Drive-viewer approach works for end users on residential connections, but it's not the right production architecture:

- **No print/stamp flow.** Iframe shows the PDF; CSM never sees the bytes. CSM's existing stamp-and-print won't work via this path.
- **No backend reach.** Cloud Run can't fetch S3 bytes either (Referer-gated, and Cloud Run egress IPs are on MC Drive's block list).
- **Coupled to MC Drive's availability and access policies.** If HK IT changes the Referer condition, locks down further, or has an outage, CSM breaks.

The right production path is to ask HK IT for a **read-only IAM credential** scoped to `s3:GetObject` on `imms-fms-sg/MC_Drive/*`. CSM backend uses the AWS SDK to mint **presigned URLs** per request. That:

- Works from any device, any IP (signed URLs bypass the Referer check)
- Works from Cloud Run too (presigned URL generation is local; the URL itself goes straight from browser to S3)
- Restores stamp/print (backend can fetch bytes with the same credential)
- Gives proper per-user audit (CloudTrail on HK IT's side)

That's a 5-minute ask of HK IT versus the GCS-mirror alternative that was on the table earlier. **Do not implement Option E in this prototype**, but reference it in the eventual real-CSM design.

## Acceptance criteria for the prototype work

- [ ] `ChecktableItem` type has optional `mcDriveS3Path: string`.
- [ ] AssignDialog renders a real PDF preview (iframe or new-tab button) when the item has `mcDriveS3Path`, falling back to the existing placeholder when it doesn't.
- [ ] At least one seeded checktable item has a real `mcDriveS3Path` (start with `MC_Drive/Answer/01_SG_Letter Size/SG Level 1/SG133C1_add.within.100_ANS.pdf`).
- [ ] Visual smoke test: open the AssignDialog for that item; PDF renders.
- [ ] Tested on desktop Chrome and Android Chrome.
- [ ] If iframe is blocked by CSP/X-Frame-Options, the "open in new tab" fallback works.

## Files to touch

| File | Change |
|---|---|
| `prototypes/primary-handoff/lib/types.ts` | Add `mcDriveS3Path?: string` to `ChecktableItem` |
| `prototypes/primary-handoff/components/checktable/AssignDialog.tsx` | Replace placeholder div (~line 156-171) with iframe-or-fallback |
| `prototypes/primary-handoff/lib/mock-data/checktables.ts` | Reseed 1+ items with real `mcDriveS3Path` |
| `prototypes/primary-handoff/HANDOFF-NEXT.md` | Add a note about this work landing |

## Files NOT to touch

- Anything outside `prototypes/primary-handoff/`. This is a prototype-scoped change.
- Anything related to `lib/file-system.ts` in the real CSM frontend — that's path-mapping for the existing NAS flow, separate concern.
