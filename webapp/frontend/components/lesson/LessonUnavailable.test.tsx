import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LessonWidePage from "@/app/sessions/lesson/page";

const mocks = vi.hoisted(() => ({ push: vi.fn(), post: vi.fn(), sessions: vi.fn(), waiting: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="dynamic-lesson" /> }));
vi.mock("@/lib/hooks", () => ({ useSessions: mocks.sessions, useUnlistedLessons: mocks.waiting, usePageTitle: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isReadOnly: false }) }));
vi.mock("@/contexts/LocationContext", () => ({ useLocation: () => ({ selectedLocation: "MSA" }) }));

const parentFrame = { postMessage: mocks.post };
const params = "date=2026-11-07&slot=10%3A00+-+11%3A30&tutor_id=3";
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/sessions/lesson?" + params + "&lesson_frame=empty-lesson-test");
  vi.stubGlobal("parent", parentFrame);
  mocks.sessions.mockReturnValue({ data: [{ id: 10, time_slot: "10:00 - 11:30", session_status: "Rescheduled - Pending Make-up" }], isLoading: false, mutate: vi.fn() });
  mocks.waiting.mockReturnValue({ data: [], isLoading: false, mutate: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("unavailable whole-class lesson", () => {
  it("reveals the empty state to its host when a slot contains only pending make-ups, and can exit", async () => {
    render(<LessonWidePage />);
    expect(screen.getByRole("status")).toHaveTextContent("No sessions found for this time slot.");
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith({ type: "csm-wide-ready", token: "empty-lesson-test" }, window.location.origin));
    fireEvent.click(screen.getByRole("button", { name: "Exit lesson mode" }));
    expect(mocks.post).toHaveBeenCalledWith({ type: "csm-wide-closed", token: "empty-lesson-test" }, window.location.origin);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("answers a host Back request so an empty lesson does not trap the user", () => {
    render(<LessonWidePage />);
    window.dispatchEvent(new MessageEvent("message", { source: parentFrame as unknown as Window, origin: window.location.origin, data: { type: "csm-wide-exit-request", token: "empty-lesson-test" } }));
    expect(mocks.post).toHaveBeenCalledWith({ type: "csm-wide-closed", token: "empty-lesson-test" }, window.location.origin);
  });

  it("returns a standalone lesson to its date and tutor on the sessions page", () => {
    window.history.replaceState(null, "", "/sessions/lesson?" + params);
    render(<LessonWidePage />);
    fireEvent.click(screen.getByRole("button", { name: "Exit lesson mode" }));
    expect(mocks.push).toHaveBeenCalledWith("/sessions?date=2026-11-07&tutor=3");
  });

  it("makes a failed read distinguishable from an empty slot and hides the add-student action", () => {
    mocks.sessions.mockReturnValue({ isLoading: false, error: new Error("Unavailable"), mutate: vi.fn() });
    render(<LessonWidePage />);
    expect(screen.getByRole("status")).toHaveTextContent("Unable to load this lesson.");
    expect(screen.queryByText("Add a student who isn't listed")).not.toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith({ type: "csm-wide-ready", token: "empty-lesson-test" }, window.location.origin);
  });

  it("provides an exit when the lesson link is incomplete", () => {
    window.history.replaceState(null, "", "/sessions/lesson?lesson_frame=empty-lesson-test");
    render(<LessonWidePage />);
    expect(screen.getByRole("status")).toHaveTextContent("Missing required parameters.");
    expect(screen.getByRole("button", { name: "Exit lesson mode" })).toBeVisible();
    expect(mocks.post).toHaveBeenCalledWith({ type: "csm-wide-ready", token: "empty-lesson-test" }, window.location.origin);
  });

  it("keeps the current lesson mounted when a background refresh fails with cached sessions", () => {
    mocks.sessions.mockReturnValue({ data: [{ id: 10, time_slot: "10:00 - 11:30", session_status: "Attended" }], isLoading: false, error: new Error("Refresh failed"), mutate: vi.fn() });
    render(<LessonWidePage />);
    expect(screen.getByTestId("dynamic-lesson")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
