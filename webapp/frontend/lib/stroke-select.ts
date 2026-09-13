/**
 * The lasso for lesson annotations. You draw a loop round some ink to select
 * it, and then you can move it, resize it, recolour it or delete it. Strokes
 * are never changed in place, so each of those makes new strokes, and the
 * drawing layer hands the page's new strokes back once, when the finger lifts
 * or the colour is picked. That keeps each one a single step in the undo
 * history, and saving, the server and the PDF don't need to know the lasso exists.
 */
import type { InkKind, Stroke } from "@/hooks/useAnnotations";
import { boundingBox, type Box } from "@/lib/stroke-eraser";

export type Vec = [number, number];

/** Whether a stroke is pen or highlighter ink. Pen strokes carry no kind, like ink saved before the highlighter. */
export const kindOf = (stroke: Stroke): InkKind => stroke.kind ?? "pen";

/** A resize can shrink the ink to a quarter of its size, or grow it to four times its size. */
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

function pointsBox(points: readonly (readonly number[])[]): Box {
  const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const [x, y] of points) {
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.top = Math.min(box.top, y);
    box.bottom = Math.max(box.bottom, y);
  }
  return box;
}

/**
 * Whether a point is inside the loop. A line from the point out to the right
 * crosses the loop's edge an odd number of times when the point is inside.
 */
export function insideLoop([px, py]: Vec, loop: Vec[]): boolean {
  let inside = false;
  for (let a = 0, b = loop.length - 1; a < loop.length; b = a++) {
    const [ax, ay] = loop[a];
    const [bx, by] = loop[b];
    if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/**
 * The strokes a loop catches. A stroke counts when more than half of its
 * points are inside the loop, so a loop that clips the end of a word still
 * takes the whole word, and a line that only passes through the loop stays
 * where it is. The loop is closed from its last point back to its first.
 */
export function strokesInLoop(strokes: Stroke[], loop: Vec[]): Stroke[] {
  if (loop.length < 3) return [];
  const area = pointsBox(loop);
  return strokes.filter((stroke) => {
    // Most strokes on a page are nowhere near the loop, so rule them out by their bounding box first.
    const box = boundingBox(stroke);
    if (box.right < area.left || box.left > area.right || box.bottom < area.top || box.top > area.bottom) return false;
    let inside = 0;
    for (const [x, y] of stroke.points) if (insideLoop([x, y], loop)) inside++;
    return inside > stroke.points.length / 2;
  });
}

/** The box round the centre lines of all the given strokes. */
export function selectionBounds(strokes: Stroke[]): Box {
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const stroke of strokes) {
    const box = boundingBox(stroke);
    bounds.left = Math.min(bounds.left, box.left);
    bounds.right = Math.max(bounds.right, box.right);
    bounds.top = Math.min(bounds.top, box.top);
    bounds.bottom = Math.max(bounds.bottom, box.bottom);
  }
  return bounds;
}

/**
 * How far the selection can go towards (dx, dy) and keep its ink on the page.
 * Ink that already runs past an edge, because the pen went off the page while
 * it was drawn, can still move back in, but no further out.
 */
export function clampMove(bounds: Box, dx: number, dy: number, width: number, height: number): Vec {
  return [
    clamp(dx, Math.min(0, -bounds.left), Math.max(0, width - bounds.right)),
    clamp(dy, Math.min(0, -bounds.top), Math.max(0, height - bounds.bottom)),
  ];
}

export function moveStrokes(strokes: Stroke[], dx: number, dy: number): Stroke[] {
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map(([x, y, p]): [number, number, number] => [x + dx, y + dy, p]),
  }));
}

// How far to shift a span from lo to hi so it lies between 0 and size. A span
// longer than size is lined up with 0.
function shiftInto(lo: number, hi: number, size: number): number {
  if (lo < 0) return -lo;
  if (hi > size) return Math.max(size - hi, -lo);
  return 0;
}

/**
 * How far to move ink so it lies on a page of the given size, which is not at
 * all when it's already on it. Ink moved to another page keeps its place when
 * it can, and ink wider or taller than the page is lined up with its left or
 * top edge.
 */
export function fitOnPage(bounds: Box, width: number, height: number): Vec {
  return [shiftInto(bounds.left, bounds.right, width), shiftInto(bounds.top, bounds.bottom, height)];
}

/**
 * The scale a drag of the resize handle asks for. The handle sits on the
 * selection's bottom-right corner and the top-left corner stays still, so the
 * scale is how much further from that corner the pointer has gone, counting
 * across and down together. A drag away from the corner in any direction
 * grows the ink, and a drag back towards it shrinks the ink.
 */
export function dragScale(bounds: Box, from: Vec, to: Vec): number {
  const reach = Math.max(from[0] - bounds.left + (from[1] - bounds.top), 1);
  return (to[0] - bounds.left + (to[1] - bounds.top)) / reach;
}

/**
 * The scale kept between a quarter and four times the size, and small enough
 * to keep the ink on the page. Ink that already runs past the page's edge can
 * still stay the size it is.
 */
export function clampScale(bounds: Box, scale: number, width: number, height: number): number {
  const across = Math.max(bounds.right - bounds.left, 1);
  const down = Math.max(bounds.bottom - bounds.top, 1);
  const most = Math.max(1, Math.min(MAX_SCALE, (width - bounds.left) / across, (height - bounds.top) / down));
  return clamp(scale, MIN_SCALE, most);
}

/**
 * The strokes resized by the given scale from a corner that stays still. Each
 * stroke keeps its pen width, so resized writing still matches the ink round it.
 */
export function resizeStrokes(strokes: Stroke[], corner: Vec, scale: number): Stroke[] {
  const [cx, cy] = corner;
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map(([x, y, p]): [number, number, number] => [cx + (x - cx) * scale, cy + (y - cy) * scale, p]),
  }));
}

/**
 * The strokes with one kind of ink in a new colour. A colour only changes ink
 * of its own kind, so picking a pen colour never touches highlighter ink. Ink
 * of the other kind, and any stroke that's already that colour, stays the same
 * object, so the page can tell nothing happened to it.
 */
export function recolourStrokes(strokes: Stroke[], kind: InkKind, colour: string): Stroke[] {
  return strokes.map((stroke) => (kindOf(stroke) === kind && stroke.color !== colour ? { ...stroke, color: colour } : stroke));
}
