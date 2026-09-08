"""Tests for the interface-event recorder.

The point of this table is to answer "did anybody actually see this" later, so
the tests care about two things above all: a key nobody allowlisted never
lands, and an event that says it should count once really does count once even
when the page sends it on every render.
"""
import pytest
from fastapi.testclient import TestClient

from constants import today_hk
from main import app
from models import FeatureEvent, Tutor
from auth.dependencies import get_current_user
from tests.helpers import make_auth_token

AUTH_COOKIE = {"access_token": make_auth_token(99)}


@pytest.fixture(autouse=True)
def _as_tutor():
    app.dependency_overrides[get_current_user] = lambda: Tutor(
        id=99, user_email="me@example.com", tutor_name="Me", role="Tutor",
        is_active_tutor=True,
    )
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _post(client, events):
    return client.post("/api/events", json={"events": events}, cookies=AUTH_COOKIE)


def test_records_allowlisted_events(client: TestClient, db_session):
    resp = _post(client, [
        {"event_key": "school_progress.shown", "entity_type": "session",
         "entity_id": 12, "context": {"school": "SRL-E"}},
        {"event_key": "school_progress.expanded", "entity_type": "session",
         "entity_id": 12},
    ])
    assert resp.status_code == 200
    assert resp.json()["recorded"] == 2
    rows = db_session.query(FeatureEvent).all()
    assert {r.event_key for r in rows} == {
        "school_progress.shown", "school_progress.expanded"}
    assert all(r.tutor_id == 99 and r.event_day is not None for r in rows)


def test_unknown_key_fails_the_batch(client: TestClient, db_session):
    resp = _post(client, [
        {"event_key": "school_progress.shown"},
        {"event_key": "school_progress.invented"},
    ])
    assert resp.status_code == 400
    assert "school_progress.invented" in resp.json()["detail"]
    assert db_session.query(FeatureEvent).count() == 0


def test_dedupe_key_lands_once(client: TestClient, db_session):
    event = {"event_key": "school_progress.shown", "dedupe_key": "sp-shown:12"}
    assert _post(client, [event]).json()["recorded"] == 1
    assert _post(client, [event]).json()["recorded"] == 0
    assert db_session.query(FeatureEvent).count() == 1
    # The tutor and the office's day are added server-side, so one person
    # cannot suppress another's event by guessing their key, and "once a day"
    # does not depend on the browser's clock.
    stored = db_session.query(FeatureEvent).first()
    assert stored.dedupe_key == f"99:sp-shown:12:{today_hk().isoformat()}"


def test_undeduped_events_repeat(client: TestClient, db_session):
    event = {"event_key": "school_progress.answered_unsure"}
    _post(client, [event])
    _post(client, [event])
    assert db_session.query(FeatureEvent).count() == 2


def test_batch_size_is_capped(client: TestClient):
    resp = _post(client, [{"event_key": "school_progress.shown"}] * 21)
    assert resp.status_code == 422
