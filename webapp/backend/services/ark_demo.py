"""A stand-in for ARK, the HR app, so the demo's leave dropdown has something to show.

The demo can't talk to the real ARK. Its leave records belong to real staff,
and the demo's tutors are made up. When `ARK_DEMO=1` is set, the ARK proxy
sends each request here instead, and this module answers in the same shapes
ARK uses.

Everything it returns is generated from the demo's own tutors. Each tutor gets
a few leave requests spread through the year, picked by a random generator
seeded from their id, so the same tutor shows the same leave on every page
load. Their days off come from CSM's own `tutor_rdo` table and the holidays
from CSM's `holidays` table, so the leave calendar agrees with the rest of
the demo.

Requests that visitors file, cancel, approve or reject are kept in memory
only. They last until the process restarts, which is fine for a demo that is
reset every night anyway.
"""

import os
import random
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import text

from database import SessionLocal
from models import Holiday, Tutor

ENABLED = os.getenv("ARK_DEMO") == "1"

HK = timezone(timedelta(hours=8))

LEAVE_TYPES = [
    {"id": 1, "name_en": "Annual Leave", "name_zh": "年假"},
    {"id": 2, "name_en": "Sick Leave", "name_zh": "病假"},
    {"id": 3, "name_en": "Compensatory Leave", "name_zh": "補假"},
    {"id": 4, "name_en": "Birthday Leave", "name_zh": "生日假"},
]
TYPES_BY_ID = {t["id"]: t for t in LEAVE_TYPES}
ANNUAL_DAYS = 14
SICK_DAYS = 6
REASONS = {
    1: ["家庭事務", "旅行", "私人事務", "Family trip", None],
    2: ["睇醫生", "發燒", "不適", None],
    3: ["補返考試溫習班", "補返家長會", None],
    4: ["生日", None],
}

# Changes made by visitors, keyed by request id. New requests and overtime
# records go in lists of their own.
_status_changes: dict[int, dict] = {}
_created_requests: list[dict] = []
_created_overtime: list[dict] = []


def _today() -> date:
    return datetime.now(HK).date()


def _fiscal_year(d: date) -> int:
    """ARK's year runs April to March and is named after the year it starts."""
    return d.year if d.month >= 4 else d.year - 1


def _staff(db) -> list[Tutor]:
    # Former staff keep a "resigned" prefix on their address, and ARK no
    # longer lists them.
    return [t for t in db.query(Tutor).order_by(Tutor.id).all()
            if t.role != "Guest" and t.tutor_name.split()[0] in ("Mr", "Ms", "Mrs", "Miss")
            and not t.user_email.lower().startswith("resigned")]


def _staff_by_email(db, email: str) -> Tutor:
    tutor = db.query(Tutor).filter(Tutor.user_email == email).first()
    if tutor is None or tutor.role == "Guest":
        raise HTTPException(404, detail="ARK account not linked")
    return tutor


def _generated_requests(tutor: Tutor, fy: int, reviewer: str) -> list[dict]:
    """A handful of requests for one tutor across one ARK year.

    Leave runs from the start of the year to six weeks ahead, the way staff
    really book it, and all of it is approved. One tutor in three also has a
    request waiting for approval a few weeks ahead, so an admin always has a
    few in the Pending tab.
    """
    rng = random.Random(f"ark-demo:{tutor.id}:{fy}")
    start = date(fy, 4, 1)
    today = _today()
    horizon = min(today + timedelta(days=42), date(fy + 1, 3, 31))
    span = (horizon - start).days
    out = []
    for n in range(rng.randint(3, 5) if span > 0 else 0):
        first = start + timedelta(days=rng.randint(0, span))
        # Nobody books sick leave ahead of time.
        type_id = rng.choice([1, 1, 1, 3, 4]) if first > today else rng.choice([1, 1, 1, 2, 2, 3, 4])
        half = type_id == 2 and rng.random() < 0.3
        days = 0.5 if half else (rng.choice([1, 1, 2, 3]) if type_id == 1 else 1)
        last = first + timedelta(days=max(int(days) - 1, 0))
        created = min(first - timedelta(days=rng.randint(7, 30)), today - timedelta(days=1)) if type_id != 2 else first
        out.append(_request(tutor, 1_000_000 + tutor.id * 10_000 + fy % 100 * 10 + n, type_id, first, last, days,
                            half, rng.choice(REASONS[type_id]), "approved", reviewer, created))
    if tutor.id % 3 == 0 and fy == _fiscal_year(today):
        first = today + timedelta(days=14 + tutor.id % 20)
        out.append(_request(tutor, 1_000_000 + tutor.id * 10_000 + 9_999, 1, first, first + timedelta(days=1), 2,
                            False, "旅行", "pending", None, today - timedelta(days=2)))
    return out


def _request(tutor, rid, type_id, first, last, days, half, reason, status, reviewer, created):
    return {
        "id": rid, "staff_id": tutor.id, "staff_name": tutor.tutor_name, "leave_type": TYPES_BY_ID[type_id],
        "start_date": first.isoformat(), "end_date": last.isoformat(), "days_requested": days,
        "is_half_day": half, "half_day_period": "am" if half else None, "reason": reason, "status": status,
        "reviewer_name": reviewer if status != "pending" else None,
        "created_at": datetime.combine(created, datetime.min.time()).isoformat(),
    }


def _all_requests(db, fy: int) -> list[dict]:
    staff = _staff(db)
    reviewer = next((t.tutor_name for t in staff if t.role in ("Admin", "Super Admin")), None)
    requests = [r for t in staff for r in _generated_requests(t, fy, reviewer)]
    requests += [r for r in _created_requests if _fiscal_year(date.fromisoformat(r["start_date"])) == fy]
    return [{**r, **_status_changes.get(r["id"], {})} for r in requests]


def _balances(requests: list[dict], fy: int) -> list[dict]:
    used = {t["id"]: 0.0 for t in LEAVE_TYPES}
    for r in requests:
        if r["status"] == "approved":
            used[r["leave_type"]["id"]] += float(r["days_requested"])
    entitlement = {1: ANNUAL_DAYS, 2: SICK_DAYS, 3: 2, 4: 1}
    return [{"id": t["id"], "leave_type": t, "entitlement_days": entitlement[t["id"]], "carry_over_days": 2 if t["id"] == 1 else 0,
             "used_days": used[t["id"]], "adjusted_days": 0, "year": fy} for t in LEAVE_TYPES]


def _rdo(db, tutor_id: int) -> list[dict]:
    rows = db.execute(
        text("SELECT id, day_of_week, effective_from, effective_to FROM tutor_rdo WHERE tutor_id = :t"),
        {"t": tutor_id},
    ).fetchall()
    return [{"id": r[0], "staff_id": tutor_id, "day_of_week": r[1],
             "effective_from": (r[2] or date(2020, 1, 1)).isoformat(),
             "effective_until": r[3].isoformat() if r[3] else None} for r in rows]


def _holidays(db, fy: int) -> list[dict]:
    rows = db.query(Holiday).filter(Holiday.holiday_date >= date(fy, 4, 1), Holiday.holiday_date < date(fy + 1, 4, 1)).all()
    return [{"id": h.id, "holiday_date": h.holiday_date.isoformat(), "name": h.holiday_name, "name_zh": None,
             "holiday_type": "public_holiday", "fiscal_year": fy, "notes": None} for h in rows]


def _overtime(tutor: Tutor, year: int) -> list[dict]:
    rng = random.Random(f"ark-demo-ot:{tutor.id}:{year}")
    records = []
    for n in range(rng.randint(0, 3)):
        day = date(year, 4, 1) + timedelta(days=rng.randint(0, 200))
        if day > _today():
            continue
        records.append({"id": 500000 + tutor.id * 10 + n, "staff_name": tutor.tutor_name, "date": day.isoformat(),
                        "hours": rng.choice([1, 1.5, 2, 3]), "description": rng.choice(["考試溫習班", "家長會", "Open day"]),
                        "compensation_type": "time_off", "approver_name": None, "created_at": day.isoformat()})
    return records + [o for o in _created_overtime if o["staff_name"] == tutor.tutor_name]


def handle(method: str, path: str, user_email: str, params: dict | None = None, body: dict | None = None):
    """Answer one ARK request the way ARK would."""
    params = params or {}
    db = SessionLocal()
    try:
        me = _staff_by_email(db, user_email)
        today = _today()
        fy = int(params.get("fy") or params.get("year") or _fiscal_year(today))
        parts = path.strip("/").split("/")

        if method == "GET" and path == "/me/leave-types":
            return LEAVE_TYPES
        if method == "GET" and path == "/me/leave-balances":
            return _balances([r for r in _all_requests(db, fy) if r["staff_id"] == me.id], fy)
        if method == "GET" and path == "/me/leave-requests":
            mine = [r for r in _all_requests(db, _fiscal_year(today)) if r["staff_id"] == me.id]
            return [r for r in mine if not params.get("status") or r["status"] == params["status"]]
        if method == "POST" and path == "/me/leave-requests":
            first = date.fromisoformat(body["start_date"])
            new = _request(me, 900000 + len(_created_requests), body["leave_type_id"], first,
                           date.fromisoformat(body["end_date"]), body["days_requested"], False,
                           body.get("reason"), "pending", None, today)
            _created_requests.append(new)
            return new
        if method == "PUT" and parts[:2] == ["me", "leave-requests"] and parts[-1] == "cancel":
            _status_changes[int(parts[2])] = {"status": "cancelled"}
            return next((r for r in _all_requests(db, _fiscal_year(today)) if r["id"] == int(parts[2])), None)
        if method == "GET" and path == "/me/holiday-calendar":
            return _holidays(db, fy)
        if method == "GET" and path == "/me/rdo":
            return _rdo(db, me.id)
        if method == "GET" and path == "/me/overtime":
            return _overtime(me, fy)
        if method == "POST" and path == "/me/overtime":
            new = {"id": 990000 + len(_created_overtime), "staff_name": me.tutor_name, "date": body["date"],
                   "hours": body["hours"], "description": body.get("description"), "compensation_type": "time_off",
                   "approver_name": None, "created_at": today.isoformat()}
            _created_overtime.append(new)
            return new
        if method == "GET" and path == "/leave-calendar":
            year, month = int(params["year"]), int(params["month"])
            first = date(year, month, 1)
            last = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            requests = _all_requests(db, _fiscal_year(first)) + _all_requests(db, _fiscal_year(last))
            seen = set()
            out = []
            for r in requests:
                if r["id"] in seen or r["status"] not in ("approved", "pending"):
                    continue
                if r["start_date"] <= last.isoformat() and r["end_date"] >= first.isoformat():
                    seen.add(r["id"])
                    out.append({k: r[k] for k in ("id", "staff_id", "staff_name", "start_date", "end_date",
                                                  "days_requested", "is_half_day", "half_day_period")}
                               | {"leave_type": r["leave_type"]["name_en"]})
            return out
        if method == "GET" and path == "/leave-balances-summary":
            requests = _all_requests(db, fy)
            summary = []
            for t in _staff(db):
                b = {x["leave_type"]["id"]: x for x in _balances([r for r in requests if r["staff_id"] == t.id], fy)}
                al_total = b[1]["entitlement_days"] + b[1]["carry_over_days"]
                summary.append({
                    "staff_id": t.id, "staff_name": t.tutor_name, "staff_name_zh": None, "branch_id": None,
                    "branch_code": t.default_location, "branch_name": t.default_location, "profile_photo_url": None,
                    "al_entitlement": b[1]["entitlement_days"], "al_oc": b[1]["carry_over_days"], "al_bday": 1,
                    "al_used": b[1]["used_days"], "al_remaining": al_total - b[1]["used_days"],
                    "sl_entitlement": SICK_DAYS, "sl_used": b[2]["used_days"], "sl_remaining": SICK_DAYS - b[2]["used_days"],
                })
            return summary
        if method == "GET" and path == "/leave-requests":
            requests = _all_requests(db, _fiscal_year(today))
            return [r for r in requests if not params.get("status") or r["status"] == params["status"]]
        if method == "GET" and parts[0] == "staff" and parts[-1] == "rdo":
            return _rdo(db, int(parts[1]))
        if method == "PUT" and parts[0] == "leave-requests" and parts[-1] == "review":
            _status_changes[int(parts[1])] = {"status": body["status"], "reviewer_name": me.tutor_name}
            return next((r for r in _all_requests(db, _fiscal_year(today)) if r["id"] == int(parts[1])), None)
        raise HTTPException(404, detail="Not available in the demo")
    finally:
        db.close()
