/**
 * The ruler for lesson annotations: a strip of clear plastic that lies on the
 * worksheet or the Draft, marked in true centimetres of the printed page. One
 * finger moves it and two fingers turn it. A line that starts just outside
 * either long edge runs straight along that edge, and it's stored as an
 * ordinary two-point stroke, so saving, undo, the server and the PDF don't
 * need to know the ruler exists.
 *
 * The ruler's frame and edges are in screen pixels, the same space pointer
 * events arrive in, so the ruler and each drawing layer can turn them into
 * their own units.
 */
import { RENDER_SCALE } from "@/hooks/useAnnotations";
import type { Vec } from "@/lib/stroke-select";

/** A centimetre in page units. Page units are PDF points times the render scale, and an inch is 72 points. */
export const CM = (72 / 2.54) * RENDER_SCALE;

/** The ruler is 16 cm long and 3 cm tall. Its marks run from 0 to 15 cm, with half a centimetre spare at each end. */
export const RULER_LENGTH_CM = 16;
export const RULER_HEIGHT_CM = 3;

/** How far outside a long edge, in screen pixels, a line can start and still run along it. */
export const EDGE_REACH = 40;

/** How far beside the ruler, in screen pixels, a second finger can land and still turn it. */
export const CATCH = 16;

// How far past either end of the ruler, in screen pixels, a line can start,
// so one can begin right at the ruler's corner.
const END_SLACK = 16;

/** Level, upright and every 15 degrees in between catch the ruler when it comes within 2.5 degrees of one. */
export function snapAngle(angle: number): number {
  const near = Math.round(angle / 15) * 15;
  return Math.abs(angle - near) < 2.5 ? near : angle;
}

/** The angle the ruler shows, from 0 to 179 degrees, since a ruler reads the same either way round. */
export function shownAngle(angle: number): number {
  return ((Math.round(angle) % 180) + 180) % 180;
}

/** The ruler on screen: its centre, the direction along it, and half its length and height. */
export interface RulerFrame {
  cx: number;
  cy: number;
  /** A unit vector pointing along the ruler. */
  dx: number;
  dy: number;
  halfLength: number;
  halfHeight: number;
}

/** A point's place against the ruler: how far along it from its centre, and how far across from its middle line. */
function against(frame: RulerFrame, [px, py]: Vec) {
  const rx = px - frame.cx;
  const ry = py - frame.cy;
  return { along: rx * frame.dx + ry * frame.dy, across: -rx * frame.dy + ry * frame.dx };
}

/** Whether a point is on the ruler or no further than `margin` screen pixels from it. */
export function nearRuler(frame: RulerFrame, point: Vec, margin: number): boolean {
  const { along, across } = against(frame, point);
  return Math.abs(along) <= frame.halfLength + margin && Math.abs(across) <= frame.halfHeight + margin;
}

/**
 * One of the ruler's long edges on screen: the point on it level with the
 * ruler's centre, the direction along it, the direction away from the ruler,
 * and how far along it each end of the ruler is.
 */
export interface RulerEdge {
  origin: Vec;
  along: Vec;
  out: Vec;
  ends: [number, number];
}

/** The edge a line starting at this point runs along, or null when the point isn't just outside either long edge. */
export function edgeAt(frame: RulerFrame, point: Vec): RulerEdge | null {
  const { along, across } = against(frame, point);
  const outside = Math.abs(across) - frame.halfHeight;
  if (outside < 0 || outside > EDGE_REACH || Math.abs(along) > frame.halfLength + END_SLACK) return null;
  const side = across > 0 ? 1 : -1;
  const out: Vec = [-frame.dy * side, frame.dx * side];
  return {
    origin: [frame.cx + out[0] * frame.halfHeight, frame.cy + out[1] * frame.halfHeight],
    along: [frame.dx, frame.dy],
    out,
    ends: [-frame.halfLength, frame.halfLength],
  };
}

/**
 * A point slid onto the edge, stopping at the ruler's ends, and moved out from
 * the edge by `offset` screen pixels. A line is kept half a pen width out, so
 * its ink runs along the edge without going under the ruler.
 */
export function ontoEdge(edge: RulerEdge, [px, py]: Vec, offset: number): Vec {
  const { origin, along, out, ends } = edge;
  const t = Math.min(Math.max((px - origin[0]) * along[0] + (py - origin[1]) * along[1], ends[0]), ends[1]);
  return [origin[0] + along[0] * t + out[0] * offset, origin[1] + along[1] * t + out[1] * offset];
}

/**
 * The part of the line from a to b that's on a page of the given size, in
 * page units, or null when none of it is. A line along the ruler can run past
 * the edge of the page it started on, and whatever runs past is dropped.
 */
export function clipToPage(a: Vec, b: Vec, width: number, height: number): [Vec, Vec] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let from = 0;
  let to = 1;
  // For each edge of the page, p is how fast the line heads out through it
  // and q is how far inside it the line starts.
  const edges: Vec[] = [[-dx, a[0]], [dx, width - a[0]], [-dy, a[1]], [dy, height - a[1]]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) from = Math.max(from, t);
    else to = Math.min(to, t);
    if (from > to) return null;
  }
  return [[a[0] + from * dx, a[1] + from * dy], [a[0] + to * dx, a[1] + to * dy]];
}

/**
 * The first stretch of a line through these points that's on a page of the
 * given size, in page units, or null when none of it is. An arc drawn against
 * the protractor can run off the page it started on and come back, and it
 * keeps the part from its start to where it first leaves.
 */
export function clipPointsToPage(points: Vec[], width: number, height: number): Vec[] | null {
  if (points.length === 1) {
    const [[x, y]] = points;
    return x >= 0 && x <= width && y >= 0 && y <= height ? points : null;
  }
  const kept: Vec[] = [];
  for (let i = 1; i < points.length; i++) {
    const piece = clipToPage(points[i - 1], points[i], width, height);
    if (!piece) {
      if (kept.length > 0) break;
      continue;
    }
    if (kept.length === 0) kept.push(piece[0]);
    kept.push(piece[1]);
    // The line leaves the page part way along this piece.
    if (Math.hypot(piece[1][0] - points[i][0], piece[1][1] - points[i][1]) > 1e-6) break;
  }
  return kept.length > 0 ? kept : null;
}

/**
 * A tool lying on a pane that a line can be drawn against, such as the ruler
 * or the protractor. Each tool that's out adds its guide to the pane's set,
 * and a drawing layer asks each of them about a line as it starts.
 */
export interface DrawingGuide {
  /**
   * The line that starts at this screen point, or null when the point isn't
   * where this tool guides a line. The offset is half the pen's width in
   * screen pixels, which a line keeps between its ink and the tool's edge.
   */
  lineFrom: (start: Vec, offset: number) => GuidedLine | null;
}

/** A line being drawn against a tool. */
export interface GuidedLine {
  /** The line's points in screen pixels, with the finger at this point. */
  to: (point: Vec) => Vec[];
  /** Called once the finger lifts, or the line is thrown away. */
  end?: () => void;
}
