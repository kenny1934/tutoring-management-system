"""
SQLAlchemy models for the tutoring management system database.
These models map to the existing tables from database/init.sql
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, Text, Enum, ForeignKey, DECIMAL, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Tutor(Base):
    """
    Tutor information table.
    Stores tutor authentication, profile, and employment information.
    """
    __tablename__ = "tutors"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), nullable=False, unique=True)
    tutor_name = Column(String(255), nullable=False)
    default_location = Column(String(255))
    role = Column(String(50), nullable=False)
    profile_picture = Column(String(500), comment='AppSheet file path for tutor profile picture')
    basic_salary = Column(DECIMAL(10, 2), default=0.00, comment='Monthly base salary (before session revenue)')

    # Relationships
    enrollments = relationship("Enrollment", back_populates="tutor", foreign_keys="[Enrollment.tutor_id]")
    sessions = relationship("SessionLog", back_populates="tutor")


class Student(Base):
    """
    Student information table.
    Stores basic student details and demographics.
    """
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    school_student_id = Column(String(100))
    student_name = Column(String(255), nullable=False)
    grade = Column(String(50))
    phone = Column(String(100))
    school = Column(String(255))
    lang_stream = Column(String(50))
    home_location = Column(String(50))
    academic_stream = Column(String(50), comment='Academic stream for F4-F6: Science, Arts, or NULL for junior forms')

    # Relationships
    enrollments = relationship("Enrollment", back_populates="student")
    sessions = relationship("SessionLog", back_populates="student")


class Discount(Base):
    """
    Discount codes and promotions.
    """
    __tablename__ = "discounts"

    id = Column(Integer, primary_key=True, index=True)
    discount_name = Column(String(255), nullable=False)
    discount_type = Column(String(50))
    discount_value = Column(DECIMAL(10, 2))
    is_active = Column(Boolean, default=True)

    # Relationships
    enrollments = relationship("Enrollment", back_populates="discount")


class Enrollment(Base):
    """
    Enrollment records linking students to tutors and tracking payment status.
    Each enrollment represents a course registration.
    """
    __tablename__ = "enrollments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)

    # Schedule
    assigned_day = Column(String(100))
    assigned_time = Column(String(100))
    location = Column(String(100))

    # Course details
    lessons_paid = Column(Integer)
    payment_date = Column(Date)
    first_lesson_date = Column(Date)
    payment_status = Column(String(100), default='Pending Payment')
    enrollment_type = Column(String(50), default='Regular', comment='Regular, One-Time, or Trial')

    # Financial
    fee_message_sent = Column(Boolean, default=False)
    discount_id = Column(Integer, ForeignKey("discounts.id"))

    # Notes
    remark = Column(Text)

    # Extension tracking (from migration 017)
    deadline_extension_weeks = Column(Integer, default=0, comment='Number of weeks deadline extended')
    extension_notes = Column(Text, comment='Audit trail of extension reasons and history')
    last_extension_date = Column(Date, comment='Date when last extension was granted')
    extension_granted_by = Column(String(255), comment='Email of admin who granted extension')

    # Renewal tracking (from migration 021)
    renewed_from_enrollment_id = Column(
        Integer,
        ForeignKey("enrollments.id"),
        comment='Links to the previous enrollment that this renewal continues'
    )

    # Metadata
    last_modified_by = Column(String(255))
    last_modified_time = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    student = relationship("Student", back_populates="enrollments")
    tutor = relationship("Tutor", back_populates="enrollments", foreign_keys=[tutor_id])
    discount = relationship("Discount", back_populates="enrollments")
    sessions = relationship("SessionLog", back_populates="enrollment")
    renewed_from = relationship("Enrollment", remote_side=[id], foreign_keys=[renewed_from_enrollment_id])


class SessionLog(Base):
    """
    Session log tracking individual lesson occurrences.
    Records attendance, status, and financial tracking for each session.
    """
    __tablename__ = "session_log"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(Integer, ForeignKey("enrollments.id"), nullable=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)

    # Session details
    session_date = Column(Date, nullable=False, index=True)
    time_slot = Column(String(100))
    location = Column(String(100))

    # Status tracking
    session_status = Column(String(100), default='Scheduled')
    previous_session_status = Column(String(100))

    # Financial tracking
    financial_status = Column(String(100), default='Unpaid')

    # Performance tracking
    performance_rating = Column(String(10), comment='Star rating as emojis (⭐⭐⭐), NULL = not rated')

    # Attendance tracking
    attendance_marked_by = Column(String(255))
    attendance_mark_time = Column(DateTime)

    # Reschedule tracking
    rescheduled_to_id = Column(Integer, ForeignKey("session_log.id"), nullable=True)
    make_up_for_id = Column(Integer, ForeignKey("session_log.id"), nullable=True)

    # Notes
    notes = Column(Text)

    # Metadata
    created_at = Column(DateTime, default=func.now())
    last_modified_by = Column(String(255))
    last_modified_time = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    enrollment = relationship("Enrollment", back_populates="sessions")
    student = relationship("Student", back_populates="sessions")
    tutor = relationship("Tutor", back_populates="sessions")


class Holiday(Base):
    """
    Holiday calendar for scheduling.
    Sessions are not scheduled on holidays.
    """
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True)
    holiday_date = Column(Date, nullable=False, unique=True, index=True)
    holiday_name = Column(String(255))


class PlannedReschedule(Base):
    """
    Planned reschedules for enrollments (e.g., tutor leave, planned breaks).
    Used to pre-plan make-up classes.
    """
    __tablename__ = "planned_reschedules"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(Integer, ForeignKey("enrollments.id"), nullable=False)
    planned_date = Column(Date, nullable=False)  # Original session date
    reason = Column(String(500))
    status = Column(String(20), default='Pending')  # Pending, Applied, Cancelled
    requested_date = Column(Date, nullable=False)
    requested_by = Column(String(255))
    notes = Column(Text)
