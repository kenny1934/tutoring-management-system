import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelLessonFrameNavigation, connectLessonFrame } from "./lessonFrame";

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, "", "/"); });

describe("embedded lesson navigation requests", () => {
  it("uses the existing save guard for navigation, validates the sender and reports Stay to the host", () => {
    const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent")!;
    const parent = { postMessage: vi.fn() };
    Object.defineProperty(window, "parent", { configurable: true, value: parent });
    window.history.replaceState({}, "", "/sessions/lesson?lesson_frame=test-token");
    const stage = document.createElement("div"); document.body.append(stage);
    const exit = vi.fn(), navigate = vi.fn();
    const disconnect = connectLessonFrame(exit, stage, navigate);
    const send = (type: string, overrides: Partial<MessageEventInit> = {}) => window.dispatchEvent(new MessageEvent("message", {
      source: parent as unknown as Window, origin: window.location.origin, data: { type, token: "test-token" }, ...overrides,
    }));
    try {
      send("csm-wide-navigate-request", { source: window });
      send("csm-wide-navigate-request", { origin: "https://other.invalid" });
      send("csm-wide-navigate-request", { data: { type: "csm-wide-navigate-request", token: "wrong" } });
      expect(navigate).not.toHaveBeenCalled();
      send("csm-wide-navigate-request"); expect(navigate).toHaveBeenCalledOnce(); expect(exit).not.toHaveBeenCalled();
      send("csm-wide-exit-request"); expect(exit).toHaveBeenCalledOnce();
      cancelLessonFrameNavigation();
      expect(parent.postMessage).toHaveBeenCalledWith({ type: "csm-wide-navigation-cancelled", token: "test-token" }, window.location.origin);
      disconnect(); send("csm-wide-navigate-request"); expect(navigate).toHaveBeenCalledOnce();
    } finally { disconnect(); stage.remove(); Object.defineProperty(window, "parent", parentDescriptor); }
  });

  it("does not change a standalone lesson's app navigation", () => {
    window.history.replaceState({}, "", "/sessions/lesson?ui-preview=motion");
    const stage = document.createElement("div"); document.body.append(stage);
    const exit = vi.fn(); const disconnect = connectLessonFrame(exit, stage);
    expect(stage.inert).not.toBe(true);
    cancelLessonFrameNavigation(); expect(exit).not.toHaveBeenCalled();
    disconnect(); stage.remove();
  });
});
