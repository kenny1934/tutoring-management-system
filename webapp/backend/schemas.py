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
    deadline_extension_weeks: int = 0
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
    """Session response with student/tutor names"""
    id: int
    student_name: Optional[str] = None
    tutor_name: Optional[str] = None
    performance_rating: Optional[str] = None
    notes: Optional[str] = None
    last_modified_time: Optional[datetime] = None

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


# Enable forward references for nested models
StudentDetailResponse.model_rebuild()
