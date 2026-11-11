import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { NativeLessonPreview } from "./NativeLessonPreview";
import { SlotLessonLink } from "./SlotLessonLink";
import { LESSON_OPEN_EVENT, type LessonOpening } from "./lessonFrame";

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({ sessions: "retained" }, "", "/sessions?date=2026-11-05&tutor=4&ui-preview=motion");
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: query.includes("min-width") || query.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList));
  vi.spyOn(window.history, "back").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

function Header() {
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState("All");
  return <>
    <select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)}><option>All</option><option>Attended</option></select>
    <div data-native-lesson-slot onClick={() => setCollapsed(!collapsed)}>
      <h3>16:45 - 18:15</h3>
      {/* A multi-day list can contain a group whose date differs from the selected day. */}
      <SlotLessonLink date="2026-11-06" slot="16:45 - 18:15" tutorId="4" tutor="Ms Lee" location="MSA" />
    </div>
    <output>{collapsed ? "Collapsed" : "Expanded"}</output>
  </>;
}

describe("Sessions header lesson entry", () => {
  it.each(["desktop", "phone"])("opens the clicked group on %s and restores its filter, collapse, scroll and focus", async device => {
    if (device === "phone") vi.mocked(window.matchMedia).mockImplementation(query => ({ matches: query.includes("max-width") || query.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList));
    const main = document.createElement("main"); main.id = "main-content"; main.scrollTop = 320; document.body.append(main);
    vi.spyOn(main, "getBoundingClientRect").mockReturnValue({ left: device === "phone" ? 0 : 256, top: device === "phone" ? 56 : 0, right: 1440, bottom: 900, width: 1184, height: 900 } as DOMRect);
    const view = render(<NativeLessonPreview><Header /></NativeLessonPreview>, { container: main });
    try {
      fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Attended" } });
      const link = screen.getByRole("link", { name: "Lesson mode" });
      fireEvent.click(link);
      const frame = screen.getByTitle("Wide lesson workspace") as HTMLIFrameElement;
      const url = new URL(frame.src);
      if (device === "phone") {
        expect(frame.style.top).toBe("-56px");
        expect(frame.style.height).toBe(`${window.innerHeight + 56}px`);
        expect(frame.parentElement).toHaveStyle({ left: "0px", top: "0px", height: `${window.innerHeight}px` });
      }
      expect(url.searchParams.get("date")).toBe("2026-11-06");
      expect(url.searchParams.get("tutor_id")).toBe("4");
      expect(url.searchParams.has("lesson_session")).toBe(false);
      expect(screen.getByText("Expanded")).toBeInTheDocument();
      expect(screen.getByLabelText("Status")).toHaveValue("Attended");
      expect(screen.getByRole("dialog").textContent).toContain("Ms Lee · 16:45 - 18:15");
      act(() => window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin: window.location.origin, data: { type: "csm-wide-closed", token: url.searchParams.get("lesson_frame") } })));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByRole("link", { name: "Lesson mode" })).toBe(link);
      expect(link).toHaveFocus();
      expect(main.scrollTop).toBe(320);
      expect(screen.getByLabelText("Status")).toHaveValue("Attended");
      expect(screen.getByText("Expanded")).toBeInTheDocument();
    } finally { view.unmount(); main.remove(); }
  });

  it("leaves modified clicks to the real link without collapsing the time slot", () => {
    const request = vi.fn(); window.addEventListener(LESSON_OPEN_EVENT, request);
    const view = render(<Header />);
    try {
      const link = screen.getByRole("link", { name: "Lesson mode" });
      for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) fireEvent.click(link, { [modifier]: true });
      expect(request).not.toHaveBeenCalled();
      expect(link).toHaveAttribute("target", "_blank");
      expect(screen.getByText("Expanded")).toBeInTheDocument();
    } finally { window.removeEventListener(LESSON_OPEN_EVENT, request); view.unmount(); }
  });

  it("uses the visible header as its source and never invents a selected student", () => {
    const view = render(<Header />);
    const link = screen.getByRole("link", { name: "Lesson mode" });
    const header = link.closest<HTMLElement>("[data-native-lesson-slot]")!;
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ left: 320, top: 170, right: 1200, bottom: 220 } as DOMRect);
    let detail: LessonOpening | undefined;
    const accept = (event: Event) => { detail = (event as CustomEvent<LessonOpening>).detail; event.preventDefault(); };
    window.addEventListener(LESSON_OPEN_EVENT, accept);
    try {
      fireEvent.click(link);
      expect(detail?.from).toEqual({ left: 320, top: 170, right: 1200, bottom: 220 });
      expect(detail?.identity).toBe(screen.getByRole("heading"));
      expect(detail?.student).toBeUndefined();
      expect(detail?.source).toBe(link);
    } finally { window.removeEventListener(LESSON_OPEN_EVENT, accept); view.unmount(); }
  });

  it("opens ordinary application links in place without a preview flag", () => {
    window.history.replaceState({}, "", "/sessions");
    const main = document.createElement("main"); main.id = "main-content"; document.body.append(main);
    const view = render(<NativeLessonPreview><Header /></NativeLessonPreview>, { container: main });
    const link = screen.getByRole("link", { name: "Lesson mode" });
    expect(new URL((link as HTMLAnchorElement).href).searchParams.has("ui-preview")).toBe(false);
    fireEvent.click(link);
    expect(screen.getByTitle("Wide lesson workspace")).toBeInTheDocument();
    view.unmount(); main.remove();
  });
});
