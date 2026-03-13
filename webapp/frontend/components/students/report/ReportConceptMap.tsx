"use client";

import { Treemap, ResponsiveContainer } from "recharts";
import type { ConceptNode } from "@/types";
import { getConceptCategoryColors } from "@/lib/progress-constants";

interface ReportConceptMapProps {
  data: ConceptNode[];
}

// Custom renderer for treemap cells — recharts spreads all data props onto this
function TreemapCell(props: Record<string, unknown>) {
  const x = props.x as number;
  const y = props.y as number;
  const width = props.width as number;
  const height = props.height as number;
  const name = props.name as string;
  const count = (props.count as number) || 0;
  const cellFill = (props.cellFill as string) || "#9ca3af";
  const cellText = (props.cellText as string) || "#fff";

  if (width < 4 || height < 4) return null;

  const showLabel = width > 40 && height > 24;
  const showCount = width > 50 && height > 36;
  const fontSize = Math.min(12, Math.max(9, Math.min(width / 8, height / 3)));

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={cellFill}
        stroke="white"
        strokeWidth={2}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 + (showCount ? -4 : 0)}
          textAnchor="middle"
          dominantBaseline="central"
          fill={cellText}
          fontSize={fontSize}
          fontWeight={600}
        >
          {name.length > width / 7 ? name.slice(0, Math.floor(width / 7)) + "…" : name}
        </text>
      )}
      {showCount && count > 1 && (
        <text
          x={x + width / 2}
          y={y + height / 2 + fontSize - 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={cellText}
          fontSize={9}
          opacity={0.8}
        >
          {count}×
        </text>
      )}
    </g>
  );
}

export function ReportConceptMap({ data }: ReportConceptMapProps) {
  if (data.length === 0) return null;

  // Build treemap data grouped by category
  const groups = new Map<string, ConceptNode[]>();
  for (const node of data) {
    const cat = node.category || "Other";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(node);
  }

  const treemapData = [...groups.entries()].map(([category, nodes]) => {
    const colors = getConceptCategoryColors(category);
    return {
      name: category,
      children: [...nodes]
        .sort((a, b) => b.count - a.count)
        .map((node) => ({
          name: node.label,
          size: node.count,
          count: node.count,
          cellFill: colors.border,
          cellText: "#fff",
        })),
    };
  });

  // Collect unique categories for legend
  const categories = [...groups.keys()];

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Concepts Covered</h3>
      <ResponsiveContainer width="100%" height={220}>
        <Treemap
          data={treemapData}
          dataKey="size"
          stroke="white"
          strokeWidth={2}
          content={<TreemapCell />}
        />
      </ResponsiveContainer>
      {/* Category legend */}
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {categories.map((cat) => {
          const colors = getConceptCategoryColors(cat);
          return (
            <span key={cat} className="inline-flex items-center gap-1.5 text-[11px]">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: colors.border }}
              />
              <span style={{ color: colors.text }} className="font-medium">{cat}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
