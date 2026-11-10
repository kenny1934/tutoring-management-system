import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, waitFor, screen, within } from "@testing-library/react";
import { useState, useEffect, useRef } from "react";
import { MobileBottomSheet } from "./mobile-bottom-sheet";

const sheet = (isOpen: boolean, onClose: () => void) => (
  <MobileBottomSheet isOpen={isOpen} onClose={onClose} title="Exercises">
    <p>Body</p>
  </MobileBottomSheet>
);

describe("MobileBottomSheet", () => {
  it("tells the page once it has slid away after the close button", async () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(sheet(true, onClose));
    fireEvent.click(getByLabelText("Close"));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("slides away when the page closes it, without calling onClose back", async () => {
    const onClose = vi.fn();
    const { rerender, queryByText } = render(sheet(true, onClose));
    rerender(sheet(false, onClose));
    // Still on screen while it slides down.
    expect(queryByText("Body")).not.toBeNull();
    await waitFor(() => expect(queryByText("Body")).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("draws nothing while closed", () => {
    const { queryByText } = render(sheet(false, vi.fn()));
    expect(queryByText("Body")).toBeNull();
  });
});


afterEach(() => vi.restoreAllMocks());

function ModalSheet() {
  const [open, setOpen] = useState(false);
  return <main><button onClick={() => setOpen(true)}>Materials</button><MobileBottomSheet isOpen={open} onClose={() => setOpen(false)} title="Exercises" modalLabel="Exercises"><button>First item</button><button>Last item</button></MobileBottomSheet></main>;
}

describe("named modal sheets", () => {
  it("sits outside the lesson, takes focus and restores its trigger after Escape", async () => {
    const { container } = render(<ModalSheet />);
    const trigger = screen.getByRole("button", { name: "Materials" }); trigger.focus(); fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Exercises" });
    expect(container.contains(dialog)).toBe(false);
    expect(within(dialog).getByLabelText("Close")).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("still handles Escape after a disabled answer leaves focus on the document", async () => {
    render(<ModalSheet />);
    const trigger = screen.getByRole("button", { name: "Materials" }); trigger.focus(); fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Exercises" });
    const answer = within(dialog).getByRole("button", { name: "First item" }); answer.focus();
    answer.setAttribute("disabled", ""); answer.blur();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("captures the opener before the lesson becomes inert", async () => {
    function Lesson() {
      const [open, setOpen] = useState(false);
      const stage = useRef<HTMLDivElement>(null);
      useEffect(() => {
        const node = stage.current;
        if (!open || !node) return;
        node.inert = true;
        // jsdom does not blur focus on inert elements as a browser does.
        if (node.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
        return () => { node.inert = false; };
      }, [open]);
      return <div ref={stage}><button onClick={() => setOpen(true)}>Open exercises</button><MobileBottomSheet isOpen={open} onClose={() => setOpen(false)} onCloseStart={() => setOpen(false)} modalLabel="Exercises" title="Exercises"><p>Worksheet list</p></MobileBottomSheet></div>;
    }
    render(<Lesson />);
    const trigger = screen.getByRole("button", { name: "Open exercises" }); trigger.focus(); fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Exercises" });
    expect(within(dialog).getByLabelText("Close")).toHaveFocus();
    fireEvent.click(within(dialog).getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("leaves history to the enclosing lesson when Back is managed there", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: query === "(pointer: coarse)", addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList));
    const push = vi.spyOn(window.history, "pushState");
    const view = render(<MobileBottomSheet isOpen onClose={() => {}} title="Exercises" modalLabel="Exercises" backManaged><p>Worksheet list</p></MobileBottomSheet>);
    expect(await screen.findByRole("dialog", { name: "Exercises" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled(); view.unmount();
  });

  it("keeps Tab and Shift+Tab inside the sheet", async () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    render(<ModalSheet />); fireEvent.click(screen.getByRole("button", { name: "Materials" }));
    const dialog = await screen.findByRole("dialog", { name: "Exercises" });
    const first = within(dialog).getByLabelText("Close"), last = within(dialog).getByRole("button", { name: "Last item" });
    last.focus(); fireEvent.keyDown(last, { key: "Tab" }); expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true }); expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
