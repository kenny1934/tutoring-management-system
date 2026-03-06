"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useStudent, useStudentEnrollments, useStudentSessions, usePageTitle } from "@/lib/hooks";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenSpinner } from "@/components/zen/ZenSpinner";
import { ZenEnrollmentDetail } from "@/components/zen/ZenEnrollmentDetail";
import { getDisplayPaymentStatus } from "@/lib/enrollment-utils";
import { getGradeColor } from "@/lib/constants";
import { formatShortDate } from "@/lib/formatters";
import { getStatusChar, getStatusColor, getShortStatus, getTutorFirstName } from "@/components/zen/utils/sessionSorting";
import type { Enrollment, Session } from "@/types";

type Tab = "info" | "enrollments" | "sessions";

export default function ZenStudentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const { setDisableSectionCycling } = useZenKeyboardFocus();

  // Disable global Tab section cycling
  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  const { data: student, isLoading: studentLoading } = useStudent(id);
  const { data: enrollments, isLoading: enrollmentsLoading, mutate: mutateEnrollments } = useStudentEnrollments(id);
  const { data: sessions, isLoading: sessionsLoading } = useStudentSessions(id, 50);

  usePageTitle(student ? `${student.student_name} - Zen Mode` : "Student - Zen Mode");

  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [enrollmentCursor, setEnrollmentCursor] = useState(0);
  const [sessionCursor, setSessionCursor] = useState(0);
  const [expandedEnrollmentId, setExpandedEnrollmentId] = useState<number | null>(null);

  // Sorted sessions (most recent first)
  const sortedSessions = useMemo(
    () => [...(sessions || [])].sort((a, b) => b.session_date.localeCompare(a.session_date)),
    [sessions]
  );

  // Sorted enrollments (most recent first)
  const sortedEnrollments = useMemo(
    () => [...(enrollments || [])].sort((a, b) => {
      const dateA = a.first_lesson_date || "";
      const dateB = b.first_lesson_date || "";
      return dateB.localeCompare(dateA);
    }),
    [enrollments]
  );

  const cursorRowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (cursorRowRef.current) {
      cursorRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [enrollmentCursor, sessionCursor, activeTab]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      switch (e.key) {
        case "1":
          e.preventDefault();
          setActiveTab("info");
          setZenStatus("Info tab", "info");
          break;
        case "2":
          e.preventDefault();
          setActiveTab("enrollments");
          setZenStatus("Enrollments tab", "info");
          break;
        case "3":
          e.preventDefault();
          setActiveTab("sessions");
          setZenStatus("Sessions tab", "info");
          break;

        case "h":
        case "ArrowLeft":
          e.preventDefault();
          setActiveTab((t) => {
            const tabs: Tab[] = ["info", "enrollments", "sessions"];
            const idx = tabs.indexOf(t);
            return tabs[Math.max(0, idx - 1)];
          });
          break;
        case "l":
        case "ArrowRight":
          e.preventDefault();
          setActiveTab((t) => {
            const tabs: Tab[] = ["info", "enrollments", "sessions"];
            const idx = tabs.indexOf(t);
            return tabs[Math.min(tabs.length - 1, idx + 1)];
          });
          break;

        case "j":
        case "ArrowDown":
          e.preventDefault();
          if (activeTab === "enrollments" && sortedEnrollments.length > 0) {
            setEnrollmentCursor((c) => Math.min(c + 1, sortedEnrollments.length - 1));
          } else if (activeTab === "sessions" && sortedSessions.length > 0) {
            setSessionCursor((c) => Math.min(c + 1, sortedSessions.length - 1));
          }
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          if (activeTab === "enrollments") {
            setEnrollmentCursor((c) => Math.max(c - 1, 0));
          } else if (activeTab === "sessions") {
            setSessionCursor((c) => Math.max(c - 1, 0));
          }
          break;

        case "Escape":
          if (expandedEnrollmentId !== null) {
            e.preventDefault();
            setExpandedEnrollmentId(null);
          }
          break;

        case "Backspace":
          e.preventDefault();
          if (expandedEnrollmentId !== null) {
            setExpandedEnrollmentId(null);
          } else {
            router.push("/zen/students");
            setZenStatus("Back to students", "info");
          }
          break;

        case "Enter":
          e.preventDefault();
          if (activeTab === "enrollments" && sortedEnrollments[enrollmentCursor]) {
            const enrollment = sortedEnrollments[enrollmentCursor];
            setExpandedEnrollmentId((prev) => prev === enrollment.id ? null : enrollment.id);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, sortedEnrollments, sortedSessions, enrollmentCursor, sessionCursor, expandedEnrollmentId, router]);

  if (studentLoading) {
    return (
      <div style={{ maxWidth: "1000px", margin: "0 auto", color: "var(--zen-dim)" }}>
        <ZenSpinner /> Loading student...
      </div>
    );
  }

  if (!student) {
    return (
      <div style={{ maxWidth: "1000px", margin: "0 auto", color: "var(--zen-error)" }}>
        Student not found
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: "16px",
          borderBottom: "1px solid var(--zen-border)",
          paddingBottom: "8px",
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
          STUDENT:{" "}
          <span style={{ color: "var(--zen-accent)" }}>{student.student_name}</span>
          <span style={{ color: "var(--zen-dim)", fontWeight: "normal", fontSize: "13px" }}>
            {" "}({student.school_student_id || student.id})
          </span>
        </h1>
      </div>

      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          gap: "24px",
          marginBottom: "16px",
          borderBottom: "1px solid var(--zen-border)",
          paddingBottom: "8px",
        }}
      >
        {(["info", "enrollments", "sessions"] as Tab[]).map((tab, idx) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === tab
                ? "2px solid var(--zen-accent)"
                : "2px solid transparent",
              padding: "4px 0",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "13px",
              color: activeTab === tab ? "var(--zen-accent)" : "var(--zen-dim)",
              textShadow: activeTab === tab ? "var(--zen-glow)" : "none",
            }}
          >
            [{idx + 1}] {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "enrollments" && enrollments && (
              <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}> ({enrollments.length})</span>
            )}
            {tab === "sessions" && sessions && (
              <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}> ({sessions.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "info" && (
        <InfoTab student={student} />
      )}

      {activeTab === "enrollments" && (
        <EnrollmentsTab
          enrollments={sortedEnrollments}
          isLoading={enrollmentsLoading}
          cursorIndex={enrollmentCursor}
          cursorRowRef={cursorRowRef}
          expandedEnrollmentId={expandedEnrollmentId}
          onCloseDetail={() => setExpandedEnrollmentId(null)}
          onRefresh={() => mutateEnrollments()}
        />
      )}

      {activeTab === "sessions" && (
        <SessionsTab
          sessions={sortedSessions}
          isLoading={sessionsLoading}
          cursorIndex={sessionCursor}
          cursorRowRef={cursorRowRef}
        />
      )}

      {/* Navigation hint */}
      <div
        style={{
          marginTop: "32px",
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
            <span style={{ color: "var(--zen-fg)" }}>1/2/3</span> tabs{" "}
            <span style={{ color: "var(--zen-fg)" }}>h/l</span> navigate |{" "}
            <span style={{ color: "var(--zen-fg)" }}>j/k</span> scroll{" "}
            <span style={{ color: "var(--zen-fg)" }}>Enter</span> detail |{" "}
            <span style={{ color: "var(--zen-fg)" }}>Backspace</span> back{" "}
            <span style={{ color: "var(--zen-fg)" }}>?</span>=help
          </>
        )}
      </div>
    </div>
  );
}

// ── Info Tab ──

function InfoTab({ student }: { student: NonNullable<ReturnType<typeof useStudent>["data"]> }) {
  const gradeColor = getGradeColor(student.grade, student.lang_stream);

  const fields = [
    { label: "Grade", value: student.grade ? `${student.grade}${student.lang_stream || ""}` : "—", color: gradeColor },
    { label: "School", value: student.school || "—" },
    { label: "Phone", value: student.phone || "—" },
    { label: "Home Location", value: student.home_location || "—" },
    { label: "Academic Stream", value: student.academic_stream || "—" },
    { label: "Staff Referral", value: student.is_staff_referral ? "Yes" : "No" },
  ];

  if (student.is_staff_referral && student.staff_referral_notes) {
    fields.push({ label: "Referral Notes", value: student.staff_referral_notes });
  }

  return (
    <div>
      <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>{"─".repeat(30)}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px 1fr",
          gap: "8px 16px",
        }}
      >
        {fields.map(({ label, value, color }) => (
          <div key={label} style={{ display: "contents" }}>
            <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>{label}:</span>
            <span
              style={{
                color: "var(--zen-fg)",
                fontSize: "12px",
                ...(color ? { backgroundColor: color + "40", padding: "0 4px", borderRadius: "2px", display: "inline-block" } : {}),
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Enrollments Tab ──

function EnrollmentsTab({
  enrollments,
  isLoading,
  cursorIndex,
  cursorRowRef,
  expandedEnrollmentId,
  onCloseDetail,
  onRefresh,
}: {
  enrollments: Enrollment[];
  isLoading: boolean;
  cursorIndex: number;
  cursorRowRef: React.RefObject<HTMLDivElement | null>;
  expandedEnrollmentId: number | null;
  onCloseDetail: () => void;
  onRefresh: () => void;
}) {
  if (isLoading) {
    return <div style={{ color: "var(--zen-dim)" }}><ZenSpinner /> Loading enrollments...</div>;
  }

  if (enrollments.length === 0) {
    return <div style={{ color: "var(--zen-dim)" }}>No enrollments found</div>;
  }

  return (
    <div>
      <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>{"─".repeat(60)}</div>
      {enrollments.map((enrollment, idx) => {
        const isAtCursor = idx === cursorIndex;
        const paymentStatus = getDisplayPaymentStatus(enrollment);
        const statusColor = paymentStatus === "Paid"
          ? "var(--zen-success)"
          : paymentStatus === "Overdue"
          ? "var(--zen-error)"
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
              borderLeft: isAtCursor
                ? "2px solid var(--zen-accent)"
                : "2px solid transparent",
            }}
          >
            {/* Cursor */}
            <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
              {isAtCursor ? ">" : " "}
            </span>

            {/* Enrollment ID */}
            <span style={{ width: "50px", color: "var(--zen-dim)", fontSize: "12px" }}>
              #{enrollment.id}
            </span>

            {/* Type badge */}
            {enrollment.enrollment_type === "Trial" && (
              <span style={{ color: "var(--zen-warning)", fontSize: "11px", width: "50px" }}>
                Trial
              </span>
            )}
            {enrollment.enrollment_type !== "Trial" && (
              <span style={{ width: "50px" }} />
            )}

            {/* Schedule */}
            <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "120px" }}>
              {enrollment.assigned_day ? `${enrollment.assigned_day} ${enrollment.assigned_time || ""}` : "—"}
            </span>

            {/* Location */}
            <span style={{ color: "var(--zen-dim)", fontSize: "11px", width: "40px" }}>
              {enrollment.location || "—"}
            </span>

            {/* Tutor */}
            <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "100px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {enrollment.tutor_name ? getTutorFirstName(enrollment.tutor_name) : "—"}
            </span>

            {/* Payment status */}
            <span style={{ color: statusColor, fontSize: "11px", minWidth: "80px" }}>
              {paymentStatus}
            </span>

            {/* Date range */}
            <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
              {enrollment.first_lesson_date ? formatShortDate(enrollment.first_lesson_date) : "—"}
              {enrollment.effective_end_date && ` → ${formatShortDate(enrollment.effective_end_date)}`}
            </span>

            {/* Lessons */}
            <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
              {enrollment.lessons_paid ? `${enrollment.lessons_paid}L` : ""}
            </span>
          </div>
          {expandedEnrollmentId === enrollment.id && (
            <ZenEnrollmentDetail
              enrollmentId={enrollment.id}
              enrollment={enrollment}
              onClose={onCloseDetail}
              onRefresh={onRefresh}
            />
          )}
        </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Sessions Tab ──

function SessionsTab({
  sessions,
  isLoading,
  cursorIndex,
  cursorRowRef,
}: {
  sessions: Session[];
  isLoading: boolean;
  cursorIndex: number;
  cursorRowRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (isLoading) {
    return <div style={{ color: "var(--zen-dim)" }}><ZenSpinner /> Loading sessions...</div>;
  }

  if (sessions.length === 0) {
    return <div style={{ color: "var(--zen-dim)" }}>No sessions found</div>;
  }

  return (
    <div>
      <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>{"─".repeat(60)}</div>
      {sessions.map((session, idx) => {
        const isAtCursor = idx === cursorIndex;
        const statusColor = getStatusColor(session.session_status);
        const statusChar = getStatusChar(session.session_status);

        return (
          <div
            key={session.id}
            ref={isAtCursor ? cursorRowRef : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "3px 4px",
              backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
              borderLeft: isAtCursor
                ? "2px solid var(--zen-accent)"
                : "2px solid transparent",
            }}
          >
            {/* Cursor */}
            <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
              {isAtCursor ? ">" : " "}
            </span>

            {/* Date */}
            <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "90px" }}>
              {formatShortDate(session.session_date)}
            </span>

            {/* Time */}
            <span style={{ color: "var(--zen-dim)", fontSize: "12px", minWidth: "100px" }}>
              {session.time_slot || "—"}
            </span>

            {/* Status */}
            <span style={{ color: `var(--zen-${statusColor})`, minWidth: "20px", textAlign: "center" }}>
              {statusChar}
            </span>
            <span style={{ color: `var(--zen-${statusColor})`, fontSize: "11px", minWidth: "80px" }}>
              {getShortStatus(session.session_status)}
            </span>

            {/* Tutor */}
            <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "100px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {session.tutor_name ? getTutorFirstName(session.tutor_name) : "—"}
            </span>

            {/* Rating */}
            <span style={{ color: "var(--zen-warning)", fontSize: "11px" }}>
              {session.performance_rating || ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
