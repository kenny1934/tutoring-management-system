/* Zero Blast sample kit generator.
 *
 * Renders the game's material one-shots with OfflineAudioContext in
 * headless Chromium (layered synthesis: noise bursts through body
 * resonances, convolution tails) and writes them as ONE mono 22.05kHz
 * 16-bit WAV audio sprite plus a Howler offset manifest:
 *
 *   public/games/zero-blast/audio/zb-sprite.wav
 *   public/games/zero-blast/audio/zb-sprite.js
 *
 * Everything is synthesised in-house — no recordings, no licensing.
 * Budget: the sprite must stay under 400 KB (no ffmpeg/opus on the
 * build box; re-encode to webm/opus if that ever changes).
 *
 * Run from webapp/frontend:  node scripts/zb-render-audio.mjs
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 22050;
const GAP_MS = 40; // silence between sprite slices so playback never bleeds
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "games", "zero-blast", "audio");

const browser = await chromium.launch();
const page = await browser.newPage();

/* All synthesis runs in the page so OfflineAudioContext is the real
 * engine the game itself would use. Each recipe returns Float32 PCM. */
const kit = await page.evaluate(async (SR) => {
  /* ---- shared building blocks ---- */
  const noiseBuf = (ctx, dur) => {
    const b = ctx.createBuffer(1, Math.ceil(dur * ctx.sampleRate), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };
  /* exponentially decaying noise = a small dead room's impulse response */
  const irBuf = (ctx, dur, curve) => {
    const b = ctx.createBuffer(1, Math.ceil(dur * ctx.sampleRate), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, curve);
    return b;
  };
  const envGain = (ctx, t0, peak, decay) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    return g;
  };
  /* filtered noise burst into dest */
  const burst = (ctx, dest, { t = 0, type = "lowpass", freq, freqTo, q = 1, peak, decay, dur }) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, (dur || decay) + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + decay);
    f.Q.value = q;
    src.connect(f).connect(envGain(ctx, t, peak, decay)).connect(dest);
    src.start(t);
  };
  /* pitched sine drop — the "thump" body of every impact */
  const thump = (ctx, dest, { t = 0, from, to, peak, decay }) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + decay);
    o.connect(envGain(ctx, t, peak, decay)).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.05);
  };
  /* material body: a short impulse ringing parallel resonant modes */
  const body = (ctx, dest, { t = 0, modes, peak, decay }) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 0.02);
    const g = envGain(ctx, t, peak, decay);
    modes.forEach(([freq, q]) => {
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq;
      f.Q.value = q;
      src.connect(f).connect(g);
    });
    g.connect(dest);
    src.start(t);
  };
  const damped = (ctx, dest, { t = 0, freq, peak, decay, detune = 0 }) => {
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(envGain(ctx, t, peak, decay)).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.05);
  };
  /* soft clip for punch on the big hits */
  const clipper = (ctx) => {
    const ws = ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 511.5) - 1;
      c[i] = Math.tanh(1.6 * x);
    }
    ws.curve = c;
    return ws;
  };
  /* render one recipe; wet = convolution tail mix (0 = bone dry) */
  const render = async (dur, wet, irDur, buildFn, clip) => {
    const ctx = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
    let out = ctx.destination;
    if (clip) {
      const ws = clipper(ctx);
      ws.connect(out);
      out = ws;
    }
    const dry = ctx.createGain();
    dry.connect(out);
    if (wet > 0) {
      const cv = ctx.createConvolver();
      cv.buffer = irBuf(ctx, irDur, 3);
      const wg = ctx.createGain();
      wg.gain.value = wet;
      dry.connect(cv).connect(wg).connect(out);
    }
    buildFn(ctx, dry);
    const buf = await ctx.startRendering();
    return Array.from(buf.getChannelData(0));
  };

  /* ---- the kit: name, duration, target peak, recipe ----
   * Materials: paper/felt (stamp, page), wood+stone (slam, knock),
   * brick (booms, rumble, debris), fuse (crack, fizzle), desk bits
   * (tick, key), report ceremony (chime, ping). */
  const recipes = {
    // rubber stamp pressed onto the worksheet: felt thud + paper snap
    stamp: [0.32, 0.8, () => render(0.32, 0.22, 0.12, (ctx, o) => {
      thump(ctx, o, { from: 170, to: 55, peak: 0.9, decay: 0.14 });
      burst(ctx, o, { type: "lowpass", freq: 600, peak: 0.5, decay: 0.07 });
      burst(ctx, o, { t: 0.004, type: "bandpass", freq: 1400, q: 2, peak: 0.16, decay: 0.02 });
    })],
    // the 拆 chop slam: click transient, deep drop, stone body, real tail
    slam: [0.6, 0.95, () => render(0.6, 0.35, 0.45, (ctx, o) => {
      burst(ctx, o, { type: "highpass", freq: 2500, peak: 0.55, decay: 0.014 });
      thump(ctx, o, { from: 120, to: 38, peak: 1.0, decay: 0.3 });
      body(ctx, o, { modes: [[85, 9], [132, 8], [204, 7]], peak: 0.8, decay: 0.26 });
      burst(ctx, o, { type: "lowpass", freq: 350, peak: 0.4, decay: 0.2 });
    }, true)],
    // the deck's crack pre-beat: splintering micro-bursts, mid knock
    crack: [0.32, 0.8, () => render(0.32, 0.2, 0.15, (ctx, o) => {
      let t = 0;
      for (let i = 0; i < 7; i++) {
        burst(ctx, o, { t, type: "highpass", freq: 1200 + Math.random() * 1400, peak: 0.5 * (1 - i / 9), decay: 0.02 + Math.random() * 0.02 });
        t += 0.008 + Math.random() * 0.022;
      }
      thump(ctx, o, { from: 300, to: 150, peak: 0.28, decay: 0.1 });
    })],
    // single pillar detonation
    boom_s: [0.65, 0.85, () => render(0.65, 0.25, 0.3, (ctx, o) => {
      thump(ctx, o, { from: 95, to: 34, peak: 1.0, decay: 0.38 });
      burst(ctx, o, { type: "lowpass", freq: 320, peak: 0.5, decay: 0.32 });
      body(ctx, o, { modes: [[110, 7], [190, 6]], peak: 0.4, decay: 0.2 });
    })],
    // double-root detonation: both pillars at once
    boom_l: [0.95, 0.95, () => render(0.95, 0.35, 0.5, (ctx, o) => {
      thump(ctx, o, { from: 110, to: 30, peak: 1.0, decay: 0.5 });
      thump(ctx, o, { t: 0.07, from: 90, to: 28, peak: 0.7, decay: 0.5 });
      burst(ctx, o, { type: "lowpass", freq: 250, peak: 0.55, decay: 0.45 });
      body(ctx, o, { modes: [[70, 8], [120, 7], [180, 6]], peak: 0.6, decay: 0.35 });
    }, true)],
    // the whole structure coming down: long low roll with slow wobble
    rumble: [1.6, 0.85, () => render(1.6, 0.4, 0.6, (ctx, o) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf(ctx, 1.65);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(160, 0);
      f.frequency.exponentialRampToValueAtTime(70, 1.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.linearRampToValueAtTime(1, 0.05);
      g.gain.setValueAtTime(1, 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, 1.55);
      const am = ctx.createOscillator();
      am.frequency.value = 4.2;
      const amG = ctx.createGain();
      amG.gain.value = 0.35;
      am.connect(amG).connect(g.gain);
      am.start(0);
      src.connect(f).connect(g).connect(o);
      src.start(0);
      thump(ctx, o, { from: 55, to: 32, peak: 0.5, decay: 0.9 });
    })],
    // brick patter after the fall: a hail of tiny knocks, thinning out
    debris: [0.8, 0.7, () => render(0.8, 0.15, 0.2, (ctx, o) => {
      for (let i = 0; i < 24; i++) {
        const t = 0.65 * Math.pow(Math.random(), 1.7);
        burst(ctx, o, { t, type: "bandpass", freq: 250 + Math.random() * 700, q: 4, peak: (0.35 + Math.random() * 0.4) * (1 - t / 0.9), decay: 0.02 + Math.random() * 0.035 });
      }
    })],
    // fuse out, structure survives: the hiss sputters and dies
    fizzle: [0.9, 0.6, () => render(0.9, 0, 0, (ctx, o) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf(ctx, 0.95);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(1500, 0);
      f.frequency.exponentialRampToValueAtTime(200, 0.85);
      f.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, 0);
      g.gain.exponentialRampToValueAtTime(0.0001, 0.85);
      // sputter: a jittery gate chews holes in the tail
      const gate = ctx.createGain();
      gate.gain.setValueAtTime(1, 0);
      for (let t = 0.25; t < 0.8; t += 0.04 + Math.random() * 0.05) {
        gate.gain.setValueAtTime(0.15 + Math.random() * 0.4, t);
        gate.gain.setValueAtTime(1, t + 0.02 + Math.random() * 0.02);
      }
      src.connect(f).connect(g).connect(gate).connect(o);
      src.start(0);
    })],
    // countdown tick: dry pencil tap on the desk
    tick: [0.07, 0.4, () => render(0.07, 0, 0, (ctx, o) => {
      damped(ctx, o, { freq: 1150, peak: 0.8, decay: 0.045 });
      burst(ctx, o, { type: "highpass", freq: 3000, peak: 0.2, decay: 0.008 });
    })],
    // keypad click: smaller and higher than the tick
    key: [0.05, 0.3, () => render(0.05, 0, 0, (ctx, o) => {
      damped(ctx, o, { freq: 1750, peak: 0.7, decay: 0.028 });
      burst(ctx, o, { type: "highpass", freq: 4000, peak: 0.15, decay: 0.006 });
    })],
    // wrong code: a dull double knock, deliberately nothing like a boom
    knock: [0.28, 0.8, () => render(0.28, 0, 0, (ctx, o) => {
      thump(ctx, o, { from: 150, to: 65, peak: 1.0, decay: 0.14 });
      thump(ctx, o, { t: 0.09, from: 130, to: 60, peak: 0.6, decay: 0.13 });
      burst(ctx, o, { type: "lowpass", freq: 500, peak: 0.3, decay: 0.09 });
      body(ctx, o, { modes: [[240, 6], [420, 5]], peak: 0.35, decay: 0.1 });
    })],
    // report star: one small glockenspiel strike (bell partials)
    chime: [0.7, 0.55, () => render(0.7, 0.2, 0.3, (ctx, o) => {
      damped(ctx, o, { freq: 1318.5, peak: 0.8, decay: 0.5 });
      damped(ctx, o, { freq: 1318.5, peak: 0.35, decay: 0.4, detune: 8 });
      damped(ctx, o, { freq: 1318.5 * 2.76, peak: 0.3, decay: 0.22 });
      damped(ctx, o, { freq: 1318.5 * 5.4, peak: 0.12, decay: 0.1 });
      burst(ctx, o, { type: "highpass", freq: 5000, peak: 0.1, decay: 0.01 });
    })],
    // worksheet page turn: shaped paper slide with a corner flick
    page: [0.35, 0.5, () => render(0.35, 0, 0, (ctx, o) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf(ctx, 0.4);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(700, 0);
      f.frequency.exponentialRampToValueAtTime(2600, 0.24);
      f.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.linearRampToValueAtTime(0.9, 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, 0.3);
      src.connect(f).connect(g).connect(o);
      src.start(0);
      burst(ctx, o, { t: 0.22, type: "highpass", freq: 3000, peak: 0.3, decay: 0.02 });
    })],
    // another phone's claim landing: a quiet sonar blip with two echoes
    ping: [0.55, 0.5, () => render(0.55, 0.15, 0.25, (ctx, o) => {
      damped(ctx, o, { freq: 880, peak: 0.8, decay: 0.09 });
      damped(ctx, o, { t: 0.16, freq: 880, peak: 0.32, decay: 0.08 });
      damped(ctx, o, { t: 0.32, freq: 880, peak: 0.13, decay: 0.07 });
    })],
  };

  const out = {};
  for (const name of Object.keys(recipes)) {
    const [dur, peak, make] = recipes[name];
    out[name] = { dur, peak, pcm: await make() };
  }
  return out;
}, SR);

await browser.close();

/* ---- normalise, splice, encode ---- */
const names = Object.keys(kit);
const gap = Math.round((GAP_MS / 1000) * SR);
let total = 0;
for (const n of names) total += kit[n].pcm.length + gap;

const all = new Float32Array(total);
const sprite = {};
let off = 0;
for (const n of names) {
  const { pcm, peak, dur } = kit[n];
  let max = 0;
  for (const v of pcm) max = Math.max(max, Math.abs(v));
  const k = max > 0 ? peak / max : 0;
  const fade = Math.min(Math.round(0.01 * SR), pcm.length); // declick tail
  for (let i = 0; i < pcm.length; i++) {
    const f = i > pcm.length - fade ? (pcm.length - i) / fade : 1;
    all[off + i] = pcm[i] * k * f;
  }
  sprite[n] = [Math.round((off / SR) * 1000), Math.round(dur * 1000)];
  off += pcm.length + gap;
}

const pcm16 = new Int16Array(all.length);
for (let i = 0; i < all.length; i++) {
  pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(all[i] * 32767)));
}
const dataBytes = pcm16.length * 2;
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + dataBytes, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);  // PCM
header.writeUInt16LE(1, 22);  // mono
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(dataBytes, 40);
const wav = Buffer.concat([header, Buffer.from(pcm16.buffer)]);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "zb-sprite.wav"), wav);
writeFileSync(join(OUT_DIR, "zb-sprite.js"),
  "/* generated by scripts/zb-render-audio.mjs — do not hand-edit.\n" +
  " * Self-produced synthesis, no third-party recordings (see\n" +
  " * shared/vendor/NOTICE). Offsets in ms for the Howler sprite. */\n" +
  "window.ZB_SPRITE = {\n" +
  '  src: "audio/zb-sprite.wav",\n' +
  "  sprite: " + JSON.stringify(sprite, null, 2).replace(/\n/g, "\n  ") + ",\n" +
  "};\n");

const kb = (wav.length / 1024).toFixed(1);
console.log(`zb-sprite.wav ${kb} KB (${(off / SR).toFixed(2)}s) — budget 400 KB ${wav.length <= 400 * 1024 ? "OK" : "OVER!"}`);
for (const n of names) {
  const s = kit[n];
  let max = 0, rms = 0;
  for (const v of s.pcm) { max = Math.max(max, Math.abs(v)); rms += v * v; }
  console.log(`  ${n.padEnd(7)} ${s.dur.toFixed(2)}s  sprite@${String(sprite[n][0]).padStart(5)}ms  peak(raw) ${max.toFixed(3)}  rms(raw) ${Math.sqrt(rms / s.pcm.length).toFixed(4)}`);
}
