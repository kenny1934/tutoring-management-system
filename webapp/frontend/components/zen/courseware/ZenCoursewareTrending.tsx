"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCoursewarePopularity, useCoursewareUsageDetail } from "@/lib/hooks";
import { paperlessAPI, type PaperlessDocument } from "@/lib/api";
import { formatTimeAgo } from "@/lib/formatters";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import type { PreviewFile } from "./ZenCoursewarePreview";

interface ZenCoursewareTrendingProps {
  isActive: boolean;
  onSelectFile: (file: PreviewFile) => void;
  onAssignFile: (path: string, title: string) => void;
}

type TimeRange = "recent" | "all-time";
type ExerciseFilter = "" | "Classwork" | "Homework";

export function ZenCoursewareTrending({
  isActive,
  onSelectFile,
  onAssignFile,
}: ZenCoursewareTrendingProps) {
  const [cursor, setCursor] = useState(0);
  const [timeRange, setTimeRange] = useState<TimeRange>("recent");
  const [exerciseFilter, setExerciseFilter] = useState<ExerciseFilter>("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Cache for resolved Paperless IDs (refs to avoid keyboard handler re-registration)
  const paperlessCacheRef = useRef<Map<string, PaperlessDocument>>(new Map());
  const resolvingRef = useRef<Set<string>>(new Set());

  const { data: trendingData, isLoading } = useCoursewarePopularity(
    timeRange,
    exerciseFilter || undefined,
    gradeFilter || undefined,
    undefined
  );

  const { data: usageDetails } = useCoursewareUsageDetail(
    expandedItem || undefined,
    timeRange,
    5,
    exerciseFilter || undefined,
    gradeFilter || undefined,
    undefined
  );

  const items = trendingData || [];

  // Auto-scroll cursor into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursor]);

  // Resolve Paperless document for preview
  const resolveAndPreview = useCallback(async (filename: string, path: string) => {
    // Check cache
    const cached = paperlessCacheRef.current.get(filename);
    if (cached) {
      onSelectFile({
        documentId: cached.id,
        path: cached.original_path || cached.converted_path || path,
        title: filename,
      });
      return;
    }

    if (resolvingRef.current.has(filename)) return;
    resolvingRef.current.add(filename);
    setZenStatus("Resolving file in Paperless...", "info");

    try {
      const response = await paperlessAPI.search(path, 3, "all");
      if (response.results.length > 0) {
        const doc = response.results[0];
        paperlessCacheRef.current.set(filename, doc);
        onSelectFile({
          documentId: doc.id,
          path: doc.original_path || doc.converted_path || path,
          title: filename,
        });
        setZenStatus("", "info");
      } else {
        setZenStatus("File not found in Paperless", "warning");
      }
    } catch {
      setZenStatus("Failed to resolve file", "error");
    } finally {
      resolvingRef.current.delete(filename);
    }
  }, [onSelectFile]);

  // Keyboard handler
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor((prev) => Math.min(prev + 1, items.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          e.stopImmediatePropagation();
          const item = items[cursor];
          if (item) {
            const path = item.normalized_paths.split(",")[0]?.trim() || "";
            resolveAndPreview(item.filename, path);
          }
          break;
        }
        case "i":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (items[cursor]) {
            setExpandedItem((prev) =>
              prev === items[cursor].filename ? null : items[cursor].filename
            );
          }
          break;
        case "f":
          e.preventDefault();
          e.stopImmediatePropagation();
          setShowFilters((prev) => !prev);
          break;
        case "t":
          e.preventDefault();
          e.stopImmediatePropagation();
          setTimeRange((prev) => (prev === "recent" ? "all-time" : "recent"));
          break;
        case "a": {
          e.preventDefault();
          e.stopImmediatePropagation();
          const item = items[cursor];
          if (item) {
            const path = item.normalized_paths.split(",")[0]?.trim() || "";
            onAssignFile(path, item.filename);
          }
          break;
        }
        case "g":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor(0);
          break;
        case "G":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor(Math.max(0, items.length - 1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isActive, items, cursor, resolveAndPreview, onAssignFile]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Filter bar */}
      <div
        style={{
          padding: "6px 8px",
          borderBottom: "1px solid var(--zen-border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "11px",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "var(--zen-accent)", fontWeight: "bold" }}>TRENDING</span>

        {/* Time range toggle */}
        <button
          onClick={() => setTimeRange((prev) => (prev === "recent" ? "all-time" : "recent"))}
          style={{
            padding: "1px 6px",
            backgroundColor: timeRange === "recent" ? "var(--zen-accent)" : "transparent",
            color: timeRange === "recent" ? "var(--zen-bg)" : "var(--zen-fg)",
            border: "1px solid var(--zen-border)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "10px",
          }}
        >
          {timeRange === "recent" ? "14d" : "all"}
        </button>

        <button
          onClick={() => setShowFilters((prev) => !prev)}
          style={{
            padding: "1px 6px",
            backgroundColor: showFilters ? "var(--zen-accent)" : "transparent",
            color: showFilters ? "var(--zen-bg)" : "var(--zen-dim)",
            border: "1px solid var(--zen-border)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "10px",
          }}
        >
          [f]ilter
        </button>

        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
          {items.length} items
        </span>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div
          style={{
            padding: "4px 8px",
            borderBottom: "1px solid var(--zen-border)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "10px",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "var(--zen-dim)" }}>Type:</span>
          {(["", "Classwork", "Homework"] as ExerciseFilter[]).map((type) => (
            <button
              key={type || "all"}
              onClick={() => setExerciseFilter(type)}
              style={{
                padding: "1px 6px",
                backgroundColor: exerciseFilter === type ? "var(--zen-accent)" : "transparent",
                color: exerciseFilter === type ? "var(--zen-bg)" : "var(--zen-fg)",
                border: "1px solid var(--zen-border)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "10px",
              }}
            >
              {type || "All"}
            </button>
          ))}

          <span style={{ color: "var(--zen-dim)", marginLeft: "8px" }}>Grade:</span>
          <input
            type="text"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            placeholder="e.g. F3"
            style={{
              width: "50px",
              backgroundColor: "var(--zen-bg)",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-fg)",
              padding: "1px 4px",
              fontFamily: "inherit",
              fontSize: "10px",
            }}
          />
        </div>
      )}

      {/* List */}
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {isLoading && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            Loading trending data...
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            No courseware data found
          </div>
        )}

        {/* Column header */}
        {items.length > 0 && (
          <div
            style={{
              display: "flex",
              padding: "2px 8px",
              fontSize: "10px",
              color: "var(--zen-dim)",
              borderBottom: "1px solid var(--zen-border)",
              gap: "8px",
            }}
          >
            <span style={{ width: "24px", textAlign: "right" }}>#</span>
            <span style={{ flex: 1 }}>FILE</span>
            <span style={{ width: "40px", textAlign: "right" }}>USES</span>
            <span style={{ width: "40px", textAlign: "right" }}>STUDS</span>
            <span style={{ width: "60px", textAlign: "right" }}>LAST</span>
          </div>
        )}

        {items.map((item, index) => {
          const isSelected = index === cursor;
          const isExpanded = expandedItem === item.filename;
          return (
            <div key={item.filename} data-selected={isSelected}>
              <div
                onClick={() => {
                  setCursor(index);
                  const path = item.normalized_paths.split(",")[0]?.trim() || "";
                  resolveAndPreview(item.filename, path);
                }}
                style={{
                  display: "flex",
                  padding: "3px 8px",
                  fontSize: "11px",
                  gap: "8px",
                  cursor: "pointer",
                  backgroundColor: isSelected ? "var(--zen-accent)" : "transparent",
                  color: isSelected ? "var(--zen-bg)" : "var(--zen-fg)",
                  borderLeft: isSelected ? "2px solid var(--zen-accent)" : "2px solid transparent",
                }}
              >
                <span style={{ width: "24px", textAlign: "right", color: isSelected ? "var(--zen-bg)" : "var(--zen-dim)" }}>
                  {index + 1}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={item.filename}
                >
                  {item.filename}
                </span>
                <span style={{ width: "40px", textAlign: "right" }}>
                  {item.assignment_count}
                </span>
                <span style={{ width: "40px", textAlign: "right" }}>
                  {item.unique_student_count}
                </span>
                <span style={{ width: "60px", textAlign: "right", fontSize: "10px" }}>
                  {item.latest_use ? formatTimeAgo(item.latest_use) : "-"}
                </span>
              </div>

              {/* Expanded usage detail */}
              {isExpanded && (
                <div
                  style={{
                    padding: "4px 8px 4px 42px",
                    fontSize: "10px",
                    borderBottom: "1px solid var(--zen-border)",
                    backgroundColor: "rgba(var(--zen-accent-rgb, 0,0,0), 0.05)",
                  }}
                >
                  <div style={{ color: "var(--zen-dim)", marginBottom: "4px" }}>
                    Path: {item.normalized_paths.split(",")[0]?.trim() || "—"}
                  </div>
                  <div style={{ color: "var(--zen-dim)", marginBottom: "4px" }}>
                    Used by: {item.used_by || "—"}
                  </div>
                  {usageDetails && usageDetails.length > 0 && (
                    <div style={{ marginTop: "4px" }}>
                      <div style={{ color: "var(--zen-accent)", marginBottom: "2px" }}>
                        Recent assignments:
                      </div>
                      {usageDetails.map((detail, i) => (
                        <div key={i} style={{ color: "var(--zen-fg)", marginBottom: "1px" }}>
                          • {detail.exercise_type} — Session #{detail.session_id}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hints */}
      <div
        style={{
          padding: "4px 8px",
          borderTop: "1px solid var(--zen-border)",
          fontSize: "10px",
          color: "var(--zen-dim)",
          flexShrink: 0,
        }}
      >
        j/k nav • Enter preview • [i]nfo • [f]ilter • [t]ime • [a]ssign • g/G top/end
      </div>
    </div>
  );
}
