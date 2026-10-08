"""
Text turned into shapes, so a logo file looks the same on a machine without
the font. A variable font is first fixed at the weight asked for, then each
glyph's outline is drawn into an SVG path, scaled and placed the way an SVG
<text> would place it.
"""
import os, re, urllib.request
from functools import lru_cache
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
SOURCES = {
    "SpaceGrotesk.ttf": "https://github.com/google/fonts/raw/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf",
    "Inter.ttf": "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf",
}

def font_file(name):
    """The font's file, fetched from Google Fonts the first time. The fonts
    aren't kept in the repo, because only their shapes end up in the logo."""
    path = os.path.join(FONTS, name)
    if not os.path.exists(path):
        os.makedirs(FONTS, exist_ok=True)
        urllib.request.urlretrieve(SOURCES[name], path)
    return path

@lru_cache(maxsize=None)
def font_at(path, weight):
    font = TTFont(path)
    axes = {a.axisTag: a.defaultValue for a in font["fvar"].axes}
    axes["wght"] = weight
    return instantiateVariableFont(font, axes)

def text_path(text, path, weight, size, x, baseline, anchor="start", spacing=0.0, width=None):
    """The path for `text` set at `size` with its baseline at `baseline`.
    anchor is "start" or "middle", as in SVG. With `width`, the size is chosen
    so the ink of the text is exactly that wide, which is how PRO is fitted
    between the M's legs."""
    font = font_at(path, weight)
    glyphs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font["head"].unitsPerEm
    names = [cmap[ord(ch)] for ch in text]

    def layout(size):
        s = size / upm; pen_x = 0.0; placed = []
        for name in names:
            placed.append((name, pen_x))
            pen_x += glyphs[name].width * s + spacing
        return s, placed

    def ink_bounds(size):
        s, placed = layout(size); xs = []
        for name, px in placed:
            bp = BoundsPen(glyphs)
            glyphs[name].draw(bp)
            if bp.bounds:
                xs += [px + bp.bounds[0] * s, px + bp.bounds[2] * s]
        return min(xs), max(xs)

    if width is not None:
        lo, hi = ink_bounds(size); size *= width / (hi - lo)
    s, placed = layout(size)
    lo, hi = ink_bounds(size)
    # Place the ink, not the advance boxes, so side bearings don't throw the centring off.
    left = x - lo if anchor == "start" else x - (lo + hi) / 2
    d = []
    for name, px in placed:
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, left + px, baseline)))
        d.append(pen.getCommands())
    # Two decimal places is a hundredth of a unit, far finer than any screen shows.
    rounded = re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group()):.2f}".rstrip("0").rstrip("."), " ".join(d))
    return rounded, size
