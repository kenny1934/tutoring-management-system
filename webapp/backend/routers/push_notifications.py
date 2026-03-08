"""Web Push notification endpoints — subscribe, unsubscribe, and push delivery."""

import asyncio
import os
import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pywebpush import webpush, WebPushException

from database import get_db, SessionLocal
from models import PushSubscription, Tutor
from auth.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@mathconceptsecondary.academy")


# --- Schemas ---

class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str

class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys


# --- Endpoints ---

@router.get("/push/vapid-key")
def get_vapid_public_key():
    """Return the VAPID public key for the frontend to subscribe."""
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Web Push not configured")
    return {"publicKey": VAPID_PUBLIC_KEY}


@router.post("/push/subscribe", status_code=201)
def subscribe_push(
    body: PushSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    """Save or update a push subscription for the current user."""
    existing = db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint
    ).first()

    if existing:
        # Update keys (browser may regenerate them)
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
        existing.tutor_id = current_user.id
    else:
        db.add(PushSubscription(
            tutor_id=current_user.id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
        ))

    db.commit()
    return {"ok": True}


@router.delete("/push/subscribe")
def unsubscribe_push(
    body: PushSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    """Remove a push subscription."""
    db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint,
        PushSubscription.tutor_id == current_user.id,
    ).delete()
    db.commit()
    return {"ok": True}


# --- Push delivery helper (called from messages.py) ---

def _send_push_sync(tutor_ids: List[int], payload: dict):
    """Send Web Push notifications in a background thread with its own DB session.
    Silently removes expired/invalid subscriptions (HTTP 410)."""
    db = SessionLocal()
    try:
        subs = db.query(PushSubscription).filter(
            PushSubscription.tutor_id.in_(tutor_ids)
        ).all()

        if not subs:
            return

        data = json.dumps(payload)
        expired_ids = []

        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=data,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": VAPID_SUBJECT},
                    timeout=5,
                )
            except WebPushException as e:
                if e.response and e.response.status_code in (404, 410):
                    expired_ids.append(sub.id)
                else:
                    logger.warning("Web Push failed for sub %s: %s", sub.id, e)
            except Exception as e:
                logger.warning("Web Push error for sub %s: %s", sub.id, e)

        if expired_ids:
            db.query(PushSubscription).filter(PushSubscription.id.in_(expired_ids)).delete(synchronize_session=False)
            db.commit()
    except Exception as e:
        logger.error("Push delivery error: %s", e)
    finally:
        db.close()


def send_push_to_tutors(tutor_ids: List[int], payload: dict):
    """Fire-and-forget push delivery in a thread pool (non-blocking)."""
    if not VAPID_PRIVATE_KEY or not tutor_ids:
        return
    try:
        loop = asyncio.get_running_loop()
        loop.run_in_executor(None, _send_push_sync, tutor_ids, payload)
    except RuntimeError:
        # No running loop — call synchronously (e.g., in tests)
        _send_push_sync(tutor_ids, payload)
