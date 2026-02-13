"""
Pydantic schemas for API request/response validation.
These define the structure of data sent to and from the API.
"""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List, Dict
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
    default_location: Optional[str] = Field(None, max_length=200)
    role: str = Field(..., max_length=50)
    basic_salary: Optional[Decimal] = Field(None, ge=0)
    is_active_tutor: bool = Field(True, description="Whether this user teaches students")
    profile_picture: Optional[str] = Field(None, max_length=500)


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

    model_config = ConfigDict(from_attributes=True)


class UncheckedAttendanceCount(BaseModel):
    """Count of unchecked attendance sessions"""
    total: int = Field(..., ge=0)
    critical: int = Field(..., ge=0, description="Sessions >7 days overdue")


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
    fee_message_sent: bool = False
    is_new_student: bool = False

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
    # Answer file fields
    answer_pdf_name: Optional[str] = Field(None, max_length=500)
    answer_page_start: Optional[int] = Field(None, gt=0)
    answer_page_end: Optional[int] = Field(None, gt=0)
    answer_remarks: Optional[str] = Field(None, max_length=1000)

    model_config = ConfigDict(from_attributes=True)


class ExerciseCreateRequest(BaseModel):
    """Request schema for creating/updating a session exercise"""
    exercise_type: str = Field(..., pattern="^(CW|HW|Classwork|Homework)$")
    pdf_name: str = Field(..., min_length=1, max_length=500)
    page_start: Optional[int] = Field(None, gt=0)
    page_end: Optional[int] = Field(None, gt=0)
    remarks: Optional[str] = Field(None, max_length=1000)
    # Answer file fields (for manual answer selection)
    answer_pdf_name: Optional[str] = Field(None, max_length=500)
    answer_page_start: Optional[int] = Field(None, gt=0)
    answer_page_end: Optional[int] = Field(None, gt=0)
    answer_remarks: Optional[str] = Field(None, max_length=1000)


class ExerciseSaveRequest(BaseModel):
    """Request schema for saving all exercises of a type for a session"""
    exercise_type: str = Field(..., pattern="^(CW|HW)$")
    exercises: List[ExerciseCreateRequest] = []
    append: bool = Field(False, description="If true, append exercises instead of replacing")


class BulkExerciseAssignRequest(BaseModel):
    """Request schema for assigning exercises to multiple sessions at once"""
    session_ids: List[int] = Field(..., min_length=1, description="List of session IDs to assign exercises to")
    exercise_type: str = Field(..., pattern="^(CW|HW)$", description="Exercise type (CW or HW)")
    pdf_name: str = Field(..., min_length=1, max_length=500, description="PDF filename/path")
    page_start: Optional[int] = Field(None, gt=0, description="Start page number")
    page_end: Optional[int] = Field(None, gt=0, description="End page number")
    remarks: Optional[str] = Field(None, max_length=1000, description="Exercise remarks")


class BulkExerciseAssignResponse(BaseModel):
    """Response schema for bulk exercise assignment"""
    created_count: int = Field(..., description="Number of exercises created")
    session_ids: List[int] = Field(..., description="IDs of sessions that received exercises")


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
    """Detail of who liked a message and when"""
    tutor_id: int
    tutor_name: str
    liked_at: datetime


class MessageBase(BaseModel):
    """Base message schema with common fields"""
    subject: Optional[str] = Field(None, max_length=200)
    message: str = Field(..., min_length=1)
    priority: str = Field("Normal", pattern="^(Normal|High|Urgent)$")
    category: Optional[str] = Field(None, pattern="^(Reminder|Question|Announcement|Schedule|Chat|Courseware|MakeupConfirmation|Feedback)$")


class MessageCreate(MessageBase):
    """Schema for creating a new message"""
    to_tutor_id: Optional[int] = Field(None, gt=0)  # NULL = broadcast (single recipient)
    to_tutor_ids: Optional[List[int]] = Field(None, min_length=2, max_length=50)  # Group message recipients
    reply_to_id: Optional[int] = Field(None, gt=0)
    image_attachments: Optional[List[str]] = Field(default_factory=list)  # List of uploaded image URLs
    file_attachments: Optional[List[dict]] = Field(default_factory=list)  # [{url, filename, content_type}]


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
    reply_count: int = Field(default=0, ge=0)
    image_attachments: List[str] = Field(default_factory=list)  # List of image URLs
    file_attachments: List[dict] = Field(default_factory=list)  # [{url, filename, content_type}]
    is_pinned: bool = False
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


# Enable forward references for nested models
SessionResponse.model_rebuild()
StudentDetailResponse.model_rebuild()
DetailedSessionResponse.model_rebuild()
ThreadResponse.model_rebuild()
MakeupProposalResponse.model_rebuild()
ExamRevisionSlotResponse.model_rebuild()
ExamRevisionSlotDetailResponse.model_rebuild()
EnrollStudentResponse.model_rebuild()
