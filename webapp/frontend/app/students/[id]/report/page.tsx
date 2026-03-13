"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";
import { useStudent } from "@/lib/hooks";
import { useAuth } from "@/contexts/AuthContext";
import { studentsAPI } from "@/lib/api";
import { ProgressReport, type ReportMode } from "@/components/students/ProgressReport";
import type { StudentProgress } from "@/types";
import useSWR from "swr";

function StudentReportPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const studentId = Number(params.id);
  const mode = (searchParams.get("mode") as ReportMode) || "internal";
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
  const commentKey = searchParams.get("commentKey");
  const aiNarrativeKey = searchParams.get("aiNarrativeKey");
  const language = searchParams.get("language") || "en";
  const autoPrint = searchParams.get("print") === "1";

  // Retrieve tutor comment from localStorage (shared across tabs, unlike sessionStorage)
  const [tutorComment, setTutorComment] = useState("");
  useEffect(() => {
    if (commentKey) {
      const stored = localStorage.getItem(`report-comment-${commentKey}`);
      if (stored) {
        setTutorComment(stored);
        localStorage.removeItem(`report-comment-${commentKey}`);
      }
    }
  }, [commentKey]);

  // Retrieve AI narrative from localStorage (previewed/edited in popover)
  const [aiNarrative, setAiNarrative] = useState("");
  useEffect(() => {
    if (aiNarrativeKey) {
      const stored = localStorage.getItem(`report-ai-narrative-${aiNarrativeKey}`);
      if (stored) {
        setAiNarrative(stored);
        localStorage.removeItem(`report-ai-narrative-${aiNarrativeKey}`);
      }
    }
  }, [aiNarrativeKey]);

  // Fetch student data
  const { data: student, isLoading: studentLoading } = useStudent(studentId);

  // Fetch progress data with date range + AI insights
  const { data: progress, isLoading: progressLoading } = useSWR<StudentProgress>(
    studentId ? ["student-progress-report", studentId, startDate, endDate, language] : null,
    () => studentsAPI.getProgress(studentId, startDate, endDate, true, language),
    { revalidateOnFocus: false }
  );

  // Auto-print after render
  const [printed, setPrinted] = useState(false);
  useEffect(() => {
    if (autoPrint && student && progress && !printed) {
      setPrinted(true);
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, student, progress, printed]);

  // Build date range label
  const dateRangeLabel = buildDateRangeLabel(startDate, endDate);

  const handlePrint = useCallback(() => window.print(), []);

  if (studentLoading || progressLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading report...</div>
      </div>
    );
  }

  if (!student || !progress) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Failed to load student data</div>
      </div>
    );
  }

  return (
    <div className="report-page min-h-screen bg-gray-100 print:bg-white print:min-h-0 print:overflow-visible">
      {/* Report-specific @page — overrides global fallback */}
      <style dangerouslySetInnerHTML={{ __html: "@page { size: A4; margin: 15mm; }" }} />
      {/* Toolbar — hidden in print */}
      <div className="report-toolbar sticky top-0 bg-white border-b shadow-sm px-4 py-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.close()}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Close
          </button>
          <span className="text-sm text-gray-400">|</span>
          <span className="text-sm text-gray-600">
            {student.student_name} — {mode === "parent" ? "Parent Report" : "Internal Report"}
          </span>
          {dateRangeLabel !== "All Time" && (
            <span className="text-xs text-gray-400">({dateRangeLabel})</span>
          )}
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-[#a0704b] text-white hover:bg-[#8b6140] transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          Print / Save PDF
        </button>
      </div>

      {/* Report content */}
      <div className="py-8 print:py-0">
        <ProgressReport
          student={student}
          progress={aiNarrative && progress ? {
            ...progress,
            insights: progress.insights
              ? { ...progress.insights, narrative: aiNarrative }
              : { top_topics: [], total_exercises: 0, cw_count: 0, hw_count: 0, narrative: aiNarrative },
          } : progress}
          mode={mode}
          dateRangeLabel={dateRangeLabel}
          tutorComment={tutorComment}
          generatedBy={user?.name}
        />
      </div>
    </div>
  );
}

export default function StudentReportPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading report...</div>
      </div>
    }>
      <StudentReportPageInner />
    </Suspense>
  );
}

function buildDateRangeLabel(startDate?: string, endDate?: string): string {
  if (!startDate && !endDate) return "All Time";

  const fmt = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  };

  if (startDate && endDate) return `${fmt(startDate)} — ${fmt(endDate)}`;
  if (startDate) return `From ${fmt(startDate)}`;
  return `Up to ${fmt(endDate!)}`;
}
