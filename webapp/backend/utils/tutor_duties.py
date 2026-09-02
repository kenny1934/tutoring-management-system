"""Tutor duty roster reads and writes, shared by both intakes.

Summer and Regular keep separate duty tables so each can foreign-key its own
config table, but the roster behaves identically on both sides: list every
duty for a config and branch, and replace the whole set in one save. The
duty model is passed in so the same two operations serve either table.
"""

from sqlalchemy.orm import Session, joinedload

from schemas import TutorDutyBulkSet, TutorDutyResponse


def list_duties(db: Session, model, config_id: int, location: str) -> list[TutorDutyResponse]:
    """Every duty recorded for this config and branch, tutor name joined."""
    duties = (
        db.query(model)
        .options(joinedload(model.tutor))
        .filter(model.config_id == config_id, model.location == location)
        .all()
    )
    return [
        TutorDutyResponse(
            id=d.id,
            config_id=d.config_id,
            tutor_id=d.tutor_id,
            tutor_name=d.tutor.tutor_name if d.tutor else "",
            location=d.location,
            duty_day=d.duty_day,
            time_slot=d.time_slot,
        )
        for d in duties
    ]


def replace_duties(db: Session, model, data: TutorDutyBulkSet) -> dict:
    """Swap this config+branch's whole roster for the given set.

    The modal always posts the complete grid, so a delete-then-insert keeps
    the stored roster and the admin's ticks in step without diffing.
    """
    db.query(model).filter(
        model.config_id == data.config_id,
        model.location == data.location,
    ).delete()

    for item in data.duties:
        db.add(model(
            config_id=data.config_id,
            tutor_id=item.tutor_id,
            location=data.location,
            duty_day=item.duty_day,
            time_slot=item.time_slot,
        ))

    db.commit()
    return {"success": True, "count": len(data.duties)}
