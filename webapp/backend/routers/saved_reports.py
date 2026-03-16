"""
Internal saved report snapshots — tutors can save and retrieve past reports.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from auth.dependencies import get_current_user
from database import get_db
from models import Tutor, Student, SavedReport
from schemas import CreateSavedReportRequest, SavedReportResponse, SavedReportDetailResponse

router = APIRouter()


@router.post("/students/{student_id}/saved-reports", response_model=SavedReportResponse)
def create_saved_report(
    student_id: int,
    req: CreateSavedReportRequest,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    if not db.query(Student).filter(Student.id == student_id).first():
        raise HTTPException(status_code=404, detail="Student not found")

    # Auto-generate label from config metadata if not provided
    config = req.report_data.get("config", {})
    mode_label = "Parent" if config.get("mode") == "parent" else "Internal"
    date_range = config.get("dateRangeLabel", "All Time")
    label = req.label or f"{mode_label} Report — {date_range}"

    report = SavedReport(
        student_id=student_id,
        report_data=req.report_data,
        label=label,
        created_by=current_user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return SavedReportResponse(
        id=report.id,
        student_id=report.student_id,
        label=report.label,
        created_by=report.created_by,
        creator_name=current_user.tutor_name,
        created_at=report.created_at,
        mode=config.get("mode"),
        date_range_label=date_range,
    )


@router.get("/students/{student_id}/saved-reports", response_model=List[SavedReportResponse])
def list_saved_reports(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    if not db.query(Student).filter(Student.id == student_id).first():
        raise HTTPException(status_code=404, detail="Student not found")

    reports = db.query(SavedReport).options(
        joinedload(SavedReport.creator),
    ).filter(
        SavedReport.student_id == student_id,
    ).order_by(SavedReport.created_at.desc()).all()

    results = []
    for r in reports:
        config = (r.report_data or {}).get("config", {})
        results.append(SavedReportResponse(
            id=r.id,
            student_id=r.student_id,
            label=r.label,
            created_by=r.created_by,
            creator_name=r.creator.tutor_name if r.creator else None,
            created_at=r.created_at,
            mode=config.get("mode"),
            date_range_label=config.get("dateRangeLabel"),
        ))
    return results


@router.get("/saved-reports/{report_id}", response_model=SavedReportDetailResponse)
def get_saved_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    report = db.query(SavedReport).filter(SavedReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Saved report not found")

    return SavedReportDetailResponse(
        id=report.id,
        student_id=report.student_id,
        report_data=report.report_data,
        label=report.label,
        created_by=report.created_by,
        creator_name=report.creator.tutor_name if report.creator else None,
        created_at=report.created_at,
    )


@router.delete("/saved-reports/{report_id}", status_code=204)
def delete_saved_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    report = db.query(SavedReport).filter(SavedReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Saved report not found")
    if report.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the creator or admin can delete")

    db.delete(report)
    db.commit()
