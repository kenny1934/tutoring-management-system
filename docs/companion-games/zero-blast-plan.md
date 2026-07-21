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

## 11. Iteration 4 (implemented 2026-07-18): the visual and animation audit

Full visual/animation audit (2026-07-18) over fresh screenshots of
every beat: intro, level card, draw-in, mid-burn, claim, collapse,
fail, finale card, end report, light and dark, phone and 1280/1920
projector. Goal: make the game read as high-class craft by deepening
the marked-exercise-book metaphor, not by adding generic game gloss.
Five batches, each ships alone with all three suites green.

**Status: all five batches implemented and merged to the branch on
2026-07-18** - F `342039c2`, G `e42d1f48`, H `5eb9666c`,
I `112759aa`, J `08737ab6`; game.json bumped to 0.4.0. Deltas from
the plan as written:

- Factor strike-through skips kind 6: the board shows the expanded
  form so there are no factor substrings to span; the plaque reveal
  carries the factorisation there. All other kinds strike (kind 1
  strikes the box, kind 5's two pillars share one span).
- The hit-stop is baked into the chunk keyframes as a steps() hold
  at the landing frame (70-80% of the fall), per chunk, rather than
  a global pause; chunks then lie on the ground until the pile
  outline inks over them and dissolve at ~1.35s.
- Window lights exist only on the kinds with window rects (2, 3, 6),
  rendered inside the variant-transform group so mirrored rounds
  keep their lights in the windows.
- Capability gate heuristic: deviceMemory >= 4 AND devicePixelRatio
  <= 3 -> full; ?fx=full|lite overrides; data-fx attribute on the
  root gates the CSS. Dark combines wobble + chalk-erosion in one
  filter chain.
- Screen changes animate the incoming page only; the two-phase
  lift-then-slide runs on round changes (240ms out, 340ms in, whole
  game grid). html/body clip horizontal overflow during slides.
- The pencil rider and the title-swash spark use SMIL animateMotion
  (begun via beginElement); both removed under reduced motion by JS
  since CSS animation kills don't reach SMIL.
- The street strip and attract loop are projector-only via CSS
  (display gated on .zb-stage--projector), so a wide solo screen
  gets them too, which reads fine.
- The 檢定完成 chop overlaps the report's last row bottom-right by
  design (translucent stamp over the signed report).

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

## 12. Iteration 5: Tier 1 adoption - the mechanic audit

**Status (2026-07-18): iteration 5 COMPLETE - K, M, L, then N and O**
(suites green between batches; game.json 0.6.0). K/M/L below, then a
simplification pass, then N `540d8e8b` and O `c7b74dc0`:

- **N** `540d8e8b` - street life landed as re-scoped: the crew (a
  pointing figure and the classic site squat) loiters RIGHT of the
  building - the fuse owns the left half's ground band, so the
  planned kerb-side spot would have put feet on the burning line.
  Scatter fires from three hooks, latched by class: the fuseFrame
  warn window, enterGrace, and `tl.call(scatterCrew, null, 0)` on
  the collapse timeline (a fast class can beat the warn window; the
  crew still gets its head start). The run needs a tail fade: the
  svg canvas is wider than the viewBox, so runners would freeze
  visibly in the letterbox margin. Scatter rides a new
  `audio.patter` one-shot on the `debris` sample. The foreman pushes
  the plunger via `tl.call(foremanPush, null, "crack")` - pose swap
  plus the detonator path's d swapping to the pushed T-bar. The
  inspector stands beside the report chop in a reserved 58px
  signature foot band (a real inspection report ends with a chop at
  the foot; it also lifts the chop off the record rows). Reduced
  motion: figures visible and static, scatter becomes an instant
  exit, the push stays a plain pose swap.
- **O** `c7b74dc0` - the depth pass landed as re-scoped: one
  upper-left light source, the shade side as `.zb-wash` POLYGONS
  (fills dodge every `path` stroke/draw selector; plain opacity, so
  fx=lite keeps them; never red - asserted in suite). Washes on
  right walls, under-parapets, door recesses, pillar flanks, cloud
  undersides and the rubble shadow. Doors + mullions added to kinds
  3/6 (kind 2 already had both), dressing alternates per kind picked
  by `dressVariant` (seq hash >>> 20, mod 3, `data-dress` on #deck
  for the determinism test): tanks, laundry, 騎樓 arches, signage
  squiggles (mirror-safe), pennants, suspenders, guy wires, ladder,
  crates, chimney, antenna. Far street (broken kerb + lamp +
  bollards) stays below the deck line; the ground kerb gets a
  heavier `fore` stroke. Pillar reinforcement: `hv` verticals
  (2.7), collar tie, doubled lower bracing, hatched footings -
  every added stroke above 162 or below 184, the plaque band stays
  focal. Two structural notes: dressing lives on the deck, so it
  tumbles/dissolves with the collapse and can never crowd the
  resolve graph's sky; and ALL added detail rides existing draw
  beats via the new `PX(d, cls, i)` helper (explicit --i, no
  drawIdx bump), so the staged round-open moment did not move.

K/M/L and the simplify pass, for the record:

- **K** `158d69a0` - Howler 2.2.4 vendored (+ NOTICE); 14 material
  one-shots synthesised offline by `scripts/zb-render-audio.mjs`
  into one mono 22.05k WAV sprite, 374.7 KB (budget 400 KB; no
  ffmpeg on the box, so no opus - regenerate as opus if that
  changes). Deltas from plan: the sprite lazy-loads only once sound
  is enabled; beyond re-routing the existing one-shots, new beats
  were wired where the samples demanded call sites - `stampSoft`
  (condemned notice + the report chop), `page` (round turn), `chime`
  (report stars), `ping` (a phone hears someone else's claim land,
  keyed off strikeFactor's new fresh-strike return). Fuse hiss stays
  live synthesis; every one-shot keeps its synth fallback. Audit
  suite gained a sound section (same-origin only, lazy fetch, toggle
  persistence).
- **M** `a3a8c268` - the resolve graph, plain SVG (an exact
  quadratic Bezier). Deltas: it draws on RESOLVE only; the survived
  fuse-out gets the thumbnail beside the reveal working instead
  (phones in the reveal phase AND solo), which is where the codes
  are actually visible. The 重根 tag sits left of the touch point,
  clear of the 拆 chop's slam. Key g toggles (host); legend now
  t / n / e / g.
- **L** `2a82bb30` - GSAP 3.12.5 core vendored. The collapse chain,
  condemned beat and report ceremony are labelled timelines (crack /
  fall / rubble / graph / stamp / dissolve / chop / turn; condemn /
  settle / turn; stars / chop). Label times match the old
  setTimeouts exactly, so the expected test churn never happened.
  Finale set piece: timeScale dips to 0.5 through the fall with the
  CSS tumble stretched via --falldur, a scene-wrap scale punch and
  the star rain on the chop label. Delta from plan: reduced motion
  does NOT jump timelines to progress(1) - that would advance
  rounds instantly and strand exactly the users who need time to
  read; instead timelines run real time (CSS snaps states as
  before) and the one reduced gate skips the finale set-piece
  tweens. tweenScore now rides gsap.to (same API, exact settle).
  Killing the live timeline in startLevel fixed a latent
  restart-mid-collapse double-advance.
- **simplify** `f55b26e2` - fx.js one-shot prelude factored into
  oneShot(name, synthFallback); boom/collapse stay explicit (dynamic
  sample choice). Deliberately not simplified: the timeline call
  sites (timing-critical, idiomatic GSAP reads clearest) and the
  generator script (its output is frozen).

Post-batch playtest fixes (2026-07-18, Kenny's notes): the how-to
note now states the fizzle rule (`597c27a8`); a wrong code lands ON
the structure - recoil, ink chips, surveyed strength pencilled over
the scene (`8e243e21`, pairs with batch O's reinforcement ink); and
the round now OPENS at fuse ignite (`044b71b1`) - the question was
readable under the level card with the pad live, so fast players
could speed-run buildings that hadn't drawn yet. Board and keypad
open together when the fuse lights, phones mirroring the projector
via deadlineEpoch - fuseMs, latched against +15s/grace re-covers.
Refined in `4a8d57ef`: the open beat is tied to the END of each
building's draw-in (per-level stroke count), the question writes
itself in left to right, and the deadline shifts with the beat so
the hold never costs fuse. Rhythm: card, drawing, then question +
fuse + keypad as one moment. Reduced motion (instant draw) keeps
the 850ms card-clear open.

game.json is 0.6.0. Batches N and O below are the plan as
re-evaluated before implementation; see the status block above for
what actually landed and the deltas.

Audited 2026-07-18 against the CONVENTIONS.md rule: a library is
vendored when a specific mechanic demands it, named in the PR, never
for modernity. Verdicts for Zero Blast:

**Adopt (the mechanic exists today):**

- **Howler (Tier 1)** - mechanic: a layered material soundscape
  (paper, rubber stamp, chalk, brick debris, deep rumble) delivered
  as an audio sprite to 30 phones and a projector with reliable
  mobile unlock. Live Web Audio synthesis carried the pilot but
  cannot express material; sample one-shots are the single biggest
  remaining craft gap after iteration 4. Howler is the delivery
  mechanism; the samples are the real work.
- **GSAP (Tier 1)** - mechanic: label-based overlapping timelines.
  The collapse/chop/report choreography is now eight magic-number
  setTimeout chains (380/530/1020/1180/1250/1350/1460/2200) plus CSS
  keyframes; iteration 4 doubled its complexity and every retiming
  is manual arithmetic. Timelines also unlock a finale set-piece
  (slow-mo last collapse) that CSS cannot stage cleanly.

**Defer (no Zero Blast mechanic demands them - named triggers):**

- **KaTeX** - the mono + serif-italic board IS the worksheet
  identity, and the factor strike-through depends on our own factor
  spans (KaTeX's generated markup would break the pillar-id keying).
  Trigger: the first game whose maths needs fractions, surds or
  indices (SM902 completing-the-square / quadratic-formula game).
- **JSXGraph** - the parabola reveal below is a static sketch, plain
  SVG does it. Trigger: a game where students DRAG roots/graphs and
  the curve updates live.
- **Phaser/PixiJS** - Zero Blast is turn-based; no continuous
  real-time sprite mechanic. Re-rendering the FX layer in Pixi would
  be decoration, which the contract forbids. Trigger: the first
  continuous-motion game (prefer Phaser per contract).

**Tier 2 (sign-off territory):**

- **three.js/Babylon** - no: the topic is algebra, not 3D-native,
  and the contract bans 3D as decoration.
- **Rive** - only if the series adopts a mascot. Zero Blast's
  inspector voice (檢定完成 chop, tutor beats) is a natural mascot
  seed, but that is a brand decision for Kenny + Steve, not a batch.

**Beyond libraries** (production tier, unchanged pending list):
deploy `game-rooms` RTDB rules (Kenny's firebase auth) then a LIVE
multi-phone rehearsal, `games.` subdomain, Phase 2 lesson panel,
confirm the name with Steve. Watch: SVG filter cost on the projector
during tremble (fx gate covers phones already).

### Batch K - the sample soundscape (vendor Howler)

- Produce our own kit, no licensing at all: richer layered synthesis
  (noise bursts through body resonances, convolution tails) rendered
  OFFLINE to WAV via OfflineAudioContext in a Playwright script,
  committed under `zero-blast/audio/`. One-shots: stamp thunk, chop
  slam, crack, boom small/large, collapse rumble, debris patter,
  fizzle, tick, key click, knock, star chime, page turn, echo ping.
- Encoding: no ffmpeg on the box today. Either Kenny apt-installs
  ffmpeg for an opus/webm sprite (preferred, ~10x smaller), or ship
  short mono 22.05k WAVs with a hard 400KB total budget.
- Vendor `shared/vendor/howler.min.js` (MIT, ~40KB) + NOTICE line.
- `ZBFX.audio` keeps its exact API: one-shots route through a Howler
  sprite; the looping fuse hiss STAYS live synthesis (it tracks burn
  urgency continuously - synthesis is the right tool there); full
  synth fallback kept when the sprite fails to load.
- Tests: no external requests (route hook asserts same-origin),
  toggle persists, suites green with sound off (default) unchanged.

### Batch L - GSAP set-piece choreography (vendor GSAP core)

- Vendor `shared/vendor/gsap.min.js` core only (GSAP standard
  licence, free incl. commercial; note in PR).
- Port the collapse chain (crack/fall/rubble/stamp/slam), fuse-out
  condemned beat and end-report ceremony to labelled timelines;
  ambient loops (beacons, clouds, tremble, attract, page turns) stay
  CSS. Keep the total collapse beat ~2.2s so multi timings hold.
- New finale set-piece: last collapse gets a slow-mo overshoot, a
  scene scale punch and star rain timed to the chop label.
- Reduced motion: one gate, timelines jump to progress(1).
- Test churn expected: fixed waits around collapse in all three
  suites retuned once.

### Batch M - the parabola reveal (Tier 0, deliberately no library)

- The pedagogy bridge to SM902: when a building resolves, a faint
  pencil parabola y = (x-a)(x-b) sketches itself across the sky
  band, dipping through the inked rootmarks (x-intercepts ARE the
  codes). Kind 5 draws the tangent parabola (double root touching
  the ground once) - the best possible picture of 重根. Kind 1
  draws the line y = kx through the origin instead.
- Solo + host scenes; tutor toggle on key g; phones get a thumbnail
  sketch beside the reveal working.
- Plain SVG path from the level's roots, no JSXGraph.
- Tests: parabola present after resolve, single touch point for
  kind 5, key g toggles, reduced motion static-visible.

### Batch N - street life and characters (Tier 0)

Students rate quality by production values, not realism; characters
are how Kahoot and Duolingo make flat vector feel authored. Ours
arrive in the house style: tiny ink people.

- **Work crew**: two or three stick-ink figures loitering near the
  building while it draws in (leaning on the kerb, pointing at the
  plan); when the fuse enters the warn window or grace begins they
  scatter offscreen at a run. Positions clear of pillars, plaques
  and rootmarks.
- **Foreman**: stands by the detonator (already drawn at the bottom
  left); on the final claim he pushes the plunger - one squat pose
  swap timed with the collapse crack. He IS the series' mascot seed
  (see the Rive note above).
- **Inspector**: a small figure beside the report's 檢定完成 chop on
  the end screen, clipboard in hand.
- All figures a few strokes each, ink only, never red; reduced
  motion keeps them static (poses swap, no run animation).
- Tests: crew present during the burn, scatter class fires in the
  warn/grace window, foreman pose swaps on the final claim, reduced
  motion leaves figures visible and static; suites green.
- *Re-evaluated after K/M/L:* the batch got cheaper and better.
  The foreman's plunger push is now literally
  `tl.call(pose, null, "crack")` on the collapse timeline - hook
  the labels, do not add timers. The crew scatter keys off the
  existing warn window in fuseFrame (same beat as the tick). No new
  audio needed: the scatter can ride `debris`, the plunger already
  has `crack`/`rumble`. Characters live at kerb height, so they
  never collide with the resolve graph (its dip stays above the
  rubble line). Scope unchanged.

### Batch O - the illustrated depth pass (Tier 0)

The gap between a napkin sketch and a beautiful architectural ink
drawing, without ever leaving ink.

- **Second ink tone**: a light wash (ink at low opacity, never red)
  for shading - under eaves, down one side of each pillar, cloud
  undersides, rubble shadow. One consistent light direction.
- **Characterful silhouettes**: two or three alternates per kind
  with Macau vernacular flavour - tong lau shophouses with 騎樓
  arcades, rooftop water tanks, AC units, signage strokes, laundry
  lines between floors. Deterministic pick (hash of seq, like the
  variant transform) so host and screenshots agree. No recognisable
  landmarks: demolishing those reads wrong.
- **Depth layering**: a faint far street line behind the building
  (kerbs, a lamp post), slightly heavier foreground strokes, so the
  scene stops being a single flat line drawing.
- **Detail density**: doors, window mullions and rooftop clutter on
  the existing six kinds, kept clear of plaques and marks.
- **Pillar reinforcement ink**: the pillars should read formidable -
  only the correct zero punches through them - but in the blueprint
  idiom, never bulk: slightly heavier verticals, denser
  cross-bracing, concrete footing blocks with section hatching. The
  plaque band stays the focal point. Pairs with the wrong-code
  resistance beat that already landed (`8e243e21`): the drawing
  recoils and shrugs the blow off, ink chips off the standing
  pillars, and the surveyed strength (the product at the guess,
  visibly not zero) is pencilled over the scene.
- Tests: alternate choice deterministic under ?seed, wash layer
  present and red-free (style assertion), scene text still readable
  (plaque/rootmark overlap check), light + dark screenshots
  refreshed; suites green.
- *Re-evaluated after K/M/L:* one new constraint - the resolve
  graph now owns the sky band. Keep the graph corridor readable:
  silhouette alternates and rooftop clutter must not densify the
  upper-right corner where the y = ... label lands (beside the
  crane), and the far-street depth layer stays below the deck line.
  The wash is plain SVG opacity, so it passes the fx=lite gate
  untouched. Scope otherwise unchanged; the seq-hash pick mirrors
  variantTransform as planned.

### Recommended order (updated 2026-07-18)

Done: K -> M -> L (plus the simplify pass) -> N -> O. Iteration 5 is
complete; the polish backlog is empty. What remains is production
tier: deploy the game-rooms RTDB rules (Kenny's firebase auth) then
a LIVE multi-phone rehearsal, the games. subdomain, merging PR #82,
the name sign-off with Steve, and Phase 2's lesson panel. Reality
check during the SM901 pilot: watch the students' first 30 seconds -
they will say whether it feels premium faster than any audit.

## 13. Iteration 6: the amplitude audit

**Status (2026-07-18): iteration 6 COMPLETE - R, Q, P, S, T all
landed** (suites green between batches: solo 133 / multi 104 / audit
55; game.json 0.7.0). Implementation deltas in 13.1 below the
batch specs.

**The finding (2026-07-18, Kenny's fresh-eyes playtest):** after five
iterations the game is high-craft but low-amplitude. Kenny played the
finished iteration 5 and saw "no difference" - and he is right at the
distance that matters. The washes are 7% opacity, the figures are
12px tall, the dressing is 1.2px strokes: it all reads on a zoomed
screenshot and disappears at arm's length, let alone from the back
of a classroom. We have been sharpening detail density when the gap
to "premium" is now presentation amplitude. Measured evidence:

- **The subject is small.** The scene is a 400x240 viewBox capped at
  ~300px tall (solo laptop) and the buildings occupy 21%x28% (kind
  1) to ~34%x58% (kind 6) OF that viewBox. The shed is smaller on
  screen than one keypad key. The camera never moves. Premium mobile
  games fill the frame with the subject and move the camera
  constantly; we compose like a framed elevation drawing - dignified,
  and distant.
- **The payoff is quiet.** At the moment of detonation - the entire
  point of the game - roughly 90% of screen pixels do not change.
  Chunks drop 66 viewBox px, debris is small ink flecks, the chop is
  modest, +N 分 floats at 18px. No flash, no shockwave, no hit-stop,
  no camera reaction (the finale's slow-mo + punch is the ONLY
  screen-level event, once per game).
- **The big stage is silent.** Sound defaults OFF for solo and host;
  the entire batch-K soundscape hides behind a small quiet icon that
  no tutor will find mid-lesson. Phones default on; the projector -
  the surface the class shares - stays mute.
- **Dead screen everywhere.** Laptop 1280x800: the bottom ~40% is
  empty cream. Phone 390: a ~250px dead band between scene and
  keypad. The scene never grows into available height.
- **The intro undersells.** A static 230px doodle and two heavy red
  slabs. Nothing on the first screen promises a demolition. Kenny's
  own metric is the first 30 seconds.

None of this needs new libraries: GSAP + Howler (already vendored)
cover all of it. Constraints unchanged: red stays the teacher's pen
(the blast flash is paper-white, the shockwave is ink), reduced
motion gets framing without movement and stamps without flashes,
fx=lite paths untouched, and the multi timing contract (turn label
at 2.2s, shared deadlines) must not move.

### Batch R - sound is part of the show (do this first, ~free)

- One-time offer on the big stage: when a solo/host run starts with
  no stored preference, the first level card carries a single toggle
  chip - 開聲玩先夠爆！/ "Play it loud" - one tap (the gesture doubles
  as the autoplay unlock), remembered forever, never nags again.
- Mix pass at classroom level: boom_l actually landing on multi
  collapses, ticks louder in the last 3s, fuse hiss ceiling raised a
  notch, patter/page/chime balanced under the booms.
- Optional (only if the mix wants it): a whoosh + deep release thud
  for batch Q's hit-stop; sprite is 374.7KB of the 400KB budget, so
  trim tails when regenerating or keep them synth.
- Tests: prompt appears exactly once on fresh storage, never with a
  stored pref; choice persists; the existing lazy-fetch/same-origin
  sound section keeps passing.

### Batch Q - the detonation grammar (payoff amplitude)

Every collapse becomes a screen event, scaled by building size:

- 90ms hit-stop at the crack label, then a one-frame paper-white
  flash (opacity 0.9 -> 0, never red), an ink shockwave ring
  expanding from the deck base, debris count x2.5 with a few big
  torn-paper chunks, and a scene punch (the finale's scenewrap scale
  punch promoted to every collapse; batch P upgrades it to a real
  camera move).
- The 拆 chop lands HUGE - scales from ~3x down onto the pile with
  the existing compact beat - and the points burst in display type
  (~40px) beside the building, then fly to the header score, which
  bumps on arrival.
- Tension ramp: in the last 3 seconds the sky band darkens slightly
  and the fuse spark grows - back-of-the-room visible.
- The fizzle stays deliberately quiet (contrast is meaning): a dust
  sigh, the condemned chop a touch bigger, nothing else.
- Reduced motion skips hit-stop/flash/shockwave/punch whole; the
  chop simply appears at rest. fx=lite keeps its existing particle
  scaling. The turn label stays at 2.2s so multi deadlines and every
  suite timing hold.
- Tests: flash mounts once per collapse and unmounts <400ms; ring
  present; chop scale beat applied; reduced-motion run clean; the
  three suites' collapse waits unchanged.

### Batch P - the camera (stage presence)

The transformative batch, and the most work:

- Dynamic framing: per-building viewBox targets computed from the
  deck+pillars bbox so the subject fills ~55-70% of the frame (the
  shed becomes monumental; kind 6 already nearly fills). Ground
  line, rootmark band and survey notes stay inside the frame.
- Camera moves on existing labels via one gsap-tweened viewBox
  proxy: a slow 1-2%/s push-in through the warn window, a 4% punch
  on the wrong-code shrug (pairs with the recoil), and the blast arc
  - punch toward the building, follow the fall down, pull back to
  rest for the graph + report. Rest frame between rounds.
- Scene-first layout: the scene grows into viewport height (laptop
  bottom band, the phone's ~250px dead middle); the keypad stops
  outweighing the stage.
- THE engineering cost: canvas FX (sparks/debris/dust) map viewBox
  coords to canvas pixels assuming the static 400x240 frame. With a
  live viewBox the mapping must go through the current frame
  ((x - vb.x) / vb.w * canvas.w). One conversion helper in fx.js,
  used by sparksAt/debris/dust/splatter; a spot test asserts the
  fuse spark lands on the fuse tip under a zoomed frame.
- Reduced motion: framing YES (each building gets its computed
  frame, set instantly), movement NO (no creep, no punches, no
  follow). Tests: fill ratio >= threshold per kind, camera at rest
  before each round opens, FX alignment under zoom, reduced static.

### Batch S - the first 30 seconds (intro spectacle)

- The hero becomes an attract diorama: a mini building draws in, a
  2-3s fuse burns, it tumbles, 拆 stamp, page wipe, next silhouette -
  the lobby attract-loop machinery reused, pure CSS/SMIL, reduced
  motion keeps today's static vignette.
- 歸零爆破 stamps in character by character (mc-stamp-in staggered),
  the swash sparking after the last; CTAs slimmed so the diorama
  owns the screen (多裝置 primary, 單機 quiet).
- Tests: loop cycles, reduced static, both languages, no layout
  shift on either CTA.

### Batch T - phones feel the blast (multi juice)

- The claimer's phone: a full-card 歸零 stamp takeover (400ms, name
  + points) + the existing vibrate; everyone else's phone: soft thud
  and a 1.5% card tremble on any claim; grace 3-2-1 mirrored big on
  phones; fizzle = condemned card.
- The end screen on each phone becomes a personal mini-report: own
  rank, stars, echo tally, best time.
- Tests: multi suite asserts takeover on the claimer only, tremble
  on the other phone, personal report fields per phone.

### Recommended order

R -> Q -> P -> S -> T. R is hours and changes how the room feels; Q
makes every 35 seconds end in an event; P is the deep fix that makes
the subject fill the screen (and retro-upgrades Q's punch into a
real camera move); S sells it in the first 30 seconds; T closes the
loop on the surface students hold. If one session only: R + Q. The
honest framing for the pilot: iterations 1-5 built the craft; this
one turns the volume knob.

### 13.1 Implementation deltas (2026-07-18)

All five batches landed same-day, in order, suites green between
each. Commits: R `f6ff8f1c`, Q `c9e7cd13`, P `da62e6ae`, S
`73d296b3`, T `316b2fc0`. Notable deviations and the reasons:

- **R** - the offer chip lives in the SCENE, not literally on the
  level card: the card clears in 1.25s, too brief for a one-time
  offer, so the chip stamps in under it and stays until answered.
  Three resolutions all store the answer: the tap (setOn(true) +
  unlock on the same gesture), the header toggle, or round 1 ending
  unanswered (stores "off" - never nags again). The ack fade had to
  be an ANIMATION, not a transition: the stamp-in keyframe's fill
  owns opacity, so a transition never fires. Mix: boom_l layered
  into every collapse ahead of the rumble, ticks jump 0.55 -> 1.0
  volume in the last 3s (tick(urgent), remain <= 3050), fuse hiss
  ceiling 0.035+0.085u, patter 0.5 / page 0.65 / chime 0.8 via a new
  per-play sprite volume (sample(name, vol) / oneShot(..., vol)).
- **Q** - the whole grammar lives inside the fixed crack->fall gap:
  hit-stop fires at tl 0.44 (blastHold: zb-hitstop class pauses the
  scene's CSS animations, ZBFX.hitStop freezes the canvas world and
  the shake offset; G.hitStopAt for tests), flash + shockwave +
  scraps + frame punch fire inside the existing fall call. No label
  moved; the suites' collapse waits pass untouched. The flash is
  var(--mc-paper) with a chalk-pale dark override. Scraps are a new
  canvas particle: paper-filled quads with inked edges, readable at
  classroom distance where 3px shards are not. The last-3s ramp
  (sky dim + spark 4.6) is a STATE, not a motion - kept under
  reduced motion, cleared by +15s style deadline relief.
- **P** - the frame matches the scene box's LIVE aspect instead of a
  fixed 5:3: no letterbox means canvas FX stay aligned and nothing
  renders in a margin (the batch-N runner bug class is gone by
  construction). Frames are bottom-anchored at 240 (rootmark band),
  h = (GROUND - deck.y) + 26 + 30 - the 26 fits the survey width
  label - and w = max(h*A, bbw/0.7, bbw+52) clamped to the sheet.
  renderStructure runs a probe pass (deck alone, measured) before
  the real pass so the set can be dressed for the frame: detonator
  and foreman translate to the frame's left edge, the fuse
  compresses by ratio (or swaps to a short quad run when the road
  d2 <= 45), the crew slides in from the right edge, the title
  block pins to the frame corner. Camera beats: 7% settle-in on
  render, creep to 0.92 across the warn window, 0.96 punch on the
  shrug (re-hands to the creep), blast arc 0.88 punch/follow/pull
  back - at rest by ~1.75s, before the 2.2s turn. fx.js converts
  through the live view (setView/toPx) and scales counts by
  effective zoom (the suite's dust cap moved 20 -> 32). Scene-first
  heights: 62vh projector (stage 1250px), 40vh default, 30vh
  portrait phones - the 0 key stays above the fold with marking up
  (measured 838/844 worst case). floatPoints maps through CAM.
- **S** - pure CSS: a 21s loop of three 7s acts (house, water
  tower, factory). Group keyframes carry opacity + tumble; child
  paths ride 21s draw keyframes on --dd delays. The fuse burn is a
  dash consume with the spark on CSS offset-path. Two learned
  rules: the felled silhouette must LIE THERE (opacity 0.55) under
  the chop until the wipe, or the stamp floats over empty ground;
  and the wipe rect parks outside the viewBox, so the hero needed
  overflow: hidden. Title chops per character (per word in EN),
  re-split on mc:lang; the swash SMIL begins retimed to 1.05s.
- **T** - takeover reuses .zb-chai at 36px over a fixed overlay;
  tremble is a 0.3s class re-trigger on #ctrlPlay; the thud rides
  the stamp sample at 0.55. Grace numerals reuse .zb-gracenum
  inside #ctrlPlay (now position: relative). The condemned card is
  .zb-board.condemned - a ::before tape cross and an ::after chip
  reading attr(data-condemn), set at runtime for i18n, cleared on
  the next level key. The personal report needed GAME-LONG
  counters: echoDone is per-round state (reset every startLevel),
  so the report reads new G.echoCountBy and G.bestMs (min solve ms;
  a grace-window echo computes against the rewritten deadline and
  comes out huge - Math.min discards it). Both are in the host-run
  snapshot, so a host refresh keeps the report honest.

Watch-list additions: the sound-offer chip overlaps the grace-
numeral zone if a multi round resolves during round 1 (cosmetic,
both transient); CSS offset-path support on very old classroom
Androids (the spark simply never shows - the diorama still reads);
the phone report shows 0.0s best on sub-100ms mock solves (real
classes cannot produce this).

## 14. Iteration 7: the tablet frame and the soundtrack

Two items from Kenny's tablet playtest of iteration 6 (2026-07-18).
Status: COMPLETE - batch U `412637ae`, batch V `3cfde7bb` (2026-07-18,
same day). Suites green after each batch: solo 135 / multi 110 /
audit 70; game.json 0.8.0. Implementation deltas in 14.1.

### Batch U - the tablet frame fix (do first, it's a real bug)

**Symptom:** on tablets the building's top is often clipped off.

**Reproduced and measured** (probe: 1024x768 iPad landscape, solo):
the scene box lands at 584x230 (aspect 2.54) and the camera frame
caps at the 400-unit sheet, so h = 400/2.54 = 157.5 anchored at the
bottom - the frame starts at y=82.5. Kind 5's chimney (top y=28)
loses 54 viewBox units; kind 6's tower (top y=7) loses 75 - HALF the
building. Kind 1 keeps the roof by 0.1 units but loses all headroom
(survey label, beacon). Meanwhile the page has a dead band UNDER the
scene, so the height was stolen for nothing. Two compounding causes:

1. **computeFrame has no fallback when the sheet caps the width.**
   `if (w > VB_W) { w = VB_W; h = w / A; }` can push h below the
   subject's needed height; the frame is bottom-anchored (rootmark
   band), so the top is what clips. Fix: keep the needed height and
   accept a horizontal letterbox instead -
   `if (w > VB_W) { w = VB_W; h = Math.max(w / A, neededH); }`.
   preserveAspectRatio meet centres the drawing; fx.js toPx already
   computes the ox/oy letterbox offsets, so canvas FX stay aligned
   (extend the FX-alignment spot test to a letterboxed case). The
   only cost is paper margins left/right on extreme boxes - correct
   behaviour, the sheet is only 400 units wide.
2. **The compact-phone media query catches landscape tablets.**
   `@media (max-height: 780px)` was written for short PHONES but a
   768-tall iPad matches it, shrinking the scene to 30vh/230px and
   creating the extreme aspect in the first place. Fix: guard it
   with width (e.g. `(max-height: 780px) and (max-width: 700px)`)
   so tablets keep the default 40vh; consider a dedicated
   tablet-landscape band (701-1099px wide): scene ~48vh, possibly
   the landscape-phone side-by-side grid - a tablet in landscape is
   a mini projector. Also worth evaluating: dropping the projector
   breakpoint 1100 -> ~1000 so 1024-wide iPads get the full
   projector grid; check the 62vh scene and 1.7fr/1fr columns at
   1024x768 before committing to that.

Tests: an audit-suite tablet section sweeping all 6 kinds at
1024x768, 1138x620 (browser chrome eating height) and 768x1024:
assert `CAM.y <= deckBBox.y - 8` (top in frame WITH headroom), the
ground + rootmark band still in shot, fill ratio still >= 0.55 in
the dominant axis, and the fuse-spark alignment check under a
letterboxed frame. Keep the existing phone fold checks green (the
0-key stays above the fold with marking up).

### Batch V - BGM (recommendation: yes, sequenced, big stage only)

**Should the game have BGM? Yes** - the students' benchmark is
Kahoot, whose lobby groove IS the classroom energy; a silent stage
reads as unfinished next to it. But a tutoring centre is a shared
space, so three hard rules: BGM rides the existing sound opt-in
(the offer chip / header toggle - no separate nag), it sits LOW in
the mix and ducks hard under the blast, and it NEVER plays on
student phones (30 phones x music = chaos; phones keep one-shots).

**Technique - a runtime Web Audio step sequencer, zero asset
bytes.** A rendered music loop was considered and rejected: 16s of
mono 22k WAV is ~700KB against the 400KB sprite budget (374.7 used),
and opus/mp3 would need ffmpeg or heavier vendoring. A sequencer
costs nothing, stays Tier 0 (no new libraries), and - the real win -
can react to game state, which a file cannot. Musical direction:
"construction site groove" to match the theme - woodblock/claves
ticks, a low tom pulse, an occasional metal tink, ~76-84 BPM, sparse
and dry, master bgm gain ~0.12-0.15 under the 0.9 one-shot bus.

- fx.js gains a `bgm` module: start/stop, setIntensity(tier),
  duck(ms). Lookahead scheduler (~25ms tick, 0.1s horizon) on the
  existing AudioContext; all nodes through one bgm gain.
- Intensity follows the round: lobby/intro sparse shaker only;
  playing = base groove; warn window adds the tick layer (paired
  with the camera creep); grace = tight roll; collapse = hard duck
  (~150ms) then resume next round; fizzle = drop to sparse; end
  report = silence (the ceremony one-shots own it).
- Wiring: startRun/startLevel set tier, fuseFrame's warn latch and
  enterGrace bump it, collapseAndAdvance ducks, endGame stops.
  Solo + host only - initController never starts it.
- Tests: bgm scheduling only when sound is on; silent on the
  controller; tier changes at warn/grace observable via a
  `bgm.state()` census; duck on collapse; stopped on the end
  screen; the same-origin/no-fetch sound checks stay green (no new
  network requests at all).

Order: U then V. U is a correctness fix for hardware the centres
actually hand out; V is the last amplitude item the audit left on
the table.

### 14.1 Implementation deltas (what actually shipped)

**Batch U (`412637ae`)** - as planned, plus both "evaluate" items
resolved in favour:

- computeFrame: `if (w > VB_W) { w = VB_W; h = Math.max(w / A,
  needH); }` - the letterbox fallback, exactly as specced. Probe:
  all 12 viewport x kind cases now rest at the full 26-unit
  headroom (was: kind 6 losing 75 units at 1024x768).
- The compact rule is width-guarded: `(max-height: 780px) and
  (max-width: 700px)`. The landscape-phone rule gained its own
  `.zb-key { min-height: 48px }` because compact used to reach
  844x390 phones and no longer does.
- Tablet band SHIPPED: `(min-width: 701px) and (max-width: 999px)`
  gives the scene `clamp(240px, 48vh, 520px)`. (The band ends where
  applyProjector begins - a 1000-1099 stretch would be dead CSS,
  permanently shadowed by the projector class.)
- Projector breakpoint DROPPED to 1000 (applyProjector + QR size).
  Probed host at 1024x768 with the grid forced: scene 602x476, no
  overflow either axis, fold overflow 11px vs 38px single-column -
  strictly better. Side effect worth knowing: applyProjector runs
  for EVERY mode, so solo on a 1024-wide iPad gets the projector
  grid too (scene left, keypad right, everything above the fold) -
  probed, kept. Consequence: at 1024x768 the letterbox fallback
  never engages (friendlier scene aspect); it engages on squat
  boxes like 1138x620, which is where the audit asserts it.
- Audit gained section 9: 6 kinds x 3 viewports (1024x768,
  1138x620, 768x1024) - headroom >= 8, ground band in shot, fill
  >= 0.55, letterbox engagement + fx spark alignment at 1138x620.

**Batch V (`3cfde7bb`)** - as planned, small deltas:

- fx.js `bgm` module: 78 BPM, 16-step bar, four voices (claves
  1160/1680 Hz sine chirps, tom 118->52 Hz, highpass-6200 grit off
  the shared noise buffer, 2794 Hz triangle tink). Bus 0.14 into
  master. Lookahead: 25ms interval, 120ms horizon, skip-ahead guard
  for throttled tabs (jump the missed bar, never machine-gun it).
- API: allow / setIntensity / duck / stop / sync / state. `sync()`
  is the delta from plan: audio.setOn calls it so the opt-in chip
  or header toggle starts/stops the groove mid-round.
- Wiring beyond the plan list: btnMenu stops it (back on the
  silent cover), and the collapse ALSO drops warn -> base so the
  tick layer never rides the rubble reveal. The big-stage gate
  lives at the boot fork (`allow(true)` where the page decides
  menu vs controller) with initController revoking via
  `allow(false)` - a defensive invariant, not a per-entry chore.
  A fizzle sets tier "idle" (same pattern as "lobby" today, own
  name so lobby tuning never leaks into the reveal). All play/halt
  decisions funnel through one private `update()` (also bound to
  visibilitychange: a throttled hidden tab goes silent instead of
  plinking once a second). fxScale now converts through the same
  meet scale as toPx, so letterboxed frames don't overstate zoom.
- Ducking: cancel ramps, 40ms down to 8%, hold 150ms, 500ms back.
  `state().ducks` counts for the suites.
- Tests: state() census asserted across solo (armed-but-silent when
  sound off, mid-round opt-in/out), multi (lobby/base/grace tiers,
  duck >= 1, controller silent WITH sound on, end stop) and audit
  (base/warn/duck/end on a one-round run; same-origin unchanged -
  the groove adds zero fetches).

Watch-list additions: bgm feel at real classroom volume (the 0.14
bus is a guess until Kenny hears it on the centre speakers);
whether the lobby groove should also play on the solo COVER after
a menu exit (currently silent by design); old-Android setInterval
throttling under screen-dim (the skip-ahead guard handles it, but
the groove will thin out).

## 15. Pre-pilot hardening (implemented 2026-07-18, from the 7-perspective audit)

The pre-pilot audit (report: docs/companion-games/zero-blast-pre-pilot-audit.html)
returned 1 blocker + 16 high. Everything the audit gated the pilot on is
implemented; game.json 0.9.0. The five batches, in fix order:

**S1 - lock the database (the blocker).** Live RTDB had NO game-rooms
rules (default deny - live multi could never have worked; the drafted
prose rules would have shipped an open subtree instead). Real rules now
live in growing-minds `webapp/database.rules.json`: anonymous auth
required, reads only at room level (slug parent unenumerable), room
create/state/verdicts scoped to the creating hostUid, stale rooms (>6h)
reclaimable, players/<id> pinned to the joining device's uid with a
24-char name validate, subs/<id> writable only by the owning uid (kills
seq-griefing and claim forging). GameBridge implements the client half
over REST (per-device identity in localStorage, securetoken refresh,
401 retry-once, SSE auth_revoked rejoin), writes hostUid at creation,
checks it on reclaim, and mints 6-char crypto room codes (no 0/O/1/I).
Defence-in-depth in the game: controller levels are shape-checked and
coerce numerics on arrival, level text renders escaped (the one
innerHTML path name-escaping never covered), verdict values must be
numeric, host filters player ids to the client shape (`__proto__` keys
corrupted the seq dedupe) and truncates names.
DEPLOYMENT (manual, before any live multi test):
  1. Firebase console -> csm-database-project -> Authentication ->
     Get started -> Sign-in method -> enable **Anonymous**.
  2. `cd growing-minds/webapp && firebase deploy --only database`
     (rules committed on growing-minds main).

**S2 - the two confirmed breakers.** Host 再拆一次 no longer bricks
phones (the end screen killed the tick interval; end->playing restarts
it, ctrlEnd clears the level key so same-seed restarts re-render).
Pillar x-positions rank by root - the resolve graph's x-intercepts
always increase rightward and agree with the phone thumbnail; the
equation keeps its factor order (kind 4's shuffle stays the trap).

**S3 - phone resilience.** Submits: sent/marking beat, pad soft-closed
in flight, one silent retry, seq advances only on success, 2.5s
verdictless reopen; subs and verdicts are level-bound ({lv}) both ways.
Identity mirrors to localStorage so a QR re-scan resumes the same
player with their score. Keypad commit window 400->750ms with a
visible drain (the "7 then minus" order on 正負陷阱 died in 400ms).
All epoch math runs on GameBridge.serverNow() (HTTP Date estimate;
REST has no /.info/serverTimeOffset).

**S4 - tutor safety net.** Run snapshots mirror to localStorage + a
lobby snapshot at creation (closed tab / pre-start refresh no longer
strands the class); 接手房間 reclaim-by-code on the cover (same device
only - hostUid rules make cross-device hijack impossible, and that is
deliberate); mid-game kick via host-board rows (lobby arm pattern),
phones detect removal in any phase and can rejoin; duplicate names
suffix at join; the unanswered sound offer stores nothing (re-offered
next run); 下一關 pulses during a held reveal.

**S5 - difficulty and scoring.** Negative roots unlock only after a
kind-4 stage has finished (gen() negOk, derived in genPlan): 0 early
negatives over 500 seeded runs, was 100%. Kind-3 hard flips each sign
independently (~25/50/25). Double hits pay 1.5x and kind 5 sits out
the mixed street (the one-tap read-off was the game's biggest payout).
Solo kind-6 hint is opt-in (提示 chip, pays 75%; tutors' fee softens to
x0.75 too); half fuse now gives a sum/product nudge that yields to
working being read.

Suites: committed to the repo at webapp/frontend/tests/games/zero-blast/
(they lived in a scratchpad through 7 iterations - an audit HIGH),
recreated to the final green specs and extended with regression
coverage for the S2/S3/S4/S5 behavior.

**Deferred-items sweep (implemented 2026-07-19).** Everything the
first pass deliberately left, plus one field bug Kenny hit:

- *Hint invisibility (field report).* Pressing 提示 showed only the
  fee note: the ghost factor rendered faint-ink with no fade (the
  .din2 draw-in rule outranked .zb-hintghost by source order, and
  .zb-struct.wait's delay rule re-imposed a 2.4s draw-in stagger).
  Now: own keyframes at delay 0 in soft ink over a gold highlighter
  swipe on the plaque, the note names the factor, and the solo chip
  is disabled until the round opens. Suite-guarded by computed-style
  visibility checks, not just DOM presence.
- *Answer key stripped from published state.* publicLevel() publishes
  pillars as id+label only; claims name the claimer, never the root;
  verdicts carry host-computed working lines (+ strength); fuse-out
  publishes a level-bound reveal payload that mergeReveal() folds
  into the phone level for the roots line and minigraph.
- *Pause.* 暫停/繼續 beside the fuse timer (both modes) + tutor key p;
  PAUSED veil; host publishes phase "paused" with the frozen
  remaining, phones freeze and close the pad, judging defers (subs
  stay unconsumed), resume republishes playing with a fresh
  deadlineEpoch and keeps the student's private working on screen.
  Grace and the held reveal are not pausable.
- *rem + contrast.* html{font-size:100%}; theme.css and all reading
  text (board, keypad, notes, statuses, buttons, records) in rem so
  the browser font preference works; scene-internal SVG text stays
  px by design. Grace 3-2-1 numerals press in full --mc-red (were
  2.7:1 / 2.3:1, below the 3:1 large-text floor).
- *Cover copy.* 12 座建築 · 約 15 分鐘, matching game.json's
  duration_min 15 (final wording still Steve's call).
- *shared/ promotion.* fx.js split: the house engine (particles,
  camera mapping, shake, hit-stop, audio context + synth primitives,
  sampler harness, bgm sequencer + play policy) now lives in
  shared/fx-core.js (window.MCFXCore); zero-blast/fx.js is the
  demolition skin (groove voices, one-shots, fuse hiss) exporting the
  unchanged window.ZBFX surface. The round protocol's mechanical
  parts (PID hygiene, crypto newPid, the seq-dedupe judging loop
  with pause deferral + level binding) live in
  shared/room-protocol.js (window.MCRoom), adopted by zero-blast,
  and the full protocol contract is documented in CONVENTIONS §6.5.
  The _template (6 iterations stale) was rebuilt as 配對挑戰 Match Up:
  a trivial mechanic carrying the whole contract end to end (shared
  modules, no-answer-key publish, sent-beat subs, kick, phone-side
  resume, pause, serverNow timers, graceful host failure), on the §7
  manifest shape. (HOST-refresh recovery was added to the template in
  the §16 follow-up; the original rebuild left it out.)

The three Zero Blast suites stay green throughout: solo 149, multi
137, audit 74 (was 143 / 124 / 71 before this sweep). Nothing from
the original 7-perspective audit is now deferred without a trigger;
the remaining backlog is product/ops, not audit debt: merge PR #82,
the games. subdomain, confirming the name 歸零爆破 with Steve, and the
Phase 2 lesson panel + registry.

## 16. Deferred-sweep re-audit (implemented 2026-07-19)

A fresh five-perspective audit over everything the deferred sweep (§15)
touched, each perspective browser-verified against the running game
rather than read-only. Three came back clean: the answer-key strip
(all six kinds + hint + verdict paths, 20 room writes enumerated, no
root/hidden reaches a phone pre-reveal); the shared-module extraction
(full ZBFX surface intact, no `this`-binding traps in the fx-core
factories, MCRoom dedupe/level-binding/pause-deferral preserved, zero
pageerrors on the happy path); and the grace-numeral contrast + copy
conventions (>= 3:1 both themes, bilingual, em-dash-free). Five real
findings were fixed:

- **Pause did not survive a host refresh (medium).** saveHostRun
  omitted the pause state and togglePause never snapshotted, so an
  accidental F5 mid-pause resumed the class live and bled the frozen
  fuse (recomputed from the stale wall-clock deadline, floored at 5s).
  Fix: the snapshot now carries `paused`/`pauseRemainMs` (remaining
  measured from G.pausedAt, since performance.now keeps advancing under
  the veil), togglePause writes it, and startLevel re-enters the paused
  state on reclaim - held at the frozen remaining until 繼續. Regression
  covered in the multi suite (host F5 mid-pause: resumes paused, fuse
  preserved, phone stays frozen).
- **Template judging loop never idle between rounds (medium).** The
  rebuilt _template reused zero-blast's `idle: !started || over`
  predicate but redefined G.over as whole-game-over, so in the ~1300ms
  inter-round gap a late correct tap (phone pad still live) scored after
  the buzzer and re-fired endRound - skipping a question and
  double-publishing the next round. Because authors copy the template,
  the bug shipped into every future game. Fix: a per-round G.resolved
  flag, set in endRound (with a re-entry guard) and cleared in
  startRound, wired into idle() - exactly zero-blast's per-round
  semantics.
- **How-to SVG text scaled with the browser font (medium).** `.zh-t`
  (glyphs inside a fixed viewBox) was converted to rem in §15; it
  should stay px like every sibling scene-text class, else it grows
  and clips inside the box at a raised font preference. Reverted to px.
- **End-report chop scaled with the browser font (medium).**
  `.zb-endchop` - an aria-hidden decorative stamp - was rem, so at a
  24px root it grew ~40% and its rotated corner clipped past the sheet.
  Reverted to px (the same principle as `.zh-t`: decorative ink is
  fixed, only reading text scales); identical at the default font.
- **Four reading headings still hardcoded px + a mis-scoped host string
  (low).** The lobby / name / end titles and the name input were missed
  by the rem pass (converted, keeping the vw fluidity); and the
  template showed a phone-side "lost the big screen" string on a
  host-start failure (gave it its own host_fail string, dropped the now
  dead one). Host-refresh recovery was flagged as absent-by-design here;
  Kenny then asked for it, so it is now modeled (§16.1 below).

Suites after the re-audit: solo 149, multi 140 (+3 pause/host-refresh),
audit 74. The product/ops backlog is unchanged.

### 16.1 Host-refresh recovery added to the template (2026-07-19)

Kenny: "add host-refresh recovery to the template." The reference now
models the full host-resilience contract, mirroring zero-blast's proven
pattern: a run snapshot (tpl-run-<code>, session + local) written on
every round boundary, claim and pause plus a lobby snapshot at room
creation; a 繼續上一場 offer on the cover when a fresh snapshot for this
device exists; and resumeRun, which reclaims the SAME code via
GameBridge.host({code}) and re-publishes state so phones reconnect where
they left off. Rounds regenerate from their index (genRound is
deterministic), so only idx + scores + the seq-dedupe book are snapshotted;
a paused round comes back paused (not live), same as the §16 zero-blast fix.

Building the verification (a mocked-bridge host+phone probe, since the
env has no Firebase) surfaced a genuine PRE-EXISTING template bug that the
Firebase-less earlier audit could not reach: the phone never revealed its
play surface when the tutor started, because joinAsPlayer hid the join
form up front while onCtrlRoom only showed the play surface if the join
form was still visible. The template's multi mode was effectively broken
for phones. Fixed to reveal the play surface unconditionally on the
playing phase. A committed smoke suite now guards the template's contract
slice (webapp/frontend/tests/games/_template/tpl-test.js, 14 assertions:
solo run + resolved guard, phone play reveal, and lobby / mid-game /
paused host-refresh recovery over the shared GameBridge mock) — the
template had no test before, which is how the play-reveal bug shipped.

## 17. First live-deploy feedback (implemented 2026-07-20)

Kenny play-tested the deployed build and reported two things.

- **Claimer name clipped on the equation board (fixed).** The
  left-to-right reveal wipe on .zb-board__ink ends at clip-path
  inset(0 0 0 0) with `both` fill, so after the wipe the board's ink
  is PERMANENTLY clipped to the tight equation box - and the claimer's
  name (.zb-factor__by) is inked above that box, so its top was sliced
  off. Reduced motion never showed it (theme.css kills the animation,
  so the clip-path never applies), which is why the a11y passes missed
  it. Fix: the keyframe's retained clip region now carries clearance on
  every side the name can reach (top always; left/right for a name
  wider than an edge bracket), sized for the 12-char name cap. Pure
  CSS, verified at projector / laptop / phone widths with worst-case
  CJK and Latin names.

- **Join by code (added, both games).** Joining was QR-only: the lobby
  copy promised "or enter the room code" but no student surface took
  one - the only code field was the host's same-device reclaim. A
  student whose camera will not focus on a glary projector was locked
  out, and a typo'd ?room= URL stranded the phone on the controller's
  dead-room notice. The cover now carries a quiet 加入房間 code row
  (mirrored as a ✦ CONTRACT row in the template): the room is probed
  via GameBridge.join({slug, code}) BEFORE navigating, so a dead code
  gets an inline retry on the cover, and a live one rides the exact
  ?room= path the QR encodes - reload and re-scan identity recovery
  stay keyed by code as usual. The gate accepts 4-8 uppercase
  alphanumerics: real codes are 6 chars of the bridge's confusable-free
  alphabet (the 4-digit shape seen in tests is the mock's). The lobby
  hint now names the cover as where the code goes, and the cover's
  empty status slots (join + reclaim / intro) are hidden until they
  speak - two stacked dashed placeholders read as clutter.

Suites after: solo 149, multi 143 (+3 join-by-code), audit 74,
template 16 (+2 join-by-code).

Deploy note from the same session: the bare /games/zero-blast/ URL
404s (Next.js standalone does not auto-serve a directory index; every
real asset including index.html serves fine). The QR is unaffected
(joinUrl copies the host's full pathname). RESOLVED the same day by
the games. subdomain (below).

### 17.1 games. subdomain (implemented 2026-07-20)

middleware.ts gained a games.* branch in the summer./prospect./buddy.
pattern: /zero-blast -> 308 -> /zero-blast/ -> rewrite to
/games/zero-blast/index.html, generic over the slug (future games work
with no middleware edit); /shared/* rewrites under /games/ (game pages
load ../shared/*, which resolves to /shared/* from a /<slug>/ URL);
legacy /games/* paths on the subdomain redirect to the clean form;
root fronts the pilot game until a games index page exists. The QR
gets shorter too: a host on games.*/zero-blast/ publishes joinUrl
games.*/zero-blast/?room=CODE, and join-by-code navigation rides the
same clean path (both copy location.pathname).

GOTCHA pinned by a new middleware.test.ts (13 vitest cases, in the CI
suite): targets must be PLAIN URLs, not nextUrl clones - NextURL
re-applies the incoming path's trailing-slash state to any pathname
set on it, which turned the /zero-blast -> /zero-blast/ redirect into
a self-redirect loop and bolted a slash onto .../index.html. The
summer. block never hit this because none of its targets are
slash-sensitive.

Ops (Kenny, after deploy): same two steps as summer. - Cloud Run
custom-domain mapping for games.mathconceptsecondary.academy + the
Cloudflare DNS record it prescribes.

## 18. 探究模式 · 等式開口中 (implemented 2026-07-21, from Steve's SM901 2nd draft)

Steve's lesson plan (SM_901 探究式課堂設計教案, 2nd draft 2026-07-21)
designs 遊戲探究活動二 "等式開口中(電子版)" as a two-stage warm-up
BEFORE factorisation is taught - which makes the existing game its
phase 3. This iteration builds his stages into the same room as an
optional pre-game arc, so one QR scan carries the class through the
whole lesson: 探究一 → 探究二 → 概念轉化 → 主遊戲.

Mapping to his plan (page 5-6):

- 探究一 (his 第一階段): each round every player secretly picks an
  integer 0-99; the host multiplies SECRET random pairs against a
  target N drawn on a slot machine (pool scripted for difficulty:
  12, 36, 24, 60, then the prime 37 - the despair round). Fail costs
  both partners 1 life of 5. Deviation from his fixed two sides:
  pairs re-draw every round and stay hidden until the reveal, because
  classmates who know their partner can just talk ("你出4我出9") and
  the 很難達成默契 discovery dies. Lives are per player.
- 探究二 (his 第二階段): the advance button IS his 「老師透過按鈕把N
  恆久設定為0」- the slot lands a stamped red 0 with an N-已鎖定
  badge. 0×0 triggers his 大爆炸 (-2 lives each, never for a lone
  player). The reveal grid rings every submitted 0 in red: surviving
  pairs visibly all contain one. The theorem itself stays the
  teacher's beat - a 顯示歸納 button discloses 零乘積性質 on the
  projector and every phone only when pressed (his 白板歸納 moment).
- 概念轉化 (his step 4, made playable): partner A's phone holds
  (x−3), partner B's (x+2), target 0; each submits the x that zeroes
  their OWN factor and the pair passes if EITHER is right - the 「或」
  embodied. The reveal substitutes both factors and shows his exam
  face: x² − x − 6 = 0, seaming into the main game's kind 6.
- Reveal grids are the digital value-add his paper version can't do:
  探究一 lists N's factor pairs next to what the class actually
  played; his reference questions read straight off the projector.

Build notes: multiplayer-only, entered from a second lobby button
(先玩探究 · 等式開口中) so plain game starts are untouched; host can
跳過探究 to the main game at any point (two-tap confirm). All state
rides the existing contract - subs stay `{v,seq,lv,ts}` with lv bound
to a 1000+stage*100+round seq, new keys live under `state/inq*`
inside the deployed RTDB shape clamp (deepest leaf inqReveal/pairs/i/
field = depth 4), pairings never publish before the reveal, and
`makePad` grew opts {digits, prefix} for two-digit entry (taps append;
same-digit shortcut only in single-digit mode). Lives render as
marking circles (§3 house idiom), never hearts. Host F5 mid-arc
resumes via the run snapshot (an open round restarts fresh). Config:
`?inqrounds` / `?inqfuse` / `?inqhearts` (game.json 0.10.0). Covered
by the multi suite's final section (42 checks, 185 total).

§18.1 Post-playtest fixes (2026-07-21, Kenny's conceptual review)

Two mechanics contradicted the maths they teach, plus two tutor
controls requested:

- Rotating bye replaces the trio. A trio broke 探究一's A×B=N frame
  (three-number products don't match the factor-pairs line) and made
  探究二 effectively boom-proof (all three on 0 never happens). Odd
  headcounts now bench one player per round as the observer - their
  phone explains why (本回合輪空), the roster tags them, no lives
  move, and the bye never repeats back-to-back (lastBye survives the
  F5 snapshot). A one-player room keeps the degenerate solo pair for
  testing.
- The bridge got one equation, one shared x. The factor-card judging
  let both partners "zero their own bracket" - visually endorsing
  (0)(0), which one x can never produce ((x−2)(x+3)=0 has no x that
  is both 2 and −3). Now both phones show the WHOLE equation with the
  dealt factor as an underlined hint (你嘅提示因式); any partner
  landing on either root passes; the reveal substitutes every x into
  BOTH factors - (3−3)(3+2) = (0)(5) = 0 - so each line shows exactly
  one zeroed bracket, and the 或-note (同一個 x 冇可能令兩個因式同時
  歸零) prints on the projector and, when the partners hit different
  roots, on the phones. Reveal rows carry no card keys anymore.
- Tutor controls: 加多一回合 (visible at reveal/recap; at a recap the
  extra round starts immediately, mid-arc extras persist per stage and
  survive F5) and 跳去探究一/二/概念轉化 chips (two-tap confirm, land
  on the stage's intro; a round in flight is abandoned unjudged).

state/inq gained two scalars (bye, and roundsTotal now moves) - still
inside the deployed rules clamp, no rules change. game.json 0.11.0.
Multi suite: 194 checks.

§18.2 The repeated root as standard content (2026-07-22, Kenny's
maths-rigour review)

Kenny caught that the 或-note's blanket 「同一個 x 冇可能令兩個因式
同時歸零」 is false for (x−a)² = 0 - and the main game's stage 5
serves exactly that counterexample. Two-layer fix, both shipped:

- Every takeaway is now composed from the equation ON SCREEN
  (inqBridgeNote): distinct roots name THIS pair's factors and zeros
  ({fa} 同 {fb} 嘅零點唔同…所以係「或」), so no claim overreaches.
- (x−3)² = 0 is the STANDARD third bridge question (INQ_BRIDGE grew
  to 3; Kenny promoted it from bonus). The face shows the squared
  form with no hint deal (identical brackets, nothing to hint; no
  inqCards published), judging needs x = 3, and the reveal
  legitimately shows (0)(0) = 0 - the one configuration rounds 1-2
  prove impossible - with the exception named: 兩個因式一樣，係「重根」：
  唯一例外. Arc: rule, rule, exception - and it foreshadows the main
  game's double-root levels minutes later. 加多一回合 now cycles round
  4 back to equation 1.

Multi suite: 201 checks.
