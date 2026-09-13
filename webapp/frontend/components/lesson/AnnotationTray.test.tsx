import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
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

  it("clears all ink in one tap, then offers to undo it", () => {
    const onClearAll = vi.fn();
    const onUndo = vi.fn();
    render(<Harness onClearAll={onClearAll} onUndo={onUndo} />);
    fireEvent.click(button("More"));
    fireEvent.click(screen.getByRole("button", { name: /Clear all ink/ }));
    expect(onClearAll).toHaveBeenCalledTimes(1);

    expect(screen.getByRole("status")).toHaveTextContent("All the ink on this exercise was cleared.");
    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("takes the undo message away once the ink changes some other way", () => {
    const { rerender } = render(<Harness onClearAll={() => {}} onUndo={() => {}} inkRevision={{}} />);
    fireEvent.click(button("More"));
    fireEvent.click(screen.getByRole("button", { name: /Clear all ink/ }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(<Harness onClearAll={() => {}} onUndo={() => {}} inkRevision={{}} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("covers the page in view from More, and offers to remove the cover once it's there", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<Harness cover={{ covered: false, onToggle }} pageInView={{ number: 2, hasInk: false }} />);
    fireEvent.click(button("More"));
    fireEvent.click(screen.getByRole("button", { name: /Cover this page/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<Harness cover={{ covered: true, onToggle }} pageInView={{ number: 2, hasInk: false }} />);
    fireEvent.click(button("More"));
    expect(screen.getByRole("button", { name: /Remove the cover/ })).toHaveTextContent("Page 2");
  });

  it.each([
    ["ruler", "the ruler"],
    ["protractor", "the protractor"],
    ["compass", "the compasses"],
  ] as const)("shows the %s from More, and offers to hide it once it's out", (kind, name) => {
    const toggle = vi.fn();
    const { rerender } = render(<Harness paneTools={{ placed: {}, toggle }} />);
    fireEvent.click(button("More"));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Show ${name}`) }));
    expect(toggle).toHaveBeenCalledWith(kind);

    rerender(<Harness paneTools={{ placed: { [kind]: [0, 0] }, toggle }} />);
    fireEvent.click(button("More"));
    expect(screen.getByRole("button", { name: new RegExp(`Hide ${name}`) })).toBeInTheDocument();
  });

  it("clears only the page in view, and names it", () => {
    const onClearPage = vi.fn();
    render(<Harness onClearAll={() => {}} onClearPage={onClearPage} pageInView={{ number: 2, hasInk: true }} />);
    fireEvent.click(button("More"));
    fireEvent.click(screen.getByRole("button", { name: /Clear this page/ }));
    expect(onClearPage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Page 2 was cleared.");
  });

  it("leaves out Clear this page on a one-page exercise", () => {
    render(<Harness onClearAll={() => {}} onClearPage={() => {}} />);
    fireEvent.click(button("More"));
    expect(screen.queryByRole("button", { name: /Clear this page/ })).toBeNull();
  });

  it("picks fading ink, and the collapsed tray says so", () => {
    let tools!: AnnotationTools;
    render(<Harness onTools={(t) => { tools = t; }} />);
    fireEvent.click(button("Fading ink"));
    expect(tools.fading).toBe(true);
    expect(tools.drawingEnabled).toBe(true);
    fireEvent.click(button("Collapse the tray"));
    expect(screen.getByRole("button", { name: /You are using fading ink./ })).toBeInTheDocument();
  });

  it("turns straight lines on for the colour you used last, keeps them on across colours, and drops them with the Hand", () => {
    let tools!: AnnotationTools;
    render(<Harness onTools={(t) => { tools = t; }} />);
    fireEvent.click(button("Blue pen"));
    fireEvent.click(button("Hand: scroll the worksheet with one finger"));

    fireEvent.click(button("Straight lines"));
    expect(tools.tool).toBe("pen");
    expect(tools.swatch.id).toBe("blue");
    expect(button("Straight lines")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(button("Yellow highlighter"));
    expect(tools.straight).toBe(true);
    expect(tools.tool).toBe("highlighter");

    fireEvent.click(button("Straight lines"));
    expect(tools.straight).toBe(false);
    expect(tools.tool).toBe("highlighter");

    fireEvent.click(button("Straight lines"));
    fireEvent.click(button("Hand: scroll the worksheet with one finger"));
    expect(tools.straight).toBe(false);
    fireEvent.click(button("Red pen"));
    expect(tools.straight).toBe(false);
  });

  it("picks the lasso, and the collapsed tray says so", () => {
    let tools!: AnnotationTools;
    render(<Harness onTools={(t) => { tools = t; }} />);
    fireEvent.click(button("Lasso"));
    expect(tools.tool).toBe("lasso");
    expect(button("Lasso")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button("Collapse the tray"));
    expect(screen.getByRole("button", { name: /You are using the lasso./ })).toBeInTheDocument();
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
    // attribute, and give the full tray its real width of about 844px.
    const restore: (() => void)[] = [];
    function stubGetter(name: "clientWidth" | "scrollWidth" | "offsetWidth", get: (this: HTMLElement) => number) {
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
      stubGetter("scrollWidth", function () { return this.getAttribute("role") === "toolbar" ? 844 : 0; });
    });
    // Undone newest first, so a getter stubbed twice ends up back where it started.
    afterEach(() => restore.splice(0).reverse().forEach((undo) => undo()));

    function NarrowHarness({ width, ...props }: { width: number } & Partial<React.ComponentProps<typeof AnnotationTray>>) {
      const tools = useAnnotationTools();
      return (
        <div data-width={width} style={{ position: "relative" }}>
          <AnnotationTray tools={tools} inkHidden={false} onInkHiddenChange={() => {}} hasInk {...props} />
        </div>
      );
    }

    it("fades the end with tools out of sight, and its arrow slides the tray along", () => {
      render(<NarrowHarness width={400} />);
      const scrollBy = vi.fn();
      tray().scrollBy = scrollBy;

      const rest = within(tray()).getByRole("button", { name: "Show the rest of the tools", hidden: true });
      const start = within(tray()).getByRole("button", { name: "Show the tools at the start", hidden: true });
      expect(rest.closest(".invisible")).toBeNull();
      expect(start.closest(".invisible")).not.toBeNull();

      fireEvent.click(rest);
      expect(scrollBy).toHaveBeenCalledTimes(1);
    });

    // jsdom can't animate, so this stands in for the tray's own animations.
    // While one is running, the tray's box is only the round button's 60px.
    // It gives back a way to finish the one that's running.
    function fakeAnimations() {
      let running: { onfinish: (() => void) | null; cancel: () => void } | null = null;
      const proto = HTMLElement.prototype as unknown as { animate?: unknown };
      proto.animate = function (this: HTMLElement) {
        const animation = { onfinish: null, cancel: () => {} };
        if (this.getAttribute("role") === "toolbar") running = animation;
        return animation;
      };
      restore.push(() => { delete proto.animate; });
      for (const name of ["clientWidth", "offsetWidth"] as const) {
        stubGetter(name, function () {
          if (this.getAttribute("role") === "toolbar") return running ? 60 : 844;
          return Number(this.dataset.width ?? 0);
        });
      }
      return () => act(() => { const animation = running!; running = null; animation.onfinish?.(); });
    }

    it("stays put while it opens out of the round button, and places itself again once it has", () => {
      const finish = fakeAnimations();
      // Keep hold of each resize watcher, so the test can report a resize.
      const watchers: (() => void)[] = [];
      const original = globalThis.ResizeObserver;
      globalThis.ResizeObserver = class {
        constructor(report: () => void) { watchers.push(report); }
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
      restore.push(() => { globalThis.ResizeObserver = original; });

      const { container } = render(<NarrowHarness width={1200} />);
      expect(tray().style.left).toBe(`${(1200 - 844) / 2}px`);
      fireEvent.click(button("Collapse the tray"));
      finish();
      fireEvent.click(screen.getByRole("button", { name: /Open the annotation tray/ }));

      // The area narrows partway through opening, while the tray's box is still the round button's width.
      (container.firstChild as HTMLElement).dataset.width = "1000";
      act(() => watchers[watchers.length - 1]());
      expect(tray().style.left).toBe(`${(1200 - 844) / 2}px`);

      finish();
      expect(tray().style.left).toBe(`${(1000 - 844) / 2}px`);
    });

    it("shows no arrow for more tools once it has opened out of the round button, when every tool fits", () => {
      const finish = fakeAnimations();
      render(<NarrowHarness width={1200} />);
      fireEvent.click(button("Collapse the tray"));
      finish();
      fireEvent.click(screen.getByRole("button", { name: /Open the annotation tray/ }));
      // Partway through opening, most of the tools really are out of sight, so
      // anything that checks then finds them there. A scroll stands in for that.
      fireEvent.scroll(tray());
      finish();

      const rest = within(tray()).getByRole("button", { name: "Show the rest of the tools", hidden: true });
      expect(rest.closest(".invisible")).not.toBeNull();
    });

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
