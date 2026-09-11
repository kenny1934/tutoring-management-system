import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CurriculumFileUsage, missedLessonTag } from "./CurriculumFileUsage";
import { CurriculumFileBadges } from "./CurriculumFileRow";
import type { CoursewareUsageDetail, CurriculumFile } from "@/types";

const usageDetail = vi.fn();
vi.mock("@/lib/hooks", () => ({
  useCoursewareUsageDetail: (...args: unknown[]) => usageDetail(...args),
  useSession: (id: number | null | undefined) => ({
    data: id ? { id, student_name: "Loaded lesson" } : undefined,
  }),
}));

// The real popover pulls in the exercise modal and most of the app. This one
// only reports which lesson it was given and where it was anchored.
vi.mock("@/components/sessions/SessionDetailPopover", () => ({
  SessionDetailPopover: ({
    session,
    clickPosition,
    onClose,
  }: {
    session: { id: number } | null;
    clickPosition: { x: number; y: number } | null;
    onClose: () => void;
  }) => (
    <div data-testid="lesson-popover">
      lesson {session?.id} at {clickPosition?.x},{clickPosition?.y}
      <button type="button" onClick={onClose}>Close lesson</button>
    </div>
  ),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocation: () => ({ selectedLocation: "MSA" }),
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function file(overrides: Partial<CurriculumFile> = {}): CurriculumFile {
  return {
    file_path: "Center\\Courseware (Eng)\\704_EX2_e.pdf",
    file_basename: "704_EX2_e.pdf",
    role: "exercise",
    lang: "e",
    confidence: 1,
    map_source: "code",
    assignment_count: 5,
    unique_student_count: 4,
    school_assignment_count: 2,
    school_student_count: 2,
    latest_use: null,
    ...overrides,
  };
}

function line(overrides: Partial<CoursewareUsageDetail>): CoursewareUsageDetail {
  return {
    exercise_id: 1,
    session_id: 100,
    filename: "704_EX2_e",
    normalized_path: "Center\\Courseware (Eng)\\704_EX2_e.pdf",
    original_pdf_name: "704_EX2_e.pdf",
    exercise_type: "CW",
    page_start: null,
    page_end: null,
    session_date: "2026-09-03",
    location: "MSA",
    student_id: 1,
    school_student_id: "1001",
    student_name: "Chan Tai Man",
    grade: "F1",
    lang_stream: "E",
    school: "SPCC",
    tutor_id: 8,
    tutor_name: "Mr Lau",
    session_status: "Attended",
    ...overrides,
  };
}

// The hook is asked once per group: this school's lines with `school` set
// (sixth argument), the others with `excludeSchool` set (seventh).
const SCHOOL_LINES = [
  line({ exercise_id: 1, student_id: 1, student_name: "Chan Tai Man", page_start: 1, page_end: 4 }),
  line({
    exercise_id: 2,
    student_id: 2,
    student_name: "Lee Siu Ming",
    session_date: "2026-08-28",
    session_status: "Rescheduled - Make-up Booked",
  }),
];
const OTHER_LINES = [
  line({ exercise_id: 3, student_id: 3, student_name: "Wong Ka Yi", school: "SHCC", location: "MSB" }),
];

beforeEach(() => {
  usageDetail.mockReset();
  usageDetail.mockImplementation((...args: unknown[]) => {
    const [, , , , , school, excludeSchool] = args;
    const data = school ? SCHOOL_LINES : excludeSchool ? OTHER_LINES : [...SCHOOL_LINES, ...OTHER_LINES];
    return { data, error: undefined, isLoading: false, isValidating: false };
  });
});

describe("the tag on a lesson that did not go ahead", () => {
  it("names the reason for a lesson with a make-up", () => {
    expect(missedLessonTag("Rescheduled - Make-up Booked")?.label).toBe("Rescheduled");
    expect(missedLessonTag("Rescheduled - Pending Make-up")?.explanation).toContain(
      "the make-up has not been booked yet"
    );
    expect(missedLessonTag("Sick Leave - Make-up Booked")?.label).toBe("Sick leave");
    expect(missedLessonTag("Weather Cancelled - Pending Make-up")?.label).toBe("Weather");
  });

  it("tags cancelled lessons and no-shows too", () => {
    expect(missedLessonTag("Cancelled")?.label).toBe("Cancelled");
    expect(missedLessonTag("No Show")?.label).toBe("No show");
  });

  it("leaves lessons that went ahead, or are still to come, untagged", () => {
    expect(missedLessonTag("Attended")).toBeNull();
    expect(missedLessonTag("Attended (Make-up)")).toBeNull();
    expect(missedLessonTag("Scheduled")).toBeNull();
  });
});

describe("the list of lessons behind a file's usage count", () => {
  it("shows the school's own students first and asks for them by school", () => {
    render(<CurriculumFileUsage file={file()} scopeSchool="SPCC" />);
    expect(screen.getByText("At SPCC")).toBeTruthy();
    expect(screen.getByText("Chan Tai Man")).toBeTruthy();
    expect(screen.getByText("p1-4")).toBeTruthy();
    // Newer ICU writes the British September as "Sept".
    expect(screen.getByText(/^3 Sept? 2026$/)).toBeTruthy();
    expect(usageDetail).toHaveBeenCalledWith(
      "704_EX2_e", "all-time", 10, undefined, undefined, "SPCC", undefined
    );
    // The other schools wait behind a button until asked for.
    expect(screen.queryByText("Wong Ka Yi")).toBeNull();
  });

  it("opens the other schools on request, leaving the school out", () => {
    render(<CurriculumFileUsage file={file()} scopeSchool="SPCC" />);
    fireEvent.click(screen.getByText("3 more at other schools"));
    expect(screen.getByText("At other schools")).toBeTruthy();
    expect(screen.getByText("Wong Ka Yi")).toBeTruthy();
    expect(usageDetail).toHaveBeenCalledWith(
      "704_EX2_e", "all-time", 10, undefined, undefined, undefined, "SPCC"
    );
  });

  it("tags the rescheduled lesson and keeps it in the list", () => {
    render(<CurriculumFileUsage file={file()} scopeSchool="SPCC" />);
    const tag = screen.getByText("Rescheduled");
    expect(tag.getAttribute("title")).toContain("the make-up is booked");
    expect(screen.getByText("Lee Siu Ming")).toBeTruthy();
  });

  it("names students at another branch without linking them", () => {
    render(<CurriculumFileUsage file={file({ school_assignment_count: 0 })} scopeSchool="SPCC" />);
    expect(screen.getByText("Chan Tai Man").closest("a")?.getAttribute("href")).toBe("/students/1");
    expect(screen.getByText("Wong Ka Yi").closest("a")).toBeNull();
  });

  it("says so when none of the school's students have had the file", () => {
    render(<CurriculumFileUsage file={file({ school_assignment_count: 0 })} scopeSchool="SPCC" />);
    expect(
      screen.getByText(
        "No SPCC students have had this file yet, so these are from other schools."
      )
    ).toBeTruthy();
  });

  it("opens the lesson's detail popover under the icon instead of a new tab", async () => {
    render(<CurriculumFileUsage file={file()} scopeSchool="SPCC" />);
    const icon = screen.getByRole("button", {
      name: /Show the lesson on 3 Sept? 2026 with Chan Tai Man/,
    });
    icon.getBoundingClientRect = () =>
      ({ left: 40, bottom: 120, top: 110, right: 50, width: 10, height: 10, x: 40, y: 110 }) as DOMRect;
    fireEvent.click(icon);
    const popover = await screen.findByTestId("lesson-popover");
    expect(popover.textContent).toContain("lesson 100 at 40,120");
    fireEvent.click(screen.getByText("Close lesson"));
    expect(screen.queryByTestId("lesson-popover")).toBeNull();
  });

  it("offers no lesson icon for a student at another branch", () => {
    render(<CurriculumFileUsage file={file({ school_assignment_count: 0 })} scopeSchool="SPCC" />);
    expect(screen.queryByRole("button", { name: /with Wong Ka Yi/ })).toBeNull();
    expect(screen.getByRole("button", { name: /with Chan Tai Man/ })).toBeTruthy();
  });

  it("highlights the student the work is being set for", () => {
    render(<CurriculumFileUsage file={file()} scopeSchool="SPCC" studentId={2} />);
    const row = screen.getByText("Lee Siu Ming").closest("div");
    expect(row?.getAttribute("title")).toBe("This is the student you are setting work for.");
  });
});

describe("the usage count on a file row", () => {
  it("becomes a button that opens the list when the row can show it", () => {
    const toggle = vi.fn();
    render(<CurriculumFileBadges file={file()} scopeSchool="SPCC" onToggleUsage={toggle} />);
    const count = screen.getByRole("button", { name: "5×" });
    expect(count.getAttribute("aria-expanded")).toBe("false");
    expect(count.getAttribute("title")).toBe(
      "Assigned 5 times to 4 students across all schools, including 2 times to 2 SPCC students. " +
        "Click to see the students and lessons."
    );
    fireEvent.click(count);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it("stays plain text without a handler", () => {
    render(<CurriculumFileBadges file={file()} scopeSchool="SPCC" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("5×")).toBeTruthy();
  });
});
