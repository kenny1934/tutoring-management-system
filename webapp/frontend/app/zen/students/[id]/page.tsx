"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useStudent, useStudentEnrollments, useStudentSessions, useStudentParentContacts, useCalendarEvents, usePageTitle } from "@/lib/hooks";
import { parentCommunicationsAPI } from "@/lib/api";
import type { ParentCommunication } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenSpinner } from "@/components/zen/ZenSpinner";
import { ZenEnrollmentDetail } from "@/components/zen/ZenEnrollmentDetail";
import { ZenSessionDetail } from "@/components/zen/ZenSessionDetail";
import { ZenConfirmDialog } from "@/components/zen/ZenConfirmDialog";
import { ZenContactForm } from "@/components/zen/ZenContactForm";
import { callMarkApi } from "@/components/zen/utils/sessionActions";
import { getDisplayPaymentStatus } from "@/lib/enrollment-utils";
import { getGradeColor } from "@/lib/constants";
import { formatShortDate } from "@/lib/formatters";
import { getStatusChar, getStatusColor, getShortStatus, getTutorFirstName } from "@/components/zen/utils/sessionSorting";
import { parseStarRating } from "@/components/ui/star-rating";
import type { Enrollment, Session, CalendarEvent } from "@/types";

type Tab = "info" | "enrollments" | "sessions" | "contacts" | "ratings" | "tests" | "courseware";
const ALL_TABS: Tab[] = ["info", "enrollments", "sessions", "contacts", "ratings", "tests", "courseware"];
const TAB_LABELS: Record<Tab, string> = {
  info: "Info",
  enrollments: "Enrollments",
  sessions: "Sessions",
  contacts: "Contacts",
  ratings: "Ratings",
  tests: "Tests",
  courseware: "Courseware",
};

export default function ZenStudentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const { user } = useAuth();
  const { setDisableSectionCycling } = useZenKeyboardFocus();

  // Disable global Tab section cycling
  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  const { data: student, isLoading: studentLoading } = useStudent(id);
  const { data: enrollments, isLoading: enrollmentsLoading, mutate: mutateEnrollments } = useStudentEnrollments(id);
  const { data: sessions, isLoading: sessionsLoading, mutate: mutateSessions } = useStudentSessions(id, 50);
  const { data: contacts, mutate: mutateContacts } = useStudentParentContacts(id);
  const { data: calendarEvents } = useCalendarEvents(90, true, 30);

  usePageTitle(student ? `${student.student_name} - Zen Mode` : "Student - Zen Mode");

  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [enrollmentCursor, setEnrollmentCursor] = useState(0);
  const [sessionCursor, setSessionCursor] = useState(0);
  const [contactCursor, setContactCursor] = useState(0);
  const [ratingCursor, setRatingCursor] = useState(0);
  const [testCursor, setTestCursor] = useState(0);
  const [coursewareCursor, setCoursewareCursor] = useState(0);
  const [expandedEnrollmentId, setExpandedEnrollmentId] = useState<number | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<ParentCommunication | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    details?: string;
    action: () => Promise<void>;
  } | null>(null);

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

  // Sorted contacts (most recent first)
  const sortedContacts = useMemo(
    () => [...(contacts || [])].sort((a, b) => b.contact_date.localeCompare(a.contact_date)),
    [contacts]
  );

  // Rated sessions (sessions with rating or notes)
  const ratedSessions = useMemo(
    () => sortedSessions.filter((s) => s.performance_rating || s.notes),
    [sortedSessions]
  );

  // Filtered tests for this student
  const filteredTests = useMemo(() => {
    if (!calendarEvents || !student) return [];
    return calendarEvents
      .filter((e) => e.school === student.school && e.grade === student.grade)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [calendarEvents, student]);

  // Courseware from sessions
  const coursewareItems = useMemo(() => {
    if (!sessions) return [];
    return sessions
      .flatMap((s) =>
        (s.exercises || []).map((ex) => ({
          ...ex,
          session_date: s.session_date,
          tutor_name: s.tutor_name,
        }))
      )
      .sort((a, b) => b.session_date.localeCompare(a.session_date));
  }, [sessions]);

  const cursorRowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (cursorRowRef.current) {
      cursorRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [enrollmentCursor, sessionCursor, contactCursor, ratingCursor, testCursor, coursewareCursor, activeTab]);

  // Session mark handler
  const handleQuickMark = useCallback(async (sessionId: number, status: string) => {
    setZenStatus(`Marking session as ${status}...`, "info");
    try {
      await callMarkApi(sessionId, status);
      setZenStatus(`Marked as ${status}`, "success");
      mutateSessions();
    } catch {
      setZenStatus("Failed to mark session", "error");
    }
  }, [mutateSessions]);

  // Contact delete handler
  const handleDeleteContact = useCallback(async (contact: ParentCommunication) => {
    try {
      await parentCommunicationsAPI.delete(contact.id, user?.name || "");
      setZenStatus("Contact deleted", "success");
      mutateContacts();
    } catch {
      setZenStatus("Failed to delete contact", "error");
    }
    setConfirmAction(null);
  }, [user, mutateContacts]);

  // Check if anything is expanded/open (blocks tab switching number keys)
  const hasExpandedDetail = expandedEnrollmentId !== null || expandedSessionId !== null || showContactForm;

  // Keyboard navigation (capture phase to fire before ZenLayout's bubbling-phase nav handler)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Block when confirm dialog is open
      if (confirmAction) return;

      // Tab switching (number keys) - only when nothing expanded
      if (!hasExpandedDetail) {
        const tabNum = parseInt(e.key);
        if (tabNum >= 1 && tabNum <= ALL_TABS.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const tab = ALL_TABS[tabNum - 1];
          setActiveTab(tab);
          setZenStatus(`${TAB_LABELS[tab]} tab`, "info");
          return;
        }
      }

      switch (e.key) {
        case "h":
        case "ArrowLeft":
          if (!hasExpandedDetail) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setActiveTab((t) => {
              const idx = ALL_TABS.indexOf(t);
              return ALL_TABS[Math.max(0, idx - 1)];
            });
          }
          break;
        case "l":
        case "ArrowRight":
          if (!hasExpandedDetail) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setActiveTab((t) => {
              const idx = ALL_TABS.indexOf(t);
              return ALL_TABS[Math.min(ALL_TABS.length - 1, idx + 1)];
            });
          }
          break;

        case "j":
        case "ArrowDown":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (activeTab === "enrollments" && sortedEnrollments.length > 0) {
            setEnrollmentCursor((c) => Math.min(c + 1, sortedEnrollments.length - 1));
          } else if (activeTab === "sessions" && sortedSessions.length > 0) {
            setSessionCursor((c) => Math.min(c + 1, sortedSessions.length - 1));
          } else if (activeTab === "contacts" && sortedContacts.length > 0) {
            setContactCursor((c) => Math.min(c + 1, sortedContacts.length - 1));
          } else if (activeTab === "ratings" && ratedSessions.length > 0) {
            setRatingCursor((c) => Math.min(c + 1, ratedSessions.length - 1));
          } else if (activeTab === "tests" && filteredTests.length > 0) {
            setTestCursor((c) => Math.min(c + 1, filteredTests.length - 1));
          } else if (activeTab === "courseware" && coursewareItems.length > 0) {
            setCoursewareCursor((c) => Math.min(c + 1, coursewareItems.length - 1));
          }
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (activeTab === "enrollments") {
            setEnrollmentCursor((c) => Math.max(c - 1, 0));
          } else if (activeTab === "sessions") {
            setSessionCursor((c) => Math.max(c - 1, 0));
          } else if (activeTab === "contacts") {
            setContactCursor((c) => Math.max(c - 1, 0));
          } else if (activeTab === "ratings") {
            setRatingCursor((c) => Math.max(c - 1, 0));
          } else if (activeTab === "tests") {
            setTestCursor((c) => Math.max(c - 1, 0));
          } else if (activeTab === "courseware") {
            setCoursewareCursor((c) => Math.max(c - 1, 0));
          }
          break;

        case "Escape":
          if (expandedSessionId !== null) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setExpandedSessionId(null);
          } else if (expandedEnrollmentId !== null) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setExpandedEnrollmentId(null);
          }
          break;

        case "Backspace":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (expandedSessionId !== null) {
            setExpandedSessionId(null);
          } else if (expandedEnrollmentId !== null) {
            setExpandedEnrollmentId(null);
          } else {
            router.push("/zen/students");
            setZenStatus("Back to students", "info");
          }
          break;

        case "Enter":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (activeTab === "enrollments" && sortedEnrollments[enrollmentCursor]) {
            const enrollment = sortedEnrollments[enrollmentCursor];
            setExpandedEnrollmentId((prev) => prev === enrollment.id ? null : enrollment.id);
          } else if (activeTab === "sessions" && sortedSessions[sessionCursor]) {
            const session = sortedSessions[sessionCursor];
            setExpandedSessionId((prev) => prev === session.id ? null : session.id);
          } else if (activeTab === "contacts" && sortedContacts[contactCursor] && !showContactForm) {
            setEditingContact(sortedContacts[contactCursor]);
            setShowContactForm(true);
          }
          break;

        case "n":
        case "N":
          if (activeTab === "contacts" && !showContactForm) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setEditingContact(undefined);
            setShowContactForm(true);
          }
          break;

        case "d":
        case "D":
          if (activeTab === "contacts" && sortedContacts[contactCursor] && !showContactForm) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const contact = sortedContacts[contactCursor];
            setConfirmAction({
              title: "Delete contact?",
              details: `Delete ${contact.contact_method} contact from ${formatShortDate(contact.contact_date)}`,
              action: () => handleDeleteContact(contact),
            });
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [
    activeTab, sortedEnrollments, sortedSessions, sortedContacts, ratedSessions, filteredTests, coursewareItems,
    enrollmentCursor, sessionCursor, contactCursor, ratingCursor, testCursor, coursewareCursor,
    expandedEnrollmentId, expandedSessionId, showContactForm, confirmAction, hasExpandedDetail,
    router, handleDeleteContact,
  ]);

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

  // Tab badge counts
  const tabCount = (tab: Tab): number | undefined => {
    switch (tab) {
      case "enrollments": return enrollments?.length;
      case "sessions": return sessions?.length;
      case "contacts": return contacts?.length;
      case "ratings": return ratedSessions.length || undefined;
      case "tests": return filteredTests.length || undefined;
      case "courseware": return coursewareItems.length || undefined;
      default: return undefined;
    }
  };

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
          gap: "16px",
          marginBottom: "16px",
          borderBottom: "1px solid var(--zen-border)",
          paddingBottom: "8px",
          flexWrap: "wrap",
        }}
      >
        {ALL_TABS.map((tab, idx) => {
          const count = tabCount(tab);
          return (
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
                fontSize: "12px",
                color: activeTab === tab ? "var(--zen-accent)" : "var(--zen-dim)",
                textShadow: activeTab === tab ? "var(--zen-glow)" : "none",
                whiteSpace: "nowrap",
              }}
            >
              [{idx + 1}] {TAB_LABELS[tab]}
              {count !== undefined && (
                <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}> ({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "info" && <InfoTab student={student} />}

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
          expandedSessionId={expandedSessionId}
          onCloseDetail={() => setExpandedSessionId(null)}
          onMark={handleQuickMark}
          onRefresh={() => mutateSessions()}
        />
      )}

      {activeTab === "contacts" && (
        <ContactsTab
          contacts={sortedContacts}
          cursorIndex={contactCursor}
          cursorRowRef={cursorRowRef}
          showForm={showContactForm}
          editingContact={editingContact}
          studentId={id!}
          onFormSave={() => {
            setShowContactForm(false);
            setEditingContact(undefined);
            mutateContacts();
          }}
          onFormCancel={() => {
            setShowContactForm(false);
            setEditingContact(undefined);
          }}
        />
      )}

      {activeTab === "ratings" && (
        <RatingsTab
          sessions={ratedSessions}
          allSessions={sortedSessions}
          cursorIndex={ratingCursor}
          cursorRowRef={cursorRowRef}
        />
      )}

      {activeTab === "tests" && (
        <TestsTab
          tests={filteredTests}
          cursorIndex={testCursor}
          cursorRowRef={cursorRowRef}
        />
      )}

      {activeTab === "courseware" && (
        <CoursewareTab
          items={coursewareItems}
          cursorIndex={coursewareCursor}
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
        {expandedSessionId !== null ? (
          <>
            <span style={{ color: "var(--zen-fg)" }}>1-5</span>=status{" "}
            <span style={{ color: "var(--zen-fg)" }}>c</span>=CW{" "}
            <span style={{ color: "var(--zen-fg)" }}>h</span>=HW{" "}
            <span style={{ color: "var(--zen-fg)" }}>e</span>=edit{" "}
            <span style={{ color: "var(--zen-fg)" }}>r</span>=rate |{" "}
            <span style={{ color: "var(--zen-fg)" }}>Esc</span> close
          </>
        ) : expandedEnrollmentId !== null ? (
          <>
            <span style={{ color: "var(--zen-fg)" }}>p</span>=pay{" "}
            <span style={{ color: "var(--zen-fg)" }}>m</span>=mark sent{" "}
            <span style={{ color: "var(--zen-fg)" }}>f</span>=fee msg{" "}
            <span style={{ color: "var(--zen-fg)" }}>x</span>=cancel |{" "}
            <span style={{ color: "var(--zen-fg)" }}>Esc</span> close
          </>
        ) : showContactForm ? (
          <>
            <span style={{ color: "var(--zen-fg)" }}>Tab</span>=next field{" "}
            <span style={{ color: "var(--zen-fg)" }}>Enter</span>=save{" "}
            <span style={{ color: "var(--zen-fg)" }}>Esc</span>=cancel
          </>
        ) : activeTab === "contacts" ? (
          <>
            <span style={{ color: "var(--zen-fg)" }}>1-7</span> tabs{" "}
            <span style={{ color: "var(--zen-fg)" }}>h/l</span> navigate |{" "}
            <span style={{ color: "var(--zen-fg)" }}>j/k</span> scroll{" "}
            <span style={{ color: "var(--zen-fg)" }}>n</span>=new{" "}
            <span style={{ color: "var(--zen-fg)" }}>Enter</span>=edit{" "}
            <span style={{ color: "var(--zen-fg)" }}>d</span>=delete |{" "}
            <span style={{ color: "var(--zen-fg)" }}>Backspace</span> back
          </>
        ) : (
          <>
            <span style={{ color: "var(--zen-fg)" }}>1-7</span> tabs{" "}
            <span style={{ color: "var(--zen-fg)" }}>h/l</span> navigate |{" "}
            <span style={{ color: "var(--zen-fg)" }}>j/k</span> scroll{" "}
            <span style={{ color: "var(--zen-fg)" }}>Enter</span> detail |{" "}
            <span style={{ color: "var(--zen-fg)" }}>Backspace</span> back{" "}
            <span style={{ color: "var(--zen-fg)" }}>?</span>=help
          </>
        )}
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <ZenConfirmDialog
          title={confirmAction.title}
          details={confirmAction.details}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
        />
      )}
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
            <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
              {isAtCursor ? ">" : " "}
            </span>
            <span style={{ width: "50px", color: "var(--zen-dim)", fontSize: "12px" }}>
              #{enrollment.id}
            </span>
            {enrollment.enrollment_type === "Trial" ? (
              <span style={{ color: "var(--zen-warning)", fontSize: "11px", width: "50px" }}>Trial</span>
            ) : (
              <span style={{ width: "50px" }} />
            )}
            <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "120px" }}>
              {enrollment.assigned_day ? `${enrollment.assigned_day} ${enrollment.assigned_time || ""}` : "—"}
            </span>
            <span style={{ color: "var(--zen-dim)", fontSize: "11px", width: "40px" }}>
              {enrollment.location || "—"}
            </span>
            <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "100px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {enrollment.tutor_name ? getTutorFirstName(enrollment.tutor_name) : "—"}
            </span>
            <span style={{ color: statusColor, fontSize: "11px", minWidth: "80px" }}>
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
  expandedSessionId,
  onCloseDetail,
  onMark,
  onRefresh,
}: {
  sessions: Session[];
  isLoading: boolean;
  cursorIndex: number;
  cursorRowRef: React.RefObject<HTMLDivElement | null>;
  expandedSessionId: number | null;
  onCloseDetail: () => void;
  onMark: (sessionId: number, status: string) => void;
  onRefresh: () => void;
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
          <React.Fragment key={session.id}>
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
              <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
                {isAtCursor ? ">" : " "}
              </span>
              <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "90px" }}>
                {formatShortDate(session.session_date)}
              </span>
              <span style={{ color: "var(--zen-dim)", fontSize: "12px", minWidth: "100px" }}>
                {session.time_slot || "—"}
              </span>
              <span style={{ color: `var(--zen-${statusColor})`, minWidth: "20px", textAlign: "center" }}>
                {statusChar}
              </span>
              <span style={{ color: `var(--zen-${statusColor})`, fontSize: "11px", minWidth: "80px" }}>
                {getShortStatus(session.session_status)}
              </span>
              <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "100px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {session.tutor_name ? getTutorFirstName(session.tutor_name) : "—"}
              </span>
              <span style={{ color: "var(--zen-warning)", fontSize: "11px" }}>
                {session.performance_rating || ""}
              </span>
            </div>
            {expandedSessionId === session.id && (
              <ZenSessionDetail
                session={session}
                onClose={onCloseDetail}
                onMark={onMark}
                onRefresh={onRefresh}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Contacts Tab ──

function ContactsTab({
  contacts,
  cursorIndex,
  cursorRowRef,
  showForm,
  editingContact,
  studentId,
  onFormSave,
  onFormCancel,
}: {
  contacts: ParentCommunication[];
  cursorIndex: number;
  cursorRowRef: React.RefObject<HTMLDivElement | null>;
  showForm: boolean;
  editingContact?: ParentCommunication;
  studentId: number;
  onFormSave: () => void;
  onFormCancel: () => void;
}) {
  const methodChar = (m: string) => m === "WeChat" ? "W" : m === "Phone" ? "P" : m === "In-Person" ? "I" : m[0];

  return (
    <div>
      {showForm && (
        <ZenContactForm
          studentId={studentId}
          onSave={onFormSave}
          onCancel={onFormCancel}
          editingContact={editingContact}
        />
      )}

      <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>{"─".repeat(60)}</div>

      {contacts.length === 0 ? (
        <div style={{ color: "var(--zen-dim)" }}>
          No contacts recorded. Press <span style={{ color: "var(--zen-accent)" }}>n</span> to add one.
        </div>
      ) : (
        contacts.map((contact, idx) => {
          const isAtCursor = idx === cursorIndex;
          return (
            <div
              key={contact.id}
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
              <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
                {isAtCursor ? ">" : " "}
              </span>
              <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "90px" }}>
                {formatShortDate(contact.contact_date)}
              </span>
              <span style={{
                color: "var(--zen-accent)",
                fontSize: "12px",
                minWidth: "20px",
                textAlign: "center",
                fontWeight: "bold",
              }}>
                {methodChar(contact.contact_method)}
              </span>
              <span style={{ color: "var(--zen-dim)", fontSize: "11px", minWidth: "120px" }}>
                {contact.contact_type}
              </span>
              <span style={{
                color: "var(--zen-fg)",
                fontSize: "12px",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {contact.brief_notes || "—"}
              </span>
              {contact.follow_up_needed && (
                <span style={{ color: "var(--zen-warning)", fontSize: "11px" }}>!</span>
              )}
              <span style={{ color: "var(--zen-dim)", fontSize: "11px", minWidth: "80px", textAlign: "right" }}>
                {contact.tutor_name ? getTutorFirstName(contact.tutor_name) : ""}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Ratings Tab ──

function RatingsTab({
  sessions,
  allSessions,
  cursorIndex,
  cursorRowRef,
}: {
  sessions: Session[];
  allSessions: Session[];
  cursorIndex: number;
  cursorRowRef: React.RefObject<HTMLDivElement | null>;
}) {
  // Compute stats from all sessions
  const stats = useMemo(() => {
    const rated = allSessions.filter((s) => s.performance_rating);
    const withComments = allSessions.filter((s) => s.notes);
    const ratings = rated.map((s) => parseStarRating(s.performance_rating));
    const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    const distribution = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
    ratings.forEach((r) => {
      if (r >= 1 && r <= 5) distribution[r - 1]++;
    });

    return { avg, ratedCount: rated.length, commentCount: withComments.length, distribution, total: ratings.length };
  }, [allSessions]);

  const starString = (rating: number) => {
    const filled = Math.round(rating);
    return "★".repeat(filled) + "☆".repeat(5 - filled);
  };

  const barWidth = 20;

  return (
    <div>
      {/* Summary */}
      <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>{"─".repeat(30)} SUMMARY {"─".repeat(30)}</div>

      {stats.ratedCount === 0 ? (
        <div style={{ color: "var(--zen-dim)", marginBottom: "16px" }}>No ratings yet</div>
      ) : (
        <>
          <div style={{ marginBottom: "16px", fontSize: "13px" }}>
            <span style={{ color: "var(--zen-warning)", fontSize: "16px" }}>{starString(stats.avg)}</span>
            {"  "}
            <span style={{ color: "var(--zen-fg)" }}>{stats.avg.toFixed(1)}/5</span>
            {"  "}
            <span style={{ color: "var(--zen-dim)" }}>({stats.ratedCount} rated, {stats.commentCount} with comments)</span>
          </div>

          {/* Distribution */}
          <div style={{ fontFamily: "monospace", fontSize: "12px", marginBottom: "16px" }}>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.distribution[star - 1];
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
              const filled = Math.round((pct / 100) * barWidth);
              return (
                <div key={star} style={{ display: "flex", gap: "8px", lineHeight: "1.6" }}>
                  <span style={{ color: "var(--zen-warning)", width: "24px" }}>{star}★</span>
                  <span style={{ color: "var(--zen-accent)" }}>{"█".repeat(filled)}</span>
                  <span style={{ color: "var(--zen-border)" }}>{"░".repeat(barWidth - filled)}</span>
                  <span style={{ color: "var(--zen-dim)", width: "40px", textAlign: "right" }}>{Math.round(pct)}%</span>
                  <span style={{ color: "var(--zen-dim)" }}>({count})</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Session list */}
      <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>{"─".repeat(60)}</div>

      {sessions.length === 0 ? (
        <div style={{ color: "var(--zen-dim)" }}>No rated sessions or comments</div>
      ) : (
        sessions.map((session, idx) => {
          const isAtCursor = idx === cursorIndex;
          const rating = parseStarRating(session.performance_rating);

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
              <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
                {isAtCursor ? ">" : " "}
              </span>
              <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "90px" }}>
                {formatShortDate(session.session_date)}
              </span>
              <span style={{ color: "var(--zen-warning)", fontSize: "12px", minWidth: "70px" }}>
                {rating > 0 ? starString(rating) : "—"}
              </span>
              <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "100px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {session.tutor_name ? getTutorFirstName(session.tutor_name) : "—"}
              </span>
              <span style={{
                color: "var(--zen-dim)",
                fontSize: "12px",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {session.notes ? `"${session.notes}"` : ""}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Tests Tab ──

function TestsTab({
  tests,
  cursorIndex,
  cursorRowRef,
}: {
  tests: CalendarEvent[];
  cursorIndex: number;
  cursorRowRef: React.RefObject<HTMLDivElement | null>;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = tests.filter((t) => new Date(t.start_date + "T00:00:00") >= today);
  const past = tests.filter((t) => new Date(t.start_date + "T00:00:00") < today);
  const combined = [...upcoming, ...past];

  const daysUntil = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const urgencyColor = (days: number) => {
    if (days < 0) return "var(--zen-dim)";
    if (days <= 1) return "var(--zen-error)";
    if (days <= 7) return "var(--zen-warning)";
    return "var(--zen-fg)";
  };

  return (
    <div>
      <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>{"─".repeat(60)}</div>

      {combined.length === 0 ? (
        <div style={{ color: "var(--zen-dim)" }}>No tests found for this student</div>
      ) : (
        <>
          {upcoming.map((test, idx) => {
            const isAtCursor = idx === cursorIndex;
            const days = daysUntil(test.start_date);

            return (
              <div
                key={test.id}
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
                <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
                  {isAtCursor ? ">" : " "}
                </span>
                <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "90px" }}>
                  {formatShortDate(test.start_date)}
                </span>
                <span style={{
                  color: test.event_type === "Exam" ? "var(--zen-error)" : "var(--zen-warning)",
                  fontSize: "11px",
                  minWidth: "50px",
                  fontWeight: "bold",
                }}>
                  {(test.event_type || "Test").toUpperCase()}
                </span>
                <span style={{
                  color: "var(--zen-fg)",
                  fontSize: "12px",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {test.title}
                </span>
                <span style={{ color: urgencyColor(days), fontSize: "11px", minWidth: "90px", textAlign: "right" }}>
                  {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d remaining`}
                </span>
              </div>
            );
          })}

          {past.length > 0 && (
            <>
              <div style={{
                color: "var(--zen-dim)",
                fontSize: "11px",
                padding: "8px 0 4px",
                borderTop: upcoming.length > 0 ? "1px solid var(--zen-border)" : "none",
                marginTop: upcoming.length > 0 ? "8px" : "0",
              }}>
                {"─── PAST ───"}
              </div>
              {past.map((test, idx) => {
                const globalIdx = upcoming.length + idx;
                const isAtCursor = globalIdx === cursorIndex;
                const days = daysUntil(test.start_date);

                return (
                  <div
                    key={test.id}
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
                      opacity: 0.6,
                    }}
                  >
                    <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
                      {isAtCursor ? ">" : " "}
                    </span>
                    <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "90px" }}>
                      {formatShortDate(test.start_date)}
                    </span>
                    <span style={{ color: "var(--zen-dim)", fontSize: "11px", minWidth: "50px" }}>
                      {(test.event_type || "Test").toUpperCase()}
                    </span>
                    <span style={{
                      color: "var(--zen-dim)",
                      fontSize: "12px",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {test.title}
                    </span>
                    <span style={{ color: "var(--zen-dim)", fontSize: "11px", minWidth: "90px", textAlign: "right" }}>
                      {Math.abs(days)}d ago
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Courseware Tab ──

interface CoursewareItem {
  id: number;
  session_id: number;
  exercise_type: string;
  pdf_name: string;
  page_start?: number;
  page_end?: number;
  remarks?: string;
  session_date: string;
  tutor_name: string;
}

function CoursewareTab({
  items,
  cursorIndex,
  cursorRowRef,
}: {
  items: CoursewareItem[];
  cursorIndex: number;
  cursorRowRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div>
      <div style={{ color: "var(--zen-dim)", marginBottom: "8px" }}>{"─".repeat(60)}</div>

      {items.length === 0 ? (
        <div style={{ color: "var(--zen-dim)" }}>No exercises found</div>
      ) : (
        items.map((item, idx) => {
          const isAtCursor = idx === cursorIndex;
          const isCW = item.exercise_type === "CW" || item.exercise_type === "Classwork";
          const typeLabel = isCW ? "CW" : "HW";
          const typeColor = isCW ? "var(--zen-error)" : "var(--zen-accent)";
          const pageRange = item.page_start
            ? item.page_end && item.page_end !== item.page_start
              ? `p${item.page_start}-${item.page_end}`
              : `p${item.page_start}`
            : "";

          return (
            <div
              key={`${item.id}-${idx}`}
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
              <span style={{ width: "12px", color: isAtCursor ? "var(--zen-accent)" : "transparent" }}>
                {isAtCursor ? ">" : " "}
              </span>
              <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "90px" }}>
                {formatShortDate(item.session_date)}
              </span>
              <span style={{
                color: typeColor,
                fontSize: "11px",
                minWidth: "24px",
                fontWeight: "bold",
              }}>
                {typeLabel}
              </span>
              <span style={{
                color: "var(--zen-fg)",
                fontSize: "12px",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {item.pdf_name}
              </span>
              {pageRange && (
                <span style={{ color: "var(--zen-dim)", fontSize: "11px", minWidth: "60px" }}>
                  {pageRange}
                </span>
              )}
              <span style={{ color: "var(--zen-fg)", fontSize: "12px", minWidth: "80px", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.tutor_name ? getTutorFirstName(item.tutor_name) : "—"}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
