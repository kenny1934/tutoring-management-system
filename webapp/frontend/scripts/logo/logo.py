"""
The CSM logo's geometry: every piece of it as an SVG path, in the frame of
the old 480 by 480 logo.png (see ribbon.py).

The C, its baseline and the S are one ribbon 30 thick. It starts at the C's
pointed top end, goes round the C and along the baseline, and twists inside
the S's lower bowl, which is why its ink side shows there. Then it climbs the
S and runs along the S's top into the M, where it folds over into the M's
first diagonal. Everything the old picture got roughly right is kept where it
was. Where it was only roughly right, this drawing tidies it:

  - The C's top end runs parallel to the arrow's underside, so the gap
    between them is even.
  - The fold into the M is creased at the angle the ribbon's turn really makes.
  - The M is drawn like the MathConcept M, so the two read as a family. Its
    legs are separate pieces, cut off from the diagonals by the same gap as
    the one under the arrow. Each diagonal is a blade that narrows towards
    the V. The \\ runs all the way down and sits in front, and the / stops a
    gap short of it. Each leg takes the colour of the diagonal across from it.

The pieces come out in drawing order, as (colour, path) pairs, where colour
is "ink" or "oak". The S's twist is ("twist", path, (centre, radius)): the S's
lower bowl drawn in ink, but only inside that circle.
"""
import math
from ribbon import Line, Arc, outline, corner_points, cross, pt, f

# The ribbon, and the C it starts with.
W = 30.0; H = W / 2
C_CENTRE, C_RADIUS = (96.0, 246.0), 60.0
BASE = C_CENTRE[1] + C_RADIUS                  # the baseline's centre line
GAP = 7.5                                      # the one gap: under the arrow, and between the M's pieces

# The S: two bowls of the same size stacked on the baseline.
S_RADIUS = 33.25
S_LOWER_X = 287 - S_RADIUS - H                 # the lower bowl's centre
S_UPPER_X = 162 + S_RADIUS + H                 # the upper bowl's centre
S_MIDDLE = BASE - 2 * S_RADIUS
TOP = BASE - 4 * S_RADIUS                      # the S's top run, which carries on into the M
CAP = TOP - H                                  # 158, the top of the S and the M
FOOT = 321.0                                   # the bottom of the C, the S and the M's legs

# The M. Its left leg runs from 297 to 327 and its right leg from 415.5 to 445.5.
LEFT_LEG = (297.0, 327.0)
RIGHT_LEG_CENTRE = 430.5
RIGHT_LEG = (RIGHT_LEG_CENTRE - H, RIGHT_LEG_CENTRE + H)
M_MIDDLE = (LEFT_LEG[1] + RIGHT_LEG[0]) / 2
M_ENTRY_X = 349.5 + 0.786 * (TOP - 240)        # where the S's top run turns into the M, as the old logo had it
V_BOTTOM = 268.0                               # how low the V's bottom point comes
BLADE_END = 38.0                               # how far above that point the \\'s upper edge crosses the M's middle

# The arrow over the C: its tail, a point on each edge, and its head.
ARROW_TAIL = (20.0, 221.0)
ARROW_UPPER = ((56.0, 172.0), (122.5, 157.0))
ARROW_LOWER = ((53.0, 196.0), (125.0, 188.0))
ARROW_HEAD = [(121.0, 150.0), (153.0, 174.5), (127.0, 201.0)]

# The S's twist: the circle the ink side of the lower bowl shows inside.
TWIST = ((243.0, 253.0), (277.0, 266.0), (289.0, 290.0))


def circle3(a, b, c):
    """The circle through three points: its centre and radius."""
    ax, ay = a; bx, by = b; cx, cy = c
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    ux = ((ax**2 + ay**2) * (by - cy) + (bx**2 + by**2) * (cy - ay) + (cx**2 + cy**2) * (ay - by)) / d
    uy = ((ax**2 + ay**2) * (cx - bx) + (bx**2 + by**2) * (ax - cx) + (cx**2 + cy**2) * (bx - ax)) / d
    return (ux, uy), math.hypot(ax - ux, ay - uy)

def minor_arc(c, r, a, b):
    """The SVG arc command along the circle (c, r) from a to b, the short way round."""
    turn = (a[0] - c[0]) * (b[1] - c[1]) - (a[1] - c[1]) * (b[0] - c[0])
    return f"A{f(r)} {f(r)} 0 0 {1 if turn > 0 else 0} {f(b[0])} {f(b[1])}"

def polygon(points):
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in points) + " Z"

def x_on(line, y):
    (x0, y0), (x1, y1) = line.p0, line.p1; return x0 + (x1 - x0) * (y - y0) / (y1 - y0)

def y_on(line, x):
    (x0, y0), (x1, y1) = line.p0, line.p1; return y0 + (y1 - y0) * (x - x0) / (x1 - x0)

def line_through(p, slope):
    return Line(p, (p[0] + 100, p[1] + 100 * slope))

def moved_down(line, slope, by):
    """A line moved `by` square to itself, downwards."""
    dy = by * math.sqrt(1 + slope ** 2)
    return Line((line.p0[0], line.p0[1] + dy), (line.p1[0], line.p1[1] + dy))

def touching_arc(centre, edge_r, at, tip):
    """A circle that touches the circle (centre, edge_r) at angle `at` and passes
    through `tip`: the point where it touches, its centre and its radius. This
    is how a tapering end leaves a curve without a corner."""
    p = pt(centre, edge_r, at)
    u = ((p[0] - centre[0]) / edge_r, (p[1] - centre[1]) / edge_r)
    dx, dy = p[0] - tip[0], p[1] - tip[1]
    k = (dx * dx + dy * dy) / (2 * (u[0] * dx + u[1] * dy))
    return p, (p[0] - k * u[0], p[1] - k * u[1]), abs(k)

def circle_crossing(c1, r1, c2, r2):
    """Where two circles cross, the crossing further left."""
    d = math.dist(c1, c2); a = (r1 * r1 - r2 * r2 + d * d) / (2 * d); h = math.sqrt(r1 * r1 - a * a)
    ex, ey = (c2[0] - c1[0]) / d, (c2[1] - c1[1]) / d
    px, py = c1[0] + a * ex, c1[1] + a * ey
    return min([(px + h * ey, py - h * ex), (px - h * ey, py + h * ex)])


def m_entry():
    """The crease where the S's top run folds into the M's \\, as its two ends."""
    diagonal = Line((M_ENTRY_X, TOP), (M_MIDDLE, 252.0))
    return corner_points(Line((S_UPPER_X, TOP), (M_ENTRY_X, TOP)), diagonal, W)

def m_pieces():
    """The M's four pieces: the \\, the /, and the two legs.

    Each blade has a steep upper edge and a shallower lower edge, so it
    narrows towards the V. The / mirrors the \\ about the M's middle, so the
    two look equally heavy. The \\'s end lies on the line of the /'s lower
    edge, so the underside of the V reads as one line from the \\'s bottom
    point up to the right leg. The / ends a gap short of the \\, cut parallel
    to the \\'s upper edge. Each leg's top is cut a gap below the lower edge
    of the blade above it."""
    crease_top, crease_bottom = m_entry()
    lower_slope = (V_BOTTOM - crease_bottom[1]) / (M_MIDDLE - crease_bottom[0])
    upper_slope = (V_BOTTOM - BLADE_END - crease_top[1]) / (M_MIDDLE - crease_top[0])
    bottom = (M_MIDDLE, V_BOTTOM)
    back_upper = line_through(crease_top, upper_slope)
    back_lower = line_through(crease_bottom, lower_slope)
    fore_lower = line_through(bottom, -lower_slope)
    fore_upper = line_through((2 * M_MIDDLE - crease_top[0], CAP), -upper_slope)
    fore_end = line_through((crease_top[0] + GAP * math.sqrt(1 + upper_slope ** 2) / upper_slope, crease_top[1]), upper_slope)
    back = polygon([crease_top, cross(back_upper, fore_lower), bottom, crease_bottom])
    fore = polygon([fore_upper.p0, (RIGHT_LEG[1], CAP), (RIGHT_LEG[1], y_on(fore_lower, RIGHT_LEG[1])),
                    cross(fore_lower, fore_end), cross(fore_upper, fore_end)])
    left_cut = moved_down(back_lower, lower_slope, GAP)
    right_cut = moved_down(fore_lower, lower_slope, GAP)
    left = polygon([(LEFT_LEG[0], y_on(left_cut, LEFT_LEG[0])), (LEFT_LEG[1], y_on(left_cut, LEFT_LEG[1])),
                    (LEFT_LEG[1], FOOT), (LEFT_LEG[0], FOOT)])
    right = polygon([(RIGHT_LEG[0], y_on(right_cut, RIGHT_LEG[0])), (RIGHT_LEG[1], y_on(right_cut, RIGHT_LEG[1])),
                     (RIGHT_LEG[1], FOOT), (RIGHT_LEG[0], FOOT)])
    return [("ink", back), ("oak", fore), ("oak", left), ("ink", right)]

def arrow(lift=0.0, head_scale=1.0):
    """The arrow over the C: one outline, its body two arcs that meet at the
    tail, then the head. lift raises the upper edge to make it heavier, and
    head_scale grows the head about where it meets the body. The small icon
    uses both, so the arrow still reads at 16 pixels."""
    upper_mid, upper_end = [(x, y - lift * (i + 1) / 2) for i, (x, y) in enumerate(ARROW_UPPER)]
    up_c, up_r = circle3(ARROW_TAIL, upper_mid, upper_end)
    lo_c, lo_r = circle3(ARROW_TAIL, *ARROW_LOWER)
    pivot = ((upper_end[0] + ARROW_LOWER[1][0]) / 2, (upper_end[1] + ARROW_LOWER[1][1]) / 2)
    head = [(pivot[0] + (x - pivot[0]) * head_scale, pivot[1] + (y - pivot[1] - (lift / 2 if i == 0 else 0)) * head_scale)
            for i, (x, y) in enumerate(ARROW_HEAD)]
    d = f"M{f(ARROW_TAIL[0])} {f(ARROW_TAIL[1])} " + minor_arc(up_c, up_r, ARROW_TAIL, upper_end)
    d += "".join(f" L{f(x)} {f(y)}" for x, y in head)
    d += f" L{f(ARROW_LOWER[1][0])} {f(ARROW_LOWER[1][1])} " + minor_arc(lo_c, lo_r, ARROW_LOWER[1], ARROW_TAIL) + " Z"
    return d

def c_top_end(w, gap, tip_x, inner_from):
    """Where the C's pointed top end goes, for a C w thick. Its outer edge
    leaves the C's circle where it would come within `gap` of the arrow's
    underside, then runs parallel to that underside to the tip. Its inner
    edge is a touching arc off the C's inner circle. A thicker C keeps the
    outer edge where it is and grows inwards, so its top end meets the gap
    at the same angle. Returns the C's centre-line radius, the angle where
    the outer edge leaves the circle, and the path from there round to the
    inner circle at that angle."""
    h = w / 2; cc = C_CENTRE; cr = C_RADIUS + H - h
    lo_c, lo_r = circle3(ARROW_TAIL, *ARROW_LOWER)
    gap_r = lo_r - gap
    leave = circle_crossing(lo_c, gap_r, cc, cr + h)
    tip = (tip_x, lo_c[1] - math.sqrt(gap_r ** 2 - (tip_x - lo_c[0]) ** 2))
    a_leave = math.degrees(math.atan2(leave[1] - cc[1], leave[0] - cc[0])) % 360
    i_from, iq, irad = touching_arc(cc, cr - h, inner_from, tip)
    i_leave = pt(cc, cr - h, a_leave)
    d = minor_arc(lo_c, gap_r, leave, tip) + " " + minor_arc(iq, irad, tip, i_from) + " " + minor_arc(cc, cr - h, i_from, i_leave)
    return cr, a_leave, d

def c_and_baseline():
    """The C and the baseline, as far as where the baseline tucks under the S."""
    cr, a_leave, top_end = c_top_end(W, GAP, 70.0, 182.0)
    base = Line((C_CENTRE[0], BASE), (S_LOWER_X + 1.5, BASE))
    d = outline([Arc(C_CENTRE, cr, a_leave, 90), base], W)
    return d[:-2] + " " + top_end + " Z"

def s_and_top():
    """The S and its top run as one outline, the run ending on the crease into the M."""
    crease_top, crease_bottom = m_entry()
    segs = [Arc((S_LOWER_X, BASE - S_RADIUS), S_RADIUS, 90, -90),
            Line((S_LOWER_X, S_MIDDLE), (S_UPPER_X, S_MIDDLE)),
            Arc((S_UPPER_X, S_MIDDLE - S_RADIUS), S_RADIUS, 90, 270),
            Line((S_UPPER_X, TOP), (310, TOP))]
    left = [s.side(H) for s in segs]; right = [s.side(-H) for s in segs]
    left[-1] = Line(left[-1].p0, crease_top); right[-1] = Line(right[-1].p0, crease_bottom)
    d = f"M{f(left[0].start()[0])} {f(left[0].start()[1])} " + " ".join(s.path_to_end() for s in left)
    rr = [s.reversed() for s in reversed(right)]
    d += f" L{f(rr[0].start()[0])} {f(rr[0].start()[1])} " + " ".join(s.path_to_end() for s in rr)
    return d + " Z"

def twist():
    lower = Arc((S_LOWER_X, BASE - S_RADIUS), S_RADIUS, 90, -90)
    return ("twist", outline([lower], W), circle3(*TWIST))

def ribbon_centre():
    """The ribbon's centre line from the C's foot, where the C on its own ends,
    along the baseline, round the S and along its top, through the fold and
    down the M's \\ to its end. The sidebar draws the logo along this line
    when it opens, so it starts where the collapsed C leaves off."""
    crease_top, crease_bottom = m_entry()
    entry = ((crease_top[0] + crease_bottom[0]) / 2, (crease_top[1] + crease_bottom[1]) / 2)
    # The middle of the \\'s slanted end: its bottom point and the corner above it.
    back_corner = cross_back_end()
    end = ((M_MIDDLE + back_corner[0]) / 2, (V_BOTTOM + back_corner[1]) / 2)
    r, lx, ux = S_RADIUS, S_LOWER_X, S_UPPER_X
    return (f"M124 {f(BASE)} L{f(lx)} {f(BASE)} "
            f"A{f(r)} {f(r)} 0 0 0 {f(lx + r)} {f(BASE - r)} A{f(r)} {f(r)} 0 0 0 {f(lx)} {f(S_MIDDLE)} "
            f"L{f(ux)} {f(S_MIDDLE)} "
            f"A{f(r)} {f(r)} 0 0 1 {f(ux - r)} {f(S_MIDDLE - r)} A{f(r)} {f(r)} 0 0 1 {f(ux)} {f(TOP)} "
            f"L{f(entry[0])} {f(entry[1])} L{f(end[0])} {f(end[1])}")

def cross_back_end():
    """The corner where the \\'s upper edge meets its slanted end."""
    crease_top, crease_bottom = m_entry()
    upper_slope = (V_BOTTOM - BLADE_END - crease_top[1]) / (M_MIDDLE - crease_top[0])
    lower_slope = (V_BOTTOM - crease_bottom[1]) / (M_MIDDLE - crease_bottom[0])
    return cross(line_through(crease_top, upper_slope), line_through((M_MIDDLE, V_BOTTOM), -lower_slope))

def full():
    """The whole logo without PRO, in drawing order."""
    return m_pieces() + [("ink", c_and_baseline()), ("oak", s_and_top()), twist(), ("oak", arrow())]

def cs():
    """The C and the S, without the M."""
    return full()[4:]

def initial_c(w=W, gap=GAP, tip_x=70.0, inner_from=182.0, end_x=124.0):
    """The C and its arrow on their own. The C's foot runs along the baseline
    to end_x and is cut at the slant of the M's \\, so the initial still
    belongs to the family."""
    cr, a_leave, top_end = c_top_end(w, gap, tip_x, inner_from)
    h = w / 2; cc = C_CENTRE; base = cc[1] + cr
    i_leave = pt(cc, cr - h, a_leave); leave = pt(cc, cr + h, a_leave)
    slope = 1.06
    d = f"M{f(i_leave[0])} {f(i_leave[1])} A{f(cr - h)} {f(cr - h)} 0 0 0 {f(cc[0])} {f(base - h)}"
    d += f" L{f(end_x)} {f(base - h)} L{f(end_x + w / slope)} {f(base + h)} L{f(cc[0])} {f(base + h)}"
    d += f" A{f(cr + h)} {f(cr + h)} 0 0 1 {f(leave[0])} {f(leave[1])} " + top_end + " Z"
    return [("ink", d), ("oak", arrow())]

def icon():
    """The C and its arrow drawn for 16 and 32 pixels. The C is thicker, the
    gap under the arrow is wider so it stays open at one pixel, and the arrow
    is heavier with a bigger head."""
    c, _ = initial_c(w=40, gap=13, tip_x=74, inner_from=186, end_x=120)
    return [c, ("oak", arrow(lift=10, head_scale=1.25))]
