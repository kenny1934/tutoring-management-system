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

## 7. Manifest (`game.json`)

Each game folder ships a manifest; the Lesson Mode registry is built
from these.

```json
{
  "slug": "zero-explosion",
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

- **RTDB rules:** `game-rooms` must be added to
  `growing-minds/webapp/database.rules.json` (that repo owns the rules
  deploy for `csm-database-project`):

  ```json
  "game-rooms": {
    "$slug": {
      "$code": {
        ".read": true,
        ".write": "!data.exists() || data.child('createdAt').exists()",
        ".validate": "newData.child('createdAt').isNumber() || data.exists()"
      }
    }
  }
  ```

  Rooms are public-by-code and ephemeral by design; nothing sensitive
  may ever be written there (rule 5 above).
- **Public access:** the `games.` subdomain is served by the same
  frontend via `middleware.ts` host routing (same pattern as `summer.`),
  outside Cloudflare Access so student phones can reach it.
- **Stale-room cleanup:** codes are reclaimed lazily by `GameBridge.host`
  after 6h; a periodic cleanup job can come later if the node grows.

## 9. Review checklist (copy into the PR)

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
