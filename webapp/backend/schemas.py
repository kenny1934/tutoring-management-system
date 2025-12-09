"""
Pydantic schemas for API request/response validation.
These define the structure of data sent to and from the API.
"""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal


# ============================================
# Student Schemas
# ============================================

class StudentBase(BaseModel):
    """Base student schema with common fields"""
    school_student_id: Optional[str] = Field(None, max_length=50)
    student_name: str = Field(..., min_length=1, max_length=200)
    grade: Optional[str] = Field(None, max_length=20)
    phone: Optional[str] = Field(None, max_length=20)
    school: Optional[str] = Field(None, max_length=200)
    lang_stream: Optional[str] = Field(None, max_length=50)
    home_location: Optional[str] = Field(None, max_length=200)
    academic_stream: Optional[str] = Field(None, max_length=50)


class StudentResponse(StudentBase):
    """Student response with ID and enrollment count"""
    id: int = Field(..., gt=0)
    enrollment_count: Optional[int] = Field(0, ge=0)

    model_config = ConfigDict(from_attributes=True)


class StudentDetailResponse(StudentResponse):
    """Detailed student response with enrollment history"""
    enrollments: List['EnrollmentResponse'] = []

    model_config = ConfigDict(from_attributes=True)


class StudentBasic(BaseModel):
    """Minimal student info for lists/popovers"""
    id: int
    school_student_id: Optional[str] = None
    student_name: str
    grade: Optional[str] = None
    lang_stream: Optional[str] = None
    school: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Tutor Schemas
# ============================================

class TutorBase(BaseModel):
    """Base tutor schema"""
    user_email: str = Field(..., min_length=3, max_length=255)
    tutor_name: str = Field(..., min_length=1, max_length=200)
    default_location: Optional[str] = Field(None, max_length=200)
    role: str = Field(..., max_length=50)
    basic_salary: Optional[Decimal] = Field(None, ge=0)


class TutorResponse(TutorBase):
    """Tutor response"""
    id: int = Field(..., gt=0)

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Enrollment Schemas
# ============================================

class EnrollmentBase(BaseModel):
    """Base enrollment schema"""
    student_id: int = Field(..., gt=0)
    tutor_id: int = Field(..., gt=0)
    assigned_day: Optional[str] = Field(None, max_length=20)
    assigned_time: Optional[str] = Field(None, max_length=20)
    location: Optional[str] = Field(None, max_length=200)
    lessons_paid: Optional[int] = Field(None, ge=0)
    payment_date: Optional[date] = None
    first_lesson_date: Optional[date] = None
    payment_status: str = Field('Pending Payment', max_length=50)
    enrollment_type: str = Field('Regular', max_length=50)


class EnrollmentResponse(EnrollmentBase):
    """Enrollment response with relationships"""
    id: int = Field(..., gt=0)
    student_name: Optional[str] = Field(None, max_length=200)
    tutor_name: Optional[str] = Field(None, max_length=200)
    discount_name: Optional[str] = Field(None, max_length=100)
    grade: Optional[str] = Field(None, max_length=20)
    school: Optional[str] = Field(None, max_length=200)
    lang_stream: Optional[str] = Field(None, max_length=50)
    deadline_extension_weeks: Optional[int] = Field(0, ge=0)
    last_modified_time: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Session Schemas
# ============================================

class SessionBase(BaseModel):
    """Base session schema"""
    enrollment_id: Optional[int] = Field(None, gt=0)
    student_id: int = Field(..., gt=0)
    tutor_id: int = Field(..., gt=0)
    session_date: date
    time_slot: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=200)
    session_status: str = Field('Scheduled', max_length=50)
    financial_status: str = Field('Unpaid', max_length=50)


class LinkedSessionInfo(BaseModel):
    """Compact session info for linked session display (make-up/original)"""
    id: int
    session_date: date
    time_slot: Optional[str] = None
    tutor_name: Optional[str] = None
    session_status: str

    model_config = ConfigDict(from_attributes=True)


class SessionResponse(SessionBase):
    """Session response with student/tutor names and details"""
    id: int = Field(..., gt=0)
    student_name: Optional[str] = Field(None, max_length=200)
    tutor_name: Optional[str] = Field(None, max_length=200)
    school_student_id: Optional[str] = Field(None, max_length=50)
    grade: Optional[str] = Field(None, max_length=20)
    lang_stream: Optional[str] = Field(None, max_length=50)
    school: Optional[str] = Field(None, max_length=200)
    performance_rating: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)
    last_modified_time: Optional[datetime] = None
    previous_session_status: Optional[str] = Field(None, max_length=50)
    rescheduled_to_id: Optional[int] = Field(None, gt=0)
    make_up_for_id: Optional[int] = Field(None, gt=0)
    rescheduled_to: Optional[LinkedSessionInfo] = None
    make_up_for: Optional[LinkedSessionInfo] = None
    exercises: List["SessionExerciseResponse"] = []

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Session Exercise Schemas
# ============================================

class SessionExerciseResponse(BaseModel):
    """Session exercise (classwork/homework) response"""
    id: int = Field(..., gt=0)
    session_id: int = Field(..., gt=0)
    exercise_type: str = Field(..., max_length=50)
    pdf_name: str = Field(..., min_length=1, max_length=500)
    page_start: Optional[int] = Field(None, gt=0)
    page_end: Optional[int] = Field(None, gt=0)
    created_by: str = Field(..., max_length=200)
    created_at: Optional[datetime] = None
    remarks: Optional[str] = Field(None, max_length=1000)

    model_config = ConfigDict(from_attributes=True)


class HomeworkCompletionResponse(BaseModel):
    """Homework completion tracking response"""
    id: int = Field(..., gt=0)
    current_session_id: int = Field(..., gt=0)
    session_exercise_id: int = Field(..., gt=0)
    student_id: int = Field(..., gt=0)
    completion_status: Optional[str] = Field(None, max_length=50)
    submitted: bool = False
    tutor_comments: Optional[str] = Field(None, max_length=1000)
    checked_by: Optional[int] = Field(None, gt=0)
    checked_at: Optional[datetime] = None
    pdf_name: Optional[str] = Field(None, max_length=500)
    page_start: Optional[int] = Field(None, gt=0)
    page_end: Optional[int] = Field(None, gt=0)
    homework_assigned_date: Optional[date] = None
    assigned_by_tutor_id: Optional[int] = Field(None, gt=0)
    assigned_by_tutor: Optional[str] = Field(None, max_length=200)

    model_config = ConfigDict(from_attributes=True)


class DetailedSessionResponse(SessionResponse):
    """Detailed session response with exercises and homework completion"""
    exercises: List[SessionExerciseResponse] = []
    homework_completion: List[HomeworkCompletionResponse] = []
    previous_session: Optional['DetailedSessionResponse'] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Curriculum Suggestion Schemas
# ============================================

class CurriculumSuggestionResponse(BaseModel):
    """Curriculum suggestion from last year's curriculum for a session"""
    id: int = Field(..., gt=0)
    enrollment_id: Optional[int] = Field(None, gt=0)
    student_id: Optional[int] = Field(None, gt=0)
    tutor_id: Optional[int] = Field(None, gt=0)
    session_date: Optional[date] = None
    time_slot: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=200)
    session_status: Optional[str] = Field(None, max_length=50)
    financial_status: Optional[str] = Field(None, max_length=50)

    # Student info
    school_student_id: Optional[str] = Field(None, max_length=50)
    student_name: Optional[str] = Field(None, max_length=200)
    grade: Optional[str] = Field(None, max_length=20)
    school: Optional[str] = Field(None, max_length=200)
    lang_stream: Optional[str] = Field(None, max_length=50)

    # Tutor info
    tutor_name: Optional[str] = Field(None, max_length=200)

    # Current week info
    current_week_number: Optional[int] = Field(None, ge=1, le=53)
    current_academic_year: Optional[str] = Field(None, max_length=20)

    # Last year's curriculum suggestions (3 weeks)
    week_before_topic: Optional[str] = Field(None, max_length=500)
    week_before_number: Optional[int] = Field(None, ge=1, le=53)
    same_week_topic: Optional[str] = Field(None, max_length=500)
    same_week_number: Optional[int] = Field(None, ge=1, le=53)
    week_after_topic: Optional[str] = Field(None, max_length=500)
    week_after_number: Optional[int] = Field(None, ge=1, le=53)

    # Primary suggestion and formatted display
    primary_suggestion: Optional[str] = Field(None, max_length=500)
    suggestions_display: Optional[str] = Field(None, max_length=2000)
    user_friendly_display: Optional[str] = Field(None, max_length=2000)
    options_for_buttons: Optional[str] = Field(None, max_length=1000)

    # Metadata
    suggestion_count: Optional[int] = Field(None, ge=0)
    coverage_status: Optional[str] = Field(None, max_length=100)

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Dashboard Stats Schemas
# ============================================

class DashboardStats(BaseModel):
    """Dashboard summary statistics"""
    total_students: int = Field(..., ge=0)
    active_students: int = Field(..., ge=0)
    total_enrollments: int = Field(..., ge=0)
    active_enrollments: int = Field(..., ge=0)
    pending_payment_enrollments: int = Field(..., ge=0)
    sessions_this_month: int = Field(..., ge=0)
    sessions_this_week: int = Field(..., ge=0)
    revenue_this_month: Optional[Decimal] = Field(None, ge=0)


class ActivityEvent(BaseModel):
    """Activity feed event for dashboard"""
    id: str = Field(..., min_length=1)
    type: str = Field(..., max_length=50)
    title: str = Field(..., max_length=100)
    student: str = Field(..., max_length=200)
    school_student_id: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=200)
    timestamp: datetime
    link: Optional[str] = Field(None, max_length=200)


# ============================================
# Query Parameter Schemas
# ============================================

class EnrollmentFilters(BaseModel):
    """Query parameters for filtering enrollments"""
    student_id: Optional[int] = Field(None, gt=0)
    tutor_id: Optional[int] = Field(None, gt=0)
    location: Optional[str] = Field(None, max_length=200)
    payment_status: Optional[str] = Field(None, max_length=50)
    enrollment_type: Optional[str] = Field(None, max_length=50)
    from_date: Optional[date] = None
    to_date: Optional[date] = None


class SessionFilters(BaseModel):
    """Query parameters for filtering sessions"""
    student_id: Optional[int] = Field(None, gt=0)
    tutor_id: Optional[int] = Field(None, gt=0)
    location: Optional[str] = Field(None, max_length=200)
    session_status: Optional[str] = Field(None, max_length=50)
    financial_status: Optional[str] = Field(None, max_length=50)
    from_date: Optional[date] = None
    to_date: Optional[date] = None


# ============================================
# Calendar Event Schemas
# ============================================

class CalendarEventResponse(BaseModel):
    """Calendar event from Google Calendar"""
    id: int = Field(..., gt=0)
    event_id: str = Field(..., min_length=1, max_length=255)
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    start_date: date
    end_date: Optional[date] = None
    school: Optional[str] = Field(None, max_length=200)
    grade: Optional[str] = Field(None, max_length=20)
    academic_stream: Optional[str] = Field(None, max_length=50)
    event_type: Optional[str] = Field(None, max_length=50)
    created_at: datetime
    updated_at: datetime
    last_synced_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpcomingTestAlert(BaseModel):
    """Upcoming test/exam alert with countdown"""
    id: int = Field(..., gt=0)
    event_id: str = Field(..., min_length=1, max_length=255)
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    start_date: str = Field(..., min_length=1)  # ISO format
    end_date: Optional[str] = Field(None, min_length=1)  # ISO format
    school: str = Field(..., max_length=200)
    grade: str = Field(..., max_length=20)
    academic_stream: Optional[str] = Field(None, max_length=50)
    event_type: str = Field(..., max_length=50)
    days_until: int = Field(..., ge=0)  # Number of days until the test


# Enable forward references for nested models
SessionResponse.model_rebuild()
StudentDetailResponse.model_rebuild()
DetailedSessionResponse.model_rebuild()
