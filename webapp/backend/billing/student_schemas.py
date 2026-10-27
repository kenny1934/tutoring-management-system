"""Contact-free student identity shared by billing evidence contracts."""
from pydantic import BaseModel


class BillingStudent(BaseModel):
    id: int
    student_name: str
    school_student_id: str | None = None
    home_location: str | None = None
    grade: str | None = None
    is_staff_referral: bool = False
    lang_stream: str | None = None
    school: str | None = None
