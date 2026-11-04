"""Signed role integration checks against isolated SQLite fixtures."""
import json
import time
import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth.gate import AuthGateMiddleware, is_public_path
from constants import today_hk
from database import get_db
from models import DebugAuditLog, Tutor
from routers import staff_home as sh

KEY = "isolated-staff-home-key-32-characters-long"
OWNER = "owner@example.com"
ADMIN = "owner@example.academy"
ACTOR = "owner@example.academy"


@pytest.fixture
def gateway(db_session, monkeypatch):
    for name, value in {"STAFF_HOME_BRIDGE_KEY": KEY, "STAFF_HOME_OWNER_EMAIL": OWNER,
                        "STAFF_HOME_ADMIN_EMAIL": ADMIN, "STAFF_HOME_ACTOR_EMAILS": OWNER+","+ACTOR}.items():
        monkeypatch.setenv(name, value)
    db_session.add_all([Tutor(id=1, user_email=ADMIN, tutor_name="Owner", role="Super Admin", default_location="A"),
                        Tutor(id=2, user_email="staff@example.academy", tutor_name="Staff", role="Tutor", default_location="B", is_active_tutor=False),
                        Tutor(id=3, user_email="former@example.academy", tutor_name="Former", role="Tutor", departure_effective_on=today_hk()-timedelta(days=2))])
    db_session.commit()
    app = FastAPI()
    app.add_middleware(AuthGateMiddleware)
    app.include_router(sh.router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: db_session
    client = TestClient(app)
    def send(action, *, actor=ACTOR, **data):
        body = sh._json({"action": action, "actor": actor, "owner": OWNER, **data})
        issued = int(time.time()*1000); nonce = str(uuid.uuid4())
        envelope = {"version": 1, "issuedAt": issued, "nonce": nonce, "body": body,
                    "signature": sh._mac(KEY, f"1\n{issued}\n{nonce}\n{body}")}
        response = client.post("/api/admin/staff-home", json=envelope)
        if response.status_code != 200:
            return {"ok": False, "status": response.status_code}
        signed = response.json()
        assert signed["signature"] == sh._mac(KEY, "response\n"+signed["payload"])
        return json.loads(signed["payload"])
    return send, db_session, client


def review(send, role="Supervisor", email="staff@example.academy"):
    source = send("read")["result"]
    return send("preview", email=email, revision=source["revision"], access={"role": role})


def test_read_filters_sensitive_fields_and_accepts_both_owner_logins(gateway):
    send, db, _ = gateway
    for actor in [OWNER, ACTOR]:
        result = send("read", actor=actor)["result"]
        assert len(result["users"]) == 3
        assert set(result["users"][0]) == {"id", "email", "name", "role", "location", "departure", "departed", "teaching"}
        assert result["users"][1]["teaching"] is False
        assert result["users"][1]["departed"] is False
        assert result["users"][2]["departed"] is True
    assert db.query(DebugAuditLog).count() == 0


def test_auth_gate_and_invalid_envelopes(gateway, monkeypatch):
    send, _, client = gateway
    assert is_public_path('/api/admin/staff-home')
    assert not is_public_path('/api/admin/staff-home/other')
    assert client.post('/api/admin/staff-home', json={}).status_code == 401
    assert client.get('/api/admin/staff-home').status_code == 405
    assert send('read', actor='other@example.com')['status'] == 403
    monkeypatch.delenv('STAFF_HOME_BRIDGE_KEY')
    assert send('read')['status'] == 503


@pytest.mark.parametrize('role,email', [('Admin', ADMIN), ('invalid', 'staff@example.academy'), ('Admin', 'missing@example.academy'), ('Admin', 'former@example.academy')])
def test_owner_roles_membership_and_departure_guards(gateway, role, email):
    send, db, _ = gateway
    assert review(send, role, email)['status'] == 400
    assert db.query(DebugAuditLog).count() == 0


def test_preview_is_read_only_and_rejects_extra_or_unchanged_fields(gateway):
    send, db, _ = gateway
    assert review(send)['ok']
    assert db.get(Tutor, 2).role == 'Tutor'
    assert review(send, 'Tutor')['status'] == 400
    source = send('read')['result']
    assert send('preview', email='staff@example.academy', revision=source['revision'], access={'role':'Admin','active':False})['status'] == 400
    assert send('preview', email='staff@example.academy', revision='old', access={'role':'Admin'})['status'] == 409


def test_atomic_save_audit_idempotency_and_status(gateway):
    send, db, _ = gateway
    r = review(send)['result'];payload={k:r[k] for k in ['token','operation']}
    saved = send('save', email='staff@example.academy', **payload)
    assert saved['ok'] and saved['result']['after']['role'] == 'Supervisor'
    tutor = db.get(Tutor, 2)
    assert tutor.default_location == 'B' and tutor.is_active_tutor is False and tutor.departure_effective_on is None
    assert send('save', email='staff@example.academy', **payload)['result']['replayed']
    status = send('status', token=r['operation'])['result'];assert status['applied']
    assert db.query(DebugAuditLog).count() == 1
    assert db.query(DebugAuditLog).one().admin_email == ACTOR
    assert not send('status', token=str(uuid.uuid4()))['result']['applied']


def test_source_change_and_review_binding_are_rechecked(gateway):
    send, db, _ = gateway
    r = review(send)['result'];payload={k:r[k] for k in ['token','operation']}
    assert send('save', email='staff@example.academy', actor=OWNER, **payload)['status'] == 403
    assert send('save', email=ADMIN, **payload)['status'] == 403
    assert send('save', email='staff@example.academy', token=r['token']+'bad', operation=r['operation'])['status'] == 400
    db.get(Tutor, 2).default_location = 'C';db.commit()
    assert send('save', email='staff@example.academy', **payload)['status'] == 409
    assert db.get(Tutor, 2).role == 'Tutor'


def test_transaction_failure_rolls_back_role_and_audit(gateway):
    send, db, _ = gateway
    r = review(send)['result']
    with patch.object(db, 'commit', side_effect=RuntimeError('isolated commit failure')):
        assert send('save', email='staff@example.academy', token=r['token'], operation=r['operation'])['status'] == 503
    assert db.get(Tutor, 2).role == 'Tutor' and db.query(DebugAuditLog).count() == 0


def test_revoked_source_admin_denies_read_and_save(gateway):
    send, db, _ = gateway
    r = review(send)['result']
    db.get(Tutor, 1).role = 'Admin';db.commit()
    assert send('read')['status'] == 403
    assert send('save', email='staff@example.academy', token=r['token'], operation=r['operation'])['status'] == 403


def test_forged_and_expired_requests_are_rejected(gateway):
    send, _, client = gateway
    body = sh._json({'action':'read','actor':ACTOR,'owner':OWNER})
    issued = int(time.time()*1000)-130000; nonce = str(uuid.uuid4())
    stale = {'version':1,'issuedAt':issued,'nonce':nonce,'body':body,'signature':sh._mac(KEY,f'1\n{issued}\n{nonce}\n{body}')}
    assert client.post('/api/admin/staff-home',json=stale).status_code == 401
    stale.update(issuedAt=int(time.time()*1000),signature='0'*64)
    assert client.post('/api/admin/staff-home',json=stale).status_code == 401
    r = review(send)['result'];payload,_ = r['token'].split('.')
    ticket = json.loads(sh.base64.urlsafe_b64decode(payload+'='*(-len(payload)%4)))
    ticket['expires'] = int(time.time()*1000)-1
    payload = sh.base64.urlsafe_b64encode(sh._json(ticket).encode()).decode().rstrip('=')
    assert send('save',email='staff@example.academy',token=payload+'.'+sh._mac(KEY,'review\n'+payload),operation=r['operation'])['status']==409
