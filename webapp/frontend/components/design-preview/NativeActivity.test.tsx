import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ActivityEvent } from "@/types";
import { NativeActivityRows } from "./NativeActivityRows";
import { NativeRecentActivity } from "./NativeRecentActivity";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";

const mocks = vi.hoisted(() => ({
  recent: vi.fn(), history: vi.fn(), mutate: vi.fn(), phone: false,
  values: new Map<string, unknown>(),
}));
vi.mock("@/lib/hooks", () => ({ useActivityFeed: (...args: unknown[]) => mocks.recent(...args), useTutors: () => ({ data: [] }) }));
vi.mock("@/lib/api", () => ({ statsAPI: { getActivityFeed: (...args: unknown[]) => mocks.history(...args) } }));
vi.mock("@/contexts/LocationContext", () => ({ useLocation: () => ({ selectedLocation: "All Locations" }) }));
vi.mock("@/hooks/usePopoverSheet", async original => ({ ...await original<object>(), useAsSheet: () => mocks.phone }));
vi.mock("./NativeNavigationMemory", async () => {
  const { useState, useEffect } = await import("react");
  const memory = { get: (key: string) => mocks.values.get(key), set: (key: string, value: unknown) => mocks.values.set(key, value) };
  return {
    useNativeNavigationMemory: () => memory,
    useNativeViewState: (key: string, initial: () => unknown) => {
      const [value, setValue] = useState(() => mocks.values.get(key) ?? initial());
      useEffect(() => { mocks.values.set(key, value); }, [key, value]);
      return [value, setValue];
    },
  };
});

const event = (id: number, overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id: `session-${id}`, type: "session_attended", title: "Attended",
  student: `Student ${id}`, school_student_id: String(id), location: "MSA",
  description: "F3E · Algebra exercises", timestamp: `2026-11-10T09:${String(id % 60).padStart(2, "0")}:00Z`,
  link: `/students/${id}`, modified_by: "tutor@example.test", ...overrides,
});
const batch = (start: number, count = 50) => Array.from({ length: count }, (_, i) => event(start + i));
const config = ({ children }: { children: ReactNode }) => <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>;

beforeEach(() => {
  mocks.phone = false; mocks.values.clear(); mocks.history.mockReset(); mocks.recent.mockReset(); mocks.mutate.mockReset();
  mocks.recent.mockReturnValue({ data: [event(1)], isLoading: false, error: null, mutate: mocks.mutate });
  mocks.history.mockImplementation(async (_location, _tutor, _limit, offset) => batch(offset + 1));
  window.history.replaceState({}, "", "/?ui-preview=motion"); window.sessionStorage.clear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("native activity rows", () => {
  it("retains full student names, real IDs, descriptions, actor names and destination links", () => {
    render(<NativeActivityRows events={[event(1, { student: "A Student With A Long Unabbreviated Name", description: "A complete description that must remain readable", modified_by: "Teacher Long Name" }), event(2, { student: "", school_student_id: undefined, title: "Payment received" })]} location="All Locations" />);
    expect(screen.getByText("A Student With A Long Unabbreviated Name")).toBeInTheDocument();
    expect(screen.getByText("MSA-1")).toBeInTheDocument();
    expect(screen.getByText("A complete description that must remain readable")).toBeInTheDocument();
    expect(screen.getByText("Teacher Long Name")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /A Student With/ })).toHaveAttribute("href", "/students/1");
    expect(screen.getByText("Payment received")).toBeInTheDocument();
    expect(screen.queryByText("N/A")).not.toBeInTheDocument();
  });

  it("animates only fresh visible arrivals, and remembers read rows on return", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 500, 40));
    const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    const first = event(1), fresh = event(2), older = event(3, { timestamp: "2026-11-09T09:00:00Z" });
    const view = render(<NativeActivityRows events={[first]} location="MSA" arrivalKey="MSA:all" />);
    expect(animate).not.toHaveBeenCalled();
    view.rerender(<NativeActivityRows events={[fresh, first]} location="MSA" arrivalKey="MSA:all" />);
    expect(animate).toHaveBeenCalledOnce();
    view.rerender(<NativeActivityRows events={[fresh, first, older]} location="MSA" arrivalKey="MSA:all" />);
    expect(animate).toHaveBeenCalledOnce();
    view.unmount();
    render(<NativeActivityRows events={[fresh, first]} location="MSA" arrivalKey="MSA:all" />);
    expect(animate).toHaveBeenCalledOnce();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });

  it("keeps arrivals still with reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList);
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    const view = render(<NativeActivityRows events={[event(1)]} location="MSA" arrivalKey="reduced" />);
    view.rerender(<NativeActivityRows events={[event(2), event(1)]} location="MSA" arrivalKey="reduced" />);
    expect(animate).not.toHaveBeenCalled();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });
});

describe("native activity history", () => {
  it("fetches history only on demand and restores loaded pages, scroll and source focus on reopening", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const scroller = this.closest<HTMLElement>('[data-native-scroll="activity-history"]');
      const row = Number(this.dataset.activityRow?.split("-")[1]);
      return new DOMRect(0, row ? (row - 1) * 40 - (scroller?.scrollTop ?? 0) : 0, 500, 40);
    });
    const main = document.createElement("main"); main.id = "main-content"; document.body.append(main); main.scrollTop = 180;
    const view = render(<NativeRecentActivity tutorId={17} />, { wrapper: config, container: main });
    expect(mocks.history).not.toHaveBeenCalled();
    const trigger = screen.getByRole("button", { name: "View all" }); fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "All activity" });
    await waitFor(() => expect(within(dialog).getAllByRole("link")).toHaveLength(50));
    expect(mocks.history).toHaveBeenCalledWith("All Locations", 17, 50, 0);
    expect(main.inert).toBe(true); expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(within(dialog).getAllByRole("link")).toHaveLength(100));
    const scroller = dialog.querySelector<HTMLElement>('[data-native-scroll="activity-history"]')!;
    scroller.scrollTop = 240; fireEvent.scroll(scroller);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    // AnimatePresence removes its exiting surface before onExitComplete unmounts
    // the history owner. Focus and scroll locks return in that owner's cleanup.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus(); expect(main.inert).not.toBe(true);
      expect(document.body.style.overflow).not.toBe("hidden");
    });
    expect(main.scrollTop).toBe(180);
    expect(mocks.values.get("dashboard:activity-history:All Locations:17:place")).toEqual({ top: 240, id: "session-7", offset: 0 });
    fireEvent.click(trigger);
    const reopened = await screen.findByRole("dialog", { name: "All activity" });
    await waitFor(() => expect(within(reopened).getAllByRole("link")).toHaveLength(100));
    expect(reopened.querySelector<HTMLElement>('[data-native-scroll="activity-history"]')!.scrollTop).toBe(240);
    expect(mocks.values.get("dashboard:activity-history:All Locations:17:pages")).toBe(2);
    view.unmount(); main.remove();
  });

  it("keeps loaded rows when loading an older batch fails, then retries without duplicates", async () => {
    let fail = true;
    mocks.history.mockImplementation(async (_where, _tutor, _limit, offset) => {
      if (!offset) return batch(1);
      if (fail) throw new Error("Offline");
      return [event(50), event(51)];
    });
    render(<NativeRecentActivity />, { wrapper: config });
    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    const dialog = await screen.findByRole("dialog", { name: "All activity" });
    await waitFor(() => expect(within(dialog).getAllByRole("link")).toHaveLength(50));
    fireEvent.click(within(dialog).getByRole("button", { name: "Load more" }));
    const retry = await within(dialog).findByRole("button", { name: "Try again" });
    expect(within(dialog).getAllByRole("link")).toHaveLength(50);
    fail = false; fireEvent.click(retry);
    await waitFor(() => expect(within(dialog).getAllByRole("link")).toHaveLength(51));
    expect(within(dialog).queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("uses the shared phone sheet and returns to the dashboard on Escape", async () => {
    mocks.phone = true;
    const main = document.createElement("main"); main.id = "main-content"; document.body.append(main);
    const view = render(<NativeRecentActivity />, { wrapper: config, container: main });
    const trigger = screen.getByRole("button", { name: "View all" }); fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "All activity" });
    expect(main.inert).toBe(true); expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => { expect(main.inert).not.toBe(true); expect(trigger).toHaveFocus(); });
    view.unmount(); main.remove();
  });

  it("reports recent-feed errors without replacing cached rows with an empty state", () => {
    mocks.recent.mockReturnValue({ data: [event(1)], isLoading: false, error: new Error("Offline"), mutate: mocks.mutate });
    render(<NativeRecentActivity />);
    expect(screen.getByText("Student 1")).toBeInTheDocument();
    expect(screen.queryByText("No recent activity")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.mutate).toHaveBeenCalledOnce();
  });

  it("uses the accepted feed without requiring a preview choice", () => {
    window.history.replaceState({}, "", "/?ui-preview=original");
    render(<ActivityFeed isMobile />);
    expect(screen.getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all" })).toBeInTheDocument();
    expect(mocks.history).not.toHaveBeenCalled();
  });
});
