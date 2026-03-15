"use client";

import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { CHART_COLORS, SCORE_LABELS } from "@/lib/progress-constants";
import type { RadarChartConfig } from "@/types";

interface ReportRadarChartProps {
  data: RadarChartConfig;
}

export function ReportRadarChart({ data }: ReportRadarChartProps) {
  const { axes, display_mode } = data;

  if (axes.length < 4) return null;

  const chartData = axes.map((axis) => ({
    attribute: axis.label,
    score: axis.score,
    fullMark: 5,
  }));

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Skills Assessment</h3>
      <div className="flex flex-col md:flex-row items-center gap-4">
        <div className="flex-1 min-w-0">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke={CHART_COLORS.grid} />
              <PolarAngleAxis
                dataKey="attribute"
                tick={({ payload, x, y, textAnchor }) => (
                  <text x={x} y={y} textAnchor={textAnchor} fill="#8b7355" fontSize={11}>
                    {payload.value.length > 15 ? payload.value.slice(0, 14) + "\u2026" : payload.value}
                  </text>
                )}
              />
              <PolarRadiusAxis
                domain={[0, 5]}
                tickCount={6}
                tick={{ fontSize: 9, fill: "#a0704b" }}
                axisLine={false}
              />
              <Radar
                dataKey="score"
                stroke="#a0704b"
                fill="#a0704b"
                fillOpacity={0.25}
                strokeWidth={2}
                dot={{ r: 3, fill: "#a0704b" }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-shrink-0 w-48">
          <table className="w-full text-xs">
            <tbody>
              {axes.map((axis, i) => (
                <tr key={i} className="border-b border-[#e8d4b8] last:border-0">
                  <td className="py-1.5 text-gray-600 font-medium">{axis.label}</td>
                  <td className="py-1.5 text-right text-gray-500 whitespace-nowrap">
                    {display_mode === "labeled"
                      ? SCORE_LABELS[axis.score] || axis.score
                      : `${axis.score}/5`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
