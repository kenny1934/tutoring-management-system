"""
Pydantic schemas for API request/response validation.
These define the structure of data sent to and from the API.
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal


# ============================================
# Student Schemas
# ============================================

class StudentBase(BaseModel):
    """Base student schema with common fields"""
    school_student_id: Optional[str] = None
    student_name: str
    grade: Optional[str] = None
    phone: Optional[str] = None
    school: Optional[str] = None
    lang_stream: Optional[str] = None
    home_location: Optional[str] = None
    academic_stream: Optional[str] = None


class StudentResponse(StudentBase):
    """Student response with ID and enrollment count"""
    id: int
    enrollment_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class StudentDetailResponse(StudentResponse):
    """Detailed student response with enrollment history"""
    enrollments: List['EnrollmentResponse'] = []

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Tutor Schemas
# ============================================

class TutorBase(BaseModel):
    """Base tutor schema"""
    user_email: str
    tutor_name: str
    default_location: Optional[str] = None
    role: str
    basic_salary: Optional[Decimal] = None


class TutorResponse(TutorBase):
    """Tutor response"""
    id: int

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Enrollment Schemas
# ============================================

class EnrollmentBase(BaseModel):
    """Base enrollment schema"""
    student_id: int
    tutor_id: int
    assigned_day: Optional[str] = None
    assigned_time: Optional[str] = None
    location: Optional[str] = None
    lessons_paid: Optional[int] = None
    payment_date: Optional[date] = None
    first_lesson_date: Optional[date] = None
    payment_status: str = 'Pending Payment'
    enrollment_type: str = 'Regular'


class EnrollmentResponse(EnrollmentBase):
    """Enrollment response with relationships"""
    id: int
    student_name: Optional[str] = None
    tutor_name: Optional[str] = None
    discount_name: Optional[str] = None
    grade: Optional[str] = None
    school: Optional[str] = None
    lang_stream: Optional[str] = None
    deadline_extension_weeks: Optional[int] = 0
    last_modified_time: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Session Schemas
# ============================================

class SessionBase(BaseModel):
    """Base session schema"""
    enrollment_id: Optional[int] = None
    student_id: int
    tutor_id: int
    session_date: date
    time_slot: Optional[str] = None
    location: Optional[str] = None
    session_status: str = 'Scheduled'
    financial_status: str = 'Unpaid'


class SessionResponse(SessionBase):
    """Session response with student/tutor names and details"""
    id: int
    student_name: Optional[str] = None
    tutor_name: Optional[str] = None
    school_student_id: Optional[str] = None
    grade: Optional[str] = None
    lang_stream: Optional[str] = None
    school: Optional[str] = None
    performance_rating: Optional[str] = None
    notes: Optional[str] = None
    last_modified_time: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Session Exercise Schemas
# ============================================

class SessionExerciseResponse(BaseModel):
    """Session exercise (classwork/homework) response"""
    id: int
    session_id: int
    exercise_type: str
    pdf_name: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    created_by: str
    created_at: Optional[datetime] = None
    remarks: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HomeworkCompletionResponse(BaseModel):
    """Homework completion tracking response"""
    id: int
    current_session_id: int
    session_exercise_id: int
    student_id: int
    completion_status: Optional[str] = None
    submitted: bool = False
    tutor_comments: Optional[str] = None
    checked_by: Optional[int] = None
    checked_at: Optional[datetime] = None
    pdf_name: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    homework_assigned_date: Optional[date] = None
    assigned_by_tutor_id: Optional[int] = None
    assigned_by_tutor: Optional[str] = None

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
    id: int
    enrollment_id: Optional[int] = None
    student_id: Optional[int] = None
    tutor_id: Optional[int] = None
    session_date: Optional[date] = None
    time_slot: Optional[str] = None
    location: Optional[str] = None
    session_status: Optional[str] = None
    financial_status: Optional[str] = None

    # Student info
    school_student_id: Optional[str] = None
    student_name: Optional[str] = None
    grade: Optional[str] = None
    school: Optional[str] = None
    lang_stream: Optional[str] = None

    # Tutor info
    tutor_name: Optional[str] = None

    # Current week info
    current_week_number: Optional[int] = None
    current_academic_year: Optional[str] = None

    # Last year's curriculum suggestions (3 weeks)
    week_before_topic: Optional[str] = None
    week_before_number: Optional[int] = None
    same_week_topic: Optional[str] = None
    same_week_number: Optional[int] = None
    week_after_topic: Optional[str] = None
    week_after_number: Optional[int] = None

    # Primary suggestion and formatted display
    primary_suggestion: Optional[str] = None
    suggestions_display: Optional[str] = None
    user_friendly_display: Optional[str] = None
    options_for_buttons: Optional[str] = None

    # Metadata
    suggestion_count: Optional[int] = None
    coverage_status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Dashboard Stats Schemas
# ============================================

class DashboardStats(BaseModel):
    """Dashboard summary statistics"""
    total_students: int
    active_students: int
    total_enrollments: int
    active_enrollments: int
    pending_payment_enrollments: int
    sessions_this_month: int
    sessions_this_week: int
    revenue_this_month: Optional[Decimal] = None


# ============================================
# Query Parameter Schemas
# ============================================

class EnrollmentFilters(BaseModel):
    """Query parameters for filtering enrollments"""
    student_id: Optional[int] = None
    tutor_id: Optional[int] = None
    location: Optional[str] = None
    payment_status: Optional[str] = None
    enrollment_type: Optional[str] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None


class SessionFilters(BaseModel):
    """Query parameters for filtering sessions"""
    student_id: Optional[int] = None
    tutor_id: Optional[int] = None
    location: Optional[str] = None
    session_status: Optional[str] = None
    financial_status: Optional[str] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None


# ============================================
# Calendar Event Schemas
# ============================================

class CalendarEventResponse(BaseModel):
    """Calendar event from Google Calendar"""
    id: int
    event_id: str
    title: str
    description: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    school: Optional[str] = None
    grade: Optional[str] = None
    academic_stream: Optional[str] = None
    event_type: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_synced_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpcomingTestAlert(BaseModel):
    """Upcoming test/exam alert with countdown"""
    id: int
    event_id: str
    title: str
    description: Optional[str] = None
    start_date: str  # ISO format
    end_date: Optional[str] = None  # ISO format
    school: str
    grade: str
    academic_stream: Optional[str] = None
    event_type: str
    days_until: int  # Number of days until the test


# Enable forward references for nested models
StudentDetailResponse.model_rebuild()
DetailedSessionResponse.model_rebuild()
