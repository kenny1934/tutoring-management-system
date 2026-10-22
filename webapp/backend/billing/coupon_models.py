"""Additive coupon evidence. KMS source observations never become local stock."""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import VARCHAR

from database import Base
from .models import utc_now


class CouponImport(Base):
    __tablename__ = 'billing_coupon_imports'
    __table_args__ = (UniqueConstraint('branch', 'observed_on', 'source_sha256', name='uq_coupon_import_source'),)
    id = Column(String(36), primary_key=True)
    branch = Column(String(3), nullable=False)
    observed_on = Column(Date, nullable=False)
    source_sha256 = Column(String(64), nullable=False)
    source_filename = Column(String(500), nullable=False)
    parsed_rows = Column(JSON, nullable=False)
    applied_at = Column(DateTime)
    applied_review = Column(JSON)
    created_by_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class CouponObservation(Base):
    __tablename__ = 'billing_coupon_observations'
    id = Column(String(36), primary_key=True)
    student_id = Column(Integer, ForeignKey('students.id'), nullable=False, index=True)
    import_id = Column(String(36), ForeignKey('billing_coupon_imports.id'), nullable=False)
    remaining_count = Column(Integer, nullable=False)
    observed_on = Column(Date, nullable=False)
    processed_at = Column(DateTime, nullable=False, default=utc_now)
    source_filename = Column(String(500), nullable=False)
    source_sha256 = Column(String(64), nullable=False)


class CouponVerification(Base):
    __tablename__ = 'billing_coupon_verifications'
    id = Column(String(36), primary_key=True)
    student_id = Column(Integer, ForeignKey('students.id'), nullable=False, index=True)
    observation_id = Column(String(36), ForeignKey('billing_coupon_observations.id'), nullable=False)
    checked_at = Column(DateTime, nullable=False)
    checked_by = Column(Integer, ForeignKey('tutors.id', ondelete='SET NULL'))
    checked_by_name = Column(String(100), nullable=False)
    groups = Column(JSON, nullable=False)
    reconciliations = Column(JSON, nullable=False)
    reason = Column(Text, nullable=False)
    recorded_at = Column(DateTime, nullable=False, default=utc_now)


class CouponAccount(Base):
    __tablename__ = 'billing_coupon_accounts'
    student_id = Column(Integer, ForeignKey('students.id'), primary_key=True)
    version = Column(Integer, nullable=False, default=1)
    observation_id = Column(String(36), ForeignKey('billing_coupon_observations.id'))
    verification_id = Column(String(36), ForeignKey('billing_coupon_verifications.id'))


class CouponUse(Base):
    __tablename__ = 'billing_coupon_uses'
    id = Column(String(36), primary_key=True)
    student_id = Column(Integer, ForeignKey('students.id'), nullable=False, index=True)
    payment_id = Column(String(36), ForeignKey('billing_payments.id'), unique=True)
    legacy_enrollment_id = Column(Integer, ForeignKey('enrollments.id'), unique=True)
    verification_id = Column(String(36), ForeignKey('billing_coupon_verifications.id'))
    group_key = Column(String(64))
    value = Column(Integer, nullable=False)
    expires_on = Column(Date)
    state = Column(String(24), nullable=False)
    accounted_observation_id = Column(String(36), ForeignKey('billing_coupon_observations.id'))
    receipt_reference = Column(String(100))
    coupon_used_on = Column(Date)
    receipt_recorded_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class CouponOperation(Base):
    __tablename__ = 'billing_coupon_operations'
    __table_args__ = (UniqueConstraint('actor_id', 'idempotency_key', name='uq_coupon_operation_retry'),)
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey('students.id'))
    import_id = Column(String(36), ForeignKey('billing_coupon_imports.id'))
    actor_id = Column(Integer, ForeignKey('tutors.id', ondelete='SET NULL'))
    idempotency_key = Column(String(64).with_variant(VARCHAR(64, collation='utf8mb4_bin'), 'mysql'), nullable=False)
    kind = Column(String(32), nullable=False)
    payload_hash = Column(String(64), nullable=False)
    result = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
