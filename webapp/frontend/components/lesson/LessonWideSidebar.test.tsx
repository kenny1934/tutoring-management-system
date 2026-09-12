import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

function renderSidebar(sidebarMode: "by-student" | "by-file") {
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
    />,
  );
}

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
