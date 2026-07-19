#!/usr/bin/env node
/* zb-audit-test.js — 歸零爆破 Zero Blast AUDIT suite (74 assertions).
 *
 * Covers: EN/dark bilingual checks, 320px + landscape-phone layout,
 * reduced motion (incl. the armed-preview drain bar), the fx=lite/full
 * capability gate, sound / sampler / bgm / one-time offer behaviour,
 * the intro attract diorama, and the camera + letterbox contract
 * (6 level kinds x 3 tablet viewports).
 *
 * How to run (from the repo root, against a static server on
 * webapp/frontend/public — any plain file server will do):
 *
 *   cd /home/kenny/projects/tutoring-management-system
 *   NODE_PATH=webapp/frontend/node_modules \
 *   ZB_BASE=http://localhost:8000/games/zero-blast/ \
 *   node webapp/frontend/tests/games/zero-blast/zb-audit-test.js
 *
 * ZB_BASE defaults to http://localhost:8000/games/zero-blast/.
 * Exit code 0 + "ALL PASS" when every assertion is green.
 */
"use strict";

const { chromium } = require("playwright");

const BASE = process.env.ZB_BASE || "http://localhost:8000/games/zero-blast/";
const ORIGIN = new URL(BASE).origin;

let failures = 0;
let armDrainNormal = null; // captured in the EN dark run, checked with its reduced twin
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* bounded poll: evaluate fn(arg) in the page until truthy or timeout */
async function poll(page, fn, arg, timeoutMs, every) {
  timeoutMs = timeoutMs || 8000;
  every = every || 100;
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try {
      v = await page.evaluate(fn, arg);
    } catch (_) {}
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(every);
  }
}

/* keypad submit: double-tap the SAME digit inside one evaluate — the
 * second tap commits the staged value instantly (400ms arm window) */
async function tap(page, v) {
  await page.evaluate((val) => {
    const padEl = document.getElementById("pad");
    const d = Math.abs(val);
    if (val < 0) padEl.querySelector(".zb-key--sign").click();
    const key = padEl.querySelector('.zb-key[data-d="' + d + '"]');
    key.click();
    key.click();
  }, v);
}

async function startSolo(page) {
  await page.evaluate(() => document.getElementById("btnSolo").click());
  return poll(page, () => typeof G !== "undefined" && !!G.level, null, 6000);
}

const waitStaged = (page) =>
  poll(page, () => typeof G !== "undefined" && G.staged === true, null, 15000);

const waitPadFree = (page) =>
  poll(
    page,
    () => ![...document.querySelectorAll("#pad .zb-key")].some((k) => k.disabled),
    null,
    8000
  );

/* wait for the camera settle tween to land exactly on the rest frame */
/* single-tap arm: stage a value WITHOUT committing, and read the armed
 * preview's drain pseudo-element inside the same evaluate (the 750ms
 * commit window then fires the submit on its own) */
async function armAndReadDrain(page, v) {
  return page.evaluate((val) => {
    const padEl = document.getElementById("pad");
    const d = Math.abs(val);
    if (val < 0) padEl.querySelector(".zb-key--sign").click();
    padEl.querySelector('.zb-key[data-d="' + d + '"]').click();
    const preview = document.getElementById("padPreview");
    const cs = getComputedStyle(preview, "::after");
    return {
      armed: preview.classList.contains("armed"),
      content: cs.content,
      anim: cs.animationName,
      dur: cs.animationDuration,
    };
  }, v);
}

const waitCamSettled = (page) =>
  poll(
    page,
    () => {
      if (typeof G === "undefined" || !G.camRest) return false;
      const svg = document.getElementById("structSvg");
      if (!svg) return false;
      const vb = svg.getAttribute("viewBox").split(" ").map(Number);
      const r = [G.camRest.x, G.camRest.y, G.camRest.w, G.camRest.h];
      return vb.every((v, i) => Math.abs(v - r[i]) <= 0.05);
    },
    null,
    7000
  );

async function noHScroll(page) {
  return page.evaluate(() => {
    window.scrollTo(80, 0);
    const scrolled = window.scrollX;
    window.scrollTo(0, 0);
    const de = document.documentElement;
    const stage = document.querySelector(".mc-stage");
    const r = stage.getBoundingClientRect();
    return scrolled === 0 && r.left >= -1 && r.right <= de.clientWidth + 1;
  });
}

/* ══════════════ 1–8 · EN dark run ══════════════ */
async function sectionEnDark(browser) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 780 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String((e && e.message) || e)));
  await page.goto(BASE + "?lang=e&theme=dark&levels=3&rounds=1&seed=11&fuse=2");

  const introTxt = (await page.evaluate(() => document.body.innerText)) || "";
  check(
    "EN dark: no missing-string markers on intro",
    introTxt.length > 40 && !introTxt.includes("⟦"),
    "found ⟦ (or empty intro) in visible intro text"
  );

  await startSolo(page);
  const staged = await waitStaged(page);
  const roots = await page.evaluate(() =>
    typeof G !== "undefined" && G.level ? G.level.pillars.map((p) => p.root) : null
  );

  const before = await page.evaluate(() => {
    const rects = [...document.querySelectorAll("#lights rect")];
    return {
      n: rects.length,
      off: rects.filter((r) => r.classList.contains("off")).length,
      op: rects.length ? parseFloat(getComputedStyle(rects[0]).opacity) : 0,
    };
  });
  if (staged && roots) await tap(page, roots[0]);
  const lightsOut = await poll(
    page,
    () => document.querySelectorAll("#lights rect.off").length >= 1,
    null,
    2500
  );
  check(
    "dark: window lights blink out on the claim",
    !!staged && before.n > 0 && before.off === 0 && before.op > 0.2 && !!lightsOut,
    `staged=${!!staged} lights=${before.n} preOff=${before.off} litOpacity=${before.op} out=${!!lightsOut}`
  );

  const wash = await poll(
    page,
    () => {
      const polys = [...document.querySelectorAll("#structSvg .zb-wash")];
      if (!polys.length) return null;
      let best = null;
      for (const p of polys) {
        const cs = getComputedStyle(p);
        const o = parseFloat(cs.opacity);
        if (!best || o > best.opacity) best = { opacity: o, fill: cs.fill };
      }
      if (!best || best.opacity < 0.05) return null;
      const m = best.fill.match(/\d+(\.\d+)?/g) || [];
      best.lum =
        m.length >= 3 ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0;
      best.n = polys.length;
      return best;
    },
    null,
    5000
  );
  check(
    "dark: wash layer present as chalk tone",
    !!wash && wash.n >= 3 && wash.opacity >= 0.05 && wash.opacity <= 0.15 && wash.lum > 0.5,
    wash
      ? `n=${wash.n} opacity=${wash.opacity} lum=${wash.lum.toFixed(2)}`
      : "no visible .zb-wash polygon"
  );

  // wrong code: latch the transient strength tag BEFORE the trigger
  await page.evaluate(() => {
    window.__flashText = null;
    new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n.nodeType === 1 && n.classList && n.classList.contains("zb-strengthflash"))
            window.__flashText = n.textContent;
    }).observe(document.getElementById("scene"), { childList: true });
  });
  const wrongV = roots
    ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => !roots.includes(d) && !roots.includes(-d))
    : 0;
  // single tap: the value arms, the drain bar shows, and the 750ms
  // window commits the wrong code by itself
  if (staged) armDrainNormal = await armAndReadDrain(page, wrongV);
  const wrongNote = await poll(
    page,
    () => {
      const t = document.getElementById("markZone").innerText || "";
      return t.toLowerCase().includes("strength") ? t : null;
    },
    null,
    3000
  );
  check(
    "EN wrong note has strength wording",
    !!wrongNote && /Still standing: strength \d+/.test(wrongNote),
    `markZone: ${String(wrongNote).replace(/\n/g, " · ").slice(0, 90)}`
  );
  const flash = await poll(page, () => window.__flashText, null, 2500);
  check(
    "EN wrong: strength tag on the scene",
    !!flash && /^Strength \d+$/.test(String(flash).trim()),
    `flash: ${flash}`
  );

  const gameTxt = (await page.evaluate(() => document.body.innerText)) || "";

  // finish the building → demolition report
  await waitPadFree(page); // 3s wrong-code relock
  if (roots) await tap(page, roots[1]);
  const onEnd = await poll(
    page,
    () => document.getElementById("endScreen").classList.contains("active"),
    null,
    10000
  );
  const endTxt = onEnd ? (await page.evaluate(() => document.body.innerText)) || "" : "";
  check(
    "EN dark: no missing-string markers on end",
    !!onEnd && endTxt.length > 40 && !endTxt.includes("⟦"),
    onEnd ? "found ⟦ on end screen" : "end screen not reached"
  );
  const allTxt = introTxt + "\n" + gameTxt + "\n" + endTxt;
  check("EN dark: no em dash in visible text", !!onEnd && !allTxt.includes("—"),
    "em dash (U+2014) found in visible EN text");
  check("EN dark: no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

/* ══════════════ 9–11 · 320px portrait ══════════════ */
async function section320(browser) {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "?levels=1&rounds=1&seed=7&fx=lite&theme=light");
  check("320px: no horizontal scroll on intro", await noHScroll(page), "intro overflows 320px");

  await startSolo(page);
  await sleep(250);
  const inGameOk = await noHScroll(page);
  const gridOk = await page.evaluate(() => {
    const g = document.querySelector("#gameScreen .zb-game-grid");
    const r = g.getBoundingClientRect();
    return r.left >= -1 && r.right <= document.documentElement.clientWidth + 1;
  });
  check("320px: no horizontal scroll in game", inGameOk && gridOk, `scroll=${inGameOk} grid=${gridOk}`);

  const padInfo = await page.evaluate(() => {
    const keys = [...document.querySelectorAll("#pad .zb-key")];
    const pad = document.getElementById("pad").getBoundingClientRect();
    const digitHs = keys
      .filter((k) => !k.classList.contains("zb-key--sign"))
      .map((k) => k.getBoundingClientRect().height);
    const sign = document.querySelector("#pad .zb-key--sign").getBoundingClientRect().height;
    return {
      keys: keys.length,
      visible: keys.every((k) => k.offsetParent !== null),
      minH: Math.min(...digitHs),
      maxH: Math.max(...digitHs),
      signH: sign, // spans grid rows 1-3: ~3 key rows tall by design
      padW: pad.width,
      padH: pad.height,
    };
  });
  check(
    "320px: keypad visible height sane",
    padInfo.keys === 11 &&
      padInfo.visible &&
      padInfo.minH >= 44 &&
      padInfo.maxH <= 90 &&
      padInfo.signH >= padInfo.minH * 2.5 &&
      padInfo.signH <= padInfo.maxH * 3.5 &&
      padInfo.padW <= 320 &&
      padInfo.padH >= 140 &&
      padInfo.padH <= 400,
    JSON.stringify(padInfo)
  );
  await ctx.close();
}

/* ══════════════ 11a–11c · rem root + grace contrast ══════════════ */
async function sectionA11yText(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "?levels=1&rounds=1&seed=7&fx=lite&theme=light");
  await startSolo(page);
  await sleep(250);
  const read = () =>
    page.evaluate(() => ({
      key: parseFloat(getComputedStyle(document.querySelector("#pad .zb-key")).fontSize),
      body: parseFloat(getComputedStyle(document.body).fontSize),
      plabel: parseFloat(getComputedStyle(document.querySelector(".zb-struct text")).fontSize),
    }));
  const base = await read();
  // a browser font-size preference scales the root; reading text must
  // follow it, scene-internal SVG text must not (it rides the viewBox)
  await page.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
  const big = await read();
  check(
    "rem root: reading text follows the browser font preference",
    big.key / base.key > 1.2 && big.body / base.body > 1.2,
    JSON.stringify({ base, big })
  );
  check(
    "rem root: scene SVG text stays viewBox-scaled",
    big.plabel === base.plabel,
    `${base.plabel} -> ${big.plabel}`
  );
  const grace = await page.evaluate(() => {
    const d = document.createElement("div");
    d.className = "zb-gracenum";
    document.getElementById("scene").appendChild(d);
    const got = getComputedStyle(d).color;
    const probe = document.createElement("div");
    probe.style.color = "var(--mc-red)";
    document.body.appendChild(probe);
    const want = getComputedStyle(probe).color;
    d.remove();
    probe.remove();
    return { got, want };
  });
  check(
    "grace numerals press in full red (>=3:1 large-text contrast)",
    grace.got === grace.want,
    JSON.stringify(grace)
  );
  await ctx.close();
}

/* ══════════════ 12–13 · landscape phone ══════════════ */
async function sectionLandscape(browser) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "?levels=1&rounds=1&seed=7&fx=lite&theme=light");
  await startSolo(page);
  await sleep(250);

  const grid = await page.evaluate(() => {
    const g = document.querySelector("#gameScreen .zb-game-grid");
    const cs = getComputedStyle(g);
    const l = document.querySelector("#gameScreen .zb-col-l").getBoundingClientRect();
    const r = document.querySelector("#gameScreen .zb-col-r").getBoundingClientRect();
    return {
      display: cs.display,
      cols: cs.gridTemplateColumns.split(" ").length,
      sideBySide: r.left >= l.right - 2 && Math.abs(l.top - r.top) < 60,
    };
  });
  check(
    "landscape: two-column grid active",
    grid.display === "grid" && grid.cols === 2 && grid.sideBySide,
    JSON.stringify(grid)
  );
  check("landscape: no horizontal scroll", await noHScroll(page), "game overflows 844px");
  await ctx.close();
}

/* ══════════════ 14–23 · reduced motion, in game ══════════════ */
async function sectionReducedGame(browser) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 740 } });
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BASE + "?levels=3&rounds=1&seed=11&fuse=2&theme=light");
  await startSolo(page);
  await waitStaged(page);

  const strokes = await page.evaluate(() => {
    const ds = [...document.querySelectorAll("#structSvg .din")];
    return {
      n: ds.length,
      drawn: ds.every((d) => getComputedStyle(d).strokeDashoffset === "0px"),
    };
  });
  check(
    "reduced motion: structure strokes visible",
    strokes.n > 8 && strokes.drawn,
    JSON.stringify(strokes)
  );

  const crew = await page.evaluate(() => {
    const c = document.getElementById("crew");
    const f = document.getElementById("foreman");
    if (!c || !f) return null;
    const cs = getComputedStyle(c);
    const fs = getComputedStyle(f);
    return { co: cs.opacity, fo: fs.opacity, ca: cs.animationName, fa: fs.animationName };
  });
  check(
    "reduced motion: crew and foreman visible, static",
    !!crew && crew.co === "1" && crew.fo === "1" && crew.ca === "none" && crew.fa === "none",
    JSON.stringify(crew)
  );

  const readCam = () => {
    const vb = document.getElementById("structSvg").getAttribute("viewBox").split(" ").map(Number);
    const r = G.camRest;
    return { vb: vb, rest: [r.x, r.y, r.w, r.h] };
  };
  const camNow = await page.evaluate(readCam);
  const near = (arr) => arr.vb.every((v, i) => Math.abs(v - arr.rest[i]) <= 0.05);

  // force the warn window in a beat: pull the deadline in to 5s out
  await page.evaluate(() => {
    G.deadline = performance.now() + 5000;
  });
  const scattered = await poll(
    page,
    () => {
      const c = document.getElementById("crew");
      return (
        !!c &&
        c.classList.contains("zb-crew--run") &&
        [...c.querySelectorAll(".zb-figure")].every((f) => getComputedStyle(f).opacity === "0")
      );
    },
    null,
    2500
  );
  check("reduced motion: warn window scatters the crew instantly", !!scattered,
    "crew not scattered to instant exit");
  check("reduced motion: camera framing applied instantly", !!camNow && near(camNow),
    JSON.stringify(camNow));
  await sleep(650);
  const camAfter = await page.evaluate(readCam);
  check("reduced motion: warn window does not move the camera", near(camAfter),
    JSON.stringify(camAfter));

  // hold the collapse scene (no page turn) + latch the banned grammar
  await page.evaluate(() => {
    G.ended = true; // nextLevel() no-ops: the rubble scene stays up for probing
    window.__q = { hitstop: false, flash: false, ring: false };
    const scene = document.getElementById("scene");
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes" && scene.classList.contains("zb-hitstop"))
          window.__q.hitstop = true;
        for (const n of m.addedNodes || []) {
          if (n.nodeType !== 1) continue;
          const cls = (n.getAttribute && n.getAttribute("class")) || "";
          if (cls.indexOf("zb-blastflash") !== -1) window.__q.flash = true;
          if (cls.indexOf("zb-shockring") !== -1) window.__q.ring = true;
        }
      }
    }).observe(scene, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
  });
  const roots = await page.evaluate(() => G.level.pillars.map((p) => p.root));
  // first claim via a single tap: captures the armed preview under
  // reduced motion, then the 750ms window commits the claim itself
  const armDrainReduced = await armAndReadDrain(page, roots[0]);
  await poll(page, () => G.claimed.length >= 1, null, 3000);
  await tap(page, roots[1]);
  const chop = await poll(page, () => !!document.querySelector("#sceneStamp .zb-chai"), null, 6000);
  const st = await page.evaluate(() => {
    const out = { q: window.__q, hitStopAt: typeof G !== "undefined" ? G.hitStopAt : undefined };
    const chai = document.querySelector("#sceneStamp .zb-chai");
    if (chai) {
      const cs = getComputedStyle(chai);
      const m = new DOMMatrix(cs.transform);
      out.chai = { anim: cs.animationName, a: m.a };
    }
    const deck = document.getElementById("deck");
    if (deck)
      out.deck = { fall: deck.classList.contains("fall"), opacity: getComputedStyle(deck).opacity };
    const rubble = document.getElementById("rubble");
    if (rubble)
      out.rubble = {
        show: rubble.classList.contains("show"),
        vis: getComputedStyle(rubble).visibility,
        drawn: [...rubble.querySelectorAll("path")].every(
          (p) => getComputedStyle(p).strokeDashoffset === "0px"
        ),
      };
    const graph = document.getElementById("graph");
    if (graph) {
      const curve = graph.querySelector(".zb-graph__curve");
      out.graph = {
        opacity: getComputedStyle(graph).opacity,
        curve: curve ? getComputedStyle(curve).strokeDashoffset : null,
      };
    }
    return out;
  });
  check(
    "reduced motion: no hit-stop, flash or shockwave",
    !!chop && !st.q.hitstop && !st.q.flash && !st.q.ring && st.hitStopAt == null,
    `chop=${!!chop} ${JSON.stringify(st.q)} hitStopAt=${st.hitStopAt}`
  );
  check(
    "reduced motion: chop appears at rest",
    !!chop && !!st.chai && st.chai.anim === "none" && Math.abs(st.chai.a - 0.9903) < 0.05,
    st.chai ? `anim=${st.chai.anim} matrix.a=${st.chai.a.toFixed(3)}` : "no chop rendered"
  );
  check(
    "reduced motion: fallen deck cleared",
    !!st.deck && st.deck.fall && st.deck.opacity === "0",
    JSON.stringify(st.deck)
  );
  check(
    "reduced motion: rubble visible",
    !!st.rubble && st.rubble.show && st.rubble.vis === "visible" && st.rubble.drawn,
    JSON.stringify(st.rubble)
  );
  check(
    "reduced motion: resolve graph visible",
    !!st.graph && st.graph.opacity === "1" && st.graph.curve === "0px",
    JSON.stringify(st.graph)
  );
  // batch-fix verification: the 750ms commit window is drawn as a
  // drain bar under the armed preview; reduced motion keeps the bar
  // machinery but never animates it
  check(
    "keypad: armed preview drains the 750ms window (static under reduced)",
    !!armDrainNormal &&
      armDrainNormal.armed &&
      armDrainNormal.content !== "none" &&
      armDrainNormal.anim === "zb-armdrain" &&
      armDrainNormal.dur === "0.75s" &&
      !!armDrainReduced &&
      armDrainReduced.armed &&
      armDrainReduced.anim === "none",
    `normal=${JSON.stringify(armDrainNormal)} reduced=${JSON.stringify(armDrainReduced)}`
  );
  await ctx.close();
}

/* ══════════════ 24–29 · fx tier gate ══════════════ */
async function sectionFx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 740 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "?fx=lite&theme=light&levels=1&rounds=1&seed=7");
  check(
    "fx=lite: gate attribute set",
    await page.evaluate(() => document.documentElement.dataset.fx === "lite"),
    "data-fx !== lite"
  );
  await startSolo(page);
  const liteFilter = await page.evaluate(
    () => getComputedStyle(document.getElementById("structSvg")).filter
  );
  check("fx=lite: no wobble filter on the scene", liteFilter === "none", `filter=${liteFilter}`);
  const washLite = await poll(
    page,
    () => {
      const polys = [...document.querySelectorAll("#structSvg .zb-wash")];
      return (
        polys.length >= 3 &&
        polys.some((p) => parseFloat(getComputedStyle(p).opacity) >= 0.05)
      );
    },
    null,
    5000
  );
  check("fx=lite: wash layer survives the gate", !!washLite, "no visible .zb-wash under fx=lite");
  const grainLite = await page.evaluate(
    () => getComputedStyle(document.body, "::after").content
  );
  check("fx=lite: no paper grain overlay", grainLite === "none", `body::after content=${grainLite}`);

  const page2 = await ctx.newPage();
  await page2.goto(BASE + "?fx=full&theme=light");
  const fullFilter = await page2.evaluate(
    () => getComputedStyle(document.getElementById("structSvg")).filter
  );
  check(
    "fx=full: wobble filter applied",
    typeof fullFilter === "string" && fullFilter.includes("zb-wobble"),
    `filter=${fullFilter}`
  );
  const grainFull = await page2.evaluate(() => {
    const cs = getComputedStyle(document.body, "::after");
    return { content: cs.content, bg: cs.backgroundImage.slice(0, 40), op: cs.opacity };
  });
  check(
    "fx=full: paper grain overlay present",
    grainFull.content !== "none" && grainFull.bg.includes("data:image/svg"),
    JSON.stringify(grainFull)
  );
  await ctx.close();
}

/* ══════════════ 30–41 · sound, sampler, bgm ══════════════ */
async function sectionSound(browser) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 740 } });
  const page = await ctx.newPage();
  const reqs = [];
  page.on("request", (r) => reqs.push(r.url()));
  await page.goto(BASE + "?levels=2&rounds=1&seed=9&fuse=2&theme=light");

  const howler = await page.evaluate(() => typeof Howl === "function" && typeof Howler === "object");
  check(
    "sound: Howler vendored and loaded",
    howler && reqs.some((u) => u.startsWith(ORIGIN) && u.includes("/shared/vendor/howler.min.js")),
    `Howl=${howler}`
  );
  const manifest = await page.evaluate(
    () =>
      window.ZB_SPRITE &&
      window.ZB_SPRITE.src === "audio/zb-sprite.wav" &&
      ["boom_s", "boom_l", "tick", "key", "slam"].every((k) => k in window.ZB_SPRITE.sprite)
  );
  check("sound: sprite manifest loaded", !!manifest, "ZB_SPRITE missing keys");

  const offState = await page.evaluate(() => ({
    on: ZBFX.audio.isOn(),
    sampler: ZBFX.audio.samplerState(),
    stored: localStorage.getItem("mc-games-sound"),
  }));
  const wavFetched = () => reqs.some((u) => u.includes("zb-sprite.wav"));
  check(
    "sound: off by default, sprite NOT fetched",
    offState.on === false && offState.sampler === "idle" && offState.stored === null && !wavFetched(),
    `${JSON.stringify(offState)} wav=${wavFetched()}`
  );

  await page.evaluate(() => document.getElementById("soundToggle").click());
  const storedOn = await poll(
    page,
    () => localStorage.getItem("mc-games-sound") === "on" && ZBFX.audio.isOn() === true,
    null,
    2000
  );
  check("sound: toggle stores on", !!storedOn, "mc-games-sound not 'on' after toggle");

  const ready = await poll(page, () => ZBFX.audio.samplerState() === "ready", null, 10000);
  check("sound: sampler ready after enable", !!ready, "samplerState never 'ready'");
  check("sound: sprite fetched", wavFetched(), "no request for zb-sprite.wav after enable");

  await startSolo(page);
  await waitStaged(page);
  const base = await page.evaluate(() => ZBFX.bgm.state());
  check(
    "bgm: base groove once the round opens",
    !!base && base.allowed === true && base.tier === "base" && base.playing === true,
    JSON.stringify(base)
  );

  await page.evaluate(() => {
    G.deadline = performance.now() + 5000;
  });
  const warn = await poll(page, () => ZBFX.bgm.state().tier === "warn", null, 3000);
  check("bgm: warn tier rides the fuse warning", !!warn, "tier never reached 'warn'");

  const ducks0 = await page.evaluate(() => ZBFX.bgm.state().ducks);
  const root = await page.evaluate(() => G.level.pillars[0].root);
  await tap(page, root);
  const ducked = await poll(page, (d0) => ZBFX.bgm.state().ducks > d0, ducks0, 4000);
  check("bgm: collapse ducked the groove", !!ducked, `ducks stayed at ${ducks0}`);

  const netUrls = reqs.filter((u) => /^https?:/.test(u));
  const offenders = netUrls.filter((u) => !u.startsWith(ORIGIN + "/"));
  check(
    "sound: every request same-origin (bgm adds zero fetches)",
    netUrls.length > 5 && offenders.length === 0,
    offenders.slice(0, 3).join(", ")
  );

  const endBgm = await poll(
    page,
    () => {
      if (!document.getElementById("endScreen").classList.contains("active")) return null;
      const s = ZBFX.bgm.state();
      return s.playing === false && s.tier === null ? s : null;
    },
    null,
    9000
  );
  check("bgm: stopped on the end screen", !!endBgm, "bgm still scheduling on the report");

  await page.reload();
  const survives = await poll(
    page,
    () => typeof ZBFX !== "undefined" && ZBFX.audio.isOn() === true,
    null,
    4000
  );
  check("sound: enabled state survives reload", !!survives, "isOn() false after reload");
  await ctx.close();
}

/* ══════════════ 42–49 · the one-time sound offer ══════════════ */
async function sectionOffer(browser) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 740 } });
  const page = await ctx.newPage();
  const url = BASE + "?levels=2&rounds=1&seed=9&theme=light";
  await page.goto(url);
  await startSolo(page);

  const shown = await poll(
    page,
    () => {
      const el = document.getElementById("soundOffer");
      return !!el && el.style.display !== "none" && el.offsetParent !== null;
    },
    null,
    4000
  );
  check("offer: chip shows on the first level card (fresh storage)", !!shown, "chip never shown");
  const preStore = await page.evaluate(() => localStorage.getItem("mc-games-sound"));
  check("offer: no preference stored before the tap", preStore === null, `stored=${preStore}`);

  const tapRes = await page.evaluate(() => {
    const el = document.getElementById("soundOffer");
    if (!el) return null;
    el.click();
    return {
      on: ZBFX.audio.isOn(),
      stored: localStorage.getItem("mc-games-sound"),
      acked: el.classList.contains("on"),
      text: el.textContent.trim(),
    };
  });
  check(
    "offer: tap turns sound on and stores it",
    !!tapRes && tapRes.on === true && tapRes.stored === "on",
    JSON.stringify(tapRes)
  );
  const icon = await page.evaluate(() => ({
    on: document.getElementById("soundIconOn").style.display,
    off: document.getElementById("soundIconOff").style.display,
    pressed: document.getElementById("soundToggle").getAttribute("aria-pressed"),
  }));
  check(
    "offer: header icon agrees",
    icon.on === "block" && icon.off === "none" && icon.pressed === "true",
    JSON.stringify(icon)
  );
  const gone = await poll(page, () => !document.getElementById("soundOffer"), null, 3000);
  check(
    "offer: chip removes itself after the ack",
    !!tapRes && tapRes.acked && !!gone,
    `acked=${tapRes && tapRes.acked} removed=${!!gone}`
  );

  // answered: the offer must never return
  await page.reload();
  await startSolo(page);
  await sleep(1200); // past the level-card beat where the chip would mount
  const hidden1 = await page.evaluate(() => {
    const el = document.getElementById("soundOffer");
    return !!el && el.style.display === "none";
  });
  check("offer: never returns once answered", hidden1, "chip visible on a stored-answer device");

  // any stored preference (off) keeps the offer silent too
  await page.evaluate(() => localStorage.setItem("mc-games-sound", "off"));
  await page.reload();
  await startSolo(page);
  await sleep(1200);
  const hidden2 = await page.evaluate(() => {
    const el = document.getElementById("soundOffer");
    return !!el && el.style.display === "none" && ZBFX.audio.isOn() === false;
  });
  check("offer: silent with a stored preference", hidden2, "chip visible with mc-games-sound=off");

  // unanswered offer: round 1 ending removes the chip but STORES
  // NOTHING — one distracted round must not mute the teaching PC
  // forever. The offer returns on the next run.
  await page.evaluate(() => localStorage.removeItem("mc-games-sound"));
  await page.reload();
  await startSolo(page);
  const reshown = await poll(
    page,
    () => {
      const el = document.getElementById("soundOffer");
      return !!el && el.style.display !== "none";
    },
    null,
    4000
  );
  await waitStaged(page);
  const root = await page.evaluate(() => G.level.pillars[0].root);
  await tap(page, root); // single pillar: the claim collapses round 1
  const settled = await poll(
    page,
    () =>
      !document.getElementById("soundOffer") &&
      localStorage.getItem("mc-games-sound") === null &&
      ZBFX.audio.isOn() === false &&
      ZBFX.audio.samplerState() === "idle",
    null,
    6000
  );
  // a fresh run (new page load, still no stored preference) re-offers
  await page.reload();
  await startSolo(page);
  const reoffered = await poll(
    page,
    () => {
      const el = document.getElementById("soundOffer");
      return (
        !!el &&
        el.style.display !== "none" &&
        localStorage.getItem("mc-games-sound") === null
      );
    },
    null,
    4000
  );
  check(
    "offer: unanswered offer stays unstored, re-offered next run",
    !!reshown && !!settled && !!reoffered,
    `reshown=${!!reshown} settled=${!!settled} reoffered=${!!reoffered}`
  );
  await ctx.close();
}

/* ══════════════ 50–56 · intro attract diorama ══════════════ */
async function sectionDiorama(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE); // lang c default

  const loop = await page.evaluate(() => {
    const bs = [...document.querySelectorAll(".zb-hero .zb-dio__b")];
    return {
      n: bs.length,
      anims: bs.map((b) => {
        const cs = getComputedStyle(b);
        return { name: cs.animationName, dur: cs.animationDuration, it: cs.animationIterationCount };
      }),
      ops: bs.map((b) => parseFloat(getComputedStyle(b).opacity)),
    };
  });
  check(
    "diorama: three buildings on the 21s loop",
    loop.n === 3 &&
      loop.anims.every((a) => a.name === "zb-dioshow" && a.dur === "21s" && a.it === "infinite"),
    JSON.stringify(loop.anims)
  );
  check(
    "diorama: act 1 playing, acts 2/3 waiting",
    loop.ops[0] > 0.5 && loop.ops[1] < 0.15 && loop.ops[2] < 0.15,
    `opacities=${loop.ops && loop.ops.join(",")}`
  );

  const machinery = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { name: cs.animationName, it: cs.animationIterationCount };
    };
    return {
      fuse: pick(".zb-dio__fuseline"),
      spark: pick(".zb-dio__spark"),
      stamp: pick(".zb-dio__stamp"),
      wipe: pick(".zb-dio__wipe"),
    };
  });
  check(
    "diorama: fuse, stamp and page wipe machinery armed",
    !!machinery.fuse &&
      machinery.fuse.name === "zb-dioburn" &&
      !!machinery.spark &&
      machinery.spark.name === "zb-diospark" &&
      !!machinery.stamp &&
      machinery.stamp.name === "zb-diostamp" &&
      !!machinery.wipe &&
      machinery.wipe.name === "zb-diowipe" &&
      [machinery.fuse, machinery.spark, machinery.stamp, machinery.wipe].every(
        (m) => m.it === "infinite"
      ),
    JSON.stringify(machinery)
  );

  const title = await page.evaluate(() => {
    const spans = [...document.querySelectorAll("#introScreen .mc-title .zb-title-ch")];
    return {
      n: spans.length,
      text: spans.map((s) => s.textContent).join(""),
      anim: spans.map((s) => getComputedStyle(s).animationName),
    };
  });
  check(
    "title stamps in character by character (4 chops)",
    title.n === 4 && title.text === "歸零爆破" && title.anim.every((a) => a === "zb-chstamp"),
    JSON.stringify(title)
  );

  const ctas = await page.evaluate(() => {
    const host = document.getElementById("btnHost");
    const solo = document.getElementById("btnSolo");
    const hr = host.getBoundingClientRect();
    const sr = solo.getBoundingClientRect();
    return {
      hostPrimary: host.classList.contains("mc-btn--primary"),
      soloQuiet: !solo.classList.contains("mc-btn--primary"),
      block: host.classList.contains("mc-btn--block") && solo.classList.contains("mc-btn--block"),
      leads: !!(host.compareDocumentPosition(solo) & Node.DOCUMENT_POSITION_FOLLOWING),
      dw: Math.abs(hr.width - sr.width),
      dh: Math.abs(hr.height - sr.height),
    };
  });
  check(
    "CTAs: multi-device leads, solo quiet, same footprint",
    ctas.hostPrimary && ctas.soloQuiet && ctas.block && ctas.leads && ctas.dw <= 2 && ctas.dh <= 6,
    JSON.stringify(ctas)
  );

  // fast-forward the CSS loop into act 2 and read atomically
  const cycled = await page.evaluate(() => {
    document.getAnimations().forEach((a) => {
      try {
        a.currentTime = 8000;
      } catch (_) {}
    });
    const bs = [...document.querySelectorAll(".zb-hero .zb-dio__b")];
    return bs.map((b) => parseFloat(getComputedStyle(b).opacity));
  });
  check(
    "diorama: the loop cycles to the next silhouette",
    cycled.length === 3 && cycled[0] < 0.15 && cycled[1] > 0.85 && cycled[2] < 0.15,
    `opacities@8s=${cycled.join(",")}`
  );

  await page.evaluate(() => document.getElementById("langToggle").click());
  const en = await poll(
    page,
    () => {
      const spans = [...document.querySelectorAll("#introScreen .mc-title .zb-title-ch")];
      if (spans.length !== 2) return null;
      const words = spans.map((s) => s.textContent).join(" ");
      const bs = [...document.querySelectorAll(".zb-hero .zb-dio__b")];
      const alive = bs.every((b) => {
        const cs = getComputedStyle(b);
        return cs.animationName === "zb-dioshow" && cs.animationPlayState === "running";
      });
      return { words: words, alive: alive };
    },
    null,
    2500
  );
  check(
    "EN title chops by word, loop unharmed",
    !!en && en.words === "Zero Blast" && en.alive,
    JSON.stringify(en)
  );
  await ctx.close();
}

/* ══════════════ 57–59 · reduced motion, intro ══════════════ */
async function sectionReducedIntro(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BASE);

  const vignette = await page.evaluate(() => {
    const b1 = document.querySelector(".zb-dio__b--first");
    if (!b1) return null;
    const dds = [...document.querySelectorAll(".zb-hero .dd")];
    return {
      op: getComputedStyle(b1).opacity,
      dd: dds.length,
      drawn: dds.every((d) => getComputedStyle(d).strokeDashoffset === "0px"),
    };
  });
  check(
    "reduced: static vignette (building 1 standing, drawn)",
    !!vignette && vignette.op === "1" && vignette.dd > 4 && vignette.drawn,
    JSON.stringify(vignette)
  );

  const hiddenBits = await page.evaluate(() => {
    const bs = [...document.querySelectorAll(".zb-hero .zb-dio__b")];
    const op = (el) => (el ? parseFloat(getComputedStyle(el).opacity) : -1);
    return {
      b2: op(bs[1]),
      b3: op(bs[2]),
      stamp: op(document.querySelector(".zb-dio__stamp")),
      spark: op(document.querySelector(".zb-dio__spark")),
    };
  });
  check(
    "reduced: acts 2/3, stamp and spark all hidden",
    hiddenBits.b2 === 0 && hiddenBits.b3 === 0 && hiddenBits.stamp === 0 && hiddenBits.spark === 0,
    JSON.stringify(hiddenBits)
  );

  const plain = await page.evaluate(() => ({
    spans: document.querySelectorAll("#introScreen .mc-title .zb-title-ch").length,
    text: document.querySelector("#introScreen .mc-title").textContent.trim(),
  }));
  check(
    "reduced: title stays plainly set (no chop spans)",
    plain.spans === 0 && plain.text === "歸零爆破",
    JSON.stringify(plain)
  );
  await ctx.close();
}

/* ══════════════ 60–70 · camera + letterbox (batch U contract) ══════════════ */
const KINDS = [1, 2, 3, 4, 5, 6];
const TALL_KINDS = [5, 6]; // the kinds whose subject height outruns the 400-unit sheet

async function collectCamMetrics(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const data = [];
  for (const k of KINDS) {
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + `?levels=${k}&rounds=1&seed=5&fx=lite&theme=light`);
      await startSolo(page);
      const settled = await waitCamSettled(page);
      if (settled) {
        const m = await page.evaluate(() => {
          const svg = document.getElementById("structSvg");
          const vb = svg.getAttribute("viewBox").split(" ").map(Number);
          const bb = document.getElementById("deck").getBBox();
          const sc = document.getElementById("scene");
          const srect = sc.getBoundingClientRect();
          const ctm = svg.getScreenCTM();
          const probe = (x, y) => {
            const p = svg.createSVGPoint();
            p.x = x;
            p.y = y;
            const q = p.matrixTransform(ctm);
            const fx = ZBFX.toPx(x, y);
            return { dx: q.x - srect.left - fx.x, dy: q.y - srect.top - fx.y };
          };
          return {
            kind: G.level.n,
            cam: { x: vb[0], y: vb[1], w: vb[2], h: vb[3] },
            bb: { x: bb.x, y: bb.y, w: bb.width, h: bb.height },
            sw: sc.clientWidth,
            sh: sc.clientHeight,
            probes: [probe(200, 210), probe(vb[0] + 12, vb[1] + 24)],
            fxScale: ZBFX.fxScale(),
          };
        });
        data.push(m);
      }
    } catch (_) {}
    await page.close();
  }
  await ctx.close();
  return data;
}

function camChecks(vp, data) {
  const label = `tablet ${vp.key}`;
  const missing = data.length !== KINDS.length ? `collected ${data.length}/6 kinds` : "";

  const badRoof = [];
  for (const m of data) {
    const headroom = m.bb.y - m.cam.y;
    const inX = m.bb.x >= m.cam.x - 0.5 && m.bb.x + m.bb.w <= m.cam.x + m.cam.w + 0.5;
    if (!(headroom >= 8) || !inX)
      badRoof.push(`kind${m.kind} headroom=${headroom.toFixed(1)} inX=${inX}`);
  }
  check(
    `${label}: every roof in frame with headroom >= 8`,
    !missing && badRoof.length === 0,
    missing || badRoof.join("; ")
  );

  const badGround = [];
  for (const m of data) {
    const bottom = m.cam.y + m.cam.h;
    if (!(Math.abs(bottom - 240) < 0.6 && m.cam.y < 209))
      badGround.push(`kind${m.kind} frame=[${m.cam.y.toFixed(1)}..${bottom.toFixed(1)}]`);
  }
  check(
    `${label}: ground + rootmark band in shot`,
    !missing && badGround.length === 0,
    missing || badGround.join("; ")
  );

  const badFill = [];
  for (const m of data) {
    const fill = Math.max(m.bb.w / m.cam.w, (240 - m.bb.y) / m.cam.h);
    if (!(fill >= 0.55)) badFill.push(`kind${m.kind} fill=${fill.toFixed(2)}`);
  }
  check(
    `${label}: frame filled >= 0.55 in the dominant axis`,
    !missing && badFill.length === 0,
    missing || badFill.join("; ")
  );

  if (!vp.letterbox) return;

  const tall = data.filter((m) => TALL_KINDS.includes(m.kind));
  const badBox = [];
  for (const m of tall) {
    const camAspect = m.cam.w / m.cam.h;
    const boxAspect = m.sw / m.sh;
    if (!(camAspect < boxAspect * 0.98))
      badBox.push(`kind${m.kind} cam=${camAspect.toFixed(3)} box=${boxAspect.toFixed(3)}`);
  }
  check(
    `${label}: letterbox fallback engages on the tall kinds`,
    tall.length === TALL_KINDS.length && badBox.length === 0,
    tall.length !== TALL_KINDS.length ? `only ${tall.length} tall kinds collected` : badBox.join("; ")
  );

  const badFx = [];
  for (const m of tall) {
    for (const p of m.probes) {
      if (!(Math.abs(p.dx) < 2 && Math.abs(p.dy) < 2))
        badFx.push(`kind${m.kind} d=(${p.dx.toFixed(1)},${p.dy.toFixed(1)})`);
    }
  }
  check(
    `${label}: fx aligned under the letterboxed frame`,
    tall.length === TALL_KINDS.length && badFx.length === 0,
    tall.length !== TALL_KINDS.length ? `only ${tall.length} tall kinds collected` : badFx.join("; ")
  );
}

async function sectionCamera(browser) {
  const viewports = [
    { key: "ipad-landscape", w: 1024, h: 768, letterbox: false },
    { key: "androidtab", w: 1138, h: 620, letterbox: true },
    { key: "ipad-portrait", w: 768, h: 1024, letterbox: false },
  ];
  for (const vp of viewports) {
    const data = await collectCamMetrics(browser, vp);
    camChecks(vp, data);
  }
}

/* ══════════════ main ══════════════ */
(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  try {
    await sectionEnDark(browser);
    await section320(browser);
    await sectionA11yText(browser);
    await sectionLandscape(browser);
    await sectionReducedGame(browser);
    await sectionFx(browser);
    await sectionSound(browser);
    await sectionOffer(browser);
    await sectionDiorama(browser);
    await sectionReducedIntro(browser);
    await sectionCamera(browser);
  } catch (err) {
    failures += 1;
    console.error(`  ✗ suite crashed — ${err && err.stack ? err.stack.split("\n")[0] : err}`);
  } finally {
    await browser.close();
  }
  console.log("");
  if (failures) {
    console.log(`${failures} FAILED (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    process.exit(1);
  }
  console.log("ALL PASS");
})();
