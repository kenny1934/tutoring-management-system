/* 歸零爆破 Zero Blast — demolition FX skin over the shared core
 *
 * The engine (particles, camera mapping, shake, hit-stop, audio
 * context, sampler, bgm sequencer) lives in shared/fx-core.js. This
 * file is the demolition arrangement: the fuse hiss, the boom family
 * of one-shots, and the construction-site groove. It exports the same
 * window.ZBFX surface the game has always used.
 */
(function () {
  "use strict";

  var stage = window.MCFXCore.createStage();

  var audio; // forward ref for the onChange hook below
  var core = window.MCFXCore.createAudio({
    sprite: function () { return window.ZB_SPRITE; },
    onChange: function (on) {
      if (!on) audio.fuseStop();
      bgm.sync(); // the groove follows the opt-in both ways
    },
  });

  /* ---------------- bgm: the construction-site groove ----------------
   *
   * Sequenced live on the shared AudioContext — zero asset bytes
   * against the sprite budget, and unlike a rendered loop it can react
   * to the round. Big stage only: the solo sheet and the host
   * projector run it; the 30 student phones never do (initController
   * never calls allow). It sits low under the one-shot bus and ducks
   * hard when a building drops: the collapse must own the room.
   *
   * Two layers: the dry construction percussion (wood/tom/grit/tink)
   * and, under it, a melodic bed — a bass pulse and a pentatonic riff
   * over a I–V–vi–IV vamp — so the room is driven, not just ticking
   * (the arc and the main game were reading as silence-plus-sfx). The
   * riff stays in C major pentatonic across all four chords, so it
   * never crowds the maths with a moving tune. Both layers ride the
   * one bus, so the boom duck pulls the whole thing down together. */
  // the vamp: C2 G2 A2 F2 (I–V–vi–IV), one chord root per bar, cycling
  // every four bars. Low, so the bass sits under the site percussion.
  var BGM_ROOTS = [65.41, 98.0, 110.0, 87.31];
  // the pentatonic hook over a 4-bar (64-step) loop: step → frequency,
  // C major pentatonic (C5 D5 E5 G5 A5), sparse enough not to tire over
  // a full lesson. Consonant over every chord in the vamp.
  var BGM_RIFF = {
    2: 659.25, 8: 783.99,      // bar 0: E5 G5
    18: 880.0, 26: 783.99,     // bar 1: A5 G5
    34: 659.25, 42: 587.33,    // bar 2: E5 D5
    50: 523.25, 58: 659.25,    // bar 3: C5 E5
  };
  // which tiers are melodic, and how present the riff is in each: the
  // waiting room and the fizzle cooldown sit back, a live fuse leans in.
  // grace (the 3·2·1 count-in) is percussion only.
  var BGM_BED = { lobby: 0.22, idle: 0.22, base: 0.3, warn: 0.3 };

  var bgm = window.MCFXCore.createBgm({
    audio: core,
    bpm: 78,
    busGain: 0.17,
    /* voices: the site percussion is dry little strokes, nothing that
     * fights the maths; under it sits the melodic bed's bass and pluck
     * (§20). Deliberate forks from the one-shot helpers (thump/
     * noiseburst): these route to the bgm bus, take absolute audio time,
     * and split the pitch chirp from the gain decay — folding them in
     * would put sequencer knobs on helpers every one-shot shares. The
     * bus sits a little hotter than the percussion alone was tuned for,
     * so the bed has room without every voice needing its own trim. */
    setup: function (n, bus) {
      var ac = n.ac;
      var gritHP = ac.createBiquadFilter(); // one shared highpass: grit fires ~3x/s
      gritHP.type = "highpass";
      gritHP.frequency.value = 6200;
      gritHP.connect(bus);
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
        src.buffer = n.noiseBuf;
        var g = ac.createGain();
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
        // gain-before-filter: the filter is LTI, audibly identical to
        // filtering first, and the shared node skips a per-note build
        src.connect(g).connect(gritHP);
        src.start(t, Math.random() * 0.4);
        src.stop(t + 0.07);
      }
      /* one struck-and-ringing voice: the site's high pipe (tink) and the
       * bed's pentatonic pluck are the same stroke at different pitches */
      function ping(t, freq, v, decay) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + decay);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + decay + 0.05);
      }
      function tink(t, v) { // a pipe struck somewhere across the site
        ping(t, 2794, v, 0.35);
      }
      var bassLP = ac.createBiquadFilter(); // one shared lowpass keeps the
      bassLP.type = "lowpass";               // bass round, not buzzy
      bassLP.frequency.value = 440;
      bassLP.connect(bus);
      function bass(t, freq, v) { // the melodic bed's low pulse
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g).connect(bassLP);
        o.start(t);
        o.stop(t + 0.55);
      }
      function pluck(t, freq, v) { // the pentatonic riff riding on top
        ping(t, freq, v, 0.28);
      }
      return { wood: wood, tom: tom, grit: grit, tink: tink, bass: bass, pluck: pluck };
    },
    schedule: function (v, tier, s, t) {
      var bar = Math.floor(s / 16), i = s % 16;
      // the melodic bed: bass on the down- and mid-bar, a fifth pickup,
      // and the sparse riff over the 4-bar loop. Opt-in per tier like the
      // percussion below, so a new tier can never inherit a melody nobody
      // chose for it - grace is the count-in roll and keeps the floor.
      var mel = BGM_BED[tier];
      if (mel) {
        var root = BGM_ROOTS[bar % 4];
        if (i === 0) v.bass(t, root, 0.5);
        if (i === 8) v.bass(t, root, 0.38);
        if (i === 11) v.bass(t, root * 1.5, 0.24);
        var note = BGM_RIFF[s % 64];
        if (note) v.pluck(t, note, mel);
      }
      // "idle" is the fizzle cooldown: it shares the lobby pattern
      // today but owns its own name, so tuning the waiting room never
      // silently retunes the post-fizzle reveal
      if (tier === "lobby" || tier === "idle") {
        if (i % 4 === 0) v.grit(t, 0.5);
        if (i === 8) v.wood(t, false, 0.35);
        if (i === 14 && bar % 4 === 3) v.tink(t, 0.12);
        return;
      }
      if (tier === "grace") { // every pillar down: a tight count-in roll
        v.wood(t, i % 4 === 0, i % 4 === 0 ? 0.5 : 0.28);
        if (i % 8 === 0) v.tom(t, 0.55);
        return;
      }
      // base and warn share the work groove
      if (i === 0 || i === 7 || i === 10) v.tom(t, i === 0 ? 0.6 : 0.42);
      if (i === 4 || i === 12) v.wood(t, false, 0.5);
      if (i % 2 === 0) v.grit(t, i % 4 === 2 ? 0.45 : 0.25);
      if (i === 14 && bar % 2 === 1) v.tink(t, 0.1);
      if (tier === "warn" && i % 2 === 1) v.wood(t, true, 0.3); // tick layer rides the camera creep
    },
  });

  /* ---------------- the demolition one-shots ---------------- */

  var oneShot = core.oneShot;
  var fuseNodes = null;

  audio = {
    isOn: core.isOn,
    setOn: core.setOn,
    toggle: core.toggle,
    unlock: core.unlock,
    samplerState: core.samplerState,
    fuseStart: function () {
      if (!core.isOn() || !core.ensureCtx()) return;
      audio.fuseStop();
      var n = core.nodes();
      var src = n.ac.createBufferSource();
      src.buffer = n.noiseBuf;
      src.loop = true;
      var filt = n.ac.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = 2600;
      filt.Q.value = 0.8;
      var g = n.ac.createGain();
      g.gain.value = 0.035;
      src.connect(filt).connect(g).connect(n.master);
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
      if (!core.isOn()) return;
      if (core.sample(big ? "boom_l" : "boom_s")) return;
      if (!core.ensureCtx()) return;
      var m = big ? 1.4 : 1;
      core.noiseburst("lowpass", 320, 0.5 * m, 0.4);
      core.thump(90, 38, 0.55 * m, 0.35);
    },
    /* the payoff moment: the big boom leads, the rumble and debris
     * layer under it — a collapse must outrank every claim boom */
    collapse: function () {
      if (!core.isOn()) return;
      if (core.sample("rumble")) { core.sample("boom_l"); core.sample("debris", 0.6); return; }
      if (!core.ensureCtx()) return;
      core.noiseburst("lowpass", 300, 0.55, 0.5);
      core.thump(85, 35, 0.6, 0.4);
      core.noiseburst("lowpass", 240, 0.45, 0.5, 0.16);
      core.thump(70, 32, 0.5, 0.45, 0.18);
      core.noiseburst("lowpass", 110, 0.4, 1.5, 0.3); // long rumble
    },
    fizzle: oneShot("fizzle", function () {
      var n = core.nodes();
      var t = n.ac.currentTime;
      var src = n.ac.createBufferSource();
      src.buffer = n.noiseBuf;
      var filt = n.ac.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.setValueAtTime(1600, t);
      filt.frequency.exponentialRampToValueAtTime(180, t + 0.9);
      var g = n.ac.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      src.connect(filt).connect(g).connect(n.master);
      src.start(t);
      src.stop(t + 1);
    }),
    /* fuse countdown tick; urgent = the last three seconds, loud
     * enough that heads come up before the blast */
    tick: function (urgent) {
      if (!core.isOn()) return;
      if (core.sample("tick", urgent ? 1 : 0.55)) return;
      if (!core.ensureCtx()) return;
      core.thump(1250, 1100, urgent ? 0.18 : 0.08, 0.04);
    },
    /* wrong answer: a dull knock, deliberately nothing like a boom */
    knock: oneShot("knock", function () {
      core.thump(150, 70, 0.3, 0.18);
      core.noiseburst("lowpass", 500, 0.12, 0.12);
    }),
    /* the 拆 chop landing on the rubble */
    stamp: oneShot("slam", function () {
      core.thump(130, 45, 0.35, 0.22);
      core.noiseburst("lowpass", 420, 0.1, 0.1);
    }),
    /* a smaller rubber stamp pressed onto the sheet (condemned notice,
     * the report's 檢定完成 chop) */
    stampSoft: oneShot("stamp", function () {
      core.thump(170, 60, 0.22, 0.14);
      core.noiseburst("lowpass", 600, 0.08, 0.07);
    }),
    /* the crack pre-beat before the deck breaks */
    crack: oneShot("crack", function () {
      core.noiseburst("highpass", 1800, 0.12, 0.12);
      core.thump(300, 180, 0.12, 0.1);
    }),
    click: oneShot("key", function () {
      core.thump(1900, 1500, 0.045, 0.02);
    }),
    /* report ceremony: a star stamps in */
    chime: oneShot("chime", function () {
      core.thump(1320, 1300, 0.08, 0.5);
      core.thump(2640, 2600, 0.03, 0.25);
    }, 0.8),
    /* the worksheet page turning to the next round */
    page: oneShot("page", function () {
      core.noiseburst("bandpass", 1400, 0.08, 0.25);
    }, 0.65),
    /* on a phone: someone else's claim just landed */
    ping: oneShot("ping", function () {
      core.thump(880, 870, 0.07, 0.1);
      core.thump(880, 870, 0.03, 0.09, 0.16);
    }),
    /* another phone's pillar falling: the street thuds underfoot */
    thud: oneShot("stamp", function () {
      core.thump(140, 55, 0.2, 0.16);
      core.noiseburst("lowpass", 300, 0.08, 0.12);
    }, 0.55),
    /* the work crew bolting: a light scuffle of feet on grit */
    patter: oneShot("debris", function () {
      core.noiseburst("highpass", 900, 0.06, 0.1);
      core.thump(210, 130, 0.1, 0.07, 0.04);
      core.thump(190, 115, 0.08, 0.07, 0.13);
      core.noiseburst("highpass", 800, 0.04, 0.09, 0.18);
    }, 0.5),
  };

  window.ZBFX = {
    reduced: stage.reduced,
    attach: stage.attach,
    setView: stage.setView,
    /* exposed for the FX-alignment spot test */
    toPx: stage.toPx,
    fxScale: stage.fxScale,
    debris: stage.debris,
    dust: stage.dust,
    dustRing: stage.dustRing,
    scraps: stage.scraps,
    hitStop: stage.hitStop,
    splatter: stage.splatter,
    starRain: stage.starRain,
    sparksAt: stage.sparksAt,
    sparking: stage.sparking,
    stats: stage.stats,
    shake: stage.shake,
    audio: audio,
    bgm: bgm,
    vibrate: stage.vibrate,
  };
})();
