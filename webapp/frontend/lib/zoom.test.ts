import { describe, it, expect } from "vitest";
import { MAX_ZOOM, computeFitZoom, stackZoomStyles } from "./zoom";

// A scroller of the given width, with 16 pixels of padding on each side.
function box(width: number) {
  const el = document.createElement("div");
  el.style.paddingLeft = "16px";
  el.style.paddingRight = "16px";
  Object.defineProperty(el, "clientWidth", { value: width });
  return el;
}

describe("computeFitZoom", () => {
  it("fits a page across the scroller inside its side padding", () => {
    // 1032 pixels less 16 on each side leaves 1000 for a page 800 wide.
    expect(computeFitZoom(box(1032), 800)).toBe(125);
  });

  it("never fits past the most a pane zooms", () => {
    expect(computeFitZoom(box(5000), 800)).toBe(MAX_ZOOM);
  });
});

describe("stackZoomStyles", () => {
  it("scales the stack down from its natural size and takes back the height it no longer uses", () => {
    const { stack, scroller } = stackZoomStyles(50, 100, 1000);
    expect(stack).toMatchObject({ transform: "scale(0.5)", width: "200%", marginBottom: "-500px", alignItems: "center" });
    expect(scroller.overflowX).toBe("hidden");
  });

  it("makes room for the extra height past the natural size, so whatever follows starts below the pages", () => {
    const { stack, scroller } = stackZoomStyles(150, 100, 1000);
    expect(stack).toMatchObject({ marginBottom: "500px", alignItems: "flex-start" });
    expect(scroller.overflowX).toBe("auto");
  });

  it("leaves the margin alone at the natural size", () => {
    expect(stackZoomStyles(100, 100, 1000).stack.marginBottom).toBe("");
  });
});
