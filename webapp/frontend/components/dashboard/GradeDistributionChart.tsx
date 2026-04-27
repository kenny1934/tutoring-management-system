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
import { PieChart as PieIcon, BarChart3, Target, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveStudent } from "@/types";
import { CopyDataButton } from "@/components/dashboard/CopyDataButton";

type ViewType = "donut" | "bar" | "radial";
const STORAGE_KEY = "dashboard-grade-chart-view";
const SPLIT_STORAGE_KEY = "dashboard-grade-chart-split-stream";

// Warm sepia palette matching dashboard theme
const COLORS = [
  "#a0704b", // primary sepia
  "#cd853f", // peru/tan
  "#d4a574", // light tan
  "#8b6f47", // dark olive brown
  "#c2956e", // camel
  "#b8860b", // dark goldenrod
];

// Within a grade, C is rendered as the darker tint and E as the lighter
// tint of the grade's hue (see `shadeHex` below). STREAM_ORDER pins the
// segment ordering so each grade's pair stays adjacent.
const STREAM_ORDER: Record<string, number> = { C: 0, E: 1, Other: 2 };
// Lightness deltas applied to a grade's base color to derive its C/E
// shades. Wide enough gap (~50% combined) that the split reads clearly.
const STREAM_SHADE_C = -0.18;
const STREAM_SHADE_E = 0.32;
const STREAM_SHADE_OTHER = "#9ca3af";
const STREAM_KEYS = ["C", "E", "Other"] as const;
type StreamKey = (typeof STREAM_KEYS)[number];

const GRADE_ORDER = ["F1", "F2", "F3", "F4", "F5", "F6", "Unknown"];

function normalizeStream(raw: string | null | undefined): StreamKey {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "C" || v === "E") return v;
  return "Other";
}

// Shift a hex toward white (positive pct) or black (negative pct), in RGB.
// Used to derive a darker/lighter sibling of each grade's base color so
// split-mode donut/radial slices keep grade hue but show clear C/E contrast.
function shadeHex(hex: string, pct: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const target = pct >= 0 ? 255 : 0;
  const t = Math.abs(pct);
  const ch = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + (target - c) * t)))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

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

// Tooltip for the split-by-stream stacked bar view. Recharts' shared cursor
// passes one entry per stacked segment for the hovered row, so we render the
// whole grade breakdown rather than guessing which segment is under the
// pointer.
function StackedTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload: { name: string; total: number } }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const rowPct = total > 0 ? ((row.total / total) * 100).toFixed(1) : "0";
  const segments = payload.filter((p) => p.value > 0);
  return (
    <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-3 py-2 shadow-lg min-w-[140px]">
      <div className="font-medium text-gray-900 dark:text-gray-100">
        {row.name} <span className="text-xs font-normal text-gray-500">({row.total} · {rowPct}%)</span>
      </div>
      {segments.map((seg) => (
        <div key={seg.name} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 mt-0.5">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: seg.color }} />
          <span>{row.name}{seg.name === "Other" ? "?" : seg.name}: {seg.value}</span>
        </div>
      ))}
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
  /** When set, click-throughs append `&tutor_id=...` so the students list is narrowed to match the chart's tutor scope. */
  tutorFilterId?: number;
}

export const GradeDistributionChart = memo(function GradeDistributionChart({
  students = [],
  isLoading = false,
  error = null,
  onRetry,
  tutorFilterId,
}: GradeDistributionChartProps) {
  const router = useRouter();
  const [viewType, setViewType] = useState<ViewType>("donut");
  const [splitByStream, setSplitByStream] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ViewType | null;
    if (saved && ["donut", "bar", "radial"].includes(saved)) {
      setViewType(saved);
    }
    if (localStorage.getItem(SPLIT_STORAGE_KEY) === "1") {
      setSplitByStream(true);
    }
  }, []);

  // Save preference to localStorage
  const handleViewChange = (view: ViewType) => {
    setViewType(view);
    localStorage.setItem(STORAGE_KEY, view);
  };

  const handleSplitToggle = () => {
    setSplitByStream((prev) => {
      const next = !prev;
      localStorage.setItem(SPLIT_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  // Handle click on chart element - navigate to students page with grade
  // (and optionally lang_stream + tutor_id) filters. When `stream` is "C"
  // or "E", it's appended; "Other" is dropped (the students endpoint
  // expects a concrete stream value).
  const handleSliceClick = (data: { grade?: string; name: string; stream?: StreamKey }) => {
    const grade = data.grade ?? data.name;
    if (!grade || grade === "Unknown") return;
    const params = new URLSearchParams();
    params.set("grade", grade);
    if (data.stream === "C" || data.stream === "E") {
      params.set("lang_stream", data.stream);
    }
    if (tutorFilterId) params.set("tutor_id", String(tutorFilterId));
    router.push(`/students?${params.toString()}`);
  };

  // Per-grade totals + per-stream breakdown. Used by every view; the bar
  // view consumes the stream split when `splitByStream` is on, donut/radial
  // expand into one slice per grade-stream pair.
  const { gradeTotals, streamBreakdown, hasOtherStream } = useMemo(() => {
    const studentList = Array.isArray(students) ? students : [];
    const totals: Record<string, number> = {};
    const split: Record<string, Record<StreamKey, number>> = {};
    let other = false;
    studentList.forEach((s) => {
      const grade = s.grade || "Unknown";
      const stream = normalizeStream(s.lang_stream);
      totals[grade] = (totals[grade] ?? 0) + 1;
      split[grade] = split[grade] ?? { C: 0, E: 0, Other: 0 };
      split[grade][stream] += 1;
      if (stream === "Other") other = true;
    });
    return { gradeTotals: totals, streamBreakdown: split, hasOtherStream: other };
  }, [students]);

  // Aggregated chart data (one entry per grade) — used by donut/radial when
  // split is off, and by the bar view as the row backing for stacks.
  // NOTE: per-row color lives on `gradeColor`, not `fill`. Recharts uses an
  // entry's `fill` field as a per-segment override on stacked Bars, which
  // would silently win over the Bar component's own `fill` prop and erase
  // the C/E stream colors.
  const chartData = useMemo(() => {
    return Object.entries(gradeTotals)
      .map(([grade, count]) => ({
        name: grade,
        grade,
        value: count,
        total: count,
        C: streamBreakdown[grade]?.C ?? 0,
        E: streamBreakdown[grade]?.E ?? 0,
        Other: streamBreakdown[grade]?.Other ?? 0,
      }))
      .sort((a, b) => GRADE_ORDER.indexOf(a.name) - GRADE_ORDER.indexOf(b.name))
      .map((row, i) => ({ ...row, gradeColor: COLORS[i % COLORS.length] }));
  }, [gradeTotals, streamBreakdown]);

  // Expanded chart data (one entry per grade-stream pair) — used by
  // donut/radial when split is on. Each grade keeps its own hue from the
  // palette; within a grade, C is darker and E is lighter (~30%+ lightness
  // gap) so the split is visible while the grade remains identifiable.
  const splitChartData = useMemo(() => {
    if (!splitByStream) return [];
    const out: Array<{ name: string; grade: string; stream: StreamKey; value: number; fill: string }> = [];
    chartData.forEach((row) => {
      const base = row.gradeColor;
      const streamFill: Record<StreamKey, string> = {
        C: shadeHex(base, STREAM_SHADE_C),
        E: shadeHex(base, STREAM_SHADE_E),
        Other: STREAM_SHADE_OTHER,
      };
      (STREAM_KEYS as readonly StreamKey[]).forEach((stream) => {
        const count = row[stream];
        if (count === 0) return;
        out.push({
          name: `${row.grade}${stream === "Other" ? "?" : stream}`,
          grade: row.grade,
          stream,
          value: count,
          fill: streamFill[stream],
        });
      });
    });
    // Keep grade clusters together (F1C, F1E, F2C, F2E, …) so adjacent slices
    // share a hue family — reading by grade is the primary visual task.
    out.sort((a, b) => {
      const gd = GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade);
      if (gd !== 0) return gd;
      return STREAM_ORDER[a.stream] - STREAM_ORDER[b.stream];
    });
    return out;
  }, [splitByStream, chartData]);

  const totalStudents = chartData.reduce((sum, d) => sum + d.value, 0);
  const activeStreamKeys: StreamKey[] = hasOtherStream ? ["C", "E", "Other"] : ["C", "E"];

  // Render chart based on view type
  const renderChart = () => {
    const donutData = splitByStream ? splitChartData : chartData;
    const cellFill = (
      entry: { fill?: string; gradeColor?: string },
      index: number
    ): string => entry.fill ?? entry.gradeColor ?? COLORS[index % COLORS.length];

    if (viewType === "donut") {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={donutData}
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
              {donutData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={cellFill(entry, index)} />
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
            <Tooltip
              content={
                splitByStream
                  ? <StackedTooltip total={totalStudents} />
                  : <CustomTooltip total={totalStudents} />
              }
              cursor={{ fill: "rgba(160, 112, 75, 0.1)" }}
            />
            {splitByStream ? (
              activeStreamKeys.map((stream, i) => {
                const tintFor = (base: string): string => {
                  if (stream === "C") return shadeHex(base, STREAM_SHADE_C);
                  if (stream === "E") return shadeHex(base, STREAM_SHADE_E);
                  return STREAM_SHADE_OTHER;
                };
                return (
                  <Bar
                    key={stream}
                    dataKey={stream}
                    stackId="grade"
                    radius={i === activeStreamKeys.length - 1 ? [0, 4, 4, 0] : 0}
                    // Recharts gives the row data but not which Bar fired,
                    // so we close over `stream` here to pass it through.
                    onClick={(data) => handleSliceClick({ ...(data as { grade?: string; name: string }), stream })}
                    style={{ cursor: "pointer" }}
                  >
                    {chartData.map((row, ri) => (
                      <Cell key={`cell-${stream}-${ri}`} fill={tintFor(row.gradeColor)} />
                    ))}
                  </Bar>
                );
              })
            ) : (
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
            )}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (viewType === "radial") {
      // For radial bar, we need data sorted by value for visual clarity.
      // Inject `fill` per row — RadialBar reads it directly off the data
      // (no Cell children supported on this chart type).
      const radialData = [...donutData]
        .sort((a, b) => a.value - b.value)
        .map((entry, i) => ({ ...entry, fill: cellFill(entry, i) }));
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
        <div className="flex items-center gap-1.5">
          <CopyDataButton
            title="Copy chart data (TSV)"
            build={() => {
              if (splitByStream) {
                const header = ["Grade", "C", "E"];
                if (hasOtherStream) header.push("Other");
                header.push("Total");
                const rows = chartData.map((r) => {
                  const cells = [r.grade, String(r.C), String(r.E)];
                  if (hasOtherStream) cells.push(String(r.Other));
                  cells.push(String(r.total));
                  return cells.join("\t");
                });
                return [header.join("\t"), ...rows].join("\n");
              }
              return ["Grade\tCount", ...chartData.map((r) => `${r.grade}\t${r.value}`)].join("\n");
            }}
          />
          <button
            onClick={handleSplitToggle}
            title={splitByStream ? "Showing C/E split" : "Split by language stream"}
            aria-pressed={splitByStream}
            className={cn(
              "p-1 rounded border transition-colors",
              splitByStream
                ? "bg-[#a0704b] text-white border-[#a0704b]"
                : "bg-[#f5ede3] dark:bg-[#3d3628] text-gray-500 dark:text-gray-400 border-[#e8d4b8] dark:border-[#6b5a4a] hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            <Languages className="h-3.5 w-3.5" />
          </button>
          <ViewToggle view={viewType} onChange={handleViewChange} />
        </div>
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
            payload={
              splitByStream
                ? // All split views (bar/donut/radial) encode color as
                  // grade-hue × stream-lightness, so one legend works for
                  // all three: per-grade-stream chips matching the darker-C
                  // / lighter-E pair within each grade.
                  splitChartData.map((entry) => ({
                    color: entry.fill,
                    value: entry.name,
                  }))
                : chartData.map((entry, index) => ({
                    color: entry.gradeColor ?? COLORS[index % COLORS.length],
                    value: entry.name,
                  }))
            }
          />
        </div>
      )}
    </div>
  );
});
