import type { StudentProgress } from "@/types";
import { formatShortDate } from "@/lib/formatters";

interface ReportContactSummaryProps {
  data: StudentProgress["contacts"];
}

export function ReportContactSummary({ data }: ReportContactSummaryProps) {
  if (data.total_contacts === 0) {
    return null;
  }

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Parent Communication Summary</h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Total contacts:</span>{" "}
          <span className="font-semibold text-gray-900">{data.total_contacts}</span>
        </div>
        {data.last_contact_date && (
          <div>
            <span className="text-gray-500">Last contact:</span>{" "}
            <span className="font-semibold text-gray-900">{formatShortDate(data.last_contact_date)}</span>
          </div>
        )}
        {Object.keys(data.by_method).length > 0 && (
          <div>
            <span className="text-gray-500">By method:</span>{" "}
            <span className="text-gray-700">
              {Object.entries(data.by_method).map(([m, c]) => `${m} (${c})`).join(", ")}
            </span>
          </div>
        )}
        {Object.keys(data.by_type).length > 0 && (
          <div>
            <span className="text-gray-500">By type:</span>{" "}
            <span className="text-gray-700">
              {Object.entries(data.by_type).map(([t, c]) => `${t} (${c})`).join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
