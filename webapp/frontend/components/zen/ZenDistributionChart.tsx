"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import type { Enrollment } from "@/types";

interface ChartData {
  name: string;
  value: number;
  percent: number;
}

interface ZenDistributionChartProps {
  type: "grade" | "school";
  maxBars?: number;
  /** Whether this chart is the active one when distribution section is focused */
  isActive?: boolean;
}

// ASCII bar characters
const FILLED = "█";
const EMPTY = "░";
const BAR_WIDTH = 20;

function ZenBarChart({
  data,
  onItemClick,
  isLoading,
  cursorIndex,
  hasCursor,
  cursorRowRef,
}: {
  data: ChartData[];
  onItemClick?: (name: string) => void;
  isLoading?: boolean;
  cursorIndex?: number;
  hasCursor?: boolean;
  cursorRowRef?: React.RefObject<HTMLDivElement>;
}) {
  if (isLoading) {
    return (
      <div style={{ color: "var(--zen-dim)" }}>
        Loading...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ color: "var(--zen-dim)" }}>
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div style={{ fontFamily: "monospace", fontSize: "12px" }}>
      {data.map((item, idx) => {
        const filledCount = maxValue > 0 ? Math.round((item.value / maxValue) * BAR_WIDTH) : 0;
        const emptyCount = BAR_WIDTH - filledCount;
        const bar = FILLED.repeat(filledCount) + EMPTY.repeat(emptyCount);
        const isAtCursor = hasCursor && idx === cursorIndex;

        return (
          <div
            key={idx}
            ref={isAtCursor ? cursorRowRef : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "2px 4px",
              cursor: onItemClick ? "pointer" : "default",
              backgroundColor: isAtCursor ? "var(--zen-border)" : "transparent",
              borderLeft: isAtCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
            }}
            onClick={() => onItemClick?.(item.name)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onItemClick) {
                onItemClick(item.name);
              }
            }}
            tabIndex={onItemClick ? 0 : -1}
            role={onItemClick ? "button" : undefined}
          >
            {/* Label - fixed width */}
            <span
              style={{
                width: "80px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--zen-fg)",
              }}
              title={item.name}
            >
              {item.name.length > 10 ? item.name.slice(0, 9) + "…" : item.name}
            </span>

            {/* Bar */}
            <span style={{ color: "var(--zen-accent)" }}>{bar}</span>

            {/* Stats */}
            <span style={{ color: "var(--zen-dim)", minWidth: "70px" }}>
              {item.percent.toFixed(0)}% ({item.value})
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ZenDistributionChart({ type, maxBars = 6, isActive = false }: ZenDistributionChartProps) {
  const router = useRouter();
  const { selectedLocation } = useLocation();
  const { isFocused } = useZenKeyboardFocus();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursorIndex, setCursorIndex] = useState(0);
  const cursorRowRef = useRef<HTMLDivElement>(null);

  const sectionFocused = isFocused("distribution");
  const hasCursor = sectionFocused && isActive;

  useEffect(() => {
    async function fetchEnrollments() {
      try {
        setLoading(true);
        const data = await api.enrollments.getActive(
          selectedLocation === "All Locations" ? undefined : selectedLocation
        );
        setEnrollments(data);
      } catch (err) {
        // Failed to load enrollments silently
      } finally {
        setLoading(false);
      }
    }

    fetchEnrollments();
  }, [selectedLocation]);

  const chartData = useMemo((): ChartData[] => {
    if (type === "grade") {
      // Grade distribution
      const gradeCounts: Record<string, number> = {};
      enrollments.forEach((enrollment) => {
        const grade = enrollment.grade || "Unknown";
        gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
      });

      const total = enrollments.length;
      const gradeOrder = ["F1", "F2", "F3", "F4", "F5", "F6", "Unknown"];

      return Object.entries(gradeCounts)
        .map(([name, value]) => ({
          name,
          value,
          percent: total > 0 ? (value / total) * 100 : 0,
        }))
        .sort((a, b) => gradeOrder.indexOf(a.name) - gradeOrder.indexOf(b.name));
    } else {
      // School distribution
      const schoolCounts: Record<string, number> = {};
      enrollments.forEach((enrollment) => {
        const school = enrollment.school || "Unknown";
        schoolCounts[school] = (schoolCounts[school] || 0) + 1;
      });

      const total = enrollments.length;
      const sorted = Object.entries(schoolCounts)
        .map(([name, value]) => ({
          name,
          value,
          percent: total > 0 ? (value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);

      // Group into top N and "Others"
      if (sorted.length <= maxBars) return sorted;

      const topItems = sorted.slice(0, maxBars - 1);
      const othersValue = sorted.slice(maxBars - 1).reduce((sum, s) => sum + s.value, 0);
      const othersPercent = total > 0 ? (othersValue / total) * 100 : 0;

      return [...topItems, { name: "Others", value: othersValue, percent: othersPercent }];
    }
  }, [enrollments, type, maxBars]);

  const handleClick = useCallback((name: string) => {
    if (name === "Unknown" || name === "Others") return;

    if (type === "grade") {
      router.push(`/zen/students?grade=${encodeURIComponent(name)}`);
    } else {
      router.push(`/zen/students?school=${encodeURIComponent(name)}`);
    }
  }, [type, router]);

  // Reset cursor when chart data changes
  useEffect(() => {
    setCursorIndex(0);
  }, [chartData]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only handle if not in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Only handle if this chart is focused and active
      if (!hasCursor) {
        return;
      }

      const key = e.key.toLowerCase();

      switch (key) {
        case "j":
        case "arrowdown":
          e.preventDefault();
          if (cursorIndex < chartData.length - 1) {
            setCursorIndex(cursorIndex + 1);
          }
          break;
        case "k":
        case "arrowup":
          e.preventDefault();
          if (cursorIndex > 0) {
            setCursorIndex(cursorIndex - 1);
          }
          break;
        case "enter":
          e.preventDefault();
          const currentItem = chartData[cursorIndex];
          if (currentItem) {
            handleClick(currentItem.name);
          }
          break;
        case "g":
          e.preventDefault();
          setCursorIndex(0);
          break;
        case "home":
          e.preventDefault();
          setCursorIndex(0);
          break;
        case "end":
          e.preventDefault();
          setCursorIndex(chartData.length - 1);
          break;
      }

      // Shift+G for last item
      if (e.key === "G" && e.shiftKey) {
        e.preventDefault();
        setCursorIndex(chartData.length - 1);
      }
    },
    [cursorIndex, chartData, hasCursor, handleClick]
  );

  // Register global keyboard handler
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (cursorRowRef.current && hasCursor) {
      cursorRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [cursorIndex, hasCursor]);

  const title = type === "grade" ? "GRADE DISTRIBUTION" : "SCHOOL DISTRIBUTION";

  // Show focus indicator when this section is focused and this chart is active
  const showFocusIndicator = sectionFocused && isActive;

  return (
    <div
      style={{
        padding: "4px",
        border: showFocusIndicator
          ? "1px solid var(--zen-accent)"
          : "1px solid transparent",
        boxShadow: showFocusIndicator ? "var(--zen-glow)" : "none",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      <h3
        style={{
          fontSize: "14px",
          fontWeight: "bold",
          color: "var(--zen-accent)",
          marginBottom: "8px",
          textShadow: "var(--zen-glow)",
        }}
      >
        {title}
        {showFocusIndicator && (
          <span style={{ color: "var(--zen-dim)", fontSize: "10px", marginLeft: "8px" }}>
            j/k ↑↓ • h/l ←→
          </span>
        )}
      </h3>
      <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>
        {"─".repeat(18)}
      </div>
      <ZenBarChart
        data={chartData}
        onItemClick={handleClick}
        isLoading={loading}
        cursorIndex={cursorIndex}
        hasCursor={hasCursor}
        cursorRowRef={cursorRowRef}
      />
    </div>
  );
}
