import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { DraftPane } from "./DraftPane";
import { FoldingAnswerKey } from "./FoldingAnswerKey";
import { useAnnotationTools, type AnnotationTools } from "@/hooks/useAnnotationTools";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";
import { DRAFT_PAGE_BASE, draftSheetsInUse, draftSquared } from "@/lib/draft-sheets";

// The drawing layer maps pointer positions through its on-screen box, which
// jsdom doesn't lay out, so give every element a 100 by 100 box at the origin.
const originalRect = Element.prototype.getBoundingClientRect;
const originalCapture = Element.prototype.setPointerCapture;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Element.prototype.setPointerCapture = () => {};
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect;
  Element.prototype.setPointerCapture = originalCapture;
});
beforeEach(() => localStorage.clear());

const line = (): Stroke => ({ points: [[0, 0, 0.5], [10, 10, 0.5]], color: "#000", size: 3 });

function Harness({ initial = {}, onChange = vi.fn(), onTools }: {
  initial?: PageAnnotations;
  onChange?: (pageIndex: number, strokes: Stroke[]) => void;
  onTools?: (tools: AnnotationTools) => void;
}) {
  const tools = useAnnotationTools();
  onTools?.(tools);
  const [annotations, setAnnotations] = useState(initial);
  return (
    <DraftPane
      exerciseId={7}
      annotations={annotations}
      tools={tools}
      onClose={() => {}}
      onPageStrokesChange={(pageIndex, strokes) => {
        onChange(pageIndex, strokes);
        setAnnotations((prev) => ({ ...prev, [pageIndex]: strokes }));
      }}
    />
  );
}

const sheets = () => screen.getAllByLabelText(/^Draft sheet \d+$/);

describe("DraftPane", () => {
  it("starts with one sheet, and keeps its ink as the exercise's page 1000", () => {
    const onChange = vi.fn();
    let tools!: AnnotationTools;
    render(<Harness onChange={onChange} onTools={(t) => { tools = t; }} />);
    expect(sheets()).toHaveLength(1);

    act(() => tools.selectSwatch("blue"));
    const svg = sheets()[0].querySelector("svg")!;
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 50, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 50, clientY: 40, pointerId: 1 });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(DRAFT_PAGE_BASE);
  });

  it("shows every sheet up to the last one with ink, and adds another on request", () => {
    render(<Harness initial={{ [DRAFT_PAGE_BASE + 2]: [line()] }} />);
    expect(sheets()).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: /Add a sheet/ }));
    expect(sheets()).toHaveLength(4);
  });

  it("switches every sheet between blank and squared paper, and remembers it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Squared" }));
    expect(draftSquared.get()).toBe(true);
    expect(screen.getByRole("button", { name: "Squared" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Blank" }));
    expect(draftSquared.get()).toBe(false);
  });
});

describe("draftSheetsInUse", () => {
  it("counts up to the last sheet with ink, ignoring the worksheet's pages and empty sheets", () => {
    expect(draftSheetsInUse({})).toBe(0);
    expect(draftSheetsInUse({ 0: [line()], [DRAFT_PAGE_BASE + 4]: [] })).toBe(0);
    expect(draftSheetsInUse({ 0: [line()], [DRAFT_PAGE_BASE + 1]: [line()] })).toBe(2);
  });
});

describe("FoldingAnswerKey", () => {
  it("starts slid in over the Draft, and its tab slides it away and back", () => {
    render(<FoldingAnswerKey><p>The answers</p></FoldingAnswerKey>);
    const tab = screen.getByRole("button", { name: /Answers/ });
    expect(tab).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(tab);
    expect(tab).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("The answers").parentElement).toHaveClass("invisible");

    fireEvent.click(tab);
    expect(tab).toHaveAttribute("aria-expanded", "true");
  });
});
