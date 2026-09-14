import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnnotationTools, inkLayerProps, INK_SIZES } from "./useAnnotationTools";

beforeEach(() => localStorage.clear());

describe("useAnnotationTools", () => {
  it("starts on the Hand, so opening an exercise never draws", () => {
    const { result } = renderHook(() => useAnnotationTools());
    expect(result.current.tool).toBe("hand");
    expect(result.current.drawingEnabled).toBe(false);
  });

  it("picks the pen or highlighter that goes with a colour", () => {
    const { result } = renderHook(() => useAnnotationTools());
    act(() => result.current.selectSwatch("yellow"));
    expect(result.current.tool).toBe("highlighter");
    expect(result.current.swatch.kind).toBe("highlighter");
    expect(result.current.swatch.color).toBe("#facc15");
    expect(result.current.inkSize).toBe(INK_SIZES.highlighter.M);

    act(() => result.current.selectSwatch("blue"));
    expect(result.current.tool).toBe("pen");
    expect(result.current.inkSize).toBe(INK_SIZES.pen.S);
  });

  it("picks the pencil for the grey, at the pencil's own size", () => {
    const { result } = renderHook(() => useAnnotationTools());
    act(() => result.current.selectSwatch("grey"));
    expect(result.current.tool).toBe("pencil");
    expect(inkLayerProps(result.current)).toMatchObject({ inkKind: "pencil", isDrawing: true });
    expect(result.current.inkSize).toBe(INK_SIZES.pencil.S);
  });

  it("keeps a size for each colour separately", () => {
    const { result } = renderHook(() => useAnnotationTools());
    act(() => result.current.setSwatchSize("red", "L"));
    act(() => result.current.selectSwatch("blue"));
    expect(result.current.inkSize).toBe(INK_SIZES.pen.S);
    act(() => result.current.selectSwatch("red"));
    expect(result.current.inkSize).toBe(INK_SIZES.pen.L);
  });

  it("lets D and E pick their tool, and put it down again on a second press", () => {
    const { result } = renderHook(() => useAnnotationTools());
    act(() => result.current.selectSwatch("pink"));
    act(() => result.current.selectHand());

    act(() => result.current.toggleFromKey("pen"));
    expect(result.current.tool).toBe("highlighter");
    act(() => result.current.toggleFromKey("eraser"));
    expect(result.current.tool).toBe("eraser");
    act(() => result.current.toggleFromKey("eraser"));
    expect(result.current.tool).toBe("hand");
    act(() => result.current.toggleFromKey("pen"));
    act(() => result.current.toggleFromKey("pen"));
    expect(result.current.tool).toBe("hand");
  });

  it("lets L pick the lasso and put it down again, and the drawing layer selects with it instead of drawing", () => {
    const { result } = renderHook(() => useAnnotationTools());
    act(() => result.current.toggleFromKey("lasso"));
    expect(result.current.tool).toBe("lasso");
    expect(inkLayerProps(result.current)).toMatchObject({ isSelecting: true, isDrawing: false, isErasing: false });
    act(() => result.current.toggleFromKey("lasso"));
    expect(result.current.tool).toBe("hand");

    act(() => result.current.selectLasso());
    act(() => result.current.selectSwatch("red"));
    expect(inkLayerProps(result.current)).toMatchObject({ isSelecting: false, isDrawing: true });
  });

  it("remembers colours, sizes and the eraser in this browser, but not the tool", () => {
    const first = renderHook(() => useAnnotationTools());
    act(() => first.result.current.selectSwatch("black"));
    act(() => first.result.current.setSwatchSize("black", "M"));
    act(() => first.result.current.setEraser("stroke"));
    first.unmount();

    const { result } = renderHook(() => useAnnotationTools());
    expect(result.current.tool).toBe("hand");
    expect(result.current.swatch.id).toBe("black");
    expect(result.current.sizes.black).toBe("M");
    expect(result.current.eraser).toBe("stroke");
    expect(result.current.eraserRadius).toBeNull();
  });

  it("ignores settings it doesn't recognise", () => {
    localStorage.setItem("csm_annotation_tools", JSON.stringify({ swatchId: "purple", sizes: { red: "XL" }, eraser: "huge" }));
    const { result } = renderHook(() => useAnnotationTools());
    expect(result.current.swatch.id).toBe("red");
    expect(result.current.sizes.red).toBe("S");
    expect(result.current.eraser).toBe("M");
  });

  it("passes on whether the lessons' saved ink has loaded, and counts it as loaded when nobody says", () => {
    expect(inkLayerProps(renderHook(() => useAnnotationTools()).result.current).inkReady).toBe(true);
    expect(inkLayerProps(renderHook(() => useAnnotationTools({ inkReady: false })).result.current).inkReady).toBe(false);
  });
});
