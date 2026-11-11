import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LessonResumeProvider, useLessonResumeEntry } from "./LessonResumeMemory";
import { activateLessonResumeScope, LessonResumeEntry, LessonResumeMemory, lessonTarget } from "./lessonResume";
import type { SessionExercise } from "@/types";

const target = lessonTarget(10, { id: 1, pdf_name: "A.pdf" } as SessionExercise);
const targets = [target];
function Probe() {
  const { entry, ready } = useLessonResumeEntry("class", targets, true);
  return <><span>{ready ? "Ready" : "Waiting"}</span><span>{entry.selected?.exerciseId ?? "Nothing"}</span><button onClick={() => entry.remember(target, "by-file")}>Choose worksheet</button></>;
}
beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("lesson frame memory lifetime", () => {
  it("flushes a pending choice when the frame unmounts and restores it in a new provider", () => {
    const first = render(<LessonResumeProvider scope="viewer" ready><Probe /></LessonResumeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Choose worksheet" }));
    first.unmount();
    render(<LessonResumeProvider scope="viewer" ready><Probe /></LessonResumeProvider>);
    expect(screen.getByText("1")).toBeInTheDocument();

  });
  it("waits for the authenticated scope without discarding an existing snapshot during hydration", () => {
    activateLessonResumeScope("viewer");
    const saved = new LessonResumeEntry(new LessonResumeMemory("viewer"), "class");
    saved.reconcile(targets); saved.remember(target, "by-student"); saved.flush();
    const app = render(<LessonResumeProvider scope={null} ready={false}><Probe /></LessonResumeProvider>);
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    app.rerender(<LessonResumeProvider scope="viewer" ready><Probe /></LessonResumeProvider>);
    expect(screen.getByText("1")).toBeInTheDocument();
    app.rerender(<LessonResumeProvider scope="another viewer" ready><Probe /></LessonResumeProvider>);
    expect(screen.getByText("Nothing")).toBeInTheDocument();
  });
  it("flushes a pending choice on pagehide without writing it again later", () => {
    render(<LessonResumeProvider scope="viewer" ready><Probe /></LessonResumeProvider>);
    const write = vi.spyOn(Storage.prototype, "setItem");
    fireEvent.click(screen.getByRole("button", { name: "Choose worksheet" }));
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(new LessonResumeEntry(new LessonResumeMemory("viewer"), "class").selected).toEqual(target);
    expect(write).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(300));
    expect(write).toHaveBeenCalledOnce();

  });
});
