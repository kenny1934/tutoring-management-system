"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStudents, usePageTitle } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenStudentList } from "@/components/zen/ZenStudentList";
import type { Student, StudentFilters } from "@/types";

const PAGE_SIZE = 50;

export default function ZenStudentsPage() {
  usePageTitle("Students - Zen Mode");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedLocation } = useLocation();
  const { setDisableSectionCycling } = useZenKeyboardFocus();

  // Disable global Tab section cycling — this page has its own focus zones
  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  // Filter state — initialize from URL params
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
  const [gradeFilter, setGradeFilter] = useState(searchParams.get("grade") || "");
  const [schoolFilter, setSchoolFilter] = useState(searchParams.get("school") || "");
  const [sortBy, setSortBy] = useState<string>("student_name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [filterFocused, setFilterFocused] = useState(false);

  // Build filters
  const filters: StudentFilters = useMemo(() => ({
    location: selectedLocation === "All Locations" ? undefined : selectedLocation,
    search: searchTerm || undefined,
    grade: gradeFilter || undefined,
    school: schoolFilter || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [selectedLocation, searchTerm, gradeFilter, schoolFilter, sortBy, sortOrder, page]);

  const { data: students, isLoading } = useStudents(filters);

  // Reset cursor when data changes
  useEffect(() => {
    setCursorIndex(0);
  }, [searchTerm, gradeFilter, schoolFilter, page]);

  const totalShown = students?.length ?? 0;
  const hasNextPage = totalShown === PAGE_SIZE;
  const hasPrevPage = page > 0;

  // Navigate to student detail
  const handleSelectStudent = useCallback(
    (student: Student) => {
      router.push(`/zen/students/${student.id}`);
      setZenStatus(`Opening ${student.student_name}`, "info");
    },
    [router]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        // Only handle Escape in filter mode
        if (e.key === "Escape") {
          e.preventDefault();
          (document.activeElement as HTMLElement)?.blur();
          setFilterFocused(false);
        }
        return;
      }

      switch (e.key) {
        case "f":
          e.preventDefault();
          setFilterFocused(true);
          // Focus the search input after render
          setTimeout(() => {
            const input = document.getElementById("zen-student-search");
            input?.focus();
          }, 0);
          break;

        case "]":
          e.preventDefault();
          if (hasNextPage) {
            setPage((p) => p + 1);
            setZenStatus(`Page ${page + 2}`, "info");
          }
          break;

        case "[":
          e.preventDefault();
          if (hasPrevPage) {
            setPage((p) => p - 1);
            setZenStatus(`Page ${page}`, "info");
          }
          break;

        case "S":
          if (e.shiftKey) {
            e.preventDefault();
            setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
            setZenStatus(`Sort: ${sortOrder === "asc" ? "descending" : "ascending"}`, "info");
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasNextPage, hasPrevPage, page, sortOrder]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setGradeFilter("");
    setSchoolFilter("");
    setPage(0);
    setZenStatus("Filters cleared", "info");
  }, []);

  const hasFilters = searchTerm || gradeFilter || schoolFilter;

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: "24px",
          borderBottom: "1px solid var(--zen-border)",
          paddingBottom: "8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1
          style={{
            fontSize: "16px",
            fontWeight: "bold",
            textTransform: "uppercase",
            color: "var(--zen-fg)",
            textShadow: "var(--zen-glow)",
            margin: 0,
          }}
        >
          STUDENTS
        </h1>
        <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>
          {isLoading ? "Loading..." : (
            <>
              Showing: <span style={{ color: "var(--zen-fg)" }}>{totalShown}</span>
              {page > 0 && (
                <span> (page {page + 1})</span>
              )}
            </>
          )}
        </span>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>Filter:</span>
        <input
          id="zen-student-search"
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(0);
          }}
          placeholder="Search name..."
          style={{
            backgroundColor: "transparent",
            border: "1px solid var(--zen-border)",
            color: "var(--zen-fg)",
            padding: "4px 8px",
            fontSize: "12px",
            fontFamily: "inherit",
            width: "160px",
            outline: "none",
          }}
          onFocus={() => setFilterFocused(true)}
          onBlur={() => setFilterFocused(false)}
        />
        <input
          type="text"
          value={gradeFilter}
          onChange={(e) => {
            setGradeFilter(e.target.value);
            setPage(0);
          }}
          placeholder="Grade..."
          style={{
            backgroundColor: "transparent",
            border: "1px solid var(--zen-border)",
            color: "var(--zen-fg)",
            padding: "4px 8px",
            fontSize: "12px",
            fontFamily: "inherit",
            width: "80px",
            outline: "none",
          }}
          onFocus={() => setFilterFocused(true)}
          onBlur={() => setFilterFocused(false)}
        />
        <input
          type="text"
          value={schoolFilter}
          onChange={(e) => {
            setSchoolFilter(e.target.value);
            setPage(0);
          }}
          placeholder="School..."
          style={{
            backgroundColor: "transparent",
            border: "1px solid var(--zen-border)",
            color: "var(--zen-fg)",
            padding: "4px 8px",
            fontSize: "12px",
            fontFamily: "inherit",
            width: "120px",
            outline: "none",
          }}
          onFocus={() => setFilterFocused(true)}
          onBlur={() => setFilterFocused(false)}
        />
        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              background: "none",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-dim)",
              padding: "4px 8px",
              fontSize: "11px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>
        {"─".repeat(60)}
      </div>

      {/* Student List */}
      {isLoading ? (
        <div style={{ color: "var(--zen-dim)" }}>Loading students...</div>
      ) : (
        <ZenStudentList
          students={students || []}
          cursorIndex={cursorIndex}
          onCursorMove={setCursorIndex}
          onSelect={handleSelectStudent}
          isFocused={!filterFocused}
          onFocus={() => setFilterFocused(false)}
        />
      )}

      {/* Pagination */}
      {(hasPrevPage || hasNextPage) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "16px",
            paddingTop: "8px",
            borderTop: "1px solid var(--zen-border)",
          }}
        >
          <button
            onClick={() => hasPrevPage && setPage((p) => p - 1)}
            disabled={!hasPrevPage}
            style={{
              background: "none",
              border: "none",
              color: hasPrevPage ? "var(--zen-accent)" : "var(--zen-dim)",
              cursor: hasPrevPage ? "pointer" : "default",
              fontFamily: "inherit",
              fontSize: "12px",
              opacity: hasPrevPage ? 1 : 0.4,
            }}
          >
            ← prev ([)
          </button>
          <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>
            Page {page + 1}
          </span>
          <button
            onClick={() => hasNextPage && setPage((p) => p + 1)}
            disabled={!hasNextPage}
            style={{
              background: "none",
              border: "none",
              color: hasNextPage ? "var(--zen-accent)" : "var(--zen-dim)",
              cursor: hasNextPage ? "pointer" : "default",
              fontFamily: "inherit",
              fontSize: "12px",
              opacity: hasNextPage ? 1 : 0.4,
            }}
          >
            next (]) →
          </button>
        </div>
      )}

      {/* Navigation hint */}
      <div
        style={{
          marginTop: "16px",
          paddingTop: "16px",
          borderTop: "1px solid var(--zen-border)",
          color: "var(--zen-dim)",
          fontSize: "12px",
        }}
      >
        <span style={{ color: "var(--zen-fg)" }}>j/k</span> navigate{" "}
        <span style={{ color: "var(--zen-fg)" }}>Enter</span> view{" "}
        <span style={{ color: "var(--zen-fg)" }}>f</span>=filter{" "}
        <span style={{ color: "var(--zen-fg)" }}>[</span>/<span style={{ color: "var(--zen-fg)" }}>]</span> page{" "}
        <span style={{ color: "var(--zen-fg)" }}>Shift+S</span> sort |{" "}
        <span style={{ color: "var(--zen-fg)" }}>?</span>=help
      </div>
    </div>
  );
}
