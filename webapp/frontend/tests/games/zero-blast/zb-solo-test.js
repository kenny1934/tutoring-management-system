/* zb-solo-test.js — 歸零爆破 Zero Blast, SOLO-mode Playwright suite (162 assertions)
 *
 * Drives a full seeded solo run (12 buildings) plus a restart run and a set
 * of config pages against the live game, asserting the demolition grammar,
 * the camera, the scoring maths (incl. the 1.5x double-hit rule), pillar
 * root-rank ordering, the opt-in kind-6 hint contract and the report
 * ceremony.
 *
 * How to run (from the repo root, against a server that serves public/):
 *   NODE_PATH=webapp/frontend/node_modules \
 *   node webapp/frontend/tests/games/zero-blast/zb-solo-test.js
 *
 * ZB_BASE overrides the target (default http://localhost:8000/games/zero-blast/).
 * Prints "  ✓ <name>" per assertion (162 of them), unchecked diagnostic
 * lines for each building, and "ALL PASS" when green; any failure prints
 * its detail and the process exits non-zero.
 *
 * Determinism notes:
 * - ?seed=7 makes the level roll reproducible (ZBLevels.rng mulberry32).
 * - Point payouts are made exact by pinning G.deadline to a chosen
 *   remaining-fraction immediately before each submission (same-task, so
 *   submitCode computes from the pinned fraction): the schedule
 *   196/220/240/187/201/240/257/280/299/320/338/540/570/800/796 ×3 → 8676
 *   (the kind-5 double hits pay 1.5x base, not 2x).
 * - Keypad commits ride the 750ms arm window: double-tap the digit in ONE
 *   evaluate (two .click() in the same task) to commit instantly.
 * - Transient classes (zb-page-in, cracks, hit-stop, chop slam, flash…)
 *   are caught with a persistent in-page MutationObserver latch installed
 *   BEFORE the trigger, never by polling round-trips.
 */
"use strict";

const { chromium } = require("playwright");

const RAW_BASE = process.env.ZB_BASE || "http://localhost:8000/games/zero-blast/";
const BASE = RAW_BASE.endsWith("/") ? RAW_BASE : RAW_BASE + "/";
const SEED = 7;

/* ---------------- tiny harness ---------------- */

let passCount = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    passCount += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail: detail || "" });
    console.log(`  ✗ ${name} — ${detail || "(no detail)"}`);
  }
}
const diag = (line) => console.log(line);
const Y = (s) => `\x1b[33m${s}\x1b[39m`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- page helpers ---------------- */

async function gamePage(ctx, query, errs) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e && e.message ? e.message : e)));
  page.setDefaultTimeout(25000);
  await page.goto(BASE + (query ? "?" + query : ""), { waitUntil: "load" });
  // `const G` is a global lexical binding, not a window property; bridge it
  // once (the object is mutated but never reassigned, so this stays live).
  await page.evaluate(() => { window.G = G; });
  return page;
}

function untilSeq(page, seq) {
  return page.waitForFunction(
    (s) => window.G && window.G.level && window.G.level.seq === s,
    seq, { timeout: 25000 });
}
function untilStaged(page) {
  return page.waitForFunction(() => window.G && window.G.staged === true, null, { timeout: 25000 });
}

function levelInfo(page) {
  return page.evaluate(() => {
    const l = window.G.level;
    return {
      seq: l.seq, stage: l.stage, round: l.round, n: l.n,
      hard: !!l.hard, finale: !!l.finale, expr: l.expr,
      roots: window.ZBLevels.roots(l),
      pillarRoots: l.pillars.map((p) => p.root),
      konst: l.konst == null ? null : l.konst,
    };
  });
}
function diagLine(i) {
  return `#${i.seq} (stage ${i.stage}-${i.round}, kind ${i.n}${i.hard ? " hard" : ""}${i.finale ? " finale" : ""}): ${i.expr} — roots ${i.roots.join(",")}`;
}

/* pin the remaining fraction, then double-tap the digit (one task) */
function submit(page, v, frac) {
  return page.evaluate(([val, fr]) => {
    const G = window.G;
    if (fr != null) G.deadline = performance.now() + fr * G.duration;
    const before = { score: G.score, streak: G.streak, claimed: G.claimed.length };
    const pad = document.getElementById("pad");
    const sign = pad.querySelector(".zb-key--sign");
    const key = pad.querySelector(`.zb-key[data-d="${Math.abs(val)}"]`);
    if (val < 0) sign.click();
    key.click(); key.click();
    return { before, after: { score: G.score, streak: G.streak, claimed: G.claimed.length } };
  }, [v, frac]);
}

/* payout assertion: dynamic name mirrors the classic suite exactly.
 * A double hit pays 1.5x base (hit factor 1 + 0.5*(hits-1)), not 2x. */
function ptsCheck(seq, r, finale) {
  const pts = r.after.score - r.before.score;
  const hits = Math.max(1, r.after.claimed - r.before.claimed);
  const s = r.before.streak;
  const hf = 1 + 0.5 * (hits - 1);
  const mult = 1 + 0.1 * Math.min(s, 10);
  const lf = finale ? 2 : 1;
  const lo = Math.round(100 * hf * mult * lf);
  const hi = Math.round(200 * hf * mult * lf);
  check(
    `#${seq} pts ${pts} in [${lo},${hi}] (streak ${s}${finale ? ", finale x2" : ""})`,
    pts >= lo && pts <= hi && r.after.streak === s + 1,
    `pts ${pts} range [${lo},${hi}] hits ${hits} streak ${s}->${r.after.streak}`
  );
  return pts;
}

/* persistent latch for one collapse / verdict window */
function installLatch(page) {
  return page.evaluate(() => {
    if (window.__Lobs) { try { window.__Lobs.disconnect(); } catch (_) {} }
    if (window.__Lint) clearInterval(window.__Lint);
    const L = (window.__L = { flashCount: 0, ringMaxR: 0, punchMax: 1, dustMax: 0, alphaMax: 0 });
    const now = () => performance.now();
    const wrap = document.querySelector(".zb-scenewrap");
    const grid = document.querySelector("#gameScreen .zb-game-grid");
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            const cl = n.classList;
            if (cl.contains("zb-cracks")) L.cracksAt = L.cracksAt || now();
            if (cl.contains("zb-shockring")) {
              L.ringAt = now();
              L.ringCx = n.getAttribute("cx");
              L.ringCy = n.getAttribute("cy");
            }
            if (cl.contains("zb-blastflash")) {
              L.flashCount += 1;
              L.flashAt = now();
              L.flashBg = getComputedStyle(n).backgroundColor;
            }
            if (cl.contains("zb-floatpts")) {
              L.floatAt = now();
              L.floatText = n.textContent;
              const cs = getComputedStyle(n);
              L.floatSize = parseFloat(cs.fontSize);
            }
            if (cl.contains("zb-strengthflash")) { L.strengthAt = now(); L.strengthText = n.textContent; }
            if (cl.contains("zb-chai")) L.chopAt = L.chopAt || now();
          });
          m.removedNodes.forEach((n) => {
            if (n.nodeType === 1 && n.classList.contains("zb-blastflash")) L.flashGoneAt = now();
          });
        } else {
          const el = m.target;
          if (!el || el.nodeType !== 1) continue;
          if (m.attributeName === "class") {
            const cl = el.classList;
            if (el.id === "scene" && cl.contains("zb-hitstop")) L.hitstopAt = L.hitstopAt || now();
            if (el.id === "deck") {
              if (cl.contains("fall")) L.fallAt = L.fallAt || now();
              if (cl.contains("dissolve")) L.dissolveAt = L.dissolveAt || now();
            }
            if (el.id === "crew" && cl.contains("zb-crew--run")) L.crewRunAt = L.crewRunAt || now();
            if (el.id === "rubble" && cl.contains("compact")) L.compactAt = L.compactAt || now();
            if (el.id === "structSvg" && cl.contains("zb-shrug")) L.shrugAt = L.shrugAt || now();
            if (el.id === "scoreBox" && cl.contains("zb-scorebump")) L.bumpAt = L.bumpAt || now();
            if (el === grid && cl.contains("zb-page-in")) L.pageInAt = L.pageInAt || now();
          } else if (m.attributeName === "style" && el === wrap) {
            const tr = el.style.transform || "";
            const mm = /matrix\(([-\d.]+)/.exec(tr);
            const ms = /scale\(([-\d.]+)/.exec(tr);
            if (mm) L.punchMax = Math.max(L.punchMax, parseFloat(mm[1]));
            if (ms) L.punchMax = Math.max(L.punchMax, parseFloat(ms[1]));
          } else if (m.attributeName === "r" && el.classList.contains("zb-shockring")) {
            L.ringMaxR = Math.max(L.ringMaxR, parseFloat(el.getAttribute("r")) || 0);
          } else if (m.attributeName === "data-pose" && el.id === "foreman") {
            if (el.dataset.pose === "push") L.foremanAt = L.foremanAt || now();
          } else if (m.attributeName === "d" && el.id === "detonator") {
            if ((el.getAttribute("d") || "").includes("M34 190 v-4")) L.detPushedAt = L.detPushedAt || now();
          }
        }
      }
    });
    obs.observe(document.getElementById("gameScreen"), {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "r", "data-pose", "d"],
    });
    window.__Lobs = obs;
    window.__Lint = setInterval(() => {
      const s = window.ZBFX.stats();
      L.dustMax = Math.max(L.dustMax, s.dust || 0);
      L.alphaMax = Math.max(L.alphaMax, s.maxDustAlpha || 0);
    }, 40);
  });
}
function readLatch(page) {
  return page.evaluate(() => Object.assign({}, window.__L));
}

/* the camera/dressing record taken the moment a round opens */
function camRecord(page) {
  return page.evaluate(() => {
    const G = window.G;
    const vb = document.getElementById("structSvg").viewBox.baseVal;
    const deck = document.getElementById("deck");
    const bb = deck.getBBox();
    return {
      seq: G.level.seq,
      n: G.level.n,
      hintChip: document.getElementById("soloHint").style.display !== "none",
      dress: deck.dataset.dress,
      vb: { x: vb.x, y: vb.y, w: vb.width, h: vb.height },
      rest: G.camRest
        ? { x: G.camRest.x, y: G.camRest.y, w: G.camRest.w, h: G.camRest.h }
        : null,
      bb: { x: bb.x, y: bb.y, w: bb.width, h: bb.height },
    };
  });
}

/* graph sample: axis fit, tangency, tags */
function graphSample(page) {
  return page.evaluate(() => {
    const g = document.getElementById("graph");
    if (!g) return null;
    const curve = g.querySelector(".zb-graph__curve");
    const len = curve.getTotalLength();
    let minDist = 1e9, below = 0;
    for (let i = 0; i <= 240; i++) {
      const p = curve.getPointAtLength((len * i) / 240);
      if (p.y > 171.6) below += 1;
      minDist = Math.min(minDist, Math.abs(p.y - 171));
    }
    const circ = g.querySelector("circle");
    const axes = [...g.querySelectorAll(".zb-graph__axis")].map((a) => a.getAttribute("d"));
    return {
      texts: [...g.querySelectorAll("text")].map((t) => t.textContent),
      axes,
      minDist,
      below,
      circ: circ ? { cx: circ.getAttribute("cx"), cy: circ.getAttribute("cy") } : null,
      konst: window.G.level.konst == null ? null : window.G.level.konst,
    };
  });
}

/* ---------------- the suite ---------------- */

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const errsMain = [];
    const page = await gamePage(ctx, "seed=" + SEED, errsMain);

    /* ══ intro / cover ══ */
    const intro = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const L = window.ZBLevels;
      return {
        title: (q("#introScreen .mc-title") || {}).textContent || "",
        hostVisible: !!(q("#btnHost") && q("#btnHost").offsetParent && q("#btnHost").offsetWidth > 0),
        hero: !!q(".zb-hero"),
        dioBuildings: document.querySelectorAll(".zb-hero .zb-dio__b").length,
        fuseline: !!q(".zb-hero .zb-dio__fuseline"),
        stampText: (q(".zb-hero .zb-dio__stamp text") || {}).textContent || "",
        howto: [...document.querySelectorAll("#howtoCard .zb-howto__item")].map((i) => !!i.querySelector("svg")),
        arcHowto: [...document.querySelectorAll("#arcHowtoCard .zb-howto__item")].map((i) => !!i.querySelector("svg")),
        arcStrip: [...document.querySelectorAll(".zb-covertrack .zb-track__step")].map((s) => s.textContent).join("|"),
        arcNote: (document.querySelector(".zb-covertrack__note") || {}).textContent || "",
        // §19.5: the cover splits on a wide stage - controls right, so
        // the host button and the logo both clear a laptop fold
        fold: {
          vh: innerHeight,
          host: Math.round(q("#btnHost").getBoundingClientRect().bottom),
          brand: Math.round(q("#introScreen .mc-brand").getBoundingClientRect().bottom),
          cols: getComputedStyle(q("#introScreen .zb-splitgrid")).gridTemplateColumns.split(" ").length,
        },
        duration: (q("#introScreen .mc-meta") || {}).textContent || "",
        pts: {
          full: L.points(1, 1, 0), none: L.points(0, 1, 0), half: L.points(0.5, 1, 0),
          s3: L.points(1, 1, 3), s10: L.points(1, 1, 10), s20: L.points(1, 1, 20),
          echo: L.points(1, 1, 0, 0.4), echoS: L.points(0.5, 1, 2, 0.4),
          dblFull: L.points(1, 2, 0), dblNone: L.points(0, 2, 0), dblStreak: L.points(1, 2, 8),
        },
      };
    });
    check("intro title", intro.title.includes("歸零爆破"), `title "${intro.title}"`);
    check("host button visible", intro.hostVisible, "btnHost hidden");
    check("intro hero vignette drawn",
      intro.hero && intro.dioBuildings >= 3 && intro.fuseline && intro.stampText === "拆",
      JSON.stringify({ dio: intro.dioBuildings, fuse: intro.fuseline, stamp: intro.stampText }));
    check("how-to is three mini-diagrams",
      intro.howto.length === 3 && intro.howto.every(Boolean), `items ${intro.howto.length}`);
    check("§19.4: the arc has a how-to of its own, also three diagrams",
      intro.arcHowto.length === 3 && intro.arcHowto.every(Boolean), `items ${intro.arcHowto.length}`);
    check("§19.4: the cover names the whole lesson, not the main game alone",
      intro.arcStrip === "探究一|探究二|概念轉化|主遊戲" && intro.arcNote.includes("等式開口中"),
      JSON.stringify({ strip: intro.arcStrip, note: intro.arcNote.slice(0, 40) }));
    check("§19.5: the cover's controls and logo clear the fold on a laptop",
      intro.fold.cols === 2 && intro.fold.host < intro.fold.vh && intro.fold.brand <= intro.fold.vh,
      JSON.stringify(intro.fold));
    check("§19.6: the clock is the measured whole-lesson 10 to 15 minutes, arc included",
      intro.duration.includes("10至15") && intro.duration.includes("全程"), intro.duration);
    // §19.6: reclaim is a recovery path - it waits behind its own line
    // rather than sitting on the cover as a fourth control
    const reclaimBefore = await page.evaluate(() => ({
      row: getComputedStyle(document.getElementById("reclaimRow")).display,
      link: getComputedStyle(document.getElementById("btnReclaimShow")).display,
      join: getComputedStyle(document.getElementById("joinCode")).display,
    }));
    await page.click("#btnReclaimShow");
    const reclaimAfter = await page.evaluate(() => ({
      row: getComputedStyle(document.getElementById("reclaimRow")).display,
      link: getComputedStyle(document.getElementById("btnReclaimShow")).display,
    }));
    check("§19.6: reclaim hides behind a link, the join field stays out in the open",
      reclaimBefore.row === "none" && reclaimBefore.link !== "none" && reclaimBefore.join !== "none" &&
      reclaimAfter.row !== "none" && reclaimAfter.link === "none",
      JSON.stringify({ before: reclaimBefore, after: reclaimAfter }));
    check("points: base speed",
      intro.pts.full === 200 && intro.pts.none === 100 && intro.pts.half === 150,
      JSON.stringify(intro.pts));
    check("points: streak multiplier", intro.pts.s3 === 260, `points(1,1,3)=${intro.pts.s3}`);
    check("points: multiplier caps at x2",
      intro.pts.s10 === 400 && intro.pts.s20 === 400, `s10=${intro.pts.s10} s20=${intro.pts.s20}`);
    check("points: echo factor",
      intro.pts.echo === 80 && intro.pts.echoS === 72, `echo=${intro.pts.echo} echoS=${intro.pts.echoS}`);
    check("points: double hit pays 1.5x",
      intro.pts.dblFull === 300 && intro.pts.dblNone === 150 && intro.pts.dblStreak === 540 &&
      intro.pts.dblFull === Math.round(1.5 * intro.pts.full),
      JSON.stringify({ full: intro.pts.dblFull, none: intro.pts.dblNone, s8: intro.pts.dblStreak }));

    /* pure plan checks (computed before the run starts, printed after 9) */
    const pc = await page.evaluate(() => {
      const L = window.ZBLevels;
      const plan = L.planFromConfig({});
      const lv = L.genPlan(plan, L.rng(1));
      let keypadOk = true;
      for (let seed = 1; seed <= 60; seed++) {
        for (const cfg of [{}, { diff: "hard" }, { diff: "easy" }]) {
          for (const l of L.genPlan(L.planFromConfig(cfg), L.rng(seed)))
            for (const p of l.pillars)
              if (!Number.isInteger(p.root) || Math.abs(p.root) > 9) keypadOk = false;
        }
      }
      return {
        count: lv.length,
        stageKinds: plan.map((s) => s.kind),
        kinds: lv.map((l) => l.n),
        hardOk: lv.every((l) => l.hard === (l.round > 1)),
        codes: lv.reduce((a, l) => a + L.roots(l).length, 0),
        fuseTotal: plan.reduce((a, s) => a + s.rounds * s.fuseMs, 0),
        keypadOk,
        finaleOk: lv.every((l) => l.finale === (l.stage === plan.length)),
      };
    });

    /* page-turn latch, then 單人 start */
    await page.evaluate(() => {
      window.__turnSeen = false;
      const el = document.getElementById("gameScreen");
      new MutationObserver(() => {
        if (el.classList.contains("zb-turnin")) window.__turnSeen = true;
      }).observe(el, { attributes: true, attributeFilter: ["class"] });
    });
    const runStart = Date.now();
    await page.click("#btnSolo");
    const turnSeen = await page.evaluate(
      () => window.__turnSeen || document.getElementById("gameScreen").classList.contains("zb-turnin"));
    check("page turn-in on screen change", turnSeen, "zb-turnin never latched on #gameScreen");

    check("std plan: 13 buildings", pc.count === 13, `count ${pc.count}`);
    check("std plan: kind order (the gate closes the run)",
      JSON.stringify(pc.stageKinds) === "[1,2,3,4,5,6,7]" &&
      JSON.stringify(pc.kinds) === "[1,2,2,3,3,4,4,5,5,6,6,6,7]",
      JSON.stringify(pc.kinds));
    check("std plan: round 2+ is hard", pc.hardOk, "hard flag mismatch");
    check("std plan: ~22 codes", pc.codes >= 20 && pc.codes <= 24, `codes ${pc.codes}`);
    check("std plan: fuse budget 7.75 min", pc.fuseTotal === 465000, `total ${pc.fuseTotal}ms`);
    check("all roots fit the keypad", pc.keypadOk, "root outside -9..9 across 60 seeds");
    check("finale flag on the last street only", pc.finaleOk, "finale flag mismatch");

    const records = [];

    /* ══ building #1 — the full grammar ══ */
    const info1 = await levelInfo(page);
    diag(diagLine(info1));

    const card = await page.evaluate(() => {
      const board = document.getElementById("exprBoard");
      return {
        cardShown: document.getElementById("levelCard").classList.contains("show"),
        sparking: window.ZBFX.sparking(),
        boardWait: board.classList.contains("zb-board--wait"),
        inkVis: getComputedStyle(board.querySelector(".zb-board__ink")).visibility,
        staged: window.G.staged,
        padDisabled: [...document.querySelectorAll("#pad .zb-key")].every((k) => k.disabled),
        plan: document.getElementById("levelCardPlan").textContent,
        n: document.getElementById("levelCardN").textContent,
        sub: document.getElementById("levelCardSub").textContent,
        meta: document.getElementById("levelCardMeta").textContent,
      };
    });
    check("no sparks during the level card", card.cardShown && !card.sparking,
      `cardShown ${card.cardShown} sparking ${card.sparking}`);
    check("question covered during the level card",
      card.boardWait && card.inkVis === "hidden" && !card.staged,
      JSON.stringify({ wait: card.boardWait, vis: card.inkVis, staged: card.staged }));
    check("pad shut during the level card", card.padDisabled, "keys enabled under the card");
    check("level card is a blueprint title block",
      card.cardShown && /PLAN 01\/13/.test(card.plan) && card.n.includes("第 1 關") &&
      card.sub.includes("拆卸目標") && card.meta.includes("MathConcept"),
      JSON.stringify({ plan: card.plan, n: card.n, meta: card.meta }));

    let pencilRode = false;
    try {
      await page.waitForFunction(() => {
        const el = document.getElementById("pencilRider");
        return el && el.getAttribute("opacity") === "1";
      }, null, { timeout: 2400 });
      pencilRode = true;
    } catch (_) { /* falls through as failure */ }
    check("pencil rides the first draw-in", pencilRode, "#pencilRider never lit up");

    const st = await page.evaluate(() => {
      const svg = document.getElementById("structSvg");
      const deck = document.getElementById("deck");
      const probe = (v) => {
        const d = document.createElement("div");
        d.style.color = `var(${v})`;
        document.body.appendChild(d);
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      };
      const survey = svg.querySelector(".zb-survey");
      const washes = [...svg.querySelectorAll(".zb-wash")];
      let pillarWashOk = true;
      document.querySelectorAll(".zb-pillar polygon.zb-wash").forEach((poly) => {
        (poly.getAttribute("points") || "").trim().split(/\s+/).forEach((pt) => {
          const yy = parseFloat(pt.split(",")[1]);
          if (yy > 160.5 && yy < 185.5) pillarWashOk = false;
        });
      });
      const paths = [...svg.querySelectorAll("path")];
      const kerb = paths.find((p) => (p.getAttribute("d") || "").startsWith("M52 197"));
      const lamp = paths.find((p) => (p.getAttribute("d") || "").startsWith("M66 197"));
      const behind = kerb && deck
        ? !!(kerb.compareDocumentPosition(deck) & Node.DOCUMENT_POSITION_FOLLOWING)
        : false;
      const pillars = [...svg.querySelectorAll(".zb-pillar")];
      return {
        survey: !!survey,
        surveyTexts: survey ? [...survey.querySelectorAll("text")].map((t) => t.textContent) : [],
        atmo: !!svg.querySelector(".zb-atmo"),
        crane: !!svg.querySelector(".zb-crane__hook"),
        clouds: svg.querySelectorAll(".zb-cloud").length,
        crewFigures: svg.querySelectorAll("#crew .zb-figure").length,
        foreman: !!svg.querySelector("#foreman"),
        detonator: !!svg.querySelector("#detonator"),
        washCount: washes.length,
        washFill: washes.length ? getComputedStyle(washes[0]).fill : "",
        ink: probe("--mc-ink"), red: probe("--mc-red"), paper: probe("--mc-paper"),
        pillarWashOk,
        kerb: !!kerb, lamp: !!lamp, behind,
        reinfOk: pillars.length > 0 && pillars.every((g) =>
          g.querySelectorAll("path.hv").length >= 2 &&
          [...g.querySelectorAll("path")].some((p) => (p.getAttribute("d") || "").includes("l4 -6"))),
      };
    });
    check("surveyor dimensions annotated",
      st.survey && st.surveyTexts.some((t) => /\d+\s*m/.test(t)), JSON.stringify(st.surveyTexts));
    check("crane and clouds in the atmosphere layer",
      st.atmo && st.crane && st.clouds >= 2, JSON.stringify({ atmo: st.atmo, crane: st.crane, clouds: st.clouds }));
    check("work crew loiters by the site, foreman at the detonator",
      st.crewFigures >= 2 && st.foreman && st.detonator,
      JSON.stringify({ crew: st.crewFigures, foreman: st.foreman, det: st.detonator }));
    check("depth pass: wash layer present, ink tone, never red",
      st.washCount > 0 && st.washFill === st.ink && st.washFill !== st.red,
      JSON.stringify({ n: st.washCount, fill: st.washFill, ink: st.ink, red: st.red }));
    check("depth pass: pillar washes keep clear of the plaque band", st.pillarWashOk,
      "a pillar wash vertex inside the 162..184 plaque band");
    check("depth pass: far street kerb + lamp behind the site",
      st.kerb && st.lamp && st.behind, JSON.stringify({ kerb: st.kerb, lamp: st.lamp, behind: st.behind }));
    check("reinforcement: heavy verticals + hatched footings per pillar", st.reinfOk,
      "missing .hv strokes or footing hatches in a pillar group");

    await untilStaged(page);
    const b30 = await page.evaluate(() => ({
      ink: document.getElementById("exprBoard").classList.contains("zb-board--ink"),
      wait: document.getElementById("exprBoard").classList.contains("zb-board--wait"),
    }));
    check("question inks in when the blueprint stands", b30.ink && !b30.wait, JSON.stringify(b30));

    let sparks = false;
    try {
      await page.waitForFunction(() => window.ZBFX.sparking(), null, { timeout: 4000 });
      sparks = true;
    } catch (_) { /* fail below */ }
    check("sparks after ignition", sparks, "ZBFX.sparking() stayed false after stage");

    const rm = await page.evaluate(() => {
      const rubTop = document.getElementById("rubble").getBBox().y;
      return {
        rubTop,
        marks: [...document.querySelectorAll(".zb-rootmark")].map((m) => parseFloat(m.getAttribute("y"))),
      };
    });
    check("rootmarks sit clear of the rubble band",
      rm.marks.length > 0 && rm.marks.every((y) => y < rm.rubTop + 1),
      JSON.stringify(rm));

    await sleep(280);
    const ash = await page.evaluate(() => ({
      ash: parseFloat((document.getElementById("fuseAsh").getAttribute("stroke-dasharray") || "0 1").split(/\s+/)[0]),
      flecks: document.querySelectorAll(".zb-fleck").length,
    }));
    check("burnt fuse leaves ash and scorch flecks", ash.ash > 0 && ash.flecks > 0, JSON.stringify(ash));

    const map = await page.evaluate(() => {
      const vb = document.getElementById("structSvg").viewBox.baseVal;
      const scene = document.getElementById("scene");
      const w = scene.clientWidth, h = scene.clientHeight;
      const scale = Math.min(w / vb.width, h / vb.height);
      const ox = (w - vb.width * scale) / 2, oy = (h - vb.height * scale) / 2;
      const px = window.ZBFX.toPx(vb.x + 25, vb.y + 40);
      return {
        dx: Math.abs(px.x - (ox + 25 * scale)),
        dy: Math.abs(px.y - (oy + 40 * scale)),
        zoomed: vb.width < 399.5 || vb.height < 239.5,
      };
    });
    check("fx canvas maps through the live viewBox",
      map.dx < 0.6 && map.dy < 0.6 && map.zoomed, JSON.stringify(map));

    const bgm = await page.evaluate(() => {
      const s0 = window.ZBFX.bgm.state();
      const off0 = !window.ZBFX.audio.isOn();
      window.ZBFX.audio.setOn(true);
      const s1 = window.ZBFX.bgm.state();
      window.ZBFX.audio.setOn(false);
      const s2 = window.ZBFX.bgm.state();
      return { s0, off0, s1, s2 };
    });
    check("bgm: armed but silent while sound is off",
      bgm.off0 && bgm.s0.allowed && !!bgm.s0.tier && !bgm.s0.playing, JSON.stringify(bgm.s0));
    check("bgm: opt-in mid-round starts it, opting out stops it",
      bgm.s1.playing && !bgm.s2.playing, JSON.stringify({ on: bgm.s1, off: bgm.s2 }));

    records.push(await camRecord(page));
    await installLatch(page);
    const r1 = await submit(page, info1.pillarRoots[0], 0.96);
    ptsCheck(1, r1, false);

    await page.waitForFunction(() => !!document.getElementById("graph"), null, { timeout: 5000 });
    const g1 = await graphSample(page);

    await untilSeq(page, 2);
    const L1 = await readLatch(page);
    check("dust: few large puffs, not a blob", L1.dustMax > 0 && L1.dustMax <= 60,
      `dustMax ${L1.dustMax}`);
    check("dust: translucent (alpha <= 0.25)", L1.alphaMax > 0 && L1.alphaMax <= 0.25,
      `alphaMax ${L1.alphaMax}`);
    check("chop slam compacts the rubble", !!L1.compactAt, "rubble never got .compact");
    check("crack pre-beat before the fall",
      !!L1.cracksAt && !!L1.fallAt && L1.cracksAt <= L1.fallAt + 1,
      JSON.stringify({ cracksAt: L1.cracksAt, fallAt: L1.fallAt }));
    check("landed debris dissolves into the pile",
      !!L1.dissolveAt && L1.dissolveAt >= (L1.fallAt || 0), `dissolveAt ${L1.dissolveAt}`);
    check("hit-stop holds the scene at the crack",
      !!L1.hitstopAt && L1.hitstopAt >= (L1.cracksAt || 0) - 5 && L1.hitstopAt <= (L1.fallAt || 1e12) + 5,
      JSON.stringify({ hitstopAt: L1.hitstopAt, cracksAt: L1.cracksAt, fallAt: L1.fallAt }));
    check("paper flash mounts once, unmounts <400ms",
      L1.flashCount === 1 && L1.flashGoneAt - L1.flashAt < 470,
      `count ${L1.flashCount} life ${Math.round(L1.flashGoneAt - L1.flashAt)}ms`);
    check("flash is paper-light, never red",
      L1.flashBg === st.paper && L1.flashBg !== st.red,
      JSON.stringify({ bg: L1.flashBg, paper: st.paper, red: st.red }));
    check("ink shockwave ring expands from the deck",
      L1.ringCy === "150" && L1.ringMaxR > 60,
      JSON.stringify({ cx: L1.ringCx, cy: L1.ringCy, maxR: L1.ringMaxR }));
    check("frame punch on the collapse", L1.punchMax > 1.005, `punchMax ${L1.punchMax}`);
    const chopFrom = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch (_) { continue; }
        for (const r of rules)
          if (r.type === CSSRule.KEYFRAMES_RULE && r.name === "zb-chaislam")
            for (const k of r.cssRules) if (k.keyText === "0%") return k.style.transform;
      }
      return "";
    });
    check("chop slams from three times its size",
      !!L1.chopAt && /scale\(3\.1\)/.test(chopFrom), `chopAt ${L1.chopAt} from "${chopFrom}"`);
    check("crew bolted before the fall",
      !!L1.crewRunAt && L1.crewRunAt <= (L1.fallAt || 0) + 5,
      JSON.stringify({ crewRunAt: L1.crewRunAt, fallAt: L1.fallAt }));
    check("foreman leans onto the plunger at the crack",
      !!L1.foremanAt && !!L1.detPushedAt && L1.foremanAt <= (L1.fallAt || 0) + 5,
      JSON.stringify({ foremanAt: L1.foremanAt, detPushedAt: L1.detPushedAt, fallAt: L1.fallAt }));
    check("resolve graph sketches y = kx",
      !!g1 && g1.texts.includes("y = " + g1.konst + "x"),
      g1 ? JSON.stringify(g1.texts) : "no #graph");
    check("origin mark gets its y-axis too",
      !!g1 && g1.axes.length >= 2 && g1.axes.some((d) => /V\s*206/.test(d || "")),
      g1 ? JSON.stringify(g1.axes) : "no #graph");
    check("round page-turn slides the new worksheet in", !!L1.pageInAt, "zb-page-in never latched");
    const pencilGone = await page.evaluate(() => !document.getElementById("pencilRider"));
    check("pencil is gone after building 1", pencilGone, "#pencilRider still mounted");

    /* ══ building #2 — the score theatre ══ */
    const info2 = await levelInfo(page);
    diag(diagLine(info2));
    await untilStaged(page);
    records.push(await camRecord(page));
    await installLatch(page);
    const r2 = await page.evaluate(async ([val, fr]) => {
      const G = window.G;
      G.deadline = performance.now() + fr * G.duration;
      const before = { score: G.score, streak: G.streak, claimed: G.claimed.length };
      const pad = document.getElementById("pad");
      const key = pad.querySelector(`.zb-key[data-d="${Math.abs(val)}"]`);
      if (val < 0) pad.querySelector(".zb-key--sign").click();
      key.click(); key.click();
      const after = { score: G.score, streak: G.streak, claimed: G.claimed.length };
      const grab = () => parseInt(String(document.getElementById("scoreBox").textContent).replace(/[^\d]/g, ""), 10);
      await new Promise((r) => setTimeout(r, 80));
      const midA = grab();
      await new Promise((r) => setTimeout(r, 80));
      const midB = grab();
      return { before, after, midA, midB };
    }, [info2.pillarRoots[0], 1.05]);
    await sleep(1050);
    const L2 = await readLatch(page);
    const set2 = await page.evaluate(() => ({
      scoreText: document.getElementById("scoreBox").textContent,
      mult: (document.querySelector("#stars .zb-mult") || {}).textContent || "",
      starNew: !!document.querySelector("#stars svg.zb-starnew"),
      struck: !!document.querySelector("#exprBoard .zb-factor.struck"),
      struckBy: !!document.querySelector("#exprBoard .zb-factor .zb-factor__by"),
    }));
    const midOk = [r2.midA, r2.midB].some((m) => m > r2.before.score && m < r2.after.score);
    check("score odometer counts up (mid-tween below total)", midOk,
      `mid ${r2.midA}/${r2.midB} between ${r2.before.score} and ${r2.after.score}`);
    check("+N 分 ink floats from the building",
      !!L2.floatAt && /^\+\d+ 分$/.test(L2.floatText || ""), `float "${L2.floatText}"`);
    check("points burst in display type (>=26px)", (L2.floatSize || 0) >= 26,
      `fontSize ${L2.floatSize}`);
    check("score odometer settles on the exact total",
      parseInt(String(set2.scoreText).replace(/[^\d]/g, ""), 10) === r2.after.score,
      `text "${set2.scoreText}" vs ${r2.after.score}`);
    check("score bumps as the numeral arrives", !!L2.bumpAt, "zb-scorebump never latched");
    ptsCheck(2, r2, false);
    check("streak multiplier chip beside stars", /^×1\.\d$/.test(set2.mult), `chip "${set2.mult}"`);
    check("new star stamps in", set2.starNew, "no svg.zb-starnew in #stars");
    check("factor struck through on the board (solo, no name)",
      set2.struck && !set2.struckBy, JSON.stringify({ struck: set2.struck, by: set2.struckBy }));

    /* ══ building #3 — hard variant ══ */
    await untilSeq(page, 3);
    const info3 = await levelInfo(page);
    diag(diagLine(info3));
    await untilStaged(page);
    records.push(await camRecord(page));
    const r3 = await submit(page, info3.pillarRoots[0], 1.05);
    ptsCheck(3, r3, false);
    const vt = await page.evaluate(() => {
      const g = document.querySelector("#deck > g");
      return g ? g.getAttribute("transform") || "" : "";
    });
    check("variant transform on round 2+", /translate\(200 150\) scale\(/.test(vt), `transform "${vt}"`);

    /* ══ building #4 — the wrong answer ══ */
    await untilSeq(page, 4);
    const info4 = await levelInfo(page);
    diag(diagLine(info4));
    await untilStaged(page);
    records.push(await camRecord(page));
    await installLatch(page);
    const wrong = await page.evaluate(() => {
      const G = window.G;
      const roots = G.level.pillars.map((p) => p.root);
      let v = 1;
      while (roots.includes(v)) v += 1;
      const expected = window.ZBLevels.workingWrong(G.level, v)[0];
      const strength = window.ZBLevels.strength(G.level, v);
      const key = document.querySelector(`#pad .zb-key[data-d="${v}"]`);
      const t0 = performance.now();
      key.click(); key.click();
      return {
        v, expected, strength, t0,
        mark: document.getElementById("markZone").textContent,
        locked: document.getElementById("padLock").classList.contains("show"),
        ringAnim: (document.querySelector("#padLock .zb-lock__ring circle") || { style: {} }).style.animation || "",
        streak: G.streak,
        keysDisabled: [...document.querySelectorAll("#pad .zb-key")].every((k) => k.disabled),
      };
    });
    check("wrong answer shows working", wrong.mark.includes(wrong.expected),
      `mark "${wrong.mark}" missing "${wrong.expected}"`);
    check("wrong answer shows strength", wrong.mark.includes("強度 " + wrong.strength),
      `mark "${wrong.mark}" strength ${wrong.strength}`);
    await sleep(180);
    const L4 = await readLatch(page);
    const lockedMid = await page.evaluate(() => document.getElementById("padLock").classList.contains("show"));
    check("wrong: structure shrugs the hit off", !!L4.shrugAt, "zb-shrug never latched");
    check("wrong: strength tag pencilled on the scene",
      (L4.strengthText || "").includes("強度"), `tag "${L4.strengthText}"`);
    check("keypad locked", wrong.locked && wrong.keysDisabled && lockedMid,
      JSON.stringify({ locked: wrong.locked, disabled: wrong.keysDisabled, still: lockedMid }));
    check("lock countdown ring sweeps", wrong.ringAnim.includes("zb-locksweep"),
      `animation "${wrong.ringAnim}"`);
    check("streak reset to 0", wrong.streak === 0, `streak ${wrong.streak}`);
    const unlockedAt = await page.evaluate(async () => {
      await new Promise((res) => {
        (function loop() {
          if (!document.getElementById("padLock").classList.contains("show")) return res();
          setTimeout(loop, 40);
        })();
      });
      return performance.now();
    });
    const lockMs = unlockedAt - wrong.t0;
    check("keypad unlocked after 3s", lockMs >= 2600 && lockMs <= 4300, `lock lasted ${Math.round(lockMs)}ms`);
    const r4a = await submit(page, info4.pillarRoots[0], 0.87);
    ptsCheck(4, r4a, false);
    const sag = await page.evaluate(() => {
      const d = document.getElementById("deck");
      return d.classList.contains("sag-l") || d.classList.contains("sag-r");
    });
    check("deck sags after partial claim", sag, "#deck has no sag class");
    const r4b = await submit(page, info4.pillarRoots[1], 0.83);
    ptsCheck(4, r4b, false);

    /* ══ buildings #5-#7 — streak ladder ══ */
    const ladder = { 5: [1.05, 0.98], 6: [1.05, 0.99], 7: [1.05, 0.99] };
    for (const seq of [5, 6, 7]) {
      await untilSeq(page, seq);
      const inf = await levelInfo(page);
      diag(diagLine(inf));
      await untilStaged(page);
      records.push(await camRecord(page));
      const ra = await submit(page, inf.pillarRoots[0], ladder[seq][0]);
      ptsCheck(seq, ra, false);
      const rb = await submit(page, inf.pillarRoots[1], ladder[seq][1]);
      ptsCheck(seq, rb, false);
      if (seq === 6) {
        // root-rank orientation in the real flow: the sign trap's inked
        // codes must read left-to-right like the graph's x-intercepts
        const marks = await page.evaluate(() =>
          [...document.querySelectorAll(".zb-rootmark.show")].map((m) => ({
            x: parseFloat(m.getAttribute("x")),
            root: parseFloat(m.textContent.replace("x = ", "").replace("−", "-")),
          })));
        check("resolve intercepts read left-to-right",
          marks.length === 2 &&
          (marks[0].x < marks[1].x) === (marks[0].root < marks[1].root),
          JSON.stringify(marks));
      }
    }

    /* ══ building #8 — the double root ══ */
    await untilSeq(page, 8);
    const info8 = await levelInfo(page);
    diag(diagLine(info8));
    await untilStaged(page);
    records.push(await camRecord(page));
    const r8 = await submit(page, info8.pillarRoots[0], 1.05);
    ptsCheck(8, r8, false);
    const dbl = await page.evaluate(() => ({
      blown: document.querySelectorAll(".zb-pillar.blown").length,
      pillars: document.querySelectorAll(".zb-pillar").length,
      claimed: window.G.claimed.length,
      mark: document.getElementById("markZone").textContent,
    }));
    check("double root: one code blows BOTH pillars",
      dbl.pillars === 2 && dbl.blown === 2 && dbl.claimed === 2, JSON.stringify(dbl));
    check("double root both-down note", dbl.mark.includes("兩支支柱一齊倒"), `mark "${dbl.mark}"`);
    check("double root shows 0 × 0 working", dbl.mark.includes("0 × 0"), `mark "${dbl.mark}"`);
    await page.waitForFunction(() => !!document.getElementById("graph"), null, { timeout: 5000 });
    const g8 = await graphSample(page);
    check("tangent touch point sits on the axis",
      !!g8 && g8.circ && g8.circ.cy === "171" && g8.axes.some((d) => (d || "").includes("171")),
      g8 ? JSON.stringify(g8.circ) : "no #graph");
    check("curve touches the line once, never crosses",
      !!g8 && g8.below === 0 && g8.minDist < 0.9,
      g8 ? `below ${g8.below} minDist ${g8.minDist.toFixed(2)}` : "no #graph");
    check("重根 tag beside the touch point",
      !!g8 && g8.texts.includes("重根"), g8 ? JSON.stringify(g8.texts) : "no #graph");

    /* ══ building #9 ══ */
    await untilSeq(page, 9);
    const info9 = await levelInfo(page);
    diag(diagLine(info9));
    await untilStaged(page);
    records.push(await camRecord(page));
    const r9 = await submit(page, info9.pillarRoots[0], 1.05);
    ptsCheck(9, r9, false);

    /* ══ buildings #10-#12 — the kind-6 street (no longer the finale:
     * the gate took the crown, §19 Batch AA) ══ */
    await untilSeq(page, 10);
    const notFin = await page.evaluate(() =>
      document.getElementById("levelCardBlock").classList.contains("finale"));
    check("kind-6 street no longer wears the finale card", !notFin, "finale class on #10");
    const info10 = await levelInfo(page);
    diag(diagLine(info10));
    await untilStaged(page);
    records.push(await camRecord(page));
    const r10a = await submit(page, info10.pillarRoots[0], 1.05);
    ptsCheck(10, r10a, false);
    const plq = await page.evaluate(() => {
      const G = window.G;
      const id = G.claimed[G.claimed.length - 1];
      const p = G.level.pillars.find((pp) => pp.id === id);
      const el = document.querySelector(`[data-plaque="${id}"]`);
      return {
        text: el ? el.textContent : "",
        hidden: p.hidden,
        ghost: el ? el.classList.contains("zb-hintghost") : true,
        qmark: !!document.querySelector(`[data-qmark="${id}"]`),
        mark: document.getElementById("markZone").textContent,
        fact: window.ZBLevels.factorisation(G.level),
      };
    });
    check("expanded: factor revealed on plaque",
      plq.text === plq.hidden && !plq.ghost && !plq.qmark, JSON.stringify(plq));
    check("expanded: shows factorisation", plq.mark.includes(plq.fact),
      `mark "${plq.mark}" missing "${plq.fact}"`);
    // force the half-fuse nudge while the mark zone still holds the
    // correct working: the nudge must latch but never overwrite it
    const nudge10 = await page.evaluate(async () => {
      const G = window.G;
      const before = document.getElementById("markZone").textContent;
      G.deadline = performance.now() + 0.4 * G.duration;
      const t0 = performance.now();
      await new Promise((res) => {
        (function loop() {
          if (G.nudged || performance.now() - t0 > 1800) return res();
          requestAnimationFrame(loop);
        })();
      });
      return { nudged: G.nudged, before, after: document.getElementById("markZone").textContent };
    });
    check("nudge yields to working already on the sheet",
      nudge10.nudged && nudge10.after === nudge10.before && !nudge10.after.includes("諗下"),
      JSON.stringify({ nudged: nudge10.nudged, mark: (nudge10.after || "").slice(0, 60) }));
    const r10b = await submit(page, info10.pillarRoots[1], 0.99);
    ptsCheck(10, r10b, false);

    for (const seq of [11, 12]) {
      await untilSeq(page, seq);
      const inf = await levelInfo(page);
      diag(diagLine(inf));
      await untilStaged(page);
      records.push(await camRecord(page));
      const ra = await submit(page, inf.pillarRoots[0], 1.05);
      ptsCheck(seq, ra, false);
      const rb = await submit(page, inf.pillarRoots[1], 0.99);
      ptsCheck(seq, rb, false);
    }

    /* ══ building #13 — the general-form gate, the true finale ══ */
    await untilSeq(page, 13);
    const fin = await page.evaluate(() => ({
      finaleClass: document.getElementById("levelCardBlock").classList.contains("finale"),
      chopShown: document.getElementById("levelCardChop").style.display !== "none",
      chopText: document.getElementById("levelCardChop").textContent.trim(),
      finShown: document.getElementById("levelCardFin").style.display !== "none",
    }));
    check("finale card (double border + 加倍 chop) moved to the gate",
      fin.finaleClass && fin.chopShown && fin.chopText === "加倍" && fin.finShown,
      JSON.stringify(fin));
    const info13 = await levelInfo(page);
    diag(diagLine(info13));
    check("the gate is scripted: x² + 5x + 6 = 2, roots −1 and −4",
      info13.n === 7 && info13.expr === "x² + 5x + 6 = 2" &&
      info13.roots.join(",") === "-4,-1",
      JSON.stringify({ expr: info13.expr, roots: info13.roots }));
    await untilStaged(page);
    records.push(await camRecord(page));
    const gateBoard = await page.evaluate(() =>
      document.getElementById("exprBoard").innerHTML);
    check("the gate's board carries no red 0 (the tell)",
      gateBoard.includes("= 2") && !gateBoard.includes("zb-zero"), gateBoard.slice(0, 120));
    // the trap in person: −2 zeroes the DISPLAYED left side, but the
    // right side is 2 - the bespoke nudge toward general form
    const trap = await submit(page, -2, 0.9);
    check("gate trap: −2 scores nothing", trap.after.score === trap.before.score,
      JSON.stringify(trap.after));
    const trapMark = await page.evaluate(() => document.getElementById("markZone").textContent);
    check("gate trap: the nudge names the move to general form",
      trapMark.includes("≠ 2") && trapMark.includes("唔係 0") && trapMark.includes("x² + 5x + 4 = 0"),
      trapMark);
    // the wrong answer locked the pad for 3s: wait it out
    await page.waitForFunction(
      () => ![...document.querySelectorAll("#pad .zb-key")].every((k) => k.disabled),
      null, { timeout: 6000 });
    const r13a = await submit(page, -1, 0.85);
    ptsCheck(13, r13a, true);
    const gatePlq = await page.evaluate(() => ({
      mark: document.getElementById("markZone").textContent,
      fact: window.ZBLevels.factorisation(window.G.level),
    }));
    check("gate: the working shows the whole move-over chain",
      gatePlq.fact === "x² + 5x + 4 = (x+1)(x+4)" && gatePlq.mark.includes("x² + 5x + 4 = 0"),
      JSON.stringify(gatePlq));
    const r13b = await submit(page, -4, 0.8);
    ptsCheck(13, r13b, true);

    /* ══ the camera + dressing over the whole run ══ */
    check("dressing varies across the 13 buildings",
      new Set(records.map((r) => r.dress)).size >= 2, records.map((r) => r.dress).join(","));
    check("every building carries a dressing pick",
      records.length === 13 && records.every((r) => ["0", "1", "2"].includes(r.dress)),
      records.map((r) => r.dress).join(","));
    check("hint chip only on the factorise buildings",
      records.every((r) => r.hintChip === (r.n === 6)),
      records.map((r) => `${r.n}:${r.hintChip ? "on" : "off"}`).join(","));
    const restOk = records.every((r) => r.rest &&
      Math.abs(r.vb.x - r.rest.x) < 0.75 && Math.abs(r.vb.y - r.rest.y) < 0.75 &&
      Math.abs(r.vb.w - r.rest.w) < 0.75 && Math.abs(r.vb.h - r.rest.h) < 0.75);
    check("camera at rest before every round opens", restOk,
      JSON.stringify(records.map((r) => ({ seq: r.seq, vb: r.vb, rest: r.rest }))).slice(0, 400));
    const fills = records.map((r) => Math.max(r.bb.w / r.rest.w, (210 - r.bb.y) / r.rest.h));
    check("every building fills >=55% of its frame",
      fills.every((f) => f >= 0.55), fills.map((f) => f.toFixed(2)).join(","));
    const tighter = records.filter((r) => r.rest.w < 399.5 && r.rest.h < 239.5).length;
    check("the camera frames tighter than the full sheet",
      tighter >= 8 && records.every((r) => Math.abs(r.rest.w - 400) > 0.5 || Math.abs(r.rest.h - 240) > 0.5),
      `tighter ${tighter}/13 frames ${records.map((r) => `${r.rest.w.toFixed(0)}x${r.rest.h.toFixed(0)}`).join(" ")}`);

    /* ══ the demolition report ══ */
    await page.waitForFunction(
      () => document.getElementById("endScreen").classList.contains("active"), null, { timeout: 20000 });
    diag(`  expert full run: ${((Date.now() - runStart) / 60000).toFixed(1)} min (incl. ~4s of deliberate-wrong waits)`);
    await sleep(1150);
    const end = await page.evaluate(() => ({
      endScore: parseInt(String(document.getElementById("endScore").textContent).replace(/[^\d]/g, ""), 10),
      score: window.G.score,
      stars: window.G.starsTotal,
      under: document.querySelectorAll(".zb-endunder path").length,
      chopText: (document.querySelector(".zb-endchop") || {}).textContent || "",
      chopDate: document.getElementById("endChopDate").textContent,
      rows: [...document.querySelectorAll("#endRecord .zb-record__row")].map((r, i) => ({
        ri: r.style.getPropertyValue("--ri").trim(),
        draw: !!r.querySelector(".zb-record__mark path.draw"),
        ok: !!r.querySelector(".zb-record__mark path.ok"),
        no: !!r.querySelector(".zb-record__mark path.no"),
      })),
      recs: window.G.records.map((r) => ({ cleared: r.cleared, pts: r.pts })),
      inspector: !!document.querySelector(".zb-endinspector"),
      clipboard: !!document.querySelector(".zb-endinspector rect"),
    }));
    check("report count-up settles on the exact score", end.endScore === end.score,
      `display ${end.endScore} vs G.score ${end.score}`);
    check("hand-drawn double underline under the total", end.under === 2, `paths ${end.under}`);
    check("檢定完成 chop signs the report with the date",
      end.chopText.includes("檢定完成") && /^\d{4}-\d{2}-\d{2}$/.test(end.chopDate),
      JSON.stringify({ chop: end.chopText, date: end.chopDate }));
    check("report rows staggered + checks draw themselves",
      end.rows.length === 13 && end.rows.every((r, i) => r.ri === String(i) && r.draw),
      JSON.stringify(end.rows.slice(0, 3)));
    check("inspector beside the chop, clipboard in hand",
      end.inspector && end.clipboard, JSON.stringify({ insp: end.inspector, clip: end.clipboard }));
    check("end score > 0", end.score > 0, `score ${end.score}`);
    check("record rows = 13", end.recs.length === 13 && end.rows.length === 13,
      `records ${end.recs.length} rows ${end.rows.length}`);
    check("all buildings cleared ticks",
      end.recs.every((r) => r.cleared) && end.rows.every((r) => r.ok && !r.no),
      JSON.stringify(end.recs));
    diag(`  stars total: ${Y(end.stars)} score: ${Y(end.score)}`);

    /* ══ restart run: determinism, double-submit, the tension ramp ══ */
    await page.click("#btnRestart");
    await page.waitForFunction(
      () => document.getElementById("gameScreen").classList.contains("active") &&
        window.G.level && window.G.level.seq === 1 && window.G.records.length === 0,
      null, { timeout: 15000 });
    const dress2 = await page.evaluate(() => document.getElementById("deck").dataset.dress);
    check("dressing pick is deterministic across restarts", dress2 === records[0].dress,
      `restart dress ${dress2} vs ${records[0].dress}`);

    for (let seq = 1; seq <= 3; seq++) {
      await untilSeq(page, seq);
      await untilStaged(page);
      const inf = await levelInfo(page);
      for (const root of [...new Set(inf.pillarRoots)]) await submit(page, root, 0.9);
    }
    await untilSeq(page, 4);
    await untilStaged(page);
    const inf4b = await levelInfo(page);
    await submit(page, inf4b.pillarRoots[0], 0.9);
    const dbl2 = await page.evaluate((val) => {
      const G = window.G;
      const before = { score: G.score, streak: G.streak };
      const pad = document.getElementById("pad");
      const key = pad.querySelector(`.zb-key[data-d="${Math.abs(val)}"]`);
      if (val < 0) pad.querySelector(".zb-key--sign").click();
      key.click(); key.click();
      return {
        before,
        after: { score: G.score, streak: G.streak },
        mark: document.getElementById("markZone").textContent,
        locked: document.getElementById("padLock").classList.contains("show"),
        keysDisabled: [...document.querySelectorAll("#pad .zb-key")].every((k) => k.disabled),
      };
    }, inf4b.pillarRoots[0]);
    check("double-submit adds no points", dbl2.after.score === dbl2.before.score,
      `score ${dbl2.before.score} -> ${dbl2.after.score}`);
    check("double-submit shows already-used note", dbl2.mark.includes("已經用過"), `mark "${dbl2.mark}"`);
    check("double-submit does not lock pad", !dbl2.locked && !dbl2.keysDisabled,
      JSON.stringify({ locked: dbl2.locked, disabled: dbl2.keysDisabled }));
    check("streak survives double-submit",
      dbl2.after.streak === dbl2.before.streak && dbl2.after.streak > 0,
      `streak ${dbl2.before.streak} -> ${dbl2.after.streak}`);

    const last = await page.evaluate(async () => {
      const scene = document.getElementById("scene");
      const dim = document.querySelector(".zb-skydim");
      window.G.deadline = performance.now() + 2900;
      const t0 = performance.now();
      await new Promise((res) => {
        (function loop() {
          if (scene.classList.contains("lastcall") || performance.now() - t0 > 1500) return res();
          requestAnimationFrame(loop);
        })();
      });
      const lastcall = scene.classList.contains("lastcall");
      let dimOp = 0;
      const t1 = performance.now();
      await new Promise((res) => {
        (function loop() {
          dimOp = parseFloat(getComputedStyle(dim).opacity);
          if (dimOp > 0.15 || performance.now() - t1 > 1200) return res();
          requestAnimationFrame(loop);
        })();
      });
      const sparkR = document.getElementById("fuseSpark").getAttribute("r");
      const glowR = document.getElementById("fuseGlow").getAttribute("r");
      window.G.deadline = performance.now() + 30000;
      const t2 = performance.now();
      await new Promise((res) => {
        (function loop() {
          if (!scene.classList.contains("lastcall") || performance.now() - t2 > 1500) return res();
          requestAnimationFrame(loop);
        })();
      });
      const relieved = !scene.classList.contains("lastcall");
      const sparkR2 = document.getElementById("fuseSpark").getAttribute("r");
      let dimOp2 = 1;
      const t3 = performance.now();
      await new Promise((res) => {
        (function loop() {
          dimOp2 = parseFloat(getComputedStyle(dim).opacity);
          if (dimOp2 < 0.5 || performance.now() - t3 > 1500) return res();
          requestAnimationFrame(loop);
        })();
      });
      return { lastcall, dimOp, sparkR, glowR, relieved, sparkR2, dimOp2 };
    });
    check("last 3s: sky band darkens (lastcall state)",
      last.lastcall && last.dimOp > 0.15, JSON.stringify({ lastcall: last.lastcall, dimOp: last.dimOp }));
    check("last 3s: the fuse spark grows",
      last.sparkR === "4.6" && last.glowR === "9.5",
      JSON.stringify({ spark: last.sparkR, glow: last.glowR }));
    check("deadline relief clears the tension ramp",
      last.relieved && last.sparkR2 === "3.2" && last.dimOp2 < 0.5,
      JSON.stringify({ relieved: last.relieved, spark: last.sparkR2, dim: last.dimOp2 }));

    check("no page errors", errsMain.length === 0, errsMain.join(" | "));
    await page.close();

    /* ══ config pages ══ */
    const errsCfg = [];

    const pA = await gamePage(ctx, "levels=2,3&rounds=1&seed=3", errsCfg);
    await pA.click("#btnSolo");
    await pA.waitForFunction(() => !!(window.G && window.G.levels), null, { timeout: 10000 });
    const cfgA = await pA.evaluate(() => window.G.levels.map((l) => l.n));
    check("?levels+rounds: 2 buildings, kinds 2,3",
      cfgA.length === 2 && cfgA[0] === 2 && cfgA[1] === 3, JSON.stringify(cfgA));
    await pA.close();

    const pB = await gamePage(ctx, "fuse=0.5&seed=3", errsCfg);
    await pB.click("#btnSolo");
    await pB.waitForFunction(() => !!(window.G && window.G.levels), null, { timeout: 10000 });
    const cfgB = await pB.evaluate(() => {
      const def = { 1: 20000, 2: 20000, 3: 35000, 4: 35000, 5: 35000, 6: 45000, 7: 60000 };
      return {
        ok: window.G.levels.every((l) => l.fuseMs === Math.round(def[l.stageKind] * 0.5)),
        fuses: window.G.levels.map((l) => l.fuseMs),
      };
    });
    check("?fuse=0.5 halves fuses", cfgB.ok, JSON.stringify(cfgB.fuses));
    await pB.close();

    const pC = await gamePage(ctx, "diff=hard&seed=3", errsCfg);
    await pC.click("#btnSolo");
    await pC.waitForFunction(() => !!(window.G && window.G.levels), null, { timeout: 10000 });
    const cfgC = await pC.evaluate(() => ({
      len: window.G.levels.length,
      mixTail: window.G.levels.slice(-4, -1).every((l) => l.stageKind === "mix"),
      // MIX_KINDS = [3,4,6]: kind 5's one-tap double hit sits the mixed street out
      mixKinds: window.G.levels.slice(-4, -1).every((l) => [3, 4, 6].includes(l.n) && l.hard),
      gateLast: window.G.levels[window.G.levels.length - 1].n === 7 &&
        window.G.levels[window.G.levels.length - 1].finale,
    }));
    check("diff=hard: 16 buildings, mixed street BEFORE the gate finale",
      cfgC.len === 16 && cfgC.mixTail && cfgC.mixKinds && cfgC.gateLast, JSON.stringify(cfgC));
    await pC.close();

    const pD = await gamePage(ctx, "diff=easy&seed=3", errsCfg);
    await pD.click("#btnSolo");
    await pD.waitForFunction(() => !!(window.G && window.G.levels), null, { timeout: 10000 });
    const cfgD = await pD.evaluate(() => {
      const def = { 1: 20000, 2: 20000, 3: 35000, 4: 35000, 5: 35000, 6: 45000, 7: 60000 };
      return {
        len: window.G.levels.length,
        oneRound: window.G.levels.every((l) => l.round === 1),
        longer: window.G.levels.every((l) => l.fuseMs === Math.round(def[l.stageKind] * 1.25)),
      };
    });
    check("diff=easy: 7 buildings, longer fuses",
      cfgD.len === 7 && cfgD.oneRound && cfgD.longer, JSON.stringify(cfgD));
    await pD.close();

    /* graph-orientation probe + commit window (one page) */
    const pE = await gamePage(ctx, "seed=3", errsCfg);
    // root-rank probe: renderStructure is a top-level classic-script
    // function (reachable as a bare identifier); the gameScreen is made
    // renderable for getBBox, probed atomically, then restored — no run
    // has started yet, so nothing live is disturbed.
    const probe = await pE.evaluate(() => {
      const L = window.ZBLevels;
      const gs = document.getElementById("gameScreen");
      gs.classList.add("active");
      const meta = (lv, i) => Object.assign(lv, {
        seq: i, total: 12, stage: 1, stageKind: lv.n, round: 1,
        roundsInStage: 1, fuseMs: 1000, finale: false,
      });
      const bad = [];
      let cases = 0;
      try {
        for (let seed = 1; seed <= 12; seed++) {
          const rand = L.rng(seed * 101 + 7);
          for (const n of [3, 4, 6]) {
            for (const hard of [false, true]) {
              const lv = meta(L.gen(n, rand, hard, true), seed);
              renderStructure(lv);
              const x = {};
              document.querySelectorAll(".zb-rootmark").forEach((m) => {
                x[m.dataset.for] = parseFloat(m.getAttribute("x"));
              });
              cases += 1;
              const [p1, p2] = lv.pillars;
              if ((p1.root < p2.root) !== (x.p1 < x.p2))
                bad.push({ seed, n, hard, roots: [p1.root, p2.root], x });
            }
          }
        }
        // kind 5 keeps its twin stance
        const lv5 = meta(L.gen(5, L.rng(9), false, true), 1);
        renderStructure(lv5);
        const x5 = [...document.querySelectorAll(".zb-rootmark")]
          .map((m) => parseFloat(m.getAttribute("x"))).sort((a, b) => a - b);
        return { cases, bad, x5 };
      } finally {
        gs.classList.remove("active");
      }
    });
    check("smaller root stands left (kinds 3/4/6, easy+hard)",
      probe.cases === 72 && probe.bad.length === 0 && probe.x5.join(",") === "170,230",
      `cases ${probe.cases} bad ${JSON.stringify(probe.bad.slice(0, 3))} x5 ${probe.x5.join(",")}`);

    await pE.click("#btnSolo");
    await untilStaged(pE);
    const cw = await pE.evaluate(async () => {
      const G = window.G;
      const key5 = document.querySelector('#pad .zb-key[data-d="5"]');
      const sign = document.querySelector("#pad .zb-key--sign");
      const preview = document.getElementById("padPreview");
      key5.click();
      // 500ms in: beyond the old 400ms window, still inside the 750ms one
      await new Promise((r) => setTimeout(r, 500));
      const drain = getComputedStyle(preview, "::after");
      const inside = {
        claimed: G.claimed.length,
        mark: document.getElementById("markZone").textContent,
        drainName: drain.animationName,
        drainDur: drain.animationDuration,
        previewText: preview.textContent.replace(/\u00a0/g, " "),
        armed: preview.classList.contains("armed"),
      };
      sign.click(); // flips the staged +5 to −5, restarts the window
      const t0 = performance.now();
      await new Promise((res) => {
        (function loop() {
          if (document.getElementById("markZone").textContent || performance.now() - t0 > 2800) return res();
          setTimeout(loop, 40);
        })();
      });
      return { inside, mark: document.getElementById("markZone").textContent };
    });
    check("commit window: nothing submitted inside 750ms",
      cw.inside.claimed === 0 && cw.inside.mark === "" && cw.inside.armed,
      JSON.stringify({ claimed: cw.inside.claimed, mark: cw.inside.mark }));
    check("commit window: staged value previewed",
      cw.inside.armed && /x\s*=\s*5/.test(cw.inside.previewText),
      JSON.stringify({ armed: cw.inside.armed, preview: cw.inside.previewText }));
    check("commit window: armed drain runs 750ms",
      cw.inside.drainName === "zb-armdrain" && cw.inside.drainDur === "0.75s",
      JSON.stringify({ name: cw.inside.drainName, dur: cw.inside.drainDur }));
    check("commit window: sign flip commits the negative",
      cw.mark.includes("(−5)"), `mark "${cw.mark}"`);
    await pE.close();

    /* the opt-in solo hint (kind 6 street of one): chip + nudge contract */
    const pF = await gamePage(ctx, "levels=6&rounds=1&seed=5", errsCfg);
    await pF.click("#btnSolo");
    await untilStaged(pF);
    // half fuse: the strategy NUDGE appears (mark zone is empty) but the
    // hint itself stays the student's call — no auto-hint any more
    const hint = await pF.evaluate(async () => {
      const G = window.G;
      const chip = document.getElementById("soloHint");
      const chip0 = { visible: chip.style.display !== "none", disabled: chip.disabled };
      G.deadline = performance.now() + 0.499 * G.duration;
      const t0 = performance.now();
      await new Promise((res) => {
        (function loop() {
          if (G.nudged || performance.now() - t0 > 2000) return res();
          requestAnimationFrame(loop);
        })();
      });
      return {
        chip0,
        nudged: G.nudged,
        hintedAfterHalf: G.hinted,
        chipAfterHalf: { visible: chip.style.display !== "none", disabled: chip.disabled },
        mark: document.getElementById("markZone").textContent,
        prod: window.ZBLevels.num(G.level.c),
        sum: window.ZBLevels.num(-G.level.b),
      };
    });
    check("solo hint chip offered on kind-6 (opt-in, no auto-hint)",
      hint.chip0.visible && !hint.chip0.disabled &&
      hint.nudged && !hint.hintedAfterHalf &&
      hint.chipAfterHalf.visible && !hint.chipAfterHalf.disabled,
      JSON.stringify({ chip0: hint.chip0, after: hint.chipAfterHalf, hinted: hint.hintedAfterHalf }));
    check("half-fuse nudge: sum and product pencilled in the mark zone",
      hint.mark.includes("乘埋係 " + hint.prod) && hint.mark.includes("加埋係 " + hint.sum),
      `mark "${hint.mark}" prod ${hint.prod} sum ${hint.sum}`);
    // the student opts in: tap the chip
    const tapped = await pF.evaluate(() => {
      const G = window.G;
      document.getElementById("soloHint").click();
      const ghost = document.querySelector(".zb-hintghost");
      return {
        hinted: G.hinted,
        chipDisabled: document.getElementById("soloHint").disabled,
        ghost: ghost
          ? { text: ghost.textContent, isPlaque: ghost.hasAttribute("data-plaque") }
          : null,
        factors: G.level.pillars.map((p) => p.hidden),
        mark: document.getElementById("markZone").textContent,
        firstRoot: G.level.pillars[0].root,
        otherRoot: G.level.pillars[1].root,
      };
    });
    check("hint ghost pencils a factor onto the plaque",
      tapped.hinted && !!tapped.ghost && tapped.ghost.isPlaque &&
      tapped.factors.includes(tapped.ghost.text),
      JSON.stringify(tapped.ghost));
    check("hint note tells the class about the 75% fee",
      tapped.mark.includes("打七五折"), `mark "${tapped.mark}"`);
    check("hint note names the revealed factor (not just the fee)",
      !!tapped.ghost && tapped.mark.includes(tapped.ghost.text),
      `mark "${tapped.mark}" vs factor "${tapped.ghost && tapped.ghost.text}"`);
    // the ghost must actually be SEEN: it fades in NOW (delay 0 — the
    // .wait draw-in stagger once deferred it 2.4s) over a highlighter
    // wash, and settles legible
    await pF.waitForTimeout(1100);
    const seen = await pF.evaluate(() => {
      const ghost = document.querySelector(".zb-hintghost");
      const wash = document.querySelector(".zb-hintwash");
      const cs = getComputedStyle(ghost);
      return {
        opacity: parseFloat(cs.opacity),
        delay: cs.animationDelay,
        washOpacity: wash ? parseFloat(getComputedStyle(wash).opacity) : 0,
      };
    });
    check("hint ghost fades in immediately and settles visible",
      seen.opacity > 0.9 && seen.delay.split(",")[0].trim() === "0s",
      JSON.stringify(seen));
    check("highlighter wash marks the hinted plaque",
      seen.washOpacity > 0.2, `wash opacity ${seen.washOpacity}`);
    // levelFactor = finale x2 · hint x0.75 = x1.5: f pinned at 0.5 → 225
    const rh = await submit(pF, tapped.firstRoot, 0.502);
    const ph = rh.after.score - rh.before.score;
    check(`hinted building pays 75% (net ${ph} in [150,300])`, ph >= 150 && ph <= 300,
      `net ${ph} (finale x2 · hint x0.75)`);
    await submit(pF, tapped.otherRoot, 0.9); // resolve the building
    const chipEnd = await pF.evaluate(() => ({
      display: document.getElementById("soloHint").style.display,
      over: window.G.over,
    }));
    check("hint chip disabled after use, hidden on resolve",
      tapped.chipDisabled && chipEnd.over && chipEnd.display === "none",
      JSON.stringify({ disabled: tapped.chipDisabled, end: chipEnd }));
    await pF.close();

    /* pause: the fuse freezes under a veil and burns on from the same
     * tenth when resumed */
    const pP = await gamePage(ctx, "levels=3&rounds=1&seed=7", errsCfg);
    await pP.click("#btnSolo");
    await untilStaged(pP);
    await pP.waitForTimeout(400);
    const frozenAt = await pP.evaluate(() => {
      document.getElementById("btnPause").click();
      return document.getElementById("fuseTimerText").textContent;
    });
    await pP.waitForTimeout(1200);
    const paused = await pP.evaluate(() => ({
      timer: document.getElementById("fuseTimerText").textContent,
      veil: document.getElementById("pauseVeil").style.display !== "none",
      btn: document.getElementById("btnPause").textContent,
      pad: document.querySelector("#pad .zb-key").disabled,
    }));
    check("pause freezes the solo fuse under the veil",
      paused.timer === frozenAt && paused.veil && paused.pad,
      JSON.stringify({ frozenAt, paused }));
    check("pause button reads 繼續 while frozen", paused.btn === "繼續", paused.btn);
    await pP.evaluate(() => document.getElementById("btnPause").click());
    await pP.waitForTimeout(800);
    const resumed = await pP.evaluate(() => ({
      timer: document.getElementById("fuseTimerText").textContent,
      veil: document.getElementById("pauseVeil").style.display !== "none",
      pad: document.querySelector("#pad .zb-key").disabled,
      paused: window.G.paused,
    }));
    check("resume burns on from where it froze",
      !resumed.paused && !resumed.veil && !resumed.pad &&
        parseFloat(resumed.timer) < parseFloat(frozenAt) &&
        parseFloat(resumed.timer) > parseFloat(frozenAt) - 2,
      JSON.stringify({ frozenAt, resumed }));
    await pP.close();

    /* the fizzle: condemned survivor + the reveal hold */
    const pG = await gamePage(ctx, "seed=3", errsCfg);
    await pG.click("#btnSolo");
    await untilStaged(pG);
    const fail1 = await pG.evaluate(async () => {
      window.G.deadline = performance.now() - 1;
      const t0 = performance.now();
      await new Promise((res) => {
        (function loop() {
          if ((window.G.over && document.querySelector("#sceneStamp .zb-condemn")) ||
              performance.now() - t0 > 3000) return res();
          requestAnimationFrame(loop);
        })();
      });
      const condemn = document.querySelector("#sceneStamp .zb-condemn");
      const tape = [...document.querySelectorAll(".zb-tape path")];
      const probe = (v) => {
        const d = document.createElement("div");
        d.style.color = `var(${v})`;
        document.body.appendChild(d);
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      };
      return {
        t0: performance.now(),
        condemn: condemn ? condemn.textContent : "",
        chaiBoxed: !!document.querySelector("#sceneStamp .zb-chai"),
        tapeCount: tape.length,
        tapeStroke: tape.length ? getComputedStyle(tape[0]).stroke : "",
        red: probe("--mc-red"),
      };
    });
    check("fail: condemned chop, no boxed scene stamp",
      fail1.condemn.includes("未拆除") && !fail1.chaiBoxed,
      JSON.stringify({ condemn: fail1.condemn, chai: fail1.chaiBoxed }));
    check("fail: red tape-cross over the survivor",
      fail1.tapeCount === 2 && fail1.tapeStroke === fail1.red,
      JSON.stringify({ n: fail1.tapeCount, stroke: fail1.tapeStroke, red: fail1.red }));
    const holdMs = await pG.evaluate(async (t0) => {
      await new Promise((res) => {
        (function loop() {
          if (window.G.idx >= 1) return res();
          requestAnimationFrame(loop);
        })();
      });
      return performance.now() - t0;
    }, fail1.t0);
    check("solo reveal holds ~5.5s", holdMs >= 4900 && holdMs <= 6600, `${Math.round(holdMs)}ms`);
    await pG.close();

    check("no page errors (config pages)", errsCfg.length === 0, errsCfg.join(" | "));
  } finally {
    await browser.close();
  }
}

const watchdog = setTimeout(() => {
  console.error("SUITE TIMEOUT: exceeded 5.5 minutes");
  process.exit(1);
}, 330000);

main()
  .then(() => {
    clearTimeout(watchdog);
    const total = passCount + failures.length;
    if (total !== 162) {
      console.error(`\nASSERTION COUNT MISMATCH: ran ${total}, expected 162`);
      process.exit(1);
    }
    if (failures.length) {
      console.error(`\n${failures.length} FAILURE(S):`);
      failures.forEach((f) => console.error(`  ✗ ${f.name} — ${f.detail}`));
      process.exit(1);
    }
    console.log("\nALL PASS");
  })
  .catch((err) => {
    clearTimeout(watchdog);
    console.error("\nSUITE ERROR:", err && err.stack ? err.stack : err);
    process.exit(1);
  });
