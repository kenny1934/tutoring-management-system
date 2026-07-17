/* 歸零爆破 Zero Blast — level generators + judging
 *
 * Pure functions only: no DOM, no timers, no GameBridge. The UI layer
 * (index.html) owns state and rendering; the host owns judging in
 * multi-device mode. Everything here is deterministic given a rand()
 * source, so tests (and a shared class seed) can reproduce levels.
 *
 * A run is a demolition PLAN: stages (one equation kind each) times
 * rounds (buildings). Rounds after the first roll harder numbers.
 *
 * Maths formatting returns language-neutral strings (proper U+2212
 * minus and U+00D7 times); localized phrases are wrapped around them
 * by the caller.
 */
(function () {
  "use strict";

  var MINUS = "−";
  var TIMES = "×";

  /* ≈12 buildings / ≈20 codes; max fuse ≈ 6.75 min */
  var DEFAULT_PLAN = [
    { kind: 1, rounds: 1, fuseMs: 20000 },
    { kind: 2, rounds: 2, fuseMs: 20000 },
    { kind: 3, rounds: 2, fuseMs: 35000 },
    { kind: 4, rounds: 2, fuseMs: 35000 },
    { kind: 5, rounds: 2, fuseMs: 35000 },
    { kind: 6, rounds: 3, fuseMs: 45000 },
  ];
  var MIX_STAGE = { kind: "mix", rounds: 3, fuseMs: 40000 };

  /* mulberry32 — tiny seedable PRNG, good enough for level rolls */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rand, lo, hi) {
    return lo + Math.floor(rand() * (hi - lo + 1));
  }

  /* ---------- formatting ---------- */

  function num(v) {
    return v < 0 ? MINUS + Math.abs(v) : String(v);
  }

  /* a number substituted into an expression: negatives get brackets
   * where they would otherwise collide with an operator */
  function numSub(v) {
    return v < 0 ? "(" + MINUS + Math.abs(v) + ")" : String(v);
  }

  /* (x − a) for root a: root 3 → "(x−3)", root −2 → "(x+2)" */
  function factorText(root) {
    if (root === 0) return "(x)";
    return root > 0 ? "(x" + MINUS + root + ")" : "(x+" + Math.abs(root) + ")";
  }

  /* the factor with v substituted, unevaluated: root 3, v −5 → "(−5−3)" */
  function factorSub(root, v) {
    if (root === 0) return "(" + num(v) + ")";
    return root > 0
      ? "(" + num(v) + MINUS + root + ")"
      : "(" + num(v) + "+" + Math.abs(root) + ")";
  }

  /* x² + bx + c with tidy signs: b −5, c 6 → "x² − 5x + 6" */
  function quadText(b, c) {
    var s = "x²";
    if (b !== 0) {
      s += b > 0 ? " + " : " " + MINUS + " ";
      s += (Math.abs(b) === 1 ? "" : Math.abs(b)) + "x";
    }
    if (c !== 0) {
      s += c > 0 ? " + " + c : " " + MINUS + " " + Math.abs(c);
    }
    return s;
  }

  /* ---------- generation ---------- */

  /* Level object shape (fuseMs / stage / round / seq set by genPlan):
   * { n, kind, expr, pillars: [{id, root, label, hidden?}], konst?, b?, c? }
   * kind: numeric | linear | two | sign | square | expanded
   *
   * hard = later rounds in a stage: wider numbers and mixed signs, but
   * every root stays within −9..9 (one keypad digit) and a stays 1
   * (the SM901 courseware scope).
   */
  function gen(n, rand, hard) {
    switch (n) {
      case 1: {
        // k × ▢ = 0 — any factor being 0 kills a product
        var k = hard ? pick(rand, 6, 12) : pick(rand, 2, 9);
        return {
          n: 1,
          kind: "numeric",
          konst: k,
          expr: k + " " + TIMES + " ▢ = 0",
          pillars: [{ id: "p1", root: 0, label: "▢" }],
        };
      }
      case 2: {
        // (x − a) = 0 — one factor, one code; hard may flip the sign
        var a = pick(rand, 2, 9) * (hard && rand() < 0.5 ? -1 : 1);
        return {
          n: 2,
          kind: "linear",
          expr: factorText(a) + " = 0",
          pillars: [{ id: "p1", root: a, label: factorText(a) }],
        };
      }
      case 3: {
        // (x − a)(x − b) = 0, distinct roots; easy positive, hard negative
        var sgn = hard ? -1 : 1;
        var r1 = sgn * pick(rand, 1, 9);
        var r2 = sgn * pick(rand, 1, 9);
        while (r2 === r1) r2 = sgn * pick(rand, 1, 9);
        return {
          n: 3,
          kind: "two",
          expr: factorText(r1) + factorText(r2) + " = 0",
          pillars: [
            { id: "p1", root: r1, label: factorText(r1) },
            { id: "p2", root: r2, label: factorText(r2) },
          ],
        };
      }
      case 4: {
        // (x + a)(x − b) = 0 — the sign trap: x = −a, not a
        var lo = hard ? 4 : 1;
        var p = pick(rand, lo, 9);
        var q = pick(rand, lo, 9);
        var roots = rand() < 0.5 ? [-p, q] : [q, -p];
        return {
          n: 4,
          kind: "sign",
          expr: factorText(roots[0]) + factorText(roots[1]) + " = 0",
          pillars: [
            { id: "p1", root: roots[0], label: factorText(roots[0]) },
            { id: "p2", root: roots[1], label: factorText(roots[1]) },
          ],
        };
      }
      case 5: {
        // (x − a)² = 0 — double root: ONE code, BOTH pillars
        var r = hard ? -pick(rand, 2, 9) : pick(rand, 1, 9) * (rand() < 0.35 ? -1 : 1);
        return {
          n: 5,
          kind: "square",
          expr: factorText(r) + "² = 0",
          pillars: [
            { id: "p1", root: r, label: factorText(r) },
            { id: "p2", root: r, label: factorText(r) },
          ],
        };
      }
      case 6: {
        // x² + bx + c = 0 with a nice factorisation — factorise first.
        // Easy: roots within ±6 keep b, c inside familiar times tables.
        // Hard: same-sign roots 4..9, so |c| is large and the factor
        // search is a genuine hunt (c stays positive, sign of b decides).
        var s1, s2;
        if (hard) {
          var sg = rand() < 0.5 ? -1 : 1;
          s1 = sg * pick(rand, 4, 9);
          s2 = sg * pick(rand, 4, 9);
          while (s2 === s1) s2 = sg * pick(rand, 4, 9);
        } else {
          s1 = pick(rand, 1, 6) * (rand() < 0.4 ? -1 : 1);
          s2 = pick(rand, 1, 6) * (rand() < 0.4 ? -1 : 1);
          while (s2 === s1) s2 = pick(rand, 1, 6) * (rand() < 0.4 ? -1 : 1);
        }
        var b = -(s1 + s2);
        var c = s1 * s2;
        return {
          n: 6,
          kind: "expanded",
          b: b,
          c: c,
          expr: quadText(b, c) + " = 0",
          pillars: [
            { id: "p1", root: s1, label: "?", hidden: factorText(s1) },
            { id: "p2", root: s2, label: "?", hidden: factorText(s2) },
          ],
        };
      }
    }
    throw new Error("no such level: " + n);
  }

  /* ---------- plans ---------- */

  /* cfg: { diff: "easy"|"std"|"hard", levels: [kinds], rounds: [ints],
   *        fuse: multiplier } → [{kind, rounds, fuseMs}]
   * Preset first, then explicit levels/rounds/fuse override it. */
  function planFromConfig(cfg) {
    cfg = cfg || {};
    var plan = DEFAULT_PLAN.map(function (s) {
      return { kind: s.kind, rounds: s.rounds, fuseMs: s.fuseMs };
    });
    var fuseMult = cfg.fuse > 0 ? cfg.fuse : 1;
    if (cfg.diff === "easy") {
      plan.forEach(function (s) { s.rounds = 1; });
      fuseMult *= 1.25;
    } else if (cfg.diff === "hard") {
      plan.push({ kind: MIX_STAGE.kind, rounds: MIX_STAGE.rounds, fuseMs: MIX_STAGE.fuseMs });
    }
    if (cfg.levels && cfg.levels.length) {
      plan = cfg.levels.map(function (k) {
        var src = plan.filter(function (s) { return s.kind === k; })[0];
        return src ? { kind: src.kind, rounds: src.rounds, fuseMs: src.fuseMs } : null;
      }).filter(Boolean);
    }
    if (cfg.rounds && cfg.rounds.length) {
      plan.forEach(function (s, i) {
        var r = cfg.rounds.length === 1 ? cfg.rounds[0] : cfg.rounds[i];
        if (r > 0) s.rounds = Math.min(9, Math.round(r));
      });
    }
    plan.forEach(function (s) { s.fuseMs = Math.round(s.fuseMs * fuseMult); });
    return plan;
  }

  /* roll every building of a plan; round 2+ (and every mixed-street
   * building) uses the hard generator */
  function genPlan(plan, rand) {
    var total = 0;
    plan.forEach(function (s) { total += s.rounds; });
    var levels = [];
    var seq = 0;
    plan.forEach(function (s, si) {
      for (var r = 1; r <= s.rounds; r++) {
        var mixed = s.kind === "mix";
        var kind = mixed ? pick(rand, 3, 6) : s.kind;
        var hard = mixed || r > 1;
        var lv = gen(kind, rand, hard);
        seq += 1;
        lv.fuseMs = s.fuseMs;
        lv.stage = si + 1;
        lv.stageKind = s.kind; // a kind number, or "mix"
        lv.round = r;
        lv.roundsInStage = s.rounds;
        lv.seq = seq;
        lv.total = total;
        lv.hard = hard;
        levels.push(lv);
      }
    });
    return levels;
  }

  /* ---------- scoring ---------- */

  /* One correct submission's points. Base pays speed (up to double),
   * the streak multiplier pays consistency (up to double again), and
   * echoFactor scales an after-the-claim echo solve (e.g. 0.4).
   * streak = the solver's streak BEFORE this answer. */
  function points(remainFrac, hits, streak, echoFactor) {
    var f = Math.max(0, Math.min(1, remainFrac || 0));
    var base = (100 + Math.round(100 * f)) * (hits || 1);
    var mult = 1 + 0.1 * Math.min(streak || 0, 10);
    return Math.round(base * mult * (echoFactor == null ? 1 : echoFactor));
  }

  /* ---------- judging ---------- */

  /* Which pillars does code v take down, given what is already claimed?
   * correct   — v is a root with at least one unclaimed pillar
   * already   — v is a root but its pillars are all claimed (harmless
   *             double-submit, per conventions: no penalty)
   * hit       — pillar ids v takes down (both, for a double root)
   */
  function judge(level, v, claimedIds) {
    var claimed = claimedIds || [];
    var matching = level.pillars.filter(function (p) {
      return p.root === v;
    });
    var hit = matching
      .filter(function (p) {
        return claimed.indexOf(p.id) === -1;
      })
      .map(function (p) {
        return p.id;
      });
    return {
      correct: hit.length > 0,
      already: matching.length > 0 && hit.length === 0,
      hit: hit,
    };
  }

  /* |product| at x = v — the "strength" the structure holds with */
  function strength(level, v) {
    if (level.kind === "numeric") return Math.abs(level.konst * v);
    if (level.kind === "expanded") return Math.abs(v * v + level.b * v + level.c);
    return Math.abs(
      level.pillars.reduce(function (acc, p) {
        return acc * (v - p.root);
      }, 1)
    );
  }

  /* ---------- worked reasons (arrays of margin-note lines) ---------- */

  /* wrong code v: show the substitution evaluated, product visibly ≠ 0 */
  function workingWrong(level, v) {
    switch (level.kind) {
      case "numeric":
        return [level.konst + " " + TIMES + " " + numSub(v) + " = " + num(level.konst * v)];
      case "linear": {
        var root = level.pillars[0].root;
        return [factorSub(root, v) + " = " + num(v - root)];
      }
      case "two":
      case "sign":
      case "square": {
        var f1 = level.pillars[0].root;
        var f2 = level.pillars[1].root;
        return [
          factorSub(f1, v) + factorSub(f2, v) +
            " = " + numSub(v - f1) + " " + TIMES + " " + numSub(v - f2) +
            " = " + num((v - f1) * (v - f2)),
        ];
      }
      case "expanded": {
        var val = v * v + level.b * v + level.c;
        var terms = [numSub(v) + "²"];
        if (level.b !== 0)
          terms.push((level.b > 0 ? "+ " : MINUS + " ") + Math.abs(level.b) + TIMES + numSub(v));
        if (level.c !== 0)
          terms.push((level.c > 0 ? "+ " : MINUS + " ") + Math.abs(level.c));
        return [terms.join(" ") + " = " + num(val)];
      }
    }
    return [];
  }

  /* correct code v: show the product hitting zero (the whole point) */
  function workingHit(level, v) {
    switch (level.kind) {
      case "numeric":
        return [level.konst + " " + TIMES + " 0 = 0"];
      case "linear": {
        var root = level.pillars[0].root;
        return [factorSub(root, v) + " = 0"];
      }
      case "two":
      case "sign":
      case "square": {
        var f1 = level.pillars[0].root;
        var f2 = level.pillars[1].root;
        return [
          factorSub(f1, v) + factorSub(f2, v) +
            " = " + numSub(v - f1) + " " + TIMES + " " + numSub(v - f2) +
            " = 0",
        ];
      }
      case "expanded": {
        var f1e = level.pillars[0].root;
        var f2e = level.pillars[1].root;
        return [
          quadText(level.b, level.c) + " = " + factorText(f1e) + factorText(f2e),
          factorSub(f1e, v) + factorSub(f2e, v) +
            " = " + numSub(v - f1e) + " " + TIMES + " " + numSub(v - f2e) +
            " = 0",
        ];
      }
    }
    return [];
  }

  /* distinct roots, sorted — for the fuse-out reveal and the takeaway */
  function roots(level) {
    var seen = [];
    level.pillars.forEach(function (p) {
      if (seen.indexOf(p.root) === -1) seen.push(p.root);
    });
    return seen.sort(function (a, b) {
      return a - b;
    });
  }

  /* L6 only: the factorised identity, shown when the level resolves */
  function factorisation(level) {
    if (level.kind !== "expanded") return null;
    return (
      quadText(level.b, level.c) +
      " = " +
      factorText(level.pillars[0].root) +
      factorText(level.pillars[1].root)
    );
  }

  var api = {
    DEFAULT_PLAN: DEFAULT_PLAN,
    rng: rng,
    gen: gen,
    planFromConfig: planFromConfig,
    genPlan: genPlan,
    points: points,
    judge: judge,
    strength: strength,
    workingWrong: workingWrong,
    workingHit: workingHit,
    roots: roots,
    factorisation: factorisation,
    num: num,
    factorText: factorText,
  };

  if (typeof window !== "undefined") window.ZBLevels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
