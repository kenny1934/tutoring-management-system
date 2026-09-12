import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StudentStrip } from "./StudentStrip";
import type { StudentExerciseEntry } from "./LessonWideMode";
import type { Session, SessionExercise } from "@/types";

function entry(exerciseId: number, studentName: string): StudentExerciseEntry {
  return {
    session: { id: 7, school_student_id: "1023", location: "MSA", student_name: studentName } as Session,
    exercise: { id: exerciseId, session_id: 7, exercise_type: "CW", pdf_name: "a.pdf" } as SessionExercise,
    studentName,
    studentId: "1023",
    grade: null,
    langStream: null,
  };
}

describe("StudentStrip", () => {
  it("names the student in large letters and says where they are in the slot", () => {
    render(<StudentStrip entry={entry(1, "CHAN Tai Man")} position={{ index: 2, total: 5 }} selectedLocation="MSA" />);
    expect(screen.getByText("CHAN Tai Man")).toHaveClass("text-lg");
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
  });

  it("greys out an arrow with nobody beyond it", () => {
    const onNext = vi.fn();
    render(<StudentStrip entry={entry(1, "CHAN Tai Man")} position={{ index: 1, total: 2 }} onNext={onNext} selectedLocation="MSA" />);
    expect(screen.getByRole("button", { name: "Previous student" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next student" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("holds what it's given at its two ends, outside the arrows", () => {
    render(
      <StudentStrip
        entry={entry(1, "CHAN Tai Man")}
        position={{ index: 1, total: 2 }}
        selectedLocation="MSA"
        start={<button type="button">Students</button>}
        end={<button type="button">Leave focus</button>}
      />,
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent || b.getAttribute("aria-label")))
      .toEqual(["Students", "Previous student", "Next student", "Leave focus"]);
  });

  it("shows a preview by its own name, with no student number, school or count", () => {
    const preview = entry(-3, "Parallel CW");
    preview.session.school = "SRL-E";
    render(<StudentStrip entry={preview} position={null} selectedLocation="MSA" />);
    expect(screen.getByText("Parallel CW")).toBeInTheDocument();
    expect(screen.queryByText("1023")).toBeNull();
    expect(screen.queryByText("SRL-E")).toBeNull();
    expect(screen.queryByText(/ of /)).toBeNull();
  });

  it("shows the student's school after their grade", () => {
    const withSchool = entry(1, "CHAN Tai Man");
    withSchool.session.school = "DBYW-C";
    render(<StudentStrip entry={withSchool} position={{ index: 1, total: 2 }} selectedLocation="MSA" />);
    expect(screen.getByText("DBYW-C")).toBeInTheDocument();
  });
});
