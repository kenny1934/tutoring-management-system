"""Resolving free-text school names to canonical staff school codes.

The application form's school field is free text, and the same school arrives
under many spellings (the biggest feeder alone shows up under about a dozen).
The school_aliases table maps every folded spelling to the code vocabulary the
students table already uses, and this module is the one place that folding and
mapping happen. Anything that groups, counts or matches schools should go
through resolve() rather than comparing raw strings.

A target in the table takes one of three forms:

    CODE            The spelling always means that school, e.g. "PCMS".
    FAM|stream      A school with separate Chinese and English sections, where
                    the spelling does not say which one. The application's
                    lang_stream decides: C gives FAM-C, E gives FAM-E, and Int
                    also gives FAM-E because international families at these
                    schools sit in the English section. A missing stream falls
                    back to the bare family code so the row still groups
                    sensibly.
    CODE|int:OTHER  The Int stream redirects to an international section or
                    campus (e.g. "KYS|int:KYIS"); any other stream gives the
                    base code.

Sections are separate schools throughout: SRL-C and SRL-E are two schools,
matching how the students table records them. A spelling with no alias row
resolves to None and stays visible as unrecognised, because guessing would be
worse than admitting we do not know; staff assign new spellings through the
admin UI.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from models import SchoolAlias
from utils.ttl_cache import TTLCache

# Aliases change only when staff assign a new spelling, and a minute of
# staleness there is harmless. Cloud Run runs several processes, so nothing
# may rely on clearing this cache on write; expiry alone keeps it honest.
_cache = TTLCache(ttl_seconds=60, maxsize=1)
_CACHE_KEY = "alias_map"


def fold(s: Optional[str]) -> str:
    """The one folding rule for school spellings.

    Trims, collapses every whitespace run to a single space (str.split with no
    arguments also swallows full-width spaces, which appear in real answers),
    and casefolds. Alias keys are stored already folded, so folding the input
    is all a lookup needs.
    """
    return " ".join((s or "").split()).casefold()


def is_valid_target(target: str) -> bool:
    """Whether a target string parses under the grammar above.

    Used by the seed sanity test and by the endpoint that lets staff add
    aliases, so a typo cannot put an uninterpretable row in the table.
    """
    if not target or len(target) > 64:
        return False
    if "|" not in target:
        return True
    base, mod = target.split("|", 1)
    if not base or "|" in mod:
        return False
    return mod == "stream" or (mod.startswith("int:") and bool(mod[4:]))


def clear_cache() -> None:
    """Forget the cached map in this process.

    The write path calls it so the instance that served an assignment shows
    the spelling as recognised straight away; other instances wait out the
    TTL, which is the designed behaviour rather than something to fix.
    """
    _cache.clear()


def get_alias_map(db: Session) -> dict[str, str]:
    """The full alias table as {alias_key: target}, cached for a minute."""
    cached = _cache.get(_CACHE_KEY)
    if cached is not None:
        return cached
    aliases = dict(db.query(SchoolAlias.alias_key, SchoolAlias.target).all())
    _cache.set(_CACHE_KEY, aliases)
    return aliases


def resolve(
    raw_school: Optional[str],
    lang_stream: Optional[str],
    aliases: dict[str, str],
) -> Optional[str]:
    """The canonical school code for a typed school name, or None if unmapped.

    lang_stream is the application's own form value (C, E or Int); it only
    matters for the two modified target forms.
    """
    key = fold(raw_school)
    if not key:
        return None
    target = aliases.get(key)
    if target is None or "|" not in target:
        return target
    base, mod = target.split("|", 1)
    stream = (lang_stream or "").strip()
    if mod == "stream":
        if stream == "C":
            return f"{base}-C"
        if stream in ("E", "Int"):
            return f"{base}-E"
        return base
    if mod.startswith("int:") and mod[4:]:
        return mod[4:] if stream == "Int" else base
    # An uninterpretable modifier cannot reach the table through the seed or
    # the endpoint, but if one ever does, the family code is still the school.
    return base
