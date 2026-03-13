import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from "recharts";
import { CHART_COLORS, DATA_KEY_LABELS, formatMonthLabel } from "@/lib/progress-constants";
import type { MonthlyActivity } from "@/types";

interface ReportActivityChartProps {
  data: MonthlyActivity[];
}

export function ReportActivityChart({ data }: ReportActivityChartProps) {
  if (data.length === 0 || data.every((d) => d.sessions_attended === 0 && d.exercises_assigned === 0)) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">
        No activity data
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatMonthLabel(d.month),
  }));

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Activity</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8b7355" }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#8b7355" }} tickLine={false} allowDecimals={false} />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => DATA_KEY_LABELS[value] ?? value}
          />
          <Bar dataKey="sessions_attended" fill={CHART_COLORS.sessions} radius={[2, 2, 0, 0]} />
          <Bar dataKey="exercises_assigned" fill={CHART_COLORS.exercises} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
