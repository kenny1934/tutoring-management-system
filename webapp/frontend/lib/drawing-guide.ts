/**
 * What the tools lying on a pane share with each other and with the drawing
 * layers: a centimetre in page units, how far from a tool a finger can land
 * and still count, how a turn snaps to level, upright and every 15 degrees,
 * and how a line drawn against a tool, such as along the ruler or round the
 * protractor, reaches a drawing layer and is kept to the page it starts on.
 *
 * Lines drawn against a tool are in screen pixels, the space pointer events
 * arrive in, so each drawing layer can turn them into its own page units.
 */
import { RENDER_SCALE } from "@/hooks/useAnnotations";
import type { Vec } from "@/lib/stroke-select";

/** A centimetre in page units. Page units are PDF points times the render scale, and an inch is 72 points. */
export const CM = (72 / 2.54) * RENDER_SCALE;

/** How far outside a tool's edge, in screen pixels, a line can start and still run along it. */
export const EDGE_REACH = 40;

/** How far beside a tool, in screen pixels, a second finger can land and still turn it. */
export const CATCH = 16;

/** Level, upright and every 15 degrees in between catch a tool when it comes within 2.5 degrees of one. */
export function snapAngle(angle: number): number {
  const near = Math.round(angle / 15) * 15;
  return Math.abs(angle - near) < 2.5 ? near : angle;
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
