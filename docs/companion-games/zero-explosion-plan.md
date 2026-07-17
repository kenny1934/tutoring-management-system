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

## 9. Iteration 2 (implemented 2026-07-17)

Post-playtest audit findings: a knowing player clears the game in
under a minute (9 codes total); multi starves slow students (first
claim takes everything); the projector view is a 620px phone column;
the collapse fade reads as CSS, not physics. Kenny's direction:
increase difficulty AND volume, tunable. Implementation order below;
each step keeps the test suites green before moving on.

**Status: all of 9.1-9.6 implemented and Playwright-verified.**
Deltas from the plan as written: grace default is 6 s (`?grace=`
overrides, 0 disables); echo pays once per player per root and also
runs through the streak multiplier; the tutor end button uses an
on-button two-tap confirm; `diff=easy` also stretches fuses by 1.25x.
Measured bot-expert full run ≈ 2 min of fuse floor; copy now says
12 buildings, 5-8 min (`duration_min: 7`).

### 9.1 Stages × rounds + difficulty (with 9.2, the core of it)

Replace "6 levels × 1 building" with a config-driven demolition plan
of stages, each a street of buildings sharing a kind:

```
DEFAULT_PLAN = [            // ≈ 12 buildings, ≈ 20 codes
  { kind: 1, rounds: 1, fuse: 20000 },
  { kind: 2, rounds: 2, fuse: 20000 },
  { kind: 3, rounds: 2, fuse: 35000 },
  { kind: 4, rounds: 2, fuse: 35000 },
  { kind: 5, rounds: 2, fuse: 35000 },
  { kind: 6, rounds: 3, fuse: 45000 },
]
```

- Max fuse budget ≈ 6.75 min; realistic first-timer 5–9 min; expert
  ≈ 2 min (acceptable: experts are farming the streak multiplier).
- Later rounds within a stage generate harder numbers (wider root
  range, mixed signs); `kind 6` hard rounds use larger |c| with
  same-sign roots (harder factor search). Keep a = 1 — matches the
  SM901 courseware scope (confirm against the PDFs).
- **Streak multiplier**: score = base × (1 + 0.1 × min(streak, 10)).
  Stars finally matter; consistency beats lucky speed.
- URL config (host-side only; phones inherit via state):
  `?levels=4,5,6` (kind subset/order), `?rounds=1,2,2,…` or a single
  global, `?fuse=0.75` (multiplier), `?grace=8`, and
  `?diff=easy|std|hard` presets bundling the above. `diff=hard` adds
  a final mixed street (3 buildings, random kinds 3–6). Document the
  params in game.json `config` for the future lesson-panel UI.
- Trim transitions slightly (collapse 2.7s → ~2.2s, card 1.6s →
  1.2s); update `duration`/`duration_min` copy from measured runs
  (track 4 of the audit folds in here).

### 9.2 Multi inclusion: echo points + grace window

- **Echo points**: after a pillar is claimed, a later correct code
  for it earns 40% of base (no claim ink, streak continues). Verdict
  gains type "echo": 「已由 X 拆咗 · +N 分」. Kills claim starvation:
  every phone solves every equation for credit.
- **Grace window**: when the last pillar is claimed, the structure
  goes critical (violent sparking, countdown chip) for
  min(grace, remaining fuse) seconds before the collapse fires;
  echo submissions stay open. Solo skips the grace entirely.

### 9.3 Projector layout

- Host mode gets `zb-stage--projector`: stage max-width ~1150px,
  scene scaled to ~60vh (drop the 300px cap), equation + fuse +
  leaderboard flanking. Auto when hosting on ≥1100px viewport.
- FX scale with the scene: particle counts × (sceneWidth/400),
  bigger shake. Verify at 1280×800 and 1920×1080.

### 9.4 Tutor controls (host only)

- Quiet control strip under the scene: `+15s` (extends deadline +
  rewrites deadlineEpoch), `跳過` (force reveal → next), `結束`
  (two-tap confirm → endGame). Keyboard: t / n / e.
- Pause is deferred (deadline-shifting over RTDB is fiddly; +15s
  covers the classroom need).

### 9.5 Collapse physics + scene polish

- Break the deck into 3–4 `<g>` chunks with randomised tumble
  animations (CSS custom props for drift/rotation/delay) replacing
  the rotate-and-fade; then rubble as now.
- Sequence the level card BEFORE the blueprint draw-in (they
  currently overlap).
- Fail state gets a beat: the surviving building "dusts itself off"
  (settle bounce + puffs) under the 未拆除 stamp.
- Dark mode: stronger fuse glow bloom. Idle life: faint smoke wisp
  at the fuse tip, pulsing hazard dot on the tallest buildings.

### 9.6 Test additions

- Solo: config params respected (plan length, fuse multiplier);
  streak multiplier arithmetic; duration copy matches measured runs.
- Multi: echo verdict pays and preserves streak; grace window keeps
  echo submissions open then collapses; tutor skip/+15s/end.
- Projector: 1280 + 1920 screenshots, FX scaling sanity.
