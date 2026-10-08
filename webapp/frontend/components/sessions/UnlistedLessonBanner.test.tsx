import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Session, UnlistedLesson } from "@/types";

const api = vi.hoisted(() => ({ fillInto: vi.fn() }));
vi.mock("@/lib/api", () => ({ unlistedLessonsAPI: api }));
vi.mock("@/lib/hooks", () => ({ revalidateUnlistedLessons: vi.fn() }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import { UnlistedLessonBanner } from "./UnlistedLessonBanner";

const record = {
  id: 4, tutor_name: "Tutor B", time_slot: "16:45 - 18:15", notes: "Worked on ratios",
  performance_rating: null,
  exercises: [{ exercise_type: "CW" }, { exercise_type: "CW" }, { exercise_type: "HW" }],
} as unknown as UnlistedLesson;

const lessonWith = (status: string) => ({ id: 99, session_status: status }) as Session;

describe("the fill banner on a lesson's page", () => {
  it("says who recorded the student and what they recorded", () => {
    render(<UnlistedLessonBanner session={lessonWith("Scheduled")} lessons={[record]} onFilled={vi.fn()} />);
    expect(screen.getByText(
      "Tutor B recorded this student at 16:45 - 18:15 before the lesson was in CSM, with 2 classwork, 1 homework and notes.",
    )).toBeTruthy();
  });

  it("fills this lesson in with one click", async () => {
    api.fillInto.mockResolvedValue({});
    const onFilled = vi.fn();
    render(<UnlistedLessonBanner session={lessonWith("Scheduled")} lessons={[record]} onFilled={onFilled} />);
    fireEvent.click(screen.getByRole("button", { name: "Fill in this lesson" }));
    await waitFor(() => expect(onFilled).toHaveBeenCalled());
    expect(api.fillInto).toHaveBeenCalledWith(4, 99);
  });

  it("offers no fill when the student wasn't at the lesson, or for a read-only viewer", () => {
    const { rerender } = render(<UnlistedLessonBanner session={lessonWith("Cancelled")} lessons={[record]} onFilled={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<UnlistedLessonBanner session={lessonWith("Scheduled")} lessons={[record]} readOnly onFilled={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
