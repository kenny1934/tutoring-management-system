"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { usePageTitle } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenSpinner } from "@/components/zen/ZenSpinner";
import { ZenEnrollmentDetail } from "@/components/zen/ZenEnrollmentDetail";
import { enrollmentsAPI } from "@/lib/api";
import { getDisplayPaymentStatus } from "@/lib/enrollment-utils";
import { formatShortDate } from "@/lib/formatters";
import { getTutorFirstName } from "@/components/zen/utils/sessionSorting";
import type { Enrollment } from "@/types";

const PAGE_SIZE = 50;

const PAYMENT_STATUSES = ["", "Pending Payment", "Paid", "Cancelled"] as const;
const PAYMENT_LABELS = ["All", "Pending", "Paid", "Cancelled"] as const;
const ENROLLMENT_TYPES = ["", "Regular", "Trial", "One-Time"] as const;
const TYPE_LABELS = ["All", "Regular", "Trial", "One-Time"] as const;

export default function ZenEnrollmentsPage() {
  usePageTitle("Enrollments - Zen Mode");
  const router = useRouter();
  const { selectedLocation } = useLocation();
  const { setDisableSectionCycling } = useZenKeyboardFocus();

  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentStatusIdx, setPaymentStatusIdx] = useState(0);
  const [typeIdx, setTypeIdx] = useState(0);
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [page, setPage] = useState(0);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [filterFocused, setFilterFocused] = useState(false);
  const [expandedEnrollmentId, setExpandedEnrollmentId] = useState<number | null>(null);

  const cursorRowRef = useRef<HTMLDivElement>(null);

  // Build API params
  const apiParams = useMemo(() => ({
    location: selectedLocation === "All Locations" ? undefined : selectedLocation,
    payment_status: PAYMENT_STATUSES[paymentStatusIdx] || undefined,
    enrollment_type: ENROLLMENT_TYPES[typeIdx] || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [selectedLocation, paymentStatusIdx, typeIdx, page]);

  const { data: enrollments, isLoading, mutate: mutateEnrollments } = useSWR(
    ["zen-enrollments", JSON.stringify(apiParams)],
    () => enrollmentsAPI.getAll(apiParams),
    { revalidateOnFocus: false }
  );

  // Client-side search filter
  const filteredEnrollments = useMemo(() => {
    if (!enrollments) return [];
    let list = [...enrollments];

    // Client-side name search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (e) =>
          e.student_name?.toLowerCase().includes(q) ||
          e.school_student_id?.toLowerCase().includes(q) ||
          e.tutor_name?.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortBy === "name") {
      list.sort((a, b) => (a.student_name || "").localeCompare(b.student_name || ""));
    } else {
      list.sort((a, b) => (b.first_lesson_date || "").localeCompare(a.first_lesson_date || ""));
    }

    return list;
  }, [enrollments, searchTerm, sortBy]);

  // Reset cursor when filters change
  useEffect(() => {
    setCursorIndex(0);
    setExpandedEnrollmentId(null);
  }, [searchTerm, paymentStatusIdx, typeIdx, page]);

  // Auto-scroll
  useEffect(() => {
    if (cursorRowRef.current) {
      cursorRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [cursorIndex]);

  const totalShown = filteredEnrollments.length;
  const hasNextPage = (enrollments?.length ?? 0) === PAGE_SIZE;
  const hasPrevPage = page > 0;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        if (e.key === "Escape") {
          e.preventDefault();
          (document.activeElement as HTMLElement)?.blur();
          setFilterFocused(false);
        }
        return;
      }

      // Don't handle nav keys when detail is expanded (ZenEnrollmentDetail handles its own)
      if (expandedEnrollmentId !== null) {
        return;
      }

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setCursorIndex((c) => Math.min(c + 1, totalShown - 1));
          break;

        case "k":
        case "ArrowUp":
          e.preventDefault();
          setCursorIndex((c) => Math.max(c - 1, 0));
          break;

        case "Enter":
          e.preventDefault();
          if (filteredEnrollments[cursorIndex]) {
            const enrollment = filteredEnrollments[cursorIndex];
            setExpandedEnrollmentId((prev) => prev === enrollment.id ? null : enrollment.id);
          }
          break;

        case "g":
          if (filteredEnrollments[cursorIndex]) {
            e.preventDefault();
            const enrollment = filteredEnrollments[cursorIndex];
            if (enrollment.student_id) {
              router.push(`/zen/students/${enrollment.student_id}`);
              setZenStatus(`Opening student ${enrollment.student_name}`, "info");
            }
          }
          break;

        case "f":
          e.preventDefault();
          setFilterFocused(true);
          setTimeout(() => {
            document.getElementById("zen-enrollment-search")?.focus();
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
            setSortBy((s) => s === "date" ? "name" : "date");
            setZenStatus(`Sort: ${sortBy === "date" ? "by name" : "by date"}`, "info");
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalShown, hasNextPage, hasPrevPage, page, sortBy, cursorIndex, filteredEnrollments, expandedEnrollmentId, router]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setPaymentStatusIdx(0);
    setTypeIdx(0);
    setPage(0);
    setZenStatus("Filters cleared", "info");
  }, []);

  const hasFilters = searchTerm || paymentStatusIdx > 0 || typeIdx > 0;

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
          ENROLLMENTS
        </h1>
        <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>
          {isLoading ? "Loading..." : (
            <>
              Showing: <span style={{ color: "var(--zen-fg)" }}>{totalShown}</span>
              {page > 0 && <span> (page {page + 1})</span>}
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
          id="zen-enrollment-search"
          type="text"
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
          placeholder="Search name/tutor..."
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
        {/* Payment status cycle */}
        <button
          onClick={() => setPaymentStatusIdx((i) => (i + 1) % PAYMENT_STATUSES.length)}
          style={{
            background: "none",
            border: "1px solid var(--zen-border)",
            color: paymentStatusIdx > 0 ? "var(--zen-accent)" : "var(--zen-dim)",
            padding: "4px 8px",
            fontSize: "12px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Status: {PAYMENT_LABELS[paymentStatusIdx]}
        </button>
        {/* Type cycle */}
        <button
          onClick={() => setTypeIdx((i) => (i + 1) % ENROLLMENT_TYPES.length)}
          style={{
            background: "none",
            border: "1px solid var(--zen-border)",
            color: typeIdx > 0 ? "var(--zen-accent)" : "var(--zen-dim)",
            padding: "4px 8px",
            fontSize: "12px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Type: {TYPE_LABELS[typeIdx]}
        </button>
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

      <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>{"─".repeat(60)}</div>

      {/* Enrollment List */}
      {isLoading ? (
        <div style={{ color: "var(--zen-dim)" }}><ZenSpinner /> Loading enrollments...</div>
      ) : filteredEnrollments.length === 0 ? (
        <div style={{ color: "var(--zen-dim)" }}>No enrollments found</div>
      ) : (
        <div>
          {filteredEnrollments.map((enrollment, idx) => {
            const isAtCursor = idx === cursorIndex;
            const paymentStatus = getDisplayPaymentStatus(enrollment);
            const statusColor = paymentStatus === "Paid"
              ? "var(--zen-success)"
              : paymentStatus === "Overdue"
              ? "var(--zen-error)"
              : paymentStatus === "Cancelled"
              ? "var(--zen-dim)"
              : "var(--zen-warning)";

            return (
              <React.Fragment key={enrollment.id}>
                <div
                  ref={isAtCursor ? cursorRowRef : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "3px 4px",
                    backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
                    borderLeft: isAtCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
                  }}
                >
                  <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
                    {isAtCursor ? ">" : " "}
                  </span>
                  <span style={{ width: "50px", color: "var(--zen-dim)", fontSize: "12px" }}>
                    #{enrollment.id}
                  </span>
                  <span style={{ width: "50px", color: enrollment.enrollment_type === "Trial" ? "var(--zen-warning)" : "var(--zen-dim)", fontSize: "11px" }}>
                    {enrollment.enrollment_type || "Regular"}
                  </span>
                  <span style={{
                    color: "var(--zen-fg)", fontSize: "12px", minWidth: "120px", maxWidth: "120px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {enrollment.student_name || "—"}
                  </span>
                  <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "110px" }}>
                    {enrollment.assigned_day ? `${enrollment.assigned_day} ${enrollment.assigned_time || ""}` : "—"}
                  </span>
                  <span style={{ color: "var(--zen-dim)", fontSize: "11px", width: "40px" }}>
                    {enrollment.location || "—"}
                  </span>
                  <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "80px", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {enrollment.tutor_name ? getTutorFirstName(enrollment.tutor_name) : "—"}
                  </span>
                  <span style={{ color: statusColor, fontSize: "11px", minWidth: "70px" }}>
                    {paymentStatus}
                  </span>
                  <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
                    {enrollment.first_lesson_date ? formatShortDate(enrollment.first_lesson_date) : "—"}
                    {enrollment.effective_end_date && ` → ${formatShortDate(enrollment.effective_end_date)}`}
                  </span>
                  <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
                    {enrollment.lessons_paid ? `${enrollment.lessons_paid}L` : ""}
                  </span>
                </div>
                {expandedEnrollmentId === enrollment.id && (
                  <ZenEnrollmentDetail
                    enrollmentId={enrollment.id}
                    enrollment={enrollment}
                    onClose={() => setExpandedEnrollmentId(null)}
                    onRefresh={() => mutateEnrollments()}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
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
              background: "none", border: "none",
              color: hasPrevPage ? "var(--zen-accent)" : "var(--zen-dim)",
              cursor: hasPrevPage ? "pointer" : "default",
              fontFamily: "inherit", fontSize: "12px",
              opacity: hasPrevPage ? 1 : 0.4,
            }}
          >
            ← prev ([)
          </button>
          <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>Page {page + 1}</span>
          <button
            onClick={() => hasNextPage && setPage((p) => p + 1)}
            disabled={!hasNextPage}
            style={{
              background: "none", border: "none",
              color: hasNextPage ? "var(--zen-accent)" : "var(--zen-dim)",
              cursor: hasNextPage ? "pointer" : "default",
              fontFamily: "inherit", fontSize: "12px",
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
        {expandedEnrollmentId !== null ? (
          <>
            <span style={{ color: "var(--zen-fg)" }}>p</span>=pay{" "}
            <span style={{ color: "var(--zen-fg)" }}>m</span>=mark sent{" "}
            <span style={{ color: "var(--zen-fg)" }}>f</span>=fee msg{" "}
            <span style={{ color: "var(--zen-fg)" }}>x</span>=cancel |{" "}
            <span style={{ color: "var(--zen-fg)" }}>Esc</span> close
          </>
        ) : (
          <>
            <span style={{ color: "var(--zen-fg)" }}>j/k</span> navigate{" "}
            <span style={{ color: "var(--zen-fg)" }}>Enter</span> detail{" "}
            <span style={{ color: "var(--zen-fg)" }}>g</span>=student{" "}
            <span style={{ color: "var(--zen-fg)" }}>f</span>=filter{" "}
            <span style={{ color: "var(--zen-fg)" }}>[</span>/<span style={{ color: "var(--zen-fg)" }}>]</span> page{" "}
            <span style={{ color: "var(--zen-fg)" }}>Shift+S</span> sort |{" "}
            <span style={{ color: "var(--zen-fg)" }}>?</span>=help
          </>
        )}
      </div>
    </div>
  );
}
