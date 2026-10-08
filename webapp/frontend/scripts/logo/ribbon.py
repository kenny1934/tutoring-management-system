"""
The CSM ribbon, built from its centre line.

The logo is one ribbon of even thickness, drawn along a path of straight runs
and circular arcs. Its outline is that path offset by half the thickness to
each side. A straight run offsets to a straight line and an arc to an arc
round the same centre, so the outline is exact: where a run meets an arc with
the same tangent the edges meet with no bump, and where two runs meet at an
angle their edges are extended until they cross, the way a folded ribbon
creases. That crease is where the colour changes, as it did in the original.

Coordinates are in the original picture's 480 by 480 frame, y downwards, so
every measurement taken from the old logo.png can be used as it is.
Angles are in degrees, measured the way the screen turns: 0 is to the right
and 90 is straight down.
"""
import math

def f(v): return f"{v:.2f}".rstrip("0").rstrip(".")

def pt(c, r, a):
    return (c[0] + r * math.cos(math.radians(a)), c[1] + r * math.sin(math.radians(a)))

class Line:
    def __init__(self, p0, p1): self.p0, self.p1 = p0, p1
    def start(self): return self.p0
    def end(self): return self.p1
    def dir(self):
        dx, dy = self.p1[0] - self.p0[0], self.p1[1] - self.p0[1]; L = math.hypot(dx, dy); return (dx / L, dy / L)
    def side(self, h):
        """This run moved h to its left (as you travel along it)."""
        dx, dy = self.dir(); nx, ny = dy, -dx
        return Line((self.p0[0] + nx * h, self.p0[1] + ny * h), (self.p1[0] + nx * h, self.p1[1] + ny * h))
    def path_to_end(self): return f"L{f(self.p1[0])} {f(self.p1[1])}"
    def reversed(self): return Line(self.p1, self.p0)

class Arc:
    def __init__(self, c, r, a0, a1): self.c, self.r, self.a0, self.a1 = c, r, a0, a1
    def start(self): return pt(self.c, self.r, self.a0)
    def end(self): return pt(self.c, self.r, self.a1)
    def side(self, h):
        # Travelling with the angle growing (clockwise on screen) the centre is
        # on the right, so the left edge is further out.
        s = 1 if self.a1 > self.a0 else -1
        return Arc(self.c, self.r + s * h, self.a0, self.a1)
    def path_to_end(self):
        x, y = self.end(); large = 1 if abs(self.a1 - self.a0) > 180 else 0; sweep = 1 if self.a1 > self.a0 else 0
        return f"A{f(self.r)} {f(self.r)} 0 {large} {sweep} {f(x)} {f(y)}"
    def reversed(self): return Arc(self.c, self.r, self.a1, self.a0)

def cross(l1, l2):
    """Where two lines, extended, cross."""
    (x1, y1), (x2, y2) = l1.p0, l1.p1; (x3, y3), (x4, y4) = l2.p0, l2.p1
    d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    a = x1 * y2 - y1 * x2; b = x3 * y4 - y3 * x4
    return ((a * (x3 - x4) - (x1 - x2) * b) / d, (a * (y3 - y4) - (y1 - y2) * b) / d)

def edge(segs, h):
    """One edge of a run of segments: the segments moved h to their left, with
    any corners between straight runs carried out to where the edges cross."""
    out = [s.side(h) for s in segs]
    # Fix up corners: a straight run meeting a straight run at an angle.
    for i in range(len(out) - 1):
        a, b = out[i], out[i + 1]
        if isinstance(a, Line) and isinstance(b, Line):
            ax, ay = a.dir(); bx, by = b.dir()
            if abs(ax * by - ay * bx) > 1e-6:
                p = cross(a, b); out[i] = Line(a.p0, p); out[i + 1] = Line(p, b.p1)
    return out

def outline(segs, w, start_cap=None, end_cap=None):
    """The closed outline of a run of segments drawn w thick.
    A cap is None for a square end, or a list of points to go through."""
    h = w / 2
    left = edge(segs, h); right = edge(segs, -h)
    d = f"M{f(left[0].start()[0])} {f(left[0].start()[1])} " + " ".join(s.path_to_end() for s in left)
    for p in (end_cap or []): d += f" L{f(p[0])} {f(p[1])}"
    rr = [s.reversed() for s in reversed(right)]
    d += f" L{f(rr[0].start()[0])} {f(rr[0].start()[1])} " + " ".join(s.path_to_end() for s in rr)
    for p in (start_cap or []): d += f" L{f(p[0])} {f(p[1])}"
    return d + " Z"

def corner_points(seg_in, seg_out, w):
    """The two ends of the crease where one straight run turns into the next."""
    h = w / 2
    return cross(seg_in.side(h), seg_out.side(h)), cross(seg_in.side(-h), seg_out.side(-h))
