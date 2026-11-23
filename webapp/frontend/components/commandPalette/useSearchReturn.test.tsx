import { act, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBackToClose } from "@/hooks/useBackToClose";
import type { SearchOrigin } from "@/contexts/CommandPaletteContext";
import { useSearchReturn } from "./useSearchReturn";
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname, useSearchParams: () => new URLSearchParams(location.search) }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Search navigation history", () => {
  it("keeps a slow phone navigation intact after closing search, then releases its history protection", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: query === "(pointer: coarse)", media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    window.history.replaceState({ csmSearchReturn: "return-token" }, "", "/sessions");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const view = renderHook(() => {
      const [open, setOpen] = useState(true);
      useBackToClose(open, () => setOpen(false));
      const origin = useRef<SearchOrigin | null>({ token: "return-token", source: null, anchor: null, scroll: [], url: location.origin + "/sessions" });
      const journey = useSearchReturn("tutor-5:MSA", () => setOpen(true), origin, () => ({ query: "learner", index: 0, path: [], top: 80 }), () => {});
      return () => { journey.remember(); setOpen(false); };
    });
    const overlay = window.history.state.csmOverlay;
    act(() => view.result.current()); act(() => vi.advanceTimersByTime(400));
    expect(back).not.toHaveBeenCalled(); expect(location.pathname).toBe("/sessions");
    window.history.pushState({}, "", "/students/1"); view.rerender();
    act(() => { window.history.replaceState({ csmOverlay: overlay, csmSearchNavigation: "return-token" }, "", "/sessions"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(back).toHaveBeenCalledOnce(); view.unmount();
  });
});
