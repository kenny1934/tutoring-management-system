"""Summer courseware index endpoints.

Summer materials are determined by (grade, lesson_number, lang_stream), so
lesson mode resolves default CW/HW from a scanned index of the net-drive
folder tree instead of tutors assigning files per student (the regular-class
flow). The scan happens client-side: an admin on a centre PC picks the year's
Finalised folder and the browser walks it via the File System Access API,
posting the raw listing here. Parsing/classification stays server-side
(services/summer_courseware_parser.py) so a parser fix applies on the next
rescan without any client change.

Rows are replaced wholesale per year on each rescan; defaults are resolved
live from the index at render time, so a rescan can never leave stale
defaults behind.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_admin_write
from database import get_db
from models import SummerCoursewareFile, SummerCoursewareScan, Tutor
from services.summer_courseware_parser import parse_listing

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_SCAN_FILES = 50_000

# Convention for the share's full path, used when materialising a
# SessionExercise (pdf_name) from an index entry. Editable per scan if the
# share layout ever changes — derived from year so next summer needs no setup.
DEFAULT_PATH_PREFIX = "[Courseware Developer 中學]\\Secondary\\Summer Course\\{year} Summer\\{root}"


class ScanFileEntry(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    mtime_ms: Optional[int] = None


class CoursewareScanRequest(BaseModel):
    year: int = Field(ge=2000, le=2100)
    root_name: Optional[str] = Field(default=None, max_length=255)
    files: list[ScanFileEntry] = Field(max_length=MAX_SCAN_FILES)


class CoursewareScanSummary(BaseModel):
    id: int
    year: int
    root_name: Optional[str]
    path_prefix: Optional[str]
    total_files: int
    classified_count: int
    unclassified_count: int
    excluded_count: int
    skipped_grade_count: int
    scanned_by: Optional[str]
    scanned_at: Optional[datetime]

    class Config:
        from_attributes = True


class CoursewareFileResponse(BaseModel):
    id: int
    grade: Optional[str]
    course_code: Optional[str]
    lesson_number: Optional[int]
    topic_zh: Optional[str]
    topic_en: Optional[str]
    doc_type: Optional[str]
    lang: Optional[str]
    is_parallel: bool
    is_answer: bool
    is_classified: bool
    unclassified_reason: Optional[str]
    rel_path: str
    file_name: str
    file_mtime: Optional[datetime]

    class Config:
        from_attributes = True


class CoursewareIndexResponse(BaseModel):
    year: int
    scan: Optional[CoursewareScanSummary]
    files: list[CoursewareFileResponse]
    unclassified: list[CoursewareFileResponse]


def _mtime_to_datetime(mtime_ms: Optional[int]) -> Optional[datetime]:
    if mtime_ms is None:
        return None
    try:
        # Stored naive UTC, matching the server-generated timestamps elsewhere.
        return datetime.fromtimestamp(mtime_ms / 1000, tz=timezone.utc).replace(tzinfo=None)
    except (ValueError, OverflowError, OSError):
        return None


@router.post("/summer/courseware/scan", response_model=CoursewareIndexResponse)
def scan_courseware(
    body: CoursewareScanRequest,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
) -> CoursewareIndexResponse:
    """Replace the year's courseware index with a freshly scanned listing."""
    if not body.files:
        raise HTTPException(status_code=400, detail="Scan contained no files.")

    result = parse_listing([(f.path, f.mtime_ms) for f in body.files])
    if not result.classified:
        # An empty index would silently disable defaults everywhere; far more
        # likely the admin picked the wrong folder. Keep the previous index.
        raise HTTPException(
            status_code=400,
            detail=(
                "No files matched the courseware naming convention — the index "
                "was not replaced. Pick the year's Finalised folder and retry."
            ),
        )

    path_prefix = DEFAULT_PATH_PREFIX.format(
        year=body.year, root=body.root_name or "Finalised"
    )

    db.query(SummerCoursewareFile).filter(
        SummerCoursewareFile.year == body.year
    ).delete(synchronize_session=False)

    # Bulk insert: per-row db.add() would cost one round trip per row to
    # Cloud MySQL (~450/scan); the generated PKs aren't needed here.
    db.bulk_insert_mappings(SummerCoursewareFile, [
        dict(
            year=body.year,
            grade=f.grade,
            course_code=f.course_code,
            lesson_number=f.lesson_number,
            topic_zh=f.topic_zh,
            topic_en=f.topic_en,
            doc_type=f.doc_type,
            lang=f.lang,
            is_parallel=f.is_parallel,
            is_answer=f.is_answer,
            is_classified=True,
            rel_path=f.rel_path,
            file_name=f.file_name,
            file_mtime=_mtime_to_datetime(f.mtime_ms),
        )
        for f in result.classified
    ] + [
        dict(
            year=body.year,
            is_classified=False,
            is_parallel=False,
            is_answer=False,
            unclassified_reason=u.reason,
            rel_path=u.rel_path,
            file_name=u.file_name,
            file_mtime=_mtime_to_datetime(u.mtime_ms),
        )
        for u in result.unclassified
    ])

    scan = SummerCoursewareScan(
        year=body.year,
        root_name=body.root_name,
        path_prefix=path_prefix,
        total_files=result.total_files,
        classified_count=len(result.classified),
        unclassified_count=len(result.unclassified),
        excluded_count=result.excluded_count,
        skipped_grade_count=result.skipped_grade_count,
        # Display name, not email — shown verbatim in the admin panel.
        scanned_by=admin.tutor_name,
    )
    db.add(scan)
    db.commit()

    logger.info(
        "Summer courseware scan %d: classified=%d unclassified=%d excluded=%d skipped=%d by=%s",
        body.year, len(result.classified), len(result.unclassified),
        result.excluded_count, result.skipped_grade_count, admin.user_email,
    )
    return get_courseware_index(year=body.year, _user=admin, db=db)


@router.get("/summer/courseware/index", response_model=CoursewareIndexResponse)
def get_courseware_index(
    year: int,
    grade: Optional[str] = None,
    _user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CoursewareIndexResponse:
    """The year's courseware index: classified files plus unclassified leftovers.

    Small enough (~450 rows/year) to return whole; lesson mode filters by
    grade via the query param, the admin panel takes everything.
    """
    scan = (
        db.query(SummerCoursewareScan)
        .filter(SummerCoursewareScan.year == year)
        .order_by(SummerCoursewareScan.scanned_at.desc(), SummerCoursewareScan.id.desc())
        .first()
    )

    query = db.query(SummerCoursewareFile).filter(SummerCoursewareFile.year == year)
    if grade:
        # Unclassified rows have no grade; they only show in the no-filter
        # (admin) view, so a grade filter naturally excludes them.
        query = query.filter(SummerCoursewareFile.grade == grade)
    rows = query.order_by(
        SummerCoursewareFile.grade,
        SummerCoursewareFile.course_code,
        SummerCoursewareFile.rel_path,
    ).all()

    return CoursewareIndexResponse(
        year=year,
        scan=scan,
        files=[r for r in rows if r.is_classified],
        unclassified=[r for r in rows if not r.is_classified],
    )
