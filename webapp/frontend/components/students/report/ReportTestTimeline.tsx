import type { TestEvent } from "@/types";

interface ReportTestTimelineProps {
  data: TestEvent[];
}

const TYPE_STYLES: Record<string, string> = {
  Exam: "bg-red-50 border-red-200 text-red-700",
  "Final Exam": "bg-red-50 border-red-200 text-red-700",
  Test: "bg-amber-50 border-amber-200 text-amber-700",
  Quiz: "bg-blue-50 border-blue-200 text-blue-700",
};

function getTypeStyle(eventType?: string): string {
  if (!eventType) return "bg-gray-50 border-gray-200 text-gray-600";
  return TYPE_STYLES[eventType] || "bg-gray-50 border-gray-200 text-gray-600";
}

export function ReportTestTimeline({ data }: ReportTestTimelineProps) {
  if (data.length === 0) return null;

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Tests &amp; Exams</h3>
      <div className="space-y-1.5">
        {data.map((event, i) => {
          const dateStr = new Date(event.start_date + "T00:00:00").toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          });

          return (
            <div key={i} className="flex items-start gap-3 text-xs">
              <div className="w-[52px] shrink-0 text-gray-500 pt-0.5">{dateStr}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {event.event_type && (
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${getTypeStyle(event.event_type)}`}>
                      {event.event_type}
                    </span>
                  )}
                  <span className="text-gray-700">{event.title}</span>
                </div>
                {event.description && (
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{event.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
