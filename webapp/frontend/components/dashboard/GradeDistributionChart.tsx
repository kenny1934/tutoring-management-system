"use client";

import { useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { GradeAccent } from "@/components/illustrations/CardAccents";
import type { ActiveStudent } from "@/types";

// Warm sepia palette matching dashboard theme
const COLORS = [
  "#a0704b", // primary sepia
  "#cd853f", // peru/tan
  "#d4a574", // light tan
  "#8b6f47", // dark olive brown
  "#c2956e", // camel
  "#b8860b", // dark goldenrod
];

// Custom legend component styled as paper label tags
function CustomLegend({ payload }: { payload?: Array<{ color: string; value: string }> }) {
  if (!payload) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-3 justify-center px-2">
      {payload.map((entry, index) => (
        <span
          key={index}
          className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#f5ede3] dark:bg-[#3d3628] rounded border border-[#e8d4b8] dark:border-[#6b5a4a] text-[11px] shadow-sm"
        >
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="font-medium text-gray-700 dark:text-gray-300">{entry.value}</span>
        </span>
      ))}
    </div>
  );
}

interface GradeDistributionChartProps {
  students?: ActiveStudent[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const GradeDistributionChart = memo(function GradeDistributionChart({
  students = [],
  isLoading = false,
  error = null,
  onRetry
}: GradeDistributionChartProps) {
  const router = useRouter();

  // Handle click on pie slice - navigate to students page with grade filter
  const handleSliceClick = (data: { name: string }) => {
    if (data.name === "Unknown") return;
    router.push(`/students?grade=${encodeURIComponent(data.name)}`);
  };

  const chartData = useMemo(() => {
    const gradeCounts: Record<string, number> = {};

    students.forEach((student) => {
      const grade = student.grade || "Unknown";
      gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
    });

    return Object.entries(gradeCounts)
      .map(([grade, count]) => ({
        name: grade,
        value: count,
      }))
      .sort((a, b) => {
        // Sort grades in order: F1, F2, F3, F4, F5, F6, Unknown
        const gradeOrder = ["F1", "F2", "F3", "F4", "F5", "F6", "Unknown"];
        return gradeOrder.indexOf(a.name) - gradeOrder.indexOf(b.name);
      });
  }, [students]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <GradeAccent className="w-8 h-6" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Grade Distribution</h3>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="h-[250px] flex items-center justify-center">
          <div className="h-24 w-24 rounded-full shimmer-sepia" />
        </div>
      ) : error ? (
        <div className="h-[250px] flex flex-col items-center justify-center gap-3">
          <div className="text-red-500 dark:text-red-400 text-sm">Failed to load data</div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-[250px] flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400 text-sm">No data available</div>
        </div>
      ) : (
        <div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={72}
                fill="#8884d8"
                dataKey="value"
                onClick={handleSliceClick}
                style={{ cursor: "pointer" }}
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--tooltip-bg, #fef9f3)",
                  border: "1px solid var(--tooltip-border, #e8d4b8)",
                  borderRadius: "8px",
                  color: "var(--tooltip-text, #1f2937)",
                  padding: "8px 12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
                formatter={(value: number, name: string) => [`${value} students`, name]}
              />
              {/* Center content */}
              <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle">
                <tspan
                  style={{
                    fontSize: "28px",
                    fill: "#a0704b",
                    fontFamily: "'Caveat', cursive",
                    fontWeight: 700,
                  }}
                >
                  {chartData.reduce((sum, d) => sum + d.value, 0)}
                </tspan>
              </text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle">
                <tspan style={{ fontSize: "10px", fill: "#8b6f47", fontWeight: 500 }}>
                  students
                </tspan>
              </text>
            </PieChart>
          </ResponsiveContainer>
          <CustomLegend
            payload={chartData.map((entry, index) => ({
              color: COLORS[index % COLORS.length],
              value: entry.name,
            }))}
          />
        </div>
      )}
    </div>
  );
});
