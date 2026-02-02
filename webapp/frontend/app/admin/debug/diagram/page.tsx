"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { SuperAdminPageGuard } from "@/components/auth/SuperAdminPageGuard";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { debugAPI } from "@/lib/api";
import { usePageTitle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { DebugTable, DebugTableSchema } from "@/types/debug";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  GitBranch,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MousePointer,
} from "lucide-react";

// Node dimensions
const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const NODE_PADDING = 40;
const ROW_GAP = 100;

// Priority group colors
const PRIORITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  priority: { bg: "#fef2f2", border: "#ef4444", text: "#dc2626" },
  reference: { bg: "#fffbeb", border: "#f59e0b", text: "#d97706" },
  supporting: { bg: "#eff6ff", border: "#3b82f6", text: "#2563eb" },
  other: { bg: "#f9fafb", border: "#9ca3af", text: "#6b7280" },
};

const PRIORITY_COLORS_DARK: Record<string, { bg: string; border: string; text: string }> = {
  priority: { bg: "#450a0a", border: "#ef4444", text: "#fca5a5" },
  reference: { bg: "#451a03", border: "#f59e0b", text: "#fcd34d" },
  supporting: { bg: "#1e3a5f", border: "#3b82f6", text: "#93c5fd" },
  other: { bg: "#1f2937", border: "#6b7280", text: "#9ca3af" },
};

function getPriorityGroup(priority: number): string {
  if (priority < 10) return "priority";
  if (priority < 20) return "reference";
  if (priority < 30) return "supporting";
  return "other";
}

interface TableNode {
  id: string;
  displayName: string;
  priority: number;
  x: number;
  y: number;
  fkCount: number;
  referencedBy: string[];
}

interface Relationship {
  from: string;
  to: string;
  column: string;
}

export default function DiagramPage() {
  usePageTitle("Table Relationships");
  const router = useRouter();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Fetch all tables
  const { data: tables, isLoading: tablesLoading } = useSWR<DebugTable[]>(
    "debug-tables",
    () => debugAPI.getTables()
  );

  // Fetch all schemas to get FK relationships
  const { data: schemas, isLoading: schemasLoading } = useSWR<Record<string, DebugTableSchema>>(
    tables ? "debug-all-schemas" : null,
    async () => {
      if (!tables) return {};
      const schemaMap: Record<string, DebugTableSchema> = {};
      await Promise.all(
        tables.map(async (t) => {
          try {
            const schema = await debugAPI.getTableSchema(t.name);
            schemaMap[t.name] = schema;
          } catch {
            // Skip tables that fail to load schema
          }
        })
      );
      return schemaMap;
    },
    { revalidateOnFocus: false }
  );

  const isLoading = tablesLoading || schemasLoading;

  // Build graph data
  const { nodes, relationships, svgWidth, svgHeight } = useMemo(() => {
    if (!tables || !schemas) {
      return { nodes: [], relationships: [], svgWidth: 800, svgHeight: 600 };
    }

    // Group tables by priority
    const groups: Record<string, DebugTable[]> = {
      priority: [],
      reference: [],
      supporting: [],
      other: [],
    };

    tables.forEach((t) => {
      const group = getPriorityGroup(t.priority);
      groups[group].push(t);
    });

    // Sort each group by name
    Object.values(groups).forEach((g) => g.sort((a, b) => a.display_name.localeCompare(b.display_name)));

    // Calculate positions
    const nodeMap: Record<string, TableNode> = {};
    let y = NODE_PADDING;
    const maxNodesPerRow = 5;

    Object.entries(groups).forEach(([, groupTables]) => {
      if (groupTables.length === 0) return;

      const rows = Math.ceil(groupTables.length / maxNodesPerRow);
      for (let row = 0; row < rows; row++) {
        const rowTables = groupTables.slice(row * maxNodesPerRow, (row + 1) * maxNodesPerRow);
        const rowWidth = rowTables.length * (NODE_WIDTH + NODE_PADDING) - NODE_PADDING;
        const startX = NODE_PADDING;

        rowTables.forEach((t, i) => {
          const schema = schemas[t.name];
          const fkCount = schema ? Object.keys(schema.foreign_keys || {}).length : 0;

          nodeMap[t.name] = {
            id: t.name,
            displayName: t.display_name,
            priority: t.priority,
            x: startX + i * (NODE_WIDTH + NODE_PADDING),
            y,
            fkCount,
            referencedBy: [],
          };
        });

        y += NODE_HEIGHT + ROW_GAP;
      }
    });

    // Build relationships and track incoming references
    const rels: Relationship[] = [];
    Object.entries(schemas).forEach(([tableName, schema]) => {
      if (!schema.foreign_keys) return;
      Object.entries(schema.foreign_keys).forEach(([column, fk]) => {
        if (nodeMap[fk.table]) {
          rels.push({ from: tableName, to: fk.table, column });
          nodeMap[fk.table].referencedBy.push(tableName);
        }
      });
    });

    // Calculate SVG dimensions
    const allNodes = Object.values(nodeMap);
    const maxX = Math.max(...allNodes.map((n) => n.x + NODE_WIDTH)) + NODE_PADDING;
    const maxY = Math.max(...allNodes.map((n) => n.y + NODE_HEIGHT)) + NODE_PADDING;

    return {
      nodes: allNodes,
      relationships: rels,
      svgWidth: Math.max(maxX, 800),
      svgHeight: Math.max(maxY, 600),
    };
  }, [tables, schemas]);

  // Get connected tables for highlighting
  const connectedTables = useMemo(() => {
    const target = hoveredTable || selectedTable;
    if (!target) return new Set<string>();

    const connected = new Set<string>([target]);
    relationships.forEach((r) => {
      if (r.from === target || r.to === target) {
        connected.add(r.from);
        connected.add(r.to);
      }
    });
    return connected;
  }, [hoveredTable, selectedTable, relationships]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.2, 2)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.2, 0.4)), []);
  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Wheel zoom
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.max(0.4, Math.min(2, z + delta)));
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  // Calculate edge path with curve
  const getEdgePath = useCallback((from: TableNode, to: TableNode) => {
    const fromX = from.x + NODE_WIDTH / 2;
    const fromY = from.y + NODE_HEIGHT;
    const toX = to.x + NODE_WIDTH / 2;
    const toY = to.y;

    // If same row, curve around
    if (Math.abs(from.y - to.y) < NODE_HEIGHT) {
      const midY = Math.min(from.y, to.y) - 30;
      return `M ${fromX} ${from.y} Q ${fromX} ${midY} ${(fromX + toX) / 2} ${midY} Q ${toX} ${midY} ${toX} ${to.y}`;
    }

    // Vertical with curve
    const midY = (fromY + toY) / 2;
    return `M ${fromX} ${fromY} C ${fromX} ${midY} ${toX} ${midY} ${toX} ${toY}`;
  }, []);

  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");
  const colors = isDark ? PRIORITY_COLORS_DARK : PRIORITY_COLORS;

  return (
    <SuperAdminPageGuard>
      <DeskSurface fullHeight>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex-shrink-0 desk-background border-b border-[#6b5a4a]/30">
            <div className="p-4 sm:px-6 sm:py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Link
                    href="/admin/debug"
                    className="p-2 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors"
                    aria-label="Back to debug panel"
                  >
                    <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" aria-hidden="true" />
                  </Link>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <GitBranch className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    </div>
                    <div>
                      <h1 className="text-lg sm:text-2xl font-bold text-white">
                        Table Relationships
                      </h1>
                      <p className="hidden sm:block text-sm text-white/70">
                        Foreign key diagram • {nodes.length} tables • {relationships.length} relationships
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle compact />
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="mx-4 sm:mx-6 mb-4 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleZoomOut}
                  className="p-2 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                  title="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={handleZoomIn}
                  className="p-2 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                  title="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  onClick={handleResetView}
                  className="p-2 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                  title="Reset view"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: PRIORITY_COLORS.priority.border }} />
                  <span className="text-gray-600 dark:text-gray-400">Priority</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: PRIORITY_COLORS.reference.border }} />
                  <span className="text-gray-600 dark:text-gray-400">Reference</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: PRIORITY_COLORS.supporting.border }} />
                  <span className="text-gray-600 dark:text-gray-400">Supporting</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: PRIORITY_COLORS.other.border }} />
                  <span className="text-gray-600 dark:text-gray-400">Other</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-400">
                <MousePointer className="h-3 w-3" />
                <span>Click table to browse • Drag to pan • Scroll to zoom</span>
              </div>
            </div>
          </div>

          {/* Diagram */}
          <div className="flex-1 min-h-0 overflow-hidden bg-[#faf6f0] dark:bg-[#1a1814]">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[#a0704b] mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Loading table schemas...</p>
                </div>
              </div>
            ) : nodes.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No tables found</p>
                </div>
              </div>
            ) : (
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                className="cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Arrows marker */}
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill={isDark ? "#6b7280" : "#9ca3af"}
                      />
                    </marker>
                    <marker
                      id="arrowhead-highlight"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="#a0704b"
                      />
                    </marker>
                  </defs>

                  {/* Edges */}
                  {relationships.map((rel, i) => {
                    const fromNode = nodes.find((n) => n.id === rel.from);
                    const toNode = nodes.find((n) => n.id === rel.to);
                    if (!fromNode || !toNode) return null;

                    const isHighlighted =
                      connectedTables.has(rel.from) && connectedTables.has(rel.to) &&
                      (hoveredTable || selectedTable);
                    const isActive = hoveredTable === rel.from || hoveredTable === rel.to ||
                      selectedTable === rel.from || selectedTable === rel.to;

                    return (
                      <path
                        key={`${rel.from}-${rel.to}-${rel.column}-${i}`}
                        d={getEdgePath(fromNode, toNode)}
                        fill="none"
                        stroke={isHighlighted ? "#a0704b" : isDark ? "#4b5563" : "#d1d5db"}
                        strokeWidth={isHighlighted ? 2 : 1}
                        strokeOpacity={isActive || !hoveredTable && !selectedTable ? 1 : 0.3}
                        markerEnd={isHighlighted ? "url(#arrowhead-highlight)" : "url(#arrowhead)"}
                        className="transition-all duration-200"
                      />
                    );
                  })}

                  {/* Nodes */}
                  {nodes.map((node) => {
                    const group = getPriorityGroup(node.priority);
                    const color = colors[group];
                    const isHighlighted = connectedTables.has(node.id);
                    const isHovered = hoveredTable === node.id;
                    const isSelected = selectedTable === node.id;
                    const shouldDim = (hoveredTable || selectedTable) && !isHighlighted;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredTable(node.id)}
                        onMouseLeave={() => setHoveredTable(null)}
                        onClick={() => router.push(`/admin/debug/${node.id}`)}
                        opacity={shouldDim ? 0.3 : 1}
                      >
                        {/* Node background */}
                        <rect
                          width={NODE_WIDTH}
                          height={NODE_HEIGHT}
                          rx={8}
                          fill={color.bg}
                          stroke={isHovered || isSelected ? "#a0704b" : color.border}
                          strokeWidth={isHovered || isSelected ? 2 : 1}
                          className="transition-all duration-200"
                        />

                        {/* Priority indicator */}
                        <rect
                          x={0}
                          y={0}
                          width={4}
                          height={NODE_HEIGHT}
                          rx={2}
                          fill={color.border}
                        />

                        {/* Table name */}
                        <text
                          x={NODE_WIDTH / 2 + 2}
                          y={NODE_HEIGHT / 2 - 6}
                          textAnchor="middle"
                          fill={color.text}
                          fontSize={12}
                          fontWeight={600}
                          className="select-none"
                        >
                          {node.displayName.length > 16
                            ? node.displayName.slice(0, 14) + "..."
                            : node.displayName}
                        </text>

                        {/* FK count */}
                        <text
                          x={NODE_WIDTH / 2 + 2}
                          y={NODE_HEIGHT / 2 + 12}
                          textAnchor="middle"
                          fill={isDark ? "#9ca3af" : "#6b7280"}
                          fontSize={10}
                          className="select-none"
                        >
                          {node.fkCount} FK{node.fkCount !== 1 ? "s" : ""} • {node.referencedBy.length} ref
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}
          </div>
        </div>
      </DeskSurface>
    </SuperAdminPageGuard>
  );
}
