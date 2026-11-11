import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonWorksheetLoading } from "./LessonWorksheetLoading";
import { animateWorksheetReady, revealLessonSelection } from "./lessonReading";

afterEach(() => vi.restoreAllMocks());

describe("reading a populated lesson", () => {
  it("keeps the real file, page selection and focus exit available while the pages load", () => {
    const exit = vi.fn();
    render(<LessonWorksheetLoading label="Indices worksheet" pages="2-3,5-6" toolbarClass="toolbar" toolbarStart={<button onClick={exit}>Leave focus</button>} />);
    expect(screen.getByTitle("Indices worksheet")).toBeInTheDocument();
    expect(screen.getByText("p2-3,5-6")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading worksheet…");
    fireEvent.click(screen.getByRole("button", { name: "Leave focus" }));
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("reveals a row below the roster without moving the app or worksheet scroller", () => {
    const main = document.createElement("main"), roster = document.createElement("div"), row = document.createElement("button"), worksheet = document.createElement("div");
    main.append(roster, worksheet); roster.append(row);
    main.scrollTop = 80; worksheet.scrollTop = 640; roster.scrollTop = 100;
    vi.spyOn(roster, "getBoundingClientRect").mockReturnValue({ top: 120, bottom: 720, height: 600 } as DOMRect);
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ top: 900, bottom: 950, height: 50 } as DOMRect);
    revealLessonSelection(roster, row);
    expect(roster.scrollTop).toBe(342);
    expect(main.scrollTop).toBe(80);
    expect(worksheet.scrollTop).toBe(640);
  });

  it("leaves a visible selection still and ignores the hidden focus roster", () => {
    const roster = document.createElement("div"), row = document.createElement("button"); roster.scrollTop = 200;
    const frame = vi.spyOn(roster, "getBoundingClientRect").mockReturnValue({ top: 120, bottom: 720, height: 600 } as DOMRect);
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ top: 300, bottom: 350, height: 50 } as DOMRect);
    revealLessonSelection(roster, row); expect(roster.scrollTop).toBe(200);
    frame.mockReturnValue({ top: 0, bottom: 0, height: 0 } as DOMRect);
    revealLessonSelection(roster, row); expect(roster.scrollTop).toBe(200);
  });

  it("reveals an earlier row inside the roster and keeps the page arrival cancellable", () => {
    const roster = document.createElement("div"), row = document.createElement("button"), pages = document.createElement("div"); roster.scrollTop = 400; pages.scrollTop = 600;
    vi.spyOn(roster, "getBoundingClientRect").mockReturnValue({ top: 120, bottom: 720, height: 600 } as DOMRect);
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ top: 40, bottom: 90, height: 50 } as DOMRect);
    revealLessonSelection(roster, row); expect(roster.scrollTop).toBe(308);
    const cancel = vi.fn(); pages.animate = vi.fn().mockReturnValue({ cancel });
    animateWorksheetReady(pages)(); expect(cancel).toHaveBeenCalledOnce(); expect(pages.scrollTop).toBe(600);
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    animateWorksheetReady(pages)(); expect(pages.animate).toHaveBeenCalledOnce();
  });
});
