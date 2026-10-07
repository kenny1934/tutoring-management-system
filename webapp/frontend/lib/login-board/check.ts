/**
 * Proving a board problem before it goes up. checkProblem returns everything
 * that's wrong with a problem, as sentences, and an empty list when the whole
 * of it holds. problems.test.ts runs it on every problem, so a slip anywhere
 * in the working fails the tests.
 *
 * For equations, every line has to have exactly the same solutions as the
 * first, in the problem's domain, and the answer has to be those solutions.
 * Comparing each line with the first catches a slip in any one step, and
 * comparing the answer with the first line, which is the question itself,
 * catches an answer that follows from the working but doesn't solve the
 * question. A value the answer says is rejected has to be a solution of a
 * later line that isn't a solution of the question.
 *
 * For inequalities, every line has to hold at exactly the places the answer
 * covers. That's tested at thousands of places along the domain, and at each
 * end of the answer and just either side of it, which is where a ≤ written as
 * a < would show.
 *
 * For a graph, the points the board marks have to be the answer. A single
 * graph is marked where the Draft's own lib/key-points finds it crossing the
 * x-axis, and a pair of graphs where the two curves meet, so the board's
 * coordinates come from the curve and not from anything typed.
 */
import { CM } from "@/lib/drawing-guide";
import { axesFrame, type AxesSettings } from "@/lib/axes";
import { curveLines } from "@/lib/plot";
import { keyPoints } from "@/lib/key-points";
import {
  SAME, UnreadableLatex, domainOf, functionOf, gapOf, inAnswer, lineHolds, sameSolutions, solutionsOf, unitOf,
  valueOf, zerosOf,
} from "./maths";
import type { BoardProblem, Interval, WorkingLine } from "./problems";
import type { Vec } from "@/lib/stroke-select";

/** How many places along the domain an inequality is tested at. */
const INEQUALITY_SAMPLES = 4000;
/** How far either side of an end of an inequality's answer it's also tested. */
const NEAR_END = 1e-4;

const isInequality = (line: WorkingLine) => line.or.some((s) => s.rel !== "=");

const written = (xs: number[]) => (xs.length ? xs.map((x) => Number(x.toPrecision(6))).join(", ") : "none");

/**
 * Where a graph's axes cross on a Draft sheet, so the curve can be traced the
 * way the Draft traces it. Any place with room for both axes will do, because
 * the points found are in the axes' own numbers.
 */
export function graphOrigin(settings: AxesSettings): Vec {
  return [(1 - settings.x.from) * CM, (settings.y.to + 1.5) * CM];
}

/** Where a single graph crosses the x-axis, as the Draft's key points find it. */
export function graphCrossings(latex: string, problem: BoardProblem): number[] {
  const graph = problem.graph!;
  const settings = { x: graph.x, y: graph.y };
  const f = functionOf(latex, unitOf(problem));
  const origin = graphOrigin(settings);
  const lines = curveLines(f, origin, settings);
  return keyPoints(lines, f, axesFrame(origin, settings), settings)
    .filter((point) => point.at[1] === 0 || Math.abs(point.at[1]) < 1e-9)
    .map((point) => point.at[0])
    .sort((a, b) => a - b);
}

/** Where two graphs meet, along the stretch of the x-axis that's drawn. */
export function graphMeetings(first: string, second: string, problem: BoardProblem): number[] {
  const graph = problem.graph!;
  const unit = unitOf(problem);
  const f = functionOf(first, unit);
  const g = functionOf(second, unit);
  const from = graph.x.from * graph.x.perSquare;
  // The far end is let in, because the last square of an axis is drawn.
  const to = graph.x.to * graph.x.perSquare + SAME;
  return zerosOf((x) => f(x) - g(x), { from, to });
}

function checkEquations(problem: BoardProblem, errors: string[]) {
  const unit = unitOf(problem);
  const domain = domainOf(problem);
  const question = solutionsOf(problem.lines[0], unit, domain);
  if (question.length === 0) errors.push("The question has no solutions in its domain.");

  problem.lines.slice(1).forEach((line, i) => {
    const solutions = solutionsOf(line, unit, domain);
    if (!sameSolutions(solutions, question)) {
      errors.push(`Line ${i + 2} has the solutions ${written(solutions)}, but the question has ${written(question)}.`);
    }
  });

  const answer = problem.answer;
  if (answer.kind !== "values") {
    errors.push("A problem of equations needs its answer as values.");
    return;
  }
  const values = answer.values.map(valueOf);
  const sorted = [...values].sort((a, b) => a - b);
  if (!sameSolutions(sorted, question)) {
    errors.push(`The answer is ${written(sorted)}, but the question's solutions are ${written(question)}.`);
  }
  values.forEach((x, i) => {
    const holds = problem.lines[0].or.some((s) => {
      const gap = gapOf(s, unit)(x);
      return Number.isFinite(gap) && Math.abs(gap) < 1e-7 * Math.max(1, Math.abs(x));
    });
    if (!holds) errors.push(`The answer ${answer.values[i]} doesn't solve the question.`);
  });

  for (const latex of answer.rejected ?? []) {
    const x = valueOf(latex);
    const turnsUp = problem.lines.some((line) =>
      line.or.some((s) => {
        const gap = gapOf(s, unit)(x);
        return Number.isFinite(gap) && Math.abs(gap) < 1e-7 * Math.max(1, Math.abs(x));
      }));
    const solvesQuestion = problem.lines[0].or.some((s) => {
      const gap = gapOf(s, unit)(x);
      return Number.isFinite(gap) && Math.abs(gap) < 1e-7 * Math.max(1, Math.abs(x));
    });
    if (!turnsUp) errors.push(`The rejected value ${latex} doesn't turn up anywhere in the working.`);
    if (solvesQuestion && x >= domain.from && x < domain.to) errors.push(`The rejected value ${latex} actually solves the question.`);
  }

  if (answer.yFrom !== undefined && problem.graph) {
    const y = functionOf(answer.yFrom, unit);
    for (const x of values) {
      for (const latex of problem.graph.functions) {
        const other = functionOf(latex, unit)(x);
        if (Math.abs(other - y(x)) > 1e-7 * Math.max(1, Math.abs(other))) {
          errors.push(`At x = ${written([x])}, y from the answer is ${written([y(x)])}, but y = ${latex} is ${written([other])}.`);
        }
      }
    }
  }
}

/** The places an inequality is tested: along the whole domain, and at and around every end of the answer and every solution of each line's equation. */
function testPlaces(problem: BoardProblem, parts: Interval[]): number[] {
  const unit = unitOf(problem);
  const domain = domainOf(problem);
  const places: number[] = [];
  const step = (domain.to - domain.from) / INEQUALITY_SAMPLES;
  for (let i = 0; i < INEQUALITY_SAMPLES; i++) places.push(domain.from + i * step);
  const edges = parts.flatMap(({ from, to }) => [from, to]).filter((end) => end !== undefined).map((end) => valueOf(end!.at));
  const crossings = problem.lines.flatMap((line) => line.or.flatMap((s) => zerosOf(gapOf(s, unit), domain)));
  for (const x of [...edges, ...crossings]) places.push(x - NEAR_END, x, x + NEAR_END);
  return places;
}

function checkInequalities(problem: BoardProblem, errors: string[]) {
  const answer = problem.answer;
  if (answer.kind !== "interval") {
    errors.push("A problem of inequalities needs its answer as intervals.");
    return;
  }
  const unit = unitOf(problem);
  const places = testPlaces(problem, answer.parts);
  problem.lines.forEach((line, i) => {
    const wrong = places.filter((x) => {
      const holds = lineHolds(line, unit, x);
      return holds !== null && holds !== inAnswer(answer.parts, x);
    });
    if (wrong.length > 0) {
      errors.push(`Line ${i + 1} disagrees with the answer at x = ${written(wrong.slice(0, 3))}.`);
    }
  });
}

function checkGraph(problem: BoardProblem, errors: string[]) {
  const graph = problem.graph;
  if (!graph) return;
  const answer = problem.answer;
  // What the graph has to show: the answer's values, or the ends of an inequality's answer.
  const expected = answer.kind === "values"
    ? answer.values.map(valueOf).sort((a, b) => a - b)
    : answer.parts.flatMap(({ from, to }) => [from, to]).filter((end) => end !== undefined).map((end) => valueOf(end!.at))
      .sort((a, b) => a - b);

  const drawnFrom = graph.x.from * graph.x.perSquare;
  const drawnTo = graph.x.to * graph.x.perSquare;
  for (const x of expected) {
    if (x < drawnFrom - SAME || x > drawnTo + SAME) errors.push(`The answer x = ${written([x])} is off the edge of the graph.`);
  }

  if (graph.functions.length === 1) {
    const crossings = graphCrossings(graph.functions[0], problem);
    if (!sameSolutions(crossings, expected)) {
      errors.push(`The graph crosses the x-axis at ${written(crossings)}, but the answer is ${written(expected)}.`);
    }
  } else if (graph.functions.length === 2) {
    const meetings = graphMeetings(graph.functions[0], graph.functions[1], problem);
    if (!sameSolutions(meetings, expected)) {
      errors.push(`The two graphs meet at ${written(meetings)}, but the answer is ${written(expected)}.`);
    }
  } else {
    errors.push("A board graph has one function or two.");
  }
}

/** Everything that's wrong with a problem, or an empty list when it all holds. */
export function checkProblem(problem: BoardProblem): string[] {
  const errors: string[] = [];
  if (problem.lines.length === 0) return ["The problem has no working."];
  try {
    const inequalities = problem.lines.map(isInequality);
    if (inequalities.some((x) => x !== inequalities[0])) {
      errors.push("A problem's lines are all equations or all inequalities.");
    } else if (inequalities[0]) {
      checkInequalities(problem, errors);
    } else {
      checkEquations(problem, errors);
    }
    checkGraph(problem, errors);
  } catch (error) {
    if (error instanceof UnreadableLatex) errors.push(error.message);
    else throw error;
  }
  return errors;
}
