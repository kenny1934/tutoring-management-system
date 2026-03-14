import type { ProgressInsights } from "@/types";

interface ReportInsightsProps {
  data: ProgressInsights;
}

export function ReportInsights({ data }: ReportInsightsProps) {
  if (!data.ai_error && !data.narrative?.trim()) return null;

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Learning Summary</h3>
      {data.ai_error
        ? <p className="text-sm text-gray-400 italic">AI summary unavailable. Please try regenerating.</p>
        : data.narrative.split("\n\n").map((para, i) => (
            <p key={i} className="text-sm text-gray-700 leading-relaxed mb-2 last:mb-0">{para}</p>
          ))
      }
    </div>
  );
}
