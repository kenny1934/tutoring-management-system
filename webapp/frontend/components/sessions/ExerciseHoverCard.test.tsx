import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ExerciseHoverCard } from "./ExerciseHoverCard";
import type { SessionExercise } from "@/types";

function exercise(overrides: Partial<SessionExercise>): SessionExercise {
  return { id: 1, session_id: 10, exercise_type: "CW", created_by: "tutor", ...overrides };
}

const EXERCISES: SessionExercise[] = [
  exercise({ id: 1, exercise_type: "CW", pdf_name: "V:\\Maths\\F2 Algebra Revision.pdf", page_start: 3, page_end: 5 }),
  exercise({ id: 2, exercise_type: "Classwork", pdf_name: "Quadratics Worksheet B.pdf", remarks: "Q1-8 only" }),
  exercise({ id: 3, exercise_type: "HW", pdf_name: "Homework Sheet.pdf" }),
];

// Rest the mouse on the button long enough for the card's open delay to pass.
async function hoverWith(pointerType: string) {
  const button = screen.getByRole("button");
  fireEvent.pointerEnter(button.parentElement!, { pointerType });
  fireEvent.mouseMove(button.parentElement!, { pointerType });
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
}

describe("ExerciseHoverCard", () => {
  afterEach(() => vi.useRealTimers());

  it("lists the assigned classwork, old and new type names alike, with pages and remarks", async () => {
    vi.useFakeTimers();
    render(
      <ExerciseHoverCard exercises={EXERCISES} type="CW">
        <button>CW</button>
      </ExerciseHoverCard>
    );
    await hoverWith("mouse");

    expect(screen.getByText("Classwork")).toBeTruthy();
    expect(screen.getByText("(2)")).toBeTruthy();
    expect(screen.getByText("F2 Algebra Revision")).toBeTruthy();
    expect(screen.getByText("p3-5")).toBeTruthy();
    expect(screen.getByText("Quadratics Worksheet B")).toBeTruthy();
    expect(screen.getByText("Q1-8 only")).toBeTruthy();
    expect(screen.queryByText("Homework Sheet")).toBeNull();
  });

  it("says so when nothing is assigned", async () => {
    vi.useFakeTimers();
    render(
      <ExerciseHoverCard exercises={[]} type="HW">
        <button>HW</button>
      </ExerciseHoverCard>
    );
    await hoverWith("mouse");

    expect(screen.getByText("No homework assigned yet.")).toBeTruthy();
  });

  it("stays closed for a touch, so a tap goes straight to the button", async () => {
    vi.useFakeTimers();
    render(
      <ExerciseHoverCard exercises={EXERCISES} type="CW">
        <button>CW</button>
      </ExerciseHoverCard>
    );
    await hoverWith("touch");

    expect(screen.queryByText("Classwork")).toBeNull();
  });
});
