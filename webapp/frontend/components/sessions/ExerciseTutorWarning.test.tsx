import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseTutorWarning } from "./ExerciseTutorWarning";

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthContext", () => ({ useAuth: auth }));
const session = { tutor_id: 2, tutor_name: "Assigned Tutor" };
beforeEach(() => {
  auth.mockReturnValue({ user: { id: 3 }, effectiveRole: "Tutor", impersonatedTutor: null });
});

describe("exercise tutor warnings", () => {
  it("names the assigned tutor without asking for confirmation", () => {
    render(<ExerciseTutorWarning sessions={[session]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This session is assigned to Assigned Tutor.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("shows the mismatch count for a batch", () => {
    render(<ExerciseTutorWarning sessions={[session, { tutor_id: 3, tutor_name: "Me" }, { tutor_id: 4, tutor_name: "Other Tutor" }]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("2 of the selected sessions are assigned to other tutors.");
  });
  it("uses singular wording for one mismatch in a batch", () => {
    render(<ExerciseTutorWarning sessions={[session, { tutor_id: 3, tutor_name: "Me" }]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("1 of the selected sessions is assigned to another tutor.");
  });
  it("uses the tutor being impersonated instead of the signed-in admin", () => {
    auth.mockReturnValue({ user: { id: 2 }, effectiveRole: "Tutor", impersonatedTutor: { id: 3 } });
    render(<ExerciseTutorWarning sessions={[session]} />);
    expect(screen.getByRole("alert")).toBeVisible();
  });
  it("does not warn for the assigned tutor's own session", () => {
    auth.mockReturnValue({ user: { id: 2 }, effectiveRole: "Tutor", impersonatedTutor: null });
    render(<ExerciseTutorWarning sessions={[session]} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it.each(["Admin", "Super Admin", "Supervisor", "Guest"])("does not warn for %s", (effectiveRole) => {
    auth.mockReturnValue({ user: { id: 3 }, effectiveRole, impersonatedTutor: null });
    render(<ExerciseTutorWarning sessions={[session]} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
