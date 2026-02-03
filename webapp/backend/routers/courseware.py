"""
Courseware API endpoints.
Provides courseware popularity rankings and usage details.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from database import get_db

router = APIRouter()


@router.get("/courseware/popularity")
async def get_courseware_popularity(
    time_range: str = Query("recent", description="Time range: 'recent' (14 days) or 'all-time'"),
    exercise_type: Optional[str] = Query(None, description="Filter by exercise type: 'Classwork' or 'Homework'"),
    grade: Optional[str] = Query(None, description="Filter by grade (e.g., 'F1', 'F2')"),
    school: Optional[str] = Query(None, description="Filter by school"),
    limit: int = Query(50, ge=1, le=500, description="Maximum items to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """
    Get courseware popularity rankings.

    Returns list of courseware files ranked by assignment count.
    """
    # Select view based on time range
    view_name = "courseware_popularity_recent" if time_range == "recent" else "courseware_popularity_summary"

    # Build query - note: can't filter by exercise_type, grade, or school on aggregated views directly
    # For filtering, we need to use courseware_usage_detail with custom aggregation
    if exercise_type or grade or school:
        # Use detail view with custom aggregation
        where_clauses = ["1=1"]
        params = {}

        if exercise_type:
            where_clauses.append("exercise_type = :exercise_type")
            params["exercise_type"] = exercise_type

        if grade:
            where_clauses.append("grade LIKE :grade")
            params["grade"] = f"{grade}%"

        if school:
            where_clauses.append("school = :school")
            params["school"] = school

        if time_range == "recent":
            where_clauses.append("session_date >= CURDATE() - INTERVAL 14 DAY")

        where_sql = " AND ".join(where_clauses)

        query = text(f"""
            SELECT
                filename,
                GROUP_CONCAT(DISTINCT normalized_path SEPARATOR ', ') AS normalized_paths,
                GROUP_CONCAT(DISTINCT CONCAT(school, ' ', grade, lang_stream) ORDER BY school, grade, lang_stream SEPARATOR ', ') AS used_by,
                COUNT(*) AS assignment_count,
                COUNT(DISTINCT student_id) AS unique_student_count,
                MIN(session_date) AS earliest_use,
                MAX(session_date) AS latest_use
            FROM courseware_usage_detail
            WHERE {where_sql}
            GROUP BY filename
            ORDER BY assignment_count DESC
            LIMIT :limit OFFSET :offset
        """)
        params["limit"] = limit
        params["offset"] = offset
    else:
        # Use pre-aggregated view for better performance
        query = text(f"""
            SELECT
                filename,
                normalized_paths,
                used_by,
                assignment_count,
                unique_student_count,
                earliest_use,
                latest_use
            FROM {view_name}
            ORDER BY assignment_count DESC
            LIMIT :limit OFFSET :offset
        """)
        params = {"limit": limit, "offset": offset}

    results = db.execute(query, params).fetchall()

    return [
        {
            "filename": row.filename,
            "normalized_paths": row.normalized_paths or "",
            "used_by": row.used_by or "",
            "assignment_count": row.assignment_count or 0,
            "unique_student_count": row.unique_student_count or 0,
            "earliest_use": row.earliest_use.isoformat() if row.earliest_use else None,
            "latest_use": row.latest_use.isoformat() if row.latest_use else None,
        }
        for row in results
    ]


@router.get("/courseware/usage-detail")
async def get_courseware_usage_detail(
    filename: str = Query(..., description="Filename to get details for"),
    time_range: str = Query("recent", description="Time range: 'recent' (14 days) or 'all-time'"),
    exercise_type: Optional[str] = Query(None, description="Filter by exercise type: 'CW' or 'HW'"),
    grade: Optional[str] = Query(None, description="Filter by grade (e.g., 'F1', 'F2')"),
    school: Optional[str] = Query(None, description="Filter by school"),
    limit: int = Query(10, ge=1, le=100, description="Number of results to return"),
    offset: int = Query(0, ge=0, le=10000, description="Offset for pagination"),
    db: Session = Depends(get_db)
):
    """
    Get detailed usage information for a specific courseware file.

    Returns all assignments of this courseware showing students, tutors, dates.
    Optional filters for exercise_type, grade, and school to match trending context.
    """
    where_clauses = ["cud.filename = :filename"]
    params = {"filename": filename, "limit": limit, "offset": offset}

    if time_range == "recent":
        where_clauses.append("cud.session_date >= CURDATE() - INTERVAL 14 DAY")

    if exercise_type:
        where_clauses.append("cud.exercise_type = :exercise_type")
        params["exercise_type"] = exercise_type

    if grade:
        where_clauses.append("cud.grade LIKE :grade")
        params["grade"] = f"{grade}%"

    if school:
        where_clauses.append("cud.school = :school")
        params["school"] = school

    where_sql = " AND ".join(where_clauses)

    query = text(f"""
        SELECT
            cud.exercise_id,
            se.session_id,
            cud.filename,
            cud.normalized_path,
            cud.original_pdf_name,
            cud.exercise_type,
            cud.page_start,
            cud.page_end,
            cud.session_date,
            cud.location,
            cud.student_id,
            s.school_student_id,
            cud.student_name,
            cud.grade,
            cud.lang_stream,
            cud.school,
            cud.tutor_id,
            cud.tutor_name
        FROM courseware_usage_detail cud
        JOIN session_exercises se ON cud.exercise_id = se.id
        JOIN students s ON cud.student_id = s.id
        WHERE {where_sql}
        ORDER BY cud.session_date DESC, cud.student_name
        LIMIT :limit OFFSET :offset
    """)

    results = db.execute(query, params).fetchall()

    return [
        {
            "exercise_id": row.exercise_id,
            "session_id": row.session_id,
            "filename": row.filename,
            "normalized_path": row.normalized_path,
            "original_pdf_name": row.original_pdf_name,
            "exercise_type": row.exercise_type,
            "page_start": row.page_start,
            "page_end": row.page_end,
            "session_date": row.session_date.isoformat() if row.session_date else None,
            "location": row.location,
            "student_id": row.student_id,
            "school_student_id": row.school_student_id,
            "student_name": row.student_name,
            "grade": row.grade,
            "lang_stream": row.lang_stream,
            "school": row.school,
            "tutor_id": row.tutor_id,
            "tutor_name": row.tutor_name,
        }
        for row in results
    ]
