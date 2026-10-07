/**
 * The arithmetic behind the sign-in board's checks: reading each side of a
 * line with the Draft's own reader, finding where an equation holds, and
 * saying whether an inequality holds at a point.
 *
 * The solutions are found numerically, the way the Draft finds the key points
 * of a graph, because the reader gives back a function to evaluate rather than
 * something to do algebra on. A crossing is found where the two sides swap
 * over, and then halved down to the exact place. A solution where the two
 * sides only touch, as (x − 3)² = 0 does at 3, never swaps over, so the
 * smallest gaps between the two sides are searched as well. A swap that isn't
 * a solution, as tan x makes at 90° where it jumps from huge to minus huge, is
 * thrown out because the two sides are still far apart there.
 */
import { evaluate, readFunction, type AngleUnit, type Expr } from "@/lib/plot-expression";
import type { BoardProblem, Interval, Relation, Statement, WorkingLine } from "./problems";

/** How close two solutions have to be to count as the same one. */
export const SAME = 1e-6;
/** How close the two sides of an equation have to be for it to count as holding. */
const HOLDS = 1e-7;
/** How many places along the domain the two sides are compared at, before closing in on each solution. */
const SAMPLES = 20000;
/** How many times a stretch holding a solution is halved. */
const HALVINGS = 80;
/** How many steps a search for a place where the two sides only touch takes. */
const TOUCH_STEPS = 100;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** Thrown when a side of a line can't be read, so a typo in a problem fails its test with the line it's on. */
export class UnreadableLatex extends Error {}

const expressions = new Map<string, Expr>();

/** A side of a line read into a tree, once. */
export function expressionOf(latex: string): Expr {
  let expression = expressions.get(latex);
  if (!expression) {
    const reading = readFunction(latex);
    if (reading.status !== "ready") throw new UnreadableLatex(`The Draft's reader can't read "${latex}"`);
    expression = reading.expression;
    expressions.set(latex, expression);
  }
  return expression;
}

/** A side of a line as a function of x. */
export function functionOf(latex: string, unit: AngleUnit): (x: number) => number {
  const expression = expressionOf(latex);
  return (x) => evaluate(expression, x, unit);
}

/** A number written in LaTeX, such as \frac{3+\sqrt{17}}{4}, worked out. */
export function valueOf(latex: string): number {
  return functionOf(latex, "radians")(0);
}

export const unitOf = (problem: Pick<BoardProblem, "degrees">): AngleUnit => (problem.degrees ? "degrees" : "radians");

/** Where x can be, as a stretch with its far end left out. Angles run from 0° up to but not including 360°. */
export function domainOf(problem: Pick<BoardProblem, "degrees" | "domain">): { from: number; to: number } {
  if (problem.degrees) return { from: 0, to: 360 };
  return problem.domain ?? { from: -100, to: 100 };
}

/** The gap between the two sides of a statement at x: positive where the left side is bigger. */
export const gapOf = (s: Statement, unit: AngleUnit) => {
  const lhs = functionOf(s.lhs, unit);
  const rhs = functionOf(s.rhs, unit);
  return (x: number) => lhs(x) - rhs(x);
};

/** Whether the two sides of an equation are close enough at x for it to hold there. */
function holdsAt(gap: (x: number) => number, x: number): boolean {
  const g = gap(x);
  return Number.isFinite(g) && Math.abs(g) <= HOLDS * Math.max(1, Math.abs(x));
}

/** Every x in the domain where gap(x) = 0, from smallest to largest. */
export function zerosOf(gap: (x: number) => number, { from, to }: { from: number; to: number }): number[] {
  const found: number[] = [];
  const add = (x: number) => {
    if (x < from - SAME || x >= to - SAME) return;
    if (!holdsAt(gap, x)) return;
    if (found.some((other) => Math.abs(other - x) <= SAME * Math.max(1, Math.abs(x)))) return;
    found.push(x);
  };

  const step = (to - from) / SAMPLES;
  const xs = Array.from({ length: SAMPLES }, (_, i) => from + i * step);
  const gs = xs.map(gap);

  for (let i = 0; i < SAMPLES; i++) {
    const g = gs[i];
    if (!Number.isFinite(g)) continue;
    if (g === 0) { add(xs[i]); continue; }

    // The two sides swap over before the next sample, so close in by halving.
    const next = gs[i + 1];
    if (i + 1 < SAMPLES && Number.isFinite(next) && g * next < 0) {
      let lo = xs[i], glo = g, hi = xs[i + 1];
      for (let k = 0; k < HALVINGS; k++) {
        const mid = (lo + hi) / 2;
        const gm = gap(mid);
        if (!Number.isFinite(gm) || gm === 0) { lo = hi = mid; break; }
        if (gm * glo < 0) hi = mid;
        else { lo = mid; glo = gm; }
      }
      add((lo + hi) / 2);
    }

    // The gap is smaller here than on either side, so the two sides might
    // touch without swapping over. A golden-section search finds the least
    // gap between the neighbouring samples, and it's a solution if the two
    // sides meet there.
    const prev = gs[i - 1];
    if (i > 0 && i + 1 < SAMPLES && Number.isFinite(prev) && Number.isFinite(next)
      && Math.abs(g) <= Math.abs(prev) && Math.abs(g) <= Math.abs(next)) {
      let lo = xs[i - 1], hi = xs[i + 1];
      let c = hi - GOLDEN * (hi - lo), d = lo + GOLDEN * (hi - lo);
      let gc = Math.abs(gap(c)), gd = Math.abs(gap(d));
      for (let k = 0; k < TOUCH_STEPS; k++) {
        if (gc < gd) { hi = d; d = c; gd = gc; c = hi - GOLDEN * (hi - lo); gc = Math.abs(gap(c)); }
        else { lo = c; c = d; gc = gd; d = lo + GOLDEN * (hi - lo); gd = Math.abs(gap(d)); }
      }
      add((lo + hi) / 2);
    }
  }
  // A solution right at the start of the domain, such as cos x = 1 at 0°, sits on the first sample.
  add(from);
  return found.sort((a, b) => a - b);
}

/** The solutions of a line of equations, in the domain: the solutions of any of its statements. */
export function solutionsOf(line: WorkingLine, unit: AngleUnit, domain: { from: number; to: number }): number[] {
  const all = line.or.flatMap((s) => zerosOf(gapOf(s, unit), domain)).sort((a, b) => a - b);
  return all.filter((x, i) => i === 0 || Math.abs(x - all[i - 1]) > SAME * Math.max(1, Math.abs(x)));
}

/** Whether two lists of solutions are the same, solution by solution. */
export function sameSolutions(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= SAME * Math.max(1, Math.abs(x)) * 10);
}

/** Whether a relation holds for a gap between the two sides, with an equal gap counting as equal. */
function relationHolds(rel: Relation, gap: number): boolean | null {
  if (!Number.isFinite(gap)) return null;
  const equal = Math.abs(gap) <= HOLDS;
  switch (rel) {
    case "=": return equal;
    case "<": return !equal && gap < 0;
    case "≤": return equal || gap < 0;
    case ">": return !equal && gap > 0;
    case "≥": return equal || gap > 0;
  }
}

/** Whether a line of inequalities holds at x, or null where a side has no value there. */
export function lineHolds(line: WorkingLine, unit: AngleUnit, x: number): boolean | null {
  let any = false;
  for (const s of line.or) {
    const holds = relationHolds(s.rel, gapOf(s, unit)(x));
    if (holds === null) return null;
    any ||= holds;
  }
  return any;
}

/** Whether x is in an inequality's answer. */
export function inAnswer(parts: Interval[], x: number): boolean {
  return parts.some(({ from, to }) => {
    const tolerance = SAME * Math.max(1, Math.abs(x));
    const afterFrom = !from || (from.closed ? x >= valueOf(from.at) - tolerance : x > valueOf(from.at) + tolerance);
    const beforeTo = !to || (to.closed ? x <= valueOf(to.at) + tolerance : x < valueOf(to.at) - tolerance);
    return afterFrom && beforeTo;
  });
}
