# Companion Games — Conventions

Rules for the summer/regular-course companion game series. Every game —
human-written or AI-generated — must comply before it ships. Hand this
file plus `webapp/frontend/public/games/_template/` to whatever AI is
generating a game; review against the checklist at the bottom before
merging.

**Where games live:** `webapp/frontend/public/games/<slug>/index.html`,
self-contained, served statically by the CSM frontend (and publicly via
the `games.` subdomain for student phones). Shared runtime in
`public/games/shared/` (theme.css, game-bridge.js, vendor/qrcode.js) is
the **only** allowed external import. No CDNs. No PeerJS/WebRTC.

## 1. Pedagogy

1. **One game, one subtopic.** Each game declares exactly one learning
   objective tied to a topic code (e.g. `SM901 · 零因積性質`). If a game
   idea needs two objectives, it is two games.
2. **Intro screen first.** Objective, how to play, and expected duration
   (target 5–10 minutes) are shown before any gameplay. No cold starts.
3. **Feedback must teach.** A wrong answer always shows the worked
   reason (e.g. the factorisation in full), never only a penalty. A
   correct answer may briefly reinforce the concept.
4. **Never punish valid mathematics.** No mechanic may penalise a
   mathematically correct answer or imply a true statement is wrong.
   (Reference failure: an early draft punished `0 × 0 = 0` as a
   "taboo" — the equation is true; the penalty belonged to the game
   rules, not the maths, and the framing must make that unmistakable or
   be redesigned.)
5. **Ramp concrete → abstract.** Early rounds use numbers; later rounds
   use expressions. A student who only completes early rounds should
   still have met the objective in concrete form.
6. **Terminology follows the courseware.** Use the exact terms from the
   SM/MAS PDFs — e.g. 一元二次方程 (quadratic equation in one unknown),
   因式分解 (factorisation), 判別式 (discriminant), 韋達定理 (Vieta's
   theorem), 零因積性質 (zero-product property). When unsure, check the
   chapter folder names in the courseware index or
   `private/curriculum_data/concept_seed.json`.

## 2. Language (bilingual, one build)

- Every visible string lives in one `STRINGS` table with **both**
  languages filled: `{ key: { c: "繁體中文", e: "English" } }`. Language
  codes `c`/`e` deliberately match the courseware file suffixes.
- Language is chosen by `?lang=c|e` URL param (so an assigned link can
  match the student's stream), falling back to the saved choice, default
  `c`. An in-game 中/EN toggle is always present.
- Traditional Chinese as used in Macau/HK. No simplified characters; no
  Taiwan-only textbook terms (e.g. use 一元二次方程, not 一元二次方程式).
- Mathematical notation is language-neutral and never duplicated per
  language.
- **Writing style.** No em dashes (— or ——) as clause connectors in
  either language; they read as AI-generated. Use commas, full stops,
  or colons. En dashes are fine in numeric ranges (5–10 分鐘). Keep
  copy short and spoken-register for Cantonese-speaking students; no
  exclamation-mark pile-ups.
- **CJK line wrapping.** In Chinese strings that appear as prose
  (ledes, instructions), mark phrase boundaries with `|`, e.g.
  `"示範用：|兩數相乘等於目標數，|看看你需要幾多次嘗試。"`. Lines then
  wrap only between phrases at any screen width, never stranding a
  fragment like 「嘗試。」 on its own line. The marker renders as
  nothing (`GameBridge.t()` strips it; `applyI18n` turns phrases into
  unbreakable segments). Not needed for short labels or English.

## 3. Visual identity — "marked exercise book"

The series has one art direction, implemented in `shared/theme.css`.
Games build only from its tokens and primitives; no hard-coded colours,
fonts, or shadows in game code.

- **The metaphor.** Light theme is a printed worksheet: warm cream
  paper with a faint graph grid and noise grain, near-black ink type.
  Dark theme is a chalkboard: warm near-black (never pure `#000`),
  chalk-white type. Both ship with every game, toggled via
  `[data-theme]`, defaulting to the device preference. Test both.
- **Red is the teacher's pen.** MathConcept red `#EC0000` is reserved
  for actions and marking — never decorative washes of it. Correct
  marks use the green-teal marking ink (`--mc-correct`).
- **Feedback is marking.** Results appear as a rotated ink stamp
  (`.mc-stamp`, ✓/✗) plus the worked reason as a red-ink margin note
  (`.mc-margin-note`). Attempts are marking circles that get crossed
  (`.mc-tries`), not hearts.
- **Type.** Archivo Black for Latin display (echoes the logo's M),
  JetBrains Mono for every numeral, expression, code and label-cap
  (`--mc-mono`; tabular numerals), Noto Sans TC body with system CJK
  bolds (PingFang TC / Microsoft JhengHei) for headings. All
  self-hosted in `shared/fonts/` — no font CDNs.
- **No emoji as UI.** Icons are inline SVG (stroke style, 2–3px, see
  the template's sprite: the MC arrow, clock, players, tick, cross).
  Emoji may appear only inside content text where a real person would
  write one, which in practice is almost never.
- **Structure.** Every screen opens with the worksheet masthead
  (`.mc-masthead`): topic code in mono caps with the code itself in
  red, a 2px ink rule, and the MC arrow. Titles are large and
  left-aligned (`.mc-title`); instructions live in the ruled note block
  with its red margin line (`.mc-note`). Buttons are print-cornered
  (6px), ink-bordered with a hard 2px drop (`.mc-btn`), pressed = the
  drop collapses; the primary action is red with the arrow that slides
  on hover. No pill chips, no hover-lift-everything, no gradients.
- **Brand line.** Intro and lobby screens end with `.mc-brand`: the
  MathConcept Secondary logo plus wordmark. Use `/logo-secondary.png`
  in light and `/logo-secondary-dark.png` in dark (the
  `.mc-logo--light`/`.mc-logo--dark` classes handle the swap — same
  convention as CSM's `SummerHeader`). Never recolour or redraw the
  logo.
- **Phones first.** Touch targets ≥ 44px (`.mc-btn` and the toggles
  enforce this), `viewport-fit=cover` with safe-area insets for notched
  phones, numeric inputs use `inputmode="numeric"` with ≥16px text (no
  iOS focus zoom). Layouts must work from 320px portrait through
  landscape phones to projector 16:9 — use `.mc-stage` /
  `.mc-stage--wide`. Chinese text loads from the games' subset woff2
  (`shared/fonts/NotoSansTC-sub.woff2`, 2.3MB vs the 6.8MB site TTF);
  glyphs outside the subset fall back to system CJK fonts.
- **Motion is few and physical:** staggered rise on screen entry,
  stamp overshoot on marking, cross-draw on a lost attempt, a short
  shake on wrong answers. Motion is decorative, never informational;
  `theme.css` disables it under `prefers-reduced-motion`. Sound is
  optional and always mutable; never autoplay before a user gesture.

## 4. Modes

- **Multi-device is the series' primary format:** game host on the
  tutor's screen/projector, students joining on phones by scanning a QR
  (`?room=XXXX` link). Solo (single-screen) mode is encouraged where the
  mechanic allows it, but is per-game, not mandatory.
- Declare supported modes in `game.json` (below); the Lesson Mode panel
  shows this so tutors know what a game needs before launching.
- Multi-device games must handle: a player joining late, a phone
  reloading or waking from screen-lock (state re-syncs from RTDB — no
  in-memory-only state), and disconnection (visible `.mc-conn` pill,
  automatic reconnect, never `alert()` + reload).

## 5. Technical rules

- One folder per game; everything inside it plus `../shared/` only.
  Games must run when opened as a plain file path and when embedded in
  an iframe by Lesson Mode.
- All cross-device sync goes through `GameBridge` (RTDB REST + SSE under
  `game-rooms/<slug>/<code>`). Never talk to RTDB directly, never
  introduce another transport.
- Rounds always reset fully — submitting twice must never double-apply
  a penalty or reward.
- No `alert()`/`confirm()`/`prompt()`. Use `.mc-banner`.
- No analytics, no external requests, no personal data. Room contents
  are ephemeral game state only; rooms self-expire (stale rooms are
  reclaimable after 6h).
- Target browsers: Chrome/Edge (centre PCs), iOS/Android Safari+Chrome
  (student phones).

### Libraries — tiered whitelist

The engine follows the mechanic, never the other way round: a library
is vendored when a specific game's design needs it, not because it is
modern. All vendored files live in `shared/vendor/` (shared across
games) and are committed, never CDN-loaded.

- **Tier 0 — default, no libraries.** DOM/SVG/CSS, Canvas 2D, Web
  Audio, `GameBridge`, `qrcode.js`. Sufficient for most subtopical
  games; start here and only escalate with a reason.
- **Tier 1 — vendor when the mechanic demands it** (name the mechanic
  in the PR): **KaTeX** (typeset expressions beyond what mono/italic
  styling can do), **JSXGraph** (graphing/geometry mechanics; already a
  CSM dependency), **Phaser** *or* **PixiJS** (continuous real-time
  sprite games — pick one per game, prefer Phaser), **GSAP**
  (orchestrated tween sequences beyond CSS), **Howler** (music/audio
  sprites beyond simple Web Audio synthesis).
- **Tier 2 — exceptional, explicit sign-off in review:**
  **three.js**/**Babylon** (only for 3D-native topics such as solid
  geometry/cross-sections, never for decoration), **Rive** (if the
  series ever adopts a mascot/character).
- **Never:** analytics SDKs, PeerJS/WebRTC (see §5), CDN loads,
  build-step frameworks (React/Vue) inside game folders.

## 6. GameBridge API (summary)

```js
GameBridge.initTheme();              // apply saved/param/system theme
GameBridge.initI18n(STRINGS);        // apply language to [data-i18n] nodes
GameBridge.t(key); GameBridge.setLang("c"|"e"); GameBridge.toggleTheme();

const room = await GameBridge.host({ slug, initialState });
//   → { code, joinUrl, set(path,v), update(path,patch), watch(cb), close() }
const room = await GameBridge.join({ slug });   // reads ?room= param
GameBridge.qr(el, room.joinUrl, 200);           // render join QR

GameBridge.emit(slug, "ready"|"start"|"complete"|"score", payload);
//   → postMessage { source:"mc-game", slug, event, payload } to Lesson Mode
```

The `emit` events are the future hook for recording completion/score
against a session; until that lands they are simply ignored when the
game runs standalone.

### The round protocol (`shared/room-protocol.js`)

The multi-device shape every game shares, proven through the Zero
Blast pilot. The host is always authoritative; phones render from
published state and never judge.

Room layout under `game-rooms/<slug>/<code>`:

- **`state`** — host-published; phones render from it. Typical keys:
  `phase`, `level`, `levelIdx`, `deadlineEpoch`, `claims`, `scores`,
  `graceUntil`, `pauseRemainMs`, `reveal`, `results`. Phases:
  `lobby → playing ⇄ paused → reveal | cooldown → … → end`.
  The published level must carry **no answer key** (strip roots/hidden
  factors and anything a devtools reader could cheat with); answers
  ship host-computed inside verdicts, and a `reveal` payload publishes
  the answer sheet only once the round resolves.
- **`players/<pid>`** — one entry per phone: `{ name, joinedAt, uid }`.
  Rules pin it to the device uid; the host still filters ids and
  truncates names (defence in depth). Kick = the host deletes the
  entry; phones must detect their own removal in **any** phase and
  offer rejoin.
- **`subs/<pid>`** — one slot per player: `{ v, seq, lv, ts }`. `seq`
  strictly increases per player (dedupe key, also the retry key — only
  a successful write advances it client-side); `lv` binds the answer
  to a round so a delayed sub is never judged against the next one.
- **`verdicts/<pid>`** — host-only, private. Carries the judged result
  plus everything the phone renders from it (points, streak, totals,
  host-computed working lines, `lv` binding).

Client conventions that ride the protocol:

- Phones send with a *sent → marking* beat, one silent retry, and a
  verdictless reopen (~2.5s) so a lost write never soft-locks the pad.
- All countdown maths runs on `GameBridge.serverNow()`, never
  `Date.now()`.
- Pause: host publishes `phase: "paused"` + the frozen remaining;
  phones freeze the fuse and close the pad; the host defers judging
  (leaves subs unconsumed) until resume.
- Identity mirrors to `sessionStorage` + `localStorage` per room code
  so a reload or a QR re-scan resumes the same player.
- The host snapshots its run (localStorage) so a closed tab can
  resume, and writes a lobby snapshot at creation.

Helpers (`window.MCRoom`): `PID_RE`, `newPid()` (crypto-random,
matches the rules' `$pid` shape), `sanePlayers(raw)` (id filter +
name truncation), `drainSubs(subs, processedSeq, {paused, idle,
levelSeq, judge})` (the seq-dedupe judging loop with pause deferral
and level binding).

### FX (`shared/fx-core.js`)

The house effects engine (`window.MCFXCore`), composed per game in the
game's own `fx.js` skin — Zero Blast's `fx.js` is the reference:

- `createStage()` — canvas-2D particles in the house language (ink
  debris, dust, paper scraps, splatter, gold stars — never confetti),
  screen shake, hit-stop, live camera-frame mapping (`toPx`/`setView`/
  `fxScale`), `vibrate`.
- `createAudio({sprite, onChange})` — the `mc-games-sound` opt-in,
  Web Audio context + synth primitives (`noiseburst`/`thump`), the
  Howler sample-sprite harness, and the `oneShot` sample-or-synth
  prelude.
- `createBgm({audio, bpm, busGain, setup, schedule})` — the lookahead
  step sequencer with the big-stage play policy (allowed ∧ sound-on ∧
  tier set ∧ tab visible) and `duck()`. The game supplies voices and
  the per-step pattern; controllers never call `allow(true)`.

## 7. Manifest (`game.json`)

Each game folder ships a manifest; the Lesson Mode registry is built
from these.

```json
{
  "slug": "zero-blast",
  "title": { "c": "零的爆發", "e": "Zero Explosion" },
  "objective": { "c": "理解 (x−a)(x−b)=0 ⟺ x=a 或 x=b", "e": "…" },
  "topics": [ { "scheme": "SM", "code": "901" }, { "scheme": "MAS", "code": "901" } ],
  "grade": "F3",
  "modes": ["multi", "solo"],
  "players": { "min": 1, "max": 2 },
  "duration_min": 8,
  "version": "1.0.0"
}
```

## 8. Infrastructure notes (one-time setup, not per-game)

- **RTDB rules:** the `game-rooms` block lives in
  `growing-minds/webapp/database.rules.json` (that repo owns the rules
  deploy for `csm-database-project`; deploy with
  `firebase deploy --only database`). The contract the deployed rules
  enforce — GameBridge implements the client half:
  - **Anonymous Auth is required** (enable the provider in the Firebase
    console once). GameBridge signs up each device once and persists
    the identity in `localStorage`; every REST/SSE call carries the
    token, and `GameBridge.uid()` exposes the device uid.
  - Reads are granted **only at room level** — the `$slug` parent can
    never be listed, so rooms can't be enumerated. Codes are 6-char
    crypto-random (no 0/O/1/I).
  - Room create/state/verdicts/kick are scoped to the `hostUid` written
    at creation. A room whose `createdAt` is older than 6h can be
    written over by a fresh host (lazy stale reclaim).
  - `players/<id>` is pinned to the joining device's uid (create and
    edit), names are length-capped at 24 server-side; `subs/<id>` is
    writable only by the uid owning the matching player entry — a
    classmate can't inflate your seq or forge claims under your name.
  - **Slugs are allowlisted** on every write grant (`zero-blast`,
    `_template`, …) and room **shape is clamped**: top-level keys fixed
    to `hostUid/createdAt/slug/state/players/subs/verdicts`, `state`
    limited to 4 levels of nesting with string leaves ≤2000 chars,
    `players`/`subs` nodes typed with unknown keys denied, verdict
    strings ≤500 (one nesting level for worked-reason line arrays).
    Anonymous hosting stays open by design (QR-join can't demand
    logins); the clamp bounds what an authed script can stuff into the
    database. After ANY rules edit, run the emulator regression suite
    `webapp/scripts/test-game-rooms-rules.mjs` (growing-minds repo) —
    its allow cases replay both games' real write sequences, so it
    catches a clamp that would break live play.

  Rooms stay ephemeral and public-by-code to anyone signed in who knows
  the code; nothing sensitive may ever be written there (rule 5 above).
- **Public access:** the `games.` subdomain is served by the same
  frontend via `middleware.ts` host routing (same pattern as `summer.`),
  outside Cloudflare Access so student phones can reach it. The custom
  domains are NOT Cloud Run domain mappings — a Cloudflare Worker
  (`cloud-run-proxy`, dashboard-managed) proxies them to the `run.app`
  origins and stamps `x-forwarded-host` with the real incoming hostname,
  so the middleware branches correctly for ANY host routed to it.
  `games.*` serves clean per-game URLs: `/<slug>` → 308 → `/<slug>/` →
  rewrite to `/games/<slug>/index.html`, with `/shared/*` rewritten
  under `/games/`. Two hard-won notes if you ever touch that block:
  build redirect/rewrite targets as PLAIN `URL`s (NextURL re-applies the
  incoming path's trailing-slash state to any pathname set on it), and
  Next's own trailing-slash strip runs BEFORE middleware (disabled via
  `skipTrailingSlashRedirect`; the middleware replicates the strip for
  every non-games host). `middleware.test.ts` pins all of it.
- **Stale-room cleanup:** codes are reclaimed lazily by `GameBridge.host`
  after 6h; a periodic cleanup job can come later if the node grows.

## 9. Adding a new game (start here)

Middleware and Cloudflare are slug-generic — a new game touches
neither. The one infra edit is the RTDB slug allowlist (step 1); the
rest of the work is the game itself:

1. **Pick a slug** (lowercase letters, digits and hyphens only, e.g.
   `fraction-race`, not `Fraction_Race`) and **add it to the rules slug
   allowlist** — the deployed rules reject unlisted slugs. In
   `growing-minds/webapp/database.rules.json`, add the slug to all
   THREE write grants (room, `players/$pid`, `subs/$pid`); extend the
   allow cases in `scripts/test-game-rooms-rules.mjs` if the game
   introduces new write shapes, run that suite against the emulator,
   then `firebase deploy --only database`. The clean URL
   `games.<domain>/<slug>` exists the moment the folder does; the
   game's rooms exist the moment the rules deploy.
2. **Copy `public/games/_template/` → `public/games/<slug>/`** and work
   through the `✦ CONTRACT` comments. The template already carries the
   full hardened contract: shared modules (`game-bridge`, `fx-core`,
   `room-protocol`), answer-key-free publishing, lobby + QR + tap-kick,
   phone identity recovery (session + local per room code), sent-beat
   submissions with seq-on-success, pause, host-refresh recovery
   (`tpl-run-*` snapshots + resume offer + reclaim), and the
   join-by-code cover row. Replace the sample mechanic (`genRound`,
   judging, the play surface); keep the contract plumbing.
3. **Set `SLUG`, `game.json`, and the STRINGS table** (both `c` and `e`,
   `|` phrase-wrap markers, no em dashes). Register the topic code.
4. **Write the test suite before the mechanic gets deep**: copy
   `tests/games/_template/tpl-test.js` — the mocked GameBridge
   (localStorage rooms + BroadcastChannel) is slug-agnostic and drives
   host + phones without Firebase. The template's phone-play-reveal bug
   shipped precisely because the template had no test; don't repeat it.
   A Firebase-400 environment exercises NOTHING of the phone path.
5. **Sound is optional at launch**: render a sprite like
   `webapp/frontend/scripts/zb-render-audio.mjs` does, or ship silent —
   `createAudio` degrades gracefully.
6. **When it's the SECOND live game**, make the one deliberate call the
   infra left open: the `games.*` root currently 308s to the pilot game
   (`middleware.ts`, marked comment) — keep a flagship there or swap the
   redirect for a games index page. Lesson-Mode assignment (the
   CompanionGamesPanel registry) is additive per game when that phase
   lands.
7. **Before the PR**, run the game's suite plus `middleware.test.ts`,
   and copy the §10 checklist into the PR description.

## 10. Review checklist (copy into the PR)

```
- [ ] Objective + topic code declared; one subtopic only
- [ ] Maths verified: no mechanic punishes a true statement
- [ ] Wrong-answer feedback shows the worked reason
- [ ] STRINGS complete in BOTH c and e; toggle works; no hard-coded text
- [ ] Terminology matches courseware PDFs
- [ ] Light AND dark themes checked; only theme.css tokens used
- [ ] Phone portrait + projector layouts checked
- [ ] Multi-device: reload/screen-lock recovery + reconnect pill work
- [ ] Rounds reset fully; double-submit is harmless
- [ ] No alert()/CDNs/external requests; game.json present and accurate
- [ ] Playtested once end-to-end by a human
```
