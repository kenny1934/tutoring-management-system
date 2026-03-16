"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import useSWRImmutable from "swr/immutable";
import { reportSharesAPI } from "@/lib/api";
import { formatShortDate } from "@/lib/formatters";
import { ProgressReport, type ReportConfig } from "@/components/students/ProgressReport";
import type { Student, StudentProgress } from "@/types";

function SharedReportInner() {
  const params = useParams();
  const token = params.token as string;

  const { data, error, isLoading } = useSWRImmutable(
    token ? `share-${token}` : null,
    () => reportSharesAPI.get(token),
  );

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
  const config = report_data.config as ReportConfig;

  return (
    <div className="report-page min-h-screen bg-background print:bg-white print:min-h-0 print:overflow-visible">
      <style dangerouslySetInnerHTML={{ __html: "@page { size: A4; margin: 15mm 16mm 15mm 15mm; }" }} />
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
      <p className="text-xs text-gray-400 text-center pb-6 print:hidden">
        This report is valid until {formatShortDate(data.expires_at)}
      </p>
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
