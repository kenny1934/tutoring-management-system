import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { ShortcutHelpPanel, type ShortcutRow } from "./ShortcutHelpPanel";

beforeAll(() => {
  // The panel would otherwise linger for a moment after closing.
  MotionGlobalConfig.skipAnimations = true;
});

const rows: ShortcutRow[] = [
  ["j / k", "Navigate exercises"],
  ["Esc", "Back"],
];

describe("ShortcutHelpPanel", () => {
  it("lists each key beside what it does", () => {
    render(<ShortcutHelpPanel open onClose={() => {}} rows={rows} />);
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("j / k").tagName).toBe("KBD");
    expect(screen.getByText("Navigate exercises")).toBeInTheDocument();
    expect(screen.getByText("Esc").tagName).toBe("KBD");
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("shows nothing while it's closed", () => {
    render(<ShortcutHelpPanel open={false} onClose={() => {}} rows={rows} />);
    expect(screen.queryByText("Keyboard Shortcuts")).toBeNull();
  });

  it("closes at a tap anywhere off the panel", () => {
    const onClose = vi.fn();
    const { container } = render(<ShortcutHelpPanel open onClose={onClose} rows={rows} />);
    fireEvent.click(container.querySelector(".fixed.inset-0")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open at a tap on the panel itself", () => {
    const onClose = vi.fn();
    render(<ShortcutHelpPanel open onClose={onClose} rows={rows} />);
    fireEvent.click(screen.getByText("Navigate exercises"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
