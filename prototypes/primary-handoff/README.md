# Primary Section Handoff Prototypes

Prototype set for the modules primary section (IMMS) asked for in the discovery meeting. Generic theme, mock data, no backend. Built so it can be demo'd and handed off without needing to spin up CSM.

## What's in it

| Route | What it shows | Why |
|-------|---------------|-----|
| `/` | Today snapshot: pending makeups, today's sessions, follow-ups due, quick links into the four main modules | Dashboard landing |
| `/students` | Roster hub — searchable list of students, jumping into each student's detail tabs | Student-first IA shift on this branch |
| `/students/[id]/...` | Per-student detail with tabs: Overview, Sessions, Performance, Assessments, Checktables, History, Parent Comms | Checktables now live here as a student-scoped tab (the standalone `/checktables` route was removed) |
| `/sessions` | Sessions + reschedule + makeup, weekly view, previous-HW-to-check on session rows | Already exists in CSM, included for completeness |
| `/assessments` | Kanban over the assessment lifecycle | New module shaped on CSM's existing Trial page |
| `/comms` | Parent communications reference + pending follow-ups | Already exists in CSM, included for completeness |

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
