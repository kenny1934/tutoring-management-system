"use client";

import { Treemap, ResponsiveContainer } from "recharts";
import type { ConceptNode } from "@/types";
import { CONCEPT_CATEGORY_COLORS, getConceptCategoryColors } from "@/lib/progress-constants";

interface ReportConceptMapProps {
  data: ConceptNode[];
}

// Build a color lookup from category → colors, used by the renderer
type ColorMap = Map<string, { bg: string; border: string; text: string }>;

// Custom renderer — recharts spreads data props + layout props onto this
function TreemapCell(props: Record<string, unknown> & { colorMap?: ColorMap }) {
  const x = props.x as number;
  const y = props.y as number;
  const width = props.width as number;
  const height = props.height as number;
  const name = (props.name as string) || "";
  const count = (props.count as number) || 0;
  const category = (props.category as string) || "Other";
  const colorMap = props.colorMap as ColorMap | undefined;

  if (width < 4 || height < 4) return null;

  // Look up colors by category (avoids relying on recharts to pass custom fill props)
  const colors = colorMap?.get(category) || CONCEPT_CATEGORY_COLORS.Other;

  // Skip rendering parent group nodes (they have children but no count)
  const depth = props.depth as number;
  if (depth === 1) return null;

  const showLabel = width > 30 && height > 16;
  const fontSize = Math.min(12, Math.max(8, Math.min(width / 8, height / 3)));
  const maxChars = Math.max(3, Math.floor(width / (fontSize * 0.6)));

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={1}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 + (count > 1 && height > 30 ? -4 : 0)}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.text}
          fontSize={fontSize}
          fontWeight={600}
          stroke="none"
          style={{ textShadow: "none" }}
        >
          {name.length > maxChars ? name.slice(0, maxChars - 1) + "…" : name}
        </text>
      )}
      {showLabel && count > 1 && height > 30 && (
        <text
          x={x + width / 2}
          y={y + height / 2 + fontSize - 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.text}
          fontSize={9}
          opacity={0.6}
          stroke="none"
          style={{ textShadow: "none" }}
        >
          {count}×
        </text>
      )}
    </g>
  );
}

export function ReportConceptMap({ data }: ReportConceptMapProps) {
  if (data.length === 0) return null;

  // Build color lookup map
  const colorMap: ColorMap = new Map();
  const groups = new Map<string, ConceptNode[]>();
  for (const node of data) {
    const cat = node.category || "Other";
    if (!groups.has(cat)) {
      groups.set(cat, []);
      colorMap.set(cat, getConceptCategoryColors(cat));
    }
    groups.get(cat)!.push(node);
  }

  // Flat data with category field for color lookup in renderer
  const treemapData = [...groups.entries()].map(([category, nodes]) => ({
    name: category,
    children: [...nodes]
      .sort((a, b) => b.count - a.count)
      .map((node) => ({
        name: node.label,
        size: node.count,
        count: node.count,
        category,
      })),
  }));

  const categories = [...groups.keys()];

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Concepts Covered</h3>
      <ResponsiveContainer width="100%" height={220}>
        <Treemap
          data={treemapData}
          dataKey="size"
          content={<TreemapCell colorMap={colorMap} />}
          isAnimationActive={false}
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
                style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
              />
              <span style={{ color: colors.text }} className="font-medium">{cat}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
