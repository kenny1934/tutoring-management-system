import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LessonWorksheetLoading } from "./LessonWorksheetLoading";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const props = { label: "Linear equations 3", pages: "2–3", toolbarClass: "toolbar", toolbarStart: <button>Leave focus</button> };

describe("worksheet loading and recovery", () => {
  it("keeps file context and focus controls while delaying a fast load's indicator", () => {
    render(<LessonWorksheetLoading {...props} message="Downloading PDF…" />);
    expect(screen.getByRole("button", { name: "Leave focus" })).toBeEnabled();
    expect(screen.getByText(props.label)).toBeInTheDocument();
    expect(screen.getByText("p2–3")).toBeInTheDocument();
    expect(screen.getByRole("status").closest("[data-pending]")).not.toBeNull();
    act(() => vi.advanceTimersByTime(180));
    expect(screen.getByRole("status").closest("[data-pending]")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Downloading worksheet…");
    act(() => vi.advanceTimersByTime(7820));
    expect(screen.getByRole("status")).toHaveTextContent("Still downloading worksheet…");
  });

  it("shows an immediate retry in the same workspace without exposing a private search path", () => {
    const retry = vi.fn();
    const { rerender, container } = render(<LessonWorksheetLoading {...props} message="Searching by filename: private.pdf…" />);
    expect(screen.queryByText(/private/)).toBeNull();
    rerender(<LessonWorksheetLoading {...props} error="The worksheet took too long to load." onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The worksheet took too long to load.");
    expect(container.querySelector('[aria-busy="false"][data-native-pdf-failed]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Leave focus" })).toBeEnabled();
  });

  it("does not offer a retry for a missing assignment", () => {
    render(<LessonWorksheetLoading {...props} error="No file assigned to this exercise" />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
