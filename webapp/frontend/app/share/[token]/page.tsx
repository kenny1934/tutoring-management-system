"use client";

import { Suspense, useCallback } from "react";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import useSWR from "swr";
import { reportSharesAPI } from "@/lib/api";
import { ProgressReport, type ReportMode, type ReportSectionToggles } from "@/components/students/ProgressReport";
import type { Student, StudentProgress } from "@/types";

function SharedReportInner() {
  const params = useParams();
  const token = params.token as string;

  const { data, error, isLoading } = useSWR(
    token ? `share-${token}` : null,
    () => reportSharesAPI.get(token),
    { revalidateOnFocus: false },
  );

  const handlePrint = useCallback(() => window.print(), []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-gray-500">Loading report...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3">
        <div className="text-lg font-medium text-foreground">Report Unavailable</div>
        <div className="text-sm text-muted-foreground">
          This report link has expired or is no longer available.
        </div>
      </div>
    );
  }

  const { report_data } = data;
  const student = report_data.student as Student;
  const progress = report_data.progress as StudentProgress;
  const config = report_data.config as {
    mode: ReportMode;
    sections: Partial<ReportSectionToggles>;
    dateRangeLabel: string;
    tutorComment?: string;
    generatedBy?: string;
  };

  return (
    <div className="report-page min-h-screen bg-background print:bg-white print:min-h-0 print:overflow-visible">
      <style dangerouslySetInnerHTML={{ __html: "@page { size: A4; margin: 15mm 16mm 15mm 15mm; }" }} />
      {/* Toolbar — hidden in print */}
      <div className="report-toolbar sticky top-0 bg-surface/80 backdrop-blur-md border-b border-border shadow-sm px-4 py-2 flex items-center justify-between z-10">
        <span className="text-sm text-foreground">
          {student.student_name} — Progress Report
        </span>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-[#a0704b] text-white hover:bg-[#8b6140] transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          Print
        </button>
      </div>

      {/* Report content */}
      <div className="py-8 print:py-0">
        <ProgressReport
          student={student}
          progress={progress}
          mode={config.mode}
          dateRangeLabel={config.dateRangeLabel}
          tutorComment={config.tutorComment}
          generatedBy={config.generatedBy}
          sections={config.sections}
        />
      </div>
    </div>
  );
}

export default function SharedReportPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading report...</div>
      </div>
    }>
      <SharedReportInner />
    </Suspense>
  );
}
