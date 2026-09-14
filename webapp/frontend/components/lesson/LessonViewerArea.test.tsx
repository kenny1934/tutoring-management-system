import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode, Ref } from "react";
import type { AnnotationTools } from "@/hooks/useAnnotationTools";
import { lessonDraftId } from "@/hooks/useAnnotations";
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
// It also keeps the props each viewer was last given, by that name.
const { viewerProps } = vi.hoisted(() => ({ viewerProps: new Map<string | undefined, Record<string, unknown>>() }));
vi.mock("./PdfPageViewer", () => ({
  PdfPageViewer: (props: { exerciseLabel?: string }) => {
    viewerProps.set(props.exerciseLabel, props);
    if (props.exerciseLabel === "Crashes") throw new Error("pdf.js gave up");
    return <p>{props.exerciseLabel}</p>;
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

// The lesson's own Draft, for lesson 100.
const LESSON_DRAFT = lessonDraftId(100);

/**
 * The exercise's Draft open or shut, and the lesson's own Draft on screen or
 * not. The view has a lesson's Draft to open unless it's given null, as on a phone.
 */
const draftState = (open: boolean, lessonDraftOpen = false, ownDraft: number | null = LESSON_DRAFT): AreaProps["draft"] => ({
  draftOpen: open, toggleDraft: vi.fn(), closeDraft: vi.fn(), trayArea: undefined, setTrayArea: vi.fn(),
  lessonDraftId: ownDraft, lessonDraftOpen, openLessonDraft: vi.fn(), closeLessonDraft: vi.fn(),
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
      tools: {} as AnnotationTools, annotations: {}, openHasInk: false, onPageStrokesChange: vi.fn(), onPagesStrokesChange: vi.fn(),
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

  it("gives the answer key a Cover button, and keeps its views apart from the worksheet's", () => {
    renderArea({ answer: openAnswerKey() });
    const worksheet = viewerProps.get("Linear equations 3")!;
    const answers = viewerProps.get("ANS: Linear equations 3")!;
    expect(answers.coverButton).toBe(true);
    expect(worksheet.coverButton).toBeFalsy();
    // Its views are kept per exercise, in a map of its own.
    expect(answers.viewKey).toBe(1001);
    expect(answers.viewStates).toBeInstanceOf(Map);
    expect(answers.viewStates).not.toBe(worksheet.viewStates);
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

  it("shows the lesson's own Draft in the worksheet's place, with the answer key put away", () => {
    const draft = draftState(false, true);
    renderArea({ draft, answer: openAnswerKey() });
    expect(screen.getByRole("region", { name: "Draft" })).toHaveTextContent(`Draft sheets for exercise ${LESSON_DRAFT}`);
    expect(screen.queryByText("Linear equations 3")).toBeNull();
    expect(screen.queryByText("ANS: Linear equations 3")).toBeNull();
    // It has a Pen Tray of its own, so it needs no lane over the worksheet.
    expect(screen.queryByTestId("tray-lane")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close the draft" }));
    expect(draft.closeLessonDraft).toHaveBeenCalledTimes(1);
  });

  it("offers the lesson's own Draft from the worksheet's viewer when there's nothing to show", () => {
    const draft = draftState(false);
    renderArea({ draft, exercise: null, exerciseLabel: "Nothing open" });
    const { emptyAction } = viewerProps.get("Nothing open") as { emptyAction: ReactNode };
    render(<>{emptyAction}</>);

    fireEvent.click(screen.getByRole("button", { name: "Open the lesson draft" }));
    expect(draft.openLessonDraft).toHaveBeenCalledTimes(1);
  });

  it("offers no lesson draft where the view has none to open, as on a phone", () => {
    renderArea({ isMobile: true, draft: draftState(false, false, null), exercise: null, exerciseLabel: "On a phone" });
    expect(viewerProps.get("On a phone")!.emptyAction).toBeUndefined();
  });
});
