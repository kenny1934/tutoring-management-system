/* 歸零爆破 Zero Blast — MULTI-DEVICE test suite (140 assertions)
 *
 * One HOST (projector, 1280x800) page plus two PHONE (controller,
 * 390x844) pages, all in ONE browser context (shared localStorage +
 * BroadcastChannel), synced over a mocked GameBridge: host()/join()
 * are replaced with a same-origin room store (localStorage persistence
 * so reload/resume survive; BroadcastChannel fan-out; watchers get
 * full-room snapshots captured at write time, delivered on a FIFO
 * setTimeout(0) queue so nested writes inside a watcher callback can
 * never overtake the snapshot that triggered them). The real
 * game-bridge.js still runs first — i18n / theme / qr / emit /
 * serverNow (offset 0 under the mock) stay real.
 *
 * How to run (against a static server that serves public/, e.g.
 * `cd webapp/frontend/public && python3 -m http.server 8000`):
 *   cd /home/kenny/projects/tutoring-management-system
 *   NODE_PATH=webapp/frontend/node_modules \
 *   node webapp/frontend/tests/games/zero-blast/zb-multi-test.js
 *
 * ZB_BASE overrides the target (default http://localhost:8000/games/zero-blast/).
 * Exit code 0 + "ALL PASS" when all 140 assertions hold; first failing
 * assertion prints "  ✗ name — detail" and exits non-zero.
 *
 * The run uses ?rounds=1&seed=7&grace=8 on the host, so the plan is
 * one building per stage, kinds 1..6 in order, deterministic:
 *   1: 2 × ▢ = 0 (root 0)      2: (x−2) = 0 (root 2)
 *   3: (x−9)(x−7) = 0 (9, 7)   4: (x+5)(x−4) = 0 (−5, 4)
 *   5: (x−3)² = 0 (double 3)   6: x² + 4x − 5 = 0 (−5, 1)
 *
 * After the original run the suite exercises the fix batches: 再拆一次
 * restart (phones must come back to life — the audit's #1 finding),
 * mid-game kick via host-board rows + duplicate-name dedupe on rejoin,
 * re-scan identity recovery (localStorage mirror, new tab), and the
 * "已送出 · 批改中" sent beat ordering before the verdict feedback.
 *
 * Shared-context caveat: the live game mirrors the phone identity
 * `zb-<code>` to localStorage for re-scan recovery. Real phones are
 * separate devices; here all three pages share ONE localStorage, so
 * the suite deletes that key on phone B's boots (else B would silently
 * boot as A) and re-seeds A's identity before the re-scan section
 * (each join clobbers the single shared slot). Mock-only artifacts.
 */

"use strict";

const { chromium } = require("playwright");

const BASE = process.env.ZB_BASE || "http://localhost:8000/games/zero-blast/";
const SEED = 7;
const HOST_URL = BASE + "?rounds=1&seed=" + SEED + "&grace=8";

/* ── the GameBridge mock, appended to the real shared/game-bridge.js ── */
const MOCK = `
/* ── TEST MOCK: same-origin GameBridge rooms (no Firebase) ──
 * Overrides host()/join() only. Room data persists in localStorage
 * (phone reload + host refresh/resume read current state); change
 * fan-out via BroadcastChannel; every watcher receives a full-room
 * snapshot CAPTURED AT WRITE TIME and delivered through a FIFO
 * setTimeout(0) queue — nested writes made inside a watcher callback
 * queue strictly behind the snapshot that triggered them, mirroring
 * RTDB SSE ordering (otherwise the host double-processes claims). */
(function () {
  "use strict";
  var qp = new URLSearchParams(location.search);
  function storeKey(slug, code) { return "zbmock-room-" + slug + "-" + code; }
  function readRoom(slug, code) {
    try {
      var raw = localStorage.getItem(storeKey(slug, code));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeRoom(slug, code, data) {
    if (data === null) localStorage.removeItem(storeKey(slug, code));
    else localStorage.setItem(storeKey(slug, code), JSON.stringify(data));
  }
  /* write value at sub-path ("state" / "players/p1" / "subs/x"); null deletes */
  function setPath(root, sub, value) {
    var keys = sub.split("/").filter(Boolean);
    if (!keys.length) return value;
    var base = root && typeof root === "object" ? root : {};
    var node = base;
    for (var i = 0; i < keys.length - 1; i++) {
      if (typeof node[keys[i]] !== "object" || node[keys[i]] === null) node[keys[i]] = {};
      node = node[keys[i]];
    }
    if (value === null) delete node[keys[keys.length - 1]];
    else node[keys[keys.length - 1]] = value;
    return base;
  }
  var entries = {}; // per-page: { watchers: [], chan: BroadcastChannel }
  function entryFor(slug, code) {
    var k = slug + "/" + code;
    if (!entries[k]) {
      var e = { watchers: [], chan: new BroadcastChannel("zbmock-" + k) };
      e.chan.onmessage = function (msg) { deliver(e, msg.data ? msg.data.snapshot : null); };
      entries[k] = e;
    }
    return entries[k];
  }
  function deliver(entry, snapshot) {
    entry.watchers.forEach(function (w) {
      var copy = snapshot == null ? null : JSON.parse(JSON.stringify(snapshot));
      setTimeout(function () { if (!w.closed) w.cb(copy); }, 0); // FIFO queue
    });
  }
  function broadcast(slug, code) {
    var entry = entryFor(slug, code);
    var snapshot = readRoom(slug, code); // captured at write time
    deliver(entry, snapshot);
    entry.chan.postMessage({ snapshot: snapshot });
  }
  function makeHandle(slug, code, withJoinUrl) {
    var entry = entryFor(slug, code);
    var h = {
      code: code,
      get: function (sub) { // one-shot read, like the live handle's REST GET
        var room = readRoom(slug, code);
        if (!sub) return Promise.resolve(room);
        var node = room;
        sub.split("/").filter(Boolean).forEach(function (k) {
          node = node == null ? null : node[k];
        });
        return Promise.resolve(node === undefined ? null : node);
      },
      set: function (sub, v) {
        writeRoom(slug, code, setPath(readRoom(slug, code), sub, v === undefined ? null : v));
        broadcast(slug, code);
        return Promise.resolve();
      },
      update: function (sub, patch) {
        var room = readRoom(slug, code);
        Object.keys(patch || {}).forEach(function (k) {
          room = setPath(room, sub + "/" + k, patch[k]);
        });
        writeRoom(slug, code, room);
        broadcast(slug, code);
        return Promise.resolve();
      },
      watch: function (cb, onStatus) {
        var w = { cb: cb, closed: false };
        entry.watchers.push(w);
        if (onStatus) onStatus("online");
        var pill = document.querySelector(".mc-conn");
        if (pill) pill.setAttribute("data-conn", "online");
        var snap = readRoom(slug, code); // SSE sends the full value on connect
        setTimeout(function () { if (!w.closed) w.cb(snap ? JSON.parse(JSON.stringify(snap)) : null); }, 0);
        return { close: function () { w.closed = true; } };
      },
      close: function () {
        writeRoom(slug, code, null);
        broadcast(slug, code);
        return Promise.resolve();
      },
    };
    if (withJoinUrl) {
      var lang = GameBridge.getLang && GameBridge.getLang();
      h.joinUrl = location.origin + location.pathname + "?room=" + code + (lang ? "&lang=" + lang : "");
    }
    return h;
  }
  GameBridge.host = function (opts) {
    var slug = opts.slug;
    if (opts.code) { // reclaim after a host refresh
      if (!readRoom(slug, opts.code)) return Promise.reject(new Error("room gone"));
      return Promise.resolve(makeHandle(slug, opts.code, true));
    }
    var code;
    do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (readRoom(slug, code));
    writeRoom(slug, code, { createdAt: Date.now(), slug: slug, state: opts.initialState || {} });
    return Promise.resolve(makeHandle(slug, code, true));
  };
  GameBridge.join = function (opts) {
    var slug = opts.slug;
    var code = opts.code || qp.get("room");
    if (!code) return Promise.reject(new Error("no room code"));
    if (!readRoom(slug, code)) return Promise.reject(new Error("room not found"));
    return Promise.resolve(makeHandle(slug, code, false));
  };
})();
`;

/* ── tiny harness ── */
let passCount = 0;
const t0 = Date.now();

function check(name, cond, detail) {
  if (cond) {
    passCount += 1;
    console.log("  ✓ " + name);
  } else {
    console.log("  ✗ " + name + (detail ? " — " + detail : ""));
    throw new Error("assertion failed: " + name + (detail ? " — " + detail : ""));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* bounded poll: resolve fn()'s first truthy value, else throw at timeout */
async function until(fn, opts = {}) {
  const timeout = opts.timeout || 8000;
  const interval = opts.interval || 60;
  const start = Date.now();
  let last;
  for (;;) {
    try { last = await fn(); } catch (e) { last = undefined; }
    if (last) return last;
    if (Date.now() - start > timeout) {
      throw new Error("timeout waiting for: " + (opts.label || "condition"));
    }
    await sleep(interval);
  }
}

/* read the mock room straight from localStorage (any of the 3 pages) */
function roomData(page) {
  return page.evaluate(() => {
    const code = (G.room && G.room.code) || (C.room && C.room.code);
    const raw = localStorage.getItem("zbmock-room-zero-blast-" + code);
    return raw ? JSON.parse(raw) : null;
  });
}

/* keypad 400ms commit window: digit arms, SAME digit again commits
 * instantly — both taps inside ONE evaluate. Sign key latches first
 * for negative codes. Waits for the round to be open + pad unlocked. */
async function padSubmit(page, v) {
  await until(
    () => page.evaluate(
      () => C.staged && C.phase === "playing" && !document.querySelector("#ctrlPad .zb-key").disabled
    ),
    { label: "phone pad ready", timeout: 20000 }
  );
  await page.evaluate((val) => {
    const padEl = document.getElementById("ctrlPad");
    if (val < 0) padEl.querySelector(".zb-key--sign").click();
    const d = Math.abs(val);
    const key = [...padEl.querySelectorAll(".zb-key[data-d]")]
      .find((k) => parseInt(k.dataset.d, 10) === d);
    key.click();
    key.click(); // same digit again: commits instantly
  }, v);
}

/* submit then wait for the host's private verdict; returns the verdict */
async function submitVerdict(page, v) {
  const before = await page.evaluate(() => C.lastVerdictSeq);
  await padSubmit(page, v);
  await until(() => page.evaluate((b) => C.lastVerdictSeq > b, before), {
    label: "verdict for " + v,
    timeout: 8000,
  });
  return page.evaluate(() => {
    const room = JSON.parse(localStorage.getItem("zbmock-room-zero-blast-" + C.room.code));
    return room.verdicts[C.id];
  });
}

/* the host is authoritative on grace: once entered, cut the deadline so
 * the collapse fires now instead of after the full window */
async function fastForwardGrace(host) {
  await until(() => host.evaluate(() => G.grace === true), { label: "grace entered", timeout: 8000 });
  await host.evaluate(() => { G.deadline = performance.now() + 250; });
  await until(() => host.evaluate(() => G.over === true), { label: "collapse", timeout: 6000 });
}

async function waitHostLevel(host, seq) {
  await until(
    () => host.evaluate((s) => G.level && G.level.seq === s && G.staged === true && !G.over, seq),
    { label: "host level " + seq + " staged", timeout: 25000 }
  );
}

function trackErrors(page, sink) {
  page.on("pageerror", (e) => sink.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") sink.push("console: " + m.text());
  });
}

const benign = (line) => /favicon/i.test(line);

async function main() {
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // sound opt-in seeded before any page script runs: the bgm checks
  // need the groove armed, and the one-time sound offer must not appear
  await context.addInitScript(() => {
    try {
      if (localStorage.getItem("mc-games-sound") === null) {
        localStorage.setItem("mc-games-sound", "on");
      }
    } catch (e) {}
  });

  // serve the REAL game-bridge.js with the mock appended, so the
  // override exists before index.html's boot code runs
  await context.route("**/shared/game-bridge.js", async (route) => {
    const resp = await route.fetch();
    const body = await resp.text();
    await route.fulfill({ status: 200, contentType: "application/javascript", body: body + "\n" + MOCK });
  });

  const hostErrors = [];
  const aErrors = [];
  const bErrors = [];

  const host = await context.newPage(); // 1280x800 from the context default
  trackErrors(host, hostErrors);
  const phoneA = await context.newPage();
  await phoneA.setViewportSize({ width: 390, height: 844 });
  trackErrors(phoneA, aErrors);
  const phoneB = await context.newPage();
  await phoneB.setViewportSize({ width: 390, height: 844 });
  trackErrors(phoneB, bErrors);

  /* ════════ lobby ════════ */
  await host.goto(HOST_URL, { waitUntil: "load" });
  const introProjector = await host.evaluate(() =>
    document.querySelector(".mc-stage").classList.contains("zb-stage--projector")
  );
  await host.click("#btnHost");
  const code = await until(
    () => host.evaluate(() => {
      const c = document.getElementById("roomCode").textContent.trim();
      return /^\d{4}$/.test(c) ? c : null;
    }),
    { label: "room code" }
  );
  check("host lobby shows room code", /^\d{4}$/.test(code), "roomCode=" + code);

  const lobbyProjector = await host.evaluate(() =>
    document.querySelector(".mc-stage").classList.contains("zb-stage--projector")
  );
  check(
    "projector width already on intro/lobby",
    introProjector && lobbyProjector,
    "intro=" + introProjector + " lobby=" + lobbyProjector
  );

  await until(() => host.evaluate(() => !!document.querySelector("#qrBox svg")), { label: "QR svg" });
  check("host QR rendered", true);

  const qrW = await host.evaluate(() => document.querySelector("#qrBox svg").style.width);
  check("QR at projector size", qrW === "300px", "svg width=" + qrW);

  const attract = await host.evaluate(() => {
    const el = document.getElementById("attractLoop");
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const sheet = document.getElementById("lobbySheet").getBoundingClientRect();
    return {
      display: cs.display,
      w: r.width,
      insideRight:
        r.left > sheet.left + sheet.width / 2 && r.right <= sheet.right + 1 && r.top > sheet.top,
    };
  });
  check(
    "lobby attract loop beside the QR",
    attract.display === "block" && attract.w > 0 && attract.insideRight,
    JSON.stringify(attract)
  );

  const startDisplay = await host.evaluate(
    () => getComputedStyle(document.getElementById("btnStartMulti")).display
  );
  check("start hidden with no players", startDisplay === "none", "display=" + startDisplay);

  const bgmLobby = await host.evaluate(() => ZBFX.bgm.state());
  check(
    "bgm: lobby tier grooving on the host",
    bgmLobby.allowed && bgmLobby.tier === "lobby" && bgmLobby.playing,
    JSON.stringify(bgmLobby)
  );

  /* ════════ joins ════════ */
  const phoneUrl = BASE + "?room=" + code + "&seed=" + SEED;
  await phoneA.goto(phoneUrl, { waitUntil: "load" });
  await until(() => phoneA.evaluate(() => !!C.room), { label: "phone A joined room" });
  await phoneA.fill("#nameInput", "Ada");
  await phoneA.click("#btnJoin");
  await until(
    () => host.evaluate(() => document.getElementById("playerList").textContent.includes("Ada")),
    { label: "host sees Ada" }
  );
  check("host sees phone A join", true);

  // LIVE-TREE identity is mirrored to localStorage (`zb-<code>`) for
  // re-scan recovery. Under the shared-context mock phone B would find
  // A's identity and silently boot as Ada — real phones are separate
  // devices, so drop the key on B's boots only (A's reload path reads
  // its own tab's sessionStorage first and is unaffected).
  await phoneB.addInitScript((c) => {
    try { localStorage.removeItem("zb-" + c); } catch (e) {}
  }, code);
  await phoneB.goto(phoneUrl, { waitUntil: "load" });
  await until(() => phoneB.evaluate(() => !!C.room), { label: "phone B joined room" });
  await phoneB.fill("#nameInput", "Ben");
  await phoneB.click("#btnJoin");
  await until(
    () => host.evaluate(() => {
      const chips = document.querySelectorAll("#playerList span[data-id]");
      return chips.length === 2 && document.getElementById("playerList").textContent.includes("Ben");
    }),
    { label: "host sees Ben" }
  );
  check("host sees both players", true);

  const startVis = await host.evaluate(() => {
    const el = document.getElementById("btnStartMulti");
    return getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
  });
  check("start button visible", startVis);

  /* ════════ kick ════════ */
  let bId = await phoneB.evaluate(() => C.id);
  await host.click(`#playerList span[data-id="${bId}"]`);
  const armed = await host.evaluate((id) => {
    const chip = document.querySelector(`#playerList span[data-id="${id}"]`);
    return chip && { text: chip.textContent, arm: chip.classList.contains("arm") };
  }, bId);
  check(
    "kick: chip arms with confirm text",
    armed && armed.arm && armed.text.includes("撳多次移除"),
    JSON.stringify(armed)
  );

  await host.click(`#playerList span[data-id="${bId}"]`); // second tap kicks
  await until(
    () => host.evaluate((id) => {
      const chips = document.querySelectorAll("#playerList span[data-id]");
      return chips.length === 1 && !document.querySelector(`#playerList span[data-id="${id}"]`);
    }, bId),
    { label: "chip removed" }
  );
  check("kick: chip removed from lobby", true);

  await until(
    () => phoneB.evaluate(
      () =>
        getComputedStyle(document.getElementById("ctrlJoin")).display !== "none" &&
        getComputedStyle(document.getElementById("ctrlPlay")).display === "none"
    ),
    { label: "B back at name form" }
  );
  check("kick: phone B back at the name form", true);

  const kickNote = await phoneB.evaluate(() => {
    const el = document.getElementById("ctrlStatus");
    return { text: el.textContent, danger: el.classList.contains("mc-status--danger") };
  });
  check(
    "kick: phone B told it was removed",
    kickNote.danger && kickNote.text.includes("你已被導師移除"),
    JSON.stringify(kickNote)
  );

  await phoneB.fill("#nameInput", "Ben");
  await phoneB.click("#btnJoin");
  await until(
    () => host.evaluate(() => {
      const chips = document.querySelectorAll("#playerList span[data-id]");
      return chips.length === 2 && document.getElementById("playerList").textContent.includes("Ben");
    }),
    { label: "B rejoined" }
  );
  const bPlayVis = await phoneB.evaluate(
    () => getComputedStyle(document.getElementById("ctrlPlay")).display !== "none"
  );
  check("kick: phone B rejoined", bPlayVis);
  bId = await phoneB.evaluate(() => C.id); // rejoin minted a fresh id
  const aId = await phoneA.evaluate(() => C.id);

  /* ════════ start → level 1 (kind 1) ════════ */
  await host.click("#btnStartMulti");
  await until(
    () => host.evaluate(() => document.getElementById("gameScreen").classList.contains("active") && G.started && !!G.level),
    { label: "game started" }
  );

  await until(() => phoneA.evaluate(() => !!C.level), { label: "phone A got the level" });
  const exprPair = await Promise.all([
    host.evaluate(() => document.getElementById("exprBoard").textContent.trim()),
    phoneA.evaluate(() => document.getElementById("ctrlExpr").textContent.trim()),
  ]);
  check(
    "phone shows the host's expression",
    exprPair[0].length > 0 && exprPair[0] === exprPair[1],
    JSON.stringify(exprPair)
  );

  const padWrapDisplay = await host.evaluate(
    () => getComputedStyle(document.getElementById("padWrap")).display
  );
  check("host keypad hidden", padWrapDisplay === "none", "display=" + padWrapDisplay);

  const attractGone = await host.evaluate(
    () => document.getElementById("attractLoop").getBoundingClientRect().width === 0
  );
  check("attract loop gone once started", attractGone);

  const strug2 = await host.evaluate(() => {
    const el = document.getElementById("strugglers");
    return { text: el.textContent, shown: getComputedStyle(el).display !== "none" };
  });
  check(
    "struggling counter shows both unscored",
    strug2.shown && strug2.text.includes("2 人本關未計分"),
    JSON.stringify(strug2)
  );

  const bgmBase = await host.evaluate(() => ZBFX.bgm.state());
  check("bgm: base tier once the round opens", bgmBase.tier === "base" && bgmBase.playing, JSON.stringify(bgmBase));

  const ctrlBgm = await phoneA.evaluate(() => ({
    soundOn: ZBFX.audio.isOn(),
    bgm: ZBFX.bgm.state(),
  }));
  check(
    "bgm: silent on the controller despite sound on",
    ctrlBgm.soundOn && !ctrlBgm.bgm.allowed && !ctrlBgm.bgm.playing && ctrlBgm.bgm.tier === null,
    JSON.stringify(ctrlBgm)
  );

  const projClass = await host.evaluate(() =>
    document.querySelector(".mc-stage").classList.contains("zb-stage--projector")
  );
  check("projector class on wide host", projClass);

  const sceneH = await host.evaluate(() => ({
    h: document.getElementById("scene").clientHeight,
    vh: innerHeight,
  }));
  check(
    "projector scene large but <= ~62vh (batch P scene-first)",
    sceneH.h >= sceneH.vh * 0.5 && sceneH.h <= Math.round(sceneH.vh * 0.62) + 4,
    JSON.stringify(sceneH)
  );

  const fx1280 = await host.evaluate(() => ZBFX.fxScale());
  check("FX scale up on projector", fx1280 > 1, "fxScale=" + fx1280);

  await host.setViewportSize({ width: 1920, height: 1080 });
  await sleep(400); // resize + ResizeObserver settle
  const fx1920 = await host.evaluate(() => ZBFX.fxScale());
  check(
    "FX scale capped at 1920",
    fx1920 <= 2.5 + 1e-9 && fx1920 >= fx1280,
    "fxScale@1920=" + fx1920 + " @1280=" + fx1280
  );
  await host.setViewportSize({ width: 1280, height: 800 });
  await sleep(250);

  /* ── level 1 scoring: A cracks the zero ── */
  const l1 = await host.evaluate(() => ({ n: G.level.n, roots: G.level.pillars.map((p) => p.root) }));
  const v1 = l1.roots[0]; // kind 1 → 0
  const vd1 = await submitVerdict(phoneA, v1);
  const aScore1 = await host.evaluate((id) => G.scores[id] || 0, aId);
  check("phone A scored", vd1.ok === true && aScore1 > 0, "verdict=" + JSON.stringify(vd1));

  /* the answer key never rides the wire mid-round: published pillars
   * carry labels only, claims name the claimer, verdicts bring the
   * host-computed working instead */
  const wire1 = await roomData(host);
  check(
    "published level carries no answer key",
    wire1.state.level.pillars.every((p) => !("root" in p) && !("hidden" in p)),
    JSON.stringify(wire1.state.level.pillars)
  );
  check(
    "published claims name the claimer, not the root",
    Object.values(wire1.state.claims || {}).every((c) => c === true || !("root" in c)),
    JSON.stringify(wire1.state.claims)
  );
  check(
    "ok verdict ships host-computed working lines",
    Array.isArray(vd1.working) && vd1.working.length > 0,
    JSON.stringify(vd1.working)
  );
  check(
    "phone level withholds roots until the reveal",
    await phoneA.evaluate(() => C.level.pillars.every((p) => p.root == null)),
    await phoneA.evaluate(() => JSON.stringify(C.level.pillars))
  );

  await sleep(950); // odometer settle
  const aOdo = await phoneA.evaluate(() =>
    parseInt(document.getElementById("ctrlScore").textContent, 10)
  );
  check(
    "phone score odometer settles on the host's total",
    aOdo === aScore1,
    "phone=" + aOdo + " host=" + aScore1
  );

  const aStars = await phoneA.evaluate(() => ({
    stars: document.querySelectorAll("#ctrlStars svg").length,
    mult: (document.querySelector("#ctrlStars .zb-mult") || {}).textContent || "",
  }));
  check("phone A got a star", aStars.stars >= 1, JSON.stringify(aStars));
  check("phone shows streak multiplier", aStars.mult === "×1.1", JSON.stringify(aStars));

  const strug1 = await host.evaluate(() => document.getElementById("strugglers").textContent);
  check("struggling counter drops after A scores", strug1.includes("1 人本關未計分"), strug1);

  const aWorking = await phoneA.evaluate(() => ({
    correct: !!document.querySelector("#ctrlMark .mc-stamp--correct"),
    text: document.getElementById("ctrlMark").textContent,
  }));
  check(
    "phone A sees zero working",
    aWorking.correct && aWorking.text.includes("× 0 = 0"),
    JSON.stringify(aWorking)
  );

  // facts that outlive the collapse are captured now, printed in order
  const claimInk1 = await host.evaluate(() => {
    const el = document.querySelector("#structSvg .zb-claimname");
    return el ? el.textContent : null;
  });
  const boardMult1 = await host.evaluate(() => {
    const m = document.querySelector("#hostBoard .zb-mult");
    return m ? m.textContent : null;
  });
  const rank1 = await host.evaluate(() => {
    const row = document.querySelector("#hostBoard .zb-hostboard__row");
    return row && {
      name: row.querySelector(".zb-hostboard__name").textContent,
      gold: !!row.querySelector(".zb-rank--1"),
    };
  });

  // graph latch armed BEFORE the collapse is triggered
  await host.evaluate(() => {
    window.__graphSeen = false;
    new MutationObserver((ms) =>
      ms.forEach((m) =>
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1 && n.classList && n.classList.contains("zb-graph")) window.__graphSeen = true;
        })
      )
    ).observe(document.getElementById("structSvg"), { childList: true });
  });
  await fastForwardGrace(host);
  await until(() => host.evaluate(() => window.__graphSeen === true), { label: "graph sketch", timeout: 3500 });
  check("resolve graph sketches on the host scene", true);
  check("claimer name inked on host scene", claimInk1 === "Ada", "inked=" + claimInk1);
  check("host board shows streak multiplier", boardMult1 === "×1.1", "mult=" + boardMult1);
  check(
    "gold rank chip on the leader",
    rank1 && rank1.name === "Ada" && rank1.gold,
    JSON.stringify(rank1)
  );
  const street1 = await host.evaluate(() => {
    const items = document.querySelectorAll("#streetStrip .zb-street__item");
    const it = items[0];
    return {
      count: items.length,
      chai: it ? !!it.querySelector(".zb-street__chai") : false,
      n: it ? it.querySelector(".zb-street__n").textContent : null,
    };
  });
  check(
    "street strip stamps building 01",
    street1.count === 1 && street1.chai && street1.n === "01",
    JSON.stringify(street1)
  );

  /* ════════ level 2 (kind 2): wrong lock + the g toggle ════════ */
  await waitHostLevel(host, 2);
  const l2root = await host.evaluate(() => G.level.pillars[0].root);
  const wrong2 = l2root === 5 ? 4 : 5;
  const vdB2 = await submitVerdict(phoneB, wrong2);
  check(
    "phone B locked after wrong",
    vdB2.ok === false &&
      (await phoneB.evaluate(() => document.getElementById("ctrlLock").classList.contains("show"))),
    "verdict=" + JSON.stringify(vdB2)
  );

  const bMark2 = await phoneB.evaluate(() => document.getElementById("ctrlMark").textContent);
  check("phone B sees private working", bMark2.includes("強度"), bMark2.slice(0, 80));
  check(
    "wrong working is the host's line, not phone-derived",
    Array.isArray(vdB2.working) && vdB2.working.length > 0 && bMark2.includes(vdB2.working[0]),
    JSON.stringify(vdB2.working) + " vs " + bMark2.slice(0, 80)
  );

  const bStreak2 = await phoneB.evaluate(() => ({
    stars: document.querySelectorAll("#ctrlStars svg").length,
    ds: document.getElementById("ctrlStars").dataset.streak,
  }));
  check(
    "phone B streak cleared",
    vdB2.streak === 0 && bStreak2.stars === 0 && bStreak2.ds === "0",
    JSON.stringify(bStreak2)
  );

  const hostClean = await host.evaluate(() => ({
    stamp: !!document.querySelector("#markZone .mc-stamp"),
    strength: !!document.querySelector("#scene .zb-strengthflash"),
    shake: document.getElementById("exprBoard").classList.contains("mc-shake"),
  }));
  check(
    "host projector shows no wrong-mark",
    !hostClean.stamp && !hostClean.strength && !hostClean.shake,
    JSON.stringify(hostClean)
  );

  const aFree = await phoneA.evaluate(
    () =>
      !document.getElementById("ctrlLock").classList.contains("show") &&
      !document.querySelector("#ctrlPad .zb-key").disabled
  );
  check("phone A unaffected by B's lock", aFree);

  // toggle the resolve graph OFF, complete the round, expect no sketch
  await host.keyboard.press("g");
  const graphOff = await host.evaluate(() => G.graphOn);
  await host.evaluate(() => { window.__graphSeen = false; });
  await submitVerdict(phoneA, l2root);
  await fastForwardGrace(host);
  await sleep(1500); // past the 1.12s graph beat
  const noGraph = await host.evaluate(
    () => !window.__graphSeen && !document.querySelector("#structSvg .zb-graph")
  );
  check("key g: no graph while toggled off", graphOff === false && noGraph, "graphOn=" + graphOff);
  await host.keyboard.press("g"); // back on for the rest of the run

  /* ════════ level 3 (kind 3): claims, echo, grace ════════ */
  await waitHostLevel(host, 3);
  const l3 = await host.evaluate(() => G.level.pillars.map((p) => ({ id: p.id, root: p.root })));
  const r1 = l3[0].root, r2 = l3[1].root;

  const armTakeoverLatch = (page) =>
    page.evaluate(() => {
      window.__takeover = null;
      new MutationObserver((ms) =>
        ms.forEach((m) =>
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1 && n.classList && n.classList.contains("zb-ctrltakeover")) {
              window.__takeover = n.innerText;
            }
          })
        )
      ).observe(document.body, { childList: true });
    });
  await armTakeoverLatch(phoneA);
  await armTakeoverLatch(phoneB);

  await submitVerdict(phoneA, r1);
  const takeoverA = await until(() => phoneA.evaluate(() => window.__takeover), {
    label: "takeover on A",
    timeout: 3000,
  });
  check(
    "takeover: claimer gets the full-card 歸零 with name + points",
    takeoverA.includes("歸零") && takeoverA.includes("Ada") && takeoverA.includes("分"),
    JSON.stringify(takeoverA)
  );

  await until(
    () => phoneB.evaluate(() => document.getElementById("ctrlPlay").classList.contains("zb-ctrltremble")),
    { label: "tremble on B", timeout: 3000 }
  );
  check("tremble: the other phone's card shivers on the claim", true);

  const takeoverB = await phoneB.evaluate(() => window.__takeover);
  check("takeover: never on the bystander's phone", takeoverB === null, "B saw: " + takeoverB);

  const hostStruck = await host.evaluate((pid) => {
    const el = document.querySelector(`#exprBoard .zb-factor[data-fids~="${pid}"]`);
    return el && {
      struck: el.classList.contains("struck"),
      by: (el.querySelector(".zb-factor__by") || {}).textContent || null,
    };
  }, l3[0].id);
  check("factor struck through on the host board", hostStruck && hostStruck.struck, JSON.stringify(hostStruck));
  check("claimer named above the struck factor", hostStruck && hostStruck.by === "Ada", JSON.stringify(hostStruck));

  const phoneStruck = async (page) =>
    page.evaluate((pid) => {
      const el = document.querySelector(`#ctrlExpr .zb-factor[data-fids~="${pid}"]`);
      return el && {
        struck: el.classList.contains("struck"),
        by: (el.querySelector(".zb-factor__by") || {}).textContent || null,
      };
    }, l3[0].id);
  const struckA = await until(async () => {
    const s = await phoneStruck(phoneA);
    return s && s.struck ? s : null;
  }, { label: "strike on A" });
  const struckB = await until(async () => {
    const s = await phoneStruck(phoneB);
    return s && s.struck ? s : null;
  }, { label: "strike on B" });
  check("factor struck on the phones too", struckA.struck && struckB.struck);
  check(
    "phone strike carries the claimer's name",
    struckA.by === "Ada" && struckB.by === "Ada",
    JSON.stringify({ struckA, struckB })
  );

  /* ── echo: B solves the claimed pillar ── */
  const bBefore = await host.evaluate((id) => G.scores[id] || 0, bId);
  const vdEcho = await submitVerdict(phoneB, r1);
  const bAfter = await host.evaluate((id) => G.scores[id] || 0, bId);
  check(
    "echo: B paid for a correct-after-claim",
    vdEcho.echo === true && vdEcho.pts > 0 && bAfter === bBefore + vdEcho.pts,
    JSON.stringify(vdEcho)
  );
  check(
    "echo: ~40% of base",
    vdEcho.pts >= 40 && vdEcho.pts <= 80,
    "pts=" + vdEcho.pts + " (base 100..200 × 0.4)"
  );
  const bEchoMark = await phoneB.evaluate(() => ({
    correct: !!document.querySelector("#ctrlMark .mc-stamp--correct"),
    text: document.getElementById("ctrlMark").textContent,
  }));
  check(
    "echo: names the claimer + pays",
    bEchoMark.correct && bEchoMark.text.includes("已由Ada拆咗") && /\+\d+ 分/.test(bEchoMark.text),
    JSON.stringify(bEchoMark)
  );
  check("echo: streak continues", vdEcho.streak === 1, "streak=" + vdEcho.streak);
  const claimInks = await host.evaluate(() =>
    [...document.querySelectorAll("#structSvg .zb-claimname")].map((e) => e.textContent)
  );
  check(
    "echo: no claim ink for B",
    claimInks.length === 1 && claimInks[0] === "Ada" && !claimInks.includes("Ben"),
    JSON.stringify(claimInks)
  );
  const echoTally = await host.evaluate(() => {
    const el = document.querySelector("#structSvg .zb-echotally");
    return el ? el.textContent : null;
  });
  check("echo tally inked under the claimer", echoTally === "回聲 ×1", "tally=" + echoTally);

  /* ── repeat echo: harmless duplicate ── */
  const vdDup = await submitVerdict(phoneB, r1);
  const dupMark = await phoneB.evaluate(() => document.getElementById("ctrlMark").textContent);
  check(
    "repeat echo told code already used, by whom",
    vdDup.already === true && dupMark.includes("已經用過") && dupMark.includes("Ada"),
    JSON.stringify({ vdDup, dupMark: dupMark.slice(0, 60) })
  );
  const bNotLocked = await phoneB.evaluate(
    () =>
      !document.getElementById("ctrlLock").classList.contains("show") &&
      !document.querySelector("#ctrlPad .zb-key").disabled
  );
  check("already-used does not lock B", bNotLocked);
  const bAfterDup = await host.evaluate((id) => G.scores[id] || 0, bId);
  check("already-used pays nothing", bAfterDup === bAfter, "before=" + bAfter + " after=" + bAfterDup);

  const statusA = await phoneA.evaluate(() => document.getElementById("ctrlStatus").textContent);
  const statusB = await phoneB.evaluate(() => document.getElementById("ctrlStatus").textContent);
  check(
    "claims status on phones",
    statusA.includes("1/2 支柱已拆") && statusB.includes("1/2 支柱已拆"),
    JSON.stringify({ statusA, statusB })
  );
  check(
    "claims status carries the echo hint",
    statusA.includes("拆咗都有分") && statusB.includes("拆咗都有分"),
    JSON.stringify({ statusA })
  );

  /* ── the last claim → grace window (8s via ?grace=8) ── */
  const armGraceLatch = (page, targetId) =>
    page.evaluate((tid) => {
      window.__graceNums = [];
      new MutationObserver((ms) =>
        ms.forEach((m) =>
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1 && n.classList && n.classList.contains("zb-gracenum")) {
              window.__graceNums.push(n.textContent);
            }
          })
        )
      ).observe(document.getElementById(tid), { childList: true });
    }, targetId);
  await armGraceLatch(host, "scene");
  await armGraceLatch(phoneA, "ctrlPlay");
  await armGraceLatch(phoneB, "ctrlPlay");
  const ducksBefore = await host.evaluate(() => ZBFX.bgm.state().ducks);

  await submitVerdict(phoneB, r2); // B claims the second pillar
  await until(() => host.evaluate(() => document.getElementById("scene").classList.contains("critical")), {
    label: "critical scene",
    timeout: 3000,
  });
  check("grace: host critical state", true);

  const bgmGrace = await host.evaluate(() => ZBFX.bgm.state());
  check("bgm: grace tier during the countdown", bgmGrace.tier === "grace", JSON.stringify(bgmGrace));

  const crewRun = await host.evaluate(() => {
    const crew = document.getElementById("crew");
    return crew && crew.classList.contains("zb-crew--run");
  });
  check("grace: crew scatters off the host scene", !!crewRun);

  await until(() => host.evaluate(() => window.__graceNums.length > 0), {
    label: "grace numeral on the scene",
    timeout: 7500,
  });
  const hostNums = await host.evaluate(() => window.__graceNums);
  check("grace: countdown numeral stamped on the scene", hostNums.length > 0, JSON.stringify(hostNums));

  const hazDur = await host.evaluate(() => {
    const el = document.querySelector("#structSvg .zb-hazard");
    return el ? getComputedStyle(el).animationDuration : null;
  });
  check("grace: beacons blink double-time", hazDur === "0.8s", "animation-duration=" + hazDur);

  const gracePhase = (await roomData(host)).state.phase;
  check("grace: phase still playing", gracePhase === "playing", "phase=" + gracePhase);

  const graceStatus = await phoneB.evaluate(() => document.getElementById("ctrlStatus").textContent);
  check("grace: phone countdown status", graceStatus.includes("秒後總爆破"), graceStatus);

  await until(() => phoneB.evaluate(() => window.__graceNums.length > 0), {
    label: "grace numeral on the phone",
    timeout: 3000,
  });
  check("grace: countdown numeral stamped on the phone", true);

  const vdGraceEcho = await submitVerdict(phoneA, r2); // A echoes inside the window
  check(
    "grace: echo submission still pays",
    vdGraceEcho.echo === true && vdGraceEcho.pts > 0,
    JSON.stringify(vdGraceEcho)
  );

  await until(
    async () => (await host.evaluate(() => G.over === true)) && (await roomData(host)).state.phase === "cooldown",
    { label: "grace collapse", timeout: 10000 }
  );
  check("grace: collapse fires after the window", true);

  const stillCritical = await host.evaluate(() =>
    document.getElementById("scene").classList.contains("critical")
  );
  check("grace: critical state cleared", !stillCritical);

  // the duck + base retune land at the timeline's "fall" beat (~0.53s
  // after the cooldown publish), so poll rather than sample
  const bgmAfter = await until(
    async () => {
      const s = await host.evaluate(() => ZBFX.bgm.state());
      return s.ducks > ducksBefore && s.tier === "base" ? s : null;
    },
    { label: "bgm duck + base", timeout: 3500 }
  ).catch(() => host.evaluate(() => ZBFX.bgm.state()));
  check(
    "bgm: ducked under the collapse, back on base",
    bgmAfter.ducks > ducksBefore && bgmAfter.tier === "base",
    JSON.stringify({ ducksBefore, bgmAfter })
  );

  /* ════════ level 4 (kind 4): reload, resume, tutor bar, skip ════════ */
  await waitHostLevel(host, 4);

  await phoneA.reload({ waitUntil: "load" });
  await until(
    () => phoneA.evaluate(
      () =>
        !!C.room &&
        getComputedStyle(document.getElementById("ctrlPlay")).display !== "none" &&
        getComputedStyle(document.getElementById("ctrlJoin")).display === "none"
    ),
    { label: "A silent rejoin", timeout: 10000 }
  );
  check("phone A reload: silent rejoin, no name prompt", true);
  const aIdAfter = await phoneA.evaluate(() => C.id);
  check("phone A reload: same identity", aIdAfter === aId, "was " + aId + " now " + aIdAfter);

  const preScores = await host.evaluate(() => JSON.parse(JSON.stringify(G.scores)));
  const preExpr = await host.evaluate(() => G.level.expr);
  await host.reload({ waitUntil: "load" });
  await until(
    () => host.evaluate(() => {
      const b = document.getElementById("btnResume");
      return getComputedStyle(b).display !== "none" && b.textContent.includes("繼續上一場");
    }),
    { label: "resume offer", timeout: 8000 }
  );
  check("host refresh: resume offered", true);

  await host.click("#btnResume");
  await until(
    () => host.evaluate(() => document.getElementById("gameScreen").classList.contains("active") && G.started && !!G.level),
    { label: "resumed", timeout: 8000 }
  );
  const resumed = await host.evaluate(() => ({ seq: G.level.seq, expr: G.level.expr, idx: G.idx }));
  check(
    "host refresh: same round resumes",
    resumed.seq === 4 && resumed.expr === preExpr,
    JSON.stringify({ resumed, preExpr })
  );
  const postScores = await host.evaluate(() => JSON.parse(JSON.stringify(G.scores)));
  const scoresMatch =
    Object.keys(preScores).length === Object.keys(postScores).length &&
    Object.keys(preScores).every((k) => preScores[k] === postScores[k]);
  check("host refresh: scores restored", scoresMatch, JSON.stringify({ preScores, postScores }));

  const tutorVis1 = await host.evaluate(
    () => getComputedStyle(document.getElementById("tutorBar")).display !== "none"
  );
  check("host refresh: tutor bar back", tutorVis1);

  const phonesLive = async (page) =>
    page.evaluate(() => C.phase === "playing" && parseFloat(document.getElementById("ctrlTimerText").textContent) > 0);
  await until(async () => (await phonesLive(phoneA)) && (await phonesLive(phoneB)), {
    label: "phones continue",
    timeout: 8000,
  });
  check("host refresh: phones continue the round", true);

  /* ── tutor bar ── */
  const tutorVis2 = await host.evaluate(() => {
    const el = document.getElementById("tutorBar");
    return getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
  });
  check("tutor bar visible on host", tutorVis2);

  const legend4 = await host.evaluate(() => document.getElementById("tutorKeys").textContent.trim());
  check("tutor key legend under the bar", legend4 === "t / n / e / g", "legend=" + legend4);

  const titles = await host.evaluate(() => ({
    plus: document.getElementById("btnPlus15").title,
    skip: document.getElementById("btnSkip").title,
    end: document.getElementById("btnEndGame").title,
  }));
  check(
    "tutor buttons carry shortcut titles",
    titles.plus === "快捷鍵 t" && titles.skip === "快捷鍵 n" && titles.end === "快捷鍵 e",
    JSON.stringify(titles)
  );

  await host.evaluate(() => {
    window.__plusFlash = false;
    new MutationObserver((ms) =>
      ms.forEach((m) =>
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1 && n.classList && n.classList.contains("zb-plusflash")) window.__plusFlash = true;
        })
      )
    ).observe(document.getElementById("scene"), { childList: true });
  });
  const dlBefore = await host.evaluate(() => G.deadline);
  const aEpochBefore = await phoneA.evaluate(() => C.deadlineEpoch);
  await host.click("#btnPlus15");
  const dlAfter = await host.evaluate(() => G.deadline);
  check(
    "tutor +15s extends the deadline",
    Math.abs(dlAfter - dlBefore - 15000) < 100,
    "delta=" + (dlAfter - dlBefore)
  );
  await until(() => host.evaluate(() => window.__plusFlash === true), { label: "+15s flash", timeout: 2500 });
  check("+15s flash stamped on the scene", true);
  await until(
    () => phoneA.evaluate((b) => C.deadlineEpoch >= b + 14000, aEpochBefore),
    { label: "+15s on the phone", timeout: 4000 }
  );
  check("tutor +15s reaches the phones", true);

  /* ── skip → the held reveal ── */
  await host.click("#btnSkip");
  await until(async () => (await roomData(host)).state.phase === "reveal", { label: "reveal phase", timeout: 4000 });
  check("tutor skip forces the reveal", true);

  // the condemn chop + tape land on the fuse-out timeline's first beat,
  // a GSAP tick after the reveal publish — poll, don't sample
  const condemn = await until(
    async () => {
      const s = await host.evaluate(() => ({
        condemn: !!document.querySelector("#sceneStamp .zb-condemn"),
        boxedChai: !!document.querySelector("#sceneStamp .zb-chai"),
      }));
      return s.condemn ? s : null;
    },
    { label: "condemn stamp", timeout: 3000 }
  ).catch(() => ({ condemn: false, boxedChai: false }));
  check(
    "fail: condemned corner chop, no boxed stamp",
    condemn.condemn && !condemn.boxedChai,
    JSON.stringify(condemn)
  );

  const tape = await until(
    () => host.evaluate(() => document.querySelectorAll("#structSvg .zb-tape path").length),
    { label: "tape cross", timeout: 3000 }
  ).catch(() => 0);
  check("fail: tape cross drawn over the structure", tape === 2, "tape paths=" + tape);

  await until(
    () => phoneA.evaluate(
      () => C.phase === "reveal" && document.getElementById("ctrlMark").textContent.includes("正確密碼")
    ),
    { label: "phone reveal", timeout: 4000 }
  );
  check("tutor skip reaches the phones as reveal", true);

  const aCondemned = await phoneA.evaluate(() =>
    document.getElementById("ctrlExpr").classList.contains("condemned")
  );
  check("fizzle: the phone's card is condemned", aCondemned);

  const aMini = await phoneA.evaluate(() => !!document.querySelector("#ctrlMark .zb-minigraph"));
  check("phone reveal carries the graph thumbnail", aMini);
  check(
    "reveal payload merges the answer sheet into the phone level",
    await phoneA.evaluate(() => C.level.pillars.every((p) => typeof p.root === "number")),
    await phoneA.evaluate(() => JSON.stringify(C.level.pillars))
  );

  const skipLabel = await host.evaluate(() => document.getElementById("btnSkip").textContent.trim());
  check("skip button becomes next during the reveal", skipLabel === "下一關", "label=" + skipLabel);

  await sleep(1300);
  const held = await host.evaluate(() => ({ hold: G.revealHold, idx: G.idx }));
  const heldPhase = (await roomData(host)).state.phase;
  check(
    "reveal waits for the tutor",
    held.hold === true && held.idx === 3 && heldPhase === "reveal",
    JSON.stringify({ held, heldPhase })
  );

  const bothReveal =
    (await phoneA.evaluate(() => C.phase)) === "reveal" &&
    (await phoneB.evaluate(() => C.phase)) === "reveal";
  check("phones stay on the reveal meanwhile", bothReveal);

  await host.click("#btnSkip"); // 下一關: the tutor releases the reveal
  await until(() => phoneA.evaluate(() => C.level && C.level.seq === 5), {
    label: "phone level 5",
    timeout: 12000,
  });
  const stillCondemned = await phoneA.evaluate(() =>
    document.getElementById("ctrlExpr").classList.contains("condemned")
  );
  check("condemned chip clears on the next round", !stillCondemned);

  /* ════════ level 5 (kind 5): tutor pause, then the double-root clear ════════ */
  await waitHostLevel(host, 5);
  await until(() => phoneA.evaluate(() => C.staged && C.phase === "playing"), {
    label: "A staged L5",
    timeout: 15000,
  });
  await host.evaluate(() => document.getElementById("btnPause").click());
  await until(() => phoneA.evaluate(() => C.phase === "paused"), { label: "phone paused", timeout: 4000 });
  const pausedWire = await roomData(host);
  check(
    "pause publishes the paused phase with the frozen remaining",
    pausedWire.state.phase === "paused" && typeof pausedWire.state.pauseRemainMs === "number",
    JSON.stringify({ phase: pausedWire.state.phase, remain: pausedWire.state.pauseRemainMs })
  );
  check(
    "pause veils the projector",
    await host.evaluate(() => document.getElementById("pauseVeil").style.display !== "none")
  );
  const aFrozen1 = await phoneA.evaluate(() => document.getElementById("ctrlTimerText").textContent);
  await sleep(700);
  const aPaused = await phoneA.evaluate(() => ({
    t: document.getElementById("ctrlTimerText").textContent,
    pad: document.querySelector("#ctrlPad .zb-key").disabled,
    status: document.getElementById("ctrlStatus").textContent,
  }));
  check("pause freezes the phone fuse", aPaused.t === aFrozen1, aFrozen1 + " -> " + aPaused.t);
  check("pause closes the phone pad", aPaused.pad === true);
  check("paused status on the phone", aPaused.status.includes("暫停"), aPaused.status);

  // an accidental host F5 DURING a pause must resume PAUSED, not live:
  // the snapshot now persists paused/pauseRemainMs and startLevel
  // re-enters the paused state on reclaim (regression: the class used to
  // resume live behind the tutor and the frozen fuse bled away).
  const remainBeforeF5 = pausedWire.state.pauseRemainMs;
  await host.reload({ waitUntil: "load" });
  await until(
    () => host.evaluate(() => {
      const b = document.getElementById("btnResume");
      return getComputedStyle(b).display !== "none" && b.textContent.includes("繼續上一場");
    }),
    { label: "resume offer (mid-pause)", timeout: 8000 }
  );
  await host.click("#btnResume");
  await until(
    () => host.evaluate(() =>
      document.getElementById("gameScreen").classList.contains("active") && G.started && G.paused),
    { label: "resumed still paused", timeout: 8000 }
  );
  const afterF5 = await roomData(host);
  check(
    "host F5 mid-pause resumes PAUSED, not live",
    afterF5.state.phase === "paused",
    JSON.stringify({ phase: afterF5.state.phase })
  );
  check(
    "host F5 mid-pause preserves the frozen fuse (no bleed)",
    Math.abs(afterF5.state.pauseRemainMs - remainBeforeF5) < 1500,
    JSON.stringify({ before: remainBeforeF5, after: afterF5.state.pauseRemainMs })
  );
  await until(() => phoneA.evaluate(() => C.phase === "paused"),
    { label: "phone re-paused after F5", timeout: 5000 });
  check(
    "host F5 mid-pause: phone stays frozen, pad closed",
    await phoneA.evaluate(() =>
      C.phase === "paused" && document.querySelector("#ctrlPad .zb-key").disabled === true)
  );

  await host.evaluate(() => document.getElementById("btnPause").click()); // resume
  await until(() => phoneA.evaluate(() => C.phase === "playing"), { label: "phone resumed", timeout: 4000 });
  const aBurning = await until(
    () => phoneA.evaluate((f) => {
      const t = document.getElementById("ctrlTimerText").textContent;
      return parseFloat(t) < parseFloat(f) - 0.15 ? t : null;
    }, aFrozen1),
    { label: "phone fuse burning again", timeout: 5000 }
  );
  check(
    "resume: the fuse burns on from where it froze",
    parseFloat(aBurning) <= parseFloat(aFrozen1),
    aFrozen1 + " -> " + aBurning
  );
  check(
    "resume reopens the phone pad",
    !(await phoneA.evaluate(() => document.querySelector("#ctrlPad .zb-key").disabled))
  );

  const l5root = await host.evaluate(() => G.level.pillars[0].root);
  await submitVerdict(phoneA, l5root); // one code, both pillars
  await fastForwardGrace(host);

  /* ════════ level 6 (kind 6, finale): hint, end confirm, report ════════ */
  await waitHostLevel(host, 6);
  const hintVis = await host.evaluate(() => {
    const el = document.getElementById("btnHint");
    return getComputedStyle(el).display !== "none" && !el.disabled;
  });
  check("hint button appears on kind-6", hintVis);

  const legend6 = await host.evaluate(() => document.getElementById("tutorKeys").textContent.trim());
  check("legend gains h on kind-6", legend6 === "t / h / n / e / g", "legend=" + legend6);

  await host.click("#btnHint");
  const ghost = await host.evaluate(() => {
    const el = document.querySelector("#structSvg .zb-hintghost");
    return el ? el.textContent : null;
  });
  check("tutor hint pencils the ghost factor", !!ghost && ghost.includes("(x"), "ghost=" + ghost);

  const l6 = await host.evaluate(() => G.level.pillars.map((p) => p.root));
  // finale doubles ×2, the hint fee is ×0.75 → net ×1.5. Streak before
  // this claim is 1 (L4 fizzle reset everyone, L5 claim rebuilt one),
  // so expected = base(f) × 1.1 × 1.5 with f measured just before the
  // submit — the drift to judge time on a 45s fuse is ~1pt, and net ×1
  // or ×2 would land ~100pts off either side.
  const fEst = await host.evaluate(() => (G.deadline - performance.now()) / G.duration);
  const vdHinted = await submitVerdict(phoneA, l6[0]);
  const expHinted = (100 + Math.round(100 * fEst)) * 1.1 * 1.5;
  check(
    "hinted finale claim pays 75% (net x1.5)",
    vdHinted.ok === true && Math.abs(vdHinted.pts - expHinted) <= 12,
    "pts=" + vdHinted.pts + " expected≈" + Math.round(expHinted)
  );

  await host.click("#btnEndGame");
  const endArmed = await host.evaluate(() => {
    const b = document.getElementById("btnEndGame");
    return { text: b.textContent.trim(), confirm: b.classList.contains("confirm") };
  });
  check(
    "tutor end asks to confirm",
    endArmed.confirm && endArmed.text.includes("再撳一次確認"),
    JSON.stringify(endArmed)
  );

  await sleep(2850); // the confirm window lapses
  const endLapsed = await host.evaluate(() => ({
    text: document.getElementById("btnEndGame").textContent.trim(),
    playing: document.getElementById("gameScreen").classList.contains("active") && !G.ended,
  }));
  check(
    "single end-tap does not end",
    endLapsed.text === "結束" && endLapsed.playing,
    JSON.stringify(endLapsed)
  );

  await submitVerdict(phoneA, l6[1]); // the last pillar of the street
  await fastForwardGrace(host);
  await until(() => host.evaluate(() => document.getElementById("endScreen").classList.contains("active")), {
    label: "host end screen",
    timeout: 12000,
  });

  const rows = await host.evaluate(() =>
    document.querySelectorAll("#endRecord .zb-hostboard__row").length
  );
  check("host leaderboard has 2 rows", rows === 2, "rows=" + rows);

  const bgmEnd = await host.evaluate(() => ZBFX.bgm.state());
  check("bgm: stopped on the end screen", !bgmEnd.playing && bgmEnd.tier === null, JSON.stringify(bgmEnd));

  await until(
    async () =>
      (await phoneA.evaluate(() => document.getElementById("endScreen").classList.contains("active"))) &&
      (await phoneB.evaluate(() => document.getElementById("endScreen").classList.contains("active"))),
    { label: "phones on end screen", timeout: 6000 }
  );
  await sleep(1000); // score tween settle
  const aFinal = await phoneA.evaluate(() => parseInt(document.getElementById("endScore").textContent, 10));
  const bFinal = await phoneB.evaluate(() => parseInt(document.getElementById("endScore").textContent, 10));
  check("phone A personal score > B", aFinal > bFinal, "A=" + aFinal + " B=" + bFinal);

  const aReport = await phoneA.evaluate(() => document.getElementById("endRecord").textContent);
  check("phone A shows rank", aReport.includes("第 1 名"), aReport.slice(0, 60));
  check(
    "phone A personal report: echo tally + fastest solve",
    aReport.includes("回聲 ×1") && aReport.includes("最快") && aReport.includes("秒"),
    aReport.slice(0, 120)
  );

  const restartDisplay = await phoneA.evaluate(
    () => getComputedStyle(document.getElementById("btnRestart")).display
  );
  check("phone restart hidden", restartDisplay === "none", "display=" + restartDisplay);

  /* ════════ restart (再拆一次): the audit's #1 classroom breaker ════════ */
  await host.click("#btnRestart"); // same seed → the same six buildings
  await until(
    async () =>
      (await phoneA.evaluate(() => document.getElementById("controllerScreen").classList.contains("active"))) &&
      (await phoneB.evaluate(() => document.getElementById("controllerScreen").classList.contains("active"))),
    { label: "controllers return", timeout: 10000 }
  );
  check("restart: phones return to the controller", true);

  // ctrlEnd killed the tick interval; the end→playing transition must
  // restart it. "Ticking" = the text goes numeric AND then changes
  // (during the level-card lead-in it clamps to the full fuse, so wait
  // past the ignite rather than sampling twice blindly).
  const firstTick = (page) =>
    until(
      () => page.evaluate(() => {
        const t = parseFloat(document.getElementById("ctrlTimerText").textContent);
        return t > 0 ? t : null;
      }),
      { label: "timer numeric", timeout: 10000 }
    );
  const tickA0 = await firstTick(phoneA);
  const tickB0 = await firstTick(phoneB);
  await until(
    async () =>
      (await phoneA.evaluate((v) => parseFloat(document.getElementById("ctrlTimerText").textContent) !== v, tickA0)) &&
      (await phoneB.evaluate((v) => parseFloat(document.getElementById("ctrlTimerText").textContent) !== v, tickB0)),
    { label: "timers ticking", timeout: 12000 }
  );
  check("restart: phone timer ticks again", true, "A from " + tickA0 + " B from " + tickB0);

  const boardA2 = await phoneA.evaluate(() => ({
    struck: document.querySelectorAll("#ctrlExpr .zb-factor.struck").length,
    factors: document.querySelectorAll("#ctrlExpr .zb-factor").length,
    text: document.getElementById("ctrlExpr").textContent.trim(),
  }));
  const boardB2struck = await phoneB.evaluate(
    () => document.querySelectorAll("#ctrlExpr .zb-factor.struck").length
  );
  const hostExpr2 = await host.evaluate(() =>
    document.getElementById("exprBoard").textContent.trim()
  );
  check(
    "restart: board re-renders unstruck",
    boardA2.struck === 0 && boardB2struck === 0 && boardA2.factors === 1 && boardA2.text === hostExpr2,
    JSON.stringify({ boardA2, boardB2struck, hostExpr2 })
  );

  await until(
    () => phoneA.evaluate(() => C.staged === true && !document.querySelector("#ctrlPad .zb-key").disabled),
    { label: "restart stage", timeout: 12000 }
  );
  check("restart: pad enables at stage", true);

  const vdRestart = await submitVerdict(phoneA, 0); // run 2 L1: 2 × ▢ = 0
  check(
    "restart: submit → verdict works",
    vdRestart.ok === true && vdRestart.pts > 0,
    JSON.stringify(vdRestart)
  );
  await fastForwardGrace(host);

  /* ════════ mid-game kick: host-board rows arm like lobby chips ════════ */
  await waitHostLevel(host, 2);
  const l2root2 = await host.evaluate(() => G.level.pillars[0].root);
  const bIdMid = await phoneB.evaluate(() => C.id);
  await host.click(`#hostBoard .zb-hostboard__row[data-id="${bIdMid}"]`);
  const rowArmed = await host.evaluate((id) => {
    const row = document.querySelector(`#hostBoard .zb-hostboard__row[data-id="${id}"]`);
    return row && {
      arm: row.classList.contains("arm"),
      name: row.querySelector(".zb-hostboard__name").textContent,
    };
  }, bIdMid);
  check(
    "mid-game kick: board row arms with confirm text",
    rowArmed && rowArmed.arm && rowArmed.name.includes("撳多次移除"),
    JSON.stringify(rowArmed)
  );

  await host.click(`#hostBoard .zb-hostboard__row[data-id="${bIdMid}"]`); // second tap kicks
  await until(
    () => phoneB.evaluate(
      () =>
        getComputedStyle(document.getElementById("ctrlJoin")).display !== "none" &&
        getComputedStyle(document.getElementById("ctrlPlay")).display === "none" &&
        document.getElementById("ctrlStatus").textContent.includes("你已被導師移除")
    ),
    { label: "B kicked mid-game", timeout: 5000 }
  );
  check("mid-game kick: phone back at the name form", true);

  await phoneB.fill("#nameInput", "Ada"); // deliberately collides with phone A
  await phoneB.click("#btnJoin");
  await until(() => phoneB.evaluate(() => !!C.id), { label: "B rejoined mid-game", timeout: 5000 });
  const dedupedName = await phoneB.evaluate(() => C.name);
  check("duplicate name suffixed at join", dedupedName === "Ada 2", "name=" + dedupedName);

  const vdMid = await submitVerdict(phoneB, l2root2);
  check(
    "mid-game kick: rejoin works mid-round",
    vdMid.ok === true && vdMid.pts > 0,
    JSON.stringify(vdMid)
  );
  await fastForwardGrace(host);

  /* ════════ re-scan identity: Wi-Fi drop → new tab, same player ════════ */
  await waitHostLevel(host, 3);
  const aScoreRun2 = await host.evaluate((id) => G.scores[id] || 0, aId);
  await phoneA.close(); // one tab per player: no fight over the sub slot
  // Seed what phone A's OWN device would hold: the game wrote exactly
  // this identity at A's join, but the shared-context mock let each
  // later join clobber the one localStorage slot (mock-only artifact).
  await host.evaluate((arg) => {
    localStorage.setItem("zb-" + arg.code, arg.identity);
  }, { code, identity: JSON.stringify({ id: aId, name: "Ada" }) });

  const phoneA2 = await context.newPage();
  await phoneA2.setViewportSize({ width: 390, height: 844 });
  trackErrors(phoneA2, aErrors);
  await phoneA2.goto(phoneUrl, { waitUntil: "load" });
  await until(
    () => phoneA2.evaluate(
      () =>
        !!C.room &&
        getComputedStyle(document.getElementById("ctrlPlay")).display !== "none" &&
        getComputedStyle(document.getElementById("ctrlJoin")).display === "none"
    ),
    { label: "re-scan silent rejoin", timeout: 10000 }
  );
  check("re-scan: silent rejoin with no name form", true);

  const rescan = await phoneA2.evaluate(() => ({ id: C.id, name: C.name }));
  check(
    "re-scan: same player identity",
    rescan.id === aId && rescan.name === "Ada",
    JSON.stringify({ rescan, aId })
  );

  await until(
    () => phoneA2.evaluate(
      (s) => parseInt(document.getElementById("ctrlScore").textContent, 10) === s,
      aScoreRun2
    ),
    { label: "re-scan score", timeout: 5000 }
  );
  check("re-scan: score carried over", true, "score=" + aScoreRun2);

  /* ════════ the sent · marking beat before the verdict ════════ */
  await phoneA2.evaluate(() => {
    window.__markSeq = [];
    const el = document.getElementById("ctrlMark");
    new MutationObserver(() => {
      window.__markSeq.push({
        sent: el.textContent.includes("批改中"),
        correct: !!el.querySelector(".mc-stamp--correct"),
      });
    }).observe(el, { childList: true, subtree: true });
  });
  const l3r1b = await host.evaluate(() => G.level.pillars[0].root);
  const vdBeat = await submitVerdict(phoneA2, l3r1b);
  const markSeq = await phoneA2.evaluate(() => window.__markSeq);
  const sentIdx = markSeq.findIndex((m) => m.sent);
  const correctIdx = markSeq.findIndex((m) => m.correct);
  check(
    "submit shows the sent · marking beat",
    vdBeat.ok === true && sentIdx !== -1,
    JSON.stringify({ sentIdx, head: markSeq.slice(0, 6) })
  );
  const finalMark = await phoneA2.evaluate(() => ({
    correct: !!document.querySelector("#ctrlMark .mc-stamp--correct"),
    sentGone: !document.getElementById("ctrlMark").textContent.includes("批改中"),
  }));
  check(
    "verdict feedback replaces the sent beat",
    correctIdx > sentIdx && finalMark.correct && finalMark.sentGone,
    JSON.stringify({ sentIdx, correctIdx, finalMark })
  );

  /* ════════ page-error census — the whole run, every section ════════ */
  const hostBad = hostErrors.filter((l) => !benign(l));
  const aBad = aErrors.filter((l) => !benign(l));
  const bBad = bErrors.filter((l) => !benign(l));
  check("no host errors", hostBad.length === 0, JSON.stringify(hostBad));
  check("no phone A errors", aBad.length === 0, JSON.stringify(aBad));
  check("no phone B errors", bBad.length === 0, JSON.stringify(bBad));

  await browser.close();
  console.log("");
  console.log("ALL PASS");
  process.stderr.write(
    "(" + passCount + " assertions, " + ((Date.now() - t0) / 1000).toFixed(1) + "s)\n"
  );
}

const watchdog = setTimeout(() => {
  console.error("SUITE TIMEOUT after 280s");
  process.exit(1);
}, 280000);

main()
  .then(() => {
    clearTimeout(watchdog);
    process.exit(0);
  })
  .catch((err) => {
    clearTimeout(watchdog);
    console.error("\nFAILED after " + passCount + " passing assertions:");
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
