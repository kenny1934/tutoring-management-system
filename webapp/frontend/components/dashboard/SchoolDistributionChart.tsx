"use client";

import { useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { SchoolAccent } from "@/components/illustrations/CardAccents";
import type { ActiveStudent } from "@/types";

// Warm sepia palette matching dashboard theme
const COLORS = [
  "#a0704b", // primary sepia
  "#cd853f", // peru/tan
  "#d4a574", // light tan
  "#8b6f47", // dark olive brown
  "#c2956e", // camel
  "#b8860b", // dark goldenrod
  "#d2691e", // chocolate
  "#a0522d", // sienna (for "Others")
];

const TOP_N = 6; // Show top 6 schools, group rest as "Others"

// Custom legend component styled as paper label tags
function CustomLegend({ payload }: { payload?: Array<{ color: string; value: string; count: number }> }) {
  if (!payload) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-3 justify-center px-2">
      {payload.map((entry, index) => (
        <span
          key={index}
          className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#f5ede3] dark:bg-[#3d3628] rounded border border-[#e8d4b8] dark:border-[#6b5a4a] text-[11px] shadow-sm"
          title={`${entry.count} students`}
        >
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">
            {entry.value}
          </span>
        </span>
      ))}
    </div>
  );
}

interface SchoolDistributionChartProps {
  students?: ActiveStudent[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const SchoolDistributionChart = memo(function SchoolDistributionChart({
  students = [],
  isLoading = false,
  error = null,
  onRetry
}: SchoolDistributionChartProps) {
  const router = useRouter();

  // Handle click on pie slice - navigate to students page with school filter
  const handleSliceClick = (data: { name: string }) => {
    if (data.name === "Unknown" || data.name === "Others") return;
    router.push(`/students?school=${encodeURIComponent(data.name)}`);
  };

  const { chartData, totalSchools } = useMemo(() => {
    const schoolCounts: Record<string, number> = {};

    students.forEach((student) => {
      const school = student.school || "Unknown";
      schoolCounts[school] = (schoolCounts[school] || 0) + 1;
    });

    const sorted = Object.entries(schoolCounts)
      .map(([school, count]) => ({
        name: school,
        value: count,
      }))
      .sort((a, b) => b.value - a.value); // Sort by count descending

    // Capture total unique schools BEFORE aggregation
    const totalSchools = sorted.length;

    // If fewer than TOP_N, return as is
    if (sorted.length <= TOP_N) return { chartData: sorted, totalSchools };

    // Take top N schools
    const topSchools = sorted.slice(0, TOP_N);

    // Group remaining into "Others"
    const othersCount = sorted.slice(TOP_N).reduce((sum, s) => sum + s.value, 0);

    return { chartData: [...topSchools, { name: "Others", value: othersCount }], totalSchools };
  }, [students]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <SchoolAccent className="w-8 h-6" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">School Distribution</h3>
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
                  {totalSchools}
                </tspan>
              </text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle">
                <tspan style={{ fontSize: "10px", fill: "#8b6f47", fontWeight: 500 }}>
                  schools
                </tspan>
              </text>
            </PieChart>
          </ResponsiveContainer>
          <CustomLegend
            payload={chartData.map((entry, index) => ({
              color: COLORS[index % COLORS.length],
              value: entry.name,
              count: entry.value,
            }))}
          />
        </div>
      )}
    </div>
  );
});
