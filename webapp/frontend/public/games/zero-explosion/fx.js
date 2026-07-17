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

  /* svg viewBox coords → canvas px (the svg fills the scene width,
   * preserveAspectRatio keeps it centred vertically) */
  function toPx(x, y) {
    var w = scene.clientWidth;
    var h = scene.clientHeight;
    var scale = Math.min(w / vbW, h / vbH);
    var ox = (w - vbW * scale) / 2;
    var oy = (h - vbH * scale) / 2;
    return { x: ox + x * scale, y: oy + y * scale, scale: scale };
  }

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
    var n = opts.count || 26;
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

  /* soft dust puffs rising from rubble */
  function dust(x, y, opts) {
    if (reduced) return;
    opts = opts || {};
    var at = toPx(x, y);
    var n = opts.count || 14;
    var color = opts.color || token("--mc-ink-faint");
    for (var i = 0; i < n; i++) {
      spawn({
        type: "dust",
        x: at.x + (Math.random() - 0.5) * 50 * at.scale,
        y: at.y + (Math.random() - 0.5) * 10 * at.scale,
        vx: (Math.random() - 0.5) * 0.8 * at.scale,
        vy: (-0.3 - Math.random() * 0.7) * at.scale,
        size: (6 + Math.random() * 12) * at.scale,
        grow: 1.012,
        ttl: 900 + Math.random() * 900,
        life: 0,
        color: color,
      });
    }
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
    if (!last) last = ts;
    var dt = Math.min(ts - last, 40);
    last = ts;

    emitSparks();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var alive = [];
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.ttl) continue;
      var k = 1 - p.life / p.ttl;
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      if (p.g) p.vy += p.g * (dt / 16);
      if (p.grow) p.size *= Math.pow(p.grow, dt / 16);
      ctx.globalAlpha = p.type === "dust" ? k * 0.28 : k;
      ctx.fillStyle = p.color;
      if (p.type === "shard") {
        p.rot += p.vr * (dt / 16);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
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
    shakeAmp = Math.max(shakeAmp, intensity || 6);
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  /* ---------------- audio (all synthesised) ---------------- */

  var ac = null;
  var master = null;
  var noiseBuf = null;
  var fuseNodes = null;
  var enabled = false;
  try {
    enabled = localStorage.getItem("mc-games-sound") === "on";
  } catch (_) {}

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

  var audio = {
    isOn: function () {
      return enabled;
    },
    setOn: function (on) {
      enabled = !!on;
      try {
        localStorage.setItem("mc-games-sound", enabled ? "on" : "off");
      } catch (_) {}
      if (!enabled) audio.fuseStop();
    },
    toggle: function () {
      audio.setOn(!enabled);
      return enabled;
    },
    /* call from a user gesture before any playback (autoplay policy) */
    unlock: function () {
      if (enabled) ensureCtx();
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
    /* u in 0..1 — rises as the fuse runs down */
    fuseUrgency: function (u) {
      if (!fuseNodes) return;
      fuseNodes.filt.frequency.value = 2600 + 2400 * u;
      fuseNodes.gain.gain.value = 0.035 + 0.05 * u;
    },
    fuseStop: function () {
      if (!fuseNodes) return;
      try {
        fuseNodes.src.stop();
      } catch (_) {}
      fuseNodes = null;
    },
    boom: function (big) {
      if (!enabled || !ensureCtx()) return;
      var m = big ? 1.4 : 1;
      noiseburst("lowpass", 320, 0.5 * m, 0.4);
      thump(90, 38, 0.55 * m, 0.35);
    },
    collapse: function () {
      if (!enabled || !ensureCtx()) return;
      noiseburst("lowpass", 300, 0.55, 0.5);
      thump(85, 35, 0.6, 0.4);
      noiseburst("lowpass", 240, 0.45, 0.5, 0.16);
      thump(70, 32, 0.5, 0.45, 0.18);
      noiseburst("lowpass", 110, 0.4, 1.5, 0.3); // long rumble
    },
    fizzle: function () {
      if (!enabled || !ensureCtx()) return;
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
    },
    tick: function () {
      if (!enabled || !ensureCtx()) return;
      thump(1250, 1100, 0.1, 0.04);
    },
    /* wrong answer: a dull knock, deliberately nothing like a boom */
    knock: function () {
      if (!enabled || !ensureCtx()) return;
      thump(150, 70, 0.3, 0.18);
      noiseburst("lowpass", 500, 0.12, 0.12);
    },
    click: function () {
      if (!enabled || !ensureCtx()) return;
      thump(1900, 1500, 0.045, 0.02);
    },
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
    debris: debris,
    dust: dust,
    sparksAt: sparksAt,
    shake: shake,
    audio: audio,
    vibrate: vibrate,
  };
})();
