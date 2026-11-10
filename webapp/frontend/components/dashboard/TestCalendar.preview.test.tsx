import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestCalendar } from "./TestCalendar";
import type { CalendarEvent } from "@/types";

const h = vi.hoisted(() => ({ phone: true, events: [] as CalendarEvent[], push: vi.fn(), sync: vi.fn(), loadOlder: vi.fn(), readOnly: true, loading: false, validating: false, failure: null as Error | null, mutate: vi.fn() }));
vi.mock("@/lib/hooks", () => ({
  useCalendarEvents: () => ({ data: h.events, isLoading: h.loading, isValidating: h.validating, error: h.failure, mutate: h.mutate }),
  useExamsWithSlots: () => ({ data: [] }),
  useHolidays: () => ({ data: [{ id: 1, holiday_date: "2026-11-12", holiday_name: "School holiday" }] }),
}));
vi.mock("@/lib/hooks/index", () => ({ useCalendarSync: () => ({ isSyncing: false, lastSyncMessage: null, fetchDaysBehind: 60, handleManualSync: h.sync, handleLoadOlderMonth: h.loadOlder }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, isReadOnly: h.readOnly }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/hooks/usePopoverSheet", async original => ({ ...await original<object>(), useAsSheet: () => h.phone }));
vi.mock("./CalendarEventModal", () => ({ CalendarEventModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <p>Event editor</p> : null }));

const event = (id: number): CalendarEvent => ({ id, event_id: String(id), title: `Algebra test ${id}`, description: "Indices, equations and their applications.", start_date: "2026-11-10", event_type: "Test", created_at: "", updated_at: "", last_synced_at: "" });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-09T12:00:00"));
  h.phone = true; h.readOnly = true; h.loading = false; h.validating = false; h.failure = null; h.events = Array.from({ length: 7 }, (_, i) => event(i + 1));
  vi.clearAllMocks(); sessionStorage.clear(); window.history.replaceState({}, "", "/?ui-preview=motion");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.querySelectorAll("[data-calendar-test-host]").forEach(el => el.remove()); });

function mount() {
  const main = document.createElement("main"); main.id = "main-content"; main.dataset.calendarTestHost = ""; document.body.append(main);
  return { main, ...render(<TestCalendar isMobile={h.phone} />, { container: main }) };
}

describe("calendar composition preview", () => {
  it("starts with upcoming tests and expands from the month heading without losing events", () => {
    const { container } = mount();
    const toggle = screen.getByRole("button", { name: "Show calendar for November 2026" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("grid", { name: "Calendar" })).toBeNull();
    expect(container.querySelector("[data-calendar-fold]")).toHaveAttribute("inert");
    expect(screen.getAllByRole("link", { name: /Algebra test/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show all 7" }));
    expect(screen.getAllByRole("link", { name: /Algebra test/ })).toHaveLength(7);
    fireEvent.click(toggle);
    expect(screen.getByRole("grid", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
    fireEvent.click(screen.getByRole("gridcell", { name: /Tuesday, November 10,/ }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    expect(screen.getAllByRole("link", { name: /Algebra test/ })).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    expect(screen.getAllByRole("link", { name: /Algebra test/ })).toHaveLength(7);
    expect(h.sync).not.toHaveBeenCalled(); expect(h.loadOlder).not.toHaveBeenCalled();
  });

  it("returns to the current day from the expanded phone month", () => {
    mount();
    const toggle = screen.getByRole("button", { name: /Show calendar/ });
    fireEvent.click(toggle); fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("button", { name: "Show calendar for November 2026" })).toHaveFocus();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByText("No events on this date")).toBeInTheDocument();
  });

  it("offers a named syllabus sheet and returns to the same button and scroll position", async () => {
    const { main, unmount } = mount(); main.scrollTop = 260;
    const button = screen.getByRole("button", { name: "View syllabus for Algebra test 1" });
    fireEvent.click(button);
    expect(await screen.findByRole("dialog", { name: "Syllabus" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Syllabus" })).toHaveTextContent(h.events[0].description!);
    expect(main.inert).toBe(true);
    expect(h.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Syllabus" })).toBeNull());
    await waitFor(() => expect(button).toHaveFocus());
    expect(main.inert).not.toBe(true); expect(main.scrollTop).toBe(260);
    expect(h.push).not.toHaveBeenCalled(); unmount();
  });

  it("keeps event navigation separate from syllabus and preserves holidays and empty dates", () => {
    mount();
    fireEvent.keyDown(screen.getAllByRole("link", { name: /Algebra test/ })[0], { key: "Enter" });
    expect(h.push).toHaveBeenCalledWith("/exams?exam=1");
    const toggle = screen.getByRole("button", { name: /Show calendar/ }); fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("gridcell", { name: /Thursday, November 12, School holiday/ }));
    expect(screen.getByText("School holiday")).toBeInTheDocument();
    fireEvent.click(toggle); fireEvent.click(screen.getByRole("gridcell", { name: /Friday, November 13$/ }));
    expect(screen.getByText("No events on this date")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add event" })).toBeNull();
  });

  it("keeps cached events and month disclosure through a failed refresh, then offers retry", () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: /Show calendar/ }));
    const row = screen.getAllByRole("link", { name: /Algebra test/ })[0];
    h.failure = new Error("Offline");
    view.rerender(<TestCalendar isMobile />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t refresh tests and exams");
    expect(screen.getAllByRole("link", { name: /Algebra test/ })[0]).toBe(row);
    expect(screen.getByRole("grid", { name: "Calendar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(h.mutate).toHaveBeenCalledOnce();
  });

  it("offers retry after an initial failure and distinguishes loading from an empty calendar", () => {
    h.events = []; h.failure = new Error("Offline");
    const view = mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load tests and exams");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(h.mutate).toHaveBeenCalledOnce();
    h.failure = null; h.loading = true;
    view.rerender(<TestCalendar isMobile />);
    expect(screen.getByRole("status", { name: "Loading tests and exams" })).toBeInTheDocument();
    expect(screen.queryByText("No upcoming tests")).not.toBeInTheDocument();
  });

  it("keeps desktop details non-modal and defaults phones to the compact month", async () => {
    h.phone = false;
    const desktop = mount();
    expect(screen.getByRole("grid", { name: "Calendar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View syllabus for Algebra test 1" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(desktop.main.inert).not.toBe(true);
    expect(await screen.findByText(h.events[0].description!)).toBeInTheDocument();
    expect(h.push).not.toHaveBeenCalled(); desktop.unmount(); desktop.main.remove();
    h.phone = true; window.history.replaceState({}, "", "/?ui-preview=original");
    mount(); expect(screen.queryByRole("grid", { name: "Calendar" })).toBeNull();
    expect(screen.getByRole("button", { name: /Show calendar/ })).toBeInTheDocument();
  });
});
