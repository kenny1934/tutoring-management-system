"""Claimed-centre name to branch code.

Applications store the centre a parent picked as its display name, in Chinese.
Every admin surface wants the branch code instead, so this is the one place
that maps between them.

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
