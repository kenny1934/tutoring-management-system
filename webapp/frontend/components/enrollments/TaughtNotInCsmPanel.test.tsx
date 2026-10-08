import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { UnlistedLesson } from "@/types";

const api = vi.hoisted(() => ({
  getLatestEnrolments: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ unlistedLessonsAPI: api }));
vi.mock("@/lib/hooks", () => ({ revalidateUnlistedLessons: vi.fn() }));
// The grade badge looks up the summer window, which this panel has no part in.
vi.mock("@/components/ui/grade-label", () => ({ GradeBadge: () => null }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import { TaughtNotInCsmPanel } from "./TaughtNotInCsmPanel";

function lesson(over: Partial<UnlistedLesson>): UnlistedLesson {
  return {
    id: 1, student_id: 10, student_name: "Student A", school_student_id: "1001", grade: "F2",
    lang_stream: "E", school: null, tutor_id: 5, tutor_name: "Tutor B", lesson_date: "2026-10-01",
    time_slot: "16:45 - 18:15", location: "MSA", notes: null, exercises: [], performance_rating: null,
    status: "waiting", filled_session_id: null, filled_at: null, dismissed_at: null, dismiss_reason: null,
    created_at: null, created_by: null, ...over,
  };
}

const lessons = [
  lesson({ id: 1, student_id: 10, lesson_date: "2026-10-08" }),
  lesson({ id: 2, student_id: 20, student_name: "Student C", lesson_date: "2026-10-02" }),
  lesson({ id: 3, student_id: 10, lesson_date: "2026-10-01" }),
];

const renderPanel = (props: Partial<Parameters<typeof TaughtNotInCsmPanel>[0]> = {}) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TaughtNotInCsmPanel lessons={lessons} canAct onCreateEnrolment={vi.fn()} {...props} />
    </SWRConfig>,
  );

describe("the taught but not in CSM yet tab", () => {
  beforeEach(() => {
    api.getLatestEnrolments.mockResolvedValue({ "10": 77 });
    api.dismiss.mockResolvedValue({});
  });

  it("puts each student on one card, the one taught longest ago first", () => {
    renderPanel();
    const names = screen.getAllByText(/^Student [AC]$/).map((el) => el.textContent);
    expect(names).toEqual(["Student A", "Student C"]);
    expect(screen.getByText("Taught 2 times without a lesson in CSM.")).toBeTruthy();
    expect(screen.getByText("Taught once without a lesson in CSM.")).toBeTruthy();
  });

  it("renews from the latest enrollment, starting at the earliest lesson", async () => {
    const onCreateEnrolment = vi.fn();
    renderPanel({ onCreateEnrolment });
    fireEvent.click(await screen.findByRole("button", { name: "Renew enrollment" }));
    const student = onCreateEnrolment.mock.calls[0][0];
    expect(student.latestEnrolmentId).toBe(77);
    expect(student.lessons[0].id).toBe(3);
    expect(screen.getByRole("button", { name: "Create enrollment" })).toBeTruthy();
  });

  it("sets a record aside with the reason picked", async () => {
    renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: "Set aside" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Handled another way" }));
    await waitFor(() => expect(api.dismiss).toHaveBeenCalledWith(3, "handled_elsewhere"));
  });

  it("shows supervisors the cards without the actions", () => {
    renderPanel({ canAct: false });
    expect(screen.getByText("Student C")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /enrollment|Set aside/ })).toBeNull();
  });
});
