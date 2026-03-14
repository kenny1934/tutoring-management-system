import { getDisplayName } from "@/lib/exercise-utils";
import type { ExerciseDetail } from "@/types";

interface ReportTopicsCoveredProps {
  data: ExerciseDetail[];
}

function formatPageRange(start?: number, end?: number): string {
  if (start == null && end == null) return "";
  if (end == null || start === end) return `p.${start}`;
  if (start == null) return `p.${end}`;
  return `p.${start}–${end}`;
}

export function ReportTopicsCovered({ data }: ReportTopicsCoveredProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[80px] text-sm text-gray-400">
        No exercises recorded
      </div>
    );
  }

  // Group by session date
  const grouped = new Map<string, ExerciseDetail[]>();
  for (const ex of data) {
    const key = ex.session_date;
    const list = grouped.get(key);
    if (list) list.push(ex);
    else grouped.set(key, [ex]);
  }

  const sortedDates = Array.from(grouped.keys()).sort().reverse();

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Topics Covered</h3>
      <div className="space-y-2">
        {sortedDates.map((dateStr) => {
          const exercises = grouped.get(dateStr)!;
          const formatted = new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });

          return (
            <div key={dateStr} className="flex gap-3 text-xs">
              <div className="w-[72px] shrink-0 text-gray-500 pt-0.5">{formatted}</div>
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {exercises.map((ex, i) => {
                  const name = getDisplayName(ex.pdf_name);
                  const pages = formatPageRange(ex.page_start, ex.page_end);
                  const isCW = ex.exercise_type === "CW" || ex.exercise_type === "Classwork";

                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border max-w-full ${
                        isCW
                          ? "bg-amber-50 border-amber-200 text-amber-800"
                          : "bg-blue-50 border-blue-200 text-blue-800"
                      }`}
                    >
                      <span className="font-medium truncate">{name || "Untitled"}</span>
                      {pages && <span className="text-[10px] opacity-70">{pages}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
