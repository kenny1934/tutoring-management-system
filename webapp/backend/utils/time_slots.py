"""Parse class times once and keep stored ranges in HH:MM - HH:MM form."""
import re
from typing import Annotated

from pydantic import AfterValidator
from sqlalchemy import func

_RANGE = re.compile(r"\s*([0-9]{1,2}):([0-9]{2})\s*-\s*([0-9]{1,2}):([0-9]{2})\s*")


def normalise_time_slot(value: str) -> str:
    match = _RANGE.fullmatch(value)
    if match:
        sh, sm, eh, em = map(int, match.groups())
        if sh < 24 and eh < 24 and sm < 60 and em < 60 and (sh, sm) < (eh, em):
            return f"{sh:02}:{sm:02} - {eh:02}:{em:02}"
    raise ValueError("Enter a valid start and end time. End time must be after start time.")


def time_slot_key(value: str | None) -> str | None:
    """Compare valid ranges consistently, while preserving legacy labels."""
    if value is None:
        return None
    try:
        return normalise_time_slot(value).replace(" ", "")
    except ValueError:
        return value


def same_time_slot(left: str | None, right: str | None) -> bool:
    return time_slot_key(left) == time_slot_key(right)


def time_slot_matches(column, value: str):
    """Tolerate legacy separator spaces in persisted ranges during lookups."""
    return func.replace(column, " ", "") == time_slot_key(value)


def _enrollment_time(value: str) -> str:
    # Summer payment forms can resend this existing schedule summary.
    if value == "Various":
        return value
    return normalise_time_slot(value)


TimeSlot = Annotated[str, AfterValidator(normalise_time_slot)]
EnrollmentTimeSlot = Annotated[str, AfterValidator(_enrollment_time)]
