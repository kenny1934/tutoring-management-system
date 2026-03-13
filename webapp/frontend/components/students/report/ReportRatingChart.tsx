import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { CHART_COLORS, formatMonthLabel } from "@/lib/progress-constants";
import type { StudentProgress } from "@/types";

interface ReportRatingChartProps {
  data: StudentProgress["ratings"];
}

export function ReportRatingChart({ data }: ReportRatingChartProps) {
  if (data.monthly_trend.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">
        No rated sessions
      </div>
    );
  }

  const chartData = data.monthly_trend.map((d) => ({
    ...d,
    label: formatMonthLabel(d.month),
  }));

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Rating Trend</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8b7355" }} tickLine={false} />
          <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 10, fill: "#8b7355" }} tickLine={false} />
          <Line
            type="monotone"
            dataKey="avg_rating"
            stroke={CHART_COLORS.rating}
            strokeWidth={2}
            dot={{ fill: CHART_COLORS.rating, r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
