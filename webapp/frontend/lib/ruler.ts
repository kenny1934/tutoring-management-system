/**
 * The ruler for lesson annotations: a strip of clear plastic that lies on the
 * worksheet or the Draft, marked in true centimetres of the printed page. One
 * finger moves it and two fingers turn it. A line that starts just outside
 * either long edge runs straight along that edge, and it's stored as an
 * ordinary two-point stroke, so saving, undo, the server and the PDF don't
 * need to know the ruler exists. Each end of the line lands on a millimetre
 * mark, so a line is always a whole number of millimetres long, and you can
 * draw one of a set length by watching the reading. A line that starts or ends
 * beside a point in the ink, such as where two arcs cross, is pinned onto that
 * point.
 *
 * The ruler's frame and edges are in screen pixels, the same space pointer
 * events arrive in, so the ruler and each drawing layer can turn them into
 * their own units. What it shares with the other tools, such as how a line
 * against it reaches a drawing layer, is in lib/drawing-guide.ts.
 */
import { EDGE_REACH } from "@/lib/drawing-guide";
import { clamp, type Vec } from "@/lib/stroke-select";

/** The ruler is 16 cm long and 3 cm tall. Its marks run from 0 to 15 cm, with half a centimetre spare at each end. */
export const RULER_LENGTH_CM = 16;
export const RULER_HEIGHT_CM = 3;

// How far past either end of the ruler, in screen pixels, a line can start,
// so one can begin right at the ruler's corner.
const END_SLACK = 16;

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
 * and how far along it each end of the ruler is from that point.
 */
export interface RulerEdge {
  origin: Vec;
  along: Vec;
  out: Vec;
  halfLength: number;
  /** A millimetre on screen, the gap between the ruler's smallest marks. */
  mm: number;
}

// A distance rounded to a whole number of steps, such as millimetres on screen.
const roundTo = (value: number, step: number) => (step > 0 ? Math.round(value / step) * step : value);

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
    halfLength: frame.halfLength,
    mm: (2 * frame.halfLength) / (RULER_LENGTH_CM * 10),
  };
}

/**
 * A point slid onto the edge at the nearest millimetre mark, stopping at the
 * ruler's ends, and moved out from the edge by `offset` screen pixels. The
 * marks from 0 to 15 cm are centred on the ruler, so each one is a whole
 * number of millimetres from its centre, and rounding the distance along the
 * edge lands on one. The ends are 8 cm from the centre, so stopping there
 * keeps the point on a whole millimetre too. A line is kept half a pen width
 * out, so its ink runs along the edge without going under the ruler.
 */
export function ontoEdge(edge: RulerEdge, [px, py]: Vec, offset: number): Vec {
  const { origin, along, out, halfLength, mm } = edge;
  const t = clamp(roundTo((px - origin[0]) * along[0] + (py - origin[1]) * along[1], mm), -halfLength, halfLength);
  return [origin[0] + along[0] * t + out[0] * offset, origin[1] + along[1] * t + out[1] * offset];
}

/**
 * The point on the line through `through`, running in the direction `along`,
 * that's level with `point`, moved to the nearest whole step from `through`.
 */
function slideAlong(through: Vec, along: Vec, [px, py]: Vec, step: number): Vec {
  const t = roundTo((px - through[0]) * along[0] + (py - through[1]) * along[1], step);
  return [through[0] + along[0] * t, through[1] + along[1] * t];
}

/**
 * A line along a ruler's edge, from `from` to `to`, with either end pinned
 * onto a point in the ink. With both ends pinned it joins the two points
 * exactly, even where the ruler lies a little off them. With one pinned, it
 * runs from that point in the ruler's direction, as far as the other end
 * reaches. The pinned point usually isn't on a mark, so the length is rounded
 * to a whole millimetre from it, and the reading still matches the line. With
 * neither end pinned, it's the line along the edge, unchanged.
 */
export function pinnedLine(along: Vec, from: Vec, to: Vec, pinFrom: Vec | null, pinTo: Vec | null, mm: number): [Vec, Vec] {
  if (pinFrom && pinTo) return [pinFrom, pinTo];
  if (pinFrom) return [pinFrom, slideAlong(pinFrom, along, to, mm)];
  if (pinTo) return [slideAlong(pinTo, along, from, mm), pinTo];
  return [from, to];
}

/**
 * How long a line is, to the nearest millimetre, the way the ruler shows it
 * while the line is drawn, such as "6.0 cm". A line with both ends pinned can
 * be any length, so this is where its fraction of a millimetre is dropped.
 */
export function shownLength([a, b]: [Vec, Vec], mm: number): string {
  const millimetres = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / mm);
  return `${(millimetres / 10).toFixed(1)} cm`;
}
