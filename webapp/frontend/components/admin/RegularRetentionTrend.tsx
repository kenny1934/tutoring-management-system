"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { RegularRetentionResponse, RegularRetentionTrendPoint } from "@/types";

/** Which of the three dated events the chart is showing. */
type Metric = "applied" | "contacted" | "declined";

const METRICS: {
  key: Metric;
  label: string;
  color: string;
  /** Sentence under the chart when nothing of this kind has happened yet. */
  empty: string;
}[] = [
  {
    key: "applied",
    label: "Applications",
    color: "#6366f1",
    empty: "Nobody from this cohort has applied yet.",
  },
  {
    key: "contacted",
    label: "Contacts",
    color: "#0ea5e9",
    empty: "No calls or messages have been logged since the window opened.",
  },
  {
    key: "declined",
    label: "Not returning",
    color: "#f43f5e",
    empty: "Nobody has been recorded as not returning.",
  },
];

const RUNNING: Record<Metric, "applied_total" | "contacted_total" | "declined_total"> = {
  applied: "applied_total",
  contacted: "contacted_total",
  declined: "declined_total",
};

/** "5 Aug", which is short enough to fit a daily axis without rotating. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function TrendTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: { payload: RegularRetentionTrendPoint }[];
  label?: string;
  metric: (typeof METRICS)[number];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const onTheDay = point[metric.key];
  const running = point[RUNNING[metric.key]];
  return (
    <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="font-medium text-foreground mb-1">{label}</div>
      <div className="text-muted-foreground tabular-nums">
        <span className="text-foreground font-medium">{onTheDay}</span> that day
      </div>
      <div className="text-muted-foreground tabular-nums">
        <span className="text-foreground font-medium">{running}</span> in total
      </div>
    </div>
  );
}

/** How the intake arrived, day by day.
 *
 *  A running total on its own always climbs and so always looks like progress;
 *  the daily bars are where "has this stalled" is actually visible, which is
 *  the question the chart exists to answer. Both are drawn, on their own axes.
 *
 *  There is no snapshot behind this. The series is rebuilt each request from
 *  the dates the applications, terminations and contacts already carry, so it
 *  covers the whole window rather than starting on the day it was first read. */
export function RegularRetentionTrend({ data }: { data: RegularRetentionResponse }) {
  const [metric, setMetric] = useState<Metric>("applied");
  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  const points = useMemo(
    () => data.trend.map((p) => ({ ...p, label: shortDate(p.date) })),
    [data.trend]
  );

  const totals = useMemo(() => {
    const last = data.trend[data.trend.length - 1];
    return {
      applied: last?.applied_total ?? 0,
      contacted: last?.contacted_total ?? 0,
      declined: last?.declined_total ?? 0,
    };
  }, [data.trend]);

  // The last seven days of the window, which is the pace question. Taken off
  // the end of the series rather than off today's date, so a closed window
  // reports its final week instead of a run of empty days.
  const lastSeven = useMemo(
    () => data.trend.slice(-7).reduce((sum, p) => sum + p[metric], 0),
    [data.trend, metric]
  );

  // One day is a column, not a trend. Two is the least that can show direction.
  if (points.length < 2) return null;

  const total = totals[metric];
  const cohort = data.totals.cohort;

  return (
    <div className="border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 rounded-xl bg-white/30 dark:bg-white/[0.01] p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">How the intake is going</h2>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {total} {active.label.toLowerCase()} since the window opened
            {metric === "applied" && cohort > 0
              ? `, ${Math.round((total / cohort) * 100)}% of the cohort`
              : ""}
            . {lastSeven} in the last seven days.
          </p>
        </div>
        <div className="inline-flex bg-muted rounded-full p-0.5 shrink-0">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-200 tabular-nums",
                metric === m.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m.label} ({totals[m.key]})
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted-foreground italic py-6">{active.empty}</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={points} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8d4b8" opacity={0.5} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              yAxisId="daily"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="running"
              orientation="right"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<TrendTooltip metric={active} />}
              cursor={{ fill: "#a0704b", fillOpacity: 0.08 }}
            />
            <Bar
              yAxisId="daily"
              dataKey={metric}
              fill={active.color}
              fillOpacity={0.35}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              yAxisId="running"
              type="monotone"
              dataKey={RUNNING[metric]}
              stroke={active.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <p className="text-[11px] text-muted-foreground mt-2">
        Bars count each day on the left, the line is the running total on the right. Every day is
        measured against the cohort as it stands today, so the line moves when the chasing does.
      </p>
    </div>
  );
}
