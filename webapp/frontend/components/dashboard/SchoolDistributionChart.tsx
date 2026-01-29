"use client";

import { useMemo, memo, useState, useEffect, useRef } from "react";
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
import { SchoolAccent } from "@/components/illustrations/CardAccents";
import { PieChart as PieIcon, BarChart3, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveStudent } from "@/types";

type ViewType = "donut" | "bar" | "radial";
const STORAGE_KEY = "dashboard-school-chart-view";

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

const TOP_N = 10; // Show top 10 schools, group rest as "Others"

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
  total
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number } }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : "0";

  // For "Others", show hint to click for details
  if (data.name === "Others") {
    return (
      <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-3 py-2 shadow-lg">
        <div className="font-medium text-gray-900 dark:text-gray-100">Others</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{data.value} students ({percentage}%)</div>
        <div className="text-xs text-[#a0704b] dark:text-[#d4a574] mt-1">Click for breakdown</div>
      </div>
    );
  }

  return (
    <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-3 py-2 shadow-lg">
      <div className="font-medium text-gray-900 dark:text-gray-100">{data.name}</div>
      <div className="text-sm text-gray-600 dark:text-gray-400">{data.value} students ({percentage}%)</div>
    </div>
  );
}

// Others breakdown popover
function OthersPopover({
  breakdown,
  total,
  onClose
}: {
  breakdown: Array<{ name: string; value: number }>;
  total: number;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const othersTotal = breakdown.reduce((sum, s) => sum + s.value, 0);
  const percentage = total > 0 ? ((othersTotal / total) * 100).toFixed(1) : "0";

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-xl w-[240px] max-h-[280px] overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">Others Breakdown</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{othersTotal} students ({percentage}%)</div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
        >
          ×
        </button>
      </div>
      <div className="p-2 overflow-y-auto max-h-[200px]">
        <div className="space-y-1">
          {breakdown.map((school, i) => {
            const schoolPct = total > 0 ? ((school.value / total) * 100).toFixed(1) : "0";
            return (
              <div key={i} className="flex items-center justify-between gap-2 text-sm py-1 px-1 rounded hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]">
                <span className="text-gray-700 dark:text-gray-300 truncate">{school.name}</span>
                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0 text-xs">{school.value} ({schoolPct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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
  const [viewType, setViewType] = useState<ViewType>("donut");
  const [showOthersPopover, setShowOthersPopover] = useState(false);

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

  // Handle click on chart element - navigate to students page with school filter
  const handleSliceClick = (data: { name: string }) => {
    if (data.name === "Unknown") return;
    if (data.name === "Others") {
      setShowOthersPopover(true);
      return;
    }
    router.push(`/students?school=${encodeURIComponent(data.name)}`);
  };

  const { chartData, totalSchools, totalStudents, othersBreakdown } = useMemo(() => {
    const schoolCounts: Record<string, number> = {};

    students.forEach((student) => {
      const school = student.school || "Unknown";
      schoolCounts[school] = (schoolCounts[school] || 0) + 1;
    });

    const sorted = Object.entries(schoolCounts)
      .map(([school, count], index) => ({
        name: school,
        value: count,
        fill: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value); // Sort by count descending

    // Capture total unique schools BEFORE aggregation
    const totalSchools = sorted.length;
    const totalStudents = sorted.reduce((sum, s) => sum + s.value, 0);

    // If fewer than TOP_N, return as is
    if (sorted.length <= TOP_N) {
      return { chartData: sorted, totalSchools, totalStudents, othersBreakdown: [] };
    }

    // Take top N schools
    const topSchools = sorted.slice(0, TOP_N);

    // Track schools grouped into "Others" for hover breakdown
    const othersBreakdown = sorted.slice(TOP_N);
    const othersCount = othersBreakdown.reduce((sum, s) => sum + s.value, 0);

    return {
      chartData: [...topSchools, { name: "Others", value: othersCount, fill: COLORS[TOP_N % COLORS.length] }],
      totalSchools,
      totalStudents,
      othersBreakdown
    };
  }, [students]);

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
              width={70}
              tick={{ fontSize: 10, fill: "#8b6f47" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: string) => value.length > 10 ? `${value.slice(0, 10)}…` : value}
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
                {totalSchools}
              </tspan>
              <tspan style={{ fontSize: "10px", fill: "#8b6f47", fontWeight: 500 }}> schools</tspan>
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
          <SchoolAccent className="w-8 h-6" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">School Distribution</h3>
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
        <div className="relative">
          {renderChart()}
          {showOthersPopover && othersBreakdown.length > 0 && (
            <OthersPopover
              breakdown={othersBreakdown}
              total={totalStudents}
              onClose={() => setShowOthersPopover(false)}
            />
          )}
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
