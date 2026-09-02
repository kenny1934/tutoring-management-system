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


def _parse_target(target: str) -> Optional[tuple[str, Optional[str]]]:
    """(base, modifier) when the target parses under the grammar above,
    None when it does not. The modifier is the raw text after the bar
    ("stream" or "int:OTHER") or None for a plain code. The validator and
    the resolver both read the grammar through here, so a new target form
    is a one-place change.
    """
    if not target or len(target) > 64:
        return None
    if "|" not in target:
        return target, None
    base, mod = target.split("|", 1)
    if not base or "|" in mod:
        return None
    if mod == "stream" or (mod.startswith("int:") and mod[4:]):
        return base, mod
    return None


def is_valid_target(target: str) -> bool:
    """Whether a target string parses under the grammar above.

    Used by the seed sanity test and by the endpoint that lets staff add
    aliases, so a typo cannot put an uninterpretable row in the table.
    """
    return _parse_target(target) is not None


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
    if target is None:
        return None
    parsed = _parse_target(target)
    if parsed is None:
        # Rows arrive through is_valid_target, so an unparseable one was
        # edited by hand; whatever sits before the bar is still the school.
        return target.split("|", 1)[0]
    base, mod = parsed
    if mod is None:
        return base
    stream = (lang_stream or "").strip()
    if mod == "stream":
        if stream == "C":
            return f"{base}-C"
        if stream in ("E", "Int"):
            return f"{base}-E"
        return base
    return mod[4:] if stream == "Int" else base


def group_key(
    raw_school: Optional[str],
    lang_stream: Optional[str],
    aliases: dict[str, str],
) -> Optional[str]:
    """The grouping key every school-aware surface shares.

    The canonical code when the alias table recognises the spelling, so
    variants of one school group (and count as schoolmates) together; the
    folded raw spelling otherwise, which keeps two identically-typed unknown
    schools matching each other; None when the field is empty. Resolution
    uses the form's own lang_stream because that is what picks the section
    of a sectioned school. The frontend's schoolGroupKey applies the same
    rule using the school_canonical the wire carries.
    """
    return resolve(raw_school, lang_stream, aliases) or fold(raw_school) or None
