import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import type { Session, SessionExercise } from "@/types";
import type { LessonInkPageIn } from "@/lib/api";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";
import type { AnnotationTools } from "@/hooks/useAnnotationTools";
import type { PrintStampInfo } from "@/lib/pdf-utils";

// These tests pin down what the two lesson views do today, so the work of
// moving their shared parts into hooks can't change it without a test
// failing. Everything a view reaches outside itself is replaced below: the
// files it loads, the answer key search, the ink saved to the server,
// printing, and the heavier panels. PdfPageViewer needs a canvas that jsdom
// doesn't have, so a stub stands in for it and reports what the view handed it.

const h = vi.hoisted(() => ({
  showToast: vi.fn(),
  loadExercisePdf: vi.fn(),
  prefetchPdfs: vi.fn(),
  searchAnswerFile: vi.fn(),
  inkRead: vi.fn(),
  inkSave: vi.fn(),
  inkSaveOnExit: vi.fn(),
  printFile: vi.fn(),
  printBlob: vi.fn(),
  bulkPrint: vi.fn(),
  saveAnnotatedPdf: vi.fn(),
  downloadBlob: vi.fn(),
  markHomework: vi.fn(),
  noHomework: new Map(),
}));

vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock("@/contexts/ConfirmContext", () => ({ useConfirm: () => async () => true }));
vi.mock("@/contexts/LocationContext", () => ({ useLocation: () => ({ selectedLocation: "MSA" }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { email: "tutor@example.com" } }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  lessonInkAPI: { read: h.inkRead, save: h.inkSave, saveOnExit: h.inkSaveOnExit },
}));
vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks")>()),
  useStudentHomework: () => ({ byExercise: h.noHomework }),
  useHomeworkToCheck: () => ({ bySession: h.noHomework }),
}));
vi.mock("@/components/homework/useHomeworkMarked", () => ({ useHomeworkMarked: () => h.markHomework }));
vi.mock("@/lib/lesson-pdf-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lesson-pdf-loader")>()),
  loadExercisePdf: h.loadExercisePdf,
  prefetchPdfs: h.prefetchPdfs,
}));
vi.mock("@/lib/answer-file-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/answer-file-utils")>()),
  searchAnswerFile: h.searchAnswerFile,
}));
vi.mock("@/lib/file-system", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/file-system")>()),
  printFileFromPathWithFallback: h.printFile,
  printPdfBlob: h.printBlob,
}));
vi.mock("@/lib/bulk-exercise-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bulk-exercise-download")>()),
  bulkPrintAllStudents: h.bulkPrint,
}));
vi.mock("@/lib/pdf-annotation-save", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pdf-annotation-save")>()),
  saveAnnotatedPdf: h.saveAnnotatedPdf,
}));
vi.mock("@/lib/geometry-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/geometry-utils")>()),
  downloadBlob: h.downloadBlob,
}));

interface ViewerProps {
  exerciseLabel?: string;
  isLoading: boolean;
  error: string | null;
  stamp?: PrintStampInfo;
  annotations?: PageAnnotations;
  onPageStrokesChange?: (pageIndex: number, strokes: Stroke[]) => void;
  tools?: AnnotationTools;
  answerKeyAvailable?: boolean;
  answerKeySearching?: boolean;
  onRetry?: () => void;
}

// The worksheet viewer is the one that takes ink, and the answer key's doesn't.
vi.mock("./PdfPageViewer", () => ({
  PAGE_BAR_HEIGHT: 49,
  toolbarRow: "",
  tbBtn: "",
  tbBtnIdle: "",
  tbBtnOn: "",
  PdfPageViewer: (props: ViewerProps) => {
    const onStrokes = props.onPageStrokesChange;
    const strokes = props.annotations?.[0] ?? [];
    const stroke: Stroke = { points: [[10, 10, 0.5], [20, 20, 0.5]], color: "#000000", size: 3 };
    return (
      <section data-testid={onStrokes ? "worksheet" : "answer-key"}>
        <p>{props.exerciseLabel}</p>
        {props.isLoading && <p>Loading</p>}
        {props.error && <p>{props.error}</p>}
        {props.stamp && <p>Stamped for {props.stamp.studentName}</p>}
        {onStrokes && <p>Strokes on the first page: {strokes.length}</p>}
        {onStrokes && <p>{props.tools?.drawingEnabled ? "Drawing" : "On the Hand"}</p>}
        {props.answerKeySearching && <p>Looking for the answer key</p>}
        {props.answerKeyAvailable && <p>Answer key found</p>}
        {onStrokes && <button onClick={() => onStrokes(0, [...strokes, stroke])}>Draw a stroke</button>}
        {props.onRetry && <button onClick={props.onRetry}>Try again</button>}
      </section>
    );
  },
}));
vi.mock("./WolframPanel", () => ({
  WolframPanel: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="wolfram" /> : null),
}));
vi.mock("@/components/sessions/ExerciseModal", () => ({
  ExerciseModal: ({ session, exerciseType, readOnly, onClose }: {
    session: Session; exerciseType: string; readOnly?: boolean; onClose: () => void;
  }) => (
    <div data-testid="exercise-editor">
      {`${exerciseType} for ${session.student_name}${readOnly ? ", read only" : ""}`}
      <button onClick={onClose}>Close the editor</button>
    </div>
  ),
}));
vi.mock("@/components/sessions/BulkExerciseModal", () => ({ BulkExerciseModal: () => null }));
vi.mock("./SummerCoursewarePanel", () => ({
  SummerCoursewarePanel: () => null,
  summerAssignButtonClass: "",
  SummerAssignIcon: () => null,
  ParallelChipsRow: () => null,
}));
vi.mock("./SummerCoursewareWidePanel", () => ({ SummerCoursewareWidePanel: () => null }));

import { LessonMode } from "./LessonMode";
import { LessonWideMode } from "./LessonWideMode";

// --- The lessons ---

const LINEAR = "Algebra\\Linear equations 3.pdf";
const QUADRATICS = "Algebra\\Quadratics 1.pdf";
const FACTORISING = "Algebra\\Factorising 2.pdf";
const LINEAR_ANSWERS = "Algebra\\ANS Linear equations 3.pdf";

function exercise(id: number, sessionId: number, type: "CW" | "HW", pdfName: string): SessionExercise {
  return {
    id, session_id: sessionId, exercise_type: type, pdf_name: pdfName,
    page_start: null, page_end: null, remarks: null,
  } as unknown as SessionExercise;
}

function lesson(id: number, name: string, schoolId: string, exercises: SessionExercise[]): Session {
  return {
    id, student_id: id + 800, student_name: name, school_student_id: schoolId,
    grade: "F2", lang_stream: "E", lesson_number: 12, location: "MSA",
    session_date: "2026-09-11", time_slot: "16:45 - 18:15", tutor_name: "Ms Lee",
    exercises, homework_completion: [], previous_session: null,
  } as unknown as Session;
}

const chan = lesson(100, "Chan Tai Man", "1234", [
  exercise(1001, 100, "CW", LINEAR),
  exercise(1002, 100, "CW", QUADRATICS),
  exercise(1003, 100, "HW", FACTORISING),
]);
const wong = lesson(101, "Wong Siu Ming", "1235", [
  exercise(2001, 101, "CW", LINEAR),
  exercise(2002, 101, "HW", FACTORISING),
]);

function renderOneStudent(props: { isReadOnly?: boolean } = {}) {
  const onExit = vi.fn();
  render(<LessonMode session={chan} onExit={onExit} onSessionDataChange={() => {}} {...props} />);
  return { onExit };
}

function renderSlot(props: { isReadOnly?: boolean } = {}) {
  render(
    <LessonWideMode
      sessions={[chan, wong]}
      date="2026-09-11"
      slot="16:45 - 18:15"
      tutorId={7}
      onSessionDataChange={() => {}}
      {...props}
    />,
  );
}

// --- Helpers ---

const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key, ...init });
const worksheet = () => screen.getByTestId("worksheet");
const opened = (name: string) => waitFor(() => expect(worksheet()).toHaveTextContent(name));
/** Drawing waits until the lesson's ink has loaded, which the header reports. */
const inkLoaded = () => screen.findByText("Saved");
const drawAStroke = () => fireEvent.click(within(worksheet()).getByRole("button", { name: "Draw a stroke" }));
const strokesShown = () => within(worksheet()).getByText(/Strokes on the first page/).textContent;

/** The server takes every page it's sent, as it does when all is well. */
const saveEverything = async (pages: LessonInkPageIn[]) => ({
  saved: pages.map((page) => ({
    session_id: page.session_id, target_key: page.target_key, page_index: page.page_index, version: 1,
  })),
  dropped: [],
});

beforeAll(() => {
  // Panels that animate away would otherwise linger for a moment after closing.
  MotionGlobalConfig.skipAnimations = true;
});

beforeEach(() => {
  h.loadExercisePdf.mockReset().mockImplementation(async () => ({ data: new ArrayBuffer(8) }));
  h.prefetchPdfs.mockReset().mockReturnValue(() => {});
  h.searchAnswerFile.mockReset().mockResolvedValue(null);
  h.inkRead.mockReset().mockResolvedValue({ pages: [] });
  h.inkSave.mockReset().mockImplementation(saveEverything);
  h.inkSaveOnExit.mockReset();
  h.printFile.mockReset().mockResolvedValue(null);
  h.bulkPrint.mockReset().mockResolvedValue(null);
  h.saveAnnotatedPdf.mockReset().mockResolvedValue(new Blob());
  h.downloadBlob.mockReset();
  h.showToast.mockReset();
  sessionStorage.clear();
  localStorage.clear();
  // A desktop screen, unless a test says it's a phone.
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
  // jsdom would really close its window, which ends the test run.
  vi.spyOn(window, "close").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- What both views already do the same way ---

describe.each([
  { view: "the one-student view", mount: () => void renderOneStudent() },
  { view: "the multi-student view", mount: () => renderSlot() },
])("In $view", ({ mount }) => {
  it("opens the first worksheet and loads its file", async () => {
    mount();
    await opened("Linear equations 3");
    expect(h.loadExercisePdf).toHaveBeenCalledWith(LINEAR, expect.any(Function));
    await waitFor(() => expect(worksheet()).not.toHaveTextContent("Loading"));
  });

  it("loads the file again when Try again is pressed after it failed", async () => {
    h.loadExercisePdf.mockResolvedValueOnce({ error: "fetch_failed" });
    mount();
    await waitFor(() => expect(worksheet()).toHaveTextContent("Failed to download PDF"));
    fireEvent.click(within(worksheet()).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(worksheet()).not.toHaveTextContent("Failed to download PDF"));
    expect(h.loadExercisePdf.mock.calls.filter(([name]) => name === LINEAR)).toHaveLength(2);
  });

  it("undoes the last stroke with z and brings it back with Shift+Z", async () => {
    mount();
    await inkLoaded();
    drawAStroke();
    drawAStroke();
    expect(strokesShown()).toBe("Strokes on the first page: 2");
    press("z");
    expect(strokesShown()).toBe("Strokes on the first page: 1");
    press("Z", { shiftKey: true });
    expect(strokesShown()).toBe("Strokes on the first page: 2");
  });

  it("leaves keys held with Ctrl, Cmd or Alt to the browser, apart from undo", async () => {
    mount();
    await opened("Linear equations 3");
    await inkLoaded();
    press("j", { metaKey: true });
    press("f", { ctrlKey: true });
    press("w", { altKey: true });
    expect(worksheet()).toHaveTextContent("Linear equations 3");
    expect(screen.getByRole("button", { name: "Focus mode" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("wolfram")).toBeNull();

    drawAStroke();
    press("z", { ctrlKey: true });
    expect(strokesShown()).toBe("Strokes on the first page: 0");
  });

  it("opens the answer key with a once one has been found, and closes it with a", async () => {
    h.searchAnswerFile.mockResolvedValue({ path: LINEAR_ANSWERS, source: "local" });
    mount();
    await within(await screen.findByTestId("worksheet")).findByText("Answer key found");

    press("a");
    const answers = await screen.findByTestId("answer-key");
    expect(answers).toHaveTextContent("ANS: Linear equations 3");
    expect(h.loadExercisePdf).toHaveBeenCalledWith(LINEAR_ANSWERS);

    press("a");
    expect(screen.queryByTestId("answer-key")).toBeNull();
  });

  it("does nothing with a while no answer key has been found", async () => {
    mount();
    await opened("Linear equations 3");
    await waitFor(() => expect(worksheet()).not.toHaveTextContent("Looking for the answer key"));
    press("a");
    expect(screen.queryByTestId("answer-key")).toBeNull();
  });

  it("toggles the pen with d and the eraser with e, going back to the Hand each time", async () => {
    mount();
    await inkLoaded();
    expect(worksheet()).toHaveTextContent("On the Hand");
    press("d");
    expect(worksheet()).toHaveTextContent("Drawing");
    press("d");
    expect(worksheet()).toHaveTextContent("On the Hand");
    press("e");
    expect(worksheet()).toHaveTextContent("Drawing");
    press("e");
    expect(worksheet()).toHaveTextContent("On the Hand");
  });

  it("starts each drag of the sidebar's edge from the width the last one left", async () => {
    mount();
    await opened("Linear equations 3");
    const handle = document.querySelector(".cursor-col-resize") as HTMLElement;
    const sidebar = handle.previousElementSibling as HTMLElement;
    expect(sidebar.style.width).toBe("320px");

    const dragBy = async (distance: number, expected: number) => {
      fireEvent.mouseDown(handle, { clientX: 400 });
      fireEvent.mouseMove(document, { clientX: 400 + distance });
      await waitFor(() => expect(sidebar.style.width).toBe(`${expected}px`));
      fireEvent.mouseUp(document);
    };
    await dragBy(50, 370);
    await dragBy(50, 420);
    expect(localStorage.getItem("lesson-sidebar-width")).toBe("420");
  });

  it("ignores f on a phone, where nothing on screen could leave focus mode", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 500 });
    mount();
    await opened("Linear equations 3");
    press("f");
    expect(screen.getByRole("button", { name: "Focus mode" })).toHaveAttribute("aria-pressed", "false");
  });

  it("brings the sidebar back from the left edge in focus mode, and closes it at a tap off it", async () => {
    mount();
    await opened("Linear equations 3");
    press("f");
    const tapOffLayer = () => document.querySelector(".bg-black\\/10");
    expect(tapOffLayer()).toBeNull();

    fireEvent.mouseMove(document, { clientX: 10, clientY: 300 });
    await waitFor(() => expect(tapOffLayer()).not.toBeNull());
    fireEvent.pointerDown(tapOffLayer()!);
    await waitFor(() => expect(tapOffLayer()).toBeNull());
  });

  it("brings the header back from the top edge in focus mode", async () => {
    mount();
    await opened("Linear equations 3");
    press("f");
    expect(screen.queryByTitle("Exit focus mode (Esc)")).toBeNull();
    fireEvent.mouseMove(document, { clientX: 600, clientY: 2 });
    expect(await screen.findByTitle("Exit focus mode (Esc)")).toBeInTheDocument();
  });

  it("ignores its keys while an exercise editor is open", async () => {
    mount();
    await opened("Linear equations 3");
    // The sidebar's edit button for the first student's classwork.
    fireEvent.click(screen.getAllByTitle(/^Edit (CW|Classwork)$/)[0]);
    expect(screen.getByTestId("exercise-editor")).toBeInTheDocument();
    press("j");
    press("w");
    expect(worksheet()).toHaveTextContent("Linear equations 3");
    expect(screen.queryByTestId("wolfram")).toBeNull();
  });
});

// --- The one-student view ---

describe("The one-student view", () => {
  it("moves through the lesson's exercises with j and k, and stops at each end", async () => {
    renderOneStudent();
    await opened("Linear equations 3");
    press("k");
    expect(worksheet()).toHaveTextContent("Linear equations 3");
    press("j");
    await opened("Quadratics 1");
    press("ArrowDown");
    await opened("Factorising 2");
    press("j");
    expect(worksheet()).toHaveTextContent("Factorising 2");
    press("ArrowUp");
    await opened("Quadratics 1");
  });

  it("opens the classwork editor with c and the homework editor with h", async () => {
    renderOneStudent();
    await opened("Linear equations 3");
    press("c");
    expect(screen.getByTestId("exercise-editor")).toHaveTextContent("CW for Chan Tai Man");
    fireEvent.click(screen.getByRole("button", { name: "Close the editor" }));
    press("h");
    expect(screen.getByTestId("exercise-editor")).toHaveTextContent("HW for Chan Tai Man");
  });

  it("opens the editor read only for a read-only user", async () => {
    renderOneStudent({ isReadOnly: true });
    await opened("Linear equations 3");
    press("c");
    expect(screen.getByTestId("exercise-editor")).toHaveTextContent("CW for Chan Tai Man, read only");
  });

  it("uses Escape to close Wolfram, the print menu and the help, then the pen, then focus mode, then to leave", async () => {
    const { onExit } = renderOneStudent();
    await inkLoaded();

    press("w");
    expect(screen.getByTestId("wolfram")).toBeInTheDocument();
    press("Escape");
    expect(screen.queryByTestId("wolfram")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Print exercises" }));
    expect(screen.getByText("Print all CW")).toBeInTheDocument();
    press("Escape");
    await waitFor(() => expect(screen.queryByText("Print all CW")).toBeNull());

    press("?");
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    press("Escape");
    await waitFor(() => expect(screen.queryByText("Keyboard Shortcuts")).toBeNull());

    press("d");
    expect(worksheet()).toHaveTextContent("Drawing");
    press("Escape");
    expect(worksheet()).toHaveTextContent("On the Hand");

    press("f");
    expect(screen.queryByRole("button", { name: "Exit lesson mode" })).toBeNull();
    press("Escape");
    expect(screen.getByRole("button", { name: "Exit lesson mode" })).toBeInTheDocument();

    expect(onExit).not.toHaveBeenCalled();
    press("Escape");
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Some ink isn't saved yet")).toBeNull();
  });

  it("sends waiting ink before leaving, and leaves without asking once it's saved", async () => {
    const { onExit } = renderOneStudent();
    await inkLoaded();
    drawAStroke();
    fireEvent.click(screen.getByRole("button", { name: "Exit lesson mode" }));

    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(h.inkSave).toHaveBeenCalledTimes(1);
    expect(h.inkSave.mock.calls[0][0]).toEqual([
      expect.objectContaining({ session_id: 100, target_key: "ex:1001", page_index: 0 }),
    ]);
    expect(screen.queryByText("Some ink isn't saved yet")).toBeNull();
  });

  it("asks before leaving while some ink can't reach the server", async () => {
    h.inkSave.mockRejectedValue(new Error("offline"));
    const { onExit } = renderOneStudent();
    await inkLoaded();
    drawAStroke();
    press("Escape");

    expect(await screen.findByText("Some ink isn't saved yet")).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });
});

// --- The multi-student view ---

describe("The multi-student view", () => {
  it("opens the first student's first worksheet, stamped with their name", async () => {
    renderSlot();
    await opened("Linear equations 3");
    expect(worksheet()).toHaveTextContent("Stamped for Chan Tai Man");
  });

  it("moves through every student's worksheets in turn with j and k, and stops at each end", async () => {
    renderSlot();
    await opened("Linear equations 3");
    press("k");
    expect(worksheet()).toHaveTextContent("Stamped for Chan Tai Man");
    press("j");
    await opened("Quadratics 1");
    press("j");
    await opened("Factorising 2");
    press("ArrowDown");
    await opened("Stamped for Wong Siu Ming");
    expect(worksheet()).toHaveTextContent("Linear equations 3");
    press("j");
    await opened("Factorising 2");
    press("j");
    expect(worksheet()).toHaveTextContent("Stamped for Wong Siu Ming");
    expect(worksheet()).toHaveTextContent("Factorising 2");
    press("ArrowUp");
    await opened("Linear equations 3");
  });

  it("steps through the students on the same worksheet with Tab, going round", async () => {
    renderSlot();
    await opened("Stamped for Chan Tai Man");
    press("Tab");
    await opened("Stamped for Wong Siu Ming");
    expect(worksheet()).toHaveTextContent("Linear equations 3");
    press("Tab");
    await opened("Stamped for Chan Tai Man");
    press("Tab", { shiftKey: true });
    await opened("Stamped for Wong Siu Ming");
  });

  it("saves the open worksheet as a PDF with s once it has ink", async () => {
    renderSlot();
    await inkLoaded();
    await waitFor(() => expect(worksheet()).not.toHaveTextContent("Loading"));
    press("s");
    expect(h.saveAnnotatedPdf).not.toHaveBeenCalled();

    drawAStroke();
    press("s");
    await waitFor(() => expect(h.downloadBlob).toHaveBeenCalledTimes(1));
    expect(h.downloadBlob.mock.calls[0][1]).toBe("annotated-Chan Tai Man-Linear equations 3.pdf");
  });

  it("uses Escape to close Wolfram and the help, then the pen, then focus mode, and never closes the tab", async () => {
    renderSlot();
    await inkLoaded();

    press("w");
    expect(screen.getByTestId("wolfram")).toBeInTheDocument();
    press("Escape");
    expect(screen.queryByTestId("wolfram")).toBeNull();

    press("?");
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    press("Escape");
    await waitFor(() => expect(screen.queryByText("Keyboard Shortcuts")).toBeNull());

    press("d");
    press("Escape");
    expect(worksheet()).toHaveTextContent("On the Hand");

    press("f");
    expect(screen.queryByRole("button", { name: "Close lesson tab" })).toBeNull();
    press("Escape");
    expect(screen.getByRole("button", { name: "Close lesson tab" })).toBeInTheDocument();

    press("Escape");
    // Leaving waits on the ink being sent, so give it the moment it would take.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(window.close).not.toHaveBeenCalled();
    expect(screen.queryByText("Some ink isn't saved yet")).toBeNull();
  });

  it("sends waiting ink before closing the tab, and closes it without asking once it's saved", async () => {
    renderSlot();
    await inkLoaded();
    drawAStroke();
    fireEvent.click(screen.getByRole("button", { name: "Close lesson tab" }));

    await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1));
    expect(h.inkSave.mock.calls[0][0]).toEqual([
      expect.objectContaining({ session_id: 100, target_key: "ex:1001", page_index: 0 }),
    ]);
  });

  it("asks before closing the tab while some ink can't reach the server", async () => {
    h.inkSave.mockRejectedValue(new Error("offline"));
    renderSlot();
    await inkLoaded();
    drawAStroke();
    fireEvent.click(screen.getByRole("button", { name: "Close lesson tab" }));

    expect(await screen.findByText("Some ink isn't saved yet")).toBeInTheDocument();
    expect(window.close).not.toHaveBeenCalled();
  });
});
