"use client";

import type { Student, StudentProgress } from "@/types";
import { ReportHeader } from "./report/ReportHeader";
import { ReportStudentInfo } from "./report/ReportStudentInfo";
import { ReportMetrics } from "./report/ReportMetrics";
import { ReportAttendanceChart } from "./report/ReportAttendanceChart";
import { ReportRatingChart } from "./report/ReportRatingChart";
import { ReportActivityChart } from "./report/ReportActivityChart";
import { ReportTopicsCovered } from "./report/ReportTopicsCovered";
import { ReportEnrollmentTable } from "./report/ReportEnrollmentTable";
import { ReportContactSummary } from "./report/ReportContactSummary";
import { ReportTutorComment } from "./report/ReportTutorComment";
import { ReportFooter } from "./report/ReportFooter";

export type ReportMode = "internal" | "parent";

interface ProgressReportProps {
  student: Student;
  progress: StudentProgress;
  mode: ReportMode;
  dateRangeLabel: string;
  tutorComment?: string;
  generatedBy?: string;
}

export function ProgressReport({
  student,
  progress,
  mode,
  dateRangeLabel,
  tutorComment,
  generatedBy,
}: ProgressReportProps) {
  return (
    <div className="report-container bg-white text-gray-900 max-w-[210mm] mx-auto px-[20mm] py-[15mm]">
      <ReportHeader dateRangeLabel={dateRangeLabel} />
      <ReportStudentInfo student={student} />
      <ReportMetrics progress={progress} mode={mode} />

      {/* Charts row */}
      {mode === "internal" ? (
        <div className="flex gap-6 mb-6">
          <div className="flex-1 min-w-0">
            <ReportAttendanceChart data={progress.attendance} />
          </div>
          <div className="flex-1 min-w-0">
            <ReportRatingChart data={progress.ratings} />
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <ReportRatingChart data={progress.ratings} />
        </div>
      )}

      {progress.exercises.details && progress.exercises.details.length > 0 && (
        <div className="mb-6">
          <ReportTopicsCovered data={progress.exercises.details} />
        </div>
      )}

      {/* Page break hint before activity chart */}
      <div className="report-page-break" />

      <div className="mb-6">
        <ReportActivityChart data={progress.monthly_activity} />
      </div>

      <div className="mb-6">
        <ReportEnrollmentTable data={progress.enrollment_timeline} mode={mode} />
      </div>

      {mode === "internal" && (
        <div className="mb-6">
          <ReportContactSummary data={progress.contacts} />
        </div>
      )}

      {tutorComment && (
        <div className="mb-6">
          <ReportTutorComment comment={tutorComment} />
        </div>
      )}

      <ReportFooter generatedBy={generatedBy} mode={mode} />
    </div>
  );
}
