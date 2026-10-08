import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ComponentProps } from "react";

// The lesson number badge saves through these, and nothing here saves.
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: () => {} }) }));
vi.mock("@/contexts/ConfirmContext", () => ({ useConfirm: () => async () => true }));

import { LessonWideSidebar } from "./LessonWideSidebar";
import type { FileGroup, StudentExerciseEntry } from "./LessonWideMode";
import type { Session } from "@/types";

const PDF = "Algebra\\Linear equations 3.pdf";
const sessions = ["Chan Tai Man", "Wong Siu Ming"].map((name, i) => ({
  id: 100 + i, student_id: 900 + i, student_name: name, school_student_id: String(1234 + i),
  grade: "F2", lesson_number: 12, location: "MSA", session_date: "2026-09-11", time_slot: "16:45",
  school: i === 0 ? "SRL-E" : undefined,
  exercises: [{ id: 1000 + i, exercise_type: "CW", pdf_name: PDF }],
})) as unknown as Session[];
const allEntries = sessions.flatMap((session) => (session.exercises ?? []).map((exercise) => ({
  session, exercise, studentName: session.student_name, studentId: session.school_student_id, grade: "F2", langStream: null,
}))) as unknown as StudentExerciseEntry[];
const fileGroups: FileGroup[] = [{ pdfName: PDF, displayName: "Linear equations 3", exerciseType: "CW", entries: allEntries }];

function renderSidebar(
  sidebarMode: "by-student" | "by-file",
  extra: Partial<ComponentProps<typeof LessonWideSidebar>> = {},
) {
  render(
    <LessonWideSidebar
      sessions={sessions}
      students={sessions}
      fileGroups={fileGroups}
      allEntries={allEntries}
      sidebarMode={sidebarMode}
      onSidebarModeChange={() => {}}
      selectedEntry={null}
      onEntrySelect={() => {}}
      onStudentOpen={() => {}}
      onEditExercises={() => {}}
      selectedLocation="MSA"
      {...extra}
    />,
  );
}

describe("LessonWideSidebar lesson draft", () => {
  const draftRow = () => screen.getByRole("button", { name: /^Lesson draft/ });

  it("offers the slot's own Draft above the students, with the ink dot when it has some", () => {
    const onOpen = vi.fn();
    renderSidebar("by-student", { lessonDraft: { open: false, hasInk: true, onOpen } });
    expect(within(draftRow()).getByTitle("Has annotations")).toBeInTheDocument();
    expect(draftRow()).not.toHaveAttribute("aria-current");

    fireEvent.click(draftRow());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("marks the row while the Draft is on screen", () => {
    renderSidebar("by-file", { lessonDraft: { open: true, hasInk: false, onOpen: () => {} } });
    expect(draftRow()).toHaveAttribute("aria-current", "true");
    expect(within(draftRow()).queryByTitle("Has annotations")).toBeNull();
  });

  it("has no row when the view leaves the Draft out, as on a phone", () => {
    renderSidebar("by-student");
    expect(screen.queryByRole("button", { name: /^Lesson draft/ })).toBeNull();
  });
});

describe("LessonWideSidebar schools", () => {
  it("shows a student's school after their grade when grouped by student", () => {
    renderSidebar("by-student");
    expect(screen.getAllByText("SRL-E")).toHaveLength(1);
  });

  it("shows it on the student's row under each file when grouped by file", () => {
    renderSidebar("by-file");
    expect(screen.getAllByText("SRL-E")).toHaveLength(1);
  });
});

describe("LessonWideSidebar folding", () => {
  it("collapses every student at once, then expands them all again", () => {
    renderSidebar("by-student");
    expect(screen.getAllByRole("button", { name: "Collapse" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.getAllByRole("button", { name: "Expand" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getAllByRole("button", { name: "Collapse" })).toHaveLength(2);
  });

  it("keeps offering Collapse all while any student is still open", () => {
    renderSidebar("by-student");
    fireEvent.click(screen.getAllByRole("button", { name: "Collapse" })[0]);
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  });

  it("folds the files the same way when the pane is grouped by file", () => {
    renderSidebar("by-file");
    const fileHeader = screen.getByText("Linear equations 3").closest("button")!;
    expect(fileHeader).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(fileHeader).toHaveAttribute("aria-expanded", "false");
  });
});

describe("LessonWideSidebar students not in CSM yet", () => {
  const record = {
    id: 7, student_id: 950, student_name: "Lee Ka Yan", school_student_id: "1300", grade: "F2", lang_stream: "E",
    school: null, tutor_id: 5, tutor_name: "Tutor B", lesson_date: "2026-09-11", time_slot: "16:45", location: "MSA",
    notes: null, performance_rating: null, status: "waiting", filled_session_id: null, filled_at: null,
    dismissed_at: null, dismiss_reason: null, created_at: null, created_by: null,
    exercises: [{ exercise_type: "CW", pdf_name: PDF, url: null, url_title: null, page_start: null, page_end: null,
      remarks: null, answer_pdf_name: null, answer_page_start: null, answer_page_end: null, answer_remarks: null }],
  } as const;

  it("lists them under the students, and opens their worksheet", async () => {
    const { unlistedLessonEntries } = await import("@/lib/unlisted-lesson-entries");
    const entries = unlistedLessonEntries(record as never);
    const onUnlistedEntryOpen = vi.fn();
    renderSidebar("by-student", { unlisted: [{ lesson: record as never, entries }], onUnlistedEntryOpen });
    expect(screen.getByText("Not in CSM yet")).toBeInTheDocument();
    expect(screen.getByText("Lee Ka Yan")).toBeInTheDocument();
    const section = screen.getByText("Lee Ka Yan").closest("div.rounded-lg") as HTMLElement;
    fireEvent.click(within(section).getByRole("button", { name: /Linear equations 3/ }));
    expect(onUnlistedEntryOpen).toHaveBeenCalledWith(entries[0]);
  });

  it("offers to change the record", () => {
    const onUnlistedEdit = vi.fn();
    renderSidebar("by-file", { unlisted: [{ lesson: record as never, entries: [] }], onUnlistedEdit });
    fireEvent.click(screen.getByRole("button", { name: "Change what's recorded for Lee Ka Yan" }));
    expect(onUnlistedEdit).toHaveBeenCalledWith(record);
  });

  it("hides the change button from a read-only viewer", () => {
    renderSidebar("by-student", { unlisted: [{ lesson: record as never, entries: [] }], onUnlistedEdit: vi.fn(), isReadOnly: true });
    expect(screen.queryByRole("button", { name: /Change what's recorded/ })).toBeNull();
  });
});
