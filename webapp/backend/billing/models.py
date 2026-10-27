"""Additive storage for reviewed drafts, with no teaching or payment state."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.mysql import VARCHAR

from database import Base


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class BillingAccount(Base):
    __tablename__ = 'billing_accounts'
    __table_args__ = (UniqueConstraint('student_id', 'academic_start', name='uq_billing_account_student_year'),)
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey('students.id'), nullable=False)
    academic_start = Column(Date, nullable=False)
    policy_version = Column(String(80), nullable=False)
    active = Column(Boolean, nullable=False, default=False, server_default=text('0'))
    created_at = Column(DateTime, nullable=False, default=utc_now)


class BillingDraft(Base):
    __tablename__ = 'billing_drafts'
    id = Column(String(36), primary_key=True)
    account_id = Column(Integer, ForeignKey('billing_accounts.id'), nullable=False, index=True)
    current_revision = Column(Integer, nullable=False)
    created_by = Column(Integer, ForeignKey('tutors.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class BillingDraftRevision(Base):
    __tablename__ = 'billing_draft_revisions'
    __table_args__ = (
        UniqueConstraint('draft_id', 'revision', name='uq_billing_draft_revision'),
        UniqueConstraint('account_id', 'idempotency_key', name='uq_billing_draft_idempotency'),
    )
    id = Column(Integer, primary_key=True)
    draft_id = Column(String(36), ForeignKey('billing_drafts.id'), nullable=False)
    account_id = Column(Integer, ForeignKey('billing_accounts.id'), nullable=False)
    revision = Column(Integer, nullable=False)
    idempotency_key = Column(String(64).with_variant(VARCHAR(64, collation='utf8mb4_bin'), 'mysql'), nullable=False)
    payload_hash = Column(String(64), nullable=False)
    review_hash = Column(String(64), nullable=False)
    snapshot = Column(JSON, nullable=False)
    note = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey('tutors.id', ondelete='SET NULL'), nullable=True)
    actor_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class BillingPreference(Base):
    __tablename__ = 'billing_preferences'
    account_id = Column(Integer, ForeignKey('billing_accounts.id'), primary_key=True)
    payment_method = Column(String(16), nullable=True)
    mandate_ready = Column(Boolean, nullable=False, default=False)
    version = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime, nullable=False, default=utc_now)


class BillingPayment(Base):
    __tablename__ = 'billing_payments'
    id = Column(String(36), primary_key=True)
    account_id = Column(Integer, ForeignKey('billing_accounts.id'), nullable=False, index=True)
    draft_id = Column(String(36), ForeignKey('billing_drafts.id'), nullable=False, unique=True)
    draft_revision = Column(Integer, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(32), nullable=False, default='Pending Payment')
    snapshot = Column(JSON, nullable=False)
    coupon_value = Column(Integer, nullable=False, default=0)
    coupon_status = Column(String(32), nullable=False, default='none')
    created_by = Column(Integer, ForeignKey('tutors.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    sent_at = Column(DateTime, nullable=True)
    sent_language = Column(String(2), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    payment_date = Column(Date, nullable=True)
    received_amount = Column(Integer, nullable=True)
    received_method = Column(String(16), nullable=True)
    receipt_reference = Column(String(100), nullable=True)
    note = Column(Text, nullable=True)


class BillingPaymentLine(Base):
    __tablename__ = 'billing_payment_lines'
    __table_args__ = (UniqueConstraint('payment_id', 'slot_index', name='uq_billing_payment_slot'),)
    id = Column(Integer, primary_key=True)
    payment_id = Column(String(36), ForeignKey('billing_payments.id'), nullable=False, index=True)
    enrollment_id = Column(Integer, ForeignKey('enrollments.id'), nullable=False, unique=True)
    slot_index = Column(Integer, nullable=False)
    lesson_count = Column(Integer, nullable=False)
    gross_tuition = Column(Integer, nullable=False)
    discount_amount = Column(Integer, nullable=False)
    tuition_amount = Column(Integer, nullable=False)
    materials_fee = Column(Integer, nullable=False)


class BillingLessonClaim(Base):
    __tablename__ = 'billing_lesson_claims'
    __table_args__ = (UniqueConstraint('student_id', 'lesson_date', 'time_slot', 'location', name='uq_billing_claim_slot'),)
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey('students.id'), nullable=False, index=True)
    payment_id = Column(String(36), ForeignKey('billing_payments.id'), nullable=False, index=True)
    enrollment_id = Column(Integer, ForeignKey('enrollments.id'), nullable=False)
    session_id = Column(Integer, ForeignKey('session_log.id'), nullable=False, unique=True)
    lesson_date = Column(Date, nullable=False)
    time_slot = Column(String(100), nullable=False)
    location = Column(String(100), nullable=False)


class BillingOperation(Base):
    """Immutable audit and retry results for each staff workflow action."""
    __tablename__ = 'billing_operations'
    __table_args__ = (UniqueConstraint('account_id', 'idempotency_key', name='uq_billing_operation_retry'),)
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey('billing_accounts.id'), nullable=False)
    payment_id = Column(String(36), ForeignKey('billing_payments.id'), nullable=True, index=True)
    idempotency_key = Column(String(64).with_variant(VARCHAR(64, collation='utf8mb4_bin'), 'mysql'), nullable=False)
    kind = Column(String(32), nullable=False)
    payload_hash = Column(String(64), nullable=False)
    result = Column(JSON, nullable=False)
    actor_id = Column(Integer, ForeignKey('tutors.id', ondelete='SET NULL'), nullable=True)
    actor_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
