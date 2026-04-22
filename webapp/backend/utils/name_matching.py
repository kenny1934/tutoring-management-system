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


def name_similarity(a: str | None, b: str | None) -> int:
    """Return a 0-100 similarity score between two student names.

    Each name is split into Latin-only and CJK-only halves and compared
    script-by-script with rapidfuzz.token_sort_ratio. The best side wins.
    If the two names don't share any script in common (one pure CJK, the
    other pure Latin), returns 0 — we can't fuzzy-match across scripts.
    """
    na, nb = normalize_name(a), normalize_name(b)
    if not na or not nb:
        return 0

    a_latin, a_cjk = _split_scripts(na)
    b_latin, b_cjk = _split_scripts(nb)

    scores: list[float] = []
    if a_latin and b_latin:
        scores.append(fuzz.token_sort_ratio(a_latin, b_latin))
    if a_cjk and b_cjk:
        scores.append(fuzz.token_sort_ratio(a_cjk, b_cjk))
    if not scores:
        return 0
    return int(round(max(scores)))


# Threshold for surfacing a fuzzy-name candidate for admin review. At 85,
# real HK name variations (word-order flips, typos, missing Chinese/English
# halves) clear the bar while surname-only collisions stay well below.
NAME_CANDIDATE_THRESHOLD = 85
