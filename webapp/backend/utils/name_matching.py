"""Student-name similarity helpers for prospect/application linking.

Names in the DB are a mix of Romanized English ("Chan Tai Man"), CJK
("陳大文"), and combined forms ("Adaliz LAM 林梓喬"). We compare each
script independently so a prospect that wrote both English and Chinese
still matches an app that only entered one side — while two different
given names sharing only a common HK surname ("Adaliz Lam" vs "Kelly
Lam") never scores high.

Why not rapidfuzz.WRatio: its internal partial_ratio treats a surname
substring as a 100% hit and inflates the composite score, producing
false positives on common HK surnames (Lam/Chan/Wong etc.).
"""

from __future__ import annotations

import re

from rapidfuzz import fuzz

# Non-alphanumeric, non-CJK runs collapse to a single space. Keeping CJK in
# the class means multi-char Chinese names stay intact during normalization.
_KEEP_RE = re.compile(r"[^\w一-鿿]+", re.UNICODE)


def normalize_name(name: str | None) -> str:
    if not name:
        return ""
    lowered = name.lower().strip()
    collapsed = _KEEP_RE.sub(" ", lowered)
    return re.sub(r"\s+", " ", collapsed).strip()


def _split_scripts(normalized: str) -> tuple[str, str]:
    """Partition tokens into Latin-only and CJK-only halves."""
    latin_tokens = []
    cjk_tokens = []
    for tok in normalized.split():
        if tok.isascii():
            latin_tokens.append(tok)
        else:
            cjk_tokens.append(tok)
    return " ".join(latin_tokens), " ".join(cjk_tokens)


# Per-token fuzzy-match bar for the containment signal. 88 tolerates minor
# typos ("Alex" vs "Alix") without letting different given names
# of the same length bleed into each other.
_CONTAINMENT_TOKEN_THRESHOLD = 88

# Score returned when the shorter name's tokens are fully contained in the
# longer name's tokens. Above the 85 candidate threshold so it surfaces,
# but deliberately below 100 — it's a subset match, not an exact match.
_CONTAINMENT_SCORE = 92


def _containment_score(short_tokens: list[str], long_tokens: list[str]) -> int:
    """Score a name pair when the shorter side's tokens all appear in the longer.

    Each shorter token must fuzzy-match (>= _CONTAINMENT_TOKEN_THRESHOLD) a
    distinct longer token — so "Alex Wong" maps cleanly onto "Wong Tai Man Alex" (both tokens found). Requires at least 2 matched tokens to
    avoid surname-only collisions ("Lam" matching every Lam in the pool).
    Returns 0 when the rule doesn't apply.
    """
    if len(short_tokens) < 2 or len(long_tokens) < len(short_tokens):
        return 0
    used: set[int] = set()
    for t in short_tokens:
        best_score = -1
        best_idx = -1
        for i, lt in enumerate(long_tokens):
            if i in used:
                continue
            s = fuzz.ratio(t, lt)
            if s >= _CONTAINMENT_TOKEN_THRESHOLD and s > best_score:
                best_score, best_idx = s, i
        if best_idx < 0:
            return 0
        used.add(best_idx)
    return _CONTAINMENT_SCORE


def _script_similarity(a: str, b: str) -> float:
    """Score one script-side: max of token_sort_ratio and containment signal."""
    sort_score = fuzz.token_sort_ratio(a, b)
    a_tokens, b_tokens = a.split(), b.split()
    short, long = (a_tokens, b_tokens) if len(a_tokens) <= len(b_tokens) else (b_tokens, a_tokens)
    return max(sort_score, _containment_score(short, long))


def name_similarity(a: str | None, b: str | None) -> int:
    """Return a 0-100 similarity score between two student names.

    Each name is split into Latin-only and CJK-only halves and compared
    script-by-script. Per side we take the max of token_sort_ratio (handles
    word-order flips and typos) and a token-containment signal (handles
    "Alex Wong" being a compact form of "Wong Tai Man Alex"). The
    best side wins. If the two names don't share any script in common (one
    pure CJK, the other pure Latin), returns 0.
    """
    na, nb = normalize_name(a), normalize_name(b)
    if not na or not nb:
        return 0

    a_latin, a_cjk = _split_scripts(na)
    b_latin, b_cjk = _split_scripts(nb)

    scores: list[float] = []
    if a_latin and b_latin:
        scores.append(_script_similarity(a_latin, b_latin))
    if a_cjk and b_cjk:
        scores.append(_script_similarity(a_cjk, b_cjk))
    if not scores:
        return 0
    return int(round(max(scores)))


# Threshold for surfacing a fuzzy-name candidate for admin review. At 85,
# real HK name variations (word-order flips, typos, missing Chinese/English
# halves) clear the bar while surname-only collisions stay well below.
NAME_CANDIDATE_THRESHOLD = 85
