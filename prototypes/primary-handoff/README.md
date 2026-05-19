# Primary Section Handoff Prototypes

Prototype set for the modules primary section (IMMS) asked for in the discovery meeting. Generic theme, mock data, no backend. Built so it can be demo'd and handed off without needing to spin up CSM.

## What's in it

| Route | What it shows | Why |
|-------|---------------|-----|
| `/checktables` | Per-textbook exercise grid with per-student state, click-to-assign, bulk print tray | Fully new module, no analogue in current CSM |
| `/assessments` | Kanban over the assessment lifecycle | New module shaped on CSM's existing Trial page |
| `/sessions` | Sessions + reschedule + makeup reference | Already exists in CSM, included for completeness |
| `/comms` | Parent communications reference | Already exists in CSM, included for completeness |

The Waitlist module discussed in the meeting is intentionally not in this set, because the features primary asked for (multi-time preference, vacancy suggestions, mixed prospects + slot-change list) are already in CSM's waitlist.

## Running locally

```bash
cd prototypes/primary-handoff
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## Building for handoff

```bash
npm run build
npm run start
```

Or static export (no Node runtime, can be hosted on any static host):

```bash
npm run build
# .next/ output can be deployed to Vercel directly
```

## Tech

- Next.js 15 + React 19
- Tailwind CSS v4 (CSS-first config in `app/globals.css`)
- TypeScript
- No backend. All data lives in `lib/mock-data/`.

## How to read the prototypes

Each page is a self-contained sketch. They share a header and theme but no shared state. The point is to communicate UI shape and intended interactions, not to be a working product.

When productionising, see `../../.claude/hq-api-needs-for-primary.md` for the HQ API endpoints each module needs.
