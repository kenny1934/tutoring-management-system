/**
 * The worked problems the sign-in page shows on its board, one a day. Each is
 * written as data rather than as a picture, so lib/login-board/check can prove
 * every line of the working before it ever reaches a board: each line has to
 * have exactly the same solutions as the one before it, the answer has to
 * solve the question, and a graph's marked points have to agree with the
 * answer. The test in problems.test.ts runs every problem through it, so a
 * problem with a slip in it fails the build instead of going up on a board.
 *
 * Every side of every line is LaTeX, read by the Draft's own reader in
 * lib/plot-expression, the one that reads what a tutor types into the Graph
 * panel. So what's checked and what's written on the board come from the same
 * string, and the board writes it the way the Draft writes a graph's
 * equation, with an italic x and a proper minus sign. The answer line is
 * written from the checked answer too, and a graph's coordinates come from
 * the points the Draft finds on the curve, so nothing on the board is typed
 * twice.
 *
 * The reasons in the margin are the one part a test can't check, so a person
 * reads them before a problem goes in. They're short, in sentence case, and
 * written the way a tutor would say them.
 */
import type { AxisSettings } from "@/lib/axes";

export type Relation = "=" | "<" | "≤" | ">" | "≥";

/** One statement, such as x² − 6x + 5 = 0, with each side in LaTeX. */
export interface Statement {
  lhs: string;
  rel: Relation;
  rhs: string;
}

/**
 * One line of working. Most lines are one statement, and a line such as
 * "x − 2 = 0 or x − 3 = 0" is two, joined by "or". Its solutions are the
 * solutions of any of them.
 */
export interface WorkingLine {
  or: Statement[];
  /** What the tutor did to get this line, written in the margin. */
  reason?: string;
}

/** One end of an interval in an inequality's answer, in LaTeX, and whether the end itself is in. */
export interface IntervalEnd {
  at: string;
  closed: boolean;
}

/** One stretch of an inequality's answer. A missing end runs on for ever. */
export interface Interval {
  from?: IntervalEnd;
  to?: IntervalEnd;
}

export type Answer =
  | {
    kind: "values";
    /** Every solution of the question in the problem's domain, as LaTeX, in the order they're written. */
    values: string[];
    /** True when the answer is also written to 3 significant figures, as HKDSE answers are. */
    rounded?: boolean;
    /**
     * Values the working turns up that aren't solutions of the question,
     * such as x = −2 for log x + log(x − 3) = 1. The answer line says each
     * one is rejected, and the check proves it.
     */
    rejected?: string[];
    /** For a pair of graphs, the y of each point, worked out from this function of x. */
    yFrom?: string;
  }
  | { kind: "interval"; parts: Interval[] };

export interface BoardGraph {
  /** The functions drawn, as LaTeX the Draft's Graph panel reads. With two, the answer is where they meet. */
  functions: string[];
  x: AxisSettings;
  y: AxisSettings;
}

export type Form = "F1" | "F2" | "F3" | "F4" | "F5" | "F6";

export interface BoardProblem {
  /** A short name that never changes, so a problem can be asked for by name in a preview. */
  id: string;
  form: Form;
  /** The caption, in sentence case, such as "Quadratic equations, completing the square". */
  topic: string;
  /** True when x is an angle in degrees. The domain is then 0° ≤ x < 360°. */
  degrees?: boolean;
  /**
   * Where x is allowed to be, for a question that only makes sense on part
   * of the line, such as one with a log in it. Without it, x can be anything
   * from −100 to 100, which holds every answer on the board.
   */
  domain?: { from: number; to: number };
  lines: WorkingLine[];
  answer: Answer;
  graph?: BoardGraph;
}

// ---------- Writing the problems out ----------

const statement = (lhs: string, rhs: string, rel: Relation = "="): Statement => ({ lhs, rel, rhs });

/** A line with one equation on it. */
const eq = (lhs: string, rhs: string, reason?: string): WorkingLine => ({ or: [statement(lhs, rhs)], ...(reason && { reason }) });

/** A line of several equations joined by "or". */
const either = (pairs: [string, string][], reason?: string): WorkingLine =>
  ({ or: pairs.map(([lhs, rhs]) => statement(lhs, rhs)), ...(reason && { reason }) });

/** A line with one inequality on it. */
const ineq = (lhs: string, rel: Relation, rhs: string, reason?: string): WorkingLine =>
  ({ or: [statement(lhs, rhs, rel)], ...(reason && { reason }) });

const values = (list: string[], extra: Omit<Extract<Answer, { kind: "values" }>, "kind" | "values"> = {}): Answer =>
  ({ kind: "values", values: list, ...extra });

const axis = (from: number, to: number, perSquare: number, degrees = false): AxisSettings =>
  // An axis in degrees is numbered every other square, 90°, 180° and so on,
  // because a number on every 45° runs into the curves at the size a board is shown.
  ({ from, to, perSquare, numbers: degrees ? 2 : 1, ...(degrees && { degrees: true }) });

export const BOARD_PROBLEMS: BoardProblem[] = [
  // ---------- F1 and F2: linear equations ----------
  {
    id: "linear-two-step",
    form: "F1",
    topic: "Linear equations in one unknown",
    lines: [
      eq("3x+5", "20"),
      eq("3x", "15", "subtract 5 from both sides"),
    ],
    answer: values(["5"]),
  },
  {
    id: "linear-quarter",
    form: "F1",
    topic: "Linear equations with a fraction",
    lines: [
      eq("\\frac{x}{4}-1", "2"),
      eq("\\frac{x}{4}", "3", "add 1 to both sides"),
    ],
    answer: values(["12"]),
  },
  {
    id: "linear-brackets",
    form: "F2",
    topic: "Linear equations with brackets",
    lines: [
      eq("5(x-2)", "3x+4"),
      eq("5x-10", "3x+4", "expand the brackets"),
      eq("2x", "14", "subtract 3x, then add 10"),
    ],
    answer: values(["7"]),
  },
  {
    id: "linear-fractions",
    form: "F2",
    topic: "Linear equations with fractions",
    lines: [
      eq("\\frac{x+1}{3}", "\\frac{x-1}{2}"),
      eq("2(x+1)", "3(x-1)", "multiply both sides by 6"),
      eq("2x+2", "3x-3"),
    ],
    answer: values(["5"]),
  },
  {
    id: "linear-graph",
    form: "F2",
    topic: "Where a straight line meets the x-axis",
    lines: [
      eq("2x-6", "0"),
      eq("2x", "6"),
    ],
    answer: values(["3"]),
    graph: { functions: ["2x-6"], x: axis(-2, 5, 1), y: axis(-7, 3, 1) },
  },
  {
    id: "simultaneous-lines",
    form: "F2",
    topic: "Simultaneous equations, where two lines meet",
    lines: [
      eq("2x+1", "7-x", "both equal y"),
      eq("3x", "6", "add x, then subtract 1"),
    ],
    answer: values(["2"], { yFrom: "2x+1" }),
    graph: { functions: ["2x+1", "7-x"], x: axis(-2, 7, 1), y: axis(-2, 8, 1) },
  },

  // ---------- F3 and F4: quadratic equations ----------
  {
    id: "quadratic-factorise",
    form: "F3",
    topic: "Quadratic equations, by factorising",
    lines: [
      eq("x^2-5x+6", "0"),
      eq("(x-2)(x-3)", "0", "factorise"),
      either([["x-2", "0"], ["x-3", "0"]]),
    ],
    answer: values(["2", "3"]),
  },
  {
    id: "quadratic-factorise-negative",
    form: "F3",
    topic: "Quadratic equations, by factorising",
    lines: [
      eq("x^2+2x-15", "0"),
      eq("(x+5)(x-3)", "0", "factorise"),
      either([["x+5", "0"], ["x-3", "0"]]),
    ],
    answer: values(["-5", "3"]),
  },
  {
    id: "quadratic-difference-of-squares",
    form: "F3",
    topic: "Quadratic equations, a difference of two squares",
    lines: [
      eq("4x^2-9", "0"),
      eq("(2x-3)(2x+3)", "0", "a² − b² = (a − b)(a + b)"),
      either([["2x-3", "0"], ["2x+3", "0"]]),
    ],
    answer: values(["\\frac{3}{2}", "-\\frac{3}{2}"]),
  },
  {
    id: "quadratic-common-factor",
    form: "F4",
    topic: "Quadratic equations, taking out a common factor",
    lines: [
      eq("2x^2", "8x"),
      eq("2x^2-8x", "0", "don't divide by x, or x = 0 is lost"),
      eq("2x(x-4)", "0", "take out 2x"),
      either([["2x", "0"], ["x-4", "0"]]),
    ],
    answer: values(["0", "4"]),
  },
  {
    id: "quadratic-graph",
    form: "F3",
    topic: "Quadratic equations, read from the graph",
    lines: [
      eq("x^2-5x+6", "0"),
      eq("(x-2)(x-3)", "0", "factorise"),
    ],
    answer: values(["2", "3"]),
    graph: { functions: ["x^2-5x+6"], x: axis(-1, 5, 1), y: axis(-2, 7, 1) },
  },
  {
    id: "quadratic-complete-square",
    form: "F4",
    topic: "Quadratic equations, completing the square",
    lines: [
      eq("x^2-6x+5", "0"),
      eq("x^2-6x+9", "4", "add 4 to both sides"),
      eq("(x-3)^2", "4"),
      either([["x-3", "2"], ["x-3", "-2"]], "take square roots"),
    ],
    answer: values(["1", "5"]),
    graph: { functions: ["x^2-6x+5"], x: axis(-1, 7, 1), y: axis(-5, 6, 1) },
  },
  {
    id: "quadratic-complete-square-surd",
    form: "F4",
    topic: "Quadratic equations, completing the square",
    lines: [
      eq("x^2+4x-1", "0"),
      eq("x^2+4x+4", "5", "add 5 to both sides"),
      eq("(x+2)^2", "5"),
      either([["x+2", "\\sqrt{5}"], ["x+2", "-\\sqrt{5}"]], "take square roots"),
    ],
    answer: values(["-2+\\sqrt{5}", "-2-\\sqrt{5}"], { rounded: true }),
  },
  {
    id: "quadratic-formula",
    form: "F4",
    topic: "Quadratic equations, by the quadratic formula",
    lines: [
      eq("2x^2-3x-1", "0"),
      either([
        ["x", "\\frac{3+\\sqrt{(-3)^2-4(2)(-1)}}{2(2)}"],
        ["x", "\\frac{3-\\sqrt{(-3)^2-4(2)(-1)}}{2(2)}"],
      ], "a = 2, b = −3, c = −1"),
      either([["x", "\\frac{3+\\sqrt{17}}{4}"], ["x", "\\frac{3-\\sqrt{17}}{4}"]]),
    ],
    answer: values(["\\frac{3+\\sqrt{17}}{4}", "\\frac{3-\\sqrt{17}}{4}"], { rounded: true }),
  },

  // ---------- F4: where a line meets a curve ----------
  {
    id: "line-meets-parabola",
    form: "F4",
    topic: "Where a straight line meets a parabola",
    lines: [
      eq("x^2-2", "x", "both equal y"),
      eq("x^2-x-2", "0"),
      eq("(x-2)(x+1)", "0", "factorise"),
    ],
    answer: values(["-1", "2"], { yFrom: "x" }),
    graph: { functions: ["x^2-2", "x"], x: axis(-3, 3, 1), y: axis(-3, 5, 1) },
  },
  {
    id: "line-meets-parabola-two",
    form: "F4",
    topic: "Where a straight line meets a parabola",
    lines: [
      eq("x^2", "2x+3", "both equal y"),
      eq("x^2-2x-3", "0"),
      eq("(x-3)(x+1)", "0", "factorise"),
    ],
    answer: values(["-1", "3"], { yFrom: "2x+3" }),
    graph: { functions: ["x^2", "2x+3"], x: axis(-3, 4, 1), y: axis(-1, 10, 1) },
  },

  // ---------- F2 to F4: inequalities ----------
  {
    id: "inequality-linear",
    form: "F2",
    topic: "Linear inequalities",
    lines: [
      ineq("3x-7", "<", "5"),
      ineq("3x", "<", "12", "add 7 to both sides"),
    ],
    answer: { kind: "interval", parts: [{ to: { at: "4", closed: false } }] },
  },
  {
    id: "inequality-reverse",
    form: "F3",
    topic: "Linear inequalities, dividing by a negative number",
    lines: [
      ineq("5-2x", "≥", "11"),
      ineq("-2x", "≥", "6", "subtract 5 from both sides"),
    ],
    answer: { kind: "interval", parts: [{ to: { at: "-3", closed: true } }] },
  },
  {
    id: "inequality-quadratic-between",
    form: "F4",
    topic: "Quadratic inequalities, read from the graph",
    lines: [
      ineq("x^2-4x+3", "≤", "0"),
      ineq("(x-1)(x-3)", "≤", "0", "factorise"),
    ],
    answer: { kind: "interval", parts: [{ from: { at: "1", closed: true }, to: { at: "3", closed: true } }] },
    graph: { functions: ["x^2-4x+3"], x: axis(-1, 5, 1), y: axis(-2, 6, 1) },
  },
  {
    id: "inequality-quadratic-outside",
    form: "F4",
    topic: "Quadratic inequalities",
    lines: [
      ineq("x^2-x-6", ">", "0"),
      ineq("(x-3)(x+2)", ">", "0", "factorise"),
    ],
    answer: {
      kind: "interval",
      parts: [{ to: { at: "-2", closed: false } }, { from: { at: "3", closed: false } }],
    },
  },

  // ---------- F3 and F5: indices and exponential equations ----------
  {
    id: "indices-power-of-three",
    form: "F3",
    topic: "Equations with indices",
    lines: [
      eq("3^x", "81"),
      eq("3^x", "3^4", "81 = 3 × 3 × 3 × 3"),
    ],
    answer: values(["4"]),
  },
  {
    id: "exponential-same-base",
    form: "F5",
    topic: "Exponential equations, the same base on both sides",
    lines: [
      eq("2^{x+1}", "32"),
      eq("2^{x+1}", "2^5"),
      eq("x+1", "5", "compare the indices"),
    ],
    answer: values(["4"]),
  },
  {
    id: "exponential-logs",
    form: "F5",
    topic: "Exponential equations, solved with logarithms",
    lines: [
      eq("5^x", "12"),
      eq("x\\log 5", "\\log 12", "take logs of both sides"),
    ],
    answer: values(["\\frac{\\log 12}{\\log 5}"], { rounded: true }),
  },
  {
    id: "exponential-natural",
    form: "F6",
    topic: "Exponential equations with e",
    lines: [
      eq("e^{2x}", "5"),
      eq("2x", "\\ln 5", "take ln of both sides"),
    ],
    answer: values(["\\frac{\\ln 5}{2}"], { rounded: true }),
  },

  // ---------- F5: logarithmic equations ----------
  {
    id: "log-base-two",
    form: "F5",
    topic: "Logarithmic equations",
    domain: { from: -3, to: 100 },
    lines: [
      eq("\\log_2(x+3)", "4"),
      eq("x+3", "2^4", "change to index form"),
      eq("x+3", "16"),
    ],
    answer: values(["13"]),
  },
  {
    id: "log-laws",
    form: "F5",
    topic: "Logarithmic equations, using the laws of logs",
    domain: { from: 0, to: 100 },
    lines: [
      eq("\\log_3 x+\\log_3 9", "4"),
      eq("\\log_3 x+2", "4", "log₃ 9 = 2"),
      eq("\\log_3 x", "2"),
      eq("x", "3^2", "change to index form"),
    ],
    answer: values(["9"]),
  },
  {
    id: "log-rejected-root",
    form: "F5",
    topic: "Logarithmic equations, checking the answers",
    domain: { from: 3, to: 100 },
    lines: [
      eq("\\log x+\\log(x-3)", "1"),
      eq("\\log[x(x-3)]", "1", "log a + log b = log ab"),
      eq("x(x-3)", "10"),
      eq("x^2-3x-10", "0"),
      eq("(x-5)(x+2)", "0", "factorise"),
    ],
    answer: values(["5"], { rejected: ["-2"] }),
  },

  // ---------- F4 and F5: trigonometric equations, 0° ≤ x < 360° ----------
  {
    id: "trig-sine-half",
    form: "F4",
    topic: "Trigonometric equations, 0° ≤ x < 360°",
    degrees: true,
    lines: [
      eq("2\\sin x-1", "0"),
      eq("\\sin x", "\\frac{1}{2}"),
    ],
    answer: values(["30", "150"]),
    graph: { functions: ["\\sin x", "\\frac{1}{2}"], x: axis(0, 8, 45, true), y: axis(-3, 3, 0.5) },
  },
  {
    id: "trig-tangent",
    form: "F4",
    topic: "Trigonometric equations, 0° ≤ x < 360°",
    degrees: true,
    lines: [
      eq("\\sqrt{3}\\tan x-3", "0"),
      eq("\\tan x", "\\frac{3}{\\sqrt{3}}"),
      eq("\\tan x", "\\sqrt{3}"),
    ],
    answer: values(["60", "240"]),
  },
  {
    id: "trig-sine-equals-cosine",
    form: "F5",
    topic: "Trigonometric equations, 0° ≤ x < 360°",
    degrees: true,
    lines: [
      eq("\\sin x", "\\cos x"),
      eq("\\tan x", "1", "divide both sides by cos x"),
    ],
    answer: values(["45", "225"]),
    graph: { functions: ["\\sin x", "\\cos x"], x: axis(0, 8, 45, true), y: axis(-3, 3, 0.5) },
  },
  {
    id: "trig-quadratic-cosine",
    form: "F5",
    topic: "Trigonometric equations in quadratic form",
    degrees: true,
    lines: [
      eq("2\\cos^2x-\\cos x-1", "0"),
      eq("(2\\cos x+1)(\\cos x-1)", "0", "factorise"),
      either([["\\cos x", "-\\frac{1}{2}"], ["\\cos x", "1"]]),
    ],
    answer: values(["0", "120", "240"]),
  },
];
