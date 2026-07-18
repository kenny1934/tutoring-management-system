/* 歸零爆破 Zero Blast — demolition FX
 *
 * Canvas-2D particles (ink debris, dust, fuse sparks), screen shake,
 * Web Audio synthesis and vibration. Tier 0: no libraries.
 *
 * The canvas overlays the SVG scene; spawn positions are given in SVG
 * viewBox units and mapped to canvas pixels, so FX land exactly on the
 * structure regardless of layout size. Colours are read from the
 * theme.css tokens at spawn time, so debris is ink-coloured in both
 * themes and red is still the teacher's pen.
 *
 * Respects prefers-reduced-motion: visual FX and shake become no-ops
 * (state changes remain visible through instant CSS); audio is kept,
 * it has its own toggle.
 */
(function () {
  "use strict";

  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  var canvas = null;
  var ctx = null;
  var scene = null; // shaken element (also the canvas' offset parent)
  var vbW = 400;
  var vbH = 260;
  var particles = [];
  var shakeAmp = 0;
  var running = false;
  var sparkEmitter = null; // {x, y} in viewBox units, or null
  var freezeUntil = 0; // hit-stop: the world holds its breath

  function attach(canvasEl, sceneEl, viewW, viewH) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    scene = sceneEl;
    vbW = viewW || 400;
    vbH = viewH || 260;
    resize();
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(resize).observe(scene);
    } else {
      addEventListener("resize", resize);
    }
  }

  function resize() {
    if (!canvas || !scene) return;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var w = scene.clientWidth;
    var h = scene.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* the camera's live frame (batch P): while the viewBox moves, every
   * spawn position must convert through the CURRENT frame, not the
   * design frame, or FX drift off the structure under zoom */
  var view = null; // {x, y, w, h} in viewBox units; null = full design frame
  function setView(v) {
    view = v ? { x: v.x, y: v.y, w: v.w, h: v.h } : null;
  }

  /* svg viewBox coords → canvas px through the live frame
   * (preserveAspectRatio meet: centred letterbox when aspects differ) */
  function toPx(x, y) {
    var w = scene.clientWidth;
    var h = scene.clientHeight;
    var vx = view ? view.x : 0;
    var vy = view ? view.y : 0;
    var vw = view ? view.w : vbW;
    var vh = view ? view.h : vbH;
    var scale = Math.min(w / vw, h / vh);
    var ox = (w - vw * scale) / 2;
    var oy = (h - vh * scale) / 2;
    return { x: ox + (x - vx) * scale, y: oy + (y - vy) * scale, scale: scale };
  }

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* theme tokens are hex: derive translucent stops for soft gradients */
  function withAlpha(color, a) {
    if (color[0] === "#") {
      var h = color.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
    }
    if (color.indexOf("rgb(") === 0) return color.replace("rgb(", "rgba(").replace(")", "," + a + ")");
    return color;
  }

  function isDark() {
    var th = document.documentElement.getAttribute("data-theme");
    if (th) return th === "dark";
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }

  /* projector scenes are much larger than the 400px design width, and
   * a zoomed-in frame magnifies further: spawn proportionally more
   * particles and shake harder (capped) */
  function fxScale() {
    if (!scene) return 1;
    // same meet scale as toPx: on a letterboxed frame (batch U) the
    // real zoom is the smaller ratio, not the width ratio
    return Math.max(1, Math.min(toPx(0, 0).scale, 2.5));
  }

  /* ---------------- particles ---------------- */

  function spawn(p) {
    particles.push(p);
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  /* ink shards bursting from a point (pillar break, collapse) */
  function debris(x, y, opts) {
    if (reduced) return;
    opts = opts || {};
    var at = toPx(x, y);
    var n = Math.round((opts.count || 26) * fxScale());
    var color = opts.color || token("--mc-ink");
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var pow = (opts.power || 1) * (2 + Math.random() * 4.5) * at.scale;
      spawn({
        type: "shard",
        x: at.x + (Math.random() - 0.5) * 14 * at.scale,
        y: at.y + (Math.random() - 0.5) * 20 * at.scale,
        vx: Math.cos(ang) * pow,
        vy: Math.sin(ang) * pow - 2.5 * at.scale,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        size: (2 + Math.random() * 4) * at.scale,
        ttl: 700 + Math.random() * 600,
        life: 0,
        color: color,
        g: 0.16 * at.scale,
      });
    }
  }

  /* collapse dust: a few large, soft puffs that rise and shear
   * sideways, translucent enough that rootmarks and rubble stay
   * readable through them (drawn as radial gradients, additive on
   * the dark chalkboard) */
  function dust(x, y, opts) {
    if (reduced) return;
    opts = opts || {};
    var at = toPx(x, y);
    var n = Math.round((opts.count || 4) * fxScale());
    var color = opts.color || token("--mc-ink-faint");
    var lean = Math.random() < 0.5 ? -1 : 1; // the whole cloud drifts one way
    for (var i = 0; i < n; i++) {
      spawn({
        type: "dust",
        x: at.x + (Math.random() - 0.5) * 60 * at.scale,
        y: at.y + (Math.random() - 0.5) * 12 * at.scale,
        vx: lean * (0.1 + Math.random() * 0.3) * at.scale,
        vy: (-0.25 - Math.random() * 0.45) * at.scale,
        sh: lean * (0.008 + Math.random() * 0.014) * at.scale,
        size: (13 + Math.random() * 14) * at.scale,
        grow: 1.008,
        al: opts.al || 0.1,
        ttl: 1000 + Math.random() * 900,
        life: 0,
        color: color,
      });
    }
  }

  /* the 拆 chop's landing: dust kicked out along the ground both ways */
  function dustRing(x, y) {
    if (reduced) return;
    var at = toPx(x, y);
    var n = Math.round(5 * fxScale());
    var color = token("--mc-ink-faint");
    for (var i = 0; i < n; i++) {
      var dir = i % 2 === 0 ? 1 : -1;
      spawn({
        type: "dust",
        x: at.x + dir * (6 + Math.random() * 12) * at.scale,
        y: at.y + (Math.random() - 0.5) * 4 * at.scale,
        vx: dir * (1.1 + Math.random() * 1.4) * at.scale,
        vy: (-0.05 - Math.random() * 0.2) * at.scale,
        sh: dir * 0.02 * at.scale,
        size: (9 + Math.random() * 9) * at.scale,
        grow: 1.02,
        al: 0.14,
        ttl: 480 + Math.random() * 350,
        life: 0,
        color: color,
      });
    }
  }

  /* torn-paper chunks: big scraps of the worksheet itself thrown out
   * of the blast, paper-filled with an inked edge so they read at
   * classroom distance where the small shards cannot */
  function scraps(x, y, opts) {
    if (reduced) return;
    opts = opts || {};
    var at = toPx(x, y);
    var n = Math.round((opts.count || 7) * fxScale());
    var paper = token("--mc-paper-raised") || token("--mc-paper");
    var edge = token("--mc-ink");
    for (var i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      var pow = (2.5 + Math.random() * 4.5) * at.scale;
      spawn({
        type: "scrap",
        x: at.x + (Math.random() - 0.5) * 34 * at.scale,
        y: at.y + (Math.random() - 0.5) * 18 * at.scale,
        vx: Math.cos(ang) * pow,
        vy: Math.sin(ang) * pow - 1.5 * at.scale,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.32,
        size: (7 + Math.random() * 9) * at.scale,
        ttl: 900 + Math.random() * 500,
        life: 0,
        color: paper,
        edge: edge,
        g: 0.15 * at.scale,
      });
    }
  }

  /* finale celebration: ink splatter burst — the house language is
   * splatter and stars, never confetti */
  function splatter(x, y) {
    if (reduced) return;
    var at = toPx(x, y);
    var n = Math.round(12 * fxScale());
    var color = token("--mc-ink");
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var pow = (1.5 + Math.random() * 4) * at.scale;
      spawn({
        type: "blot",
        x: at.x,
        y: at.y,
        vx: Math.cos(ang) * pow,
        vy: Math.sin(ang) * pow - 1.5 * at.scale,
        size: (1.5 + Math.random() * 4.5) * at.scale,
        ttl: 700 + Math.random() * 700,
        life: 0,
        color: color,
        g: 0.1 * at.scale,
      });
    }
  }

  /* finale celebration: gold stars raining across the scene */
  function starRain() {
    if (reduced || !scene) return;
    var s = fxScale();
    var w = scene.clientWidth;
    var n = Math.round(10 * s);
    var color = token("--mc-gold");
    for (var i = 0; i < n; i++) {
      spawn({
        type: "star",
        x: Math.random() * w,
        y: -10 - Math.random() * 50,
        vx: (Math.random() - 0.5) * 0.6 * s,
        vy: (1 + Math.random() * 1.4) * s,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.18,
        size: (5 + Math.random() * 5) * s,
        ttl: 1700 + Math.random() * 900,
        life: 0,
        color: color,
      });
    }
  }

  function drawStar(x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 === 0 ? r : r * 0.45;
      var a = (Math.PI / 5) * i - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* continuous spark shower at the burning fuse tip */
  function sparksAt(x, y) {
    sparkEmitter = x === null ? null : { x: x, y: y };
    if (sparkEmitter && !running && !reduced) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  function emitSparks() {
    if (!sparkEmitter || reduced) return;
    var at = toPx(sparkEmitter.x, sparkEmitter.y);
    // idle life: a faint smoke wisp drifts up from the burn point
    if (Math.random() < 0.035) {
      spawn({
        type: "dust",
        x: at.x + (Math.random() - 0.5) * 3 * at.scale,
        y: at.y - 2 * at.scale,
        vx: (Math.random() - 0.5) * 0.25 * at.scale,
        vy: (-0.35 - Math.random() * 0.3) * at.scale,
        size: (3 + Math.random() * 3) * at.scale,
        grow: 1.018,
        al: 0.22,
        ttl: 1200 + Math.random() * 600,
        life: 0,
        color: token("--mc-ink-faint"),
      });
    }
    var colors = [token("--mc-red"), token("--mc-gold")];
    for (var i = 0; i < 2; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      var pow = (0.8 + Math.random() * 2) * at.scale;
      spawn({
        type: "spark",
        x: at.x,
        y: at.y,
        vx: Math.cos(ang) * pow,
        vy: Math.sin(ang) * pow,
        size: (1 + Math.random() * 1.6) * at.scale,
        ttl: 220 + Math.random() * 260,
        life: 0,
        color: colors[i % 2],
        g: 0.05 * at.scale,
      });
    }
  }

  var last = 0;
  function frame(ts) {
    // hit-stop: hold the whole canvas world (particles mid-air, the
    // shake offset frozen) until the freeze releases
    if (performance.now() < freezeUntil) {
      last = ts;
      requestAnimationFrame(frame);
      return;
    }
    if (!last) last = ts;
    var dt = Math.min(ts - last, 40);
    last = ts;

    emitSparks();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var darkNow = isDark();
    var alive = [];
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.ttl) continue;
      var k = 1 - p.life / p.ttl;
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      if (p.g) p.vy += p.g * (dt / 16);
      if (p.sh) p.vx += p.sh * (dt / 16);
      if (p.grow) p.size *= Math.pow(p.grow, dt / 16);
      if (p.type === "shard") {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        p.rot += p.vr * (dt / 16);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.type === "dust") {
        var grad = ctx.createRadialGradient(p.x, p.y, p.size * 0.12, p.x, p.y, p.size);
        grad.addColorStop(0, withAlpha(p.color, 1));
        grad.addColorStop(1, withAlpha(p.color, 0));
        ctx.globalAlpha = k * (p.al || 0.1);
        if (darkNow) ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else if (p.type === "star") {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        p.rot += p.vr * (dt / 16);
        drawStar(p.x, p.y, p.size, p.rot);
      } else if (p.type === "scrap") {
        ctx.globalAlpha = k;
        p.rot += p.vr * (dt / 16);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.edge;
        ctx.lineWidth = Math.max(1, p.size / 9);
        ctx.beginPath();
        ctx.moveTo(-p.size / 2, -p.size / 3);
        ctx.lineTo(p.size / 2, -p.size / 2.6);
        ctx.lineTo(p.size / 2.4, p.size / 3);
        ctx.lineTo(-p.size / 2.2, p.size / 2.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        // sparks composite additively on the dark chalkboard: embers
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        if (darkNow && p.type === "spark") ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      alive.push(p);
    }
    ctx.globalAlpha = 1;
    particles = alive;

    // decaying screen shake on the scene element
    if (shakeAmp > 0.4) {
      shakeAmp *= Math.pow(0.88, dt / 16);
      scene.style.transform =
        "translate(" +
        (Math.random() - 0.5) * shakeAmp +
        "px," +
        (Math.random() - 0.5) * shakeAmp +
        "px)";
    } else if (shakeAmp !== 0) {
      shakeAmp = 0;
      scene.style.transform = "";
    }

    if (particles.length || sparkEmitter || shakeAmp) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      last = 0;
    }
  }

  function shake(intensity) {
    if (reduced) return;
    shakeAmp = Math.max(shakeAmp, (intensity || 6) * Math.max(1, Math.min(fxScale(), 2)));
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  /* the 90ms breath before the break (batch Q). CSS animations are
   * paused separately via the scene's zb-hitstop class; this holds
   * the canvas side. */
  function hitStop(ms) {
    if (reduced) return;
    freezeUntil = performance.now() + (ms || 90);
  }

  /* ---------------- audio ----------------
   *
   * One-shots play from a pre-rendered material sample sprite
   * (audio/zb-sprite.wav via vendored Howler — reliable mobile
   * unlock, one cheap fetch for 30 phones). Synthesis remains in two
   * roles: the looping fuse hiss, which tracks burn urgency
   * continuously (samples can't), and a full fallback for every
   * one-shot when the sprite hasn't loaded (first press, fetch
   * failure, file:// dev). */

  var ac = null;
  var master = null;
  var noiseBuf = null;
  var fuseNodes = null;
  var enabled = false;
  try {
    enabled = localStorage.getItem("mc-games-sound") === "on";
  } catch (_) {}

  /* the sprite loads lazily, only once sound is actually wanted */
  var sampler = null;
  var samplerState = "idle"; // idle | loading | ready | failed
  function ensureSampler() {
    if (samplerState !== "idle") return;
    if (!window.Howl || !window.ZB_SPRITE) {
      samplerState = "failed";
      return;
    }
    samplerState = "loading";
    sampler = new window.Howl({
      src: [window.ZB_SPRITE.src],
      sprite: window.ZB_SPRITE.sprite,
      volume: 0.9,
      onload: function () { samplerState = "ready"; },
      onloaderror: function () { samplerState = "failed"; sampler = null; },
    });
  }
  /* vol (0..1, optional) rides on top of the sprite's base volume so
   * quiet foley (patter, page turns) sits under the booms in class */
  function sample(name, vol) {
    if (samplerState !== "ready") return false;
    var id = sampler.play(name);
    if (vol !== undefined) sampler.volume(vol, id);
    return true;
  }

  function ensureCtx() {
    if (ac) {
      if (ac.state === "suspended") ac.resume();
      return true;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(ac.destination);
    var len = ac.sampleRate;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    var data = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noiseburst(filterType, freq, gainPeak, decay, when) {
    var t = ac.currentTime + (when || 0);
    var src = ac.createBufferSource();
    src.buffer = noiseBuf;
    var filt = ac.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    var g = ac.createGain();
    g.gain.setValueAtTime(gainPeak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(filt).connect(g).connect(master);
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  function thump(freqFrom, freqTo, gainPeak, decay, when) {
    var t = ac.currentTime + (when || 0);
    var osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freqFrom, t);
    osc.frequency.exponentialRampToValueAtTime(freqTo, t + decay);
    var g = ac.createGain();
    g.gain.setValueAtTime(gainPeak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  /* every one-shot shares this prelude: silent when muted, the loaded
   * sample when it is ready, else the passed live-synth fallback */
  function oneShot(name, synth, vol) {
    return function () {
      if (!enabled) return;
      if (sample(name, vol)) return;
      if (!ensureCtx()) return;
      synth();
    };
  }

  /* ---------------- bgm: the construction-site groove ----------------
   *
   * Sequenced live on the same AudioContext - zero asset bytes against
   * the sprite budget, and unlike a rendered loop it can react to the
   * round. Big stage only: the solo sheet and the host projector run
   * it; the 30 student phones never do (initController never calls
   * allow). It rides the same sound opt-in as everything else, sits
   * low under the one-shot bus, and ducks hard when a building drops:
   * the collapse must own the room. */
  var bgm = (function () {
    var BPM = 78;
    var STEP = 60 / BPM / 4; // 16th notes; one bar = 16 steps
    var BUS = 0.14;          // whole groove under the 0.9 one-shot bus
    var bus = null;
    var gritHP = null;       // one shared highpass: grit fires ~3x/s
    var allowed = false;     // big stage only
    var tier = null;         // lobby | idle | base | warn | grace | null
    var timer = null;
    var nextT = 0, step = 0, ducks = 0;

    function ensureBus() {
      if (!ensureCtx()) return false;
      if (!bus) {
        bus = ac.createGain();
        bus.gain.value = BUS;
        bus.connect(master);
        gritHP = ac.createBiquadFilter();
        gritHP.type = "highpass";
        gritHP.frequency.value = 6200;
        gritHP.connect(bus);
      }
      return true;
    }
    /* voices: dry little strokes, nothing sustained, nothing tonal
     * enough to fight the maths. Deliberate forks from the one-shot
     * helpers (thump/noiseburst): these route to the bgm bus, take
     * absolute audio time, and split the pitch chirp from the gain
     * decay - folding them in would put sequencer knobs on helpers
     * every one-shot shares */
    function wood(t, hi, v) { // claves on the scaffold rail
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(hi ? 1680 : 1160, t);
      o.frequency.exponentialRampToValueAtTime(hi ? 1380 : 920, t + 0.03);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.08);
    }
    function tom(t, v) { // the site's low pulse underfoot
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(118, t);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.16);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.25);
    }
    function grit(t, v) { // a shaker of loose grit brushed off the sheet
      var src = ac.createBufferSource();
      src.buffer = noiseBuf;
      var g = ac.createGain();
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      // gain-before-filter: the filter is LTI, audibly identical to
      // filtering first, and the shared node skips a per-note build
      src.connect(g).connect(gritHP);
      src.start(t, Math.random() * 0.4);
      src.stop(t + 0.07);
    }
    function tink(t, v) { // a pipe struck somewhere across the site
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(2794, t);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.4);
    }
    function scheduleStep(s, t) {
      var bar = Math.floor(s / 16), i = s % 16;
      // "idle" is the fizzle cooldown: it shares the lobby pattern
      // today but owns its own name, so tuning the waiting room never
      // silently retunes the post-fizzle reveal
      if (tier === "lobby" || tier === "idle") {
        if (i % 4 === 0) grit(t, 0.5);
        if (i === 8) wood(t, false, 0.35);
        if (i === 14 && bar % 4 === 3) tink(t, 0.12);
        return;
      }
      if (tier === "grace") { // every pillar down: a tight count-in roll
        wood(t, i % 4 === 0, i % 4 === 0 ? 0.5 : 0.28);
        if (i % 8 === 0) tom(t, 0.55);
        return;
      }
      // base and warn share the work groove
      if (i === 0 || i === 7 || i === 10) tom(t, i === 0 ? 0.6 : 0.42);
      if (i === 4 || i === 12) wood(t, false, 0.5);
      if (i % 2 === 0) grit(t, i % 4 === 2 ? 0.45 : 0.25);
      if (i === 14 && bar % 2 === 1) tink(t, 0.1);
      if (tier === "warn" && i % 2 === 1) wood(t, true, 0.3); // tick layer rides the camera creep
    }
    /* lookahead scheduler: a coarse JS interval books precise audio
     * time; if the tab was throttled, skip the missed bar instead of
     * machine-gunning the backlog */
    function pump() {
      var now = ac.currentTime;
      if (nextT < now - 0.25) {
        step += Math.round((now - nextT) / STEP);
        nextT = now + 0.02;
      }
      while (nextT < now + 0.12) {
        scheduleStep(step, Math.max(nextT, now));
        step++;
        nextT += STEP;
      }
    }
    function run() {
      if (timer) return;
      if (!ensureBus()) return;
      bus.gain.cancelScheduledValues(ac.currentTime);
      bus.gain.setValueAtTime(BUS, ac.currentTime);
      step = 0;
      nextT = ac.currentTime + 0.05;
      timer = setInterval(pump, 25);
      pump();
    }
    function halt() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
    /* the one play-policy point: every state change funnels through
     * here, so "when does the groove sound" has a single answer */
    function update() {
      if (allowed && enabled && tier && !document.hidden) run();
      else halt();
    }
    /* a throttled hidden tab can only produce one stray hit a second -
     * go silent instead, and pick the groove back up on return */
    document.addEventListener("visibilitychange", update);
    return {
      /* the boot fork allows the big stage; initController revokes,
       * so a controller stays silent whatever ran before it */
      allow: function (on) {
        allowed = !!on;
        if (!allowed) tier = null;
        update();
      },
      setIntensity: function (t2) {
        tier = t2 || null;
        update(); // no-op while already scheduling: the next bar picks the pattern up
      },
      stop: function () {
        tier = null;
        update();
      },
      /* sound toggled mid-run: start or stop to match the opt-in */
      sync: update,
      /* a building is coming down - get out of its way, then ease back */
      duck: function (ms) {
        if (!timer || !bus) return;
        ducks++;
        var t = ac.currentTime;
        var hold = (ms || 150) / 1000;
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(bus.gain.value, t);
        bus.gain.linearRampToValueAtTime(BUS * 0.08, t + 0.04);
        bus.gain.setValueAtTime(BUS * 0.08, t + 0.04 + hold);
        bus.gain.linearRampToValueAtTime(BUS, t + 0.04 + hold + 0.5);
      },
      /* census for tests */
      state: function () {
        return { allowed: allowed, tier: tier, playing: !!timer, ducks: ducks };
      },
    };
  })();

  var audio = {
    isOn: function () {
      return enabled;
    },
    setOn: function (on) {
      enabled = !!on;
      try {
        localStorage.setItem("mc-games-sound", enabled ? "on" : "off");
      } catch (_) {}
      if (enabled) ensureSampler();
      else audio.fuseStop();
      bgm.sync(); // the groove follows the opt-in both ways
    },
    toggle: function () {
      audio.setOn(!enabled);
      return enabled;
    },
    /* call from a user gesture before any playback (autoplay policy;
     * Howler unlocks itself on the same gesture) */
    unlock: function () {
      if (enabled) {
        ensureCtx();
        ensureSampler();
      }
    },
    /* for tests: idle | loading | ready | failed */
    samplerState: function () {
      return samplerState;
    },
    fuseStart: function () {
      if (!enabled || !ensureCtx()) return;
      audio.fuseStop();
      var src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      var filt = ac.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = 2600;
      filt.Q.value = 0.8;
      var g = ac.createGain();
      g.gain.value = 0.035;
      src.connect(filt).connect(g).connect(master);
      src.start();
      fuseNodes = { src: src, filt: filt, gain: g };
    },
    /* u in 0..1 — rises as the fuse runs down. The ceiling is set for
     * a classroom: by the last seconds the hiss reads from the back
     * row, not just from headphones. */
    fuseUrgency: function (u) {
      if (!fuseNodes) return;
      fuseNodes.filt.frequency.value = 2600 + 2400 * u;
      fuseNodes.gain.gain.value = 0.035 + 0.085 * u;
    },
    fuseStop: function () {
      if (!fuseNodes) return;
      try {
        fuseNodes.src.stop();
      } catch (_) {}
      fuseNodes = null;
    },
    boom: function (big) {
      if (!enabled) return;
      if (sample(big ? "boom_l" : "boom_s")) return;
      if (!ensureCtx()) return;
      var m = big ? 1.4 : 1;
      noiseburst("lowpass", 320, 0.5 * m, 0.4);
      thump(90, 38, 0.55 * m, 0.35);
    },
    /* the payoff moment: the big boom leads, the rumble and debris
     * layer under it — a collapse must outrank every claim boom */
    collapse: function () {
      if (!enabled) return;
      if (sample("rumble")) { sample("boom_l"); sample("debris", 0.6); return; }
      if (!ensureCtx()) return;
      noiseburst("lowpass", 300, 0.55, 0.5);
      thump(85, 35, 0.6, 0.4);
      noiseburst("lowpass", 240, 0.45, 0.5, 0.16);
      thump(70, 32, 0.5, 0.45, 0.18);
      noiseburst("lowpass", 110, 0.4, 1.5, 0.3); // long rumble
    },
    fizzle: oneShot("fizzle", function () {
      var t = ac.currentTime;
      var src = ac.createBufferSource();
      src.buffer = noiseBuf;
      var filt = ac.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.setValueAtTime(1600, t);
      filt.frequency.exponentialRampToValueAtTime(180, t + 0.9);
      var g = ac.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      src.connect(filt).connect(g).connect(master);
      src.start(t);
      src.stop(t + 1);
    }),
    /* fuse countdown tick; urgent = the last three seconds, loud
     * enough that heads come up before the blast */
    tick: function (urgent) {
      if (!enabled) return;
      if (sample("tick", urgent ? 1 : 0.55)) return;
      if (!ensureCtx()) return;
      thump(1250, 1100, urgent ? 0.18 : 0.08, 0.04);
    },
    /* wrong answer: a dull knock, deliberately nothing like a boom */
    knock: oneShot("knock", function () {
      thump(150, 70, 0.3, 0.18);
      noiseburst("lowpass", 500, 0.12, 0.12);
    }),
    /* the 拆 chop landing on the rubble */
    stamp: oneShot("slam", function () {
      thump(130, 45, 0.35, 0.22);
      noiseburst("lowpass", 420, 0.1, 0.1);
    }),
    /* a smaller rubber stamp pressed onto the sheet (condemned notice,
     * the report's 檢定完成 chop) */
    stampSoft: oneShot("stamp", function () {
      thump(170, 60, 0.22, 0.14);
      noiseburst("lowpass", 600, 0.08, 0.07);
    }),
    /* the crack pre-beat before the deck breaks */
    crack: oneShot("crack", function () {
      noiseburst("highpass", 1800, 0.12, 0.12);
      thump(300, 180, 0.12, 0.1);
    }),
    click: oneShot("key", function () {
      thump(1900, 1500, 0.045, 0.02);
    }),
    /* report ceremony: a star stamps in */
    chime: oneShot("chime", function () {
      thump(1320, 1300, 0.08, 0.5);
      thump(2640, 2600, 0.03, 0.25);
    }, 0.8),
    /* the worksheet page turning to the next round */
    page: oneShot("page", function () {
      noiseburst("bandpass", 1400, 0.08, 0.25);
    }, 0.65),
    /* on a phone: someone else's claim just landed */
    ping: oneShot("ping", function () {
      thump(880, 870, 0.07, 0.1);
      thump(880, 870, 0.03, 0.09, 0.16);
    }),
    /* another phone's pillar falling: the street thuds underfoot */
    thud: oneShot("stamp", function () {
      thump(140, 55, 0.2, 0.16);
      noiseburst("lowpass", 300, 0.08, 0.12);
    }, 0.55),
    /* the work crew bolting: a light scuffle of feet on grit */
    patter: oneShot("debris", function () {
      noiseburst("highpass", 900, 0.06, 0.1);
      thump(210, 130, 0.1, 0.07, 0.04);
      thump(190, 115, 0.08, 0.07, 0.13);
      noiseburst("highpass", 800, 0.04, 0.09, 0.18);
    }, 0.5),
  };

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  }

  window.ZBFX = {
    reduced: reduced,
    attach: attach,
    setView: setView,
    /* exposed for the FX-alignment spot test */
    toPx: toPx,
    fxScale: fxScale,
    debris: debris,
    dust: dust,
    dustRing: dustRing,
    scraps: scraps,
    hitStop: hitStop,
    splatter: splatter,
    starRain: starRain,
    sparksAt: sparksAt,
    sparking: function () {
      return !!sparkEmitter;
    },
    /* live particle census, for tests: puffs must stay few and faint */
    stats: function () {
      var s = { shard: 0, dust: 0, spark: 0, maxDustAlpha: 0 };
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        s[p.type] = (s[p.type] || 0) + 1;
        if (p.type === "dust") s.maxDustAlpha = Math.max(s.maxDustAlpha, p.al || 0.1);
      }
      return s;
    },
    shake: shake,
    audio: audio,
    bgm: bgm,
    vibrate: vibrate,
  };
})();
