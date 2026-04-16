"""Nightly sweep: downgrade Summer enrollment tiers for unpaid applications
that have slipped past their discount deadline.

Scans published Summer enrollments where:
- payment_status != 'Paid'
- discount_override_code IS NULL (overrides bypass auto-adjust)
- payment_deadline IS NOT NULL AND payment_deadline < today

For each, recomputes the effective tier using today's date and rewrites
locked_discount_code + locked_discount_amount. If the tier actually changed
(i.e. the applicant dropped from EB3P to 3P), clears fee_message_sent so the
enrollment page re-surfaces "send updated fee message" to the admin.

Idempotent: safe to run multiple times per day. Typical deploy is a cron
hitting this once daily just after midnight HK time.

Usage:
    cd webapp/backend && ./venv/bin/python scripts/sweep_summer_discount_tiers.py
"""
from __future__ import annotations

import sys
import os
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal
from models import Enrollment, SummerApplication, SummerCourseConfig
from utils.summer_discounts import (
    compute_best_discount,
    compute_payment_deadline,
    load_group_context,
)


def sweep(today: date | None = None) -> dict:
    today = today or date.today()
    db = SessionLocal()
    stats = {"scanned": 0, "changed": 0, "errors": 0}
    try:
        candidates = (
            db.query(Enrollment)
            .filter(
                Enrollment.enrollment_type == "Summer",
                Enrollment.payment_status != "Paid",
                Enrollment.payment_deadline.isnot(None),
                Enrollment.payment_deadline < today,
                Enrollment.discount_override_code.is_(None),
                Enrollment.summer_application_id.isnot(None),
            )
            .all()
        )
        stats["scanned"] = len(candidates)
        print(f"[sweep] {today}: {len(candidates)} unpaid past-deadline enrollment(s)")

        for enr in candidates:
            try:
                app = (
                    db.query(SummerApplication)
                    .filter(SummerApplication.id == enr.summer_application_id)
                    .first()
                )
                if not app or not app.config_id:
                    continue
                config = (
                    db.query(SummerCourseConfig)
                    .filter(SummerCourseConfig.id == app.config_id)
                    .first()
                )
                if not config:
                    continue

                group_apps, siblings = load_group_context(db, app)
                result = compute_best_discount(
                    app, group_apps, siblings, config, today=today
                )
                new_code = result.code
                new_amount = result.amount
                old_code = enr.locked_discount_code
                old_amount = enr.locked_discount_amount or 0

                if new_code != old_code or new_amount != old_amount:
                    enr.locked_discount_code = new_code
                    enr.locked_discount_amount = new_amount
                    # Deadline may need recomputing if new tier has a different
                    # (or no) before_date.
                    enr.payment_deadline = compute_payment_deadline(
                        result, enr.first_lesson_date
                    )
                    # Force admin to resend the fee message with updated total.
                    enr.fee_message_sent = False
                    stats["changed"] += 1
                    print(
                        f"  enrollment#{enr.id}: {old_code}(−${old_amount}) → "
                        f"{new_code}(−${new_amount})"
                    )
            except Exception as e:  # noqa: BLE001
                stats["errors"] += 1
                print(f"  enrollment#{enr.id}: error {e!r}")

        db.commit()
    finally:
        db.close()
    return stats


if __name__ == "__main__":
    result = sweep()
    print(f"[sweep] done: {result}")
