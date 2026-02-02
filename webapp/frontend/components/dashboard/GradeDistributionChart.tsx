"use client";

import { useMemo, memo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  RadialBarChart,
  RadialBar,
} from "recharts";
import { GradeAccent } from "@/components/illustrations/CardAccents";
import { PieChart as PieIcon, BarChart3, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveStudent } from "@/types";

type ViewType = "donut" | "bar" | "radial";
const STORAGE_KEY = "dashboard-grade-chart-view";

// Warm sepia palette matching dashboard theme
const COLORS = [
  "#a0704b", // primary sepia
  "#cd853f", // peru/tan
  "#d4a574", // light tan
  "#8b6f47", // dark olive brown
  "#c2956e", // camel
  "#b8860b", // dark goldenrod
];

// Custom tooltip component
function CustomTooltip({ active, payload, total }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number } }>; total: number }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : "0";
  return (
    <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-3 py-2 shadow-lg">
      <div className="font-medium text-gray-900 dark:text-gray-100">{data.name}</div>
      <div className="text-sm text-gray-600 dark:text-gray-400">{data.value} students ({percentage}%)</div>
    </div>
  );
}

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

// View toggle buttons
function ViewToggle({ view, onChange }: { view: ViewType; onChange: (v: ViewType) => void }) {
  const buttons: { type: ViewType; icon: typeof PieIcon; label: string }[] = [
    { type: "donut", icon: PieIcon, label: "Donut" },
    { type: "bar", icon: BarChart3, label: "Bar" },
    { type: "radial", icon: Target, label: "Radial" },
  ];

  return (
    <div className="flex items-center gap-0.5 bg-[#f5ede3] dark:bg-[#3d3628] rounded-md p-0.5 border border-[#e8d4b8] dark:border-[#6b5a4a]">
      {buttons.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          onClick={() => onChange(type)}
          title={label}
          className={cn(
            "p-1 rounded transition-colors",
            view === type
              ? "bg-[#a0704b] text-white"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
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
  const [viewType, setViewType] = useState<ViewType>("donut");

  // Load preference from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ViewType | null;
    if (saved && ["donut", "bar", "radial"].includes(saved)) {
      setViewType(saved);
    }
  }, []);

  // Save preference to localStorage
  const handleViewChange = (view: ViewType) => {
    setViewType(view);
    localStorage.setItem(STORAGE_KEY, view);
  };

  // Handle click on chart element - navigate to students page with grade filter
  const handleSliceClick = (data: { name: string }) => {
    if (data.name === "Unknown") return;
    router.push(`/students?grade=${encodeURIComponent(data.name)}`);
  };

  const chartData = useMemo(() => {
    const studentList = Array.isArray(students) ? students : [];
    const gradeCounts: Record<string, number> = {};

    studentList.forEach((student) => {
      const grade = student.grade || "Unknown";
      gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
    });

    return Object.entries(gradeCounts)
      .map(([grade, count]) => ({
        name: grade,
        value: count,
        fill: COLORS[Object.keys(gradeCounts).indexOf(grade) % COLORS.length],
      }))
      .sort((a, b) => {
        // Sort grades in order: F1, F2, F3, F4, F5, F6, Unknown
        const gradeOrder = ["F1", "F2", "F3", "F4", "F5", "F6", "Unknown"];
        return gradeOrder.indexOf(a.name) - gradeOrder.indexOf(b.name);
      });
  }, [students]);

  const totalStudents = chartData.reduce((sum, d) => sum + d.value, 0);

  // Render chart based on view type
  const renderChart = () => {
    if (viewType === "donut") {
      return (
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
            <Tooltip content={<CustomTooltip total={totalStudents} />} />
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
                {totalStudents}
              </tspan>
            </text>
            <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle">
              <tspan style={{ fontSize: "10px", fill: "#8b6f47", fontWeight: 500 }}>
                students
              </tspan>
            </text>
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (viewType === "bar") {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart layout="vertical" data={chartData} margin={{ left: 10, right: 20 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={35}
              tick={{ fontSize: 11, fill: "#8b6f47" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip total={totalStudents} />} cursor={{ fill: "rgba(160, 112, 75, 0.1)" }} />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              onClick={(data) => handleSliceClick(data)}
              style={{ cursor: "pointer" }}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (viewType === "radial") {
      // For radial bar, we need data sorted by value for visual clarity
      const radialData = [...chartData].sort((a, b) => a.value - b.value);
      return (
        <ResponsiveContainer width="100%" height={200}>
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="25%"
            outerRadius="90%"
            data={radialData}
            startAngle={180}
            endAngle={0}
          >
            <RadialBar
              dataKey="value"
              cornerRadius={4}
              onClick={(data) => handleSliceClick(data)}
              style={{ cursor: "pointer" }}
            />
            <Tooltip content={<CustomTooltip total={totalStudents} />} />
            {/* Center content */}
            <text x="50%" y="85%" textAnchor="middle" dominantBaseline="middle">
              <tspan
                style={{
                  fontSize: "20px",
                  fill: "#a0704b",
                  fontFamily: "'Caveat', cursive",
                  fontWeight: 700,
                }}
              >
                {totalStudents}
              </tspan>
              <tspan style={{ fontSize: "10px", fill: "#8b6f47", fontWeight: 500 }}> students</tspan>
            </text>
          </RadialBarChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <GradeAccent className="w-8 h-6" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Grade Distribution</h3>
        </div>
        <ViewToggle view={viewType} onChange={handleViewChange} />
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
          {renderChart()}
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
