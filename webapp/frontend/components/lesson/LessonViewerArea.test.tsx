import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Ref } from "react";
import type { AnnotationTools } from "@/hooks/useAnnotationTools";
import type { SessionExercise } from "@/types";

// The real Draft needs a full set of pen tools, and DraftPane has tests of its own.
vi.mock("./DraftPane", () => ({
  DraftPane: ({ exerciseId, onClose }: { exerciseId: number; onClose: () => void }) => (
    <section aria-label="Draft">
      Draft sheets for exercise {exerciseId}
      <button onClick={onClose}>Close the draft</button>
    </section>
  ),
  DraftTrayLane: ({ ref }: { ref: Ref<HTMLDivElement> }) => <div ref={ref} data-testid="tray-lane" />,
}));

// PdfPageViewer needs a canvas that jsdom doesn't have. The stub shows the
// name it was handed, and a worksheet called "Crashes" throws as pdf.js can.
vi.mock("./PdfPageViewer", () => ({
  PdfPageViewer: ({ exerciseLabel }: { exerciseLabel?: string }) => {
    if (exerciseLabel === "Crashes") throw new Error("pdf.js gave up");
    return <p>{exerciseLabel}</p>;
  },
}));

import { LessonViewerArea } from "./LessonViewerArea";

type AreaProps = Parameters<typeof LessonViewerArea>[0];

const linear = { id: 1001, pdf_name: "Algebra\\Linear equations 3.pdf" } as SessionExercise;

/** An answer key that's open, with its file loaded. */
const openAnswerKey = (overrides: Partial<AreaProps["answer"]> = {}): AreaProps["answer"] => ({
  showAnswerKey: true, toggleAnswerKey: vi.fn(), answerKeyFound: true, answerKeySearching: false,
  answerPdfData: new ArrayBuffer(8), answerPageNumbers: [], answerLoading: false, answerError: null,
  mobileActiveTab: "exercise", setMobileActiveTab: vi.fn(),
  ...overrides,
});

/** The Draft, open or shut. */
const draftState = (open: boolean): AreaProps["draft"] => ({
  draftOpen: open, toggleDraft: vi.fn(), closeDraft: vi.fn(), trayArea: undefined, setTrayArea: vi.fn(),
});

function renderArea(overrides: Partial<AreaProps> = {}) {
  const props: AreaProps = {
    isMobile: false,
    exercise: linear,
    exerciseLabel: "Linear equations 3",
    pdf: {
      pdfData: new ArrayBuffer(8), pageNumbers: [], pdfLoading: false, pdfLoadingMessage: null, pdfError: null, retry: vi.fn(),
    },
    answer: openAnswerKey({ showAnswerKey: false, answerPdfData: null }),
    draft: draftState(false),
    ink: {
      tools: {} as AnnotationTools, annotations: {}, openHasInk: false, onPageStrokesChange: vi.fn(),
      onUndo: vi.fn(), onRedo: vi.fn(), onClearAll: vi.fn(), onClearPage: vi.fn(), onClearPages: vi.fn(),
    },
    stamp: undefined,
    onSaveAnnotated: vi.fn(),
    onPrint: undefined,
    printing: { id: null, progress: null },
    emptyMessage: undefined,
    toolbarStart: null,
    worksheetRef: null,
    ...overrides,
  };
  render(<LessonViewerArea {...props} />);
  return props;
}

describe("LessonViewerArea", () => {
  it("shows the worksheet, with whatever the view puts above it", () => {
    renderArea({ top: <p>Chan Tai Man</p> });
    expect(screen.getByText("Chan Tai Man")).toBeInTheDocument();
    expect(screen.getByText("Linear equations 3")).toBeInTheDocument();
  });

  it("shows a link in the worksheet's place", () => {
    renderArea({ link: <p>The video</p> });
    expect(screen.getByText("The video")).toBeInTheDocument();
    expect(screen.queryByText("Linear equations 3")).toBeNull();
  });

  it("offers Try again when the worksheet's viewer crashes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const props = renderArea({ exerciseLabel: "Crashes" });
    expect(screen.getByText("Something went wrong rendering the PDF")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.pdf.retry).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("puts the answer key beside the worksheet on a big screen, named after it", () => {
    renderArea({ answer: openAnswerKey() });
    expect(screen.getByText("Linear equations 3")).toBeInTheDocument();
    expect(screen.getByText("ANS: Linear equations 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Answer Key" })).toBeNull();
  });

  it("puts the worksheet and the answer key on tabs on a phone", () => {
    const setMobileActiveTab = vi.fn();
    renderArea({ isMobile: true, answer: openAnswerKey({ mobileActiveTab: "answer", setMobileActiveTab }) });
    expect(screen.getByText("ANS: Linear equations 3")).toBeInTheDocument();
    expect(screen.queryByText("Linear equations 3")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Exercise" }));
    expect(setMobileActiveTab).toHaveBeenCalledWith("exercise");
  });

  it("leaves out a phone's tabs until the answer key's file has loaded", () => {
    renderArea({ isMobile: true, answer: openAnswerKey({ answerPdfData: null, answerLoading: true }) });
    expect(screen.queryByRole("button", { name: "Answer Key" })).toBeNull();
    expect(screen.getByText("Linear equations 3")).toBeInTheDocument();
  });

  it("opens the Draft beside the worksheet with the Pen Tray's lane, and closes it", () => {
    const draft = draftState(true);
    renderArea({ draft, answer: openAnswerKey() });
    expect(screen.getByRole("region", { name: "Draft" })).toHaveTextContent("Draft sheets for exercise 1001");
    expect(draft.setTrayArea).toHaveBeenCalledWith(screen.getByTestId("tray-lane"));
    expect(screen.getByText("Linear equations 3")).toBeInTheDocument();
    expect(screen.getByText("ANS: Linear equations 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close the draft" }));
    expect(draft.closeDraft).toHaveBeenCalledTimes(1);
  });

  it("shows no Draft while it's shut", () => {
    renderArea();
    expect(screen.queryByRole("region", { name: "Draft" })).toBeNull();
    expect(screen.queryByTestId("tray-lane")).toBeNull();
  });
});
