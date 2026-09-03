"""Path normalization for courseware files.

Three representations of the same file coexist in the wild:
  raw drive-letter   'W:\\Secondary\\Finalised\\...\\file.pdf'   (AppSheet era; letter varies per machine)
  alias form         'Courseware Developer 中學\\Secondary\\...\\file.pdf'
  bracketed alias    '[Courseware Developer 中學]\\Secondary\\...\\file.pdf'

Identity comes from the ROOT FOLDER FINGERPRINT, never the drive letter:
root folder names are unique across the shares (verified 2026-07-03).
"""
import re

# Admin-defined aliases (path_alias_definitions) and the root folders that
# identify each share. Staff drives are excluded from fingerprinting: MSA and
# MSB staff drives mirror each other's root layout, so a raw staff path cannot
# be attributed to one alias safely.
ALIAS_ROOTS = {
    "Courseware Developer 中學": [
        "Secondary", "中學參考教材", "new_math7-9 Source", "10_Courseware book", "進度表",
    ],
    "Center": [
        "Courseware (Chi)", "Courseware (Eng)", "ANS", "MathConceptition",
        "Unofficial", "School Info", "DSE Mock", "Teaching Materials",
    ],
}

KNOWN_ALIASES = ["Courseware Developer 中學", "Center", "MSA Staff"]

_ROOT_TO_ALIAS = {root: alias for alias, roots in ALIAS_ROOTS.items() for root in roots}
_DRIVE_RE = re.compile(r"^[A-Za-z]:")

# Extensions the migration-036 popularity view strips when grouping. Keys
# must strip exactly this set: a blind rsplit('.') would truncate
# extensionless decimal-coded names ('903.1_Percentage_e' -> '903').
KNOWN_EXT_RE = re.compile(r"\.(pdf|docx?|jpg|xlsx|pptx)$", re.IGNORECASE)


def basename_key(name: str) -> str:
    """Lowercased basename with any known extension stripped.

    This is the join key shared by the popularity map, file dedupe and
    assignment history in the suggestions router, and by the observation
    backfill when it looks an assigned file up in the content map.
    """
    return KNOWN_EXT_RE.sub("", name or "").lower()


def _clean(raw: str) -> str:
    """Strip quotes/whitespace and unify separators to backslash."""
    s = (raw or "").strip().strip('"').strip()
    return s.replace("/", "\\")


def split_prefix(raw: str):
    """Split a path into (prefix_kind, prefix, rest).

    prefix_kind: 'alias' | 'drive' | None
    rest is the path after the prefix, without a leading backslash.
    """
    s = _clean(raw)
    if s.startswith("["):
        end = s.find("]")
        if end > 0 and s[1:end] in KNOWN_ALIASES:
            return "alias", s[1:end], s[end + 1:].lstrip("\\")
    for alias in KNOWN_ALIASES:
        if s.startswith(alias + "\\"):
            return "alias", alias, s[len(alias) + 1:]
    if _DRIVE_RE.match(s):
        return "drive", s[:2], s[2:].lstrip("\\")
    return None, "", s.lstrip("\\")


def normalize(raw: str) -> dict:
    """Normalize any path form to comparable keys.

    Returns {match_path, basename, alias, root}:
      match_path: prefix-stripped path — the join key across eras and machines
      basename:   final segment
      alias:      resolved alias if the prefix or root fingerprint identifies one
      root:       first path segment after the prefix
    """
    kind, prefix, rest = split_prefix(raw)
    segs = [p for p in rest.split("\\") if p]
    root = segs[0] if segs else ""
    alias = prefix if kind == "alias" else _ROOT_TO_ALIAS.get(root)
    return {
        "match_path": "\\".join(segs),
        "basename": segs[-1] if segs else "",
        "alias": alias,
        "root": root,
    }


def to_alias_path(raw: str) -> str | None:
    """Convert any recognizable path to canonical alias form.

    Returns None when the share cannot be identified (staff drives, personal
    paths, relative paths) — callers must not guess.
    """
    n = normalize(raw)
    if not n["alias"] or not n["match_path"]:
        return None
    return f"{n['alias']}\\{n['match_path']}"
