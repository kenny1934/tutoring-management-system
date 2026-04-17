"""
Pydantic schemas for API request/response validation.
These define the structure of data sent to and from the API.
"""
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import Any, Literal, Optional, List, Dict
from datetime import date, datetime
from decimal import Decimal

from constants import SummerApplicationStatus


# ============================================
# Student Schemas
# ============================================

class StudentContact(BaseModel):
    """A single contact entry with phone and relationship label"""
    phone: str = Field(..., max_length=20)
    label: Optional[str] = Field(None, max_length=50)


class StudentBase(BaseModel):
    """Base student schema with common fields"""
    school_student_id: Optional[str] = Field(None, max_length=50)
    student_name: str = Field(..., min_length=1, max_length=200)
    grade: Optional[str] = Field(None, max_length=20)
    phone: Optional[str] = Field(None, max_length=20)
    contacts: Optional[List[StudentContact]] = None
    school: Optional[str] = Field(None, max_length=200)
    lang_stream: Optional[str] = Field(None, max_length=50)
    home_location: Optional[str] = Field(None, max_length=200)
    academic_stream: Optional[str] = Field(None, max_length=50)
    is_staff_referral: Optional[bool] = Field(False, description="TRUE if student is staff relative (unlimited $500 discount)")
    staff_referral_notes: Optional[str] = Field(None, max_length=1000, description="Which staff member, relationship, etc.")


class StudentResponse(StudentBase):
    """Student response with ID and enrollment count"""
    id: int = Field(..., gt=0)
    enrollment_count: Optional[int] = Field(0, ge=0)

    model_config = ConfigDict(from_attributes=True)


class StudentDetailResponse(StudentResponse):
    """Detailed student response with enrollment history"""
    enrollments: List['EnrollmentResponse'] = []

    model_config = ConfigDict(from_attributes=True)


class StudentUpdate(BaseModel):
    """Schema for updating student fields"""
    student_name: Optional[str] = Field(None, min_length=1, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    contacts: Optional[List[StudentContact]] = None
    school: Optional[str] = Field(None, max_length=200)
    grade: Optional[str] = Field(None, max_length=20)
    lang_stream: Optional[str] = Field(None, max_length=50)
    academic_stream: Optional[str] = Field(None, max_length=50)
    is_staff_referral: Optional[bool] = None
    staff_referral_notes: Optional[str] = Field(None, max_length=1000)


class StudentCreate(StudentBase):
    """Schema for creating a new student"""
    pass


class StudentBasic(BaseModel):
    """Minimal student info for lists/popovers"""
    id: int
    school_student_id: Optional[str] = None
    student_name: str
    grade: Optional[str] = None
    lang_stream: Optional[str] = None
    school: Optional[str] = None
    home_location: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Tutor Schemas
# ============================================

class TutorBase(BaseModel):
    """Base tutor schema"""
    user_email: str = Field(..., min_length=3, max_length=255)
    tutor_name: str = Field(..., min_length=1, max_length=200)
    nickname: Optional[str] = Field(None, max_length=100)
    default_location: Optional[str] = Field(None, max_length=200)
    role: str = Field(..., max_length=50)
    basic_salary: Optional[Decimal] = Field(None, ge=0)
    is_active_tutor: bool = Field(True, description="Whether this user teaches students")
    profile_picture: Optional[str] = Field(None, max_length=2048)


class TutorResponse(TutorBase):
    """Tutor response"""
    id: int = Field(..., gt=0)

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Discount Schemas
# ============================================

class DiscountResponse(BaseModel):
    """Discount response for API"""
    id: int
    discount_name: str
    discount_type: Optional[str] = None
    discount_value: Optional[Decimal] = None
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


class StudentCouponResponse(BaseModel):
    """Student coupon availability check response"""
    has_coupon: bool
    available: Optional[int] = None
    value: Optional[Decimal] = None
    last_synced_at: Optional[datetime] = None


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
    school_student_id: Optional[str] = Field(None, max_length=100)
    lang_stream: Optional[str] = Field(None, max_length=50)
    deadline_extension_weeks: Optional[int] = Field(0, ge=0)
    extension_notes: Optional[str] = Field(None, description="Audit trail of extension history")
    last_extension_date: Optional[date] = Field(None, description="Date when last extension was granted")
    extension_granted_by: Optional[str] = Field(None, max_length=255, description="Email of admin who granted extension")
    last_modified_time: Optional[datetime] = None
    effective_end_date: Optional[date] = Field(None, description="Calculated end date based on first lesson + lessons paid + extensions")
    fee_message_sent: bool = False
    is_new_student: bool = False
    summer_application_id: Optional[int] = Field(None, description="Source summer application id if this is a published Summer enrollment")
    payment_deadline: Optional[date] = Field(None, description="Summer: discount deadline or first_lesson_date, whichever is earlier")
    locked_discount_code: Optional[str] = Field(None, max_length=32, description="Summer tier code currently in effect: EB / EB3P / 3P / NONE")
    locked_discount_amount: Optional[int] = Field(None, description="Summer discount amount currently in effect (HKD)")
    discount_override_code: Optional[str] = Field(None, max_length=32)
    discount_override_reason: Optional[str] = None
    discount_override_by: Optional[str] = Field(None, max_length=255)
    discount_override_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator('fee_message_sent', mode='before')
    @classmethod
    def coerce_fee_message_sent(cls, v):
        return v if v is not None else False

    @field_validator('is_new_student', mode='before')
    @classmethod
    def coerce_is_new_student(cls, v):
        return v if v is not None else False


class EnrollmentUpdate(BaseModel):
    """Schema for updating enrollment fields"""
    tutor_id: Optional[int] = Field(None, gt=0)
    assigned_day: Optional[str] = Field(None, max_length=20)
    assigned_time: Optional[str] = Field(None, max_length=20)
    location: Optional[str] = Field(None, max_length=200)
    lessons_paid: Optional[int] = Field(None, ge=0)
    payment_date: Optional[date] = None
    first_lesson_date: Optional[date] = None
    payment_status: Optional[str] = Field(None, max_length=50)
    enrollment_type: Optional[str] = Field(None, max_length=50)
    fee_message_sent: Optional[bool] = None
    discount_id: Optional[int] = Field(None, gt=0)
    is_new_student: Optional[bool] = None


class EnrollmentExtensionUpdate(BaseModel):
    """Schema for admin to directly set deadline extension weeks"""
    deadline_extension_weeks: int = Field(..., ge=0, le=52, description="Number of weeks to extend deadline")
    reason: str = Field(..., min_length=1, max_length=1000, description="Reason for extension (required for audit)")


class DiscountOverrideRequest(BaseModel):
    """Admin override of the auto-computed summer discount tier.

    Used when a parent paid on time but the payment was recorded late, so the
    auto-downgrade would incorrectly strip their early-bird discount.
    """
    code: str = Field(..., max_length=32, description="Tier code to force, e.g. 'EB3P'. Use 'NONE' for no discount.")
    reason: str = Field(..., min_length=1, max_length=1000, description="Why the override is being applied (required for audit)")


class OverdueEnrollment(BaseModel):
    """Overdue enrollment with days overdue calculation"""
    id: int = Field(..., gt=0)
    student_id: int = Field(..., gt=0)
    student_name: str = Field(..., max_length=200)
    school_student_id: Optional[str] = Field(None, max_length=100)
    grade: Optional[str] = Field(None, max_length=20)
    tutor_id: Optional[int] = Field(None, gt=0)
    tutor_name: Optional[str] = Field(None, max_length=200)
    assigned_day: Optional[str] = Field(None, max_length=20)
    assigned_time: Optional[str] = Field(None, max_length=20)
    location: Optional[str] = Field(None, max_length=200)
    first_lesson_date: date
    lessons_paid: int = Field(..., ge=0)
    days_overdue: int  # Negative for upcoming ("due soon"), positive for overdue
    enrollment_type: Optional[str] = Field(None, max_length=50)
    payment_deadline: Optional[date] = Field(None, description="For Summer: discount deadline that drives urgency; None for Regular")
    deadline_source: str = Field("first_lesson", description="Which date days_overdue was computed against: 'payment_deadline' or 'first_lesson'")
    locked_discount_code: Optional[str] = Field(None, max_length=32)
    locked_discount_amount: Optional[int] = None
    discount_override_code: Optional[str] = Field(None, max_length=32)
    discount_override_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UncheckedAttendanceReminder(BaseModel):
    """Session with unchecked attendance needing tutor action"""
    session_id: int = Field(..., gt=0)
    session_date: date
    time_slot: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=200)
    session_status: str = Field(..., max_length=50)
    tutor_id: int = Field(..., gt=0)
    tutor_name: str = Field(..., max_length=200)
    student_id: int = Field(..., gt=0)
    student_name: str = Field(..., max_length=200)
    school_student_id: Optional[str] = Field(None, max_length=100)
    grade: Optional[str] = Field(None, max_length=20)
    lang_stream: Optional[str] = Field(None, max_length=20)
    school: Optional[str] = Field(None, max_length=200)
    days_overdue: int = Field(..., ge=0)
    urgency_level: str = Field(..., description="Critical, High, Medium, or Low")
    lesson_number: Optional[int] = Field(None, description="Lesson material number (1-8 for summer). NULL for non-summer sessions.")

    model_config = ConfigDict(from_attributes=True)


class UncheckedAttendanceCount(BaseModel):
    """Count of unchecked attendance sessions"""
    total: int = Field(..., ge=0)
    critical: int = Field(..., ge=0, description="Sessions >7 days overdue")


class AgedPendingMakeupsCount(BaseModel):
    """Count of pending makeups aged past threshold"""
    count: int = Field(0, ge=0, description="Pending makeups aged >= threshold_days")
    critical: int = Field(0, ge=0, description="Pending makeups aged >= 45 days")


class EnrollmentCreate(BaseModel):
    """Schema for creating a new enrollment with session generation"""
    student_id: int = Field(..., gt=0)
    tutor_id: int = Field(..., gt=0)
    assigned_day: str = Field(..., max_length=20, description="Day of week (e.g., 'Monday')")
    assigned_time: str = Field(..., max_length=20, description="Time slot (e.g., '16:45 - 18:15')")
    location: str = Field(..., max_length=200)
    first_lesson_date: date = Field(..., description="Date of the first lesson")
    lessons_paid: int = Field(..., ge=1, description="Number of sessions to generate")
    enrollment_type: str = Field('Regular', max_length=50, description="Regular, Trial, or One-Time")
    remark: Optional[str] = Field(None, max_length=1000)
    renewed_from_enrollment_id: Optional[int] = Field(None, gt=0, description="Link to previous enrollment for renewals")
    discount_id: Optional[int] = Field(None, gt=0)
    is_new_student: Optional[bool] = Field(None, description="New student flag (None = auto-detect based on prior non-Trial enrollments)")


class HolidaySkipped(BaseModel):
    """Holiday that was skipped during session generation"""
    date: str = Field(..., description="Date of the skipped holiday (ISO format)")
    name: str = Field(..., max_length=100, description="Name of the holiday")


class SessionPreview(BaseModel):
    """Preview of a session to be generated"""
    session_date: date
    time_slot: str
    location: str
    is_holiday: bool = Field(False, description="True if this date was skipped due to holiday")
    holiday_name: Optional[str] = Field(None, description="Name of holiday if skipped")
    conflict: Optional[str] = Field(None, description="Conflict description if student has existing session")


class StudentConflict(BaseModel):
    """Details of a student conflict with existing sessions"""
    session_date: date
    time_slot: str
    existing_tutor_name: str
    session_status: str
    enrollment_id: int


class PotentialRenewalLink(BaseModel):
    """A potential previous enrollment that could be linked as renewal source"""
    id: int
    effective_end_date: date
    lessons_paid: int
    tutor_name: str


class EnrollmentPreviewResponse(BaseModel):
    """Response from enrollment preview endpoint"""
    enrollment_data: EnrollmentCreate
    sessions: List[SessionPreview]
    effective_end_date: date = Field(..., description="Date of the last generated session")
    conflicts: List[StudentConflict] = Field(default_factory=list, description="Student conflicts with existing sessions")
    warnings: List[str] = Field(default_factory=list, description="Holiday shifts and other warnings")
    skipped_holidays: List[HolidaySkipped] = Field(default_factory=list, description="List of holidays that were skipped")
    potential_renewals: List[PotentialRenewalLink] = Field(default_factory=list, description="Potential previous enrollments to link as renewal")


class RenewalDataResponse(BaseModel):
    """Pre-filled data for enrollment renewal form"""
    student_id: int
    student_name: str
    school_student_id: Optional[str] = None
    grade: Optional[str] = None
    tutor_id: int
    tutor_name: str
    assigned_day: str
    assigned_time: str
    location: str
    suggested_first_lesson_date: date = Field(..., description="Next occurrence of assigned_day after effective_end_date")
    previous_lessons_paid: int
    enrollment_type: str
    renewed_from_enrollment_id: int = Field(..., description="ID of the expiring enrollment being renewed")
    previous_effective_end_date: date
    discount_id: Optional[int] = None
    discount_name: Optional[str] = None


class RenewalListItem(BaseModel):
    """Enrollment needing renewal for list view"""
    id: int = Field(..., gt=0)
    student_id: int = Field(..., gt=0)
    student_name: str
    school_student_id: Optional[str] = None
    grade: Optional[str] = None
    lang_stream: Optional[str] = None
    school: Optional[str] = None
    tutor_id: int = Field(..., gt=0)
    tutor_name: str
    assigned_day: str
    assigned_time: str
    location: str
    first_lesson_date: date
    lessons_paid: int
    effective_end_date: date
    days_until_expiry: int = Field(..., description="Negative = expired, positive = days remaining")
    sessions_remaining: int = Field(default=0, ge=0, description="Number of sessions not yet completed")
    payment_status: str
    # Renewal status tracking
    renewal_status: str = Field(default="not_renewed", description="not_renewed, pending_message, message_sent, paid")
    renewal_enrollment_id: Optional[int] = Field(default=None, description="ID of the renewal enrollment if exists")
    # Renewal enrollment details (populated when renewal_enrollment_id exists)
    renewal_first_lesson_date: Optional[date] = Field(default=None, description="First lesson date of the renewal enrollment")
    renewal_lessons_paid: Optional[int] = Field(default=None, description="Lessons paid for the renewal enrollment")
    renewal_payment_status: Optional[str] = Field(default=None, description="Payment status of the renewal enrollment")

    model_config = ConfigDict(from_attributes=True)


class RenewalCountsResponse(BaseModel):
    """Counts of enrollments needing renewal for notification badge"""
    expiring_soon: int = Field(default=0, ge=0, description="Expiring within 2 weeks")
    expired: int = Field(default=0, ge=0, description="Already expired but not renewed")
    total: int = Field(default=0, ge=0, description="Total needing attention")


class TrialListItem(BaseModel):
    """Trial enrollment for Kanban dashboard"""
    enrollment_id: int = Field(..., gt=0)
    student_id: int = Field(..., gt=0)
    student_name: str
    school_student_id: Optional[str] = None
    grade: Optional[str] = None
    lang_stream: Optional[str] = None
    school: Optional[str] = None
    tutor_id: int = Field(..., gt=0)
    tutor_name: str
    session_id: int = Field(..., gt=0, description="ID of the trial session")
    session_date: date
    time_slot: str
    location: str
    session_status: str = Field(..., description="Trial Class, Attended, No Show, etc.")
    payment_status: str
    trial_status: str = Field(..., description="Derived: scheduled, attended, no_show, converted, pending")
    subsequent_enrollment_id: Optional[int] = Field(default=None, description="ID if student converted to regular")
    subsequent_payment_status: Optional[str] = Field(default=None, description="Payment status of subsequent enrollment")
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PendingMakeupSession(BaseModel):
    """Pending makeup session with full info for display"""
    id: int
    session_date: date
    time_slot: Optional[str] = None
    session_status: str
    tutor_name: Optional[str] = None
    has_extension_request: bool = False
    extension_request_status: Optional[str] = None
    lesson_number: Optional[int] = None


class EnrollmentDetailResponse(BaseModel):
    """Detailed enrollment info for review modal"""
    id: int
    student_id: int
    student_name: str
    school_student_id: Optional[str] = None
    grade: Optional[str] = None
    lang_stream: Optional[str] = None
    school: Optional[str] = None
    home_location: Optional[str] = None
    tutor_id: int
    tutor_name: str
    assigned_day: str
    assigned_time: str
    location: str
    first_lesson_date: date
    effective_end_date: date
    days_until_expiry: int
    lessons_paid: int
    sessions_finished: int
    sessions_total: int
    pending_makeups: List[PendingMakeupSession] = Field(default_factory=list)
    payment_status: str
    phone: Optional[str] = None
    contacts: Optional[List[StudentContact]] = None
    fee_message_sent: bool = False
    is_new_student: bool = False
    enrollment_type: Optional[str] = None
    summer_application_id: Optional[int] = None
    payment_date: Optional[date] = None
    payment_deadline: Optional[date] = None
    locked_discount_code: Optional[str] = None
    locked_discount_amount: Optional[int] = None
    discount_override_code: Optional[str] = None
    discount_override_reason: Optional[str] = None
    discount_override_by: Optional[str] = None
    discount_override_at: Optional[datetime] = None

    @field_validator('fee_message_sent', mode='before')
    @classmethod
    def coerce_fee_message_sent(cls, v):
        return v if v is not None else False

    @field_validator('is_new_student', mode='before')
    @classmethod
    def coerce_is_new_student_detail(cls, v):
        return v if v is not None else False


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
    tutor_nickname: Optional[str] = None
    session_status: str

    model_config = ConfigDict(from_attributes=True)


class SessionResponse(SessionBase):
    """Session response with student/tutor names and details"""
    id: int = Field(..., gt=0)
    student_name: Optional[str] = Field(None, max_length=200)
    tutor_name: Optional[str] = Field(None, max_length=200)
    tutor_nickname: Optional[str] = Field(None, max_length=100)
    school_student_id: Optional[str] = Field(None, max_length=50)
    grade: Optional[str] = Field(None, max_length=20)
    lang_stream: Optional[str] = Field(None, max_length=50)
    school: Optional[str] = Field(None, max_length=200)
    performance_rating: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)
    last_modified_time: Optional[datetime] = None
    last_modified_by: Optional[str] = Field(None, max_length=255)
    attendance_marked_by: Optional[str] = Field(None, max_length=255)
    attendance_mark_time: Optional[datetime] = None
    previous_session_status: Optional[str] = Field(None, max_length=100)
    rescheduled_to_id: Optional[int] = Field(None, gt=0)
    make_up_for_id: Optional[int] = Field(None, gt=0)
    root_original_session_date: Optional[date] = Field(None, description="For makeup sessions: date of the root original session (tracing through makeup chain)")
    exam_revision_slot_id: Optional[int] = Field(None, gt=0, description="Links session to exam revision slot")
    extension_request_id: Optional[int] = Field(None, gt=0, description="ID of extension request for this session")
    extension_request_status: Optional[str] = Field(None, max_length=50, description="Status: Pending, Approved, Rejected")
    rescheduled_to: Optional[LinkedSessionInfo] = None
    make_up_for: Optional[LinkedSessionInfo] = None
    exercises: List["SessionExerciseResponse"] = []
    undone_from_status: Optional[str] = Field(None, max_length=100, description="Status before undo (for redo toast)")
    enrollment_payment_status: Optional[str] = Field(None, max_length=50, description="Payment status of the enrollment (Paid, Pending Payment, Overdue, Cancelled)")
    lesson_number: Optional[int] = Field(None, description="Lesson material number (e.g., 1-8 for summer). NULL for non-summer sessions.")

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Session Exercise Schemas
# ============================================

class SessionExerciseResponse(BaseModel):
    """Session exercise (classwork/homework) response"""
    id: int = Field(..., gt=0)
    session_id: int = Field(..., gt=0)
    exercise_type: str = Field(..., max_length=50)
    pdf_name: Optional[str] = Field(None, max_length=500)
    page_start: Optional[int] = Field(None, gt=0)
    page_end: Optional[int] = Field(None, gt=0)
    created_by: str = Field(..., max_length=200)
    created_at: Optional[datetime] = None
    remarks: Optional[str] = Field(None, max_length=1000)
    url: Optional[str] = Field(None, max_length=2048)
    url_title: Optional[str] = Field(None, max_length=500)
    # Answer file fields
    answer_pdf_name: Optional[str] = Field(None, max_length=500)
    answer_page_start: Optional[int] = Field(None, gt=0)
    answer_page_end: Optional[int] = Field(None, gt=0)
    answer_remarks: Optional[str] = Field(None, max_length=1000)

    model_config = ConfigDict(from_attributes=True)


class ExerciseCreateRequest(BaseModel):
    """Request schema for creating/updating a session exercise"""
    exercise_type: str = Field(..., pattern="^(CW|HW|Classwork|Homework)$")
    pdf_name: Optional[str] = Field(None, max_length=500)
    page_start: Optional[int] = Field(None, gt=0)
    page_end: Optional[int] = Field(None, gt=0)
    remarks: Optional[str] = Field(None, max_length=1000)
    url: Optional[str] = Field(None, max_length=2048)
    url_title: Optional[str] = Field(None, max_length=500)
    # Answer file fields (for manual answer selection)
    answer_pdf_name: Optional[str] = Field(None, max_length=500)
    answer_page_start: Optional[int] = Field(None, gt=0)
    answer_page_end: Optional[int] = Field(None, gt=0)
    answer_remarks: Optional[str] = Field(None, max_length=1000)

    @model_validator(mode='after')
    def check_pdf_or_url(self):
        if not self.pdf_name and not self.url:
            raise ValueError('Either pdf_name or url must be provided')
        return self


class ExerciseSaveRequest(BaseModel):
    """Request schema for saving all exercises of a type for a session"""
    exercise_type: str = Field(..., pattern="^(CW|HW)$")
    exercises: List[ExerciseCreateRequest] = []
    append: bool = Field(False, description="If true, append exercises instead of replacing")


class BulkExerciseAssignRequest(BaseModel):
    """Request schema for assigning exercises to multiple sessions at once"""
    session_ids: List[int] = Field(..., min_length=1, description="List of session IDs to assign exercises to")
    exercise_type: str = Field(..., pattern="^(CW|HW)$", description="Exercise type (CW or HW)")
    pdf_name: Optional[str] = Field(None, max_length=500, description="PDF filename/path")
    page_start: Optional[int] = Field(None, gt=0, description="Start page number")
    page_end: Optional[int] = Field(None, gt=0, description="End page number")
    remarks: Optional[str] = Field(None, max_length=1000, description="Exercise remarks")
    url: Optional[str] = Field(None, max_length=2048, description="External URL (Google Slides, etc.)")

    @model_validator(mode='after')
    def check_pdf_or_url(self):
        if not self.pdf_name and not self.url:
            raise ValueError('Either pdf_name or url must be provided')
        return self


class BulkExerciseAssignResponse(BaseModel):
    """Response schema for bulk exercise assignment"""
    created_count: int = Field(..., description="Number of exercises created")
    session_ids: List[int] = Field(..., description="IDs of sessions that received exercises")


class ExerciseHistorySession(BaseModel):
    """A single session's exercises for the exercise history panel"""
    session_id: int
    session_date: date
    time_slot: Optional[str] = None
    exercises: List[SessionExerciseResponse] = []

    model_config = ConfigDict(from_attributes=True)


class ExerciseHistoryResponse(BaseModel):
    """Paginated exercise history for a student"""
    sessions: List[ExerciseHistorySession] = []
    has_more: bool = False


class RateSessionRequest(BaseModel):
    """Request schema for rating a session"""
    performance_rating: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)


class SessionUpdate(BaseModel):
    """Schema for updating session fields"""
    session_date: Optional[date] = None
    time_slot: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=200)
    tutor_id: Optional[int] = Field(None, gt=0)
    session_status: Optional[str] = Field(None, max_length=50)
    performance_rating: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)
    lesson_number: Optional[int] = Field(None, ge=1)
    # Opt-in override when the caller has acknowledged a duplicate-lesson_number
    # warning. Without it, the endpoint rejects with 409 to prevent the
    # student from silently accumulating two sessions at the same lesson.
    force_lesson_duplicate: bool = False
    # Opt-in clear so None stays as "no change". Set this to null the
    # per-session lesson_number back to NULL (useful for ad-hoc sessions).
    clear_lesson_number: bool = False


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
    url: Optional[str] = Field(None, max_length=2048)
    homework_assigned_date: Optional[date] = None
    assigned_by_tutor_id: Optional[int] = Field(None, gt=0)
    assigned_by_tutor: Optional[str] = Field(None, max_length=200)

    model_config = ConfigDict(from_attributes=True)


class DetailedSessionResponse(SessionResponse):
    """Detailed session response with exercises and homework completion"""
    exercises: List[SessionExerciseResponse] = []
    homework_completion: List[HomeworkCompletionResponse] = []
    previous_session: Optional['DetailedSessionResponse'] = None
    nav_previous_id: Optional[int] = None
    nav_next_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Make-up Scheduling Schemas
# ============================================

class StudentInSlot(BaseModel):
    """Student info for make-up slot preview"""
    id: int
    school_student_id: Optional[str] = None
    student_name: str
    grade: Optional[str] = None
    school: Optional[str] = None
    lang_stream: Optional[str] = None
    session_status: str

    model_config = ConfigDict(from_attributes=True)


class MakeupScoreBreakdown(BaseModel):
    """Score breakdown for make-up slot compatibility scoring"""
    is_same_tutor: bool = Field(..., description="Whether slot is with the student's regular tutor")
    matching_grade_count: int = Field(..., ge=0, description="Number of students with matching grade in slot")
    matching_school_count: int = Field(..., ge=0, description="Number of students from matching school in slot")
    matching_lang_count: int = Field(..., ge=0, description="Number of students with matching language stream")
    days_away: int = Field(..., ge=0, description="Days from original session date")
    current_students: int = Field(..., ge=0, description="Current student count in the slot")


class MakeupSlotSuggestion(BaseModel):
    """Scored slot suggestion for make-up scheduling"""
    session_date: date
    time_slot: str
    tutor_id: int
    tutor_name: str
    location: str
    current_students: int = Field(..., ge=0, description="Only Scheduled + Make-up Class sessions")
    available_spots: int = Field(..., ge=0, description="8 - current_students")
    compatibility_score: int = Field(..., ge=0)
    score_breakdown: MakeupScoreBreakdown = Field(..., description="Raw scoring data for frontend-side weighted scoring")
    students_in_slot: List[StudentInSlot] = Field(default_factory=list)


class ScheduleMakeupRequest(BaseModel):
    """Request to schedule a make-up session"""
    session_date: date
    time_slot: str = Field(..., max_length=50)
    tutor_id: int = Field(..., gt=0)
    location: str = Field(..., max_length=200)
    notes: Optional[str] = Field(None, max_length=500, description="Optional reason for scheduling this make-up")


class ScheduleMakeupResponse(BaseModel):
    """Response after scheduling a make-up session"""
    makeup_session: SessionResponse
    original_session: SessionResponse


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
    modified_by: Optional[str] = Field(None, max_length=255, description="User who triggered this activity")


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
    description: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    school: Optional[str] = Field(None, max_length=200)
    grade: Optional[str] = Field(None, max_length=20)
    academic_stream: Optional[str] = Field(None, max_length=50)
    event_type: Optional[str] = Field(None, max_length=50)
    created_at: datetime
    updated_at: datetime
    last_synced_at: datetime
    revision_slot_count: int = Field(default=0, ge=0, description="Number of revision slots linked to this event")

    model_config = ConfigDict(from_attributes=True)


class CalendarEventCreate(BaseModel):
    """Schema for creating a calendar event with Google sync"""
    title: str = Field(..., min_length=1, max_length=500, description="Event title (e.g., 'TIS F2 Test')")
    description: Optional[str] = Field(None, max_length=2000)
    start_date: date = Field(..., description="Event start date")
    end_date: Optional[date] = Field(None, description="Event end date (defaults to start_date)")
    school: Optional[str] = Field(None, max_length=200, description="School code (e.g., 'TIS')")
    grade: Optional[str] = Field(None, max_length=20, description="Grade (e.g., 'F2')")
    academic_stream: Optional[str] = Field(None, max_length=50, pattern="^[ASC]?$", description="Academic stream: A(rt), S(cience), C(ommerce)")
    event_type: Optional[str] = Field(None, max_length=50, description="Event type: Test, Quiz, Exam")


class CalendarEventUpdate(BaseModel):
    """Schema for updating a calendar event with Google sync"""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    school: Optional[str] = Field(None, max_length=200)
    grade: Optional[str] = Field(None, max_length=20)
    academic_stream: Optional[str] = Field(None, max_length=50, pattern="^[ASC]?$")
    event_type: Optional[str] = Field(None, max_length=50)


class UpcomingTestAlert(BaseModel):
    """Upcoming test/exam alert with countdown"""
    id: int = Field(..., gt=0)
    event_id: str = Field(..., min_length=1, max_length=255)
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    start_date: str = Field(..., min_length=1)  # ISO format
    end_date: Optional[str] = Field(None, min_length=1)  # ISO format
    school: str = Field(..., max_length=200)
    grade: str = Field(..., max_length=20)
    academic_stream: Optional[str] = Field(None, max_length=50)
    event_type: str = Field(..., max_length=50)
    days_until: int = Field(..., ge=0)  # Number of days until the test


# ============================================
# Holiday Schemas
# ============================================

class HolidayResponse(BaseModel):
    """Holiday response schema"""
    id: int = Field(..., gt=0)
    holiday_date: date
    holiday_name: Optional[str] = Field(None, max_length=255)

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Parent Communication Schemas
# ============================================

class ParentCommunicationCreate(BaseModel):
    """Schema for creating a parent communication record"""
    student_id: int = Field(..., gt=0)
    contact_method: str = Field(default='WeChat', max_length=50)
    contact_type: str = Field(default='Progress Update', max_length=50)
    brief_notes: Optional[str] = Field(None, max_length=500)
    follow_up_needed: bool = Field(default=False)
    follow_up_date: Optional[date] = None
    contact_date: Optional[datetime] = None  # Defaults to now if not provided


class ParentCommunicationUpdate(BaseModel):
    """Schema for updating a parent communication record"""
    contact_method: Optional[str] = Field(None, max_length=50)
    contact_type: Optional[str] = Field(None, max_length=50)
    brief_notes: Optional[str] = Field(None, max_length=500)
    follow_up_needed: Optional[bool] = None
    follow_up_date: Optional[date] = None
    contact_date: Optional[datetime] = None


class ParentCommunicationResponse(BaseModel):
    """Response schema for a parent communication record"""
    id: int = Field(..., gt=0)
    student_id: int = Field(..., gt=0)
    student_name: str = Field(..., max_length=255)
    school_student_id: Optional[str] = Field(None, max_length=100)
    grade: Optional[str] = Field(None, max_length=50)
    lang_stream: Optional[str] = Field(None, max_length=50)
    school: Optional[str] = Field(None, max_length=200)
    home_location: Optional[str] = Field(None, max_length=100)
    tutor_id: int = Field(..., gt=0)
    tutor_name: str = Field(..., max_length=255)
    contact_date: datetime
    contact_method: str = Field(..., max_length=50)
    contact_type: str = Field(..., max_length=50)
    brief_notes: Optional[str] = Field(None, max_length=500)
    follow_up_needed: Optional[bool] = Field(default=False)  # Allow NULL for legacy data
    follow_up_date: Optional[date] = None
    created_at: datetime
    created_by: Optional[str] = Field(None, max_length=255)

    model_config = ConfigDict(from_attributes=True)


class StudentContactStatus(BaseModel):
    """Student with parent contact status information"""
    student_id: int = Field(..., gt=0)
    student_name: str = Field(..., max_length=255)
    school_student_id: Optional[str] = Field(None, max_length=100)
    grade: Optional[str] = Field(None, max_length=50)
    lang_stream: Optional[str] = Field(None, max_length=50)
    school: Optional[str] = Field(None, max_length=200)
    home_location: Optional[str] = Field(None, max_length=100)
    last_contact_date: Optional[datetime] = None
    last_contacted_by: Optional[str] = Field(None, max_length=255)
    days_since_contact: int = Field(..., ge=0)  # 999 if never contacted
    contact_status: str = Field(..., max_length=50)  # "Never Contacted", "Recent", "Been a While", "Contact Needed"
    pending_follow_up: bool = Field(default=False)
    follow_up_date: Optional[date] = None
    follow_up_communication_id: Optional[int] = None
    enrollment_count: int = Field(default=0, ge=0)


class ParentCommunicationStats(BaseModel):
    """Aggregated statistics for parent communications"""
    total_active_students: int = Field(default=0, ge=0)
    students_contacted_recently: int = Field(default=0, ge=0)
    contact_coverage_percent: float = Field(default=0, ge=0, le=100)
    progress_update_count: int = Field(default=0, ge=0)
    concern_count: int = Field(default=0, ge=0)
    general_count: int = Field(default=0, ge=0)
    contacts_this_week: int = Field(default=0, ge=0)
    contacts_last_week: int = Field(default=0, ge=0)
    average_days_since_contact: Optional[float] = None
    pending_followups_count: int = Field(default=0, ge=0)


class LocationSettingsResponse(BaseModel):
    """Location settings response"""
    id: int = Field(..., gt=0)
    location: str = Field(..., max_length=50)
    contact_recent_days: int = Field(default=28, ge=1)
    contact_warning_days: int = Field(default=50, ge=1)

    model_config = ConfigDict(from_attributes=True)


class LocationSettingsUpdate(BaseModel):
    """Schema for updating location settings"""
    contact_recent_days: Optional[int] = Field(None, ge=1)
    contact_warning_days: Optional[int] = Field(None, ge=1)


# ============================================
# Termination Record Schemas
# ============================================

class TerminatedStudentResponse(BaseModel):
    """Terminated student with editable record fields"""
    student_id: int = Field(..., gt=0)
    student_name: str = Field(..., max_length=255)
    school_student_id: Optional[str] = Field(None, max_length=100)
    grade: Optional[str] = Field(None, max_length=50)
    home_location: Optional[str] = Field(None, max_length=100)
    termination_date: date
    tutor_id: Optional[int] = Field(None, gt=0)
    tutor_name: Optional[str] = Field(None, max_length=255)
    schedule: Optional[str] = Field(None, max_length=100)
    # Editable fields from termination_records
    record_id: Optional[int] = Field(None, gt=0)
    reason: Optional[str] = Field(None, max_length=1000)
    reason_category: Optional[str] = Field(None, max_length=50)
    count_as_terminated: bool = False


class TerminationRecordUpdate(BaseModel):
    """Request for updating termination record"""
    quarter: int = Field(..., ge=1, le=4)
    year: int = Field(..., ge=2020)
    reason: Optional[str] = Field(None, max_length=1000)
    reason_category: Optional[str] = Field(None, max_length=50)
    count_as_terminated: bool = False


class TerminationRecordResponse(BaseModel):
    """Response after updating termination record"""
    id: int = Field(..., gt=0)
    student_id: int = Field(..., gt=0)
    quarter: int = Field(..., ge=1, le=4)
    year: int = Field(..., ge=2020)
    reason: Optional[str] = None
    reason_category: Optional[str] = None
    count_as_terminated: bool
    tutor_id: Optional[int] = None
    updated_by: Optional[str] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TutorTerminationStats(BaseModel):
    """Stats for a single tutor"""
    tutor_id: int = Field(..., gt=0)
    tutor_name: str = Field(..., max_length=255)
    opening: int = Field(default=0, ge=0)
    enrollment_transfer: int = Field(default=0)  # closing - opening - terminated (can be negative)
    terminated: int = Field(default=0, ge=0)
    closing: int = Field(default=0, ge=0)
    term_rate: float = Field(default=0.0, ge=0)


class LocationTerminationStats(BaseModel):
    """Aggregate stats for a location"""
    opening: int = Field(default=0, ge=0)
    enrollment_transfer: int = Field(default=0)  # closing - opening - terminated (can be negative)
    terminated: int = Field(default=0, ge=0)
    closing: int = Field(default=0, ge=0)
    term_rate: float = Field(default=0.0, ge=0)


class TerminationStatsResponse(BaseModel):
    """Full stats response with tutor and location breakdowns"""
    tutor_stats: List[TutorTerminationStats]
    location_stats: LocationTerminationStats


class QuarterOption(BaseModel):
    """Available quarter option for dropdown"""
    quarter: int = Field(..., ge=1, le=4)
    year: int = Field(..., ge=2020)


class TerminationReviewCount(BaseModel):
    """Count of terminated students needing reason review"""
    count: int = Field(default=0, ge=0)
    in_review_period: bool = False
    review_quarter: Optional[int] = None
    review_year: Optional[int] = None


class QuarterTrendPoint(BaseModel):
    """Single data point in the quarterly trend chart"""
    quarter: int = Field(..., ge=1, le=4)
    year: int = Field(..., ge=2020)
    label: str  # e.g., "Q1 2025"
    opening: int = Field(default=0, ge=0)
    terminated: int = Field(default=0, ge=0)
    closing: int = Field(default=0, ge=0)
    term_rate: float = Field(default=0.0, ge=0)
    reason_breakdown: dict = Field(default_factory=dict)  # category -> count


class StatDetailStudent(BaseModel):
    """Student detail for stat drill-down"""
    student_id: int
    student_name: str
    school_student_id: Optional[str] = None
    tutor_name: Optional[str] = None
    grade: Optional[str] = None
    school: Optional[str] = None
    lang_stream: Optional[str] = None
    home_location: Optional[str] = None
    enrollment_id: Optional[int] = None
    assigned_day: Optional[str] = None
    assigned_time: Optional[str] = None


# ============================================
# Message Schemas
# ============================================

class ReadReceiptDetail(BaseModel):
    """Detail of who read a message and when"""
    tutor_id: int
    tutor_name: str
    read_at: datetime


class LikeDetail(BaseModel):
    """Detail of who liked/reacted to a message and when"""
    tutor_id: int
    tutor_name: str
    liked_at: datetime
    emoji: str = "❤️"


class ReactionSummary(BaseModel):
    """Summary of emoji reactions on a message"""
    emoji: str
    count: int
    tutor_ids: List[int] = []


class MessageBase(BaseModel):
    """Base message schema with common fields"""
    subject: Optional[str] = Field(None, max_length=200)
    message: str = Field("")  # Allow empty for attachment-only messages
    priority: str = Field("Normal", pattern="^(Normal|High|Urgent)$")
    category: Optional[str] = Field(None, pattern="^(Reminder|Question|Announcement|Schedule|Chat|Courseware|MakeupConfirmation|Feedback)$")


class MessageCreate(MessageBase):
    """Schema for creating a new message"""
    to_tutor_id: Optional[int] = Field(None, gt=0)  # NULL = broadcast (single recipient)
    to_tutor_ids: Optional[List[int]] = Field(None, min_length=2, max_length=50)  # Group message recipients
    reply_to_id: Optional[int] = Field(None, gt=0)
    image_attachments: Optional[List[str]] = Field(default_factory=list)  # List of uploaded image URLs
    file_attachments: Optional[List[dict]] = Field(default_factory=list)  # [{url, filename, content_type}]
    scheduled_at: Optional[datetime] = None  # If set and in future, message is scheduled (not sent immediately)

    @model_validator(mode='after')
    def require_content(self):
        """Require at least message text or attachments."""
        has_text = bool(self.message and self.message.strip() and self.message not in ("", "<p></p>"))
        has_attachments = bool(self.image_attachments) or bool(self.file_attachments)
        if not has_text and not has_attachments:
            raise ValueError("Message must have text or attachments")
        return self


class MessageUpdate(BaseModel):
    """Schema for updating an existing message"""
    message: Optional[str] = Field(None, min_length=1)
    image_attachments: Optional[List[str]] = None
    file_attachments: Optional[List[dict]] = None


class MessageResponse(MessageBase):
    """Full message response with computed fields"""
    id: int = Field(..., gt=0)
    from_tutor_id: int = Field(..., gt=0)
    from_tutor_name: Optional[str] = Field(None, max_length=255)
    from_tutor_profile_picture: Optional[str] = None
    to_tutor_id: Optional[int] = Field(None)  # NULL=broadcast, -1=group, positive=direct
    to_tutor_name: Optional[str] = Field(None, max_length=255)  # "All" for broadcasts, comma-joined for groups
    to_tutor_ids: Optional[List[int]] = None  # Group recipient IDs (only for group messages)
    to_tutor_names: Optional[List[str]] = None  # Group recipient names (only for group messages)
    is_group_message: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    reply_to_id: Optional[int] = Field(None, gt=0)
    is_read: bool = False
    like_count: int = Field(default=0, ge=0)
    is_liked_by_me: bool = False
    like_details: Optional[List[LikeDetail]] = None
    reaction_summary: Optional[List[ReactionSummary]] = None
    reply_count: int = Field(default=0, ge=0)
    image_attachments: List[str] = Field(default_factory=list)  # List of image URLs
    file_attachments: List[dict] = Field(default_factory=list)  # [{url, filename, content_type}]
    is_pinned: bool = False
    is_thread_pinned: bool = False
    is_thread_muted: bool = False
    is_snoozed: bool = False
    snoozed_until: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None  # Non-null = scheduled for future delivery
    # Read receipt fields for sender's messages (WhatsApp-style seen status)
    read_receipts: Optional[List[ReadReceiptDetail]] = None  # Only populated for sender's own messages
    total_recipients: Optional[int] = None  # Total recipients for broadcasts (for "seen by all" check)
    read_by_all: Optional[bool] = None  # True when all recipients have read

    model_config = ConfigDict(from_attributes=True)


class ThreadResponse(BaseModel):
    """Thread with root message and replies"""
    root_message: MessageResponse
    replies: List[MessageResponse] = []
    total_unread: int = Field(default=0, ge=0)


class UnreadCountResponse(BaseModel):
    """Unread message count response"""
    count: int = Field(default=0, ge=0)


class CategoryUnreadCountsResponse(BaseModel):
    """Per-category unread message counts"""
    counts: dict[str, int] = Field(default_factory=dict)


class PaginatedThreadsResponse(BaseModel):
    """Paginated thread list response with metadata"""
    threads: List[ThreadResponse] = []
    total_count: int = Field(default=0, ge=0)
    has_more: bool = False
    limit: int = Field(default=20, ge=1)
    offset: int = Field(default=0, ge=0)


class PaginatedMessagesResponse(BaseModel):
    """Paginated message list response with metadata"""
    messages: List[MessageResponse] = []
    total_count: int = Field(default=0, ge=0)
    has_more: bool = False
    limit: int = Field(default=50, ge=1)
    offset: int = Field(default=0, ge=0)


class ArchiveRequest(BaseModel):
    """Request to archive/unarchive messages (bulk operation)"""
    message_ids: List[int] = Field(..., min_length=1, max_length=100)


class ArchiveResponse(BaseModel):
    """Response for archive operations"""
    success: bool = True
    count: int = Field(default=0, ge=0, description="Number of messages archived/unarchived")


class PinRequest(BaseModel):
    """Request to pin/unpin messages (bulk operation)"""
    message_ids: List[int] = Field(..., min_length=1, max_length=100)


class PinResponse(BaseModel):
    """Response for pin operations"""
    success: bool = True
    count: int = Field(default=0, ge=0, description="Number of messages pinned/unpinned")


class MessageTemplateCreate(BaseModel):
    """Schema for creating a message template"""
    title: str = Field(..., max_length=200)
    content: str = Field(..., min_length=1)
    category: Optional[str] = None

class MessageTemplateUpdate(BaseModel):
    """Schema for updating a message template"""
    title: Optional[str] = Field(None, max_length=200)
    content: Optional[str] = Field(None, min_length=1)
    category: Optional[str] = None

class MessageTemplateResponse(BaseModel):
    """Schema for template response"""
    id: int
    tutor_id: Optional[int] = None
    title: str
    content: str
    category: Optional[str] = None
    is_global: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SnoozeRequest(BaseModel):
    """Request to snooze threads"""
    message_ids: List[int] = Field(..., min_length=1, max_length=50)
    snooze_until: datetime


class MarkAllReadRequest(BaseModel):
    """Request to mark all visible messages as read"""
    category: Optional[str] = Field(None, description="Optional category filter")


class MarkAllReadResponse(BaseModel):
    """Response for mark-all-read operation"""
    success: bool = True
    count: int = Field(default=0, ge=0, description="Number of messages marked as read")


class BatchEnrollmentRequest(BaseModel):
    """Request for batch enrollment operations"""
    enrollment_ids: List[int] = Field(..., min_length=1, max_length=100)


class BatchOperationResponse(BaseModel):
    """Response for batch operations"""
    updated: List[int] = Field(default_factory=list, description="IDs of updated enrollments")
    count: int = Field(default=0, ge=0, description="Number of enrollments updated")


class EligibilityResult(BaseModel):
    """Result of eligibility check for batch renewal"""
    enrollment_id: int
    eligible: bool
    reason: Optional[str] = None  # "pending_makeups", "conflicts", "extension_pending"
    student_name: str
    details: Optional[str] = None  # e.g., "2 pending makeups", "Conflict on Feb 10"
    # Student info for StudentInfoBadges display
    student_id: Optional[int] = None
    school_student_id: Optional[str] = None
    grade: Optional[str] = None
    lang_stream: Optional[str] = None
    school: Optional[str] = None
    # Schedule preview info
    assigned_day: Optional[str] = None
    assigned_time: Optional[str] = None
    suggested_first_lesson_date: Optional[date] = None
    # Override capability (True for pending_makeups, extension_pending; False for conflicts)
    overridable: bool = False


class BatchRenewCheckResponse(BaseModel):
    """Response for batch renewal eligibility check"""
    eligible: List[EligibilityResult] = Field(default_factory=list)
    ineligible: List[EligibilityResult] = Field(default_factory=list)


class BatchRenewRequest(BaseModel):
    """Request to create multiple renewal enrollments"""
    enrollment_ids: List[int] = Field(..., min_length=1, max_length=50)
    lessons_paid: int = Field(default=6, ge=1, le=52)


class BatchRenewResult(BaseModel):
    """Result for a single enrollment in batch renewal"""
    original_enrollment_id: int
    new_enrollment_id: Optional[int] = None
    success: bool
    error: Optional[str] = None


class BatchRenewResponse(BaseModel):
    """Response for batch renewal creation"""
    results: List[BatchRenewResult] = Field(default_factory=list)
    created_count: int = Field(default=0, ge=0)
    failed_count: int = Field(default=0, ge=0)


# ============================================
# Make-up Proposal Schemas
# ============================================

class MakeupProposalSlotBase(BaseModel):
    """Base schema for proposal slot"""
    proposed_date: date
    proposed_time_slot: str = Field(..., max_length=100)
    proposed_tutor_id: int = Field(..., gt=0)
    proposed_location: str = Field(..., max_length=100)


class MakeupProposalSlotCreate(MakeupProposalSlotBase):
    """Schema for creating a proposal slot"""
    slot_order: int = Field(default=1, ge=1, le=3)


class MakeupProposalSlotResponse(MakeupProposalSlotBase):
    """Response schema for a proposal slot"""
    id: int = Field(..., gt=0)
    proposal_id: int = Field(..., gt=0)
    slot_order: int = Field(..., ge=1, le=3)
    slot_status: str = Field(default='pending', max_length=20)
    resolved_at: Optional[datetime] = None
    resolved_by_tutor_id: Optional[int] = Field(None, gt=0)
    resolved_by_tutor_name: Optional[str] = Field(None, max_length=255)
    rejection_reason: Optional[str] = Field(None, max_length=1000)
    proposed_tutor_name: Optional[str] = Field(None, max_length=255)

    model_config = ConfigDict(from_attributes=True)


class MakeupProposalSlotUpdate(BaseModel):
    """Schema for updating a proposal slot (all fields optional)"""
    proposed_date: Optional[date] = None
    proposed_time_slot: Optional[str] = Field(None, max_length=100)
    proposed_tutor_id: Optional[int] = Field(None, gt=0)
    proposed_location: Optional[str] = Field(None, max_length=100)


class MakeupProposalCreate(BaseModel):
    """Schema for creating a make-up proposal"""
    original_session_id: int = Field(..., gt=0)
    proposal_type: str = Field(..., pattern="^(specific_slots|needs_input)$")
    # For needs_input type
    needs_input_tutor_id: Optional[int] = Field(None, gt=0)
    # For specific_slots type (1-3 slots)
    slots: List[MakeupProposalSlotCreate] = Field(default_factory=list, max_length=3)
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator('slots')
    @classmethod
    def validate_slots(cls, v, info):
        proposal_type = info.data.get('proposal_type')
        if proposal_type == 'specific_slots' and len(v) == 0:
            raise ValueError('At least one slot is required for specific_slots proposal')
        if proposal_type == 'needs_input' and len(v) > 0:
            raise ValueError('Slots should be empty for needs_input proposal')
        return v


class MakeupProposalResponse(BaseModel):
    """Response schema for a make-up proposal"""
    id: int = Field(..., gt=0)
    original_session_id: int = Field(..., gt=0)
    proposed_by_tutor_id: int = Field(..., gt=0)
    proposed_by_tutor_name: Optional[str] = Field(None, max_length=255)
    proposal_type: str = Field(..., max_length=20)
    needs_input_tutor_id: Optional[int] = Field(None, gt=0)
    needs_input_tutor_name: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=1000)
    status: str = Field(default='pending', max_length=20)
    created_at: datetime
    resolved_at: Optional[datetime] = None
    message_id: Optional[int] = Field(None, gt=0)
    # Nested slot responses
    slots: List[MakeupProposalSlotResponse] = Field(default_factory=list)
    # Original session info for context
    original_session: Optional['SessionResponse'] = None

    model_config = ConfigDict(from_attributes=True)


class SlotApproveRequest(BaseModel):
    """Request to approve a slot"""
    pass  # No additional fields needed


class SlotRejectRequest(BaseModel):
    """Request to reject a slot"""
    rejection_reason: Optional[str] = Field(None, max_length=1000)


class ProposalRejectRequest(BaseModel):
    """Request to reject entire proposal (for needs_input type)"""
    rejection_reason: Optional[str] = Field(None, max_length=1000)


class PendingProposalCount(BaseModel):
    """Count of pending proposals for current tutor"""
    count: int = Field(default=0, ge=0)


# ============================================
# Extension Request Schemas
# ============================================

class ExtensionRequestCreate(BaseModel):
    """Schema for creating an extension request"""
    session_id: int = Field(..., gt=0, description="Session that needs extension")
    requested_extension_weeks: int = Field(..., ge=1, le=8, description="Number of weeks to extend (1-8)")
    reason: str = Field(..., max_length=1000, description="Why extension is needed")
    proposed_reschedule_date: Optional[date] = Field(None, description="Proposed new date for the session")
    proposed_reschedule_time: Optional[str] = Field(None, max_length=100, description="Proposed time slot")
    target_enrollment_id: Optional[int] = Field(None, gt=0, description="Enrollment to extend (for concurrent enrollments). If not provided, auto-detects latest Regular enrollment.")


class ExtensionRequestApprove(BaseModel):
    """Schema for admin approving an extension request"""
    extension_granted_weeks: int = Field(..., ge=1, le=8, description="Weeks to grant (may differ from requested)")
    review_notes: Optional[str] = Field(None, max_length=500, description="Admin notes on approval")


class ExtensionRequestReject(BaseModel):
    """Schema for admin rejecting an extension request"""
    review_notes: str = Field(..., min_length=5, max_length=500, description="Reason for rejection (required)")


class ExtensionRequestResponse(BaseModel):
    """Response schema for an extension request"""
    id: int = Field(..., gt=0)
    session_id: int = Field(..., gt=0)
    enrollment_id: int = Field(..., gt=0, description="Source enrollment (session belongs to this)")
    target_enrollment_id: Optional[int] = Field(None, gt=0, description="Enrollment to extend (student's current). NULL = same as enrollment_id")
    student_id: int = Field(..., gt=0)
    tutor_id: int = Field(..., gt=0)
    requested_extension_weeks: int = Field(..., ge=1)
    reason: str
    proposed_reschedule_date: Optional[date] = None
    proposed_reschedule_time: Optional[str] = None
    request_status: str = Field(..., max_length=20)  # Pending, Approved, Rejected
    requested_by: str
    requested_at: datetime
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    extension_granted_weeks: Optional[int] = None
    session_rescheduled: bool = False
    # Joined fields
    student_name: Optional[str] = Field(None, max_length=255)
    tutor_name: Optional[str] = Field(None, max_length=255)
    original_session_date: Optional[date] = None
    # Student info for display
    school_student_id: Optional[str] = Field(None, max_length=50)
    grade: Optional[str] = Field(None, max_length=10)
    lang_stream: Optional[str] = Field(None, max_length=10)
    school: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=100)

    model_config = ConfigDict(from_attributes=True)


class ExtensionRequestDetailResponse(ExtensionRequestResponse):
    """Detailed response with enrollment context for admin review"""
    # Source enrollment context (where the session is from)
    enrollment_first_lesson_date: Optional[date] = None
    enrollment_lessons_paid: Optional[int] = None
    source_effective_end_date: Optional[date] = Field(None, description="Source enrollment's effective end date")
    source_pending_makeups_count: int = Field(default=0, description="Pending makeups on source enrollment")
    source_sessions_completed: int = Field(default=0, description="Sessions completed on source enrollment")
    # Target enrollment context (the one to extend - may differ from source)
    target_first_lesson_date: Optional[date] = None
    target_lessons_paid: Optional[int] = None
    current_extension_weeks: int = Field(default=0, description="Target enrollment's current extensions")
    current_effective_end_date: Optional[date] = Field(None, description="Target enrollment's current end date")
    projected_effective_end_date: Optional[date] = Field(None, description="Target enrollment's end date if approved")
    # Session/makeup context (target enrollment - kept for backward compatibility)
    pending_makeups_count: int = Field(default=0, description="Pending makeups on target enrollment")
    sessions_completed: int = Field(default=0, description="Sessions completed on target enrollment")
    admin_guidance: Optional[str] = Field(None, max_length=200)

    model_config = ConfigDict(from_attributes=True)


class PendingExtensionRequestCount(BaseModel):
    """Count of pending extension requests for admin badge"""
    count: int = Field(default=0, ge=0)


# ============================================
# Exam Revision Slot Schemas
# ============================================

class ExamRevisionSlotCreate(BaseModel):
    """Schema for creating an exam revision slot"""
    calendar_event_id: int = Field(..., gt=0, description="ID of the calendar event (exam) this slot is for")
    session_date: date = Field(..., description="Date of the revision session")
    time_slot: str = Field(..., max_length=50, description="Time slot (e.g., '10:00-12:00')")
    tutor_id: int = Field(..., gt=0, description="ID of the tutor running the session")
    location: str = Field(..., max_length=100, description="Location of the session")
    notes: Optional[str] = Field(None, max_length=1000, description="Optional notes for this revision slot")
    created_by: Optional[str] = Field(None, max_length=255, description="Email of user creating the slot")


class ExamRevisionSlotUpdate(BaseModel):
    """Schema for updating an exam revision slot"""
    session_date: Optional[date] = None
    time_slot: Optional[str] = Field(None, max_length=50)
    tutor_id: Optional[int] = Field(None, gt=0)
    location: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    modified_by: Optional[str] = Field(None, max_length=255, description="Email of user modifying the slot")


class ExamRevisionSlotResponse(BaseModel):
    """Response schema for an exam revision slot"""
    id: int = Field(..., gt=0)
    calendar_event_id: int = Field(..., gt=0)
    session_date: date
    time_slot: str
    tutor_id: int
    tutor_name: Optional[str] = Field(None, max_length=255)
    location: str
    notes: Optional[str] = None
    created_at: datetime
    created_by: Optional[str] = None
    enrolled_count: int = Field(default=0, ge=0, description="Number of students enrolled")
    # Include calendar event info
    calendar_event: Optional['CalendarEventResponse'] = None
    # Optional warning for overlapping slots
    warning: Optional[str] = Field(None, description="Warning message if potential overlap detected")

    model_config = ConfigDict(from_attributes=True)


class EnrolledStudentInfo(BaseModel):
    """Info about a student enrolled in a revision slot"""
    session_id: int = Field(..., gt=0)
    student_id: int = Field(..., gt=0)
    student_name: str = Field(..., max_length=255)
    school_student_id: Optional[str] = Field(None, max_length=100)
    grade: Optional[str] = Field(None, max_length=50)
    school: Optional[str] = Field(None, max_length=200)
    lang_stream: Optional[str] = Field(None, max_length=50)
    academic_stream: Optional[str] = Field(None, max_length=50)
    home_location: Optional[str] = Field(None, max_length=200, description="Student's home location for display prefix")
    session_status: str = Field(..., max_length=50)
    consumed_session_id: Optional[int] = Field(None, gt=0, description="Original session that was consumed")

    model_config = ConfigDict(from_attributes=True)


class ExamRevisionSlotDetailResponse(ExamRevisionSlotResponse):
    """Detailed response including enrolled students"""
    enrolled_students: List[EnrolledStudentInfo] = Field(default_factory=list)


class PendingSessionInfo(BaseModel):
    """Info about a pending session that can be consumed"""
    id: int = Field(..., gt=0)
    session_date: date
    time_slot: Optional[str] = Field(None, max_length=50)
    session_status: str = Field(..., max_length=50)
    tutor_name: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=100)
    root_original_session_date: Optional[date] = Field(None, description="Root original session date for 60-day rule")

    model_config = ConfigDict(from_attributes=True)


class EligibleStudentResponse(BaseModel):
    """Student eligible for enrollment in a revision slot"""
    student_id: int = Field(..., gt=0)
    student_name: str = Field(..., max_length=255)
    school_student_id: Optional[str] = Field(None, max_length=100)
    grade: Optional[str] = Field(None, max_length=50)
    school: Optional[str] = Field(None, max_length=200)
    lang_stream: Optional[str] = Field(None, max_length=50)
    academic_stream: Optional[str] = Field(None, max_length=50)
    home_location: Optional[str] = Field(None, max_length=200, description="Student's home location for display prefix")
    enrollment_tutor_name: Optional[str] = Field(None, description="Tutor from student's enrollment")
    pending_sessions: List[PendingSessionInfo] = Field(default_factory=list, description="Sessions available to consume")
    is_past_deadline: bool = Field(False, description="True if revision slot is on student's regular slot past enrollment end date")

    model_config = ConfigDict(from_attributes=True)


class EnrollStudentRequest(BaseModel):
    """Request to enroll a student in a revision slot"""
    student_id: int = Field(..., gt=0, description="ID of the student to enroll")
    consume_session_id: int = Field(..., gt=0, description="ID of the pending session to consume")
    notes: Optional[str] = Field(None, max_length=500, description="Optional notes for the enrollment")
    created_by: Optional[str] = Field(None, max_length=255, description="Email of user performing the enrollment")


class EnrollStudentResponse(BaseModel):
    """Response after enrolling a student"""
    revision_session: SessionResponse
    consumed_session: SessionResponse
    warning: Optional[str] = Field(None, description="Warning about conflicts (e.g., student time conflicts)")


class ExamWithRevisionSlotsResponse(BaseModel):
    """Calendar event with its revision slots for calendar view"""
    id: int = Field(..., gt=0)
    event_id: str
    title: str
    description: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    school: Optional[str] = None
    grade: Optional[str] = None
    academic_stream: Optional[str] = None
    event_type: Optional[str] = None
    revision_slots: List[ExamRevisionSlotResponse] = Field(default_factory=list)
    total_enrolled: int = Field(default=0, ge=0, description="Total students enrolled across all slots")
    eligible_count: int = Field(default=0, ge=0, description="Count of eligible students not yet enrolled")

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Schedule Change Schemas
# ============================================

class ScheduleChangeRequest(BaseModel):
    """Request to preview or apply a schedule change"""
    assigned_day: str = Field(..., max_length=20, description="New assigned day (Monday, Tuesday, etc.)")
    assigned_time: str = Field(..., max_length=20, description="New time slot")
    location: str = Field(..., max_length=200, description="New location")
    tutor_id: int = Field(..., gt=0, description="New tutor ID")


class UnchangeableSession(BaseModel):
    """Session that cannot be changed (past or completed)"""
    session_id: int
    session_date: date
    time_slot: str
    tutor_name: str
    session_status: str
    reason: str = Field(..., description="Why this session cannot be changed")


class UpdatableSession(BaseModel):
    """Session that will be updated with schedule change"""
    session_id: int
    current_date: date
    current_time_slot: str
    current_tutor_name: str
    new_date: date
    new_time_slot: str
    new_tutor_name: str
    is_holiday: bool = Field(default=False, description="True if new date falls on a holiday")
    holiday_name: Optional[str] = Field(default=None, description="Name of holiday if is_holiday=True")
    shifted_date: Optional[date] = Field(default=None, description="Auto-shifted date if original was a holiday")


class ScheduleInfo(BaseModel):
    """Schedule information with day, time, location, and tutor"""
    assigned_day: str = Field(..., max_length=20)
    assigned_time: str = Field(..., max_length=20)
    location: str = Field(..., max_length=200)
    tutor_id: int = Field(..., gt=0)
    tutor_name: str = Field(..., max_length=200)


class ScheduleChangePreviewResponse(BaseModel):
    """Response from schedule change preview"""
    enrollment_id: int
    current_schedule: ScheduleInfo = Field(..., description="Current day, time, location, tutor")
    new_schedule: ScheduleInfo = Field(..., description="Requested day, time, location, tutor")
    unchangeable_sessions: List[UnchangeableSession] = Field(default_factory=list)
    updatable_sessions: List[UpdatableSession] = Field(default_factory=list)
    conflicts: List[StudentConflict] = Field(default_factory=list, description="Conflicts with new schedule")
    warnings: List[str] = Field(default_factory=list, description="Warnings about the change")
    can_apply: bool = Field(default=True, description="Whether the change can be applied (no conflicts)")


class ApplyScheduleChangeRequest(BaseModel):
    """Request to apply schedule change"""
    assigned_day: str = Field(..., max_length=20)
    assigned_time: str = Field(..., max_length=20)
    location: str = Field(..., max_length=200)
    tutor_id: int = Field(..., gt=0)
    apply_to_sessions: bool = Field(default=True, description="Whether to also update future sessions")
    date_overrides: Optional[Dict[int, str]] = Field(default=None, description="Manual date overrides: session_id -> ISO date string")
    time_overrides: Optional[Dict[int, str]] = Field(default=None, description="Manual time overrides: session_id -> time string (e.g. '14:30')")


class ScheduleChangeResult(BaseModel):
    """Result of applying schedule change"""
    enrollment_id: int
    sessions_updated: int = Field(default=0, ge=0)
    new_effective_end_date: Optional[date] = Field(default=None)
    message: str


# ============================================
# WeCom Schemas
# ============================================

class WecomWebhookResponse(BaseModel):
    """Response for listing WeCom webhooks (URL masked for security)"""
    id: int = Field(..., gt=0)
    webhook_name: str = Field(..., max_length=100)
    target_description: Optional[str] = Field(None, max_length=255)
    is_active: bool = True
    last_used_at: Optional[datetime] = None
    total_messages_sent: int = Field(default=0, ge=0)
    notes: Optional[str] = None
    webhook_url_configured: bool = Field(default=False, description="Whether a real webhook URL is set (not placeholder)")

    model_config = ConfigDict(from_attributes=True)


class WecomWebhookAdminResponse(WecomWebhookResponse):
    """Admin response that includes the full webhook URL"""
    webhook_url: str = Field(..., description="Full webhook URL (admin only)")


class WecomWebhookUpdate(BaseModel):
    """Schema for updating a webhook configuration"""
    webhook_url: Optional[str] = Field(None, max_length=2000, description="Full webhook URL from WeCom robot")
    target_description: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=1000)


class WecomSendRequest(BaseModel):
    """Request to send a message to a WeCom group"""
    webhook_name: str = Field(..., max_length=100, description="Target webhook (e.g., admin_group, tutor_group)")
    msg_type: str = Field(default="text", pattern="^(text|markdown)$", description="Message type: text or markdown")
    content: str = Field(..., min_length=1, max_length=5000, description="Message content")


class WecomSendResponse(BaseModel):
    """Response after sending a WeCom message"""
    success: bool
    message: str
    log_id: Optional[int] = None
    wecom_errcode: Optional[int] = Field(None, description="WeCom API error code (0 = success)")
    wecom_errmsg: Optional[str] = Field(None, description="WeCom API error message")


class WecomMessageLogResponse(BaseModel):
    """Response for viewing WeCom message send history"""
    id: int = Field(..., gt=0)
    webhook_name: str = Field(..., max_length=100)
    message_type: Optional[str] = Field(None, max_length=50)
    message_content: str
    enrollment_id: Optional[int] = None
    session_id: Optional[int] = None
    send_status: str = Field(..., max_length=20)
    send_timestamp: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Tutor Memo Schemas
# ============================================

class MemoExerciseItem(BaseModel):
    """Single exercise entry within a tutor memo"""
    exercise_type: str = Field(..., pattern="^(CW|HW)$")
    pdf_name: str = Field(..., min_length=1, max_length=500)
    page_start: Optional[int] = Field(None, gt=0)
    page_end: Optional[int] = Field(None, gt=0)
    remarks: Optional[str] = Field(None, max_length=1000)
    answer_pdf_name: Optional[str] = Field(None, max_length=500)
    answer_page_start: Optional[int] = Field(None, gt=0)
    answer_page_end: Optional[int] = Field(None, gt=0)
    answer_remarks: Optional[str] = Field(None, max_length=1000)


class TutorMemoCreate(BaseModel):
    """Request schema for creating a tutor memo"""
    student_id: int = Field(..., gt=0)
    memo_date: date
    time_slot: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None
    exercises: Optional[List[MemoExerciseItem]] = None
    performance_rating: Optional[str] = Field(None, max_length=10)


class TutorMemoUpdate(BaseModel):
    """Request schema for updating a tutor memo"""
    student_id: Optional[int] = None
    memo_date: Optional[date] = None
    time_slot: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None
    exercises: Optional[List[MemoExerciseItem]] = None
    performance_rating: Optional[str] = Field(None, max_length=10)


class TutorMemoResponse(BaseModel):
    """Response schema for a tutor memo"""
    id: int
    student_id: int
    student_name: str
    school_student_id: Optional[str] = None
    grade: Optional[str] = None
    school: Optional[str] = None
    tutor_id: int
    tutor_name: str
    memo_date: date
    time_slot: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    exercises: Optional[List[MemoExerciseItem]] = None
    performance_rating: Optional[str] = None
    linked_session_id: Optional[int] = None
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TutorMemoImportRequest(BaseModel):
    """Request for importing memo data into a session"""
    import_notes: bool = True
    import_exercises: bool = True
    import_rating: bool = True


# ============================================
# Document Builder Schemas
# ============================================

class DocumentCreate(BaseModel):
    """Create a new document."""
    title: str = Field("Untitled Document", max_length=255)
    doc_type: str = Field(..., pattern="^(worksheet|lesson_plan)$")
    page_layout: Optional[dict] = None
    content: Optional[dict] = None
    tags: Optional[List[str]] = None
    folder_id: Optional[int] = None
    is_template: bool = False


class DocumentUpdate(BaseModel):
    """Update a document. All fields optional."""
    title: Optional[str] = None
    content: Optional[dict] = None
    page_layout: Optional[dict] = None
    is_archived: Optional[bool] = None
    is_template: Optional[bool] = None
    tags: Optional[List[str]] = None
    folder_id: Optional[int] = None


class DocumentResponse(BaseModel):
    """Full document response including content."""
    id: int
    title: str
    doc_type: str
    content: Optional[dict] = None
    page_layout: Optional[dict] = None
    created_by: int
    created_by_name: str = ""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[int] = None
    updated_by_name: str = ""
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    is_template: bool = False
    is_starred: bool = False
    locked_by: Optional[int] = None
    locked_by_name: str = ""
    lock_expires_at: Optional[datetime] = None
    tags: List[str] = []
    folder_id: Optional[int] = None
    folder_name: str = ""
    source_filename: Optional[str] = None
    questions: Optional[List[dict]] = None
    parent_id: Optional[int] = None
    parent_title: str = ""
    children: List[dict] = []
    version_count: int = 0
    content_preview: str = ""

    model_config = ConfigDict(from_attributes=True)


class DocumentListItem(BaseModel):
    """Document summary for list views (no content)."""
    id: int
    title: str
    doc_type: str
    page_layout: Optional[dict] = None
    created_by: int
    created_by_name: str = ""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[int] = None
    updated_by_name: str = ""
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    is_template: bool = False
    is_starred: bool = False
    locked_by: Optional[int] = None
    locked_by_name: str = ""
    lock_expires_at: Optional[datetime] = None
    tags: List[str] = []
    folder_id: Optional[int] = None
    folder_name: str = ""
    source_filename: Optional[str] = None
    questions: Optional[List[dict]] = None
    parent_id: Optional[int] = None
    version_count: int = 0
    content_preview: str = ""

    model_config = ConfigDict(from_attributes=True)


class FolderCreate(BaseModel):
    """Create a document folder."""
    name: str = Field(..., max_length=255)
    parent_id: Optional[int] = None


class BulkDocumentUpdate(BaseModel):
    """Bulk update multiple documents at once."""
    ids: List[int] = Field(..., min_length=1)
    folder_id: Optional[int] = None
    tags_add: Optional[List[str]] = None
    tags_remove: Optional[List[str]] = None
    is_archived: Optional[bool] = None


class TagRenameRequest(BaseModel):
    """Rename a tag across all documents."""
    old_name: str = Field(..., min_length=1, max_length=100)
    new_name: str = Field(..., min_length=1, max_length=100)


class FolderUpdate(BaseModel):
    """Update a document folder."""
    name: Optional[str] = Field(None, max_length=255)
    parent_id: Optional[int] = None


class FolderResponse(BaseModel):
    """Document folder response."""
    id: int
    name: str
    parent_id: Optional[int] = None
    created_by: int
    created_by_name: str = ""
    created_at: Optional[datetime] = None
    document_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Document Version Schemas
# ============================================

class DocumentVersionResponse(BaseModel):
    """Version summary for list view (no content)."""
    id: int
    document_id: int
    version_number: int
    title: str
    created_by: int
    created_by_name: str = ""
    created_at: Optional[datetime] = None
    version_type: str
    label: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DocumentVersionDetailResponse(DocumentVersionResponse):
    """Full version with content for preview."""
    content: Optional[dict] = None
    page_layout: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


class CreateCheckpointRequest(BaseModel):
    """Create a manual checkpoint."""
    label: Optional[str] = Field(None, max_length=255)


# ============================================
# Summer Course Schemas
# ============================================

# -- Public schemas (no auth required) --

class SummerCourseFormConfig(BaseModel):
    """Config data exposed to the public application form."""
    year: int
    title: str
    description: Optional[str] = None
    application_open_date: datetime
    application_close_date: datetime
    course_start_date: date
    course_end_date: date
    total_lessons: int
    pricing_config: Dict[str, Any]
    locations: List[Dict[str, Any]]
    available_grades: List[Dict[str, Any]]
    time_slots: List[str]
    existing_student_options: Optional[List[Dict[str, Any]]] = None
    center_options: Optional[List[Dict[str, Any]]] = None
    lang_stream_options: Optional[List[Dict[str, Any]]] = None
    text_content: Optional[Dict[str, str]] = None
    course_intro: Optional[Dict[str, Any]] = None
    banner_image_url: Optional[str] = None
    primary_branch_options: List[Dict[str, str]] = Field(default_factory=list)


class SummerSiblingDeclaration(BaseModel):
    """A self-declared primary-branch sibling included in the apply submission."""
    name_en: str = Field(..., min_length=1, max_length=255)
    name_zh: Optional[str] = Field(None, max_length=255)
    source_branch: str = Field(..., min_length=1, max_length=20)


class SummerSiblingInfo(BaseModel):
    """A buddy-group sibling row exposed to the public form, status page and admin."""
    id: int
    name_en: str
    name_zh: Optional[str] = None
    source_branch: str
    verification_status: str  # Pending | Confirmed | Rejected
    declared_by_application_id: Optional[int] = None
    declared_by_name: Optional[str] = None  # Admin context: who declared the sibling
    can_remove: bool = False  # True if caller can self-remove (Pending + own declaration)
    created_at: Optional[datetime] = None  # When the sibling was declared — used as their "joined at" in group-reach date checks


class SummerSiblingCreateRequest(BaseModel):
    """Public POST body to declare a sibling on an existing application."""
    name_en: str = Field(..., min_length=1, max_length=255)
    name_zh: Optional[str] = Field(None, max_length=255)
    source_branch: str = Field(..., min_length=1, max_length=20)


class SummerSiblingAdminUpdate(BaseModel):
    """Admin PATCH body for verifying / rejecting a declared sibling."""
    verification_status: Literal["Pending", "Confirmed", "Rejected"]
    student_id: Optional[str] = Field(None, max_length=50)


class SummerApplicationCreate(BaseModel):
    """Form submission from public applicant."""
    student_name: str = Field(..., min_length=1, max_length=255)
    school: Optional[str] = Field(None, max_length=255)
    grade: str = Field(..., max_length=50)
    lang_stream: Optional[str] = Field(None, max_length=10)
    is_existing_student: Optional[str] = Field(None, max_length=100)
    current_centers: Optional[List[str]] = None
    wechat_id: Optional[str] = Field(None, max_length=100)
    contact_phone: str = Field(..., min_length=1, max_length=50)
    preferred_location: Optional[str] = Field(None, max_length=255)
    preference_1_day: Optional[str] = Field(None, max_length=20)
    preference_1_time: Optional[str] = Field(None, max_length=50)
    preference_2_day: Optional[str] = Field(None, max_length=20)
    preference_2_time: Optional[str] = Field(None, max_length=50)
    preference_3_day: Optional[str] = Field(None, max_length=20)
    preference_3_time: Optional[str] = Field(None, max_length=50)
    preference_4_day: Optional[str] = Field(None, max_length=20)
    preference_4_time: Optional[str] = Field(None, max_length=50)
    unavailability_notes: Optional[str] = Field(None, max_length=2000)
    buddy_code: Optional[str] = Field(None, max_length=20, description="Existing buddy group code to join")
    buddy_names: Optional[str] = Field(None, max_length=500)
    buddy_referrer_name: Optional[str] = Field(None, max_length=255)
    form_language: Optional[Literal["zh", "en"]] = "zh"
    sessions_per_week: int = Field(1, ge=1, le=3)
    declared_sibling: Optional[SummerSiblingDeclaration] = None


class SummerApplicationSubmitResponse(BaseModel):
    """Response after successful application submission."""
    reference_code: str
    buddy_code: Optional[str] = None
    message: str


class SummerApplicationStatusResponse(BaseModel):
    """Public status check response."""
    reference_code: str
    student_name: str
    application_status: str
    submitted_at: Optional[datetime] = None
    buddy_code: Optional[str] = None
    buddy_group_member_count: Optional[int] = None
    buddy_siblings: List[SummerSiblingInfo] = Field(default_factory=list)
    primary_branch_options: List[Dict[str, str]] = Field(default_factory=list)
    # Editable fields exposed so the status page can render and edit them
    # without a second admin-style fetch.
    grade: Optional[str] = None
    school: Optional[str] = None
    lang_stream: Optional[str] = None
    wechat_id: Optional[str] = None
    preferred_location: Optional[str] = None
    preference_1_day: Optional[str] = None
    preference_1_time: Optional[str] = None
    preference_2_day: Optional[str] = None
    preference_2_time: Optional[str] = None
    preference_3_day: Optional[str] = None
    preference_3_time: Optional[str] = None
    preference_4_day: Optional[str] = None
    preference_4_time: Optional[str] = None
    unavailability_notes: Optional[str] = None
    sessions_per_week: int = 1


class SummerApplicationEditRequest(BaseModel):
    """Partial update of an in-Submitted-state application.

    Used by both the public status-page edit flow (auth via ref code + phone)
    and the admin edit flow. All fields optional; the server enforces the
    editable whitelist and ignores anything outside it.
    """
    grade: Optional[str] = Field(None, max_length=50)
    school: Optional[str] = Field(None, max_length=255)
    lang_stream: Optional[str] = Field(None, max_length=10)
    wechat_id: Optional[str] = Field(None, max_length=100)
    preferred_location: Optional[str] = Field(None, max_length=255)
    preference_1_day: Optional[str] = Field(None, max_length=20)
    preference_1_time: Optional[str] = Field(None, max_length=50)
    preference_2_day: Optional[str] = Field(None, max_length=20)
    preference_2_time: Optional[str] = Field(None, max_length=50)
    preference_3_day: Optional[str] = Field(None, max_length=20)
    preference_3_time: Optional[str] = Field(None, max_length=50)
    preference_4_day: Optional[str] = Field(None, max_length=20)
    preference_4_time: Optional[str] = Field(None, max_length=50)
    unavailability_notes: Optional[str] = Field(None, max_length=2000)
    sessions_per_week: Optional[int] = Field(None, ge=1, le=3)


class SummerApplicationEditEntry(BaseModel):
    """One audit-trail row for the admin edit history view."""
    id: int
    edited_at: datetime
    field_name: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    edited_via: str  # 'applicant' | 'admin'
    edited_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SummerBuddyChangeRequest(BaseModel):
    """Request to change buddy group from status page."""
    action: Literal["join", "leave", "create"]
    buddy_code: Optional[str] = Field(None, max_length=20)
    buddy_referrer_name: Optional[str] = Field(None, max_length=255)


class SummerBuddyChangeResponse(BaseModel):
    """Response after buddy group change."""
    buddy_code: Optional[str] = None
    member_count: int = 0


class SummerBuddyGroupPublicResponse(BaseModel):
    """Public buddy-group lookup response (no PII; member count is exposed
    intentionally — see the get_buddy_group route for the trade-off rationale)."""
    buddy_code: str
    member_count: int
    is_full: bool
    max_members: int


# -- Admin schemas --

class SummerCourseConfigCreate(BaseModel):
    """Create a new summer course config."""
    year: int
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    application_open_date: datetime
    application_close_date: datetime
    course_start_date: date
    course_end_date: date
    total_lessons: int = Field(8, gt=0)
    pricing_config: Dict[str, Any]
    locations: List[Dict[str, Any]]
    available_grades: List[Dict[str, Any]]
    time_slots: List[str]
    existing_student_options: Optional[List[Dict[str, Any]]] = None
    center_options: Optional[List[Dict[str, Any]]] = None
    lang_stream_options: Optional[List[Dict[str, Any]]] = None
    text_content: Optional[Dict[str, str]] = None
    course_intro: Optional[Dict[str, Any]] = None
    banner_image_url: Optional[str] = None
    is_active: bool = False


class SummerCourseConfigUpdate(BaseModel):
    """Update an existing summer course config. All fields optional."""
    title: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    application_open_date: Optional[datetime] = None
    application_close_date: Optional[datetime] = None
    course_start_date: Optional[date] = None
    course_end_date: Optional[date] = None
    total_lessons: Optional[int] = Field(None, gt=0)
    pricing_config: Optional[Dict[str, Any]] = None
    locations: Optional[List[Dict[str, Any]]] = None
    available_grades: Optional[List[Dict[str, Any]]] = None
    time_slots: Optional[List[str]] = None
    existing_student_options: Optional[List[Dict[str, Any]]] = None
    center_options: Optional[List[Dict[str, Any]]] = None
    lang_stream_options: Optional[List[Dict[str, Any]]] = None
    text_content: Optional[Dict[str, str]] = None
    course_intro: Optional[Dict[str, Any]] = None
    banner_image_url: Optional[str] = None
    is_active: Optional[bool] = None


class SummerCourseConfigResponse(BaseModel):
    """Full config response for admin."""
    id: int
    year: int
    title: str
    description: Optional[str] = None
    application_open_date: datetime
    application_close_date: datetime
    course_start_date: date
    course_end_date: date
    total_lessons: int
    pricing_config: Dict[str, Any]
    locations: List[Dict[str, Any]]
    available_grades: List[Dict[str, Any]]
    time_slots: List[str]
    existing_student_options: Optional[List[Dict[str, Any]]] = None
    center_options: Optional[List[Dict[str, Any]]] = None
    lang_stream_options: Optional[List[Dict[str, Any]]] = None
    text_content: Optional[Dict[str, str]] = None
    course_intro: Optional[Dict[str, Any]] = None
    banner_image_url: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LinkedSecondaryStudentInfo(BaseModel):
    """Minimal Secondary student info for the admin list card's linked badge."""
    id: int
    student_name: str
    school_student_id: Optional[str] = None
    home_location: Optional[str] = None


class LinkedPrimaryProspectInfo(BaseModel):
    """Minimal P6 prospect info for the admin list card's linked badge.

    Exposed when a PrimaryProspect row has been auto-matched (or manually
    linked) to this SummerApplication via PrimaryProspect.summer_application_id.
    The `id` is used to build a ?focus= URL back to the prospects page.
    """
    id: int
    student_name: str
    primary_student_id: Optional[str] = None
    source_branch: str


class SummerApplicationResponse(BaseModel):
    """Full application response for admin."""
    id: int
    config_id: int
    reference_code: str
    student_name: str
    school: Optional[str] = None
    grade: str
    lang_stream: Optional[str] = None
    is_existing_student: Optional[str] = None
    verified_branch_origin: Optional[str] = None
    current_centers: Optional[List[str]] = None
    wechat_id: Optional[str] = None
    contact_phone: Optional[str] = None
    preferred_location: Optional[str] = None
    preference_1_day: Optional[str] = None
    preference_1_time: Optional[str] = None
    preference_2_day: Optional[str] = None
    preference_2_time: Optional[str] = None
    preference_3_day: Optional[str] = None
    preference_3_time: Optional[str] = None
    preference_4_day: Optional[str] = None
    preference_4_time: Optional[str] = None
    unavailability_notes: Optional[str] = None
    buddy_group_id: Optional[int] = None
    buddy_joined_at: Optional[datetime] = None
    buddy_code: Optional[str] = None
    buddy_names: Optional[str] = None
    buddy_referrer_name: Optional[str] = None
    existing_student_id: Optional[int] = None
    application_status: str
    admin_notes: Optional[str] = None
    submitted_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    form_language: Optional[str] = None
    sessions_per_week: int = 1
    lessons_paid: int
    total_lessons: int
    placed_count: int = 0
    sessions: List["SummerApplicationSessionInfo"] = []
    pending_sibling_count: int = 0
    buddy_siblings: List[SummerSiblingInfo] = []
    buddy_group_member_count: int = 0
    linked_student: Optional[LinkedSecondaryStudentInfo] = None
    linked_prospect: Optional[LinkedPrimaryProspectInfo] = None
    claimed_branch_code: Optional[str] = None
    # Summer publish bridge: set when application has been published into a
    # native Summer enrollment. Drives the Publish/Unpublish button state.
    published_enrollment_id: Optional[int] = None
    # Stamped when admin marks status as Paid; editable for receipt-date
    # corrections. Drives discount-tier deadline check.
    paid_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SummerApplicationUpdate(BaseModel):
    """Admin update for an application."""
    application_status: Optional[SummerApplicationStatus] = None
    admin_notes: Optional[str] = None
    existing_student_id: Optional[int] = None
    verified_branch_origin: Optional[str] = Field(None, max_length=20)
    lang_stream: Optional[str] = Field(None, max_length=10)
    buddy_code: Optional[str] = Field(None, max_length=20, description="Set to code to join, empty string to leave, 'NEW' to create")
    buddy_referrer_name: Optional[str] = Field(None, max_length=255)
    allow_buddy_overflow: bool = Field(
        False,
        description="Explicit acknowledgement when buddy_code would push the group past the public cap.",
    )
    # Detail fields admin can edit (mirrors SummerApplicationEditRequest +
    # identity fields locked for self-service)
    student_name: Optional[str] = Field(None, max_length=255)
    grade: Optional[str] = Field(None, max_length=50)
    school: Optional[str] = Field(None, max_length=255)
    wechat_id: Optional[str] = Field(None, max_length=100)
    preferred_location: Optional[str] = Field(None, max_length=255)
    preference_1_day: Optional[str] = Field(None, max_length=20)
    preference_1_time: Optional[str] = Field(None, max_length=50)
    preference_2_day: Optional[str] = Field(None, max_length=20)
    preference_2_time: Optional[str] = Field(None, max_length=50)
    preference_3_day: Optional[str] = Field(None, max_length=20)
    preference_3_time: Optional[str] = Field(None, max_length=50)
    preference_4_day: Optional[str] = Field(None, max_length=20)
    preference_4_time: Optional[str] = Field(None, max_length=50)
    unavailability_notes: Optional[str] = Field(None, max_length=2000)
    sessions_per_week: Optional[int] = Field(None, ge=1, le=3)
    lessons_paid: Optional[int] = Field(None, ge=4, le=8)
    # Editable so admin can correct the recorded payment date (e.g. parent
    # transferred before the early-bird deadline but admin marked Paid later).
    # Sent as an ISO datetime string; None clears it.
    paid_at: Optional[datetime] = None


class SummerApplicationStats(BaseModel):
    """Aggregate stats for admin dashboard."""
    total: int = 0
    by_status: Dict[str, int] = {}
    by_grade: Dict[str, int] = {}
    by_location: Dict[str, int] = {}


# ---- Summer Slot Schemas ----

class SummerSlotCreate(BaseModel):
    """Create a new timetable slot."""
    config_id: int
    slot_day: str = Field(..., max_length=20)
    time_slot: str = Field(..., max_length=50)
    location: str = Field(..., max_length=255)
    grade: Optional[str] = Field(None, max_length=50)
    slot_label: Optional[str] = Field(None, max_length=100)
    course_type: Optional[str] = Field(None, max_length=10)
    tutor_id: Optional[int] = None
    max_students: int = Field(8, gt=0)


class SummerSlotUpdate(BaseModel):
    """Update an existing slot. All fields optional."""
    grade: Optional[str] = Field(None, max_length=50)
    slot_label: Optional[str] = Field(None, max_length=100)
    course_type: Optional[str] = Field(None, max_length=10)
    tutor_id: Optional[int] = None
    max_students: Optional[int] = Field(None, gt=0)


class SummerSlotSessionInfo(BaseModel):
    """Nested session summary in slot response."""
    id: int
    application_id: int
    student_name: str
    grade: str
    session_status: str
    buddy_group_id: int | None = None
    # Per-student lesson_number override (used on ad-hoc Make-up Slots where
    # different students may cover different lesson material). For regular
    # slots this echoes the slot's SummerLesson.lesson_number.
    lesson_number: Optional[int] = None


class SummerSlotResponse(BaseModel):
    """Slot with tutor name and session summary."""
    id: int
    config_id: int
    slot_day: str
    time_slot: str
    location: str
    grade: Optional[str] = None
    slot_label: Optional[str] = None
    course_type: Optional[str] = None
    tutor_id: Optional[int] = None
    tutor_name: Optional[str] = None
    max_students: int
    is_adhoc: bool = False
    adhoc_date: Optional[date] = None
    created_at: Optional[datetime] = None
    session_count: int = 0
    sessions: List[SummerSlotSessionInfo] = []

    model_config = ConfigDict(from_attributes=True)


class SummerMakeupSlotCreate(BaseModel):
    """Create an ad-hoc Make-up Slot for a specific date/tutor."""
    config_id: int
    location: str = Field(..., max_length=255)
    date: date
    time_slot: str = Field(..., max_length=50)
    tutor_id: int
    max_students: int = Field(8, gt=0)


class SummerMakeupSlotCreateResponse(BaseModel):
    """Response to Make-up Slot creation, including optional conflict note."""
    slot: SummerSlotResponse
    tutor_conflict_note: Optional[str] = None


# ---- Summer Session Schemas (per-student bookings) ----

class SummerSessionCreate(BaseModel):
    """Assign a student (application) to a slot/lesson."""
    application_id: int
    slot_id: int
    lesson_id: Optional[int] = None
    mode: Literal["all", "first_half", "single"] = "all"
    session_status: Literal["Tentative", "Rescheduled - Pending Make-up"] = "Tentative"
    # Per-student lesson_number override, used primarily when dropping onto an
    # ad-hoc Make-up Slot where different students can cover different material.
    # Regular slots leave this null and inherit from SummerLesson at publish time.
    lesson_number: Optional[int] = Field(None, ge=1, le=20)


class SummerSessionStatusUpdate(BaseModel):
    """Update session status."""
    session_status: Literal["Tentative", "Confirmed", "Cancelled", "Rescheduled - Pending Make-up"]


class SummerSessionLessonNumberUpdate(BaseModel):
    """Narrow PATCH payload for pre-publish SummerSession.lesson_number edits.
    Used by ad-hoc Make-up Slot per-student badges. Clearing is explicit
    via `clear_lesson_number` so None stays as "no change" (follows the
    SummerLessonUpdate / SessionUpdate convention)."""
    lesson_number: Optional[int] = Field(None, ge=1, le=20)
    clear_lesson_number: bool = False


class SummerSessionResponse(BaseModel):
    """Full per-student session response with joined data."""
    id: int
    application_id: int
    slot_id: int
    lesson_id: Optional[int] = None
    lesson_number: Optional[int] = None
    specific_date: Optional[date] = None
    session_status: str
    placed_at: Optional[datetime] = None
    placed_by: Optional[str] = None
    student_name: Optional[str] = None
    student_grade: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ---- Summer Lesson Schemas (class meetings) ----

class SummerLessonResponse(BaseModel):
    """Materialized lesson (class meeting) response."""
    id: int
    slot_id: int
    lesson_date: date
    lesson_number: Optional[int] = None
    lesson_status: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SummerLessonUpdate(BaseModel):
    """Update a lesson's number, status, or notes."""
    lesson_number: Optional[int] = Field(None, ge=1, le=20)
    lesson_status: Optional[Literal["Scheduled", "Cancelled"]] = None
    notes: Optional[str] = None
    # Opt-in clear so None stays as "no change" (otherwise admins can't
    # clear the slot-level default back to NULL on ad-hoc Make-up Slots).
    clear_lesson_number: bool = False


class SummerLessonCalendarEntry(BaseModel):
    """Lesson with slot info and sessions for calendar view."""
    lesson_id: int
    slot_id: int
    slot_day: str
    time_slot: str
    grade: Optional[str] = None
    course_type: Optional[str] = None
    lesson_number: int
    lesson_status: str
    tutor_id: Optional[int] = None
    tutor_name: Optional[str] = None
    max_students: int
    date: date
    notes: Optional[str] = None
    sessions: List[SummerSlotSessionInfo] = []
    is_adhoc: bool = False


class SummerLessonCalendarResponse(BaseModel):
    """Calendar view data for one week."""
    week_start: date
    week_end: date
    lessons: List[SummerLessonCalendarEntry]


class SummerFindSlotResult(BaseModel):
    """A candidate lesson returned by find-slot search."""
    lesson_id: int
    slot_id: int
    date: date
    time_slot: str
    tutor_name: Optional[str] = None
    current_count: int
    max_students: int
    lesson_number: int
    lesson_match: bool


# ---- Summer Student Lessons Schemas ----

class SummerStudentLessonEntry(BaseModel):
    """One lesson slot in a student's 8-lesson progress."""
    lesson_number: int
    placed: bool
    session_id: Optional[int] = None
    lesson_id: Optional[int] = None
    lesson_date: Optional[date] = None
    time_slot: Optional[str] = None
    slot_id: Optional[int] = None
    session_status: Optional[str] = None


class SummerStudentLessonsRow(BaseModel):
    """Per-student lesson progress."""
    application_id: int
    student_name: str
    grade: str
    lang_stream: Optional[str] = None
    application_status: Optional[str] = None
    is_existing_student: Optional[str] = None
    claimed_branch_code: Optional[str] = None
    verified_branch_origin: Optional[str] = None
    linked_student: Optional[LinkedSecondaryStudentInfo] = None
    linked_prospect: Optional[LinkedPrimaryProspectInfo] = None
    sessions_per_week: int
    lessons_paid: int
    placed_count: int
    rescheduled_count: int = 0
    total_lessons: int
    lessons: List[SummerStudentLessonEntry]


class SummerStudentLessonsResponse(BaseModel):
    """All students' lesson progress for a config+location."""
    students: List[SummerStudentLessonsRow]


# ---- Summer Demand Schemas ----

class SummerDemandCell(BaseModel):
    """Demand counts for a single day x time_slot cell."""
    day: str
    time_slot: str
    total_first_pref: int = 0
    total_second_pref: int = 0
    by_grade_first: Dict[str, int] = {}
    by_grade_second: Dict[str, int] = {}


class SummerDemandResponse(BaseModel):
    """Full demand heatmap for one location."""
    location: str
    cells: List[SummerDemandCell]


# ---- Summer Auto-Suggest Schemas ----

class SummerSuggestRequest(BaseModel):
    """Input for auto-suggest algorithm."""
    config_id: int
    location: str
    application_id: Optional[int] = None
    exclude_dates: Optional[List[date]] = None
    include_dates: Optional[List[date]] = None


class SummerLessonAssignment(BaseModel):
    """A single lesson in a proposed placement."""
    lesson_id: int
    slot_id: int
    lesson_number: int
    lesson_date: date
    time_slot: str
    slot_day: str
    tutor_name: Optional[str] = None
    student_count: int = 0
    max_students: int = 8
    is_pending_makeup: bool = False


class SummerSuggestionItem(BaseModel):
    """A proposed placement with lesson-level assignments."""
    application_id: int
    student_name: str
    student_grade: str
    sessions_per_week: int
    lesson_assignments: List[SummerLessonAssignment]
    sequence_score: float
    match_type: str
    confidence: float
    reason: str
    unavailability_notes: Optional[str] = None
    option_label: Optional[str] = None
    preference_1_day: Optional[str] = None
    preference_1_time: Optional[str] = None
    preference_2_day: Optional[str] = None
    preference_2_time: Optional[str] = None
    preference_3_day: Optional[str] = None
    preference_3_time: Optional[str] = None
    preference_4_day: Optional[str] = None
    preference_4_time: Optional[str] = None
    placed_count: int = 0
    lessons_paid: int = 8
    pending_makeup_count: int = 0


class SummerSuggestResponse(BaseModel):
    """Ranked list of proposals from auto-suggest."""
    proposals: List[SummerSuggestionItem]
    unplaceable: List[Dict[str, Any]] = []


# ---- Summer Tutor Duty Schemas ----

class SummerTutorDutyItem(BaseModel):
    """Single duty assignment for bulk-set."""
    tutor_id: int
    duty_day: str = Field(..., max_length=20)
    time_slot: str = Field(..., max_length=50)


class SummerTutorDutyBulkSet(BaseModel):
    """Bulk-set tutor duties for a config+location (replaces all existing)."""
    config_id: int
    location: str = Field(..., max_length=255)
    duties: List[SummerTutorDutyItem]


class SummerTutorDutyResponse(BaseModel):
    """Tutor duty with joined tutor name."""
    id: int
    config_id: int
    tutor_id: int
    tutor_name: str
    location: str
    duty_day: str
    time_slot: str

    model_config = ConfigDict(from_attributes=True)


# ---- Summer Application Session Info (for embedding in application response) ----

class SummerApplicationSessionInfo(BaseModel):
    """Session info embedded in application response — one per non-cancelled session."""
    id: int
    slot_id: int
    slot_day: str
    time_slot: str
    location: Optional[str] = None
    grade: Optional[str] = None
    tutor_name: Optional[str] = None
    session_status: str
    lesson_number: Optional[int] = None
    lesson_date: Optional[str] = None
    slot_max_students: Optional[int] = None
    slot_current_count: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================
# Summer Publish Bridge (Phase 5)
# ============================================

class SummerPublishConflictSession(BaseModel):
    """Existing session that collides with a summer placement at the same datetime."""
    session_id: int
    session_date: date
    time_slot: Optional[str] = None
    enrollment_id: Optional[int] = None
    enrollment_type: Optional[str] = None


class SummerPublishResponse(BaseModel):
    """Result of publishing one summer application."""
    application_id: int
    enrollment_id: int
    sessions_created: int


class SummerUnpublishResponse(BaseModel):
    """Result of unpublishing one summer application."""
    application_id: int
    enrollment_id: int
    sessions_deleted: int
    application_status: str


class SummerPublishBatchRequest(BaseModel):
    """Bulk-publish a set of applications. Each runs independently."""
    application_ids: List[int] = Field(..., min_length=1, max_length=100)


class SummerPublishResult(BaseModel):
    """Per-application result inside a batch publish response."""
    application_id: int
    success: bool
    enrollment_id: Optional[int] = None
    sessions_created: Optional[int] = None
    error_code: Optional[str] = None
    error: Optional[str] = None


class SummerPublishBatchResponse(BaseModel):
    """Aggregate response for batch publish — one result per requested app."""
    results: List[SummerPublishResult]
    published_count: int
    failed_count: int


# ============================================
# Primary Prospect Schemas (P6 → Secondary feeder)
# ============================================

ProspectIntention = Literal["Yes", "No", "Considering"]


class PrimaryProspectBulkItem(BaseModel):
    """Single row from paste (used in bulk create)."""
    primary_student_id: Optional[str] = Field(None, max_length=50)
    student_name: str = Field(..., min_length=1, max_length=255)
    school: Optional[str] = Field(None, max_length=255)
    grade: Optional[str] = Field(None, max_length=20)
    tutor_name: Optional[str] = Field(None, max_length=255)
    phone_1: Optional[str] = Field(None, max_length=20)
    phone_1_relation: Optional[str] = Field(None, max_length=20)
    phone_2: Optional[str] = Field(None, max_length=20)
    phone_2_relation: Optional[str] = Field(None, max_length=20)
    wechat_id: Optional[str] = Field(None, max_length=100)
    tutor_remark: Optional[str] = None
    wants_summer: Optional[ProspectIntention] = 'Considering'
    wants_regular: Optional[ProspectIntention] = 'Considering'
    preferred_branches: Optional[List[str]] = None
    preferred_time_note: Optional[str] = None
    preferred_tutor_note: Optional[str] = None
    sibling_info: Optional[str] = None


class PrimaryProspectBulkCreate(BaseModel):
    """Bulk create prospects from paste form."""
    year: int
    source_branch: str = Field(..., max_length=20)
    prospects: List[PrimaryProspectBulkItem]


class PrimaryProspectUpdate(BaseModel):
    """For branch tutor edits (public)."""
    primary_student_id: Optional[str] = Field(None, max_length=50)
    student_name: Optional[str] = Field(None, min_length=1, max_length=255)
    school: Optional[str] = Field(None, max_length=255)
    grade: Optional[str] = Field(None, max_length=20)
    tutor_name: Optional[str] = Field(None, max_length=255)
    phone_1: Optional[str] = Field(None, max_length=20)
    phone_1_relation: Optional[str] = Field(None, max_length=20)
    phone_2: Optional[str] = Field(None, max_length=20)
    phone_2_relation: Optional[str] = Field(None, max_length=20)
    wechat_id: Optional[str] = Field(None, max_length=100)
    tutor_remark: Optional[str] = None
    wants_summer: Optional[ProspectIntention] = None
    wants_regular: Optional[ProspectIntention] = None
    preferred_branches: Optional[List[str]] = None
    preferred_time_note: Optional[str] = None
    preferred_tutor_note: Optional[str] = None
    sibling_info: Optional[str] = None


class PrimaryProspectAdminUpdate(BaseModel):
    """For admin updates (outreach, status, linking)."""
    outreach_status: Optional[str] = Field(None, max_length=30)
    contact_notes: Optional[str] = None
    status: Optional[str] = Field(None, max_length=20)
    summer_application_id: Optional[int] = None


class PrimaryProspectResponse(BaseModel):
    """Full prospect response."""
    id: int
    year: int
    source_branch: str
    primary_student_id: Optional[str] = None
    student_name: str
    school: Optional[str] = None
    grade: Optional[str] = None
    tutor_name: Optional[str] = None
    phone_1: Optional[str] = None
    phone_1_relation: Optional[str] = None
    phone_2: Optional[str] = None
    phone_2_relation: Optional[str] = None
    wechat_id: Optional[str] = None
    tutor_remark: Optional[str] = None
    wants_summer: Optional[str] = None
    wants_regular: Optional[str] = None
    preferred_branches: Optional[List[str]] = None
    preferred_time_note: Optional[str] = None
    preferred_tutor_note: Optional[str] = None
    sibling_info: Optional[str] = None
    outreach_status: str = 'Not Started'
    contact_notes: Optional[str] = None
    status: str = 'New'
    summer_application_id: Optional[int] = None
    submitted_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    edit_history: Optional[List[Dict[str, Any]]] = None
    # Joined from summer_application when matched
    matched_application_ref: Optional[str] = None
    matched_application_status: Optional[str] = None
# Student Progress Schemas
# ============================================

class AttendanceSummary(BaseModel):
    """Attendance breakdown for a student"""
    attended: int = 0
    no_show: int = 0
    rescheduled: int = 0
    total_past_sessions: int = 0
    attendance_rate: float = 0.0
    recent_rate: Optional[float] = None      # last 30 days
    previous_rate: Optional[float] = None    # 31-60 days ago


class RatingMonth(BaseModel):
    """Average rating for a single month"""
    month: str
    avg_rating: float
    count: int


class RatingSummary(BaseModel):
    """Rating trend and overall stats"""
    overall_avg: float = 0.0
    total_rated: int = 0
    monthly_trend: List[RatingMonth] = []
    recent_avg: Optional[float] = None       # last 30 days avg rating


class ExerciseDetail(BaseModel):
    """Single exercise entry for topic list"""
    session_date: date
    exercise_type: str
    pdf_name: Optional[str] = None
    url: Optional[str] = None
    url_title: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None


class ExerciseSummary(BaseModel):
    """Exercise count breakdown"""
    total: int = 0
    classwork: int = 0
    homework: int = 0
    details: List[ExerciseDetail] = []


class EnrollmentTimeline(BaseModel):
    """Single enrollment in timeline view"""
    id: int
    tutor_name: Optional[str] = None
    enrollment_type: Optional[str] = None
    payment_status: str
    first_lesson_date: Optional[date] = None
    location: Optional[str] = None
    assigned_day: Optional[str] = None
    assigned_time: Optional[str] = None
    lessons_paid: Optional[int] = None


class ContactSummary(BaseModel):
    """Parent contact summary stats"""
    total_contacts: int = 0
    last_contact_date: Optional[datetime] = None
    by_method: Dict[str, int] = {}
    by_type: Dict[str, int] = {}


class MonthlyActivity(BaseModel):
    """Activity data for a single month"""
    month: str
    sessions_attended: int = 0
    exercises_assigned: int = 0


class TestEvent(BaseModel):
    """Test or exam event relevant to the student"""
    title: str
    start_date: date
    end_date: Optional[date] = None
    event_type: Optional[str] = None
    description: Optional[str] = None


class TopicCount(BaseModel):
    """Topic frequency from exercise names"""
    topic: str
    count: int


class ConceptNode(BaseModel):
    """Concept extracted from exercise names by AI"""
    label: str
    count: int = 1
    category: Optional[str] = None


class ProgressInsights(BaseModel):
    """AI-generated + rule-based progress insights"""
    top_topics: List[TopicCount] = []
    total_exercises: int = 0
    cw_count: int = 0
    hw_count: int = 0
    narrative: str = ""
    concept_nodes: List[ConceptNode] = []
    ai_error: bool = False


class StudentProgressResponse(BaseModel):
    """Complete progress analytics for a student"""
    student_id: int
    attendance: AttendanceSummary
    ratings: RatingSummary
    exercises: ExerciseSummary
    enrollment_timeline: List[EnrollmentTimeline] = []
    contacts: ContactSummary
    monthly_activity: List[MonthlyActivity] = []
    test_events: List[TestEvent] = []
    insights: Optional[ProgressInsights] = None


# ---------------------------------------------------------------------------
# Report Shares
# ---------------------------------------------------------------------------

class RadarAxis(BaseModel):
    label: str = Field(max_length=50)
    score: int = Field(ge=1, le=5)


class RadarChartConfig(BaseModel):
    axes: List[RadarAxis] = []
    display_mode: Literal["numerical", "labeled"] = "numerical"


class StudentRadarConfigResponse(BaseModel):
    student_id: int
    config: RadarChartConfig
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CreateReportShareRequest(BaseModel):
    report_data: dict
    expires_in_days: int = 30
    student_id: Optional[int] = None


class ReportShareResponse(BaseModel):
    token: str
    expires_at: datetime


class SharedReportData(BaseModel):
    report_data: dict
    created_at: datetime
    expires_at: datetime


# ---------------------------------------------------------------------------
# Saved Reports
# ---------------------------------------------------------------------------

class CreateSavedReportRequest(BaseModel):
    report_data: dict
    label: Optional[str] = Field(None, max_length=200)


class SavedReportResponse(BaseModel):
    id: int
    student_id: int
    label: Optional[str] = None
    created_by: int
    creator_name: Optional[str] = None
    created_at: datetime
    mode: Optional[str] = None
    date_range_label: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PrimaryProspectBulkOutreach(BaseModel):
    """Bulk update outreach status for multiple prospects."""
    ids: List[int] = Field(..., max_length=500)
    outreach_status: str = Field(..., max_length=30)


class PrimaryProspectStats(BaseModel):
    """Funnel stats per branch."""
    branch: str
    total: int = 0
    wants_summer_yes: int = 0
    wants_summer_considering: int = 0
    wants_regular_yes: int = 0
    wants_regular_considering: int = 0
    matched_to_application: int = 0
    outreach_not_started: int = 0
    outreach_wechat_added: int = 0
    outreach_wechat_not_found: int = 0
    outreach_wechat_cannot_add: int = 0
    outreach_called: int = 0
    outreach_no_response: int = 0


class PrimaryProspectMatchResult(BaseModel):
    """Result of matching a prospect to summer applications."""
    prospect_id: int
    matches: List[Dict[str, Any]]  # [{application_id, reference_code, student_name, contact_phone, match_type}]
class SavedReportDetailResponse(BaseModel):
    id: int
    student_id: int
    report_data: dict
    label: Optional[str] = None
    created_by: int
    creator_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---- Buddy Tracker (Primary Branches) ----

class BuddyMemberCreate(BaseModel):
    student_id: str = Field(..., max_length=50)
    student_name_en: str = Field(..., max_length=255)
    student_name_zh: Optional[str] = Field(None, max_length=255)
    parent_phone: Optional[str] = Field(None, max_length=50)
    source_branch: str = Field(..., max_length=10)
    year: int
    buddy_code: Optional[str] = Field(None, max_length=20, description="Existing buddy code to join")
    is_sibling: bool = False


class BuddyMemberUpdate(BaseModel):
    student_id: Optional[str] = Field(None, max_length=50)
    student_name_en: Optional[str] = Field(None, max_length=255)
    student_name_zh: Optional[str] = Field(None, max_length=255)
    parent_phone: Optional[str] = Field(None, max_length=50)


class BuddyGroupMemberInfo(BaseModel):
    id: int
    name: str
    student_id: Optional[str] = None
    phone: Optional[str] = None
    branch: str
    source: str  # 'primary' or 'secondary'
    is_sibling: bool = False


class BuddyMemberResponse(BaseModel):
    id: int
    buddy_group_id: int
    student_id: str
    student_name_en: str
    student_name_zh: Optional[str] = None
    parent_phone: Optional[str] = None
    source_branch: str
    is_sibling: bool
    year: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    buddy_code: str
    group_size: int
    group_members: List[BuddyGroupMemberInfo] = []

    model_config = ConfigDict(from_attributes=True)


class BuddyGroupLookupResponse(BaseModel):
    buddy_code: str
    year: Optional[int] = None
    members: List[BuddyGroupMemberInfo] = []
    total_size: int


# ============================================
# Waitlist Schemas
# ============================================

WaitlistEntryType = Literal["New", "Slot Change"]


class WaitlistSlotPreferenceCreate(BaseModel):
    location: str = Field(..., max_length=100)
    day_of_week: Optional[str] = Field(None, max_length=10)
    time_slot: Optional[str] = Field(None, max_length=50)
    preferred_tutor_id: Optional[int] = None


class WaitlistSlotPreferenceResponse(BaseModel):
    id: int
    location: str
    day_of_week: Optional[str] = None
    time_slot: Optional[str] = None
    preferred_tutor_id: Optional[int] = None
    preferred_tutor_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WaitlistEntryCreate(BaseModel):
    student_name: str = Field("", max_length=255)
    school: str = Field("", max_length=255)
    grade: str = Field("", max_length=50)
    lang_stream: Optional[str] = Field(None, max_length=50)
    phone: str = Field("", max_length=50)
    parent_name: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = None
    entry_type: WaitlistEntryType = "New"
    student_id: Optional[int] = None
    slot_preferences: List[WaitlistSlotPreferenceCreate] = []


class WaitlistEntryBulkItem(BaseModel):
    student_name: str = Field(..., min_length=1, max_length=255)
    school: str = Field(..., min_length=1, max_length=255)
    grade: str = Field(..., min_length=1, max_length=50)
    phone: str = Field(..., min_length=1, max_length=50)
    lang_stream: Optional[str] = Field(None, max_length=50)
    parent_name: Optional[str] = Field(None, max_length=255)


class WaitlistEntryBulkCreate(BaseModel):
    entries: List[WaitlistEntryBulkItem] = Field(..., min_length=1, max_length=200)


class WaitlistEntryUpdate(BaseModel):
    student_name: Optional[str] = Field(None, max_length=255)
    school: Optional[str] = Field(None, max_length=255)
    grade: Optional[str] = Field(None, max_length=50)
    lang_stream: Optional[str] = None
    phone: Optional[str] = Field(None, max_length=50)
    parent_name: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    entry_type: Optional[WaitlistEntryType] = None
    student_id: Optional[int] = None
    slot_preferences: Optional[List[WaitlistSlotPreferenceCreate]] = None


class EnrollmentContextInfo(BaseModel):
    label: str
    enrollment_id: Optional[int] = None
    current_day: Optional[str] = None
    current_time: Optional[str] = None
    current_location: Optional[str] = None
    current_tutor: Optional[str] = None


class WaitlistEntryResponse(BaseModel):
    id: int
    student_name: str
    school: str
    grade: str
    lang_stream: Optional[str] = None
    phone: str
    parent_name: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    entry_type: WaitlistEntryType
    student_id: Optional[int] = None
    school_student_id: Optional[str] = None
    created_by: int
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    slot_preferences: List[WaitlistSlotPreferenceResponse] = []
    enrollment_context: Optional[EnrollmentContextInfo] = None

    model_config = ConfigDict(from_attributes=True)


# Enable forward references for nested models
SessionResponse.model_rebuild()
StudentDetailResponse.model_rebuild()
DetailedSessionResponse.model_rebuild()
ThreadResponse.model_rebuild()
MakeupProposalResponse.model_rebuild()
ExamRevisionSlotResponse.model_rebuild()
ExamRevisionSlotDetailResponse.model_rebuild()
EnrollStudentResponse.model_rebuild()
SummerApplicationResponse.model_rebuild()
