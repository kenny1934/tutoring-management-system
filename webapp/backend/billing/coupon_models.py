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


class KmsCouponCheck(Base):
    """Immutable source evidence for previews, separate from usable stock."""
    __tablename__ = 'billing_kms_coupon_checks'
    sequence = Column(Integer, primary_key=True, autoincrement=True)
    id = Column(String(36), nullable=False, unique=True)
    branch = Column(String(3), nullable=False, index=True)
    fetched_at = Column(DateTime, nullable=False)
    source_sha256 = Column(String(64), nullable=False)
    snapshot = Column(JSON, nullable=False)
    previous_id = Column(String(36), ForeignKey('billing_kms_coupon_checks.id'))
    created_by = Column(Integer, ForeignKey('tutors.id', ondelete='SET NULL'))
    created_at = Column(DateTime, nullable=False, default=utc_now)


class KmsCouponVerification(Base):
    __tablename__ = 'billing_kms_coupon_verifications'
    verification_id = Column(String(36), ForeignKey('billing_coupon_verifications.id'), primary_key=True)
    student_id = Column(Integer, ForeignKey('students.id'), nullable=False, index=True)
    company_id = Column(String(40), nullable=False)
    check_id = Column(String(36), ForeignKey('billing_kms_coupon_checks.id'), nullable=False)
    snapshot = Column(JSON, nullable=False)


class KmsCouponRedemption(Base):
    __tablename__ = 'billing_kms_coupon_redemptions'
    branch = Column(String(3), primary_key=True)
    number = Column(String(80).with_variant(VARCHAR(80, collation='utf8mb4_bin'), 'mysql'), primary_key=True)
    use_id = Column(String(36), ForeignKey('billing_coupon_uses.id'), nullable=False, unique=True)
    student_id = Column(Integer, ForeignKey('students.id'), nullable=False, index=True)
    check_id = Column(String(36), ForeignKey('billing_kms_coupon_checks.id'), nullable=False)
    value = Column(Integer, nullable=False)
    expires_on = Column(Date, nullable=True)
    coupon = Column(JSON, nullable=False)


class KmsCouponLock(Base):
    __tablename__ = 'billing_kms_coupon_locks'
    branch = Column(String(3), primary_key=True)


class KmsCouponSeenUsed(Base):
    """A source-reported Used number can never become new stock again."""
    __tablename__ = 'billing_kms_coupon_seen_used'
    branch = Column(String(3), primary_key=True)
    number = Column(String(80).with_variant(VARCHAR(80, collation='utf8mb4_bin'), 'mysql'), primary_key=True)
    check_id = Column(String(36), ForeignKey('billing_kms_coupon_checks.id'), nullable=False)
