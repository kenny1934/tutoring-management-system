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
  };
}

export interface GeometryState {
  version: 1;
  boundingBox: [number, number, number, number]; // [xmin, ymax, xmax, ymin]
  objects: GeometryObject[];
}

// Internal element types JSXGraph creates automatically (axes, grids, ticks…)
const INTERNAL_TYPES = new Set([
  "axis",
  "ticks",
  "grid",
  "intersection",
  "label",
  "arrow",
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
    if (!el.elType || INTERNAL_TYPES.has(el.elType)) continue;
    // Skip auto-generated child elements (e.g. polygon border lines)
    if (el.dump === false || el.visProp?.visible === false) continue;

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

    case "functiongraph":
      // Store the original expression the user typed
      base.attrs.expression =
        (el as any)._expression || el.Y?.toString() || "";
      break;

    case "text":
      base.attrs.x = el.X();
      base.attrs.y = el.Y();
      base.attrs.content =
        typeof el.plaintext === "string" ? el.plaintext : String(el.plaintext);
      break;

    case "angle":
      // Three parent points
      if (el.parents && el.parents.length >= 3) {
        base.parents = el.parents.slice(0, 3);
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
  readOnly = false
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
      fixed,
    };

    try {
      let created: any;

      switch (obj.type) {
        case "point":
          created = board.create("point", [obj.attrs.x!, obj.attrs.y!], {
            ...baseAttrs,
            snapToGrid: false,
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

        case "text":
          created = board.create(
            "text",
            [obj.attrs.x!, obj.attrs.y!, obj.attrs.content || ""],
            { ...baseAttrs, fixed: true }
          );
          break;

        case "angle": {
          const pts = obj.parents.map((pid) => idMap[pid]).filter(Boolean);
          if (pts.length < 3) continue;
          created = board.create("angle", pts, baseAttrs);
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
// SVG export
// ---------------------------------------------------------------------------

export function exportBoardSvg(board: any): string {
  const svgRoot: SVGSVGElement = board.renderer.svgRoot;
  // Set explicit size for the exported SVG
  const bbox = board.getBoundingBox();
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
