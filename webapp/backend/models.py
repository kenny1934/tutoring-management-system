"""
SQLAlchemy models for the tutoring management system database.
These models map to the existing tables from database/init.sql
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, Text, Enum, ForeignKey, DECIMAL, Boolean, UniqueConstraint, Index, JSON, Computed
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
    nickname = Column(String(100), comment='Short display name for parent messages, e.g. David Sir, Miss Bella')
    default_location = Column(String(255))
    role = Column(String(50), nullable=False)
    profile_picture = Column(String(2048), comment='Google profile picture URL')
    basic_salary = Column(DECIMAL(10, 2), default=0.00, comment='Monthly base salary (before session revenue)')
    is_active_tutor = Column(Boolean, default=True, nullable=False, comment='Whether this user teaches students (false for Supervisors, non-teaching admins)')

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
    contacts = Column(JSON, default=list, comment='Array of contact objects: [{phone, label}]')
    school = Column(String(255))
    lang_stream = Column(String(50))
    home_location = Column(String(50))
    academic_stream = Column(String(50), comment='Academic stream for F4-F6: Science, Arts, or NULL for junior forms')
    is_staff_referral = Column(Boolean, default=False, comment='TRUE if student is staff relative (unlimited $500 discount)')
    staff_referral_notes = Column(Text, comment='Which staff member, relationship, etc.')

    # Relationships
    enrollments = relationship("Enrollment", back_populates="student")
    sessions = relationship("SessionLog", back_populates="student")
    parent_communications = relationship("ParentCommunication", back_populates="student")


class StudentCoupon(Base):
    """
    Student discount coupons synced from company system.
    Company system is the source of truth - we don't decrement locally.
    """
    __tablename__ = "student_coupons"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), unique=True, nullable=False)
    available_coupons = Column(Integer, default=0, comment="Number of discount coupons available")
    coupon_value = Column(DECIMAL(10, 2), default=300, comment="Value per coupon (usually $300)")
    last_synced_at = Column(DateTime, comment="When synced from company system")
    notes = Column(Text, comment="Any special notes about coupons")

    # Relationship
    student = relationship("Student", backref="coupon")


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
    __table_args__ = (
        # Performance indexes for frequently filtered columns
        # Note: payment_status already indexed via idx_enrollments_extension_lookup
        Index('idx_enrollment_first_lesson', 'first_lesson_date'),
        Index('idx_enrollment_student', 'student_id'),
        Index('idx_enrollment_tutor', 'tutor_id'),
        Index('idx_enrollment_location', 'location'),
    )

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
    is_new_student = Column(Boolean, default=False, comment='TRUE if student is new (adds $100 reg fee)')

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
    __table_args__ = (
        UniqueConstraint('exam_revision_slot_id', 'student_id', name='uq_revision_slot_student'),
        # Performance indexes for frequently filtered columns
        # Note: session_status already indexed via idx_location_date_status
        Index('idx_session_log_student', 'student_id'),
        Index('idx_session_log_student_date', 'student_id', 'session_date'),
        Index('idx_session_log_tutor', 'tutor_id'),
        Index('idx_session_log_enrollment', 'enrollment_id'),
    )

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

    # DB-enforced duplicate prevention (computed by MySQL, read-only)
    active_student_slot_guard = Column(Integer, Computed(
        "CASE WHEN session_status LIKE '%Pending Make-up%' THEN NULL "
        "WHEN session_status LIKE '%Make-up Booked%' THEN NULL "
        "WHEN session_status = 'Cancelled' THEN NULL "
        "ELSE student_id END"
    ), nullable=True,
        comment='Generated: student_id for active sessions, NULL for inactive. Used in unique index.')
    active_makeup_for_guard = Column(Integer, Computed(
        "CASE WHEN make_up_for_id IS NULL THEN NULL "
        "WHEN session_status LIKE '%Pending Make-up%' THEN NULL "
        "WHEN session_status LIKE '%Make-up Booked%' THEN NULL "
        "WHEN session_status = 'Cancelled' THEN NULL "
        "ELSE make_up_for_id END"
    ), nullable=True,
        comment='Generated: make_up_for_id for active make-ups, NULL otherwise. Used in unique index.')

    # Exam revision slot link
    exam_revision_slot_id = Column(Integer, ForeignKey("exam_revision_slots.id"), nullable=True,
                                    comment='Links session to exam revision slot when enrolled via revision class feature')

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
    exam_revision_slot = relationship("ExamRevisionSlot", back_populates="sessions")
    extension_request = relationship("ExtensionRequest", back_populates="session", uselist=False)
    tutor_memo = relationship("TutorMemo", back_populates="linked_session", uselist=False,
                              foreign_keys="TutorMemo.linked_session_id")


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


class ExtensionRequest(Base):
    """
    Stores tutor requests for enrollment deadline extensions.
    Used when a session needs to be scheduled past the enrollment end date.

    Workflow: Tutor creates request -> Admin reviews -> Approve/Reject
    On approval: enrollment.deadline_extension_weeks is updated.
    """
    __tablename__ = "extension_requests"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("session_log.id"), nullable=False, comment='The session that needs extension')
    enrollment_id = Column(Integer, ForeignKey("enrollments.id"), nullable=False, comment='Source enrollment (session belongs to this)')
    target_enrollment_id = Column(Integer, ForeignKey("enrollments.id"), nullable=True, comment='Enrollment to extend (student current). NULL = use enrollment_id for AppSheet compat')
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)

    # Request details
    requested_extension_weeks = Column(Integer, default=1, comment='How many weeks of extension requested (1-2 typical)')
    reason = Column(Text, nullable=False, comment='Why is extension needed')
    proposed_reschedule_date = Column(Date, nullable=True, comment='When tutor wants to reschedule this session')
    proposed_reschedule_time = Column(String(100), nullable=True, comment='Proposed time for rescheduled session')

    # Workflow status
    request_status = Column(String(20), default='Pending', comment='Pending, Approved, Rejected')

    # Audit trail
    requested_by = Column(String(255), nullable=False, comment='Tutor email who made request')
    requested_at = Column(DateTime, server_default=func.now())
    reviewed_by = Column(String(255), nullable=True, comment='Admin who approved/rejected')
    reviewed_at = Column(DateTime, nullable=True)
    review_notes = Column(Text, nullable=True, comment='Admin notes on approval/rejection')

    # Extension tracking (if approved)
    extension_granted_weeks = Column(Integer, nullable=True, comment='Actual weeks granted (may differ from requested)')
    session_rescheduled = Column(Boolean, default=False, comment='Whether the session was rescheduled as part of approval')

    # Relationships
    session = relationship("SessionLog", foreign_keys=[session_id], back_populates="extension_request")
    enrollment = relationship("Enrollment", foreign_keys=[enrollment_id])
    target_enrollment = relationship("Enrollment", foreign_keys=[target_enrollment_id])
    student = relationship("Student", foreign_keys=[student_id])
    tutor = relationship("Tutor", foreign_keys=[tutor_id])


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
    # Answer file fields (for manual answer selection)
    answer_pdf_name = Column(String(255), nullable=True, comment='Manually selected answer PDF path')
    answer_page_start = Column(Integer, nullable=True)
    answer_page_end = Column(Integer, nullable=True)
    answer_remarks = Column(Text, comment='Answer complex pages + notes')

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

    # Relationships
    revision_slots = relationship("ExamRevisionSlot", back_populates="calendar_event")


class ParentCommunication(Base):
    """
    Tracks parent-tutor communications for accountability and follow-up.
    Each record represents a contact made by a tutor with a student's parent.
    """
    __tablename__ = "parent_communications"
    # Note: Indexes already exist in init.sql:
    # - idx_student_date(student_id, contact_date DESC)
    # - idx_tutor_date(tutor_id, contact_date DESC)
    # - idx_follow_up(follow_up_needed, follow_up_date)

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


class OfficeIPWhitelist(Base):
    """
    Whitelist of office IP addresses for sensitive data access control.
    Phone numbers are only visible to tutors when accessing from these IPs.
    """
    __tablename__ = "office_ip_whitelist"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(45), unique=True, nullable=False)  # Supports IPv6
    location = Column(String(50), nullable=True)  # Optional: MSA, MSB
    description = Column(String(200), nullable=True)  # e.g., "Main office router"
    created_at = Column(DateTime, server_default=func.now())


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
    reason_category = Column(String(50), nullable=True)
    count_as_terminated = Column(Boolean, default=False, nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(String(255), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    student = relationship("Student")
    tutor = relationship("Tutor")


class TutorMessage(Base):
    """
    Tutor-to-tutor messaging system.
    Supports direct messages and broadcasts (to_tutor_id = NULL).
    """
    __tablename__ = "tutor_messages"
    __table_args__ = (
        Index('idx_message_from_tutor', 'from_tutor_id'),
        Index('idx_message_to_tutor', 'to_tutor_id'),
        Index('idx_message_reply_to', 'reply_to_id'),
        Index('idx_message_category', 'category'),
    )

    id = Column(Integer, primary_key=True, index=True)
    from_tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    to_tutor_id = Column(Integer, nullable=True)  # NULL = broadcast, -1 = group (recipients in message_recipients)
    subject = Column(String(200))
    message = Column(Text, nullable=False)
    priority = Column(String(20), default="Normal")  # Normal, High, Urgent
    category = Column(String(50))  # Reminder, Question, Announcement, Schedule, Handover
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, nullable=True)  # Set when message is edited
    reply_to_id = Column(Integer, ForeignKey("tutor_messages.id"), nullable=True)
    image_attachment = Column(String(500))  # KEEP for AppSheet compatibility (single URL)
    image_attachments = Column(JSON, default=list)  # NEW for webapp (multiple URLs)
    file_attachments = Column(JSON, default=list)  # Document attachments [{url, filename, content_type}]
    scheduled_at = Column(DateTime, nullable=True)  # NULL = send immediately, future datetime = scheduled

    # Relationships
    from_tutor = relationship("Tutor", foreign_keys=[from_tutor_id], backref="sent_messages")
    to_tutor = relationship("Tutor", primaryjoin="and_(TutorMessage.to_tutor_id == Tutor.id, TutorMessage.to_tutor_id > 0)", foreign_keys=[to_tutor_id], viewonly=True)
    replies = relationship("TutorMessage", backref="parent", remote_side=[id], foreign_keys=[reply_to_id])
    read_receipts = relationship("MessageReadReceipt", back_populates="message", cascade="all, delete-orphan")
    likes = relationship("MessageLike", back_populates="message", cascade="all, delete-orphan")
    archives = relationship("MessageArchive", back_populates="message", cascade="all, delete-orphan")
    pins = relationship("MessagePin", back_populates="message", cascade="all, delete-orphan")
    thread_pins = relationship("ThreadPin", back_populates="message", cascade="all, delete-orphan")
    thread_mutes = relationship("ThreadMute", back_populates="message", cascade="all, delete-orphan")
    message_snoozes = relationship("MessageSnooze", back_populates="message", cascade="all, delete-orphan")
    mentions = relationship("MessageMention", back_populates="message", cascade="all, delete-orphan")
    recipients = relationship("MessageRecipient", back_populates="message", cascade="all, delete-orphan")


class MessageReadReceipt(Base):
    """
    Tracks when tutors read messages.
    Used to calculate unread counts and show read status.
    """
    __tablename__ = "message_read_receipts"
    __table_args__ = (
        Index('idx_read_receipt_msg_tutor', 'message_id', 'tutor_id', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    read_at = Column(DateTime, server_default=func.now())

    # Relationships
    message = relationship("TutorMessage", back_populates="read_receipts")
    tutor = relationship("Tutor")


class MessageLike(Base):
    """
    Tracks message likes/reactions from tutors.
    """
    __tablename__ = "message_likes"
    __table_args__ = (
        Index('idx_like_msg_tutor_emoji', 'message_id', 'tutor_id', 'emoji'),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    action_type = Column(String(10), default="LIKE")  # LIKE or UNLIKE
    emoji = Column(String(10), default="❤️")  # Reaction emoji
    liked_at = Column(DateTime, server_default=func.now())

    # Relationships
    message = relationship("TutorMessage", back_populates="likes")
    tutor = relationship("Tutor")


class MessageArchive(Base):
    """
    Tracks archived messages per tutor.
    Similar pattern to MessageReadReceipt for per-user archiving.
    """
    __tablename__ = "message_archives"
    __table_args__ = (
        Index('idx_archive_msg_tutor', 'message_id', 'tutor_id', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    archived_at = Column(DateTime, server_default=func.now())

    # Relationships
    message = relationship("TutorMessage", back_populates="archives")
    tutor = relationship("Tutor")


class MessagePin(Base):
    """
    Tracks pinned/starred messages per tutor.
    Same pattern as MessageArchive for per-user pinning.
    """
    __tablename__ = "message_pins"
    __table_args__ = (
        Index('idx_pin_msg_tutor', 'message_id', 'tutor_id', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    pinned_at = Column(DateTime, server_default=func.now())

    # Relationships
    message = relationship("TutorMessage", back_populates="pins")
    tutor = relationship("Tutor")


class ThreadPin(Base):
    """
    Tracks threads pinned to top of thread list, per tutor.
    Separate from MessagePin (star/favorite) — this controls list position.
    """
    __tablename__ = "thread_pins"
    __table_args__ = (
        Index('idx_thread_pin_msg_tutor', 'message_id', 'tutor_id', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    pinned_at = Column(DateTime, server_default=func.now())

    # Relationships
    message = relationship("TutorMessage", back_populates="thread_pins")
    tutor = relationship("Tutor")


class MessageSnooze(Base):
    """Tracks snoozed threads per tutor — temporarily hidden until snooze_until."""
    __tablename__ = "message_snoozes"
    __table_args__ = (
        Index('idx_snooze_msg_tutor', 'message_id', 'tutor_id', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    snooze_until = Column(DateTime, nullable=False)
    snoozed_at = Column(DateTime, server_default=func.now())

    message = relationship("TutorMessage", back_populates="message_snoozes")
    tutor = relationship("Tutor")


class ThreadMute(Base):
    """Tracks muted threads per tutor — suppresses notifications."""
    __tablename__ = "thread_mutes"
    __table_args__ = (
        Index('idx_thread_mute_msg_tutor', 'message_id', 'tutor_id', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    muted_at = Column(DateTime, server_default=func.now())

    message = relationship("TutorMessage", back_populates="thread_mutes")
    tutor = relationship("Tutor")


class MessageTemplate(Base):
    """Reusable message templates. Global templates have tutor_id=NULL."""
    __tablename__ = "message_templates"

    id = Column(Integer, primary_key=True, index=True)
    tutor_id = Column(Integer, ForeignKey("tutors.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String(50), nullable=True)
    is_global = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    tutor = relationship("Tutor")


class MessageMention(Base):
    """Tracks @mentions in messages for notification routing."""
    __tablename__ = "message_mentions"
    __table_args__ = (
        Index('idx_mention_msg_tutor', 'message_id', 'mentioned_tutor_id', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE"), nullable=False)
    mentioned_tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    mentioned_at = Column(DateTime, server_default=func.now())

    message = relationship("TutorMessage", back_populates="mentions")
    tutor = relationship("Tutor")


class MessageRecipient(Base):
    """
    Junction table for group message recipients.
    Only populated when to_tutor_id = -1 (group message sentinel).
    """
    __tablename__ = "message_recipients"
    __table_args__ = (
        Index('idx_recipient_msg_tutor', 'message_id', 'tutor_id'),
        Index('idx_recipient_tutor', 'tutor_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)

    # Relationships
    message = relationship("TutorMessage", back_populates="recipients")
    tutor = relationship("Tutor")


class MakeupProposal(Base):
    """
    Make-up session proposals awaiting confirmation from target tutors.
    Allows tutors to propose 1-3 slot options for review before booking.
    """
    __tablename__ = "makeup_proposals"

    id = Column(Integer, primary_key=True, index=True)
    original_session_id = Column(Integer, ForeignKey("session_log.id"), nullable=False)
    proposed_by_tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)

    # Proposal type: 'specific_slots' (1-3 options) or 'needs_input' (ask main tutor)
    proposal_type = Column(String(20), nullable=False)  # specific_slots or needs_input

    # For needs_input: single target tutor (main tutor from enrollment)
    needs_input_tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=True)

    # Metadata
    notes = Column(Text, comment='Message from proposer to target tutors')
    status = Column(String(20), default='pending')  # pending, approved, rejected
    created_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)
    active_flag = Column(Integer, default=1, comment='Set to 1 when pending, NULL when resolved')

    # Link to auto-created message for discussion
    message_id = Column(Integer, ForeignKey("tutor_messages.id"), nullable=True)

    # Relationships
    original_session = relationship("SessionLog", foreign_keys=[original_session_id])
    proposed_by_tutor = relationship("Tutor", foreign_keys=[proposed_by_tutor_id])
    needs_input_tutor = relationship("Tutor", foreign_keys=[needs_input_tutor_id])
    message = relationship("TutorMessage", foreign_keys=[message_id])
    slots = relationship("MakeupProposalSlot", back_populates="proposal", cascade="all, delete-orphan")


class MakeupProposalSlot(Base):
    """
    Individual slot options within a make-up proposal.
    Each slot can have a different target tutor.
    """
    __tablename__ = "makeup_proposal_slots"

    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(Integer, ForeignKey("makeup_proposals.id", ondelete="CASCADE"), nullable=False)
    slot_order = Column(Integer, default=1, comment='1, 2, or 3 for ordering options')

    # Slot details
    proposed_date = Column(Date, nullable=False)
    proposed_time_slot = Column(String(100), nullable=False)
    proposed_tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    proposed_location = Column(String(100), nullable=False)

    # Slot-level status
    slot_status = Column(String(20), default='pending')  # pending, approved, rejected
    resolved_at = Column(DateTime, nullable=True)
    resolved_by_tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=True)
    rejection_reason = Column(Text, nullable=True)

    # Relationships
    proposal = relationship("MakeupProposal", back_populates="slots")
    proposed_tutor = relationship("Tutor", foreign_keys=[proposed_tutor_id])
    resolved_by_tutor = relationship("Tutor", foreign_keys=[resolved_by_tutor_id])


class ExamRevisionSlot(Base):
    """
    Exam revision slots allow tutors to create dedicated revision sessions
    linked to upcoming exams. Students can be enrolled into these slots
    by consuming their pending make-up sessions.
    """
    __tablename__ = "exam_revision_slots"

    id = Column(Integer, primary_key=True, index=True)
    calendar_event_id = Column(Integer, ForeignKey("calendar_events.id", ondelete="CASCADE"), nullable=False)
    session_date = Column(Date, nullable=False)
    time_slot = Column(String(50), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id", ondelete="CASCADE"), nullable=False)
    location = Column(String(100), nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(String(255))

    # Relationships
    calendar_event = relationship("CalendarEvent", back_populates="revision_slots")
    tutor = relationship("Tutor")
    sessions = relationship("SessionLog", back_populates="exam_revision_slot")


class DebugAuditLog(Base):
    """
    Audit log for Super Admin debug panel operations.
    Records who did what, when, and the before/after state of data changes.
    All write operations through the debug panel are logged here.
    """
    __tablename__ = "debug_audit_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Who performed the action
    admin_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    admin_email = Column(String(255), nullable=False, comment='Denormalized for historical record')

    # What was done
    operation = Column(String(20), nullable=False, comment='CREATE, UPDATE, DELETE')
    table_name = Column(String(100), nullable=False, index=True)
    row_id = Column(Integer, nullable=True, comment='NULL for CREATE before insert')

    # Before/after state for auditing
    before_state = Column(Text, nullable=True, comment='JSON snapshot before change')
    after_state = Column(Text, nullable=True, comment='JSON snapshot after change')
    changed_fields = Column(Text, nullable=True, comment='JSON list of changed field names')

    # Request context
    ip_address = Column(String(45), nullable=True)

    # When
    created_at = Column(DateTime, server_default=func.now(), index=True)

    # Relationship
    admin = relationship("Tutor", foreign_keys=[admin_id])


class WecomWebhook(Base):
    """
    WeCom group robot webhook configurations.
    Maps to wecom_webhooks table from migration 023.
    """
    __tablename__ = "wecom_webhooks"

    id = Column(Integer, primary_key=True, index=True)
    webhook_name = Column(String(100), nullable=False, unique=True, comment='Identifier like admin_group, tutor_group')
    webhook_url = Column(Text, nullable=False, comment='Full webhook URL with key from WeCom robot')
    target_description = Column(String(255), comment='Description of who receives these messages')
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime, nullable=True)
    total_messages_sent = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(String(255))
    notes = Column(Text)


class WecomMessageLog(Base):
    """
    Log of WeCom messages sent to groups.
    Maps to wecom_message_log table from migration 023.
    """
    __tablename__ = "wecom_message_log"

    id = Column(Integer, primary_key=True, index=True)
    webhook_name = Column(String(100), nullable=False)
    message_type = Column(String(50), comment='fee_reminder, attendance_alert, etc.')
    message_content = Column(Text, nullable=False)
    enrollment_id = Column(Integer, ForeignKey("enrollments.id", ondelete="SET NULL"), nullable=True)
    session_id = Column(Integer, ForeignKey("session_log.id", ondelete="SET NULL"), nullable=True)
    send_status = Column(String(20), default='pending', comment='pending, sent, failed')
    send_timestamp = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class TutorMemo(Base):
    """
    Tutor session memos for sessions that don't yet exist in the system.
    Created when a student shows up but their session hasn't been generated
    (e.g., admin forgot to renew enrollment). Auto-matched to sessions when
    enrollments are created.
    """
    __tablename__ = "tutor_memos"
    __table_args__ = (
        Index('idx_memo_student_date', 'student_id', 'memo_date'),
        Index('idx_memo_status', 'status'),
        Index('idx_memo_tutor', 'tutor_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    memo_date = Column(Date, nullable=False, comment='Date the lesson actually happened')
    time_slot = Column(String(50), comment='e.g. 16:45 - 18:15')
    location = Column(String(50), comment='MSA, MSB, etc.')
    notes = Column(Text, comment='Free-form tutor observations')
    exercises = Column(JSON, comment='Array of exercise objects matching ExerciseCreateRequest shape')
    performance_rating = Column(String(10), comment='Star emoji rating like sessions')
    linked_session_id = Column(Integer, ForeignKey("session_log.id", ondelete="SET NULL"), nullable=True,
                               comment='Set when auto-matched or manually linked to a session')
    status = Column(String(20), nullable=False, default='pending',
                    comment='pending = awaiting session, linked = imported into session')
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_by = Column(String(255), comment='Tutor email who created the memo')

    # Relationships
    student = relationship("Student", foreign_keys=[student_id])
    tutor = relationship("Tutor", foreign_keys=[tutor_id])
    linked_session = relationship("SessionLog", back_populates="tutor_memo", foreign_keys=[linked_session_id])


class DocumentFolder(Base):
    """Hierarchical folders for organizing documents."""
    __tablename__ = "document_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    parent_id = Column(Integer, ForeignKey("document_folders.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    parent = relationship("DocumentFolder", remote_side="DocumentFolder.id", backref="children")
    creator = relationship("Tutor", foreign_keys=[created_by])


class Document(Base):
    """Courseware documents — worksheets, exams, and lesson plans."""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, default="Untitled Document")
    doc_type = Column(String(20), nullable=False, comment="worksheet or lesson_plan")
    content = Column(JSON, comment="TipTap JSON document")
    page_layout = Column(JSON, comment="Page layout settings (margins, header/footer, watermark)")
    created_by = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())
    updated_by = Column(Integer, ForeignKey("tutors.id"), nullable=True)
    is_archived = Column(Boolean, default=False)
    archived_at = Column(DateTime, nullable=True)
    is_template = Column(Boolean, default=False)
    is_starred = Column(Boolean, default=False)
    locked_by = Column(Integer, ForeignKey("tutors.id"), nullable=True)
    lock_expires_at = Column(DateTime, nullable=True)
    tags = Column(JSON, default=list)
    folder_id = Column(Integer, ForeignKey("document_folders.id"), nullable=True)
    parent_id = Column(Integer, ForeignKey("documents.id"), nullable=True)

    last_version_at = Column(DateTime, nullable=True)
    source_filename = Column(String(500), nullable=True, comment="Original filename or courseware path of imported source")
    questions = Column(JSON, nullable=True, comment="Extracted question metadata: boundaries, topics, difficulty")
    solutions = Column(JSON, nullable=True, comment="AI-generated solutions per question: {index: {text, topic, subtopic, difficulty}}")
    variants = Column(JSON, nullable=True, comment="AI-generated variant questions per question: {index: {text, solution_text}}")
    search_text = Column(Text, nullable=True)

    creator = relationship("Tutor", foreign_keys=[created_by])
    updater = relationship("Tutor", foreign_keys=[updated_by])
    locker = relationship("Tutor", foreign_keys=[locked_by])
    folder = relationship("DocumentFolder", foreign_keys=[folder_id])
    parent = relationship("Document", remote_side="Document.id", foreign_keys=[parent_id], backref="children")
    versions = relationship("DocumentVersion", back_populates="document", cascade="all, delete-orphan")


class DocumentVersion(Base):
    """Snapshot of a document at a point in time (auto, manual checkpoint, or session start)."""
    __tablename__ = "document_versions"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(JSON, nullable=False)
    page_layout = Column(JSON, nullable=True)
    created_by = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    version_type = Column(String(20), nullable=False, default="auto")
    label = Column(String(255), nullable=True)

    document = relationship("Document", back_populates="versions")
    creator = relationship("Tutor", foreign_keys=[created_by])


class PushSubscription(Base):
    """Web Push notification subscriptions per tutor per browser."""
    __tablename__ = "push_subscriptions"
    __table_args__ = (
        Index('idx_push_sub_tutor', 'tutor_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(String(255), nullable=False)
    auth = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=func.now())

    tutor = relationship("Tutor")


# ============================================
# Summer Course Models
# ============================================

class SummerCourseConfig(Base):
    """Admin-defined summer course parameters per year."""
    __tablename__ = "summer_course_configs"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False, unique=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    application_open_date = Column(DateTime, nullable=False)
    application_close_date = Column(DateTime, nullable=False)
    course_start_date = Column(Date, nullable=False)
    course_end_date = Column(Date, nullable=False)
    total_lessons = Column(Integer, nullable=False, default=8)
    pricing_config = Column(JSON, nullable=False)
    locations = Column(JSON, nullable=False, default=list)
    available_grades = Column(JSON, nullable=False, default=list)
    time_slots = Column(JSON, nullable=False, default=list)
    existing_student_options = Column(JSON, default=list)
    center_options = Column(JSON, default=list)
    text_content = Column(JSON, default=dict)
    banner_image_url = Column(String(500))
    is_active = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    applications = relationship("SummerApplication", back_populates="config")
    buddy_groups = relationship("SummerBuddyGroup", back_populates="config")
    slots = relationship("SummerCourseSlot", back_populates="config")


class SummerBuddyGroup(Base):
    """Buddy groups for group discount eligibility."""
    __tablename__ = "summer_buddy_groups"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("summer_course_configs.id"), nullable=True)
    year = Column(Integer)
    buddy_code = Column(String(20), nullable=False, unique=True)
    created_at = Column(DateTime, server_default=func.now())

    config = relationship("SummerCourseConfig", back_populates="buddy_groups")
    applications = relationship("SummerApplication", back_populates="buddy_group")
    members = relationship("SummerBuddyMember", back_populates="buddy_group", cascade="all, delete-orphan")


class SummerBuddyMember(Base):
    """Primary branch buddy group members tracked by branch staff."""
    __tablename__ = "summer_buddy_members"

    id = Column(Integer, primary_key=True, index=True)
    buddy_group_id = Column(Integer, ForeignKey("summer_buddy_groups.id"), nullable=False)
    student_id = Column(String(50), nullable=False)
    student_name_en = Column(String(255), nullable=False)
    student_name_zh = Column(String(255))
    parent_phone = Column(String(50))
    source_branch = Column(String(10), nullable=False)
    is_sibling = Column(Boolean, nullable=False, default=False)
    year = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    buddy_group = relationship("SummerBuddyGroup", back_populates="members")


class BuddyAccessCard(Base):
    """RFID access cards for buddy tracker authentication."""
    __tablename__ = "buddy_access_cards"

    id = Column(Integer, primary_key=True, index=True)
    card_number = Column(String(20), nullable=False, unique=True, index=True)
    branch = Column(String(10), nullable=False)
    staff_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SummerApplication(Base):
    """Public summer course application submitted via form."""
    __tablename__ = "summer_applications"
    __table_args__ = (
        Index('idx_app_config', 'config_id'),
        Index('idx_app_status', 'application_status'),
        Index('idx_app_phone', 'contact_phone'),
        Index('idx_app_grade', 'grade'),
        Index('idx_app_buddy', 'buddy_group_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("summer_course_configs.id"), nullable=False)
    reference_code = Column(String(20), nullable=False, unique=True)
    # Student info
    student_name = Column(String(255), nullable=False)
    school = Column(String(255))
    grade = Column(String(50), nullable=False)
    lang_stream = Column(String(10))
    is_existing_student = Column(String(100))
    current_centers = Column(JSON, default=None)
    # Contact
    wechat_id = Column(String(100))
    contact_phone = Column(String(50))
    # Location & preferences
    preferred_location = Column(String(255))
    preference_1_day = Column(String(20))
    preference_1_time = Column(String(50))
    preference_2_day = Column(String(20))
    preference_2_time = Column(String(50))
    unavailability_notes = Column(Text)
    # Buddy group
    buddy_group_id = Column(Integer, ForeignKey("summer_buddy_groups.id"), nullable=True)
    buddy_names = Column(Text)
    # Existing student link
    existing_student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    # Status
    application_status = Column(
        Enum('Submitted', 'Under Review', 'Placement Offered', 'Placement Confirmed',
             'Fee Sent', 'Paid', 'Enrolled', 'Waitlisted', 'Withdrawn', 'Rejected',
             name='summer_application_status_enum'),
        nullable=False, default='Submitted'
    )
    admin_notes = Column(Text)
    # Metadata
    submitted_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    reviewed_by = Column(String(255))
    reviewed_at = Column(DateTime)
    form_language = Column(String(10), default='zh')
    sessions_per_week = Column(Integer, nullable=False, default=1)

    config = relationship("SummerCourseConfig", back_populates="applications")
    buddy_group = relationship("SummerBuddyGroup", back_populates="applications")
    existing_student = relationship("Student")
    sessions = relationship("SummerSession", back_populates="application")

    @property
    def buddy_code(self):
        return self.buddy_group.buddy_code if self.buddy_group else None


class SummerCourseSlot(Base):
    """Available time slot for summer course timetable."""
    __tablename__ = "summer_course_slots"
    __table_args__ = (
        Index('idx_slot_config', 'config_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("summer_course_configs.id"), nullable=False)
    slot_day = Column(String(20), nullable=False)
    time_slot = Column(String(50), nullable=False)
    location = Column(String(255), nullable=False)
    grade = Column(String(50))
    slot_label = Column(String(100), nullable=True)
    course_type = Column(String(10))
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=True)
    max_students = Column(Integer, nullable=False, default=8)
    created_at = Column(DateTime, server_default=func.now())

    config = relationship("SummerCourseConfig", back_populates="slots")
    tutor = relationship("Tutor")
    sessions = relationship("SummerSession", back_populates="slot")
    lessons = relationship("SummerLesson", back_populates="slot", cascade="all, delete-orphan")


class SummerLesson(Base):
    """Materialized lesson (class meeting) for a specific slot + date.
    Each row represents one class meeting with an editable lesson_number.
    """
    __tablename__ = "summer_lessons"
    __table_args__ = (
        UniqueConstraint('slot_id', 'lesson_date', name='uq_slot_date'),
        Index('idx_lesson_lookup', 'slot_id', 'lesson_date', 'lesson_number'),
        Index('idx_lesson_date', 'lesson_date'),
    )

    id = Column(Integer, primary_key=True, index=True)
    slot_id = Column(Integer, ForeignKey("summer_course_slots.id", ondelete="CASCADE"), nullable=False)
    lesson_date = Column(Date, nullable=False)
    lesson_number = Column(Integer, nullable=False)
    lesson_status = Column(String(20), nullable=False, default="Scheduled")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    slot = relationship("SummerCourseSlot", back_populates="lessons")
    sessions = relationship("SummerSession", back_populates="lesson")


class SummerSession(Base):
    """Per-student session booking into a summer course slot/lesson."""
    __tablename__ = "summer_sessions"
    __table_args__ = (
        Index('idx_session_app', 'application_id'),
        Index('idx_session_slot', 'slot_id'),
        Index('idx_session_lesson', 'lesson_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("summer_applications.id", ondelete="CASCADE"), nullable=False)
    slot_id = Column(Integer, ForeignKey("summer_course_slots.id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(Integer, ForeignKey("summer_lessons.id", ondelete="SET NULL"), nullable=True)
    lesson_number = Column(Integer, nullable=True)
    specific_date = Column(Date, nullable=True)
    session_status = Column(
        Enum('Tentative', 'Confirmed', 'Cancelled', name='summer_placement_status_enum'),
        nullable=False, default='Tentative'
    )
    placed_at = Column(DateTime, server_default=func.now())
    placed_by = Column(String(255))

    application = relationship("SummerApplication", back_populates="sessions")
    slot = relationship("SummerCourseSlot", back_populates="sessions")
    lesson = relationship("SummerLesson", back_populates="sessions")


class SummerTutorDuty(Base):
    """Track which tutors are on duty for specific day+time_slot+location combinations."""
    __tablename__ = "summer_tutor_duties"
    __table_args__ = (
        UniqueConstraint('config_id', 'tutor_id', 'location', 'duty_day', 'time_slot', name='uq_duty'),
        Index('idx_duty_lookup', 'config_id', 'location', 'duty_day', 'time_slot'),
    )

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("summer_course_configs.id", ondelete="CASCADE"), nullable=False)
    tutor_id = Column(Integer, ForeignKey("tutors.id", ondelete="CASCADE"), nullable=False)
    location = Column(String(255), nullable=False)
    duty_day = Column(String(20), nullable=False)
    time_slot = Column(String(50), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    config = relationship("SummerCourseConfig")
    tutor = relationship("Tutor")


# ============================================
# Primary Prospect Models (P6 → Secondary feeder)
# ============================================

class PrimaryProspect(Base):
    """P6 student prospect submitted by primary branch tutors for secondary transition."""
    __tablename__ = "primary_prospects"
    __table_args__ = (
        Index('idx_prospect_year_branch', 'year', 'source_branch'),
        Index('idx_prospect_phone1', 'phone_1'),
        Index('idx_prospect_phone2', 'phone_2'),
        Index('idx_prospect_status', 'status'),
    )

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False)
    source_branch = Column(String(20), nullable=False)  # MAC, MCP, MNT, MTA, MLT, MTR, MOT
    primary_student_id = Column(String(50))  # branch's internal ID
    student_name = Column(String(255), nullable=False)
    school = Column(String(255))
    grade = Column(String(20))
    tutor_name = Column(String(255))

    # Contact
    phone_1 = Column(String(20))
    phone_1_relation = Column(String(20))  # Mum, Dad, Guardian, Other
    phone_2 = Column(String(20))
    phone_2_relation = Column(String(20))
    wechat_id = Column(String(100))

    # Tutor's notes
    tutor_remark = Column(Text)

    # Structured intention
    wants_summer = Column(String(20), default='Considering')
    wants_regular = Column(String(20), default='Considering')
    preferred_branches = Column(JSON, default=list)
    preferred_time_note = Column(Text)
    preferred_tutor_note = Column(Text)
    sibling_info = Column(Text)

    # Tracking (admin-managed)
    outreach_status = Column(String(30), nullable=False, default='Not Started')
    contact_notes = Column(Text)
    status = Column(String(20), nullable=False, default='New')

    # Linking
    summer_application_id = Column(Integer, ForeignKey("summer_applications.id"), nullable=True)

    # Audit
    submitted_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    edit_history = Column(JSON, default=list)

    summer_application = relationship("SummerApplication")
class ReportShare(Base):
    """Shareable parent report snapshots with token-based access."""
    __tablename__ = "report_shares"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(36), unique=True, nullable=False, index=True)
    report_data = Column(JSON, nullable=False)
    student_id = Column(Integer, nullable=True)
    created_by = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    created_at = Column(DateTime, default=func.now())
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    view_count = Column(Integer, default=0)

    creator = relationship("Tutor")


class StudentRadarConfig(Base):
    """Per-student radar chart attribute/score presets."""
    __tablename__ = "student_radar_configs"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, unique=True)
    tutor_id = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    config = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    student = relationship("Student")
    tutor = relationship("Tutor")


class WaitlistEntry(Base):
    """Waitlist entry for prospective students or slot change requests."""
    __tablename__ = "waitlist_entries"
    __table_args__ = (
        Index('idx_waitlist_active', 'is_active'),
        Index('idx_waitlist_grade', 'grade'),
        Index('idx_waitlist_student', 'student_id'),
        Index('idx_waitlist_created', 'created_at'),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_name = Column(String(255), nullable=False)
    school = Column(String(255), nullable=False)
    grade = Column(String(50), nullable=False)
    lang_stream = Column(String(50), nullable=True)
    phone = Column(String(50), nullable=False)
    parent_name = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    entry_type = Column(String(20), nullable=False, default='New')
    student_id = Column(Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    student = relationship("Student")
    creator = relationship("Tutor", foreign_keys=[created_by])
    slot_preferences = relationship("WaitlistSlotPreference", back_populates="entry", cascade="all, delete-orphan")


class WaitlistSlotPreference(Base):
    """Preferred day/time/location for a waitlist entry."""
    __tablename__ = "waitlist_slot_preferences"

    id = Column(Integer, primary_key=True, index=True)
    waitlist_entry_id = Column(Integer, ForeignKey("waitlist_entries.id", ondelete="CASCADE"), nullable=False)
    location = Column(String(100), nullable=False)
    day_of_week = Column(String(10), nullable=True)
    time_slot = Column(String(50), nullable=True)

    entry = relationship("WaitlistEntry", back_populates="slot_preferences")


class SavedReport(Base):
    """Internal saved report snapshots for tutor reference."""
    __tablename__ = "saved_reports"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    report_data = Column(JSON, nullable=False)
    label = Column(String(200), nullable=True)
    created_by = Column(Integer, ForeignKey("tutors.id"), nullable=False)
    created_at = Column(DateTime, default=func.now())

    creator = relationship("Tutor")
