import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { CheckViewer } from "./CheckViewer";
import type { HomeworkAnswer } from "./useHomeworkAnswer";
import type { CheckItem } from "@/lib/homework-check";
import type { HomeworkCompletion } from "@/types";

// The PDF renderer needs pdf.js and a canvas. What matters here is what the
// viewer asks each pane to show, so the stub prints that.
vi.mock("@/components/lesson/PdfPageViewer", () => ({
  tbBtn: "", tbBtnIdle: "", tbBtnOn: "",
  PdfPageViewer: (props: {
    pdfData: ArrayBuffer | null;
    exerciseLabel?: string;
    pageNumbers: number[];
    isLoading: boolean;
    loadingMessage?: string | null;
    error: string | null;
    emptyMessage?: string;
    emptyAction?: ReactNode;
    toolbarStart?: ReactNode;
  }) => (
    <div data-testid="pane" data-label={props.exerciseLabel} data-pages={props.pageNumbers.join(",")}>
      {props.toolbarStart}
      {props.isLoading && <span>{props.loadingMessage ?? "loading"}</span>}
      {props.error}
      {!props.pdfData && !props.isLoading && !props.error && (
        <>
          {props.emptyMessage}
          {props.emptyAction}
        </>
      )}
    </div>
  ),
}));

vi.mock("@/hooks/useExercisePdf", () => ({
  useExercisePdf: (exercise: { page_start?: number; page_end?: number }) => ({
    pdfData: new ArrayBuffer(1),
    pageNumbers: exercise.page_start ? [exercise.page_start, exercise.page_end ?? exercise.page_start] : [],
    pdfLoading: false,
    pdfLoadingMessage: null,
    pdfError: null,
    retry: vi.fn(),
  }),
}));

let answer: HomeworkAnswer = { kind: "searching" };
const retryAnswer = vi.fn();
vi.mock("./useHomeworkAnswer", () => ({
  useHomeworkAnswer: () => ({ answer, retry: retryAnswer }),
}));

let mobile = false;
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => mobile }));

// The real row saves through the API. This one reports which lesson it would
// mark against, and hands back a saved record on demand.
vi.mock("./HomeworkCheckRow", () => ({
  HomeworkCheckRow: ({
    homework,
    sessionId,
    onMarked,
    inCheckViewer,
  }: {
    homework: HomeworkCompletion;
    sessionId: number;
    onMarked?: (saved: HomeworkCompletion) => void;
    inCheckViewer?: boolean;
  }) => (
    <div data-testid="row" data-session={sessionId} data-in-viewer={String(!!inCheckViewer)}>
      {homework.completion_status}
      <textarea aria-label="Comment" />
      <button type="button" onClick={() => onMarked?.({ ...homework, completion_status: "Completed" })}>
        Mark done
      </button>
    </div>
  ),
}));

const homework = (id: number, fields: Partial<HomeworkCompletion> = {}): HomeworkCompletion => ({
  session_exercise_id: id,
  current_session_id: 200,
  student_id: 1,
  pdf_name: `[Center]\\Courseware (Eng)\\Sheet${id}.pdf`,
  completion_status: "Not Checked",
  homework_assigned_date: "2026-09-14",
  assigned_by_tutor: "Ms Other",
  attachment_count: 0,
  files: [],
  ...fields,
});

const itemFor = (hw: HomeworkCompletion, sessionId = 200, studentName?: string): CheckItem => ({
  homework: hw,
  sessionId,
  studentName,
});

const A = itemFor(homework(1, { page_start: 4, page_end: 5 }), 200, "Amy");
const LINK = itemFor(homework(2, { pdf_name: undefined, url: "https://example.com" }), 200, "Amy");
const C = itemFor(homework(3), 201, "Ben");

function renderViewer(overrides: Partial<Parameters<typeof CheckViewer>[0]> = {}) {
  const props = {
    items: [A, LINK, C],
    current: A,
    onNavigate: vi.fn(),
    onClose: vi.fn(),
    onMarked: vi.fn(),
    cache: new Map(),
    searches: new Map(),
    ...overrides,
  };
  render(<CheckViewer {...props} />);
  return props;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  window.sessionStorage.clear();
  answer = { kind: "ready", path: "[Center]\\ANS\\Sheet1_ANS.pdf", data: new ArrayBuffer(1), pageNumbers: [4, 5] };
  mobile = false;
  retryAnswer.mockClear();
});

describe("CheckViewer", () => {
  it("names the homework, whose it is and where it came from", () => {
    renderViewer();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Amy")).toBeInTheDocument();
    expect(within(dialog).getByText("Sheet1")).toBeInTheDocument();
    expect(within(dialog).getByText(/from .*Ms Other/)).toBeInTheDocument();
  });

  it("shows the worksheet and the answer key side by side, both cut to the pages set", () => {
    renderViewer();
    const [worksheet, answers] = screen.getAllByTestId("pane");
    expect(worksheet.dataset.pages).toBe("4,5");
    expect(answers.dataset.label).toBe("ANS: Sheet1_ANS");
    expect(answers.dataset.pages).toBe("4,5");
  });

  it("can show every page of the answer key and go back to the pages set", () => {
    renderViewer();
    const toggle = screen.getByTitle("Show every page of the answer key");
    fireEvent.click(toggle);
    expect(screen.getAllByTestId("pane")[1].dataset.pages).toBe("");
    fireEvent.click(screen.getByTitle("Show only the pages for this homework"));
    expect(screen.getAllByTestId("pane")[1].dataset.pages).toBe("4,5");
  });

  it("doesn't offer every page when the answer key already shows them all", () => {
    answer = { kind: "ready", path: "a.pdf", data: new ArrayBuffer(1), pageNumbers: [] };
    renderViewer();
    expect(screen.queryByTitle("Show every page of the answer key")).not.toBeInTheDocument();
  });

  it("says what it's doing while it looks for the answer key", () => {
    answer = { kind: "searching" };
    renderViewer();
    expect(screen.getByText("Looking for the answer key…")).toBeInTheDocument();
  });

  it("says so when there's no answer key, and can look again", () => {
    answer = { kind: "none" };
    renderViewer();
    const [worksheet, answers] = screen.getAllByTestId("pane");
    // The worksheet still shows.
    expect(worksheet.dataset.label).toBe("Sheet1");
    expect(answers).toHaveTextContent("We couldn't find an answer key for this worksheet.");
    fireEvent.click(screen.getByRole("button", { name: /Search again/ }));
    expect(retryAnswer).toHaveBeenCalled();
  });

  it("steps through the list, skipping homework that's only a link", () => {
    const { onNavigate } = renderViewer();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous homework" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next homework" }));
    expect(onNavigate).toHaveBeenCalledWith(C);
  });

  it("moves with the arrow keys and closes on Escape", () => {
    const { onNavigate, onClose } = renderViewer({ current: C });
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(onNavigate).toHaveBeenCalledWith(A);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps every key from the lesson or page underneath", () => {
    const underneath = vi.fn();
    window.addEventListener("keydown", underneath);
    document.addEventListener("keydown", underneath);
    try {
      renderViewer();
      fireEvent.keyDown(document.body, { key: "d" });
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(underneath).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", underneath);
      document.removeEventListener("keydown", underneath);
    }
  });

  it("finishes a comment on Escape before it closes", () => {
    const { onClose } = renderViewer();
    const comment = screen.getByLabelText("Comment");
    comment.focus();
    fireEvent.keyDown(comment, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(comment);
  });

  it("marks against the item's own lesson, without the row repeating the header", () => {
    renderViewer({ current: C });
    const row = screen.getByTestId("row");
    expect(row.dataset.session).toBe("201");
    expect(row.dataset.inViewer).toBe("true");
  });

  it("passes a saved mark on and refreshes its own copy", () => {
    const onNavigate = vi.fn();
    const { onMarked } = renderViewer({ onNavigate });
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));

    expect(onMarked).toHaveBeenCalledWith(expect.objectContaining({ session_exercise_id: 1, completion_status: "Completed" }));
    const update = onNavigate.mock.calls[0][0] as (open: CheckItem | null) => CheckItem | null;
    expect(update(A)?.homework.completion_status).toBe("Completed");
    // A save that lands after the tutor has moved on leaves the new item alone.
    expect(update(C)).toBe(C);
  });

  it("keeps showing an item the list has dropped, and carries on from where it was", () => {
    // A filtered list drops an item once a mark takes it out of the filter.
    const B = itemFor(homework(4), 200, "Amy");
    const onNavigate = vi.fn();
    const props = { onNavigate, onClose: vi.fn(), cache: new Map(), searches: new Map() };
    const { rerender } = render(<CheckViewer {...props} items={[B, A, C]} current={A} />);

    const marked = itemFor(homework(1, { page_start: 4, page_end: 5, completion_status: "Completed" }), 200, "Amy");
    rerender(<CheckViewer {...props} items={[B, C]} current={marked} />);

    expect(screen.getByTestId("row")).toHaveTextContent("Completed");
    expect(screen.queryByText(/ of /)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next homework" }));
    expect(onNavigate).toHaveBeenLastCalledWith(C);
    fireEvent.click(screen.getByRole("button", { name: "Previous homework" }));
    expect(onNavigate).toHaveBeenLastCalledWith(B);
  });

  describe("on a phone", () => {
    it("shows the answers first, with the worksheet on the other tab", () => {
      mobile = true;
      renderViewer();
      expect(screen.getAllByTestId("pane")).toHaveLength(1);
      expect(screen.getByTestId("pane").dataset.label).toBe("ANS: Sheet1_ANS");
      fireEvent.click(screen.getByRole("button", { name: "Worksheet" }));
      expect(screen.getByTestId("pane").dataset.label).toBe("Sheet1");
    });
  });
});

afterEach(() => {
  document.body.style.overflow = "";
});


describe("the lesson homework preview", () => {
  beforeEach(() => window.history.replaceState({}, "", "/?ui-preview=motion"));

  it("keeps the existing two-file layout and gives each desktop pane a clear label", () => {
    renderViewer({ lessonPreview: true });
    expect(screen.getByText("Worksheet")).toBeInTheDocument();
    expect(screen.getByText("Answers")).toBeInTheDocument();
    expect(screen.getAllByTestId("pane")).toHaveLength(2);
  });

  it("answers the lesson host's Back request before it reaches the lesson exit guard", () => {
    const { onClose } = renderViewer({ lessonPreview: true });
    const back = new Event("csm-native-lesson-dismiss-overlay", { cancelable: true });
    expect(window.dispatchEvent(back)).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("finishes a comment before a Back request closes the viewer", () => {
    const { onClose } = renderViewer({ lessonPreview: true });
    const comment = screen.getByLabelText("Comment"); comment.focus();
    window.dispatchEvent(new Event("csm-native-lesson-dismiss-overlay", { cancelable: true }));
    expect(document.activeElement).not.toBe(comment);
    expect(onClose).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("csm-native-lesson-dismiss-overlay", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("honours the lesson host even from a retired Original URL", () => {
    window.history.replaceState({}, "", "/?ui-preview=original");
    const { onClose } = renderViewer({ lessonPreview: true });
    expect(window.dispatchEvent(new Event("csm-native-lesson-dismiss-overlay", { cancelable: true }))).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("makes the underlying lesson inert and restores its existing state and opener", async () => {
    const stage = document.createElement("div"); stage.setAttribute("data-native-wide-lesson", "");
    const chrome = document.createElement("nav"); chrome.inert = false; document.body.append(chrome);
    const opener = document.createElement("button"); stage.append(opener); document.body.append(stage); opener.focus();
    const props = { items: [A], current: A, onNavigate: vi.fn(), onClose: vi.fn(), cache: new Map(), searches: new Map(), lessonPreview: true };
    const { unmount } = render(<CheckViewer {...props} />);
    expect(stage.inert).toBe(true);
    expect(chrome.inert).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    unmount();
    expect(stage.inert).not.toBe(true);
    expect(chrome.inert).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(opener));
    stage.remove(); chrome.remove();
  });

  it("keeps answers first on phones and identifies the selected file", () => {
    mobile = true;
    renderViewer({ lessonPreview: true });
    expect(screen.getByRole("tab", { name: "Answers" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Worksheet" }));
    expect(screen.getByRole("tab", { name: "Worksheet" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("pane").dataset.label).toBe("Sheet1");
  });
});
