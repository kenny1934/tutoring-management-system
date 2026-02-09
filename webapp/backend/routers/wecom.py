"""
WeCom webhook messaging router.
Sends messages to WeCom groups via group robot webhooks.
"""

import base64
import hashlib
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_admin_write, require_admin_view
from constants import hk_now
from database import get_db
from models import Tutor, WecomWebhook, WecomMessageLog
from schemas import (
    WecomWebhookResponse,
    WecomWebhookAdminResponse,
    WecomWebhookUpdate,
    WecomSendRequest,
    WecomSendResponse,
    WecomMessageLogResponse,
)
from services.image_storage import resize_and_compress_image

router = APIRouter()
logger = logging.getLogger(__name__)

WECOM_WEBHOOK_TIMEOUT = 10  # seconds
WECOM_IMAGE_MAX_SIZE = 2 * 1024 * 1024  # 2MB limit for WeCom image messages


def _is_placeholder(url: str) -> bool:
    """Check if webhook URL is still a placeholder."""
    return not url or url.startswith("PLACEHOLDER")


# ============================================
# Webhook Management
# ============================================

@router.get("/wecom/webhooks", response_model=list[WecomWebhookResponse])
async def list_webhooks(
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(require_admin_view),
):
    """List all configured WeCom webhooks (URL masked)."""
    webhooks = db.query(WecomWebhook).order_by(WecomWebhook.webhook_name).all()
    results = []
    for wh in webhooks:
        results.append(WecomWebhookResponse(
            id=wh.id,
            webhook_name=wh.webhook_name,
            target_description=wh.target_description,
            is_active=wh.is_active,
            last_used_at=wh.last_used_at,
            total_messages_sent=wh.total_messages_sent,
            notes=wh.notes,
            webhook_url_configured=not _is_placeholder(wh.webhook_url),
        ))
    return results


@router.get("/wecom/webhooks/{webhook_id}", response_model=WecomWebhookAdminResponse)
async def get_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(require_admin_write),
):
    """Get webhook details including full URL (admin only)."""
    wh = db.query(WecomWebhook).filter(WecomWebhook.id == webhook_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return WecomWebhookAdminResponse(
        id=wh.id,
        webhook_name=wh.webhook_name,
        webhook_url=wh.webhook_url,
        target_description=wh.target_description,
        is_active=wh.is_active,
        last_used_at=wh.last_used_at,
        total_messages_sent=wh.total_messages_sent,
        notes=wh.notes,
        webhook_url_configured=not _is_placeholder(wh.webhook_url),
    )


@router.put("/wecom/webhooks/{webhook_id}", response_model=WecomWebhookAdminResponse)
async def update_webhook(
    webhook_id: int,
    update: WecomWebhookUpdate,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(require_admin_write),
):
    """Update webhook configuration (admin only)."""
    wh = db.query(WecomWebhook).filter(WecomWebhook.id == webhook_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook not found")

    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(wh, field, value)

    db.commit()
    db.refresh(wh)
    logger.info("Webhook %s updated by %s", wh.webhook_name, current_user.user_email)

    return WecomWebhookAdminResponse(
        id=wh.id,
        webhook_name=wh.webhook_name,
        webhook_url=wh.webhook_url,
        target_description=wh.target_description,
        is_active=wh.is_active,
        last_used_at=wh.last_used_at,
        total_messages_sent=wh.total_messages_sent,
        notes=wh.notes,
        webhook_url_configured=not _is_placeholder(wh.webhook_url),
    )


# ============================================
# Send Message
# ============================================

@router.post("/wecom/send", response_model=WecomSendResponse)
async def send_message(
    payload: WecomSendRequest,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(require_admin_write),
):
    """
    Send a message to a WeCom group via webhook.

    Supports text and markdown message types.
    """
    # Look up webhook
    webhook = db.query(WecomWebhook).filter(
        WecomWebhook.webhook_name == payload.webhook_name
    ).first()

    if not webhook:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook '{payload.webhook_name}' not found",
        )

    if not webhook.is_active:
        raise HTTPException(
            status_code=400,
            detail=f"Webhook '{payload.webhook_name}' is disabled",
        )

    if _is_placeholder(webhook.webhook_url):
        raise HTTPException(
            status_code=400,
            detail=f"Webhook '{payload.webhook_name}' URL not configured yet",
        )

    # Build WeCom message payload
    if payload.msg_type == "markdown":
        wecom_payload = {
            "msgtype": "markdown",
            "markdown": {"content": payload.content},
        }
    else:
        wecom_payload = {
            "msgtype": "text",
            "text": {"content": payload.content},
        }

    # Create log entry
    log_entry = WecomMessageLog(
        webhook_name=payload.webhook_name,
        message_type=payload.msg_type,
        message_content=payload.content,
        send_status="pending",
    )
    db.add(log_entry)
    db.flush()  # Get the ID

    # Send to WeCom
    try:
        async with httpx.AsyncClient(timeout=WECOM_WEBHOOK_TIMEOUT) as client:
            response = await client.post(webhook.webhook_url, json=wecom_payload)
            response_data = response.json()

        errcode = response_data.get("errcode", -1)
        errmsg = response_data.get("errmsg", "unknown")

        if errcode == 0:
            log_entry.send_status = "sent"
            log_entry.send_timestamp = hk_now()
            webhook.last_used_at = hk_now()
            webhook.total_messages_sent = (webhook.total_messages_sent or 0) + 1
            db.commit()

            logger.info(
                "WeCom message sent to %s by %s",
                payload.webhook_name,
                current_user.user_email,
            )

            return WecomSendResponse(
                success=True,
                message="Message sent successfully",
                log_id=log_entry.id,
                wecom_errcode=errcode,
                wecom_errmsg=errmsg,
            )
        else:
            log_entry.send_status = "failed"
            log_entry.send_timestamp = hk_now()
            log_entry.error_message = f"errcode={errcode}, errmsg={errmsg}"
            db.commit()

            logger.warning(
                "WeCom send failed for %s: errcode=%s errmsg=%s",
                payload.webhook_name, errcode, errmsg,
            )

            return WecomSendResponse(
                success=False,
                message=f"WeCom rejected the message: {errmsg}",
                log_id=log_entry.id,
                wecom_errcode=errcode,
                wecom_errmsg=errmsg,
            )

    except httpx.TimeoutException:
        log_entry.send_status = "failed"
        log_entry.send_timestamp = hk_now()
        log_entry.error_message = "Request timed out"
        db.commit()

        logger.error("WeCom webhook timeout for %s", payload.webhook_name)
        return WecomSendResponse(
            success=False,
            message="Request to WeCom timed out",
            log_id=log_entry.id,
        )

    except Exception as e:
        log_entry.send_status = "failed"
        log_entry.send_timestamp = hk_now()
        log_entry.error_message = str(e)
        db.commit()

        logger.error("WeCom send error for %s: %s", payload.webhook_name, e)
        return WecomSendResponse(
            success=False,
            message=f"Failed to send message: {str(e)}",
            log_id=log_entry.id,
        )


@router.post("/wecom/send-image", response_model=WecomSendResponse)
async def send_image(
    file: UploadFile = File(...),
    webhook_name: str = Query(..., description="Target webhook name"),
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(require_admin_write),
):
    """
    Send an image to a WeCom group via webhook.

    The image is resized/compressed to fit WeCom's 2MB limit,
    then sent as base64-encoded data with MD5 hash.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Look up webhook
    webhook = db.query(WecomWebhook).filter(
        WecomWebhook.webhook_name == webhook_name
    ).first()

    if not webhook:
        raise HTTPException(status_code=404, detail=f"Webhook '{webhook_name}' not found")
    if not webhook.is_active:
        raise HTTPException(status_code=400, detail=f"Webhook '{webhook_name}' is disabled")
    if _is_placeholder(webhook.webhook_url):
        raise HTTPException(status_code=400, detail=f"Webhook '{webhook_name}' URL not configured yet")

    # Read and process image
    contents = await file.read()
    try:
        processed = resize_and_compress_image(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")

    if len(processed) > WECOM_IMAGE_MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large after compression ({len(processed) // 1024}KB). WeCom limit is 2MB.",
        )

    # Convert to base64 and compute MD5
    image_base64 = base64.b64encode(processed).decode("utf-8")
    image_md5 = hashlib.md5(processed).hexdigest()

    wecom_payload = {
        "msgtype": "image",
        "image": {
            "base64": image_base64,
            "md5": image_md5,
        },
    }

    # Create log entry
    log_entry = WecomMessageLog(
        webhook_name=webhook_name,
        message_type="image",
        message_content=f"[Image: {file.filename or 'unnamed'}, {len(processed) // 1024}KB]",
        send_status="pending",
    )
    db.add(log_entry)
    db.flush()

    # Send to WeCom
    try:
        async with httpx.AsyncClient(timeout=WECOM_WEBHOOK_TIMEOUT) as client:
            response = await client.post(webhook.webhook_url, json=wecom_payload)
            response_data = response.json()

        errcode = response_data.get("errcode", -1)
        errmsg = response_data.get("errmsg", "unknown")

        if errcode == 0:
            log_entry.send_status = "sent"
            log_entry.send_timestamp = hk_now()
            webhook.last_used_at = hk_now()
            webhook.total_messages_sent = (webhook.total_messages_sent or 0) + 1
            db.commit()

            logger.info("WeCom image sent to %s by %s", webhook_name, current_user.user_email)

            return WecomSendResponse(
                success=True,
                message="Image sent successfully",
                log_id=log_entry.id,
                wecom_errcode=errcode,
                wecom_errmsg=errmsg,
            )
        else:
            log_entry.send_status = "failed"
            log_entry.send_timestamp = hk_now()
            log_entry.error_message = f"errcode={errcode}, errmsg={errmsg}"
            db.commit()

            return WecomSendResponse(
                success=False,
                message=f"WeCom rejected the image: {errmsg}",
                log_id=log_entry.id,
                wecom_errcode=errcode,
                wecom_errmsg=errmsg,
            )

    except httpx.TimeoutException:
        log_entry.send_status = "failed"
        log_entry.send_timestamp = hk_now()
        log_entry.error_message = "Request timed out"
        db.commit()

        return WecomSendResponse(success=False, message="Request to WeCom timed out", log_id=log_entry.id)

    except Exception as e:
        log_entry.send_status = "failed"
        log_entry.send_timestamp = hk_now()
        log_entry.error_message = str(e)
        db.commit()

        return WecomSendResponse(success=False, message=f"Failed to send image: {str(e)}", log_id=log_entry.id)


# ============================================
# Message Log
# ============================================

@router.get("/wecom/message-log", response_model=list[WecomMessageLogResponse])
async def get_message_log(
    webhook_name: Optional[str] = Query(None, description="Filter by webhook name"),
    send_status: Optional[str] = Query(None, description="Filter by status: pending, sent, failed"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(require_admin_view),
):
    """View WeCom message send history (admin only)."""
    query = db.query(WecomMessageLog)

    if webhook_name:
        query = query.filter(WecomMessageLog.webhook_name == webhook_name)
    if send_status:
        query = query.filter(WecomMessageLog.send_status == send_status)

    query = query.order_by(WecomMessageLog.created_at.desc())
    logs = query.offset(offset).limit(limit).all()

    return [WecomMessageLogResponse.model_validate(log) for log in logs]
