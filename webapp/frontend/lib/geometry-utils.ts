/**
 * Serialization / deserialization utilities for JSXGraph geometry diagrams.
 *
 * A GeometryState captures every user-created object on the board so it can be
 * round-tripped through HTML (stored as a JSON data attribute on the TipTap
 * custom node) and later restored in either the editor or the read-only viewer.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeometryObject {
  type:
    | "point"
    | "line"
    | "segment"
    | "circle"
    | "polygon"
    | "functiongraph"
    | "text"
    | "angle";
  id: string;
  /** IDs of parent objects (e.g. a line references two point IDs). */
  parents: string[];
  attrs: {
    name?: string;
    x?: number;
    y?: number;
    /** For functiongraph – the raw expression string typed by the user. */
    expression?: string;
    /** For text – the label content. */
    content?: string;
    strokeColor?: string;
    fillColor?: string;
    strokeWidth?: number;
    visible?: boolean;
    /** Polygon vertex coordinates (fallback if parent points are inlined). */
    vertices?: [number, number][];
    /** Circle radius when defined by value rather than a second point. */
    radius?: number;
    /** Line dash style: 0=solid, 2=dashed, 3=dotted. */
    dash?: number;
    /** IDs of parent points for a dynamic measurement text label. */
    measurementOf?: string[];
    /** Whether the angle should display its degree value. */
    showDegrees?: boolean;
  };
}

export interface GeometryState {
  version: 1;
  boundingBox: [number, number, number, number]; // [xmin, ymax, xmax, ymin]
  objects: GeometryObject[];
}

// ---------------------------------------------------------------------------
// Board theme (warm brown palette)
// ---------------------------------------------------------------------------

export const LIGHT_BOARD_ATTRS = {
  boundingbox: [-8, 6, 8, -6] as [number, number, number, number],
  axis: true,
  showCopyright: false,
  showNavigation: false,
  pan: { enabled: true, needTwoFingers: false, needShift: false },
  zoom: { factorX: 1.08, factorY: 1.08, wheel: true, needShift: false },
  defaultAxes: {
    x: {
      strokeColor: "#6b5a4a",
      highlightStrokeColor: "#6b5a4a",
      ticks: { strokeColor: "#d4c0a8", minorTicks: 0 },
    },
    y: {
      strokeColor: "#6b5a4a",
      highlightStrokeColor: "#6b5a4a",
      ticks: { strokeColor: "#d4c0a8", minorTicks: 0 },
    },
  },
  snapSizeX: 1,
  snapSizeY: 1,
  grid: { strokeColor: "#e8d4b8", strokeOpacity: 0.6 },
  renderer: "svg",
};

export const DARK_BOARD_ATTRS = {
  ...LIGHT_BOARD_ATTRS,
  defaultAxes: {
    x: {
      strokeColor: "#a0907a",
      highlightStrokeColor: "#a0907a",
      ticks: {
        strokeColor: "#4a3d30",
        minorTicks: 0,
        label: { color: "#c0b0a0" },
      },
    },
    y: {
      strokeColor: "#a0907a",
      highlightStrokeColor: "#a0907a",
      ticks: {
        strokeColor: "#4a3d30",
        minorTicks: 0,
        label: { color: "#c0b0a0" },
      },
    },
  },
  grid: { strokeColor: "#3d3628", strokeOpacity: 0.6 },
};

/** Create a JSXGraph board with theme-appropriate colours. */
export function createThemedBoard(
  JXG: any,
  container: HTMLDivElement,
  boundingBox: [number, number, number, number],
  isDark: boolean
): any {
  const attrs = isDark ? DARK_BOARD_ATTRS : LIGHT_BOARD_ATTRS;
  const board = JXG.JSXGraph.initBoard(container, {
    ...attrs,
    boundingbox: boundingBox,
    document: document,
    keepAspectRatio: true,
  });
  container.style.backgroundColor = isDark ? "#2a2a2a" : "#ffffff";
  return board;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

// Types we explicitly serialize (matches the switch cases in elementToObject
// and the GeometryObject.type union). Using an allowlist rather than a blocklist
// ensures auto-generated elements (polygon borders, axis ticks, etc.) and
// elements with dump:false (functiongraph, angle) are handled correctly.
const SERIALIZABLE_TYPES = new Set([
  "point",
  "line",
  "segment",
  "circle",
  "polygon",
  "functiongraph",
  "text",
  "angle",
  "curve", // JSXGraph uses elType="curve" for functiongraphs
]);

// ---------------------------------------------------------------------------
// Serialize: board → GeometryState
// ---------------------------------------------------------------------------

export function serializeBoard(board: any): GeometryState {
  const objects: GeometryObject[] = [];
  const seen = new Set<string>();

  // objectsList preserves creation order – important so parents are
  // serialized before children.
  for (const el of board.objectsList) {
    if (seen.has(el.id)) continue;
    if (!el.elType || !SERIALIZABLE_TYPES.has(el.elType)) continue;
    if (el.visProp?.visible === false) continue;
    // Skip auto-generated text (axis tick labels) — they have dump:false
    if (el.elType === "text" && el.dump === false) continue;

    const obj = elementToObject(el);
    if (obj) {
      objects.push(obj);
      seen.add(el.id);
    }
  }

  return {
    version: 1,
    boundingBox: board.getBoundingBox(),
    objects,
  };
}

function elementToObject(el: any): GeometryObject | null {
  const base: Omit<GeometryObject, "type" | "parents" | "attrs"> & {
    type: string;
    parents: string[];
    attrs: GeometryObject["attrs"];
  } = {
    type: el.elType,
    id: el.id,
    parents: [],
    attrs: {
      name: el.name || undefined,
      strokeColor: el.visProp?.strokecolor,
      fillColor: el.visProp?.fillcolor,
      strokeWidth: el.visProp?.strokewidth,
      dash: el.visProp?.dash || undefined,
    },
  };

  switch (el.elType) {
    case "point":
      base.attrs.x = el.X();
      base.attrs.y = el.Y();
      break;

    case "line":
    case "segment":
      base.parents = [el.point1.id, el.point2.id];
      break;

    case "circle":
      base.parents = [el.center.id];
      if (el.point2) {
        base.parents.push(el.point2.id);
      } else {
        base.attrs.radius = el.Radius();
      }
      break;

    case "polygon":
      // vertices includes the closing duplicate – drop it
      base.parents = el.vertices
        .slice(0, -1)
        .map((v: any) => v.id);
      break;

    case "curve":
      // JSXGraph function graphs have elType="curve" + visProp.curvetype="functiongraph"
      if (el.visProp?.curvetype !== "functiongraph") return null;
      base.type = "functiongraph"; // Normalize to our serialization type
      base.attrs.expression =
        (el as any)._expression || el.Y?.toString() || "";
      break;

    case "functiongraph":
      // Fallback in case JSXGraph ever uses "functiongraph" as elType directly
      base.attrs.expression =
        (el as any)._expression || el.Y?.toString() || "";
      break;

    case "text":
      base.attrs.x = el.X();
      base.attrs.y = el.Y();
      base.attrs.content =
        typeof el.plaintext === "string" ? el.plaintext : String(el.plaintext);
      if ((el as any)._measurementParents) {
        base.attrs.measurementOf = (el as any)._measurementParents;
      }
      break;

    case "angle":
      // Three parent points
      if (el.parents && el.parents.length >= 3) {
        base.parents = el.parents.slice(0, 3);
      }
      base.attrs.radius = el.visProp?.radius ?? 1;
      if ((el as any)._showDegrees) {
        base.attrs.showDegrees = true;
      }
      break;

    default:
      return null;
  }

  return base as GeometryObject;
}

// ---------------------------------------------------------------------------
// Deserialize: GeometryState → board objects
// ---------------------------------------------------------------------------

export function deserializeToBoard(
  board: any,
  state: GeometryState,
  readOnly = false,
  isDark = false
): void {
  const idMap: Record<string, any> = {};

  for (const obj of state.objects) {
    const fixed = readOnly;
    const baseAttrs: Record<string, any> = {
      id: obj.id,
      name: obj.attrs.name || "",
      strokeColor: obj.attrs.strokeColor,
      fillColor: obj.attrs.fillColor,
      strokeWidth: obj.attrs.strokeWidth,
      dash: obj.attrs.dash || 0,
      fixed,
    };

    try {
      let created: any;

      switch (obj.type) {
        case "point":
          created = board.create("point", [obj.attrs.x!, obj.attrs.y!], {
            ...baseAttrs,
            snapToGrid: !readOnly,
            label: { strokeColor: isDark ? "#e3d5c5" : "#1f2937", display: "internal" },
          });
          break;

        case "line":
        case "segment": {
          const p1 = idMap[obj.parents[0]];
          const p2 = idMap[obj.parents[1]];
          if (!p1 || !p2) continue;
          created = board.create(obj.type, [p1, p2], {
            ...baseAttrs,
            straightFirst: obj.type === "line",
            straightLast: obj.type === "line",
          });
          break;
        }

        case "circle": {
          const center = idMap[obj.parents[0]];
          if (!center) continue;
          if (obj.parents[1] && idMap[obj.parents[1]]) {
            created = board.create("circle", [center, idMap[obj.parents[1]]], baseAttrs);
          } else if (obj.attrs.radius != null) {
            created = board.create("circle", [center, obj.attrs.radius], baseAttrs);
          }
          break;
        }

        case "polygon": {
          const verts = obj.parents.map((pid) => idMap[pid]).filter(Boolean);
          if (verts.length < 3) continue;
          created = board.create("polygon", verts, {
            ...baseAttrs,
            hasInnerPoints: !readOnly,
          });
          break;
        }

        case "functiongraph": {
          const expr = obj.attrs.expression || "0";
          // eslint-disable-next-line no-new-func
          const fn = new Function("x", `return (${expr})`);
          created = board.create("functiongraph", [fn], baseAttrs);
          (created as any)._expression = expr;
          break;
        }

        case "text": {
          // Dynamic measurement text (midpoint label for segment length)
          if (obj.attrs.measurementOf && obj.attrs.measurementOf.length === 2) {
            const mp1 = idMap[obj.attrs.measurementOf[0]];
            const mp2 = idMap[obj.attrs.measurementOf[1]];
            if (mp1 && mp2) {
              created = board.create("text", [
                () => (mp1.X() + mp2.X()) / 2,
                () => (mp1.Y() + mp2.Y()) / 2 + 0.3,
                () => {
                  const dx = mp2.X() - mp1.X();
                  const dy = mp2.Y() - mp1.Y();
                  return Math.sqrt(dx * dx + dy * dy).toFixed(1);
                },
              ], {
                ...baseAttrs,
                strokeColor: isDark ? "#e3d5c5" : "#6b5a4a",
                display: "internal",
                fixed: true,
                fontSize: 11,
                anchorX: "middle",
                anchorY: "bottom",
              });
              if (created) (created as any)._measurementParents = obj.attrs.measurementOf;
              break;
            }
          }
          // Static text
          created = board.create(
            "text",
            [obj.attrs.x!, obj.attrs.y!, obj.attrs.content || ""],
            { ...baseAttrs, display: "internal", fixed: true }
          );
          break;
        }

        case "angle": {
          const pts = obj.parents.map((pid) => idMap[pid]).filter(Boolean);
          if (pts.length < 3) continue;
          const angleAttrs: Record<string, any> = {
            ...baseAttrs,
            radius: obj.attrs.radius || 1,
            selection: "minor",
          };
          if (obj.attrs.showDegrees) {
            // Dynamic name showing degree value
            angleAttrs.label = {
              strokeColor: isDark ? "#e3d5c5" : "#1f2937",
              fontSize: 11,
              display: "internal",
            };
          }
          if (obj.attrs.showDegrees) {
            // name must be passed at creation time — setName() expects a string, not a function
            let angleRef: any;
            angleAttrs.name = () => {
              let val = angleRef?.Value ? angleRef.Value() : 0;
              if (val > Math.PI) val = 2 * Math.PI - val;
              return (val * 180 / Math.PI).toFixed(1) + "\u00B0";
            };
            angleRef = board.create("angle", pts, angleAttrs);
            (angleRef as any)._showDegrees = true;
            created = angleRef;
          } else {
            created = board.create("angle", pts, angleAttrs);
          }
          break;
        }
      }

      if (created) {
        idMap[obj.id] = created;
      }
    } catch {
      // Skip objects that fail to recreate (e.g. broken references)
    }
  }
}

// ---------------------------------------------------------------------------
// In-place re-theming (no board rebuild)
// ---------------------------------------------------------------------------

/**
 * Update board colours in place when the app theme changes.
 * Much faster than the old serialize → freeBoard → recreate → deserialize path
 * because JSXGraph elements support `setAttribute()` for visual properties.
 */
export function applyBoardTheme(
  board: any,
  container: HTMLDivElement,
  isDark: boolean
): void {
  const axisStroke = isDark ? "#a0907a" : "#6b5a4a";
  const tickStroke = isDark ? "#4a3d30" : "#d4c0a8";
  const gridStroke = isDark ? "#3d3628" : "#e8d4b8";
  const textColor = isDark ? "#e3d5c5" : "#1f2937";
  const tickLabelColor = isDark ? "#c0b0a0" : "#000000";

  // Axes
  const axes = board.defaultAxes;
  if (axes) {
    for (const axis of [axes.x, axes.y]) {
      if (!axis) continue;
      axis.setAttribute({
        strokeColor: axisStroke,
        highlightStrokeColor: axisStroke,
      });
      if (axis.ticks?.[0]) {
        axis.ticks[0].setAttribute({ strokeColor: tickStroke });
      }
    }
  }

  // Grid + text elements
  for (const el of board.objectsList) {
    if (el.elType === "grid") {
      el.setAttribute({ strokeColor: gridStroke });
    }
    // Tick labels (auto-generated text with dump:false)
    if (el.elType === "text" && el.dump === false) {
      el.setAttribute({ strokeColor: tickLabelColor });
    }
    // User-created text objects
    if (el.elType === "text" && el.dump !== false) {
      const color = (el as any)._measurementParents
        ? (isDark ? "#e3d5c5" : "#6b5a4a")
        : textColor;
      el.setAttribute({ strokeColor: color });
    }
    // Point labels
    if (el.elType === "point" && el.label) {
      el.label.setAttribute({ strokeColor: textColor });
    }
  }

  container.style.backgroundColor = isDark ? "#2a2a2a" : "#ffffff";
  board.fullUpdate();
}

// ---------------------------------------------------------------------------
// SVG export
// ---------------------------------------------------------------------------

export function exportBoardSvg(board: any): string {
  const svgRoot: SVGSVGElement = board.renderer.svgRoot;
  // Set explicit size for the exported SVG
  const w = board.canvasWidth || 400;
  const h = board.canvasHeight || 300;
  svgRoot.setAttribute("width", String(w));
  svgRoot.setAttribute("height", String(h));
  svgRoot.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgRoot);
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgStr)))}`;
}

// ---------------------------------------------------------------------------
// Empty state helper
// ---------------------------------------------------------------------------

export function emptyState(): GeometryState {
  return {
    version: 1,
    boundingBox: [-8, 6, 8, -6],
    objects: [],
  };
}
