import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { PlotPanel } from "./PlotPanel";
import { DEFAULT_AXES, withDegrees, type AxesSettings } from "@/lib/axes";
import { readFunction, type AngleUnit } from "@/lib/plot-expression";

// The real MathLive needs a browser's layout. Without it, the field is a plain element whose value the tests set.
vi.mock("mathlive", () => ({}));

function Harness({ initial = "", axes = DEFAULT_AXES, onPlot = vi.fn(), onClose = vi.fn() }: {
  initial?: string;
  axes?: AxesSettings;
  onPlot?: () => void;
  onClose?: () => void;
}) {
  const [latex, setLatex] = useState(initial);
  const [unit, setUnit] = useState<AngleUnit>("degrees");
  return (
    <PlotPanel
      latex={latex}
      onLatexChange={setLatex}
      reading={readFunction(latex)}
      unit={unit}
      onUnitChange={setUnit}
      axes={axes}
      onPlot={onPlot}
      onClose={onClose}
    />
  );
}

const field = () => screen.findByLabelText("Function of x") as Promise<HTMLElement & { value: string }>;
const type = async (latex: string) => {
  const box = await field();
  box.value = latex;
  fireEvent.input(box);
};

describe("PlotPanel", () => {
  it("asks for a function of x, and keeps Plot greyed out until the function can be plotted", async () => {
    const onPlot = vi.fn();
    render(<Harness onPlot={onPlot} />);
    const plot = screen.getByRole("button", { name: "Plot" });
    expect(screen.getByText("Type a function of x, such as y = x² − 2x − 3.")).toBeInTheDocument();
    expect(plot).toBeDisabled();

    await type("\\frac{1}{\\placeholder{}}");
    expect(screen.getByText("This can't be plotted yet. Check for an empty box or a missing bracket.")).toBeInTheDocument();
    expect(plot).toBeDisabled();

    await type("x^2");
    expect(plot).toBeEnabled();
    fireEvent.click(plot);
    expect(onPlot).toHaveBeenCalledTimes(1);
  });

  it("plots on Enter in the field, but only once the function can be plotted", async () => {
    const onPlot = vi.fn();
    render(<Harness onPlot={onPlot} />);
    await type("x^");
    fireEvent.keyDown(await field(), { key: "Enter" });
    expect(onPlot).not.toHaveBeenCalled();
    await type("x^2");
    fireEvent.keyDown(await field(), { key: "Enter" });
    expect(onPlot).toHaveBeenCalledTimes(1);
  });

  it("starts with the function typed last", async () => {
    render(<Harness initial="\sin x" />);
    expect((await field()).value).toBe("\\sin x");
    expect(screen.getByRole("button", { name: "Plot" })).toBeEnabled();
  });

  it("names the axes it plots on, with an axis's scale only when it isn't 1 a square", () => {
    const { rerender } = render(<Harness />);
    expect(screen.getByText("Plots on the last axes drawn here: x from −5 to 5 and y from −5 to 5.")).toBeInTheDocument();

    rerender(<Harness axes={{ ...DEFAULT_AXES, x: { ...DEFAULT_AXES.x, perSquare: 2 } }} />);
    expect(screen.getByText("Plots on the last axes drawn here: x from −10 to 10 at 2 a square and y from −5 to 5.")).toBeInTheDocument();

    rerender(<Harness axes={{ ...DEFAULT_AXES, x: { ...withDegrees(DEFAULT_AXES.x, true), from: 0, to: 12 } }} />);
    expect(screen.getByText("Plots on the last axes drawn here: x from 0° to 360° at 30° a square and y from −5 to 5.")).toBeInTheDocument();
  });

  it("switches between degrees and radians, and closes from Cancel", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Degrees" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Radians" }));
    expect(screen.getByRole("button", { name: "Radians" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Degrees" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
