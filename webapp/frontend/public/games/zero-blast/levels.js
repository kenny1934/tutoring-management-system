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

  /* ≈14 buildings / ≈24 codes; max fuse ≈ 8.75 min. Kinds 7-8 are the
   * scripted gates (§19 Batch AA/AB): the general-form gate x²+5x+6=2,
   * then the factored-but-nonzero trap (x−6)(x+4)=39 - the true finale,
   * the lesson's last proof that only "= 0" lets you read a factor off. */
  var DEFAULT_PLAN = [
    { kind: 1, rounds: 1, fuseMs: 20000 },
    { kind: 2, rounds: 2, fuseMs: 20000 },
    { kind: 3, rounds: 2, fuseMs: 35000 },
    { kind: 4, rounds: 2, fuseMs: 35000 },
    { kind: 5, rounds: 2, fuseMs: 35000 },
    { kind: 6, rounds: 3, fuseMs: 45000 },
    { kind: 7, rounds: 1, fuseMs: 60000 },
    { kind: 8, rounds: 1, fuseMs: 60000 },
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

  /* (x − a) for root a: root 3 → "(x−3)", root −2 → "(x+2)".
   * Root 0 is the naked factor x, not "(x)": a bare x reads as a factor
   * whose zero is x = 0, and the brackets only ever framed a subtraction
   * that isn't there (the arc's x(x−7) bridge is its one caller). */
  function factorText(root) {
    if (root === 0) return "x";
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
   *
   * negOk gates negative roots on kinds 2/3/5: genPlan only allows
   * them once a sign-trap stage (kind 4) has come and gone. Before
   * this, hard rounds ambushed 100% of runs with an unexplained
   * x = −a one or two buildings before the level that teaches it -
   * and the old both-negative kind-3 roll made 3-2 a DOUBLE sign
   * flip, harder than the single-flip trap it precedes. Omitted
   * (direct gen() calls, mixed streets) it defaults to true.
   */
  function gen(n, rand, hard, negOk) {
    var mayFlip = negOk === undefined || negOk;
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
        var a = pick(rand, 2, 9) * (hard && mayFlip && rand() < 0.5 ? -1 : 1);
        return {
          n: 2,
          kind: "linear",
          expr: factorText(a) + " = 0",
          pillars: [{ id: "p1", root: a, label: factorText(a) }],
        };
      }
      case 3: {
        // (x − a)(x − b) = 0, distinct roots; easy both positive, hard
        // flips each sign independently (~half carry a negative)
        var roll = function () {
          return pick(rand, 1, 9) * (hard && mayFlip && rand() < 0.5 ? -1 : 1);
        };
        var r1 = roll();
        var r2 = roll();
        while (r2 === r1) r2 = roll();
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
        var r = hard
          ? (mayFlip ? -1 : 1) * pick(rand, 2, 9)
          : pick(rand, 1, 9) * (mayFlip && rand() < 0.35 ? -1 : 1);
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
      case 7: {
        // x² + bx + c = k - NOT in general form (§19 Batch AA): move
        // the k over FIRST, then factorise. Scripted, not rolled: the
        // SM901 lesson quotes this exact question as its bridge into
        // 一般式. The displayed LHS factors cleanly as (x+2)(x+3), so
        // the confident wrong answers −2/−3 exist (the UI catches them
        // with a bespoke nudge); the true roots come from x²+5x+4=0.
        return {
          n: 7,
          kind: "offset",
          b: 5,
          c: 6,
          k: 2,
          expr: quadText(5, 6) + " = 2",
          pillars: [
            { id: "p1", root: -1, label: "?", hidden: factorText(-1) },
            { id: "p2", root: -4, label: "?", hidden: factorText(-4) },
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
      case 8: {
        // (x−6)(x+4) = 39 — factored, but the right side is NOT 0 (§19
        // Batch AB). The shown brackets tempt a read-off (x = 6, x = −4)
        // that lands ONE bracket on 0, and 0 × 10 = 0, not 39. The move
        // is to expand, carry the 39 over, and factorise the general
        // form: x² − 2x − 63 = 0 → (x−9)(x+7) = 0, x = 9 or −7. Scripted,
        // the last building: the final proof that only "= 0" reads a
        // factor off. da/db are the DISPLAYED brackets' roots (the
        // traps); b/c are that product expanded (x² − 2x − 24); the true
        // roots hide on the pillars.
        var da = 6, db = -4; // the brackets on the board
        return {
          n: 8,
          kind: "product",
          da: da,
          db: db,
          b: -(da + db), // their product expanded: x² − 2x − 24
          c: da * db,
          k: 39,
          expr: factorText(da) + factorText(db) + " = " + num(39),
          pillars: [
            { id: "p1", root: 9, label: "?", hidden: factorText(9) },
            { id: "p2", root: -7, label: "?", hidden: factorText(-7) },
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
      // the mixed street slots in BEFORE the scripted gates: those stay
      // the lesson's closing beats, and the last of them pays double as
      // the finale
      var gateAt = plan.length;
      for (var gi = 0; gi < plan.length; gi++) {
        if (SCRIPTED_KINDS.indexOf(plan[gi].kind) !== -1) { gateAt = gi; break; }
      }
      plan.splice(gateAt, 0, { kind: MIX_STAGE.kind, rounds: MIX_STAGE.rounds, fuseMs: MIX_STAGE.fuseMs });
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

  /* kind 5 sits out the mixed street: its one-tap double-hit was the
   * finale's biggest payout for the least work (up to 8 normal answers
   * for a single read-off) */
  var MIX_KINDS = [3, 4, 6];

  /* the gates are scripted, not rolled: fixed numbers chosen to teach
   * the general-form move, and they close the lesson. Anything inserted
   * into the plan goes in front of them. */
  var SCRIPTED_KINDS = [7, 8];

  /* roll every building of a plan; round 2+ (and every mixed-street
   * building) uses the hard generator. The last stage is the finale
   * street: the UI dresses it up and doubles every payout there.
   * Negative roots unlock only after a sign-trap stage (kind 4) has
   * finished - see gen()'s negOk. */
  function genPlan(plan, rand) {
    var total = 0;
    plan.forEach(function (s) { total += s.rounds; });
    var levels = [];
    var seq = 0;
    plan.forEach(function (s, si) {
      var taughtSign = plan.slice(0, si).some(function (p) {
        return p.kind === 4 || p.kind === "mix";
      });
      for (var r = 1; r <= s.rounds; r++) {
        var mixed = s.kind === "mix";
        var kind = mixed ? MIX_KINDS[Math.floor(rand() * MIX_KINDS.length)] : s.kind;
        var hard = mixed || r > 1;
        var lv = gen(kind, rand, hard, taughtSign || mixed || kind === 4);
        seq += 1;
        lv.fuseMs = s.fuseMs;
        lv.stage = si + 1;
        lv.stageKind = s.kind; // a kind number, or "mix"
        lv.round = r;
        lv.roundsInStage = s.rounds;
        lv.seq = seq;
        lv.total = total;
        lv.hard = hard;
        lv.finale = si === plan.length - 1;
        levels.push(lv);
      }
    });
    return levels;
  }

  /* ---------- scoring ---------- */

  /* One correct submission's points. Base pays speed (up to double),
   * the streak multiplier pays consistency (up to double again), and
   * echoFactor scales an after-the-claim echo solve (e.g. 0.4).
   * streak = the solver's streak BEFORE this answer.
   * A double hit (kind 5's one code, both pillars) pays 1.5x, not 2x:
   * linear-in-hits made the game's least effortful tap its biggest
   * payout (finale (x−a)² was worth ~8 normal answers). */
  function points(remainFrac, hits, streak, echoFactor) {
    var f = Math.max(0, Math.min(1, remainFrac || 0));
    var base = (100 + Math.round(100 * f)) * (1 + 0.5 * ((hits || 1) - 1));
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

  /* |product| at x = v — the "strength" the structure holds with.
   * The gate measures |LHS − RHS|: only the general form's zero counts. */
  function strength(level, v) {
    if (level.kind === "numeric") return Math.abs(level.konst * v);
    // both gates measure |LHS − RHS|, so only a true root of the general
    // form reads as zero. The product gate's shown brackets ARE b and c
    // expanded ((v−da)(v−db) ≡ v² + bv + c), so one line covers it.
    if (level.kind === "offset" || level.kind === "product")
      return Math.abs(v * v + level.b * v + level.c - level.k);
    if (level.kind === "expanded") return Math.abs(v * v + level.b * v + level.c);
    return Math.abs(
      level.pillars.reduce(function (acc, p) {
        return acc * (v - p.root);
      }, 1)
    );
  }

  /* L6/L7/L8: the equation is written out in full, so each pillar keeps
   * its factor hidden on the plaque until the level resolves. The board
   * and the factorisation line ask this; the reveal asks the pillar. */
  function hidesFactors(level) {
    return level.kind === "expanded" || level.kind === "offset" || level.kind === "product";
  }

  /* the general form the gates must reach: x² + bx + (c − k) = 0. L6 is
   * already there, so its k is nothing. The graph sketch, the trap nudge,
   * the working chain and the factorisation plaque all read this ONE
   * line - four independent copies of c − k used to agree by luck. */
  function generalForm(level) {
    return quadText(level.b, level.c - (level.k || 0));
  }

  /* a confidently-wrong gate answer: the guess zeroes the DISPLAYED left
   * side while the general form is still off zero. Both gates show the
   * same quadratic (the product gate's brackets ARE b and c expanded),
   * so one test covers them. Returns the RHS to name, or null. */
  function trapAnswer(level, v) {
    if (level.kind !== "offset" && level.kind !== "product") return null;
    return v * v + level.b * v + level.c === 0 ? { k: level.k } : null;
  }

  /* ---------- worked reasons (arrays of margin-note lines) ---------- */

  /* the substituted pair, evaluated: (v−f1)(v−f2) = m × n = tail. The
   * lesson's core notation, so its spacing lives in one place. */
  function subLine(f1, f2, v, tail) {
    return factorSub(f1, v) + factorSub(f2, v) +
      " = " + numSub(v - f1) + " " + TIMES + " " + numSub(v - f2) +
      " = " + tail;
  }

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
        return [subLine(f1, f2, v, num((v - f1) * (v - f2)))];
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
      case "offset": {
        // the substitution names both sides: the trap answer lands the
        // LHS on 0 and the "≠ k" IS the lesson (the UI adds the nudge)
        var valO = v * v + level.b * v + level.c;
        var termsO = [numSub(v) + "²"];
        if (level.b !== 0)
          termsO.push((level.b > 0 ? "+ " : MINUS + " ") + Math.abs(level.b) + TIMES + numSub(v));
        if (level.c !== 0)
          termsO.push((level.c > 0 ? "+ " : MINUS + " ") + Math.abs(level.c));
        return [termsO.join(" ") + " = " + num(valO) + " ≠ " + num(level.k)];
      }
      case "product": {
        // the shown brackets substituted: a read-off zeroes one and the
        // product is 0, not 39, so "≠ k" IS the lesson (UI adds the nudge)
        var pv = (v - level.da) * (v - level.db);
        return [subLine(level.da, level.db, v, num(pv) + " ≠ " + num(level.k))];
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
        return [subLine(f1, f2, v, "0")];
      }
      case "expanded": {
        var f1e = level.pillars[0].root;
        var f2e = level.pillars[1].root;
        return [
          quadText(level.b, level.c) + " = " + factorText(f1e) + factorText(f2e),
          subLine(f1e, f2e, v, "0"),
        ];
      }
      case "offset":
      case "product": {
        // the whole chain: reach the general form, factorise, substitute -
        // the general-form move made visible (§19 Batch AA). The product
        // gate starts one step earlier, from the brackets it shows: they
        // multiply out to the same quadratic (§19 Batch AB).
        var f1g = level.pillars[0].root;
        var f2g = level.pillars[1].root;
        var gen = generalForm(level);
        var shown = quadText(level.b, level.c) + " = " + num(level.k);
        return [
          (level.kind === "product"
            ? factorText(level.da) + factorText(level.db) + " = " + num(level.k) + "  ⟹  " + shown
            : shown) + "  ⟹  " + gen + " = 0",
          gen + " = " + factorText(f1g) + factorText(f2g),
          subLine(f1g, f2g, v, "0"),
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

  /* L6/L7/L8: the factorised identity, shown when the level resolves.
   * The gates factorise their GENERAL form - the moved-over c − k. */
  function factorisation(level) {
    if (!hidesFactors(level)) return null;
    return (
      generalForm(level) +
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
    hidesFactors: hidesFactors,
    generalForm: generalForm,
    trapAnswer: trapAnswer,
    num: num,
    factorText: factorText,
    factorSub: factorSub,
    quadText: quadText,
  };

  if (typeof window !== "undefined") window.ZBLevels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
