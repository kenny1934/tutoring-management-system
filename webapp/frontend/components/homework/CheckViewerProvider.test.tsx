import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CheckViewerProvider } from "./CheckViewerProvider";
import { HomeworkCheckRow } from "./HomeworkCheckRow";
import { checkItems, type CheckItem } from "@/lib/homework-check";
import type { HomeworkCompletion } from "@/types";

// The row's own saving and uploads aren't what's under test here.
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("./useHomeworkAttachments", () => ({
  useHomeworkAttachments: () => ({ control: null, previews: null }),
}));

// Stands in for the viewer, which next/dynamic loads the first time it opens.
// It reports the list it was given and the item it opened on.
vi.mock("next/dynamic", () => ({
  default: () =>
    function CheckViewer({ items, current }: { items: CheckItem[]; current: CheckItem }) {
      return (
        <div data-testid="viewer" data-current={current.homework.session_exercise_id}>
          {items.map((item) => `${item.sessionId}:${item.homework.session_exercise_id}`).join(" ")}
        </div>
      );
    },
}));

const homework = (id: number, fields: Partial<HomeworkCompletion> = {}): HomeworkCompletion => ({
  session_exercise_id: id,
  current_session_id: 200,
  student_id: 1,
  pdf_name: `Sheet${id}.pdf`,
  completion_status: "Not Checked",
  attachment_count: 0,
  files: [],
  ...fields,
});

describe("the Answers button on a homework row", () => {
  it("only shows where a surface has put a Check Viewer above the row", () => {
    const hw = homework(1);
    const { rerender } = render(<HomeworkCheckRow homework={hw} sessionId={200} />);
    expect(screen.queryByRole("button", { name: /Answers/ })).not.toBeInTheDocument();

    rerender(
      <CheckViewerProvider items={checkItems([hw], 200)}>
        <HomeworkCheckRow homework={hw} sessionId={200} />
      </CheckViewerProvider>,
    );
    expect(screen.getByRole("button", { name: /Answers/ })).toBeInTheDocument();
  });

  it("isn't offered for homework that's only a web link", () => {
    const hw = homework(1, { pdf_name: undefined, url: "https://example.com" });
    render(
      <CheckViewerProvider items={checkItems([hw], 200)}>
        <HomeworkCheckRow homework={hw} sessionId={200} />
      </CheckViewerProvider>,
    );
    expect(screen.queryByRole("button", { name: /Answers/ })).not.toBeInTheDocument();
  });

  it("opens the viewer on that row's homework", () => {
    const first = homework(1);
    const second = homework(2);
    render(
      <CheckViewerProvider items={checkItems([first, second], 200)}>
        <HomeworkCheckRow homework={first} sessionId={200} />
        <HomeworkCheckRow homework={second} sessionId={200} />
      </CheckViewerProvider>,
    );
    expect(screen.queryByTestId("viewer")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Answers/ })[1]);
    expect(screen.getByTestId("viewer").dataset.current).toBe("2");
  });

  it("leaves out its name and its Answers button when it's the viewer's own footer", () => {
    const hw = homework(1);
    render(
      <CheckViewerProvider items={checkItems([hw], 200)}>
        <HomeworkCheckRow homework={hw} sessionId={200} inCheckViewer />
      </CheckViewerProvider>,
    );
    expect(screen.queryByText("Sheet1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Answers/ })).not.toBeInTheDocument();
    // The marking itself is all still there.
    expect(screen.getByRole("group", { name: "Homework status" })).toBeInTheDocument();
  });
});

describe("CheckViewerProvider", () => {
  it("steps aside for a provider above it, so the widest list is the one the viewer steps through", () => {
    // Bulk rate's list covers the slot. Each student's panel brings its own,
    // for when it's used on its own.
    const amy = homework(1);
    const ben = homework(2, { current_session_id: 201 });
    const slot = [...checkItems([amy], 200, "Amy"), ...checkItems([ben], 201, "Ben")];
    render(
      <CheckViewerProvider items={slot}>
        <CheckViewerProvider items={checkItems([amy], 200)}>
          <HomeworkCheckRow homework={amy} sessionId={200} />
        </CheckViewerProvider>
      </CheckViewerProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Answers/ }));
    const viewers = screen.getAllByTestId("viewer");
    expect(viewers).toHaveLength(1);
    expect(viewers[0]).toHaveTextContent("200:1 201:2");
  });
});
