import type { ProgressInsights } from "@/types";

interface ReportInsightsProps {
  data: ProgressInsights;
}

export function ReportInsights({ data }: ReportInsightsProps) {
  const hasTopics = data.top_topics.length > 0;
  const hasNarrative = data.narrative.trim().length > 0;

  if (!hasTopics && !hasNarrative) return null;

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Learning Summary</h3>

      {hasNarrative && (
        <p className="text-sm text-gray-700 leading-relaxed mb-3">{data.narrative}</p>
      )}

      {hasTopics && (
        <div>
          <div className="text-xs text-gray-500 mb-1.5">Top Topics</div>
          <div className="flex flex-wrap gap-1.5">
            {data.top_topics.map((t) => (
              <span
                key={t.topic}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-800 text-xs"
              >
                <span className="font-medium">{t.topic}</span>
                <span className="text-[10px] opacity-70">{t.count}x</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
