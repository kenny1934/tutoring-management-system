import { describe, expect, it } from "vitest";
import { checkProblem } from "./check";
import { BOARD_PROBLEMS, type BoardProblem } from "./problems";
import { problemForDay, schoolWeek } from "./today";
import { boardLayout } from "./layout";
import { boundingBox } from "@/lib/stroke-eraser";

const byId = (id: string) => BOARD_PROBLEMS.find((p) => p.id === id)!;

describe("the sign-in board's problems", () => {
  it.each(BOARD_PROBLEMS.map((p) => [p.id, p] as const))("%s holds from the question to the answer", (_, problem) => {
    expect(checkProblem(problem)).toEqual([]);
  });

  it("each has a name of its own", () => {
    const ids = BOARD_PROBLEMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each fits a board, with three to six lines once the answer is written", () => {
    for (const problem of BOARD_PROBLEMS) {
      const answerLines = problem.answer.kind === "values" && problem.answer.rounded ? 2 : 1;
      expect(problem.lines.length + answerLines, problem.id).toBeGreaterThanOrEqual(3);
      expect(problem.lines.length + answerLines, problem.id).toBeLessThanOrEqual(6);
    }
  });
});

describe("the check catches mistakes", () => {
  it("catches a step with a slip in it", () => {
    const base = byId("quadratic-complete-square");
    // x² − 6x + 9 = 3 is what you'd get by adding 4 to one side and 3 to the other.
    const slipped: BoardProblem = {
      ...base,
      lines: base.lines.map((line, i) => (i === 1 ? { ...line, or: [{ lhs: "x^2-6x+9", rel: "=", rhs: "3" }] } : line)),
    };
    expect(checkProblem(slipped).some((e) => e.startsWith("Line 2"))).toBe(true);
  });

  it("catches a wrong answer", () => {
    const base = byId("linear-brackets");
    const wrong: BoardProblem = { ...base, answer: { kind: "values", values: ["6"] } };
    expect(checkProblem(wrong)).toContain("The answer is 6, but the question's solutions are 7.");
  });

  it("catches an answer with a solution missing", () => {
    const base = byId("trig-quadratic-cosine");
    // Forgetting cos x = 1 at 0° is the classic slip with this one.
    const missing: BoardProblem = { ...base, answer: { kind: "values", values: ["120", "240"] } };
    expect(checkProblem(missing).some((e) => e.startsWith("The answer is 120, 240"))).toBe(true);
  });

  it("catches a line that loses a solution, such as dividing by x", () => {
    const base = byId("quadratic-common-factor");
    const divided: BoardProblem = {
      ...base,
      lines: [base.lines[0], { or: [{ lhs: "2x", rel: "=", rhs: "8" }] }],
      answer: { kind: "values", values: ["4"] },
    };
    expect(checkProblem(divided).length).toBeGreaterThan(0);
  });

  it("catches an inequality whose sign wasn't reversed", () => {
    const base = byId("inequality-reverse");
    const unreversed: BoardProblem = {
      ...base,
      answer: { kind: "interval", parts: [{ from: { at: "-3", closed: true } }] },
    };
    expect(checkProblem(unreversed).length).toBeGreaterThan(0);
  });

  it("catches a < that should be a ≤", () => {
    const base = byId("inequality-quadratic-between");
    const open: BoardProblem = {
      ...base,
      answer: { kind: "interval", parts: [{ from: { at: "1", closed: false }, to: { at: "3", closed: true } }] },
    };
    expect(checkProblem(open).length).toBeGreaterThan(0);
  });

  it("catches a rejected value that's really a solution", () => {
    const base = byId("quadratic-factorise");
    const rejected: BoardProblem = { ...base, answer: { kind: "values", values: ["3"], rejected: ["2"] } };
    expect(checkProblem(rejected)).toContain("The rejected value 2 actually solves the question.");
  });

  it("catches a graph that doesn't show the answer", () => {
    const base = byId("quadratic-graph");
    const moved: BoardProblem = { ...base, graph: { ...base.graph!, functions: ["x^2-5x+4"] } };
    expect(checkProblem(moved).some((e) => e.startsWith("The graph crosses the x-axis at 1, 4"))).toBe(true);
  });

  it("catches a pair of graphs that meet somewhere else", () => {
    const base = byId("simultaneous-lines");
    const moved: BoardProblem = { ...base, graph: { ...base.graph!, functions: ["2x+1", "8-x"] } };
    expect(checkProblem(moved).length).toBeGreaterThan(0);
  });

  it("catches a side the Draft's reader can't read", () => {
    const base = byId("linear-two-step");
    const typo: BoardProblem = { ...base, lines: [{ or: [{ lhs: "3x+", rel: "=", rhs: "20" }] }, ...base.lines.slice(1)] };
    expect(checkProblem(typo).some((e) => e.includes("can't read"))).toBe(true);
  });

  it("doesn't take the jump in tan x at 90° for a solution", () => {
    expect(checkProblem(byId("trig-tangent"))).toEqual([]);
  });
});

describe("the board's layout", () => {
  it.each(BOARD_PROBLEMS.map((p) => [p.id, p] as const))("%s fits on its board, with a curve for each graph", (_, problem) => {
    const { box, pieces } = boardLayout(problem);
    for (const { stroke } of pieces) {
      const edges = boundingBox(stroke);
      expect(edges.left).toBeGreaterThanOrEqual(box.left);
      expect(edges.top).toBeGreaterThanOrEqual(box.top);
      expect(edges.right).toBeLessThanOrEqual(box.left + box.width);
      expect(edges.bottom).toBeLessThanOrEqual(box.top + box.height);
    }
    const curves = pieces.filter((piece) => piece.part === "curve").length;
    expect(curves >= (problem.graph?.functions.length ?? 0)).toBe(true);
    expect(pieces.filter((piece) => piece.part === "underline")).toHaveLength(1);
  });
});

describe("the problem of the day", () => {
  it("is the same all day in Hong Kong and moves on at midnight there", () => {
    // 15:59 UTC is 23:59 in Hong Kong, and 16:01 UTC is 00:01 the next day.
    const late = problemForDay(new Date("2026-10-07T15:59:00Z"));
    const morning = problemForDay(new Date("2026-10-07T01:00:00Z"));
    const next = problemForDay(new Date("2026-10-07T16:01:00Z"));
    expect(late.id).toBe(morning.id);
    expect(next.id).not.toBe(late.id);
  });
});

describe("the week of the school year", () => {
  // 16:30 UTC is half past midnight the next day in Hong Kong.
  it("counts the course's first week as week 1, by the date in Hong Kong", () => {
    expect(schoolWeek("2026-09-01", new Date("2026-09-01T03:00:00Z"))).toBe(1);
    expect(schoolWeek("2026-09-01", new Date("2026-09-07T03:00:00Z"))).toBe(1);
    expect(schoolWeek("2026-09-01", new Date("2026-09-07T16:30:00Z"))).toBe(2);
    expect(schoolWeek("2026-09-01", new Date("2026-10-07T03:00:00Z"))).toBe(6);
  });

  it("shows nothing before the course starts, after 52 weeks, or for a date it can't read", () => {
    expect(schoolWeek("2026-09-01", new Date("2026-08-31T03:00:00Z"))).toBeNull();
    expect(schoolWeek("2026-09-01", new Date("2027-08-30T03:00:00Z"))).toBe(52);
    expect(schoolWeek("2026-09-01", new Date("2027-08-31T03:00:00Z"))).toBeNull();
    expect(schoolWeek("", new Date("2026-10-07T03:00:00Z"))).toBeNull();
  });
});
