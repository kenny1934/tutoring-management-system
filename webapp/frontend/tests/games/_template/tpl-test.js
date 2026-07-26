/* 配對挑戰 Match Up (_template) — contract smoke suite
 *
 * The starter template is the reference every companion game is copied
 * from, so its slice of the multi-device contract must actually work.
 * This suite drives it with a mocked GameBridge (localStorage rooms +
 * BroadcastChannel, the same mock the zero-blast multi suite uses) so the
 * host + phone paths run WITHOUT Firebase, and covers:
 *   - SOLO: a full 5-round run scores correctly and the per-round
 *     `resolved` guard blocks a double endRound (no after-buzzer re-advance)
 *   - MULTI: a phone reveals the play surface when the tutor starts, and
 *     join-by-code on the cover errors inline on a dead code but rides
 *     the same ?room= path as the QR on a live one
 *   - HOST-REFRESH RECOVERY: a lobby / mid-game / paused host F5 offers to
 *     resume the SAME room, keeps scores + players, re-publishes state, and
 *     the joined phone reconnects instead of being stranded
 *
 * How to run (serve public/ on :8000, e.g. `cd webapp/frontend/public &&
 * python3 -m http.server 8000`):
 *   cd /home/kenny/projects/tutoring-management-system
 *   NODE_PATH=webapp/frontend/node_modules \
 *   node webapp/frontend/tests/games/_template/tpl-test.js
 *
 * TPL_BASE overrides the target (default http://localhost:8000/games/_template/).
 * Exit 0 + "ALL PASS" when every assertion holds.
 */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.TPL_BASE || "http://localhost:8000/games/_template/";

/* ── the GameBridge mock, same shape as zb-multi-test.js: host()/join()
 * over localStorage rooms + BroadcastChannel, FIFO setTimeout(0) delivery ── */
const MOCK = `
(function () {
  "use strict";
  var qp = new URLSearchParams(location.search);
  function storeKey(slug, code) { return "zbmock-room-" + slug + "-" + code; }
  function readRoom(slug, code) {
    try { var raw = localStorage.getItem(storeKey(slug, code)); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function writeRoom(slug, code, data) {
    if (data === null) localStorage.removeItem(storeKey(slug, code));
    else localStorage.setItem(storeKey(slug, code), JSON.stringify(data));
  }
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
  var entries = {};
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
      setTimeout(function () { if (!w.closed) w.cb(copy); }, 0);
    });
  }
  function broadcast(slug, code) {
    var entry = entryFor(slug, code);
    var snapshot = readRoom(slug, code);
    deliver(entry, snapshot);
    entry.chan.postMessage({ snapshot: snapshot });
  }
  function makeHandle(slug, code, withJoinUrl) {
    var entry = entryFor(slug, code);
    var h = {
      code: code,
      get: function (sub) {
        var room = readRoom(slug, code);
        if (!sub) return Promise.resolve(room);
        var node = room;
        sub.split("/").filter(Boolean).forEach(function (k) { node = node == null ? null : node[k]; });
        return Promise.resolve(node === undefined ? null : node);
      },
      set: function (sub, v) { writeRoom(slug, code, setPath(readRoom(slug, code), sub, v === undefined ? null : v)); broadcast(slug, code); return Promise.resolve(); },
      update: function (sub, patch) {
        var room = readRoom(slug, code);
        Object.keys(patch || {}).forEach(function (k) { room = setPath(room, sub + "/" + k, patch[k]); });
        writeRoom(slug, code, room); broadcast(slug, code); return Promise.resolve();
      },
      watch: function (cb, onStatus) {
        var w = { cb: cb, closed: false };
        entry.watchers.push(w);
        if (onStatus) onStatus("online");
        var pill = document.querySelector(".mc-conn"); if (pill) pill.setAttribute("data-conn", "online");
        var snap = readRoom(slug, code);
        setTimeout(function () { if (!w.closed) w.cb(snap ? JSON.parse(JSON.stringify(snap)) : null); }, 0);
        return { close: function () { w.closed = true; } };
      },
      close: function () { writeRoom(slug, code, null); broadcast(slug, code); return Promise.resolve(); },
    };
    if (withJoinUrl) {
      var lang = GameBridge.getLang && GameBridge.getLang();
      h.joinUrl = location.origin + location.pathname + "?room=" + code + (lang ? "&lang=" + lang : "");
    }
    return h;
  }
  GameBridge.host = function (opts) {
    var slug = opts.slug;
    if (opts.code) {
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

let passCount = 0, fails = 0;
function check(name, cond, detail) {
  if (cond) { passCount++; console.log("  ✓ " + name); }
  else { console.log("  ✗ " + name + (detail ? " — " + detail : "")); fails++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, opts = {}) {
  const timeout = opts.timeout || 8000, interval = opts.interval || 60, start = Date.now();
  for (;;) {
    let v; try { v = await fn(); } catch (_) { v = undefined; }
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error("timeout: " + (opts.label || "condition"));
    await sleep(interval);
  }
}
const bridgeG = (p) => p.evaluate(() => { try { window.G = G; } catch (_) {} });
const roomState = (p) => p.evaluate(() => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf("zbmock-room-_template-") === 0) return JSON.parse(localStorage.getItem(k)).state;
    }
  } catch (_) {}
  return null;
});

(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => { try { if (localStorage.getItem("mc-games-sound") === null) localStorage.setItem("mc-games-sound", "off"); } catch (e) {} });
  await context.route("**/shared/game-bridge.js", async (route) => {
    const resp = await route.fetch();
    const body = await resp.text();
    await route.fulfill({ status: 200, contentType: "application/javascript", body: body + "\n" + MOCK });
  });
  const errs = [];

  /* ════════ SOLO ════════ */
  const solo = await context.newPage();
  await solo.setViewportSize({ width: 390, height: 844 });
  solo.on("pageerror", (e) => errs.push("solo: " + e));
  await solo.goto(BASE, { waitUntil: "networkidle" });
  await solo.click("#btnSolo");
  for (let i = 0; i < 8; i++) {
    if (await solo.evaluate(() => document.getElementById("endScreen").classList.contains("active"))) break;
    await solo.evaluate(() => {
      const m = document.getElementById("exprBox").textContent.match(/(-?\d+)\s*[×x*]\s*(-?\d+)/);
      if (!m) return;
      const prod = parseInt(m[1], 10) * parseInt(m[2], 10);
      const hit = [...document.querySelectorAll("#optionRow .tpl-opt")].find((b) => parseInt(b.textContent, 10) === prod);
      if (hit) hit.click();
    });
    await sleep(1500);
  }
  const soloEnd = await solo.evaluate(() => ({ score: document.getElementById("scoreBox").textContent, ended: document.getElementById("endScreen").classList.contains("active") }));
  check("solo: full run scores every round", soloEnd.ended && soloEnd.score === "5", JSON.stringify(soloEnd));
  const guard = await solo.evaluate(() => {
    try { window.G = G; window.endRound = endRound; } catch (_) { return "no-bridge"; }
    const before = window.G.idx; window.G.resolved = true;
    window.endRound(true); window.endRound(false);
    return window.G.idx === before ? "PASS" : "FAIL(" + before + "->" + window.G.idx + ")";
  });
  check("solo: resolved guard blocks a double endRound", guard === "PASS", guard);
  await solo.close();

  /* ════════ MULTI + host-refresh recovery ════════ */
  const host = await context.newPage();
  host.on("pageerror", (e) => errs.push("host: " + e));
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  phone.on("pageerror", (e) => errs.push("phone: " + e));

  await host.goto(BASE, { waitUntil: "load" });
  await host.click("#btnHost");
  await until(() => host.evaluate(() => document.getElementById("lobbyScreen").classList.contains("active")), { label: "lobby" });
  const code = await host.evaluate(() => document.getElementById("roomCode").textContent);

  await phone.goto(BASE + "?room=" + code, { waitUntil: "load" });
  await until(() => phone.evaluate(() => document.getElementById("ctrlJoin").offsetParent !== null), { label: "join form" });
  await phone.fill("#ctrlNameInput", "Ada");
  await phone.click("#btnJoin");
  await until(() => host.evaluate(() => document.querySelectorAll("#playerList span[data-id]").length > 0), { label: "player chip" });

  // join by code: the cover's no-camera fallback (probe before navigate)
  const phone2 = await context.newPage();
  await phone2.setViewportSize({ width: 390, height: 844 });
  phone2.on("pageerror", (e) => errs.push("phone2: " + e));
  await phone2.goto(BASE, { waitUntil: "load" });
  await phone2.fill("#joinCode", "0000"); // no such room in the mock
  await phone2.click("#btnJoinCode");
  await until(() => phone2.evaluate(() => {
    const el = document.getElementById("joinCodeStatus");
    return el.classList.contains("mc-status--danger") ? el.textContent : null;
  }), { label: "join-by-code inline error" });
  const stay = await phone2.evaluate(() => ({
    stayed: !location.search.includes("room="),
    retryOpen: !document.getElementById("btnJoinCode").disabled,
    note: document.getElementById("joinCodeStatus").textContent,
  }));
  check("join by code: dead code errors inline and stays on the cover",
    stay.stayed && stay.retryOpen && stay.note.includes("搵唔到房間"), JSON.stringify(stay));
  await phone2.fill("#joinCode", code);
  await phone2.click("#btnJoinCode");
  await phone2.waitForURL((u) => u.searchParams.get("room") === code, { timeout: 8000 });
  await until(() => phone2.evaluate(() => document.getElementById("ctrlJoin").offsetParent !== null), { label: "join form via code" });
  check("join by code: live code rides the QR's ?room= path to the name form", true);
  await phone2.close(); // never joins as a player: the roster stays at Ada

  // C — lobby refresh (before the game starts)
  await host.reload({ waitUntil: "load" });
  await until(() => host.evaluate(() => getComputedStyle(document.getElementById("btnResume")).display !== "none"), { label: "C resume offer" });
  check("lobby refresh offers 繼續上一場", true);
  await host.click("#btnResume");
  await until(() => host.evaluate(() => document.getElementById("lobbyScreen").classList.contains("active")), { label: "C lobby" });
  check("lobby refresh resumes the same room code", (await host.evaluate(() => document.getElementById("roomCode").textContent)) === code);
  await until(() => host.evaluate(() => document.querySelectorAll("#playerList span[data-id]").length > 0), { label: "C player kept" });
  check("lobby refresh keeps the joined phone", true);

  // start the game; the phone must reveal the play surface
  await until(() => host.evaluate(() => getComputedStyle(document.getElementById("btnStart")).display !== "none"), { label: "start btn" });
  await host.click("#btnStart");
  await until(() => host.evaluate(() => document.getElementById("gameScreen").classList.contains("active")), { label: "game screen" });
  await bridgeG(host);
  await until(() => phone.evaluate(() => document.getElementById("ctrlPlay").style.display !== "none"), { label: "phone play surface" });
  check("phone reveals the play surface when the tutor starts", true);

  // phone scores a claim (probe peeks the host's answer)
  const answer = await host.evaluate(() => window.G.round.answer);
  await until(() => phone.evaluate(() => document.querySelectorAll("#ctrlOptions button").length > 0), { label: "phone options" });
  await phone.evaluate((ans) => {
    const b = [...document.querySelectorAll("#ctrlOptions button")].find((x) => parseInt(x.textContent, 10) === ans);
    if (b) b.click();
  }, answer);
  await until(() => host.evaluate(() => { window.G = G; return Object.values(G.scores).some((s) => s > 0); }), { label: "score recorded" });
  const pre = await host.evaluate(() => ({ scores: JSON.parse(JSON.stringify(G.scores)), players: Object.keys(G.players).length }));

  // A — mid-game refresh
  await sleep(1500);
  await host.reload({ waitUntil: "load" });
  await until(() => host.evaluate(() => getComputedStyle(document.getElementById("btnResume")).display !== "none"), { label: "A resume offer" });
  check("mid-game refresh offers resume", true);
  await host.click("#btnResume");
  await until(() => host.evaluate(() => document.getElementById("gameScreen").classList.contains("active") && typeof G !== "undefined" && G.started), { label: "A resumed" });
  await bridgeG(host);
  const post = await host.evaluate(() => ({ scores: JSON.parse(JSON.stringify(window.G.scores)), players: Object.keys(window.G.players).length }));
  check("mid-game refresh keeps scores", JSON.stringify(post.scores) === JSON.stringify(pre.scores), JSON.stringify(pre.scores) + " -> " + JSON.stringify(post.scores));
  check("mid-game refresh keeps players", post.players === pre.players, pre.players + " -> " + post.players);
  check("mid-game refresh re-publishes playing", (await roomState(host))?.phase === "playing");
  await until(() => phone.evaluate(() => { try { return C.phase === "playing" && document.getElementById("ctrlPlay").style.display !== "none"; } catch (_) { return false; } }), { label: "A phone reconnected" });
  check("joined phone reconnects to the resumed round", true);

  // B — paused refresh
  await host.evaluate(() => document.getElementById("btnPause").click());
  await until(() => roomState(host).then((s) => s && s.phase === "paused"), { label: "paused" });
  await host.reload({ waitUntil: "load" });
  await until(() => host.evaluate(() => getComputedStyle(document.getElementById("btnResume")).display !== "none"), { label: "B resume offer" });
  await host.click("#btnResume");
  await until(() => host.evaluate(() => document.getElementById("gameScreen").classList.contains("active") && typeof G !== "undefined" && G.started), { label: "B resumed" });
  check("paused round resumes PAUSED", (await host.evaluate(() => { window.G = G; return G.paused; })) === true);
  check("paused refresh re-publishes paused, not live", (await roomState(host))?.phase === "paused");

  check("no page errors in any scenario", errs.length === 0, errs.join(" | "));

  await browser.close();
  console.log("");
  if (fails === 0) { console.log("ALL PASS"); process.stderr.write("(" + passCount + " assertions)\n"); process.exit(0); }
  else { console.log(fails + " FAILED"); process.exit(1); }
})().catch((e) => { console.error("SUITE ERROR:", e.message); process.exit(1); });
