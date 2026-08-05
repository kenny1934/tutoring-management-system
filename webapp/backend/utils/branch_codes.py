"""Branch origin: which MathConcept centre an applicant came from.

Applications store the centre a parent picked as its display name, in Chinese,
while every admin surface wants the branch code. This is the one place that
maps between them, and the one place that says what may overwrite an
application's verified_branch_origin.

Shared by the summer and regular intakes deliberately: they ask the same
question on the same form and previously kept private copies of these maps,
with a comment on each asking the next person to keep them in sync.
"""
from typing import Optional

# Primary side (MathConcept Education).
PRIMARY_CENTER_NAME_TO_CODE: dict[str, str] = {
    "高士德分校": "MAC",
    "水坑尾分校": "MCP",
    "東方明珠分校": "MNT",
    "林茂塘分校": "MLT",
    "二龍喉分校": "MOT",
    "氹仔美景I分校": "MTA",
    "氹仔美景II分校": "MTR",
}

# Secondary side (MathConcept Secondary Academy). The full forms are a fallback
# for an older config that stored the unshortened name.
SECONDARY_CENTER_NAME_TO_CODE: dict[str, str] = {
    "華士古分校": "MSA",
    "二龍喉分校": "MSB",
    "MathConcept中學教室 (華士古分校)": "MSA",
    "MathConcept中學教室 (二龍喉分校)": "MSB",
}

# Derived rather than retyped, so adding a Secondary centre above is the only
# edit needed.
SECONDARY_BRANCH_CODES = frozenset(SECONDARY_CENTER_NAME_TO_CODE.values())

# verified_branch_origin value meaning "has never attended any MathConcept
# centre". Matches the summer application's vocabulary so the two intakes stay
# readable side by side.
NEW_STUDENT_ORIGIN = "New"


def resolve_claimed_branch_code(
    center_name: Optional[str], is_existing: Optional[str]
) -> Optional[str]:
    """Map a stored centre name to a branch code, using the existing-student
    category to disambiguate centres that exist on both the Primary and
    Secondary sides (currently only 二龍喉分校, which is MOT on the primary
    side and MSB on the secondary one)."""
    if not center_name:
        return None
    if is_existing == "MathConcept Secondary Academy":
        return SECONDARY_CENTER_NAME_TO_CODE.get(center_name)
    if is_existing == "MathConcept Education":
        return PRIMARY_CENTER_NAME_TO_CODE.get(center_name)
    # No category hint — try primary, then fall through to secondary.
    return (
        PRIMARY_CENTER_NAME_TO_CODE.get(center_name)
        or SECONDARY_CENTER_NAME_TO_CODE.get(center_name)
    )


def should_fill_prospect_origin(current: Optional[str], source_branch: Optional[str]) -> bool:
    """Whether a P6 prospect link may write `source_branch` onto an
    application's verified_branch_origin.

    A prospect link is evidence the applicant came from a primary branch, so it
    overrides three values:
      - unset, the ordinary case;
      - 'New', which the link now contradicts, so a returning student cannot
        keep a new-student offer they no longer qualify for;
      - MSA/MSB, which is where they landed, not where they came from. Linking
        a student record fills the origin from that student's home location, so
        by the time an admin links the prospect the origin usually already
        reads MSA. Treating that as a decision would mean the origin permanently
        records the destination for every P6 transition that enrolled first.

    An origin naming another primary branch is left alone: that is a real admin
    decision, made with information this link does not have.

    Shared by every path that can attach a prospect to a regular application
    (the detail modal, the bulk matcher, and the prospects page) so they cannot
    drift apart.
    """
    if not source_branch:
        return False
    existing = (current or "").strip()
    return (
        not existing
        or existing == NEW_STUDENT_ORIGIN
        or existing.upper() in SECONDARY_BRANCH_CODES
    )
