/* 歸零爆破 Zero Blast — level generators + judging
 *
 * Pure functions only: no DOM, no timers, no GameBridge. The UI layer
 * (index.html) owns state and rendering; the host owns judging in
 * multi-device mode. Everything here is deterministic given a rand()
 * source, so tests (and a shared class seed) can reproduce levels.
 *
 * Maths formatting returns language-neutral strings (proper U+2212
 * minus and U+00D7 times); localized phrases are wrapped around them
 * by the caller.
 */
(function () {
  "use strict";

  var MINUS = "−";
  var TIMES = "×";

  var LEVEL_COUNT = 6;

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

  /* Level object shape:
   * { n, kind, fuseMs, expr, pillars: [{id, root, label, hidden?}], konst?, b?, c? }
   * kind: numeric | linear | two | sign | square | expanded
   */
  function gen(n, rand) {
    switch (n) {
      case 1: {
        // k × ▢ = 0 — any factor being 0 kills a product
        var k = pick(rand, 2, 9);
        return {
          n: 1,
          kind: "numeric",
          fuseMs: 30000,
          konst: k,
          expr: k + " " + TIMES + " ▢ = 0",
          pillars: [{ id: "p1", root: 0, label: "▢" }],
        };
      }
      case 2: {
        // (x − a) = 0 — one factor, one code
        var a = pick(rand, 2, 9);
        return {
          n: 2,
          kind: "linear",
          fuseMs: 30000,
          expr: factorText(a) + " = 0",
          pillars: [{ id: "p1", root: a, label: factorText(a) }],
        };
      }
      case 3: {
        // (x − a)(x − b) = 0, distinct positive roots
        var r1 = pick(rand, 1, 9);
        var r2 = pick(rand, 1, 9);
        while (r2 === r1) r2 = pick(rand, 1, 9);
        return {
          n: 3,
          kind: "two",
          fuseMs: 45000,
          expr: factorText(r1) + factorText(r2) + " = 0",
          pillars: [
            { id: "p1", root: r1, label: factorText(r1) },
            { id: "p2", root: r2, label: factorText(r2) },
          ],
        };
      }
      case 4: {
        // (x + a)(x − b) = 0 — the sign trap: x = −a, not a
        var p = pick(rand, 1, 9);
        var q = pick(rand, 1, 9);
        var roots = rand() < 0.5 ? [-p, q] : [q, -p];
        return {
          n: 4,
          kind: "sign",
          fuseMs: 45000,
          expr: factorText(roots[0]) + factorText(roots[1]) + " = 0",
          pillars: [
            { id: "p1", root: roots[0], label: factorText(roots[0]) },
            { id: "p2", root: roots[1], label: factorText(roots[1]) },
          ],
        };
      }
      case 5: {
        // (x − a)² = 0 — double root: ONE code, BOTH pillars
        var r = pick(rand, 1, 9) * (rand() < 0.35 ? -1 : 1);
        return {
          n: 5,
          kind: "square",
          fuseMs: 45000,
          expr: factorText(r) + "² = 0",
          pillars: [
            { id: "p1", root: r, label: factorText(r) },
            { id: "p2", root: r, label: factorText(r) },
          ],
        };
      }
      case 6: {
        // x² + bx + c = 0 with a nice factorisation — factorise first
        // roots within ±6 keep b, c inside the times tables students know
        var s1 = pick(rand, 1, 6) * (rand() < 0.4 ? -1 : 1);
        var s2 = pick(rand, 1, 6) * (rand() < 0.4 ? -1 : 1);
        while (s2 === s1) s2 = pick(rand, 1, 6) * (rand() < 0.4 ? -1 : 1);
        var b = -(s1 + s2);
        var c = s1 * s2;
        return {
          n: 6,
          kind: "expanded",
          fuseMs: 45000,
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

  function genAll(rand) {
    var levels = [];
    for (var i = 1; i <= LEVEL_COUNT; i++) levels.push(gen(i, rand));
    return levels;
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
    LEVEL_COUNT: LEVEL_COUNT,
    rng: rng,
    gen: gen,
    genAll: genAll,
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
