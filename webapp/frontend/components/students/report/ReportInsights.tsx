import type { ProgressInsights } from "@/types";

interface ReportInsightsProps {
  data: ProgressInsights;
}

export function ReportInsights({ data }: ReportInsightsProps) {
  if (!data.narrative?.trim()) return null;

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Learning Summary</h3>
      <p className="text-sm text-gray-700 leading-relaxed">{data.narrative}</p>
    </div>
  );
}
