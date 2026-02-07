"use client";

import { memo, useMemo, useState } from "react";
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
  CartesianGrid,
} from "recharts";
import { PieChart as PieIcon, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG } from "@/lib/termination-constants";
import type { TerminatedStudent } from "@/types";

// Fallback color for unknown categories
const FALLBACK_COLOR = "#78716c";

function getCatColor(name: string): string {
  return CATEGORY_CONFIG[name]?.color || FALLBACK_COLOR;
}

type ViewType = "pie" | "bar";

function CustomTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number } }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const pct = total > 0 ? ((data.value / total) * 100).toFixed(1) : "0";
  return (
    <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-3 py-2 shadow-lg text-sm">
      <div className="font-medium text-gray-900 dark:text-gray-100">{data.name}</div>
      <div className="text-gray-600 dark:text-gray-400">
        {data.value} student{data.value !== 1 ? "s" : ""} ({pct}%)
      </div>
    </div>
  );
}

interface ReasonDistributionChartProps {
  students: TerminatedStudent[];
  getEffectiveChecked: (s: TerminatedStudent) => boolean;
  getEffectiveCategory: (s: TerminatedStudent) => string;
  isMobile?: boolean;
}

export const ReasonDistributionChart = memo(function ReasonDistributionChart({
  students,
  getEffectiveChecked,
  getEffectiveCategory,
  isMobile,
}: ReasonDistributionChartProps) {
  const [viewType, setViewType] = useState<ViewType>("pie");

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of students) {
      if (!getEffectiveChecked(s)) continue;
      const cat = getEffectiveCategory(s) || "Uncategorized";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [students, getEffectiveChecked, getEffectiveCategory]);

  const total = useMemo(() => chartData.reduce((s, d) => s + d.value, 0), [chartData]);

  if (total === 0) return null;

  return (
    <div className={cn(
      "bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-4 shadow-sm",
      !isMobile && "paper-texture"
    )}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <PieIcon className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
          Termination Reasons
        </h2>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <button
            onClick={() => setViewType("pie")}
            className={cn(
              "p-1 rounded",
              viewType === "pie" ? "bg-[#a0704b]/15 text-[#a0704b] dark:text-[#cd853f]" : "hover:bg-muted/50"
            )}
          >
            <PieIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewType("bar")}
            className={cn(
              "p-1 rounded",
              viewType === "bar" ? "bg-[#a0704b]/15 text-[#a0704b] dark:text-[#cd853f]" : "hover:bg-muted/50"
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {viewType === "pie" ? (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={getCatColor(entry.name)} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1">
            {chartData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: getCatColor(entry.name) }}
                />
                <span className="truncate text-gray-700 dark:text-gray-300">{entry.name}</span>
                <span className="ml-auto font-medium text-gray-900 dark:text-gray-100 shrink-0">
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 32)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8d4b8" opacity={0.5} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              width={130}
            />
            <Tooltip content={<CustomTooltip total={total} />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={getCatColor(entry.name)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
});
