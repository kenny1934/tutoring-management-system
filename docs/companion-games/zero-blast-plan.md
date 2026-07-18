# Pilot: 歸零爆破 Zero Blast (`zero-blast`)

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
- **RTDB shape** (`game-rooms/zero-blast/<code>/`):
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
webapp/frontend/public/games/zero-blast/
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

## 10. Iteration 3 (implemented 2026-07-18, from the post-iteration-2 re-audit)

Fresh two-persona audit (2026-07-17, tutor + student) after the
iteration-2 build. Kenny accepted all findings. Work is grouped into
five batches; each batch shipped alone with all three Playwright
suites green between batches. Batches A-C are the pre-pilot set; D-E
also landed since they proved cheap once A-C were in.

**Status: all five batches implemented** (commits: A `fd23a1dd`,
B `8cf0c695`, C `6c2e8344`, D `e20685f7`, E `23f009db`; game.json
0.3.0). Deltas from the plan as written:

- Batch C resume floors the restored fuse at 5s (a refresh should not
  land the class on a nearly burnt fuse) and stores the deadline as an
  epoch so wall time lost to the refresh is honoured. GameBridge.host
  gained `opts.code` to reclaim an existing room without resetting it.
- Batch D shipped the preferred fix (400ms commit window: digit arms,
  minus flips the staged sign, same digit commits instantly); the
  gentler-verdict fallback was not needed but stays documented below
  in case the window feels laggy on real phones in the pilot.
- Hint and finale multipliers fold into one `levelFactor(level)`
  (finale x2, hinted x0.5), so a hinted finale building nets x1.
- Batch E's silhouette jitter is deterministic per building seq (not
  random) so host and screenshots agree; mirror skips kind 1, whose
  deck carries text.

### Batch A - Classroom flow & tutor pacing (do first)

The game currently owns every teaching beat on a timer; hand the
tempo to the tutor.

- **Tutor-paced reveal (host mode)**: on fuse-out, the reveal phase
  WAITS - no 3.4s auto-advance. The tutor bar's 跳過 becomes 下一關
  while revealing (key n advances). Phones stay on the reveal until
  the next round arrives. Solo: keep auto-advance but stretch the
  reveal to ~5.5s (students are told to note the codes; give them
  time to actually do it).
- **+15s flash**: pressing +15s stamps a fading 「+15 秒」 over the
  scene so the class notices the gift.
- **Shortcut visibility**: title attrs on the three tutor buttons +
  a faint mono legend "t / n / e" under the bar.
- **Echo discoverability**: add one how_to_play line (拆咗都仲有分 -
  solving an already-claimed pillar still scores) and, once claims
  exist mid-round, append a short hint to the phones' claims status.
- Tests: multi - reveal waits until n; +15s stamp appears; hint text
  present after first claim. Solo - reveal duration ~5.5s.

### Batch B - Score theatre & thrill

- **Visible streak multiplier**: show ×1.x beside the stars (solo
  topline, controller, host board rows); pop/flash when it grows.
  Value from the same formula as `ZBLevels.points` (min(streak,10)).
- **Final-street finale**: the last stage of any plan (mix street on
  diff=hard, stage 6 otherwise) gets boss dressing - a 最後一條街
  level-card tag, faster tick cadence in the last 10s, and DOUBLE
  points for everyone (echoes included). Comeback drama + an ending
  peak for solo. Fold the ×2 into points() call sites via a level
  flag (`finale: true` set by genPlan on the last stage).
- **Ignition consistency**: hold the spark emitter until the fuse
  actually starts burning (CARD_MS delay), so the detonator doesn't
  spark during the level card.
- Tests: finale flag on last stage; finale pts ×2; multiplier text
  rendering; no sparks before ignition (fx state check).

### Batch C - Classroom safety & resilience (pre-pilot required)

- **Host refresh recovery**: persist the host's run state (levels,
  idx, scores, streaks, claims, processedSeq, deadline remainder) to
  sessionStorage keyed by room code on every round boundary + claim;
  on load with a live room in storage, offer 繼續上一場 to resume and
  re-publish state. An accidental F5 must not strand 30 phones.
- **Lobby moderation**: tap a player chip in the lobby -> confirm ->
  kick (deletes players/<id>; the phone shows a "removed" status and
  returns to the name form). Blocks the rude-nickname-on-projector
  incident.
- **Struggling indicator**: small counter under the host board
  during play - 「N 人本關未計分」 - so the tutor knows where to
  walk. No names on the projector (private by design).
- Tests: multi - host reload + resume continues the same round;
  kick removes chip + phone returns to join; struggling counter
  matches players with no verdict-ok this round.

### Batch D - Pedagogy scaffold

- **Factorise hint escalation (kind 6)**: at half fuse, one plaque's
  hidden factor fades in faintly (pencil-grey, not the reveal ink);
  host mode adds a 提示 tutor button (key h) to trigger it manually
  instead. Hint halves that building's base points (fair, not
  punitive).
- **Keypad slip forgiveness**: today a finger slip (7 before −)
  reads as a maths error and costs streak + 3s lock, worst on the
  sign-trap stage. Preferred fix: a ~400ms commit window - a digit
  tap shows the value armed for 400ms before submitting; tapping −
  inside the window flips the sign, tapping the same digit again
  submits instantly. One beat of speed for zero slip cost. Playtest
  it; if it feels laggy, fall back to a gentler verdict instead:
  a submission that differs from a root only by sign skips the lock,
  keeps the streak, and gets a 「符號啱唔啱？」 margin note (once per
  building).
- Tests: hint appears at half fuse / on h; hinted building pays
  half; undo window flips sign; sign-slip fallback if chosen.

### Batch E - Visual polish & projector comfort

- Silhouette variants: repeated rounds mirror the silhouette and
  jitter width/height ~8% via transform on the deck group, so a
  street of three 大廈 isn't three clones.
- "?" plaques on kind 6: larger hand-drawn ? (own SVG path, slight
  rotation), reads deliberate rather than empty.
- Echo tally ink: 「回聲 ×N」 in small red under a claimed pillar's
  claimer name, counting echo solves - makes inclusion visible.
- Projector comfort: QR at 300px+; apply the projector stage width
  on the intro screen too (wide viewport, before hosting); timer up
  a size; balance the 1920 leaderboard column (wider board, larger
  rows, less empty cream).
- Phone-solo layout: let the scene grow into the dead space on tall
  phones (relax the 300px cap when viewport height allows).
- Tests: screenshot passes at 390/844-landscape/1280/1920; no
  horizontal scroll; variant transform present on round 2+.

### Pilot watch-list (observe, no code)

- Kind-2 hard rounds introduce negative roots one stage before the
  sign-trap stage names the idea - listen for confusion.
- L5 double root is the single biggest scoring event (2 hits x
  multiplier) and the easiest level for a knowing student - watch
  whether it distorts leaderboards.
- Class-size load: 30+ phones on one RTDB room (subs/verdicts
  churn) - watch latency during the first pilot.

## 11. Iteration 4 (planned): the visual and animation audit

Full visual/animation audit (2026-07-18) over fresh screenshots of
every beat: intro, level card, draw-in, mid-burn, claim, collapse,
fail, finale card, end report, light and dark, phone and 1280/1920
projector. Goal: make the game read as high-class craft by deepening
the marked-exercise-book metaphor, not by adding generic game gloss.
Five batches, each ships alone with all three suites green.

Guardrails that apply to every batch:

- Red stays the teacher's pen. Celebration ink is star gold and
  ink black; red only marks, warns and stamps.
- Everything respects reduced motion (state changes stay visible,
  animation is optional), matching the existing FX pattern.
- Tier 0 throughout: CSS, SVG filters and the existing canvas are
  enough; no libraries.
- Expensive filters (line wobble, paper grain) sit behind a small
  capability gate (device memory / DPR check plus a ?fx= override)
  so old classroom Androids and the 30-phone room never pay for
  the projector's looks. Phones never render the scene anyway.
- Effort tags: (S) under an hour-ish of change, (M) a sitting,
  (L) a batch-dominating piece.

### Batch F - Payoff clarity and score theatre (do first)

The climax moments currently muddy their own ink. Clean them before
adding anything new.

- **Dust rebuild (S)**: the collapse dust stacks into an opaque
  grey blob that hides rootmarks and rubble. Fewer, larger puffs
  drawn as soft radial gradients at ~0.1 alpha, sideways shear as
  they rise; additive blending in dark mode.
- **Rootmark placement (S)**: `x = a` ink currently sits on the
  rubble strokes and reads scratched-out. Move the marks to a clear
  band just above the ground line, clear of the pile.
- **Chop slam with consequence (S)**: the 拆 chop floats mid-sky
  with a detached shadow blob. Slam it onto the rubble (slight
  overlap), one-frame paper flash behind it, dust ring kicked out
  along the ground, rubble visibly compacting under it.
- **Fail state, one stamp language (S)**: 未拆除 over the scene
  plus 未歸零 in the mark zone says the same thing twice, and the
  scene stamp boxes the building clumsily. Scene side becomes a
  "condemned" treatment: rotated chop in the top corner plus a red
  tape-cross over the structure; the mark zone carries the working
  and the reveal.
- **Score odometer + floating ink (S)**: topline score counts up
  instead of teleporting; a `+380 分` ink numeral floats from the
  building to the score. Phones get the same count-up on ctrlScore.
- **Star and multiplier ceremony (S)**: each new star stamps in
  with the ink-pop rotation; the ×1.x chip flashes gold when it
  grows.
- **Lock countdown sweep (S)**: pencil-drawn circular sweep around
  the 3s relock number.
- Tests: dust particle alpha/count assertions via ZBFX state or
  screenshot sampling; rootmark y clear of rubble band; single
  fail stamp on scene; score element animates to the judged total
  (final value equality still exact); suites green.

### Batch G - The marked equation and collapse drama

The two biggest wins in one batch: pedagogy made visible on the
board, and a collapse that reads as structural failure.

- **Factor strike-through (M, flagship)**: when a pillar falls,
  strike that factor through in red on the equation board itself,
  with the claimer's name in tiny ink above it (host board and
  phones; solo strikes without a name). `(x−6)(x−8) = 0` with
  `(x−6)` struck IS the zero-product property being used. Needs
  exprHtml to render factors as addressable spans keyed by pillar
  id; claims state already carries who took what. Never applied to
  player-name text itself beyond escapeText (names stay untrusted).
- **Crack-then-fall (M)**: a ~150ms pre-beat before the chunks
  separate: jagged crack lines flash across the deck, one shake
  pulse, then the fall; 60-90ms hit-stop when the first chunk
  lands. Chunks currently pop straight into tumbling and mid-fall
  reads as confetti.
- **Progressive rubble (M)**: debris visibly becomes the pile
  (chunks land and settle, pile outline inks over them) instead of
  the rubble stroke drawing in on its own.
- **Grace countdown theatre (S/M)**: big translucent numerals
  stamped over the scene each second (3 · 2 · 1), hazard beacons
  blinking double-time, red edge-vignette pulse. The tremble stays.
- Tests: board contains struck factor + claimer after claim (multi)
  and struck factor in solo; crack layer appears before .fall;
  grace numeral element present during graceUntil; suites green.

### Batch H - Paper and ink craft (the material upgrade)

- **Hand-inked wobble (S)**: one feTurbulence + feDisplacementMap
  filter (~1px) on .zb-struct makes every stroke read hand-drawn.
  Biggest charm per line of code in the audit. Behind the fx gate.
- **Paper grain (S)**: near-invisible turbulence tile over the
  stage (~3% opacity); doubles as chalk-board mottling in dark.
- **Letterpress stamps (S)**: subtle inset shadow plus slight ink
  bleed (tiny displacement) on chops and stamp borders.
- **Burnt fuse residue (S/M)**: the consumed fuse leaves an
  ash-grey charred dash and tiny scorch flecks instead of
  vanishing.
- **Dark chalk set (S each)**: additive ("lighter") compositing
  for sparks in dark; chalk micro-gap stroke texture; soft warm
  board vignette.
- **Window lights die (M)**: dark mode only, building window rects
  glow faintly and blink out one by one as pillars fall.
- **Capability gate (S)**: deviceMemory/DPR heuristic plus
  ?fx=full|lite override; wobble+grain off on weak devices.
- Tests: fx gate honours ?fx=lite (no filter attributes present);
  reduced-motion run unchanged; dark screenshots refreshed;
  suites green.

### Batch I - Bound-book flow and scene atmosphere

- **Page-turn transitions (M)**: screens and level-to-level changes
  slide like worksheet pages (old page lifts with a shadow, new one
  slides in); the level card becomes the cover of the incoming
  page rather than a floating flash.
- **Level card as blueprint title block (M)**: bordered rect, PLAN
  number, 承建商 MathConcept line, date; stamped in with rotation
  overshoot. Finale card gets a double border and a red 加倍 chop
  on top of the existing tag.
- **First-building pencil (M)**: building 1 only, a small pencil
  glyph rides the draw-in stroke tip. Once per run; skipped under
  reduced motion.
- **Surveyor's annotations (M)**: faint pencil dimension lines and
  arrows around the structure (heights, spans), the demolition-plan
  detail that quietly reinforces "this is a maths document".
- **Distant skyline and crane (M)**: thin-stroke crane far side,
  one or two distant outlines; crane hook sways slowly as idle
  life.
- **Pencil clouds (S)**: one or two faint cloud scribbles drifting
  very slowly across the sky band.
- Tests: transition class fires between screens and rounds; card
  title block renders PLAN seq; annotations present but faint
  (class check); no horizontal scroll anywhere; suites green.

### Batch J - Stagecraft: projector, cover and report

- **Demolished-street strip (M)**: a bottom strip on the projector
  accumulating tiny stamped silhouettes of each felled building
  (01→12, each with a mini 拆) - campaign arc for the class,
  fills the 1920 emptiness.
- **Leaderboard theatre (M)**: gold/silver/bronze ink-circle rank
  chips for top three, FLIP-animated row reorder, rolling score
  changes.
- **Lobby attract loop (M)**: beside the QR, a small building
  draws itself, collapses and redraws on a loop while waiting.
- **Finale ink celebration (M)**: last building down triggers an
  ink-splatter burst plus gold star rain on the projector (no
  confetti cliches; splatter and stars are the house language).
- **Intro hero vignette (M)**: a small blueprint illustration
  (building on pillars, fuse to detonator) between title and lede,
  drawn in on load with the stroke animation.
- **Fuse-underline title (S)**: the red swash under the title is
  drawn by a travelling spark once on load.
- **How-to as three mini-diagrams (M)**: replace the rules text
  wall with three inline sketches: pillar+code → factor zeroed →
  collapse, captions one line each.
- **End report ceremony (M)**: total counts up, stars stamp in one
  by one, rows slide in staggered, check marks draw themselves,
  hand-drawn double underline under the total, rotated 檢定完成
  chop with the date.
- Tests: street strip count matches records; leaderboard reorder
  applies FLIP class; attract loop present in lobby (and absent
  once started); intro vignette drawn; report count-up settles on
  the exact score; 1280+1920 screenshots refreshed; suites green.

### Recommended order and the top five

F → G → H → I → J. If time is short before the pilot, the top five
by felt impact are: dust rebuild (F), crack-then-fall (G), factor
strike-through (G), page-turn transitions (I), hand-inked wobble
(H) - F and G alone carry most of the perceived quality jump.
