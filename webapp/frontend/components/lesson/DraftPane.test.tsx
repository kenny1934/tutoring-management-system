import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
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

function Harness({ initial = {}, onChange = vi.fn(), onTools, onClearPages = vi.fn(), onUndo, ...rest }: {
  initial?: PageAnnotations;
  onChange?: (pageIndex: number, strokes: Stroke[]) => void;
  onTools?: (tools: AnnotationTools) => void;
  onClearPages?: (pageIndices: number[]) => void;
  onUndo?: () => void;
} & Pick<ComponentProps<typeof DraftPane>, "title" | "barStart" | "ownTray">) {
  const tools = useAnnotationTools();
  onTools?.(tools);
  const [annotations, setAnnotations] = useState(initial);
  return (
    <DraftPane
      {...rest}
      exerciseId={7}
      annotations={annotations}
      tools={tools}
      onClose={() => {}}
      onPageStrokesChange={(pageIndex, strokes) => {
        onChange(pageIndex, strokes);
        setAnnotations((prev) => ({ ...prev, [pageIndex]: strokes }));
      }}
      onClearPages={(pages) => {
        onClearPages(pages);
        setAnnotations((prev) => {
          const next = { ...prev };
          for (const page of pages) delete next[page];
          return next;
        });
      }}
      onUndo={onUndo}
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

  it("clears the sheet in view from the Clear menu, then offers to undo it", () => {
    const onClearPages = vi.fn();
    const onUndo = vi.fn();
    render(
      <Harness
        initial={{ [DRAFT_PAGE_BASE]: [line()], [DRAFT_PAGE_BASE + 1]: [line()] }}
        onClearPages={onClearPages}
        onUndo={onUndo}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Clear this sheet/ }));

    expect(onClearPages).toHaveBeenCalledWith([DRAFT_PAGE_BASE]);
    expect(screen.getByRole("status")).toHaveTextContent("Sheet 1 of the draft was cleared.");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("clears every sheet at once, and goes back to a single sheet", () => {
    const onClearPages = vi.fn();
    render(<Harness initial={{ [DRAFT_PAGE_BASE]: [line()], [DRAFT_PAGE_BASE + 2]: [line()] }} onClearPages={onClearPages} />);
    fireEvent.click(screen.getByRole("button", { name: /Add a sheet/ }));
    expect(sheets()).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear the draft" }));

    expect(onClearPages).toHaveBeenCalledWith([DRAFT_PAGE_BASE, DRAFT_PAGE_BASE + 2]);
    expect(sheets()).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("The draft was cleared.");
  });

  const openTools = () => fireEvent.click(screen.getByRole("button", { name: "Tools" }));

  it("puts a ruler on the draft from its Tools menu, and takes it away again", () => {
    render(<Harness />);
    openTools();
    fireEvent.click(screen.getByRole("menuitem", { name: "Show the ruler" }));
    expect(screen.getByRole("group", { name: /^Ruler:/ })).toBeInTheDocument();

    openTools();
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide the ruler" }));
    expect(screen.queryByRole("group", { name: /^Ruler:/ })).toBeNull();
  });

  it("puts the protractor and the compasses out together from the same menu, and each has its own X", () => {
    render(<Harness />);
    openTools();
    fireEvent.click(screen.getByRole("menuitem", { name: "Show the protractor" }));
    openTools();
    fireEvent.click(screen.getByRole("menuitem", { name: "Show the compasses" }));
    expect(screen.getByRole("group", { name: /^Protractor:/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /^Compasses:/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide the compasses" }));
    expect(screen.queryByRole("group", { name: /^Compasses:/ })).toBeNull();
    expect(screen.getByRole("group", { name: /^Protractor:/ })).toBeInTheDocument();
  });

  it("greys out Clear while the draft has no ink", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  });

  it("leaves the Pen Tray to the worksheet when it sits beside one", () => {
    render(<Harness />);
    expect(screen.queryByRole("toolbar", { name: "Annotation tools" })).toBeNull();
  });

  it("takes the lesson's own Draft's name, the view's buttons and a Pen Tray of its own", () => {
    const onRedo = vi.fn();
    render(
      <Harness title="Lesson draft" barStart={<button type="button">Students</button>} ownTray={{ onRedo, hasInk: false }} />,
    );
    expect(screen.getByRole("region", { name: "Lesson draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close the lesson draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Students" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Annotation tools" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(onRedo).toHaveBeenCalledTimes(1);
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

  it("marks itself while it's slid in, so the Pen Tray's lane can keep to the worksheet", () => {
    render(<FoldingAnswerKey><p>The answers</p></FoldingAnswerKey>);
    const panel = screen.getByText("The answers").parentElement;
    expect(panel).toHaveAttribute("data-answers-out");

    fireEvent.click(screen.getByRole("button", { name: /Answers/ }));
    expect(panel).not.toHaveAttribute("data-answers-out");
  });
});
