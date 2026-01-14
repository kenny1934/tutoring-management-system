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
    parent_communications = relationship("ParentCommunication", back_populates="tutor")


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
    parent_communications = relationship("ParentCommunication", back_populates="student")


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
    exercises = relationship("SessionExercise", back_populates="session", cascade="all, delete-orphan")


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


class SessionExercise(Base):
    """
    Session exercises tracking classwork (CW) and homework (HW) assignments.
    Links to curriculum and tracks effectiveness.
    """
    __tablename__ = "session_exercises"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("session_log.id", ondelete="CASCADE"), nullable=False)
    exercise_type = Column(String(20), nullable=False, comment='Classwork or Homework')
    pdf_name = Column(String(255), nullable=False)
    page_start = Column(Integer, nullable=True, comment='NULL = whole PDF')
    page_end = Column(Integer, nullable=True)
    created_by = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    remarks = Column(Text)

    # Relationships
    session = relationship("SessionLog", back_populates="exercises")


class HomeworkCompletion(Base):
    """
    Tracks homework completion status for each assignment.
    Links session exercises to student completion records.
    """
    __tablename__ = "homework_completion"

    id = Column(Integer, primary_key=True, index=True)
    current_session_id = Column(Integer, ForeignKey("session_log.id"), nullable=False)
    session_exercise_id = Column(Integer, ForeignKey("session_exercises.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    completion_status = Column(
        Enum('Not Checked', 'Completed', 'Partially Completed', 'Not Completed', name='completion_status_enum'),
        nullable=True
    )
    submitted = Column(Boolean, default=False)
    tutor_comments = Column(Text)
    checked_by = Column(Integer, ForeignKey("tutors.id"), nullable=True)
    checked_at = Column(DateTime, nullable=True)

    # Denormalized homework details from session_exercises
    pdf_name = Column(String(255))
    page_start = Column(Integer)
    page_end = Column(Integer)

    # Relationships
    session = relationship("SessionLog", foreign_keys=[current_session_id])
    exercise = relationship("SessionExercise", foreign_keys=[session_exercise_id])
    student = relationship("Student", foreign_keys=[student_id])
    checked_by_tutor = relationship("Tutor", foreign_keys=[checked_by])


class HomeworkToCheck(Base):
    """
    View that shows homework from previous session that needs checking in current session.
    Read-only view - combines data from session_exercises and homework_completion.
    """
    __tablename__ = "homework_to_check"
    __table_args__ = {'info': {'is_view': True}}  # Mark as view for SQLAlchemy

    # Use composite primary key since this is a view
    current_session_id = Column(Integer, primary_key=True)
    session_exercise_id = Column(Integer, primary_key=True)

    # Session info
    student_id = Column(Integer)
    current_tutor_id = Column(Integer)
    current_session_date = Column(Date)
    student_name = Column(String(255))
    current_tutor_name = Column(String(255))

    # Previous session info
    previous_session_id = Column(Integer)
    homework_assigned_date = Column(Date)
    assigned_by_tutor_id = Column(Integer)
    assigned_by_tutor = Column(String(255))

    # Homework details from session_exercises
    pdf_name = Column(String(255))
    pages = Column(String(50))
    assignment_remarks = Column(Text)

    # Completion status from homework_completion (if checked)
    completion_status = Column(String(50))
    submitted = Column(Boolean)
    tutor_comments = Column(Text)
    checked_at = Column(DateTime)
    checked_by = Column(Integer)
    check_status = Column(String(20))  # 'Checked' or 'Pending'


class SessionCurriculumSuggestion(Base):
    """
    View that shows curriculum suggestions from last year for each session.
    Provides reference materials from previous academic year to guide tutors.
    Read-only view - shows Week N-1, N, and N+1 topics from last year's curriculum.
    """
    __tablename__ = "session_curriculum_suggestions"
    __table_args__ = {'info': {'is_view': True}}  # Mark as view for SQLAlchemy

    # Use session ID as primary key
    id = Column(Integer, primary_key=True)

    # Basic session info
    enrollment_id = Column(Integer)
    student_id = Column(Integer)
    tutor_id = Column(Integer)
    session_date = Column(Date)
    time_slot = Column(String(100))
    location = Column(String(100))
    session_status = Column(String(100))
    financial_status = Column(String(100))

    # Student info
    school_student_id = Column(String(100))
    student_name = Column(String(255))
    grade = Column(String(50))
    school = Column(String(255))
    lang_stream = Column(String(50))

    # Tutor info
    tutor_name = Column(String(255))

    # Current week info
    current_week_number = Column(Integer)
    current_academic_year = Column(String(20))

    # Last year's curriculum suggestions (3 weeks)
    week_before_topic = Column(Text)
    week_before_number = Column(Integer)
    same_week_topic = Column(Text)
    same_week_number = Column(Integer)
    week_after_topic = Column(Text)
    week_after_number = Column(Integer)

    # Primary suggestion and formatted display
    primary_suggestion = Column(Text)
    suggestions_display = Column(Text)  # Multi-line formatted display
    user_friendly_display = Column(Text)  # Single line summary
    options_for_buttons = Column(Text)  # Pipe-separated options

    # Metadata
    suggestion_count = Column(Integer)
    coverage_status = Column(String(50))


class CalendarEvent(Base):
    """
    Calendar events table for Google Calendar integration.
    Caches test/exam events to reduce API calls and enable fast lookups.
    Events are matched to students by school and grade.
    """
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)

    # Google Calendar event ID (for sync tracking)
    event_id = Column(String(255), nullable=False, unique=True)

    # Event details
    title = Column(String(500), nullable=False)
    description = Column(Text)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)

    # Parsed information for matching
    school = Column(String(100))  # e.g., TIS, PCMS, SRL-E
    grade = Column(String(20))    # e.g., F1, F2, F3, F4, F5, F6
    academic_stream = Column(String(10))  # e.g., A (Arts), S (Science), C (Commerce) - only for F4-F6
    event_type = Column(String(100))  # e.g., Test, Quiz, Exam, Final Exam

    # Metadata
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    last_synced_at = Column(DateTime, server_default=func.now())


class ParentCommunication(Base):
    """
    Tracks parent-tutor communications for accountability and follow-up.
    Each record represents a contact made by a tutor with a student's parent.
    """
    __tablename__ = "parent_communications"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    contact_date = Column(DateTime, nullable=False)
    contact_method = Column(String(50), default='WeChat')  # WeChat, Phone, In-Person
    contact_type = Column(String(50), default='Progress Update')  # Progress Update, Concern, General
    brief_notes = Column(Text, comment='Quick summary of what was discussed')
    follow_up_needed = Column(Boolean, default=False, nullable=True)  # Allow NULL for legacy data
    follow_up_date = Column(Date, comment='When follow-up is needed by')
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(String(255), default='system')

    # Relationships
    student = relationship("Student", back_populates="parent_communications")
    tutor = relationship("Tutor", back_populates="parent_communications")


class LocationSettings(Base):
    """
    Per-location settings for configurable features.
    Stores thresholds for parent contact status indicators.
    """
    __tablename__ = "location_settings"

    id = Column(Integer, primary_key=True, index=True)
    location = Column(String(50), unique=True, nullable=False)  # MSA, MSB
    contact_recent_days = Column(Integer, default=28, comment='Days threshold for "Recent" contact status')
    contact_warning_days = Column(Integer, default=50, comment='Days threshold for "Been a While" status')
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class TerminationRecord(Base):
    """
    Termination records for quarterly reporting.
    Stores user-editable reason and count_as_terminated flag per student per quarter.
    """
    __tablename__ = "termination_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    quarter = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    reason = Column(Text, nullable=True)
    count_as_terminated = Column(Boolean, default=False, nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(String(255), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    student = relationship("Student")
    tutor = relationship("Tutor")
