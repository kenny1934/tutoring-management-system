"use client";

import type { Student, StudentProgress } from "@/types";
import { ReportHeader } from "./report/ReportHeader";
import { ReportStudentInfo } from "./report/ReportStudentInfo";
import { ReportInsights } from "./report/ReportInsights";
import { ReportConceptMap } from "./report/ReportConceptMap";
import { ReportMetrics } from "./report/ReportMetrics";
import { ReportAttendanceChart } from "./report/ReportAttendanceChart";
import { ReportRatingChart } from "./report/ReportRatingChart";
import { ReportTopicsCovered } from "./report/ReportTopicsCovered";
import { ReportTestTimeline } from "./report/ReportTestTimeline";
import { ReportActivityChart } from "./report/ReportActivityChart";
import { ReportEnrollmentTable } from "./report/ReportEnrollmentTable";
import { ReportContactSummary } from "./report/ReportContactSummary";
import { ReportTutorComment } from "./report/ReportTutorComment";
import { ReportFooter } from "./report/ReportFooter";

export type ReportMode = "internal" | "parent";

export interface ReportSectionToggles {
  showAttendance: boolean;
  showRating: boolean;
  showConceptMap: boolean;
  showTopics: boolean;
  showTests: boolean;
  showActivity: boolean;
  showEnrollment: boolean;
  showContacts: boolean;
}

interface ProgressReportProps {
  student: Student;
  progress: StudentProgress;
  mode: ReportMode;
  dateRangeLabel: string;
  tutorComment?: string;
  generatedBy?: string;
  sections?: Partial<ReportSectionToggles>;
}

export function ProgressReport({
  student,
  progress,
  mode,
  dateRangeLabel,
  tutorComment,
  generatedBy,
  sections,
}: ProgressReportProps) {
  const {
    showAttendance = true,
    showRating = true,
    showConceptMap = true,
    showTopics = true,
    showTests = true,
    showActivity = true,
    showEnrollment = true,
    showContacts = true,
  } = sections ?? {};
  return (
    <div className="report-container bg-white text-gray-900 max-w-[210mm] mx-auto px-4 py-6 md:px-[20mm] md:py-[15mm]">
      <ReportHeader dateRangeLabel={dateRangeLabel} />
      <ReportStudentInfo student={student} generatedBy={generatedBy} />

      {/* AI insights — headline section */}
      {progress.insights && (
        <div className="mb-6">
          <ReportInsights data={progress.insights} />
        </div>
      )}

      {/* Concept map — AI-extracted topics */}
      {showConceptMap && progress.insights?.concept_nodes && progress.insights.concept_nodes.length > 0 && (
        <div className="mb-6">
          <ReportConceptMap data={progress.insights.concept_nodes} />
        </div>
      )}

      <ReportMetrics progress={progress} mode={mode} showRating={showRating} />

      {/* Charts row */}
      {mode === "internal" ? (
        (showAttendance || showRating) && (
          <div className="flex flex-col md:flex-row gap-6 mb-6">
            {showAttendance && (
              <div className="flex-1 min-w-0">
                <ReportAttendanceChart data={progress.attendance} />
              </div>
            )}
            {showRating && (
              <div className="flex-1 min-w-0">
                <ReportRatingChart data={progress.ratings} />
              </div>
            )}
          </div>
        )
      ) : showRating ? (
        <div className="mb-6">
          <ReportRatingChart data={progress.ratings} />
        </div>
      ) : null}

      {showTopics && progress.exercises.details && progress.exercises.details.length > 0 && (
        <div className="mb-6">
          <ReportTopicsCovered data={progress.exercises.details} />
        </div>
      )}

      {showTests && progress.test_events && progress.test_events.length > 0 && (
        <div className="mb-6">
          <ReportTestTimeline data={progress.test_events} />
        </div>
      )}

      {showActivity && (
        <>
          <div className="report-page-break" />
          <div className="mb-6">
            <ReportActivityChart data={progress.monthly_activity} />
          </div>
        </>
      )}

      {showEnrollment && (
        <div className="mb-6">
          <ReportEnrollmentTable data={progress.enrollment_timeline} mode={mode} />
        </div>
      )}

      {mode === "internal" && showContacts && (
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
