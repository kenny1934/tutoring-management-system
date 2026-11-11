import { useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { User } from "lucide-react";
import { useRecordTabJourney } from "./useRecordTabJourney";
import { StudentRecordTabs } from "./StudentRecordTabs";
import { RecordSaveFeedback, useRecordEditReturn } from "./RecordSaveFeedback";

const order = ["profile", "sessions", "tests"] as const;
type Tab = typeof order[number];
let testRecordId = 100;
beforeEach(() => { testRecordId += 10; });
const resize: Array<{ callback: ResizeObserverCallback; disconnected: boolean }> = [];
function watchResize() {
  resize.length = 0;
  vi.stubGlobal("ResizeObserver", class {
    item: typeof resize[number];
    constructor(callback: ResizeObserverCallback) { this.item = { callback, disconnected: false }; resize.push(this.item); }
    observe() {}
    disconnect() { this.item.disconnected = true; }
  });
}
const resizeContents = () => act(() => resize.filter(item => !item.disconnected).forEach(item => item.callback([], {} as ResizeObserver)));

function Record({ recordId = testRecordId, ready = true, initialTab = "profile" }: { recordId?: number; ready?: boolean; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const scroller = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), anchor = useRef<HTMLDivElement>(null);
  const { prepareTab, direction } = useRecordTabJourney({ recordId, activeTab: tab, order, scrollerRef: scroller, contentRef: content, anchorRef: anchor, ready });
  if (!ready) return <p>Loading</p>;
  return <div ref={scroller} data-testid="scroller">
    <div ref={anchor}>{order.map(id => <button key={id} onClick={() => { prepareTab(id); setTab(id); }}>{id}</button>)}</div>
    <div ref={content} data-testid="content" data-direction={direction}>{tab}</div>
  </div>;
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("student record tab journey", () => {
  it("remembers separate tab positions, keeps focus and resets for a different student", () => {
    const { rerender } = render(<Record />);
    const scroller = screen.getByTestId("scroller");
    scroller.scrollTop = 480;
    fireEvent.click(screen.getByText("sessions", { selector: "button" }));
    expect(scroller.scrollTop).toBe(0);
    scroller.scrollTop = 940;
    const profile = screen.getByText("profile", { selector: "button" });
    profile.focus(); fireEvent.click(profile);
    expect(scroller.scrollTop).toBe(480);
    expect(profile).toHaveFocus();
    expect(screen.getByTestId("content")).toHaveAttribute("data-direction", "-1");
    fireEvent.click(screen.getByText("sessions", { selector: "button" }));
    expect(scroller.scrollTop).toBe(940);
    rerender(<Record recordId={testRecordId + 1} />);
    expect(scroller.scrollTop).toBe(0);
  });

  it("resumes the reading position after the record page is unmounted for another route", () => {
    const { unmount } = render(<Record initialTab="sessions" />);
    const original = screen.getByTestId("scroller");
    original.scrollTop = 900; fireEvent.scroll(original);
    unmount();
    render(<Record initialTab="sessions" />);
    expect(screen.getByTestId("scroller").scrollTop).toBe(900);
    fireEvent.click(screen.getByText("profile", { selector: "button" }));
    expect(screen.getByTestId("scroller").scrollTop).toBe(0);
  });

  it("waits for late content to restore its position, but lets a wheel gesture take over", () => {
    watchResize(); render(<Record />);
    const scroller = screen.getByTestId("scroller");
    let top = 0, maximum = 1000;
    Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => top, set: value => { top = Math.min(value, maximum); } });
    scroller.scrollTop = 800;
    fireEvent.click(screen.getByText("sessions", { selector: "button" }));
    maximum = 120;
    fireEvent.click(screen.getByText("profile", { selector: "button" }));
    expect(top).toBe(120);
    maximum = 1000; resizeContents(); expect(top).toBe(800);
    // A quick departure before the destination finishes loading keeps its saved place.
    fireEvent.click(screen.getByText("sessions", { selector: "button" }));
    maximum = 120;
    fireEvent.click(screen.getByText("profile", { selector: "button" }));
    fireEvent.click(screen.getByText("sessions", { selector: "button" }));
    maximum = 1000;
    fireEvent.click(screen.getByText("profile", { selector: "button" }));
    expect(top).toBe(800);
    fireEvent.click(screen.getByText("sessions", { selector: "button" }));
    maximum = 120;
    fireEvent.click(screen.getByText("profile", { selector: "button" }));
    fireEvent.wheel(scroller); scroller.scrollTop = 50; fireEvent.scroll(scroller);
    maximum = 1000; resizeContents(); expect(top).toBe(50);
  });

  it("starts after loading, adjusts focus padding for the identity and releases observers on unmount", () => {
    watchResize(); const { rerender, unmount } = render(<Record ready={false} />);
    expect(resize).toHaveLength(0);
    rerender(<Record ready />);
    const scroller = screen.getByTestId("scroller");
    expect(scroller.style.scrollPaddingTop).toBe("12px");
    const anchor = screen.getByText("profile", { selector: "button" }).parentElement!;
    Object.defineProperty(anchor, "offsetHeight", { value: 140 });
    resizeContents(); expect(scroller.style.scrollPaddingTop).toBe("152px");
    unmount(); expect(resize.every(item => item.disconnected)).toBe(true);
    expect(scroller.style.scrollPaddingTop).toBe("");
  });

  it("provides roving keyboard tabs and a single selected indicator", () => {
    function Tabs() {
      const [activeTab, setActiveTab] = useState<Tab>("profile");
      return <StudentRecordTabs tabs={order.map(id => ({ id, label: id, icon: User, count: id === "sessions" ? 14 : undefined }))} activeTab={activeTab} onChange={setActiveTab} />;
    }
    render(<Tabs />);
    const profile = screen.getByRole("tab", { name: "profile" });
    expect(profile).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(profile, { key: "ArrowRight" });
    const sessions = screen.getByRole("tab", { name: "sessions 14" });
    expect(sessions).toHaveFocus(); expect(sessions).toHaveAttribute("tabindex", "0");
    expect(profile).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(sessions, { key: "End" });
    const tests = screen.getByRole("tab", { name: "tests" });
    expect(tests).toHaveFocus();
    fireEvent.keyDown(tests, { key: "ArrowRight" }); expect(profile).toHaveFocus();
    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
  });
});

describe("record save confirmation", () => {
  it("announces a successful receipt briefly and does not replay an expired receipt on remount", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T04:00:00Z"));
    const receipt = Date.now();
    const { rerender, unmount } = render(<RecordSaveFeedback revision={0} />);
    expect(screen.getByRole("status")).not.toHaveTextContent("Saved");
    rerender(<RecordSaveFeedback revision={receipt} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    act(() => { vi.advanceTimersByTime(2700); });
    expect(screen.getByRole("status")).not.toHaveTextContent("Saved");
    unmount(); render(<RecordSaveFeedback revision={receipt} />);
    expect(screen.getByRole("status")).not.toHaveTextContent("Saved");
  });

  it("returns focus from a removed Save button without stealing it from a newer action", () => {
    function Actions({ editing, saving = false }: { editing: boolean; saving?: boolean }) {
      const ref = useRecordEditReturn(editing, saving);
      return <><div ref={ref}>{editing ? <div><button disabled={saving}>Save</button></div> : <button>Edit</button>}</div><button>Elsewhere</button></>;
    }
    const { rerender } = render(<Actions editing />);
    screen.getByText("Save").focus();
    // Disabling a pending Save can move native focus to the body before its effect runs.
    screen.getByText("Save").blur();
    rerender(<Actions editing saving />);
    rerender(<Actions editing={false} />);
    expect(screen.getByText("Edit")).toHaveFocus();
    rerender(<Actions editing />);
    screen.getByText("Elsewhere").focus();
    rerender(<Actions editing={false} />);
    expect(screen.getByText("Elsewhere")).toHaveFocus();
  });
});
