"""Global enrollment pricing for new payments, independent of seasonal intake promotions."""
import os

from sqlalchemy import inspect
from fastapi import HTTPException

from constants import REGISTRATION_FEE
from .models import BillingGlobalSettings, BillingSettingsOperation, utc_now
from .schemas import BillingGlobalSettingsResponse


def enabled(name):
    return os.getenv(name, '').strip().lower() in {'1', 'true', 'yes', 'on'}


def storage_available(db):
    if not enabled('BILLING_SETTINGS_STORAGE_ENABLED'):
        return False
    inspector = inspect(db.connection())
    return all(inspector.has_table(table) for table in ('billing_global_settings', 'billing_settings_operations'))


def get_settings(db, *, lock=False):
    available = storage_available(db)
    query = db.query(BillingGlobalSettings).filter_by(id=1) if available else None
    if query is not None and lock:
        query = query.populate_existing().with_for_update(read=True)
    row = query.first() if query is not None else None
    # Rolling deployments can read old databases safely. Only migration seeds
    # the singleton. GET never creates settings or changes existing records.
    if row is None:
        return BillingGlobalSettingsResponse(materials_fee=REGISTRATION_FEE, version=0,
            storage_available=False, writes_available=False)
    return BillingGlobalSettingsResponse(materials_fee=row.materials_fee, version=row.version,
        storage_available=True, writes_available=enabled('BILLING_SETTINGS_ENABLED'))


def update_settings(db, data, actor):
    from .drafts import DraftConflict, digest
    if not enabled('BILLING_SETTINGS_ENABLED') or not storage_available(db):
        raise HTTPException(status_code=503, detail='Enrollment settings are not available for editing yet.')
    row = db.query(BillingGlobalSettings).filter_by(id=1).populate_existing().with_for_update().first()
    if row is None:
        raise HTTPException(status_code=503, detail='Enrollment settings have not been installed yet.')
    payload_hash = digest(data.model_dump(mode='json'))
    previous = db.query(BillingSettingsOperation).filter_by(idempotency_key=data.idempotency_key).with_for_update().first()
    if previous:
        if previous.actor_id != actor.id or previous.payload_hash != payload_hash:
            raise DraftConflict('This settings request was already used. Refresh and try again.')
        return BillingGlobalSettingsResponse.model_validate(previous.result)
    if row.version != data.expected_version:
        raise DraftConflict('Enrollment settings changed. Reload them before saving.')
    row.materials_fee = data.materials_fee
    row.version += 1
    row.updated_by = actor.id
    row.updated_at = utc_now()
    result = BillingGlobalSettingsResponse(materials_fee=row.materials_fee, version=row.version,
        storage_available=True, writes_available=True)
    db.add(BillingSettingsOperation(idempotency_key=data.idempotency_key, actor_id=actor.id,
        actor_name=actor.tutor_name, payload_hash=payload_hash, result=result.model_dump(mode='json')))
    db.flush()
    return result
