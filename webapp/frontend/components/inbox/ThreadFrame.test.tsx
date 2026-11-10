import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadFrame } from "./ThreadFrame";

describe("Inbox thread frame", () => {
  it("releases the phone background before returning focus after unmount", () => {
    const background = document.createElement("section"), opener = document.createElement("button");
    background.dataset.inboxBackground = ""; background.inert = false; background.append(opener); document.body.append(background);
    const returned = vi.fn(() => { expect(background.inert).toBe(false); opener.focus(); });
    const pane = render(<ThreadFrame mobile onUnmount={returned}><button aria-label="Back to the inbox">Back</button></ThreadFrame>);
    expect(background.inert).toBe(true); expect(screen.getByRole("button", { name: "Back to the inbox" })).toHaveFocus();
    pane.unmount();
    expect(returned).toHaveBeenCalledOnce(); expect(opener).toHaveFocus(); background.remove();
  });

  it("keeps focus within the pane across a breakpoint and returns only on unmount", () => {
    const returned = vi.fn();
    const pane = render(<ThreadFrame mobile={false} onUnmount={returned}><input aria-label="Reply" /></ThreadFrame>);
    const reply = screen.getByRole("textbox", { name: "Reply" }); reply.focus();
    pane.rerender(<ThreadFrame mobile onUnmount={returned}><input aria-label="Reply" /></ThreadFrame>);
    expect(reply).toHaveFocus(); expect(returned).not.toHaveBeenCalled(); pane.unmount(); expect(returned).toHaveBeenCalledOnce();
  });
});
