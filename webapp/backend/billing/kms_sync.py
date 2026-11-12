"""Cloud Run Job entry point for KMS reads and guarded coupon updates.

Run with python -m billing.kms_sync. Credentials come from server secrets.
The job shares the admin workflow's source validation and application rules.
"""
import argparse
import json
import os
from types import SimpleNamespace

from . import kms_apply, kms_preview, kms_stock
from .clock import today
from .drafts import DraftConflict
from .kms_client import credentials
from .kms_schemas import KmsApplyRequest


def require_enabled():
    if (os.getenv('BILLING_KMS_SYNC_ENABLED', '').strip().lower() not in {'1', 'true', 'yes', 'on'}
            or not kms_preview.enabled() or not kms_stock.writes_enabled()):
        raise DraftConflict('Automatic KMS coupon updates have not been enabled.')


def sync_branch(db, branch, actor):
    require_enabled()
    if branch not in {'MSA', 'MSB'}:
        raise ValueError('Choose MSA or MSB.')
    # Refuse to begin if this branch has no credentials. No partial source is saved.
    if not credentials(branch):
        raise DraftConflict('KMS credentials are not configured.')
    try:
        with kms_preview.check_guard(branch, db):
            try:
                review = kms_preview.check_kms(db, branch, actor)
                db.commit()
            except Exception:
                db.rollback()
                raise
            summary = review.update
            if summary is None:
                raise DraftConflict('KMS coupon update storage is not enabled.')
            if not summary.can_apply:
                if summary.ready_count and summary.issues:
                    raise DraftConflict('The KMS check is not ready to apply.')
                return {'branch': branch, 'check_id': review.id,
                        'status': 'needs_review' if summary.held_count else 'up_to_date',
                        'updated_count': 0, 'held_count': summary.held_count}
            data = KmsApplyRequest(expected_review_hash=summary.review_hash,
                                   idempotency_key=f'kms-job:{review.id}')
            try:
                result = kms_apply.apply_check(db, review.id, data, actor, as_of=today())
                db.commit()
            except Exception:
                db.rollback()
                raise
            return {'branch': branch, 'check_id': review.id, 'status': 'updated',
                    'updated_count': result.updated_count, 'held_count': result.held_count}
    except kms_preview.KmsCheckBusy:
        db.rollback()
        return {'branch': branch, 'status': 'busy', 'updated_count': 0, 'held_count': 0}


def main(argv=None):
    parser = argparse.ArgumentParser(description='Read KMS and apply clear coupon updates.')
    parser.add_argument('--branch', choices=['MSA', 'MSB'], action='append')
    args = parser.parse_args(argv)
    branches = list(dict.fromkeys(args.branch or ['MSA', 'MSB']))
    try:
        require_enabled()
        actor_id = int(os.environ['BILLING_KMS_SYNC_ACTOR_ID'])
        if actor_id < 1:
            raise ValueError('Invalid actor.')
        # Jobs do not import the web application or start its background tasks.
        from database import SessionLocal
        from models import Tutor
        from . import bank_run_models  # Register all coupon/payment relationships.
        with SessionLocal() as db:
            tutor = db.query(Tutor).filter(Tutor.id == actor_id, Tutor.role.in_(['Admin', 'Super Admin'])).first()
            if tutor is None or (tutor.departure_effective_on and tutor.departure_effective_on < today()):
                raise DraftConflict('The configured automation owner is not an active admin.')
            actor = SimpleNamespace(id=tutor.id, tutor_name='KMS automatic update', user_email=tutor.user_email)
            db.rollback()
            failed = False
            for branch in branches:
                try:
                    print(json.dumps(sync_branch(db, branch, actor)), flush=True)
                except Exception as error:
                    db.rollback()
                    # Upstream responses and SQL exceptions can contain private data.
                    print(json.dumps({'branch': branch, 'status': 'failed',
                                      'error_type': type(error).__name__}), flush=True)
                    failed = True
            return int(failed)
    except Exception as error:
        print(json.dumps({'status': 'disabled_or_unavailable', 'error_type': type(error).__name__}), flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
