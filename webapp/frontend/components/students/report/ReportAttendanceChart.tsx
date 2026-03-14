import { PieChart, Pie, Cell } from "recharts";
import { ATTENDANCE_COLORS } from "@/lib/progress-constants";
import type { StudentProgress } from "@/types";

interface ReportAttendanceChartProps {
  data: StudentProgress["attendance"];
}

export function ReportAttendanceChart({ data }: ReportAttendanceChartProps) {
  const chartData = [
    { name: "Attended", value: data.attended, fill: ATTENDANCE_COLORS.attended },
    { name: "No Show", value: data.no_show, fill: ATTENDANCE_COLORS.no_show },
    { name: "Rescheduled", value: data.rescheduled, fill: ATTENDANCE_COLORS.rescheduled },
  ].filter((d) => d.value > 0);

  if (data.total_past_sessions === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">
        No sessions recorded
      </div>
    );
  }

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Attendance Breakdown</h3>
      <div className="flex flex-col items-center gap-3 md:flex-row md:items-center md:gap-6">
        <div className="relative">
          <PieChart width={150} height={150}>
            <Pie
              data={chartData}
              cx={75}
              cy={75}
              innerRadius={42}
              outerRadius={63}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-xl font-bold text-gray-900">{data.attendance_rate}%</div>
              <div className="text-[10px] text-gray-500">attendance</div>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          {chartData.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
              <span className="text-gray-700">{entry.name}</span>
              <span className="font-semibold text-gray-900">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
