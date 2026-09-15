import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { DraftPane } from "./DraftPane";
import { FoldingAnswerKey } from "./FoldingAnswerKey";
import { useAnnotationTools, type AnnotationTools } from "@/hooks/useAnnotationTools";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";
import { DRAFT_PAGE_BASE, DRAFT_SHEET, DRAFT_SQUARE, draftSheetsInUse, draftSquared } from "@/lib/draft-sheets";

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

describe("DraftPane zoom", () => {
  const zoomLevel = () => screen.getByText(/^\d+%$/);

  it("opens at fit to width, steps by a quarter with the buttons, and the board remembers the choice", () => {
    // A pane 1000 pixels across fits an A4 sheet at 111%.
    const width = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(1000);
    try {
      render(<Harness />);
      expect(zoomLevel()).toHaveTextContent("111%");

      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      expect(zoomLevel()).toHaveTextContent("136%");
      expect(localStorage.getItem("csm_draft_zoom")).toBe("136");

      fireEvent.click(screen.getByRole("button", { name: "Fit to width" }));
      expect(zoomLevel()).toHaveTextContent("111%");
      expect(localStorage.getItem("csm_draft_zoom")).toBe("fit");
    } finally {
      width.mockRestore();
    }
  });

  it("opens at the zoom the board last used, with the sheets at A4 and the column scaled", () => {
    localStorage.setItem("csm_draft_zoom", "75");
    render(<Harness />);
    expect(zoomLevel()).toHaveTextContent("75%");
    const sheet = sheets()[0];
    expect(sheet.style.width).toBe(`${DRAFT_SHEET.width}px`);
    expect(sheet.parentElement!.style.transform).toBe("scale(0.75)");
  });
});

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

  it("snaps a straight line's start to a corner of the squares on squared paper, and not on blank paper", () => {
    const onChange = vi.fn();
    let tools!: AnnotationTools;
    render(<Harness onChange={onChange} onTools={(t) => { tools = t; }} />);
    act(() => tools.toggleStraight());
    // The sheet is drawn 100 pixels across and 100 down here, so a pixel is
    // about 8.9 page units across and 12.6 down. Each line runs across to x = 30.
    const drawFrom = (x: number, y: number) => {
      const svg = sheets()[0].querySelector("svg")!;
      fireEvent.pointerDown(svg, { clientX: x, clientY: y, pointerId: 1 });
      fireEvent.pointerMove(svg, { clientX: 30, clientY: y, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 30, clientY: y, pointerId: 1 });
      return (onChange.mock.lastCall![1] as Stroke[]).at(-1)!.points[0];
    };

    // Near the corner 1 cm in from the top-left, on blank paper, the line starts where the finger went down.
    const [blankX] = drawFrom(5, 3.5);
    expect(blankX).not.toBeCloseTo(DRAFT_SQUARE);

    // Near the corner 4 cm in, well away from that first line, squared paper puts the start on the corner.
    fireEvent.click(screen.getByRole("button", { name: "Squared" }));
    const [x, y] = drawFrom(19.3, 13.6);
    expect(x).toBeCloseTo(4 * DRAFT_SQUARE);
    expect(y).toBeCloseTo(4 * DRAFT_SQUARE);
    // Squared paper is one remembered setting, so it's put back for the other tests.
    fireEvent.click(screen.getByRole("button", { name: "Blank" }));
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

  it("leaves the Pen Tray and the dark switch to the worksheet when it sits beside one", () => {
    render(<Harness />);
    expect(screen.queryByRole("toolbar", { name: "Annotation tools" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dark PDF mode" })).toBeNull();
  });

  it("gives the lesson's own Draft the board's one dark switch", () => {
    render(<Harness title="Lesson draft" ownTray={{}} />);
    const dark = screen.getByRole("button", { name: "Dark PDF mode" });
    expect(dark).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(dark);
    expect(dark).toHaveAttribute("aria-pressed", "true");
    // It's the same setting the worksheet's button flips, so it's put back for the other tests.
    fireEvent.click(dark);
    expect(dark).toHaveAttribute("aria-pressed", "false");
  });

  describe("drawing axes", () => {
    const placingLayer = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-axes-placing]");
    const startPlacing = () => {
      openTools();
      fireEvent.click(screen.getByRole("menuitem", { name: "Draw axes" }));
      fireEvent.click(screen.getByRole("button", { name: "Place the axes" }));
    };
    // The crossing of the two pencil lines, which are the axis lines.
    const crossingOf = (strokes: Stroke[]) => {
      const lines = strokes.filter((s) => s.kind === "pencil");
      const across = lines.find((s) => s.points[0][1] === s.points[1][1])!;
      const up = lines.find((s) => s.points[0][0] === s.points[1][0])!;
      return [up.points[0][0], across.points[0][1]];
    };

    it("opens the axes panel from the Tools menu, and Place the axes asks for a tap", () => {
      render(<Harness />);
      openTools();
      fireEvent.click(screen.getByRole("menuitem", { name: "Draw axes" }));
      expect(screen.getByRole("dialog", { name: "Axes" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Place the axes" }));
      expect(screen.queryByRole("dialog", { name: "Axes" })).toBeNull();
      expect(screen.getByText("Tap where the axes should cross.")).toBeInTheDocument();
    });

    it("draws the axes in one change on the sheet that was tapped, crossing at the corner of the squares nearest the tap", () => {
      const onChange = vi.fn();
      const { container } = render(<Harness onChange={onChange} initial={{ [DRAFT_PAGE_BASE]: [line()] }} />);
      fireEvent.click(screen.getByRole("button", { name: "Squared" }));
      startPlacing();

      // The sheet is drawn 100 pixels each way here, so (40, 40) is 8.4 squares across and 11.9 down.
      const layer = placingLayer(container)!;
      fireEvent.pointerDown(layer, { clientX: 40, clientY: 40, pointerId: 1 });
      expect(container.querySelector("[data-axes-preview]")).not.toBeNull();
      fireEvent.pointerUp(layer, { clientX: 40, clientY: 40, pointerId: 1 });

      expect(onChange).toHaveBeenCalledTimes(1);
      const [pageIndex, strokes] = onChange.mock.calls[0] as [number, Stroke[]];
      expect(pageIndex).toBe(DRAFT_PAGE_BASE);
      // The ink already on the sheet stays, with the axes after it.
      expect(strokes[0]).toEqual(line());
      expect(strokes.filter((s) => s.kind === "scale").length).toBeGreaterThan(20);
      const [x, y] = crossingOf(strokes);
      expect(x).toBeCloseTo(8 * DRAFT_SQUARE);
      expect(y).toBeCloseTo(12 * DRAFT_SQUARE);

      // Placing is over, so the hint and the layer have gone.
      expect(screen.queryByText("Tap where the axes should cross.")).toBeNull();
      expect(placingLayer(container)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Blank" }));
    });

    it("moves the axes with a drag before the finger lifts, and puts them exactly there on blank paper", () => {
      const onChange = vi.fn();
      const { container } = render(<Harness onChange={onChange} />);
      startPlacing();
      const layer = placingLayer(container)!;
      fireEvent.pointerDown(layer, { clientX: 20, clientY: 20, pointerId: 1 });
      fireEvent.pointerMove(layer, { clientX: 40, clientY: 50, pointerId: 1 });
      fireEvent.pointerUp(layer, { clientX: 40, clientY: 50, pointerId: 1 });

      const [x, y] = crossingOf(onChange.mock.calls[0][1] as Stroke[]);
      expect(x).toBeCloseTo(0.4 * DRAFT_SHEET.width);
      expect(y).toBeCloseTo(0.5 * DRAFT_SHEET.height);
    });

    it("stops placing on Escape without drawing anything, and keeps Escape from the lesson", () => {
      const onChange = vi.fn();
      const lessonKeys = vi.fn();
      render(<Harness onChange={onChange} />);
      startPlacing();
      window.addEventListener("keydown", lessonKeys);
      fireEvent.keyDown(document.body, { key: "Escape" });
      window.removeEventListener("keydown", lessonKeys);

      expect(screen.queryByText("Tap where the axes should cross.")).toBeNull();
      expect(lessonKeys).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("stops placing from the hint's Cancel button, and closes the panel on Escape", () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      startPlacing();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Tap where the axes should cross.")).toBeNull();

      openTools();
      fireEvent.click(screen.getByRole("menuitem", { name: "Draw axes" }));
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Axes" })).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("lets the pen draw nothing while the axes are being placed", () => {
      const onChange = vi.fn();
      let tools!: AnnotationTools;
      const { container } = render(<Harness onChange={onChange} onTools={(t) => { tools = t; }} />);
      act(() => tools.selectSwatch("blue"));
      startPlacing();

      const svg = sheets()[0].querySelector("svg")!;
      fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(svg, { clientX: 50, clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 50, clientY: 40, pointerId: 1 });
      expect(onChange).not.toHaveBeenCalled();

      // The tap goes to the axes, and no pen stroke comes with them.
      const layer = placingLayer(container)!;
      fireEvent.pointerDown(layer, { clientX: 40, clientY: 40, pointerId: 2 });
      fireEvent.pointerUp(layer, { clientX: 40, clientY: 40, pointerId: 2 });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect((onChange.mock.calls[0][1] as Stroke[]).every((s) => s.kind === "pencil" || s.kind === "scale")).toBe(true);
    });

    it("remembers the axes' settings on this board, and opens with them next time", () => {
      render(<Harness />);
      openTools();
      fireEvent.click(screen.getByRole("menuitem", { name: "Draw axes" }));
      const xAxis = within(screen.getByRole("region", { name: "x axis" }));
      fireEvent.click(within(xAxis.getByRole("group", { name: "To" })).getByRole("button", { name: "One square higher" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(JSON.parse(localStorage.getItem("csm_draft_axes")!).x.to).toBe(6);

      openTools();
      fireEvent.click(screen.getByRole("menuitem", { name: "Draw axes" }));
      expect(within(screen.getByRole("region", { name: "x axis" })).getByRole("textbox", { name: "To" })).toHaveValue("6");
    });
  });

  it("takes the lesson's own Draft's name, the view's buttons and a Pen Tray of its own", () => {
    const onRedo = vi.fn();
    render(
      <Harness title="Lesson draft" barStart={<button type="button">Students</button>} ownTray={{ onRedo }} />,
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
