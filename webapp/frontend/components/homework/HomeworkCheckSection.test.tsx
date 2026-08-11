import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeworkCheckSection } from "./HomeworkCheckSection";
import type { HomeworkCompletion, HomeworkStatus } from "@/types";

// The row drags in the toast context, the API client and attachment uploads.
// None of that is what this block does; it counts, collapses and hands rows a
// session to mark against.
vi.mock("./HomeworkCheckRow", () => ({
  HomeworkCheckRow: ({
    homework,
    sessionId,
    readOnly,
  }: {
    homework: HomeworkCompletion;
    sessionId: number;
    readOnly?: boolean;
  }) => (
    <div data-testid="row" data-session={sessionId} data-readonly={String(!!readOnly)}>
      {homework.session_exercise_id}
    </div>
  ),
}));

const item = (id: number, completion_status: HomeworkStatus): HomeworkCompletion =>
  ({ session_exercise_id: id, completion_status }) as HomeworkCompletion;

const OPEN = [item(1, "Not Checked"), item(2, "Submitted"), item(3, "Completed")];

describe("HomeworkCheckSection", () => {
  it("renders nothing when there is no homework outstanding", () => {
    const { container } = render(<HomeworkCheckSection sessionId={9} items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("counts handed in as still to check", () => {
    render(<HomeworkCheckSection sessionId={9} items={OPEN} />);
    // Only the one verdict counts as done, so 1 of 3, not 2 of 3.
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByTitle("2 to check from earlier lessons")).toBeInTheDocument();
  });

  it("says so when everything has been checked", () => {
    render(
      <HomeworkCheckSection
        sessionId={9}
        items={[item(1, "Completed"), item(2, "Not Completed")]}
      />
    );
    expect(screen.getByTitle("All homework checked")).toBeInTheDocument();
  });

  it("starts collapsed and opens on click", () => {
    render(<HomeworkCheckSection sessionId={9} items={OPEN} />);
    expect(screen.queryAllByTestId("row")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByTestId("row")).toHaveLength(3);
  });

  it("passes the marking session and read-only state down to each row", () => {
    render(<HomeworkCheckSection sessionId={42} items={OPEN} isReadOnly expanded />);

    const rows = screen.getAllByTestId("row");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.dataset.session).toBe("42");
      expect(row.dataset.readonly).toBe("true");
    }
  });

  it("can be driven from outside, for the keyboard shortcut", () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(
      <HomeworkCheckSection
        sessionId={9}
        items={OPEN}
        expanded={false}
        onExpandedChange={onExpandedChange}
      />
    );
    expect(screen.queryAllByTestId("row")).toHaveLength(0);

    rerender(
      <HomeworkCheckSection
        sessionId={9}
        items={OPEN}
        expanded
        onExpandedChange={onExpandedChange}
      />
    );
    expect(screen.getAllByTestId("row")).toHaveLength(3);
  });

  it("reports a click back to the owner of the state", () => {
    const onExpandedChange = vi.fn();
    render(
      <HomeworkCheckSection
        sessionId={9}
        items={OPEN}
        expanded={false}
        onExpandedChange={onExpandedChange}
      />
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });
});
