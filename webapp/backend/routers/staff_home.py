"""Narrow signed Staff Home role administration for existing CSM identities.

Disabled until all STAFF_HOME_* configuration is present. This endpoint never
provisions tutors, changes employment, teaching, salary or branch arrangements.
"""
import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from auth.dependencies import VALID_ROLES
from database import get_db
from models import DebugAuditLog, Tutor
from utils.employment import has_departed

router = APIRouter()


def _json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _mac(key, value):
    return hmac.new(key.encode(), value.encode(), hashlib.sha256).hexdigest()


def _fail(code, message):
    raise HTTPException(code, message)


@dataclass
class Verified:
    key: str
    data: dict
    admin_email: str


async def verify_request(request: Request) -> Verified:
    key = os.getenv("STAFF_HOME_BRIDGE_KEY", "")
    owner = os.getenv("STAFF_HOME_OWNER_EMAIL", "")
    admin = os.getenv("STAFF_HOME_ADMIN_EMAIL", "")
    actors = os.getenv("STAFF_HOME_ACTOR_EMAILS", "").split(",")
    if len(key) < 32 or not owner or not admin or not any(actors):
        _fail(503, "Staff Home role administration is not configured.")
    raw = await request.body()
    if len(raw) > 24000:
        _fail(401, "Unauthorised")
    try:
        env = json.loads(raw)
        if set(env) != {"version", "issuedAt", "nonce", "body", "signature"}:
            raise ValueError()
        if type(env["version"]) is not int or env["version"] != 1 or type(env["issuedAt"]) is not int or abs(time.time()*1000-env["issuedAt"]) > 120000:
            raise ValueError()
        uuid.UUID(env["nonce"])
        if not isinstance(env["body"], str) or not isinstance(env["signature"], str):
            raise ValueError()
        signed = f"1\n{env['issuedAt']}\n{env['nonce']}\n{env['body']}"
        if not hmac.compare_digest(env["signature"], _mac(key, signed)):
            raise ValueError()
        data = json.loads(env["body"])
        if not isinstance(data, dict):
            raise ValueError()
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail(401, "Unauthorised")
    if data.get("owner") != owner or data.get("actor") not in actors:
        _fail(403, "Administrator identity is not allowed.")
    if set(data)-{"action", "owner", "actor", "email", "name", "revision", "access", "token", "operation"}:
        _fail(400, "Unsupported request fields.")
    if data.get("action") not in {"read", "preview", "save", "status"}:
        _fail(400, "Unsupported action.")
    return Verified(key, data, admin)


def _user(tutor):
    return {"id": tutor.id, "email": tutor.user_email.strip().lower(), "name": tutor.tutor_name,
            "role": tutor.role, "location": tutor.default_location,
            "departure": tutor.departure_effective_on.isoformat() if tutor.departure_effective_on else None,
            "departed": has_departed(tutor), "teaching": bool(tutor.is_active_tutor)}


def _state(db):
    # A fresh locking read also sees concurrent changes from the existing admin
    # tools on MySQL's repeatable-read isolation. Ordered locks avoid deadlocks
    # between bridge calls, and serialize role saves across Cloud Run instances.
    rows = db.query(Tutor).order_by(Tutor.id).with_for_update().populate_existing().all()
    users = [_user(t) for t in rows]
    return rows, users, hashlib.sha256(_json(users).encode()).hexdigest()


def _audit(db, operation):
    try:
        uuid.UUID(operation)
    except (ValueError, TypeError, AttributeError):
        _fail(400, "Review the change before saving.")
    return db.query(DebugAuditLog).filter(DebugAuditLog.table_name == "staff_home:"+operation).first()


def _outcome(log, operation):
    return {"operation": operation, "applied": True,
            "before": json.loads(log.before_state), "after": json.loads(log.after_state)}


def _validate(rows, existing, role, admin_email):
    if not existing:
        _fail(400, "No CSM Pro account matches this email. Create or link its account in CSM Pro first.")
    if has_departed(existing):
        _fail(400, "Employment has ended. Manage employment in its source before changing this role.")
    if role not in VALID_ROLES:
        _fail(400, "Choose a supported CSM Pro role.")
    if existing.user_email.strip().lower() == admin_email and role != "Super Admin":
        _fail(400, "The connected administrator must remain a Super Admin.")
    if not any(t.role == "Super Admin" and not has_departed(t) for t in rows if t.id != existing.id) and role != "Super Admin" and existing.role == "Super Admin":
        _fail(400, "Keep at least one active Super Admin.")


def act(db: Session, verified: Verified):
    data, key = verified.data, verified.key
    rows, users, revision = _state(db)
    admin = next((t for t in rows if t.user_email.strip().lower() == verified.admin_email), None)
    if not admin or admin.role != "Super Admin" or has_departed(admin):
        _fail(403, "The connected CSM Pro administrator is not active.")
    action = data["action"]
    if action == "read":
        return {"revision": revision, "users": users, "roles": list(VALID_ROLES)}
    if action == "status":
        log = _audit(db, data.get("token"))
        return _outcome(log, data["token"]) if log else {"operation": data["token"], "applied": False}
    email = data.get("email")
    existing = next((t for t in rows if t.user_email.strip().lower() == email), None)
    if action == "preview":
        if data.get("revision") != revision:
            _fail(409, "CSM Pro permissions changed. Reload before reviewing.")
        access = data.get("access")
        if not isinstance(access, dict) or set(access) != {"role"}:
            _fail(400, "Only the CSM Pro role can be changed here.")
        _validate(rows, existing, access["role"], verified.admin_email)
        before = _user(existing)
        after = {**before, "role": access["role"]}
        if before == after:
            _fail(400, "No CSM Pro settings changed.")
        ticket = {"operation": str(uuid.uuid4()), "actor": data["actor"], "email": email,
                  "revision": revision, "before": before, "after": after, "expires": int(time.time()*1000)+300000}
        encoded = base64.urlsafe_b64encode(_json(ticket).encode()).decode().rstrip("=")
        return {"operation": ticket["operation"], "before": before, "after": after,
                "token": encoded+"."+_mac(key, "review\n"+encoded)}
    try:
        token = data["token"]
        if not isinstance(token, str) or len(token) > 8000:
            raise ValueError()
        payload, sig = token.split(".")
        if not hmac.compare_digest(sig, _mac(key, "review\n"+payload)):
            raise ValueError()
        ticket = json.loads(base64.urlsafe_b64decode(payload+"="*(-len(payload)%4)))
    except (ValueError, KeyError, TypeError):
        _fail(400, "Review the change before saving.")
    if ticket["actor"] != data["actor"] or ticket["email"] != email or ticket["operation"] != data.get("operation"):
        _fail(403, "The reviewed change belongs to a different request.")
    log = _audit(db, ticket["operation"])
    if log:
        return {**_outcome(log, ticket["operation"]), "replayed": True}
    if ticket["expires"] < time.time()*1000 or ticket["revision"] != revision:
        _fail(409, "CSM Pro permissions changed or the review expired. Review again.")
    _validate(rows, existing, ticket["after"]["role"], verified.admin_email)
    existing.role = ticket["after"]["role"]
    db.add(DebugAuditLog(admin_id=admin.id, admin_email=data["actor"], operation="STAFF_HOME_ROLE",
                         table_name="staff_home:"+ticket["operation"], row_id=existing.id,
                         before_state=_json(ticket["before"]), after_state=_json(ticket["after"]),
                         changed_fields=_json(["role"])))
    db.commit()
    return {"operation": ticket["operation"], "applied": True, "before": ticket["before"], "after": ticket["after"], "replayed": False}


@router.post("/admin/staff-home")
def staff_home(verified: Verified = Depends(verify_request), db: Session = Depends(get_db)):
    try:
        result = {"ok": True, "result": act(db, verified)}
    except HTTPException as error:
        db.rollback()
        result = {"ok": False, "status": error.status_code, "error": error.detail}
    except Exception:
        db.rollback()
        result = {"ok": False, "status": 503, "error": "CSM Pro could not complete this request. Reload before trying again."}
    finally:
        # Read/review/status acquire row locks but never write or retain them.
        db.rollback()
    payload = _json(result)
    return JSONResponse({"payload": payload, "signature": _mac(verified.key, "response\n"+payload)})
