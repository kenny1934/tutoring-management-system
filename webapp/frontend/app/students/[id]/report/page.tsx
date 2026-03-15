"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Printer, ArrowLeft, Share2, Check, Copy } from "lucide-react";
import { useStudent } from "@/lib/hooks";
import { useAuth } from "@/contexts/AuthContext";
import { studentsAPI, reportSharesAPI } from "@/lib/api";
import { ProgressReport, type ReportMode, type ReportSectionToggles } from "@/components/students/ProgressReport";
import { DEFAULT_SECTIONS } from "@/components/students/StudentProgressTab";
import type { StudentProgress, RadarChartConfig } from "@/types";
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
  const insightsKey = searchParams.get("insightsKey");
  const radarKey = searchParams.get("radarKey");
  const language = searchParams.get("language") || "en";
  const sections = useMemo(() => Object.fromEntries(
    (Object.keys(DEFAULT_SECTIONS) as (keyof ReportSectionToggles)[]).map((key) => [
      key, searchParams.get(key) !== "0",
    ])
  ) as ReportSectionToggles, [searchParams]);
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

  // Retrieve insights (narrative + concept_nodes) from localStorage
  const [storedInsights, setStoredInsights] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (insightsKey) {
      const stored = localStorage.getItem(`report-insights-${insightsKey}`);
      if (stored) {
        try { setStoredInsights(JSON.parse(stored)); } catch { /* ignore */ }
        localStorage.removeItem(`report-insights-${insightsKey}`);
      }
    }
  }, [insightsKey]);

  // Retrieve radar chart config from localStorage
  const [radarData, setRadarData] = useState<RadarChartConfig | undefined>();
  const [radarReady, setRadarReady] = useState(!radarKey);
  useEffect(() => {
    if (radarKey) {
      const stored = localStorage.getItem(`report-radar-${radarKey}`);
      if (stored) {
        try { setRadarData(JSON.parse(stored)); } catch { /* ignore */ }
        localStorage.removeItem(`report-radar-${radarKey}`);
      }
      setRadarReady(true);
    }
  }, [radarKey]);

  // Fetch student data
  const { data: student, isLoading: studentLoading } = useStudent(studentId);

  // Fetch progress data (no AI — insights come from localStorage if user generated them)
  const { data: progress, isLoading: progressLoading } = useSWR<StudentProgress>(
    studentId ? ["student-progress-report", studentId, startDate, endDate] : null,
    () => studentsAPI.getProgress(studentId, { startDate, endDate }),
    { revalidateOnFocus: false }
  );

  // Auto-print after render — wait for localStorage data to load
  const localStorageReady = radarReady;
  const [printed, setPrinted] = useState(false);
  useEffect(() => {
    if (autoPrint && student && progress && localStorageReady && !printed) {
      setPrinted(true);
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, student, progress, localStorageReady, printed]);

  // Build date range label
  const dateRangeLabel = buildDateRangeLabel(startDate, endDate);

  // Merge stored AI insights into progress data (used for both rendering and sharing)
  const mergedProgress = useMemo(() => {
    if (!progress) return progress;
    if (!storedInsights) return progress;
    return {
      ...progress,
      insights: {
        total_exercises: progress.exercises?.total || 0,
        cw_count: progress.exercises?.classwork || 0,
        hw_count: progress.exercises?.homework || 0,
        ...progress.insights,
        ...storedInsights,
      } as StudentProgress["insights"],
    };
  }, [progress, storedInsights]);

  const handlePrint = useCallback(() => window.print(), []);

  // Share link state
  const [shareUrl, setShareUrl] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState("");

  const handleShare = useCallback(async () => {
    if (!student || !mergedProgress) return;
    setIsSharing(true);
    setShareError("");
    try {
      const result = await reportSharesAPI.create({
        report_data: {
          student: {
            student_name: student.student_name,
            grade: student.grade,
            school: student.school,
            lang_stream: student.lang_stream,
            academic_stream: student.academic_stream,
            school_student_id: student.school_student_id,
          },
          progress: mergedProgress,
          config: {
            mode: mode === "internal" ? "parent" : mode,
            sections,
            dateRangeLabel,
            tutorComment,
            generatedBy: user?.name,
            radarData,
          },
        },
        student_id: studentId,
      });
      const shareOrigin = process.env.NEXT_PUBLIC_SHARE_ORIGIN || window.location.origin;
      setShareToken(result.token);
      setShareUrl(`${shareOrigin}/share/${result.token}`);
    } catch (err) {
      console.error("Failed to create share link:", err);
      setShareError("Failed to create share link");
      setTimeout(() => setShareError(""), 3000);
    } finally {
      setIsSharing(false);
    }
  }, [student, mergedProgress, mode, sections, dateRangeLabel, tutorComment, user?.name]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied — ignore silently
    }
  }, [shareUrl]);

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
    <div className="report-page min-h-screen bg-background print:bg-white print:min-h-0 print:overflow-visible">
      {/* Report-specific @page — overrides global fallback */}
      <style dangerouslySetInnerHTML={{ __html: "@page { size: A4; margin: 15mm 16mm 15mm 15mm; }" }} />
      {/* Toolbar — hidden in print */}
      <div className="report-toolbar sticky top-0 bg-surface/80 backdrop-blur-md border-b border-border shadow-sm px-4 py-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              window.close();
              setTimeout(() => { window.location.href = `/students/${studentId}`; }, 100);
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Close
          </button>
          <span className="text-sm text-border">|</span>
          <span className="text-sm text-foreground">
            {student.student_name} — {mode === "parent" ? "Parent Report" : "Internal Report"}
          </span>
          {dateRangeLabel !== "All Time" && (
            <span className="text-xs text-muted-foreground">({dateRangeLabel})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {mode !== "internal" && (
            <>
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Share2 className="w-3.5 h-3.5" />
                {isSharing ? "Creating..." : "Share Link"}
              </button>
              {shareError && <span className="text-xs text-red-500">{shareError}</span>}
            </>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-[#a0704b] text-white hover:bg-[#8b6140] transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Share URL popup */}
      {shareUrl && (
        <div className="report-toolbar sticky top-[41px] z-10 bg-green-50 dark:bg-green-950/30 border-b border-green-200 dark:border-green-800 px-4 py-2 flex items-center gap-3">
          <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
          <span className="text-sm text-green-800 dark:text-green-300 flex-shrink-0">Share link created (expires in 30 days):</span>
          <code className="text-xs bg-white dark:bg-black/20 border border-green-200 dark:border-green-800 rounded px-2 py-1 truncate flex-1">{shareUrl}</code>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors flex-shrink-0"
          >
            {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
          <button
            onClick={async () => {
              if (!window.confirm("Revoke this share link? Parents will no longer be able to access it.")) return;
              try {
                if (shareToken) await reportSharesAPI.revoke(shareToken);
                setShareUrl("");
                setShareToken("");
              } catch {
                setShareError("Failed to revoke link");
                setTimeout(() => setShareError(""), 3000);
              }
            }}
            className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium flex-shrink-0"
          >
            Revoke
          </button>
          <button
            onClick={() => setShareUrl("")}
            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 text-lg leading-none flex-shrink-0"
          >
            &times;
          </button>
        </div>
      )}

      {/* Report content */}
      <div className="py-8 print:py-0">
        <ProgressReport
          student={student}
          progress={mergedProgress!}
          mode={mode}
          dateRangeLabel={dateRangeLabel}
          tutorComment={tutorComment}
          generatedBy={user?.name}
          sections={sections}
          radarData={radarData}
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
