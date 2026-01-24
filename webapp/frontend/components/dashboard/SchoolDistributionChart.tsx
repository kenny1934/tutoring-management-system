"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { SchoolAccent } from "@/components/illustrations/CardAccents";
import { useLocation } from "@/contexts/LocationContext";
import { useAllStudents } from "@/lib/hooks";

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

interface SchoolDistributionChartProps {
  tutorId?: number;
}

export function SchoolDistributionChart({ tutorId }: SchoolDistributionChartProps) {
  const router = useRouter();
  const { selectedLocation } = useLocation();
  // Pass tutorId to filter for "My View" mode
  const { data: enrollments = [], isLoading: loading, error, mutate } = useAllStudents(selectedLocation, tutorId);

  // Handle click on pie slice - navigate to students page with school filter
  const handleSliceClick = (data: { name: string }) => {
    if (data.name === "Unknown" || data.name === "Others") return;
    router.push(`/students?school=${encodeURIComponent(data.name)}`);
  };

  const chartData = useMemo(() => {
    const schoolCounts: Record<string, number> = {};

    enrollments.forEach((enrollment) => {
      const school = enrollment.school || "Unknown";
      schoolCounts[school] = (schoolCounts[school] || 0) + 1;
    });

    const sorted = Object.entries(schoolCounts)
      .map(([school, count]) => ({
        name: school,
        value: count,
      }))
      .sort((a, b) => b.value - a.value); // Sort by count descending

    // If fewer than TOP_N, return as is
    if (sorted.length <= TOP_N) return sorted;

    // Take top N schools
    const topSchools = sorted.slice(0, TOP_N);

    // Group remaining into "Others"
    const othersCount = sorted.slice(TOP_N).reduce((sum, s) => sum + s.value, 0);

    return [...topSchools, { name: "Others", value: othersCount }];
  }, [enrollments]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <SchoolAccent className="w-8 h-6" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">School Distribution</h3>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="h-[250px] flex items-center justify-center">
          <div className="h-24 w-24 rounded-full shimmer-sepia" />
        </div>
      ) : error ? (
        <div className="h-[250px] flex flex-col items-center justify-center gap-3">
          <div className="text-red-500 dark:text-red-400 text-sm">Failed to load data</div>
          <button
            onClick={() => mutate()}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-[250px] flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400 text-sm">No data available</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={(props) => {
                const { name, percent } = props as unknown as { name: string; percent: number };
                return percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : "";
              }}
              outerRadius={70}
              fill="#8884d8"
              dataKey="value"
              onClick={handleSliceClick}
              style={{ cursor: "pointer" }}
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
              }}
            />
            <Legend
              wrapperStyle={{
                fontSize: "12px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
