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
  size: 4,
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
// Color-aware attribute factories (used by tool handlers)
// ---------------------------------------------------------------------------

/** Convert hex color to rgba with given alpha (0–1). */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function getPointAttrs(color: string) {
  return {
    strokeColor: color,
    fillColor: color,
    highlightStrokeColor: color,
    highlightFillColor: color,
    size: 4,
  };
}

export function getLineAttrs(color: string, dash = 0) {
  return {
    strokeColor: color,
    highlightStrokeColor: color,
    strokeWidth: 2,
    dash,
  };
}

export function getFillAttrs(color: string, dash = 0) {
  return {
    ...getLineAttrs(color, dash),
    fillColor: hexToRgba(color, 0.15),
    highlightFillColor: hexToRgba(color, 0.25),
  };
}

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

/** Generate sequential point names: A, B, C, ..., Z, A₁, B₁, ... */
export function generatePointName(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  const cycle = Math.floor(index / 26);
  if (cycle === 0) return letter;
  // Subscript digits for cycles beyond the first
  const sub = String(cycle).replace(/\d/g, (d) =>
    String.fromCharCode(0x2080 + Number(d))
  );
  return letter + sub;
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
  snapToGrid: boolean;
  nextPointName: () => string;
  textInput: string;
  setTextInput: (v: string) => void;
  lastClickTime: number;
  activeColor: string;
  activeDash: number;
}

export interface ToolResult {
  pendingPoints: any[];
  lastClickTime: number;
}

export type ToolHandler = (ctx: ToolContext, x: number, y: number) => ToolResult;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const unchanged = (ctx: ToolContext): ToolResult => ({
  pendingPoints: ctx.pendingPoints,
  lastClickTime: ctx.lastClickTime,
});

/** Build point attrs with snap, auto-name, color, and label color applied. */
function pointAttrs(ctx: ToolContext) {
  return {
    ...getPointAttrs(ctx.activeColor),
    name: ctx.nextPointName(),
    snapToGrid: ctx.snapToGrid,
    label: { strokeColor: ctx.isDark ? "#e3d5c5" : "#1f2937", display: "internal" },
  };
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function handlePointTool(ctx: ToolContext, x: number, y: number): ToolResult {
  ctx.pushUndo();
  ctx.board.create("point", [x, y], pointAttrs(ctx));
  ctx.updateObjectCount();
  return unchanged(ctx);
}

function createLineHandler(lineType: "line" | "segment"): ToolHandler {
  return (ctx, x, y) => {
    const { board, pendingPoints: pending } = ctx;
    const existing = findNearbyPoint(board, x, y);

    if (pending.length === 0) {
      const p = existing || board.create("point", [x, y], pointAttrs(ctx));
      return { pendingPoints: [p], lastClickTime: ctx.lastClickTime };
    }

    if (existing === pending[0]) return unchanged(ctx); // same point — skip

    ctx.pushUndo();
    const p2 = existing || board.create("point", [x, y], pointAttrs(ctx));
    board.create(lineType, [pending[0], p2], {
      ...getLineAttrs(ctx.activeColor, ctx.activeDash),
      straightFirst: lineType === "line",
      straightLast: lineType === "line",
    });

    // Add length measurement label for segments
    if (lineType === "segment") {
      const p1ref = pending[0];
      const p2ref = p2;
      const measureText = board.create("text", [
        () => (p1ref.X() + p2ref.X()) / 2,
        () => (p1ref.Y() + p2ref.Y()) / 2 + 0.3,
        () => {
          const dx = p2ref.X() - p1ref.X();
          const dy = p2ref.Y() - p1ref.Y();
          return Math.sqrt(dx * dx + dy * dy).toFixed(1);
        },
      ], {
        fontSize: 11,
        strokeColor: ctx.isDark ? "#e3d5c5" : "#6b5a4a",
        anchorX: "middle",
        anchorY: "bottom",
        display: "internal",
        fixed: true,
      });
      (measureText as any)._measurementParents = [p1ref.id, p2ref.id];
    }

    ctx.updateObjectCount();
    return { pendingPoints: [], lastClickTime: ctx.lastClickTime };
  };
}

function handleCircleTool(ctx: ToolContext, x: number, y: number): ToolResult {
  const { board, pendingPoints: pending } = ctx;
  const existing = findNearbyPoint(board, x, y);

  if (pending.length === 0) {
    const center = existing || board.create("point", [x, y], pointAttrs(ctx));
    return { pendingPoints: [center], lastClickTime: ctx.lastClickTime };
  }

  if (existing === pending[0]) return unchanged(ctx); // clicked center again — skip

  ctx.pushUndo();
  const edgePoint = existing || board.create("point", [x, y], pointAttrs(ctx));
  board.create("circle", [pending[0], edgePoint], getLineAttrs(ctx.activeColor, ctx.activeDash));
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

  const p = existing || board.create("point", [x, y], pointAttrs(ctx));
  pending.push(p);

  // Visual feedback — temporary dashed segment between vertices
  if (pending.length > 1) {
    board.create("segment", [pending[pending.length - 2], p], {
      ...getLineAttrs(ctx.activeColor, 2),
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
    display: "internal",
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

  const ap = existing || board.create("point", [x, y], pointAttrs(ctx));
  pending.push(ap);

  if (pending.length === 3) {
    ctx.pushUndo();
    // Two segments meeting at vertex (pending[1])
    board.create("segment", [pending[1], pending[0]], { ...getLineAttrs(ctx.activeColor, ctx.activeDash), name: "" });
    board.create("segment", [pending[1], pending[2]], { ...getLineAttrs(ctx.activeColor, ctx.activeDash), name: "" });

    // Angle arc with degree display
    // name must be passed at creation time — setName() expects a string, not a function
    let angleEl: any;
    angleEl = board.create("angle", [pending[0], pending[1], pending[2]], {
      radius: 0.8,
      selection: "minor",
      fillColor: hexToRgba(ctx.activeColor, 0.15),
      strokeColor: ctx.activeColor,
      name: () => {
        let val = angleEl?.Value ? angleEl.Value() : 0;
        if (val > Math.PI) val = 2 * Math.PI - val;
        return (val * 180 / Math.PI).toFixed(1) + "\u00B0";
      },
      label: {
        strokeColor: ctx.isDark ? "#e3d5c5" : "#1f2937",
        fontSize: 11,
        display: "internal",
      },
    });
    (angleEl as any)._showDegrees = true;

    ctx.updateObjectCount();
    return { pendingPoints: [], lastClickTime: ctx.lastClickTime };
  }

  return { pendingPoints: pending, lastClickTime: ctx.lastClickTime };
}

function handleSectorTool(ctx: ToolContext, x: number, y: number): ToolResult {
  const { board, pendingPoints: pending } = ctx;
  const existing = findNearbyPoint(board, x, y);
  if (existing && pending.includes(existing)) return unchanged(ctx);

  const sp = existing || board.create("point", [x, y], pointAttrs(ctx));
  pending.push(sp);

  if (pending.length === 3) {
    ctx.pushUndo();
    const cx = pending[0].X(), cy = pending[0].Y();
    const r = Math.sqrt((pending[1].X() - cx) ** 2 + (pending[1].Y() - cy) ** 2);
    board.create("angle", [pending[1], pending[0], pending[2]], {
      radius: r || 1,
      selection: "minor",
      fillColor: hexToRgba(ctx.activeColor, 0.2),
      strokeColor: ctx.activeColor,
      name: "",
    });
    ctx.updateObjectCount();
    return { pendingPoints: [], lastClickTime: ctx.lastClickTime };
  }

  return { pendingPoints: pending, lastClickTime: ctx.lastClickTime };
}

// ---------------------------------------------------------------------------
// Shape presets
// ---------------------------------------------------------------------------

function regularPolygonVertices(
  cx: number, cy: number, n: number, r: number
): [number, number][] {
  const verts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2; // start from top
    verts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return verts;
}

export function createShapePreset(
  board: any,
  preset: string,
  cx: number,
  cy: number,
  color: string,
  dash: number,
  isDark: boolean,
  nextPointName: () => string,
): void {
  const mkPtAttrs = () => ({
    ...getPointAttrs(color),
    name: nextPointName(),
    snapToGrid: false,
    label: { strokeColor: isDark ? "#e3d5c5" : "#1f2937", display: "internal" },
  });

  let vertices: [number, number][];
  switch (preset) {
    case "rectangle": {
      const hw = 2, hh = 1.5;
      vertices = [
        [cx - hw, cy + hh], [cx + hw, cy + hh],
        [cx + hw, cy - hh], [cx - hw, cy - hh],
      ];
      break;
    }
    case "equilateral-triangle": {
      const side = 3;
      const h = (side * Math.sqrt(3)) / 2;
      vertices = [
        [cx - side / 2, cy - h / 3],
        [cx + side / 2, cy - h / 3],
        [cx, cy + (2 * h) / 3],
      ];
      break;
    }
    case "pentagon":
      vertices = regularPolygonVertices(cx, cy, 5, 1.8);
      break;
    case "hexagon":
      vertices = regularPolygonVertices(cx, cy, 6, 1.8);
      break;
    default:
      return;
  }

  const points = vertices.map(([x, y]) =>
    board.create("point", [x, y], mkPtAttrs())
  );
  board.create("polygon", points, getFillAttrs(color, dash));
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
