import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeworkCheckRow } from "./HomeworkCheckRow";
import { homeworkAPI } from "@/lib/api";
import type { HomeworkCompletion } from "@/types";

vi.mock("@/lib/api", () => ({ homeworkAPI: { mark: vi.fn() } }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/useHaptic", () => ({ useHaptic: () => ({ trigger: vi.fn() }) }));
vi.mock("./useHomeworkAttachments", () => ({ useHomeworkAttachments: () => ({ control: null, previews: null }) }));
const homework: HomeworkCompletion = {
  session_exercise_id: 31, current_session_id: 200, student_id: 1,
  pdf_name: "Indices.pdf", completion_status: "Not Checked", attachment_count: 0, files: [],
};
beforeEach(() => vi.clearAllMocks());

describe("lesson homework marking feedback", () => {
  it("shows a pending save, prevents competing changes and confirms the saved mark", async () => {
    let finish!: (saved: HomeworkCompletion) => void;
    vi.mocked(homeworkAPI.mark).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const onMarked = vi.fn();
    render(<HomeworkCheckRow homework={homework} sessionId={200} inCheckViewer enhanced onMarked={onMarked} />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    expect(screen.getByRole("button", { name: "Not checked" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add a comment" })).toBeDisabled();
    expect(screen.getByRole("radiogroup", { name: "Rating" }).querySelector("button")).toBeDisabled();
    expect(homeworkAPI.mark).toHaveBeenCalledWith(200, 31, expect.objectContaining({ completion_status: "Completed" }));
    await act(async () => finish({ ...homework, completion_status: "Completed" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
    expect(onMarked).toHaveBeenCalledWith(expect.objectContaining({ completion_status: "Completed" }));
  });

  it("rolls back a failed mark and lets the tutor retry", async () => {
    vi.mocked(homeworkAPI.mark).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(homeworkAPI.mark).mockResolvedValue({ ...homework, completion_status: "Completed" });
    render(<HomeworkCheckRow homework={homework} sessionId={200} inCheckViewer enhanced />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not save"));
    expect(screen.getByRole("button", { name: "Not checked" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
  });

  it("does not enable marking for read-only tutors", () => {
    render(<HomeworkCheckRow homework={homework} sessionId={200} inCheckViewer enhanced readOnly />);
    expect(screen.getByRole("status")).toHaveTextContent("Read only");
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    expect(homeworkAPI.mark).not.toHaveBeenCalled();
  });
});
