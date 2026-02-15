/**
 * Tool handlers for the geometry editor.
 *
 * Each handler encapsulates the board-creation logic for a single drawing tool.
 * The massive switch statement that used to live in GeometryEditorModal is now
 * spread across small, focused functions that are easy to test and extend.
 */

// ---------------------------------------------------------------------------
// Default visual attributes for user-created objects (warm brown palette)
// ---------------------------------------------------------------------------

export const DEFAULT_POINT_ATTRS = {
  strokeColor: "#a0704b",
  fillColor: "#a0704b",
  highlightStrokeColor: "#8b5f3c",
  highlightFillColor: "#8b5f3c",
  size: 3,
};

export const DEFAULT_LINE_ATTRS = {
  strokeColor: "#8b5f3c",
  highlightStrokeColor: "#a0704b",
  strokeWidth: 2,
};

export const DEFAULT_FILL_ATTRS = {
  ...DEFAULT_LINE_ATTRS,
  fillColor: "rgba(160,112,75,0.15)",
  highlightFillColor: "rgba(160,112,75,0.25)",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract user-coordinate [x, y] from a board "down" event. */
export function getMouseCoords(board: any, e: any): [number, number] | null {
  try {
    const coords = board.getUsrCoordsOfMouse(e);
    return [coords[0], coords[1]];
  } catch {
    return null;
  }
}

/** Find an existing user-created point near (x, y). Threshold scales with zoom. */
export function findNearbyPoint(board: any, x: number, y: number): any | null {
  const bb = board.getBoundingBox();
  // ~15 px worth of user-coordinate distance
  const threshold = ((bb[2] - bb[0]) / (board.canvasWidth || 600)) * 15;
  for (const el of board.objectsList) {
    if (el.elType !== "point") continue;
    if (el.visProp?.visible === false) continue;
    if (Math.abs(el.X() - x) < threshold && Math.abs(el.Y() - y) < threshold) {
      return el;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool handler interface
// ---------------------------------------------------------------------------

export interface ToolContext {
  board: any;
  pendingPoints: any[];
  pushUndo: () => void;
  updateObjectCount: () => void;
  isDark: boolean;
  textInput: string;
  setTextInput: (v: string) => void;
  lastClickTime: number;
}

export interface ToolResult {
  pendingPoints: any[];
  lastClickTime: number;
}

export type ToolHandler = (ctx: ToolContext, x: number, y: number) => ToolResult;

// ---------------------------------------------------------------------------
// Convenience — return context unchanged
// ---------------------------------------------------------------------------

const unchanged = (ctx: ToolContext): ToolResult => ({
  pendingPoints: ctx.pendingPoints,
  lastClickTime: ctx.lastClickTime,
});

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function handlePointTool(ctx: ToolContext, x: number, y: number): ToolResult {
  ctx.pushUndo();
  ctx.board.create("point", [x, y], { ...DEFAULT_POINT_ATTRS, name: "" });
  ctx.updateObjectCount();
  return unchanged(ctx);
}

function createLineHandler(lineType: "line" | "segment"): ToolHandler {
  return (ctx, x, y) => {
    const { board, pendingPoints: pending } = ctx;
    const existing = findNearbyPoint(board, x, y);

    if (pending.length === 0) {
      const p = existing || board.create("point", [x, y], { ...DEFAULT_POINT_ATTRS, name: "" });
      return { pendingPoints: [p], lastClickTime: ctx.lastClickTime };
    }

    if (existing === pending[0]) return unchanged(ctx); // same point — skip

    ctx.pushUndo();
    const p2 = existing || board.create("point", [x, y], { ...DEFAULT_POINT_ATTRS, name: "" });
    board.create(lineType, [pending[0], p2], {
      ...DEFAULT_LINE_ATTRS,
      straightFirst: lineType === "line",
      straightLast: lineType === "line",
    });
    ctx.updateObjectCount();
    return { pendingPoints: [], lastClickTime: ctx.lastClickTime };
  };
}

function handleCircleTool(ctx: ToolContext, x: number, y: number): ToolResult {
  const { board, pendingPoints: pending } = ctx;
  const existing = findNearbyPoint(board, x, y);

  if (pending.length === 0) {
    const center = existing || board.create("point", [x, y], { ...DEFAULT_POINT_ATTRS, name: "" });
    return { pendingPoints: [center], lastClickTime: ctx.lastClickTime };
  }

  if (existing === pending[0]) return unchanged(ctx); // clicked center again — skip

  ctx.pushUndo();
  const edgePoint = existing || board.create("point", [x, y], { ...DEFAULT_POINT_ATTRS, name: "" });
  board.create("circle", [pending[0], edgePoint], DEFAULT_LINE_ATTRS);
  ctx.updateObjectCount();
  return { pendingPoints: [], lastClickTime: ctx.lastClickTime };
}

function handlePolygonTool(ctx: ToolContext, x: number, y: number): ToolResult {
  const now = Date.now();
  if (now - ctx.lastClickTime < 300) return unchanged(ctx); // debounce dbl-click

  const { board, pendingPoints: pending } = ctx;
  const existing = findNearbyPoint(board, x, y);
  if (existing && pending.includes(existing)) {
    return { pendingPoints: pending, lastClickTime: now };
  }

  const p = existing || board.create("point", [x, y], { ...DEFAULT_POINT_ATTRS, name: "" });
  pending.push(p);

  // Visual feedback — temporary dashed segment between vertices
  if (pending.length > 1) {
    board.create("segment", [pending[pending.length - 2], p], {
      ...DEFAULT_LINE_ATTRS,
      dash: 2,
      name: "",
    });
  }
  board.update();
  return { pendingPoints: pending, lastClickTime: now };
}

function handleTextTool(ctx: ToolContext, x: number, y: number): ToolResult {
  if (!ctx.textInput.trim()) return unchanged(ctx);

  ctx.pushUndo();
  ctx.board.create("text", [x, y, ctx.textInput.trim()], {
    fontSize: 14,
    strokeColor: ctx.isDark ? "#e3d5c5" : "#1f2937",
    fixed: false,
  });
  ctx.setTextInput("");
  ctx.updateObjectCount();
  return unchanged(ctx);
}

function handleAngleTool(ctx: ToolContext, x: number, y: number): ToolResult {
  const { board, pendingPoints: pending } = ctx;
  const existing = findNearbyPoint(board, x, y);
  if (existing && pending.includes(existing)) return unchanged(ctx);

  const ap = existing || board.create("point", [x, y], { ...DEFAULT_POINT_ATTRS, name: "" });
  pending.push(ap);

  if (pending.length === 3) {
    ctx.pushUndo();
    // Two segments meeting at vertex (pending[1])
    board.create("segment", [pending[1], pending[0]], { ...DEFAULT_LINE_ATTRS, name: "" });
    board.create("segment", [pending[1], pending[2]], { ...DEFAULT_LINE_ATTRS, name: "" });
    ctx.updateObjectCount();
    return { pendingPoints: [], lastClickTime: ctx.lastClickTime };
  }

  return { pendingPoints: pending, lastClickTime: ctx.lastClickTime };
}

function handleSectorTool(ctx: ToolContext, x: number, y: number): ToolResult {
  const { board, pendingPoints: pending } = ctx;
  const existing = findNearbyPoint(board, x, y);
  if (existing && pending.includes(existing)) return unchanged(ctx);

  const sp = existing || board.create("point", [x, y], { ...DEFAULT_POINT_ATTRS, name: "" });
  pending.push(sp);

  if (pending.length === 3) {
    ctx.pushUndo();
    const cx = pending[0].X(), cy = pending[0].Y();
    const r = Math.sqrt((pending[1].X() - cx) ** 2 + (pending[1].Y() - cy) ** 2);
    board.create("angle", [pending[1], pending[0], pending[2]], {
      radius: r || 1,
      selection: "minor",
      fillColor: "rgba(160,112,75,0.2)",
      strokeColor: "#a0704b",
      name: "",
    });
    ctx.updateObjectCount();
    return { pendingPoints: [], lastClickTime: ctx.lastClickTime };
  }

  return { pendingPoints: pending, lastClickTime: ctx.lastClickTime };
}

// ---------------------------------------------------------------------------
// Handler dispatch map
// ---------------------------------------------------------------------------

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  point: handlePointTool,
  line: createLineHandler("line"),
  segment: createLineHandler("segment"),
  circle: handleCircleTool,
  polygon: handlePolygonTool,
  text: handleTextTool,
  angle: handleAngleTool,
  sector: handleSectorTool,
};
