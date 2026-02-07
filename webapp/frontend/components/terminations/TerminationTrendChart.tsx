"use client";

import { memo, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceDot,
} from "recharts";
import { TrendingDown, Loader2, LineChart as LineChartIcon, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG } from "@/lib/termination-constants";
import type { QuarterTrendPoint } from "@/types";

const LINE_COLORS = {
  opening: "#a0704b",
  closing: "#8b6f47",
  terminated: "#dc2626",
  term_rate: "#d97706",
};

const FALLBACK_COLOR = "#78716c";

function getCatColor(name: string): string {
  return CATEGORY_CONFIG[name]?.color || FALLBACK_COLOR;
}

type ViewType = "overview" | "reasons";

function OverviewTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-3 py-2 shadow-lg text-sm">
      <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="capitalize">{entry.dataKey === "term_rate" ? "Term Rate" : entry.dataKey}:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {entry.dataKey === "term_rate" ? `${entry.value.toFixed(1)}%` : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ReasonTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const entries = payload.filter(e => e.value > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + e.value, 0);
  return (
    <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-3 py-2 shadow-lg text-sm max-w-[250px]">
      <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">{label} ({total} terminated)</div>
      {entries.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="truncate">{entry.dataKey}:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100 shrink-0">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

interface TerminationTrendChartProps {
  data?: QuarterTrendPoint[];
  isLoading?: boolean;
  selectedQuarter?: number | null;
  selectedYear?: number | null;
  isMobile?: boolean;
}

export const TerminationTrendChart = memo(function TerminationTrendChart({
  data,
  isLoading,
  selectedQuarter,
  selectedYear,
  isMobile,
}: TerminationTrendChartProps) {
  const [viewType, setViewType] = useState<ViewType>("overview");

  // Collect all unique reason categories across all quarters
  const allCategories = useMemo(() => {
    if (!data) return [];
    const cats = new Set<string>();
    for (const d of data) {
      for (const key of Object.keys(d.reason_breakdown || {})) {
        cats.add(key);
      }
    }
    return Array.from(cats).sort();
  }, [data]);

  // Flatten reason_breakdown into top-level keys for recharts
  const reasonChartData = useMemo(() => {
    if (!data || !allCategories.length) return [];
    return data.map(d => {
      const flat: Record<string, string | number> = { label: d.label };
      for (const cat of allCategories) {
        flat[cat] = d.reason_breakdown?.[cat] || 0;
      }
      return flat;
    });
  }, [data, allCategories]);

  if (isLoading) {
    return (
      <div className={cn(
        "bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-4 shadow-sm",
        !isMobile && "paper-texture"
      )}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data || data.length < 2) return null;

  const selectedLabel = selectedQuarter && selectedYear
    ? `Q${selectedQuarter} ${selectedYear}`
    : null;

  const selectedPoint = selectedLabel
    ? data.find(d => d.label === selectedLabel)
    : null;

  return (
    <div className={cn(
      "bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-4 shadow-sm",
      !isMobile && "paper-texture"
    )}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
          Quarterly Trends
        </h2>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <button
            onClick={() => setViewType("overview")}
            className={cn(
              "px-2 py-1 rounded flex items-center gap-1",
              viewType === "overview" ? "bg-[#a0704b]/15 text-[#a0704b] dark:text-[#cd853f] font-medium" : "hover:bg-muted/50"
            )}
          >
            <LineChartIcon className="h-3 w-3" /> Overview
          </button>
          <button
            onClick={() => setViewType("reasons")}
            className={cn(
              "px-2 py-1 rounded flex items-center gap-1",
              viewType === "reasons" ? "bg-[#a0704b]/15 text-[#a0704b] dark:text-[#cd853f] font-medium" : "hover:bg-muted/50"
            )}
          >
            <BarChart3 className="h-3 w-3" /> Reasons
          </button>
        </div>
      </div>

      {viewType === "overview" ? (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8d4b8" opacity={0.5} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<OverviewTooltip />} />
            <Legend
              formatter={(value: string) =>
                value === "term_rate" ? "Term Rate" : value.charAt(0).toUpperCase() + value.slice(1)
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line yAxisId="left" type="monotone" dataKey="opening" stroke={LINE_COLORS.opening} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line yAxisId="left" type="monotone" dataKey="closing" stroke={LINE_COLORS.closing} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line yAxisId="left" type="monotone" dataKey="terminated" stroke={LINE_COLORS.terminated} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line yAxisId="right" type="monotone" dataKey="term_rate" stroke={LINE_COLORS.term_rate} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} activeDot={{ r: 5 }} />
            {selectedPoint && (
              <>
                <ReferenceDot yAxisId="left" x={selectedLabel!} y={selectedPoint.opening} r={6} fill={LINE_COLORS.opening} stroke="#fff" strokeWidth={2} />
                <ReferenceDot yAxisId="left" x={selectedLabel!} y={selectedPoint.terminated} r={6} fill={LINE_COLORS.terminated} stroke="#fff" strokeWidth={2} />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={reasonChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8d4b8" opacity={0.5} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
            <Tooltip content={<ReasonTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {allCategories.map((cat) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="reasons"
                fill={getCatColor(cat)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
});
