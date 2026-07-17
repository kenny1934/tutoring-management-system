# Pilot: 歸零爆破 Zero Blast (`zero-explosion`)

Design + build plan for the series pilot. Successor to Steve's
`Zero_Explosion.html` draft; keeps his core insight (zero as the
dramatic event) but redesigns the mechanic to actually teach the
SM901 subtopic and to demonstrate the platform end-to-end. Working
title, open to change.

## 1. Pedagogy

- **Objective (one subtopic):** `(x−a)(x−b) = 0 ⟺ x = a or x = b` —
  the zero-product property behind 因式分解法.
- **The core loop teaches the core idea.** Structures stand on
  factor-pillars; a pillar falls exactly when its factor evaluates to
  zero; the structure falls when the product is zero. Zero is the
  *goal* (the detonator), not a taboo — this directly replaces the
  original draft's `0 × 0` penalty, which punished a true statement.
- **The double-root level is the misconception fix.** `(x−4)² = 0` has
  ONE detonation code that takes out both pillars at once. Students
  physically see why a repeated root is one answer, not a forbidden
  move.
- **Wrong answers teach:** submitting x = 5 against `(x−3)(x+2)` shows
  the substitution worked through, `(5−3)(5+2) = 2 × 7 = 14`, with the
  structure "holding with strength 14". Product magnitude = distance
  from collapse, made visible.
- **Ramp (concrete → abstract), one building per level:**
  | L | Content | Teaches |
  |---|---------|---------|
  | 1 | `a × ▢ = 0` numeric warm-up | any factor being 0 kills a product |
  | 2 | `(x − a) = 0`, single pillar | a factor is zeroed by one specific x |
  | 3 | `(x − a)(x − b) = 0`, distinct roots | two factors, two codes |
  | 4 | `(x + a)(x − b) = 0`, sign traps | x = −a, not a |
  | 5 | `(x − a)² = 0`, double root | one code, both pillars |
  | 6 | `x² + bx + c = 0` (nice factorisations) | factorise first, then detonate |
- Root range −9…9; L6 pairs from small factor tables. Generators, not
  fixed banks, so replays differ.

## 2. Theme and look ("blueprint demolition")

Stays inside the marked-exercise-book direction: the structures are
**engineering blueprint sketches drawn on the graph paper** (ink
strokes, dimension marks), not cartoon buildings. Detonation = ink
shatter: strokes break apart with Canvas-2D debris/dust particles,
screen shake, then a red 「拆」 stamp slams on the rubble. Fuse spark
runs along a hand-drawn line while the timer counts. Dark mode =
demolition at night on the chalkboard. This keeps series coherence and
is more distinctive than generic 3D.

## 3. Rules

- **Round:** one structure appears with its factor expression(s), a
  fuse timer starts (L1–2: 30s; later 45s). Players race to submit
  detonation codes (x values).
- **Pillars are claimable:** first correct code for a pillar claims it
  (player's name inked on the rubble). A structure needs all distinct
  pillars down to collapse; collapse pays a team-wide/round bonus to
  whoever claimed pillars, weighted by speed.
- **Wrong code:** the worked substitution is shown on the submitter's
  phone (private, no shame on the projector) plus a **3s relock** on
  that player's keypad — this, with the −9…9 range, makes brute-force
  guessing slower than thinking.
- **Streaks:** consecutive correct codes build the gold-star streak
  (shared visual language with the template); a wrong code resets it.
- **Fuse runs out:** the structure "survives", roots are revealed with
  full working, no points. Next building.
- **Session:** 6 levels ≈ 6–8 minutes. Final screen: leaderboard,
  per-player stars, and the key sentence of the day (零因積性質 stated
  in one line) — the takeaway is on screen when phones go down.
- **Solo mode:** same levels on one screen, tap keypad, both pillars
  yourself; score against the fuse only.

## 4. Multi-device architecture

- **Host** (projector / lesson-mode iframe): lobby with QR + room code,
  then per-level structure view, fuse, live claims, leaderboard.
  Host is authoritative: it judges submissions and writes results.
- **Phones:** join via QR (`?room=`), enter display name (kept short,
  profanity-trimmed by length only — tutors are in the room), then a
  numeric keypad (−9…9 quick-tap grid, no typing) with private
  feedback and personal streak/score.
- **RTDB shape** (`game-rooms/zero-explosion/<code>/`):
  - `state`: `{ phase, level, expr, pillars: {p1:{claimedBy?}, …}, deadline, scores }`
  - `players/<id>`: `{ name, joinedAt, lastSeen }`
  - `subs/<id>`: `{ value, ts }` — phone writes, host consumes,
    host writes verdict to `verdicts/<id>` for private feedback.
- Phones judge nothing; reload/screen-lock recovers from `state`.
  Timer displays are cosmetic on phones; the host's deadline decides.

## 5. Tech (per the whitelist)

**Tier 0 only.** DOM/SVG for structures and UI, Canvas 2D for
debris/dust/spark particles, Web Audio synthesis for fuse hiss +
rumble + collapse thump (all mutable, off until first gesture),
`navigator.vibrate` pulse on the claiming phone (no lib needed).
Expressions render in mono/italic (`.mc-board__value em`); KaTeX not
needed at this complexity — revisit only if L6 layout demands it.

## 6. Files

```
webapp/frontend/public/games/zero-explosion/
  index.html      — all screens + game logic (host, phone, solo)
  levels.js       — level generators + judging (pure functions, testable)
  fx.js           — canvas particles, shake, audio synth
  game.json       — manifest (SM 901 / MAS 901, F3, modes: multi+solo)
```

## 7. Build order

1. **Solo core** — levels.js generators + judge, structure rendering,
   fuse, marking feedback, demolition FX, streaks, end screen. Fully
   playable single-screen; Playwright-verified (all 6 levels, wrong
   answer working shown, double-root behaviour, reduced-motion).
2. **Multi-device** — lobby/QR, join + name, keypad, host judging over
   RTDB, claims/leaderboard, relock, reconnect recovery.
   ⚠ Prereq: deploy the `game-rooms` rules from growing-minds
   (`database.rules.json`, snippet in CONVENTIONS §8) — one
   `firebase deploy --only database` with Kenny's auth.
3. **Polish + audit** — sound/vibration, bilingual proofread (phrase
   markers, no em dashes), mobile audit rerun (320px…landscape), both
   themes, game.json, review checklist in the PR.
4. **Ship the demo** — feature branch → PR (checklist included) →
   after merge, test at `csm.mathconceptsecondary.academy/games/…`;
   `games.` subdomain (Cloudflare DNS + middleware host map) when
   phones need it outside the lab.

## 8. Open questions (non-blocking, defaults chosen)

- Name: 「歸零爆破 Zero Blast」 — confirm with Steve, it's his baby.
- Individual race (default, small centre classes) vs team mode — team
  split can come later if lessons want it.
- Sound default: off on host, on on phones (centres are shared space).
