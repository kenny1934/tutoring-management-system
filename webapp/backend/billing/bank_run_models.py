"""Additive, separately gated storage for immutable bank files and outcomes."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import LONGBLOB, VARCHAR

from database import Base
from .models import utc_now


def binary_key():
    return String(64).with_variant(VARCHAR(64, collation='utf8mb4_bin'), 'mysql')


class BankRun(Base):
    __tablename__ = 'billing_bank_runs'
    id = Column(String(36), primary_key=True)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(24), nullable=False)
    collection_month = Column(String(7), nullable=False, index=True)
    branch = Column(String(3), nullable=False)
    content_hash = Column(String(64), nullable=False)
    export_snapshot = Column(JSON, nullable=False)
    payment_evidence = Column(JSON, nullable=False)
    file_sha256 = Column(String(64), nullable=False)
    export_sha256 = Column(String(64), nullable=False)
    workbook = Column(LargeBinary().with_variant(LONGBLOB(), 'mysql'), nullable=False)
    created_by = Column(Integer, ForeignKey('tutors.id', ondelete='SET NULL'))
    created_by_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    submitted_at = Column(DateTime)
    submitted_by_name = Column(String(100))
    bank_batch_no = Column(String(100))
    discarded_at = Column(DateTime)
    discard_reason = Column(Text)
    latest_import_id = Column(String(36))


class BankRunClaim(Base):
    __tablename__ = 'billing_bank_run_claims'
    payment_id = Column(String(36), ForeignKey('billing_payments.id'), primary_key=True)
    run_id = Column(String(36), ForeignKey('billing_bank_runs.id'), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class BankRunImport(Base):
    __tablename__ = 'billing_bank_run_imports'
    __table_args__ = (UniqueConstraint('run_id', 'report_hash', name='uq_bank_run_report'),)
    id = Column(String(36), primary_key=True)
    run_id = Column(String(36), ForeignKey('billing_bank_runs.id'), nullable=False, index=True)
    bank_identity_hash = Column(String(64), nullable=False, index=True)
    report_hash = Column(String(64), nullable=False)
    report = Column(JSON, nullable=False)
    applied = Column(JSON, nullable=False, default=dict)
    created_by_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class BankResultIdentity(Base):
    __tablename__ = 'billing_bank_result_identities'
    bank_identity_hash = Column(String(64), primary_key=True)
    run_id = Column(String(36), ForeignKey('billing_bank_runs.id'), nullable=False)
    import_id = Column(String(36), ForeignKey('billing_bank_run_imports.id'), nullable=False)
    report_hash = Column(String(64), nullable=False)


class BankRunOperation(Base):
    __tablename__ = 'billing_bank_run_operations'
    __table_args__ = (UniqueConstraint('actor_id', 'idempotency_key', name='uq_bank_run_operation_retry'),)
    id = Column(Integer, primary_key=True)
    run_id = Column(String(36), ForeignKey('billing_bank_runs.id'), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey('tutors.id', ondelete='SET NULL'))
    actor_name = Column(String(100), nullable=False)
    idempotency_key = Column(binary_key())
    payload_hash = Column(String(64), nullable=False)
    kind = Column(String(32), nullable=False)
    result = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
