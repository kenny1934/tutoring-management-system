"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";
import useSWRImmutable from "swr/immutable";
import { savedReportsAPI } from "@/lib/api";
import { formatShortDate } from "@/lib/formatters";
import { ProgressReport, type ReportConfig } from "@/components/students/ProgressReport";
import type { Student, StudentProgress } from "@/types";

function SavedReportInner() {
  const params = useParams();
  const reportId = Number(params.reportId);

  const { data, error, isLoading } = useSWRImmutable(
    reportId ? `saved-report-${reportId}` : null,
    () => savedReportsAPI.get(reportId),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-gray-500">Loading saved report...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3">
        <div className="text-lg font-medium text-foreground">Report Not Found</div>
        <div className="text-sm text-muted-foreground">
          This saved report could not be loaded.
        </div>
      </div>
    );
  }

  const { report_data } = data;
  const student = report_data.student as Student;
  const progress = report_data.progress as StudentProgress;
  const config = report_data.config as ReportConfig;

  return (
    <div className="report-page min-h-screen bg-background print:bg-white print:min-h-0 print:overflow-visible">
      <style dangerouslySetInnerHTML={{ __html: "@page { size: A4; margin: 15mm 16mm 15mm 15mm; }" }} />
      {/* Toolbar */}
      <div className="report-toolbar sticky top-0 bg-surface/80 backdrop-blur-md border-b border-border shadow-sm px-4 py-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              window.close();
              setTimeout(() => { window.location.href = `/students/${data.student_id}`; }, 100);
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Close
          </button>
          <span className="text-sm text-border">|</span>
          <span className="text-sm text-foreground">{data.label || "Saved Report"}</span>
          <span className="text-xs text-muted-foreground">
            Saved {formatShortDate(data.created_at)}
            {data.creator_name && ` by ${data.creator_name}`}
          </span>
        </div>
        <button
          onClick={() => window.print()}
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
          progress={progress}
          mode={config.mode}
          dateRangeLabel={config.dateRangeLabel}
          tutorComment={config.tutorComment}
          generatedBy={config.generatedBy}
          generatedAt={data.created_at}
          sections={config.sections}
          radarData={config.radarData}
        />
      </div>
    </div>
  );
}

export default function SavedReportPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading saved report...</div>
      </div>
    }>
      <SavedReportInner />
    </Suspense>
  );
}
