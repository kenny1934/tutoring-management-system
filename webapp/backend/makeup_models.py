"""Separate participation history. Billing conversion is never a pause flag."""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import VARCHAR

from database import Base
from billing.models import utc_now


class MakeupParticipation(Base):
    __tablename__ = 'makeup_participation'
    __table_args__ = (UniqueConstraint('student_id', 'academic_start', name='uq_makeup_participation_year'),)
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey('students.id'), nullable=False)
    academic_start = Column(Date, nullable=False)
    version = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, nullable=False, default=utc_now)


class MakeupParticipationEvent(Base):
    __tablename__ = 'makeup_participation_events'
    __table_args__ = (
        UniqueConstraint('participation_id', 'version', name='uq_makeup_participation_version'),
        UniqueConstraint('participation_id', 'idempotency_key', name='uq_makeup_participation_retry'),
    )
    id = Column(String(36), primary_key=True)
    participation_id = Column(Integer, ForeignKey('makeup_participation.id'), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False)
    effective_on = Column(Date, nullable=False)
    reason = Column(Text, nullable=False)
    return_enrollment_id = Column(Integer, ForeignKey('enrollments.id'), nullable=True)
    idempotency_key = Column(String(64).with_variant(VARCHAR(64, collation='utf8mb4_bin'), 'mysql'), nullable=False)
    payload_hash = Column(String(64), nullable=False)
    review_hash = Column(String(64), nullable=False)
    snapshot = Column(JSON, nullable=False)
    result = Column(JSON, nullable=False)
    actor_id = Column(Integer, ForeignKey('tutors.id', ondelete='SET NULL'), nullable=True)
    actor_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
