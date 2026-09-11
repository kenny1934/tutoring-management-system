import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AnnotationTray } from "./AnnotationTray";
import { useAnnotationTools, type AnnotationTools } from "@/hooks/useAnnotationTools";

beforeEach(() => localStorage.clear());

// The tray with the real settings hook behind it, the way the lesson views use it.
function Harness(props: Partial<React.ComponentProps<typeof AnnotationTray>> & { onTools?: (t: AnnotationTools) => void }) {
  const tools = useAnnotationTools();
  props.onTools?.(tools);
  return (
    <div style={{ position: "relative", width: 1200, height: 800 }}>
      <AnnotationTray
        tools={tools}
        inkHidden={false}
        onInkHiddenChange={() => {}}
        hasInk
        {...props}
      />
    </div>
  );
}

// hidden: true finds the tray even while it's collapsed and hidden from screen
// readers. A hidden element has no accessible name, so this goes by role alone,
// which is safe because the harness holds only the one toolbar.
const tray = () => screen.getByRole("toolbar", { hidden: true });
const button = (name: string) => within(tray()).getByRole("button", { name });

describe("AnnotationTray", () => {
  it("opens on the Hand", () => {
    render(<Harness />);
    expect(button("Hand: scroll the worksheet with one finger")).toHaveAttribute("aria-pressed", "true");
    expect(button("Red pen")).toHaveAttribute("aria-pressed", "false");
  });

  it("picks a colour on the first tap and opens its sizes on the second", () => {
    let tools!: AnnotationTools;
    render(<Harness onTools={(t) => { tools = t; }} />);

    fireEvent.click(button("Blue pen"));
    expect(button("Blue pen")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Large blue pen" })).toBeNull();

    fireEvent.click(button("Blue pen"));
    fireEvent.click(screen.getByRole("button", { name: "Large blue pen" }));
    expect(tools.sizes.blue).toBe("L");
    expect(tools.tool).toBe("pen");
  });

  it("offers the whole-stroke eraser among the eraser sizes", () => {
    let tools!: AnnotationTools;
    render(<Harness onTools={(t) => { tools = t; }} />);
    fireEvent.click(button("Eraser"));
    fireEvent.click(button("Eraser"));
    fireEvent.click(screen.getByRole("button", { name: /Whole-stroke eraser/ }));
    expect(tools.eraser).toBe("stroke");
  });

  it("asks for a second tap before clearing all ink", () => {
    const onClearAll = vi.fn();
    render(<Harness onClearAll={onClearAll} />);
    fireEvent.click(button("More"));
    fireEvent.click(screen.getByRole("button", { name: /Clear all ink/ }));
    expect(onClearAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Tap again to clear all ink/ }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("greys out saving until there is ink to save", () => {
    render(<Harness hasInk={false} onSaveAnnotated={() => {}} />);
    fireEvent.click(button("More"));
    expect(screen.getByRole("button", { name: /Save annotated PDF/ })).toBeDisabled();
  });

  it("collapses into a button that names the tool in use, and opens again from it", () => {
    render(<Harness />);
    fireEvent.click(button("Red pen"));
    fireEvent.click(button("Collapse the tray"));

    const fab = screen.getByRole("button", { name: /Open the annotation tray. You are using the red pen./ });
    expect(tray().className).toContain("hidden");
    fireEvent.click(fab);
    expect(tray().className).not.toContain("hidden");
  });

  describe("in a viewer too narrow for the whole tray", () => {
    // jsdom has no layout, so give the tray's area the width in its data-width
    // attribute, and give the full tray its real width of about 727px.
    const restore: (() => void)[] = [];
    function stubGetter(name: "clientWidth" | "scrollWidth", get: (this: HTMLElement) => number) {
      const proto = HTMLElement.prototype;
      const original = Object.getOwnPropertyDescriptor(proto, name);
      Object.defineProperty(proto, name, { configurable: true, get });
      restore.push(() => {
        if (original) Object.defineProperty(proto, name, original);
        else delete (proto as unknown as Record<string, unknown>)[name];
      });
    }
    beforeEach(() => {
      stubGetter("clientWidth", function () { return Number(this.dataset.width ?? 0); });
      stubGetter("scrollWidth", function () { return this.getAttribute("role") === "toolbar" ? 727 : 0; });
    });
    afterEach(() => restore.splice(0).forEach((undo) => undo()));

    function NarrowHarness({ width, ...props }: { width: number } & Partial<React.ComponentProps<typeof AnnotationTray>>) {
      const tools = useAnnotationTools();
      return (
        <div data-width={width} style={{ position: "relative" }}>
          <AnnotationTray tools={tools} inkHidden={false} onInkHiddenChange={() => {}} hasInk {...props} />
        </div>
      );
    }

    it("keeps undo and redo on the tray when it fits", () => {
      render(<NarrowHarness width={1200} onUndo={() => {}} onRedo={() => {}} />);
      expect(button("Undo")).toBeInTheDocument();
    });

    it("moves undo and redo into More, which stays open so several steps can be undone", () => {
      const onUndo = vi.fn();
      const onRedo = vi.fn();
      render(<NarrowHarness width={640} onUndo={onUndo} onRedo={onRedo} />);

      expect(within(tray()).queryByRole("button", { name: "Undo" })).toBeNull();
      expect(button("More")).toBeInTheDocument();
      expect(button("Collapse the tray")).toBeInTheDocument();

      fireEvent.click(button("More"));
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      fireEvent.click(screen.getByRole("button", { name: "Redo" }));
      expect(onUndo).toHaveBeenCalledTimes(2);
      expect(onRedo).toHaveBeenCalledTimes(1);
    });
  });

  it("remembers that it was collapsed", () => {
    const first = render(<Harness />);
    fireEvent.click(button("Collapse the tray"));
    first.unmount();
    render(<Harness />);
    expect(screen.getByRole("button", { name: /Open the annotation tray/ })).toBeInTheDocument();
  });
});
