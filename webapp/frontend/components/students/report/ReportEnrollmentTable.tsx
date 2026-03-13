import type { StudentProgress } from "@/types";

type ReportMode = "internal" | "parent";

interface ReportEnrollmentTableProps {
  data: StudentProgress["enrollment_timeline"];
  mode: ReportMode;
}

export function ReportEnrollmentTable({ data, mode }: ReportEnrollmentTableProps) {
  if (data.length === 0) {
    return null;
  }

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Enrollment History</h3>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-[#e8d4b8]">
            <th className="text-left py-1.5 font-semibold text-gray-600">Tutor</th>
            {mode === "internal" && (
              <th className="text-left py-1.5 font-semibold text-gray-600">Type</th>
            )}
            {mode === "internal" && (
              <th className="text-left py-1.5 font-semibold text-gray-600">Status</th>
            )}
            <th className="text-left py-1.5 font-semibold text-gray-600">Start Date</th>
            <th className="text-left py-1.5 font-semibold text-gray-600">Schedule</th>
            <th className="text-left py-1.5 font-semibold text-gray-600">Location</th>
            <th className="text-right py-1.5 font-semibold text-gray-600">Lessons</th>
          </tr>
        </thead>
        <tbody>
          {data.map((e) => (
            <tr key={e.id} className="border-b border-[#e8d4b8]/50">
              <td className="py-1.5 text-gray-900">{e.tutor_name || "-"}</td>
              {mode === "internal" && (
                <td className="py-1.5 text-gray-700">{e.enrollment_type || "-"}</td>
              )}
              {mode === "internal" && (
                <td className="py-1.5 text-gray-700">{e.payment_status}</td>
              )}
              <td className="py-1.5 text-gray-700">{e.first_lesson_date || "-"}</td>
              <td className="py-1.5 text-gray-700">
                {e.assigned_day ? `${e.assigned_day}${e.assigned_time ? ` ${e.assigned_time}` : ""}` : "-"}
              </td>
              <td className="py-1.5 text-gray-700">{e.location || "-"}</td>
              <td className="py-1.5 text-right text-gray-900 font-medium">{e.lessons_paid ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
