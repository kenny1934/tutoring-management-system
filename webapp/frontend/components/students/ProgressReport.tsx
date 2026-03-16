"use client";

import { Fragment, type ReactNode } from "react";
import type { Student, StudentProgress, RadarChartConfig } from "@/types";
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
import { ReportRadarChart } from "./report/ReportRadarChart";

export type ReportMode = "internal" | "parent";

export type SectionKey = keyof ReportSectionToggles;

export interface ReportSectionToggles {
  showAttendance: boolean;
  showRating: boolean;
  showConceptMap: boolean;
  showTopics: boolean;
  showTests: boolean;
  showActivity: boolean;
  showEnrollment: boolean;
  showContacts: boolean;
  showRadarChart: boolean;
}

export interface ReportConfig {
  mode: ReportMode;
  sections: Partial<ReportSectionToggles>;
  sectionOrder?: SectionKey[];
  dateRangeLabel: string;
  tutorComment?: string;
  generatedBy?: string;
  radarData?: RadarChartConfig;
}

const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "showAttendance", "showRating", "showConceptMap", "showTopics",
  "showTests", "showActivity", "showEnrollment", "showContacts", "showRadarChart",
];

interface ProgressReportProps {
  student: Student;
  progress: StudentProgress;
  mode: ReportMode;
  dateRangeLabel: string;
  tutorComment?: string;
  generatedBy?: string;
  generatedAt?: string;
  sections?: Partial<ReportSectionToggles>;
  sectionOrder?: SectionKey[];
  radarData?: RadarChartConfig;
}

export function ProgressReport({
  student,
  progress,
  mode,
  dateRangeLabel,
  tutorComment,
  generatedBy,
  generatedAt,
  sections,
  sectionOrder,
  radarData,
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
    showRadarChart = false,
  } = sections ?? {};

  const sectionRenderers: Record<SectionKey, () => ReactNode> = {
    showRadarChart: () =>
      showRadarChart && radarData && radarData.axes.length >= 4
        ? <div className="mb-6"><ReportRadarChart data={radarData} /></div>
        : null,
    showAttendance: () =>
      mode === "internal" && showAttendance
        ? <div className="mb-6"><ReportAttendanceChart data={progress.attendance} /></div>
        : null,
    showRating: () =>
      showRating
        ? <div className="mb-6"><ReportRatingChart data={progress.ratings} /></div>
        : null,
    showTopics: () =>
      showTopics && progress.exercises.details?.length
        ? <div className="mb-6"><ReportTopicsCovered data={progress.exercises.details} /></div>
        : null,
    showTests: () =>
      showTests && progress.test_events?.length
        ? <div className="mb-6"><ReportTestTimeline data={progress.test_events} /></div>
        : null,
    showActivity: () =>
      showActivity
        ? <div className="mb-6"><ReportActivityChart data={progress.monthly_activity} /></div>
        : null,
    showEnrollment: () =>
      showEnrollment
        ? <div className="mb-6"><ReportEnrollmentTable data={progress.enrollment_timeline} mode={mode} /></div>
        : null,
    showContacts: () =>
      mode === "internal" && showContacts
        ? <div className="mb-6"><ReportContactSummary data={progress.contacts} /></div>
        : null,
    showConceptMap: () => {
      if (!showConceptMap) return null;
      if (progress.insights?.concept_nodes?.length) {
        return <div className="mb-6"><ReportConceptMap data={progress.insights.concept_nodes} /></div>;
      }
      if (progress.insights?.ai_error) {
        return (
          <div className="mb-6 report-section">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Concept Map</h3>
            <p className="text-sm text-gray-400 italic">Concept map unavailable. Please try regenerating.</p>
          </div>
        );
      }
      return null;
    },
  };

  const order = sectionOrder ?? DEFAULT_SECTION_ORDER;

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

      <ReportMetrics progress={progress} mode={mode} showRating={showRating} />

      {/* Sections in custom order */}
      {order.map((key) => (
        <Fragment key={key}>{sectionRenderers[key]?.()}</Fragment>
      ))}

      {tutorComment && (
        <div className="mb-6">
          <ReportTutorComment comment={tutorComment} />
        </div>
      )}

      <ReportFooter generatedBy={generatedBy} generatedAt={generatedAt} mode={mode} />
    </div>
  );
}
