import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState, useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useNotificationReturn } from "./useNotificationReturn";
vi.mock("next/navigation", () => ({ usePathname: () => "/students" }));

function Bell({ scope, visible }: { scope: string; visible?: boolean }) {
  const [open, setOpen] = useState(false);
  const source = useRef<HTMLButtonElement>(null);
  const journey = useNotificationReturn(scope, setOpen, visible === undefined ? undefined : source);
  return <><button ref={source} data-visible={visible} onClick={() => journey.changeOpen(!open)}>Bell</button>{open && <div ref={journey.list} data-testid="list">
    <a href="/inbox" data-notification-item="messages" onClick={event => { journey.follow(event, "messages"); event.preventDefault(); }}>Messages</a>
  </div>}</>;
}

describe("Notification return", () => {
  it("lets the visible bell claim the return when its hidden desktop twin is also mounted", () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
      return (this.dataset.visible === "false" ? [] : [new DOMRect(0, 0, 44, 44)]) as unknown as DOMRectList;
    });
    window.history.replaceState({}, "", "/students");
    const first = render(<Bell scope="twins" visible />); fireEvent.click(screen.getByText("Bell"));
    const state = window.history.state; fireEvent.click(screen.getByText("Messages")); first.unmount();
    window.history.replaceState({}, "", "/inbox");
    render(<><Bell scope="twins" visible={false} /><Bell scope="twins" visible /></>);
    act(() => { window.history.replaceState(state, "", "/students"); window.dispatchEvent(new PopStateEvent("popstate")); });
    const messages = screen.getByText("Messages"); expect(messages).toHaveFocus();
    expect(messages.closest('[data-testid="list"]')?.previousElementSibling).toHaveAttribute("data-visible", "true");
    vi.restoreAllMocks();
  });
  it("restores the chosen row and list scroll after remounting on browser Back", () => {
    window.history.replaceState({ existing: 7 }, "", "/students");
    const page = render(<Bell scope="return-5" />); fireEvent.click(screen.getByText("Bell"));
    const state = window.history.state; expect(state.existing).toBe(7);
    screen.getByTestId("list").scrollTop = 123; fireEvent.click(screen.getByText("Messages"));
    page.unmount(); window.history.replaceState({}, "", "/inbox");
    const next = render(<Bell scope="return-5" />); expect(screen.queryByTestId("list")).toBeNull();
    act(() => { window.history.replaceState(state, "", "/students"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(screen.getByTestId("list").scrollTop).toBe(123); expect(screen.getByText("Messages")).toHaveFocus();
    next.unmount(); render(<Bell scope="return-5" />); expect(screen.queryByTestId("list")).toBeNull();
  });
  it("does not reopen another tutor's notification list", () => {
    window.history.replaceState({}, "", "/students");
    const first = render(<Bell scope="tutor-a" />); fireEvent.click(screen.getByText("Bell"));
    const state = window.history.state; fireEvent.click(screen.getByText("Messages")); first.unmount();
    render(<Bell scope="tutor-b" />);
    act(() => { window.history.replaceState(state, "", "/students"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(screen.queryByTestId("list")).toBeNull();
  });
  it("leaves modified link clicks in their current list", () => {
    render(<Bell scope="modified" />); fireEvent.click(screen.getByText("Bell")); fireEvent.click(screen.getByText("Messages"), { ctrlKey: true });
    expect(screen.getByTestId("list")).toBeVisible();
  });
});
