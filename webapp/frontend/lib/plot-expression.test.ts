import { describe, it, expect } from "vitest";
import { evaluate, readFunction, type AngleUnit } from "./plot-expression";

const valueOf = (latex: string, x: number, unit: AngleUnit = "radians") => {
  const reading = readFunction(latex);
  if (reading.status !== "ready") throw new Error(`${latex} was ${reading.status}`);
  return evaluate(reading.expression, x, unit);
};

const labelOf = (latex: string) => {
  const reading = readFunction(latex);
  return reading.status === "ready" ? reading.label : reading.status;
};

describe("reading a function", () => {
  // Each is written the way MathLive writes it, with the value at one x.
  const cases: [string, number, number][] = [
    ["x^2-2x-3", 4, 5],
    ["2\\sin x+1", Math.PI / 2, 3],
    ["\\sin 2x", Math.PI / 4, 1],
    ["\\sin^2x", Math.PI / 4, 0.5],
    ["\\frac{1}{x}", 4, 0.25],
    ["\\sqrt{x+1}", 8, 3],
    ["\\sqrt[3]{x}", -8, -2],
    ["e^{x}", 1, Math.E],
    ["\\ln x", Math.E, 1],
    ["\\log x", 1000, 3],
    ["|x|", -3, 3],
    ["\\left|x-1\\right|", -2, 3],
    ["3\\left(x+1\\right)^2", 1, 12],
    ["\\left(x+1\\right)\\left(x-2\\right)", 3, 4],
    ["x\\cos x", Math.PI, -Math.PI],
    ["\\frac{1}{\\sqrt{x^{2}+1}}", Math.sqrt(3), 0.5],
    ["x\\cdot2-x\\div4", 8, 14],
    ["2.5x+\\pi", 2, 5 + Math.PI],
  ];
  it.each(cases)("reads %s", (latex, x, value) => expect(valueOf(latex, x)).toBeCloseTo(value));

  it("reads the words the field's shortcuts missed, spelt out in plain letters", () => {
    expect(valueOf("2sinx+1", Math.PI / 2)).toBeCloseTo(3);
    expect(valueOf("xcosx", Math.PI)).toBeCloseTo(-Math.PI);
    expect(valueOf("sqrt\\left(x+1\\right)", 3)).toBeCloseTo(2);
    expect(valueOf("lnx", Math.E)).toBeCloseTo(1);
    expect(valueOf("pix", 2)).toBeCloseTo(2 * Math.PI);
    expect(valueOf("\\exp x", 1)).toBeCloseTo(Math.E);
  });

  it("gives a function without brackets the term after it, as a textbook does", () => {
    expect(valueOf("\\sin x+1", Math.PI / 2)).toBeCloseTo(2);
    expect(valueOf("x\\sin x", Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(valueOf("\\sin x\\cos x", Math.PI / 4)).toBeCloseTo(0.5);
    expect(valueOf("\\sin\\frac{x}{2}", Math.PI)).toBeCloseTo(1);
    expect(valueOf("\\sin x^2", 2)).toBeCloseTo(Math.sin(4));
    // With brackets, a power after them is a power of the function's value.
    expect(valueOf("\\sin\\left(x\\right)^{2}", Math.PI / 4)).toBeCloseTo(0.5);
    expect(valueOf("\\sin^{-1}x", 1)).toBeCloseTo(Math.PI / 2);
  });

  it("reads a bare argument as one character, as LaTeX does", () => {
    expect(valueOf("\\frac12x", 4)).toBeCloseTo(2);
    expect(valueOf("x^23", 2)).toBeCloseTo(12);
  });

  it("reads a log with a base, and drops a leading y = typed out of habit", () => {
    expect(valueOf("\\log_{2}x", 8)).toBeCloseTo(3);
    expect(valueOf("\\log_2x", 8)).toBeCloseTo(3);
    expect(valueOf("y=x^2", 3)).toBeCloseTo(9);
  });

  it("takes angles in degrees or radians as the switch says", () => {
    expect(valueOf("\\sin 30", 0, "degrees")).toBeCloseTo(0.5);
    expect(valueOf("\\sin\\left(\\frac{\\pi}{6}\\right)", 0, "radians")).toBeCloseTo(0.5);
    expect(valueOf("\\sin x", 90, "degrees")).toBeCloseTo(1);
    expect(valueOf("\\sin^{-1}x", 0.5, "degrees")).toBeCloseTo(30);
    // An angle with a degree sign is in degrees, whichever way the switch is.
    expect(valueOf("\\sin\\left(x+30\\degree\\right)", 0, "radians")).toBeCloseTo(0.5);
    expect(valueOf("\\cos x^{\\circ}", 60, "radians")).toBeCloseTo(0.5);
  });

  it("has no value where the function has none", () => {
    expect(valueOf("\\frac{1}{x}", 0)).toBe(Infinity);
    expect(valueOf("\\sqrt{x}", -1)).toBeNaN();
    expect(valueOf("\\ln x", -1)).toBeNaN();
  });

  it("says when nothing is typed yet", () => {
    expect(readFunction("")).toEqual({ status: "empty" });
    expect(readFunction("y=")).toEqual({ status: "empty" });
  });

  it("says when what's typed can't be plotted yet", () => {
    for (const latex of [
      "\\placeholder{}", "\\sqrt{\\placeholder{}}", "\\frac{1}{\\placeholder{}}", "\\pm x", "ax", "\\left(x+1", "(x+1",
      "x+", "x=2", "\\frac{1}{}", "|x", "\\sqrt[\\placeholder{}]{x}",
    ]) {
      expect(readFunction(latex).status, latex).toBe("unfinished");
    }
  });

  it("never runs what's typed as code", () => {
    const typed = "x); globalThis.plotRan = true; (";
    expect(readFunction(typed).status).toBe("unfinished");
    expect((globalThis as { plotRan?: boolean }).plotRan).toBeUndefined();
  });
});

// The labels' x, y and e are Unicode's italic maths letters, 𝑥, 𝑦 and 𝑒.
describe("the label", () => {
  it("writes the whole function as a textbook would", () => {
    expect(labelOf("x^2-2x-3")).toBe("𝑦 = 𝑥² − 2𝑥 − 3");
    expect(labelOf("2\\sin x+1")).toBe("𝑦 = 2 sin 𝑥 + 1");
    expect(labelOf("\\frac{1}{x}")).toBe("𝑦 = 1/𝑥");
    expect(labelOf("\\frac{1}{x-1}")).toBe("𝑦 = 1/(𝑥 − 1)");
    expect(labelOf("\\sqrt{x+1}")).toBe("𝑦 = √(𝑥 + 1)");
    expect(labelOf("\\sin 2x")).toBe("𝑦 = sin 2𝑥");
    expect(labelOf("\\sin^2x")).toBe("𝑦 = sin² 𝑥");
    expect(labelOf("3\\left(x+1\\right)^2")).toBe("𝑦 = 3(𝑥 + 1)²");
    expect(labelOf("\\left|x-1\\right|")).toBe("𝑦 = |𝑥 − 1|");
    expect(labelOf("-x^2+4")).toBe("𝑦 = −𝑥² + 4");
    expect(labelOf("\\sin^{-1}x")).toBe("𝑦 = sin⁻¹ 𝑥");
    expect(labelOf("\\log_{2}x")).toBe("𝑦 = log₂ 𝑥");
    expect(labelOf("x\\sin x")).toBe("𝑦 = 𝑥 sin 𝑥");
    expect(labelOf("\\pi x^{-1}")).toBe("𝑦 = π𝑥⁻¹");
  });

  it("writes x, y and e in italic, and leaves the names of functions, π and the numbers upright", () => {
    expect(labelOf("\\exp x+e")).toBe("𝑦 = exp 𝑥 + 𝑒");
    expect(labelOf("\\ln\\left(\\pi x\\right)")).toBe("𝑦 = ln(π𝑥)");
  });

  it("falls back to a caret for powers Unicode has no superscripts for", () => {
    expect(labelOf("e^{x}")).toBe("𝑦 = 𝑒^𝑥");
    expect(labelOf("x^{x+1}")).toBe("𝑦 = 𝑥^(𝑥 + 1)");
    expect(labelOf("2^{0.5x}")).toBe("𝑦 = 2^(0.5𝑥)");
  });

  it("keeps a fraction beside another factor in brackets, so it can't be misread", () => {
    expect(labelOf("\\frac12x")).toBe("𝑦 = (1/2)𝑥");
  });
});
