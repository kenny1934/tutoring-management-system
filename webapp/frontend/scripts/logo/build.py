"""
Builds every version of the CSM logo from logo.py, and writes them where the
app uses them. Run it from webapp/frontend:

    python3 scripts/logo/build.py && node scripts/logo/render-icons.mjs && python3 scripts/logo/build.py --ico

The first step writes the SVG files, the shapes the app draws inline, and a
list of the PNG icons to make. The second renders those PNGs in a browser,
because a browser is what draws the SVGs everywhere else. The last packs the
small PNGs into the .ico file that older browsers ask for.

The versions, largest first:

  lockup        the logo with PRO and the tagline, for printed reports
  logo          the logo with PRO, the main version
  logo-no-pro   the logo without PRO, for where PRO would be too small to read
  cs, c         the initials, for square spaces
  tile-*        the small icon on an oak square, for the browser tab, the phone
                home screen and the installed app
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import logo
from ribbon import f
from outline import text_path, font_file

FRONTEND = os.path.normpath(os.path.join(HERE, "..", ".."))
BRAND = os.path.join(FRONTEND, "public", "brand")
JOBS = os.path.join(HERE, "icons.json")

# The colours match the app's own: oak is the accent in each mode, ink is
# near-black in light mode and the cream text colour in dark mode.
LIGHT = {"ink": "#1f1a14", "oak": "#8f6240", "sub": "#7d674c"}
DARK = {"ink": "#f3ede4", "oak": "#cd853f", "sub": "#a09080"}
# The tile is oak in both modes, with a cream C and a pale amber arrow, so the
# arrow stays an accent but is still light enough to see at 16 pixels.
TILE = {"fill": "#8f6240", "ink": "#fef9f3", "oak": "#f3c98f"}

TAGLINE = "Class Session Manager for Productive Resource Orchestration"

# Each view is the drawing's own bounds with a unit to spare round it, in the
# 480 frame. The icon's view is square, centred on the icon.
VIEWS = {
    "logo": (19, 149, 427.5, 173),
    "lockup": (19, 149, 427.5, 220),
    "cs": (19, 149, 286, 173),
    "c": (19, 149, 135, 173),
    "icon": (2, 128, 196, 196),
}

def pro():
    """PRO in Space Grotesk 600, as shapes. It sits centred between the M's
    legs with a 7 unit gap from each, its base on the M's feet."""
    d, _ = text_path("PRO", font_file("SpaceGrotesk.ttf"), 600, 34, logo.M_MIDDLE, logo.FOOT, anchor="middle",
                     width=(logo.RIGHT_LEG[0] - logo.LEFT_LEG[1]) - 2 * 7)
    return d

def tagline():
    """The tagline in Inter 500, as wide as the logo, under it."""
    d, _ = text_path(TAGLINE, font_file("Inter.ttf"), 500, 14, logo.ARROW_TAIL[0], 362.0,
                     width=logo.RIGHT_LEG[1] - logo.ARROW_TAIL[0])
    return d

def svg(pieces, colours, view, ident, tile=None, size=None):
    """A standalone SVG file. `ident` keeps the twist's ids apart when several
    of these sit inline on one page. A tile is the square behind an icon:
    {"fill", "radius"}, the radius as a share of its side."""
    body, defs = [], []
    for piece in pieces:
        tone, d = piece[0], piece[1]
        if tone == "twist":
            (cx, cy), r = piece[2]
            defs.append(f'<clipPath id="{ident}-twist"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
            # The oak S underneath is cut away inside the twist, all but a
            # sliver along its curved edge. Oak left under the ink's other
            # edges would show through their soft pixels as a hairline.
            defs.append(f'<mask id="{ident}-under" maskUnits="userSpaceOnUse" x="0" y="0" width="480" height="480">'
                        f'<rect width="480" height="480" fill="#fff"/><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r - 1)}" fill="#000"/></mask>')
            body[-1] = body[-1].replace("/>", f' mask="url(#{ident}-under)"/>')
            body.append(f'<path d="{d}" fill="{colours["ink"]}" clip-path="url(#{ident}-twist)"/>')
        else:
            body.append(f'<path d="{d}" fill="{colours[tone]}"/>')
    x, y, w, h = view
    back = ""
    if tile:
        back = f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(w * tile["radius"])}" fill="{tile["fill"]}"/>'
    dims = f' width="{size}" height="{size}"' if size else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{f(x)} {f(y)} {f(w)} {f(h)}"{dims}>'
            + (f"<defs>{''.join(defs)}</defs>" if defs else "") + back + "".join(body) + "</svg>\n")

def tile_view(margin):
    """The icon's view with a margin round it, as a share of its side."""
    x, y, w, h = VIEWS["icon"]; pad = w * margin
    return (x - pad, y - pad, w + 2 * pad, h + 2 * pad)

# A tab icon has only 16 pixels, so its tile keeps a thin margin. A phone
# rounds or crops an app's icon to its own shape, so the app tiles keep a
# wider margin. The maskable one, for Android, keeps everything inside the
# middle 80%, which is the most any phone crops to.
TILES = {
    "tile-tab": (0.04, 0.2),
    "tile-app": (0.16, 0.22),
    "tile-app-square": (0.16, 0),
    "tile-maskable": (0.3, 0),
}

def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="\n") as fh:
        fh.write(text)

def art_module(full, the_pro, the_c):
    """The shapes the app draws inline, as a TypeScript module, so the logo
    follows light and dark mode without a second file."""
    def pieces(items):
        out = []
        for p in items:
            if p[0] == "twist":
                (cx, cy), r = p[2]
                out.append(f'  {{ tone: "twist", d: "{p[1]}", circle: [{f(cx)}, {f(cy)}, {f(r)}] }},')
            else:
                out.append(f'  {{ tone: "{p[0]}", d: "{p[1]}" }},')
        return "\n".join(out)
    def view(v): return " ".join(f(n) for n in v)
    m = logo.m_pieces()
    return f'''// Written by scripts/logo/build.py. Change the drawing there, not here.

export type LogoPiece =
  | {{ tone: "ink" | "oak"; d: string }}
  | {{ tone: "twist"; d: string; circle: [number, number, number] }};

/** The logo without PRO, in drawing order. */
export const LOGO_PIECES: LogoPiece[] = [
{pieces(full)}
];

/** PRO, between the M's legs. */
export const LOGO_PRO = "{the_pro}";

/** The M's four pieces, which the sidebar brings in one by one as the ribbon reaches them. */
export const LOGO_M = {{ back: "{m[0][1]}", fore: "{m[1][1]}", leftLeg: "{m[2][1]}", rightLeg: "{m[3][1]}" }};

/** The ribbon's centre line, from the C's foot to the end of the M's \\, for drawing the logo along it. */
export const LOGO_RIBBON = "{logo.ribbon_centre()}";

/** The C and its arrow on their own. */
export const LOGO_C_PIECES: LogoPiece[] = [
{pieces(the_c)}
];

export const LOGO_VIEW = "{view(VIEWS["logo"])}";
export const LOGO_C_VIEW = "{view(VIEWS["c"])}";
'''

def build():
    full, the_c, the_pro = logo.full(), logo.initial_c(), pro()
    with_pro = full + [("oak", the_pro)]
    files = {}
    for colours, suffix in ((LIGHT, ""), (DARK, "-dark")):
        files[f"logo{suffix}.svg"] = svg(with_pro, colours, VIEWS["logo"], "logo")
        files[f"logo-no-pro{suffix}.svg"] = svg(full, colours, VIEWS["logo"], "logo")
        files[f"lockup{suffix}.svg"] = svg(with_pro + [("sub", tagline())], colours, VIEWS["lockup"], "lockup")
        files[f"cs{suffix}.svg"] = svg(logo.cs(), colours, VIEWS["cs"], "cs")
        files[f"c{suffix}.svg"] = svg(the_c, colours, VIEWS["c"], "c")
    for name, (margin, radius) in TILES.items():
        files[f"{name}.svg"] = svg(logo.icon(), TILE, tile_view(margin), name, tile={"fill": TILE["fill"], "radius": radius})
    for name, text in files.items():
        write(os.path.join(BRAND, name), text)
    write(os.path.join(FRONTEND, "components", "brand", "logo-art.ts"), art_module(full, the_pro, the_c))
    # The PNG icons: which tile, at what size, and where it goes.
    jobs = [
        ("tile-tab", 16, "scripts/logo/.ico-16.png"),
        ("tile-tab", 32, "scripts/logo/.ico-32.png"),
        ("tile-tab", 48, "scripts/logo/.ico-48.png"),
        ("tile-tab", 32, "app/icon.png"),
        ("tile-tab", 64, "public/favicon.png"),
        ("tile-app-square", 180, "app/apple-icon.png"),
        ("tile-app", 192, "public/brand/icon-192.png"),
        ("tile-app", 512, "public/brand/icon-512.png"),
        ("tile-maskable", 512, "public/brand/icon-maskable-512.png"),
    ]
    write(JOBS, json.dumps([{"svg": f"public/brand/{t}.svg", "size": s, "out": o} for t, s, o in jobs], indent=2))
    print(f"wrote {len(files)} SVGs to public/brand, components/brand/logo-art.ts and {len(jobs)} icon jobs")

def ico():
    """Packs the 16, 32 and 48 pixel renders into app/icon.ico."""
    from PIL import Image
    sizes = [16, 32, 48]
    images = [Image.open(os.path.join(HERE, f".ico-{s}.png")).convert("RGBA") for s in sizes]
    images[-1].save(os.path.join(FRONTEND, "app", "icon.ico"), sizes=[(s, s) for s in sizes], append_images=images[:-1])
    for s in sizes:
        os.remove(os.path.join(HERE, f".ico-{s}.png"))
    print("wrote app/icon.ico")

if __name__ == "__main__":
    ico() if "--ico" in sys.argv else build()
