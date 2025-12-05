"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStudent, useStudentEnrollments, useStudentSessions, useCalendarEvents } from "@/lib/hooks";
import type { Session, CalendarEvent } from "@/types";
import Link from "next/link";
import {
  ArrowLeft, User, BookOpen, Calendar, FileText,
  GraduationCap, Phone, MapPin, ExternalLink
} from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig } from "@/lib/session-status";

// Tab types
type TabId = "profile" | "sessions" | "tests" | "notes";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "sessions", label: "Sessions", icon: Calendar },
  { id: "tests", label: "Tests", icon: BookOpen },
  { id: "notes", label: "Notes", icon: FileText },
];

// School colors
const SCHOOL_COLORS: Record<string, string> = {
  "TIS": "#c2dfce",
  "RCHK": "#cedaf5",
  "CIS": "#fbf2d0",
  "HKIS": "#f0a19e",
  "ISF": "#e2b1cc",
  "VSA": "#ebb26e",
  "SIS": "#7dc347",
  "CDNIS": "#a590e6",
};

const getSchoolColor = (school: string | undefined): string => {
  if (!school) return "#e5e7eb";
  return SCHOOL_COLORS[school] || "#e5e7eb";
};

// Helper to format date
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id ? parseInt(params.id as string) : null;

  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [isMobile, setIsMobile] = useState(false);

  // Fetch student data
  const { data: student, error: studentError, isLoading: studentLoading } = useStudent(studentId);
  const { data: enrollments = [] } = useStudentEnrollments(studentId);
  const { data: sessions = [], isLoading: sessionsLoading } = useStudentSessions(studentId);
  const { data: calendarEvents = [] } = useCalendarEvents(60);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Filter calendar events for this student's school/grade
  const filteredTests = useMemo(() => {
    if (!student?.school || !student?.grade) return [];
    return calendarEvents.filter(event =>
      event.school === student.school && event.grade === student.grade
    );
  }, [calendarEvents, student]);

  // Sort sessions by date (most recent first)
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) =>
      new Date(b.session_date).getTime() - new Date(a.session_date).getTime()
    );
  }, [sessions]);

  // Get active enrollments
  const activeEnrollments = useMemo(() => {
    return enrollments.filter(e =>
      e.payment_status === 'Paid' || e.payment_status === 'Pending Payment'
    );
  }, [enrollments]);

  if (studentLoading) {
    return (
      <DeskSurface fullHeight>
        <PageTransition className="flex flex-col gap-3 p-2 sm:p-4">
          {/* Header Skeleton */}
          <div className={cn(
            "flex items-center gap-3 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-4 py-3",
            !isMobile && "paper-texture"
          )}>
            <div className="h-8 w-8 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
            <div className="h-6 w-40 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
            <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>

          {/* Tabs Skeleton */}
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
            ))}
          </div>

          {/* Content Skeleton */}
          <div className={cn(
            "flex-1 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
            !isMobile && "paper-texture"
          )}>
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
              ))}
            </div>
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  if (studentError || !student) {
    return (
      <DeskSurface>
        <PageTransition className="flex h-full items-center justify-center p-8">
          <StickyNote variant="pink" size="lg" showTape={true}>
            <div className="text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Student not found</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 mb-4">
                {studentError instanceof Error ? studentError.message : "Unable to load student data"}
              </p>
              <button
                onClick={() => router.back()}
                className="px-4 py-2 bg-[#a0704b] text-white rounded-lg hover:bg-[#8b6140] transition-colors"
              >
                Back to Students
              </button>
            </div>
          </StickyNote>
        </PageTransition>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface fullHeight>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-2 sm:p-4">
          {/* Compact Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "flex flex-wrap items-center gap-3 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 sm:px-4 py-2",
              !isMobile && "paper-texture"
            )}
          >
            {/* Back Button */}
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg hover:bg-[#d4a574]/20 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
            </button>

            {/* Student ID */}
            <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
              {student.school_student_id || `#${student.id}`}
            </span>

            {/* Student Name */}
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
              {student.student_name}
            </h1>

            {/* Grade Badge */}
            {student.grade && (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                {student.grade}{student.lang_stream || ''}
              </span>
            )}

            {/* School Badge */}
            {student.school && (
              <span
                className="text-xs px-2 py-0.5 rounded text-gray-800 hidden sm:inline"
                style={{ backgroundColor: getSchoolColor(student.school) }}
              >
                {student.school}
              </span>
            )}

            <div className="flex-1" />

            {/* Enrollment count */}
            <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
              <BookOpen className="h-4 w-4" />
              <span>{activeEnrollments.length} enrollment{activeEnrollments.length !== 1 ? 's' : ''}</span>
            </div>
          </motion.div>

          {/* Horizontal Tab Navigation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="flex gap-1 overflow-x-auto pb-1"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                    isActive
                      ? "bg-[#a0704b] text-white shadow-md"
                      : "bg-white dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-[#e8d4b8] dark:border-[#6b5a4a]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {/* Badge for sessions/tests count */}
                  {tab.id === "sessions" && sortedSessions.length > 0 && (
                    <span className={cn(
                      "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                      isActive ? "bg-white/20 text-white" : "bg-[#a0704b]/10 text-[#a0704b]"
                    )}>
                      {sortedSessions.length}
                    </span>
                  )}
                  {tab.id === "tests" && filteredTests.length > 0 && (
                    <span className={cn(
                      "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                      isActive ? "bg-white/20 text-white" : "bg-amber-500/20 text-amber-600"
                    )}>
                      {filteredTests.length}
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1"
            >
              {/* Profile Tab */}
              {activeTab === "profile" && (
                <ProfileTab student={student} enrollments={enrollments} isMobile={isMobile} />
              )}

              {/* Sessions Tab */}
              {activeTab === "sessions" && (
                <SessionsTab sessions={sortedSessions} loading={sessionsLoading} isMobile={isMobile} />
              )}

              {/* Tests Tab */}
              {activeTab === "tests" && (
                <TestsTab tests={filteredTests} student={student} isMobile={isMobile} />
              )}

              {/* Notes Tab */}
              {activeTab === "notes" && (
                <NotesTab sessions={sortedSessions} isMobile={isMobile} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </DeskSurface>
  );
}

// Profile Tab Component
function ProfileTab({ student, enrollments, isMobile }: { student: any; enrollments: any[]; isMobile: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Personal Info Card */}
      <div className={cn(
        "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
        !isMobile && "paper-texture"
      )}>
        <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <User className="h-4 w-4" />
          Personal Info
        </h3>
        <div className="space-y-3">
          <InfoRow label="Name" value={student.student_name} />
          <InfoRow label="Student ID" value={student.school_student_id} mono />
          <InfoRow label="Phone" value={student.phone} icon={Phone} />
          <InfoRow label="Location" value={student.home_location} icon={MapPin} />
        </div>
      </div>

      {/* Academic Info Card */}
      <div className={cn(
        "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
        !isMobile && "paper-texture"
      )}>
        <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <GraduationCap className="h-4 w-4" />
          Academic Info
        </h3>
        <div className="space-y-3">
          <InfoRow label="School" value={student.school} />
          <InfoRow label="Grade" value={student.grade} />
          <InfoRow label="Language" value={student.lang_stream} />
          <InfoRow label="Stream" value={student.academic_stream} />
        </div>
      </div>

      {/* Active Enrollments Card */}
      {enrollments.length > 0 && (
        <div className={cn(
          "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4 md:col-span-2",
          !isMobile && "paper-texture"
        )}>
          <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Enrollments ({enrollments.length})
          </h3>
          <div className="space-y-2">
            {enrollments.map((enrollment) => (
              <div
                key={enrollment.id}
                className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {enrollment.assigned_day} {enrollment.assigned_time}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {enrollment.location} • {enrollment.tutor_name || 'No tutor'}
                      {enrollment.first_lesson_date && ` • Started ${formatDate(enrollment.first_lesson_date)}`}
                    </span>
                  </div>
                </div>
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  enrollment.payment_status === 'Paid'
                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                )}>
                  {enrollment.payment_status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Info Row helper
function InfoRow({ label, value, icon: Icon, mono }: { label: string; value?: string | null; icon?: React.ElementType; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className={cn(
        "text-sm text-gray-900 dark:text-gray-100",
        mono && "font-mono"
      )}>
        {value}
      </span>
    </div>
  );
}

// Sessions Tab Component
function SessionsTab({ sessions, loading, isMobile }: { sessions: Session[]; loading: boolean; isMobile: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <StickyNote variant="yellow" size="md" showTape={true}>
          <div className="text-center">
            <Calendar className="h-10 w-10 mx-auto mb-3 text-gray-600 dark:text-gray-400" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No sessions yet</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Sessions will appear here once scheduled
            </p>
          </div>
        </StickyNote>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session, index) => {
        const statusConfig = getSessionStatusConfig(session.session_status);
        const StatusIcon = statusConfig.Icon;
        const sessionDate = new Date(session.session_date + 'T00:00:00');

        return (
          <motion.div
            key={session.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: isMobile ? 0 : index * 0.03, duration: 0.2 }}
            className={cn(
              "flex rounded-lg overflow-hidden bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
              statusConfig.bgTint,
              !isMobile && "paper-texture"
            )}
          >
            <div className="flex-1 p-3 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {session.time_slot}
                </span>
                {session.tutor_name && (
                  <>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {session.tutor_name}
                    </span>
                  </>
                )}
                <Link
                  href={`/sessions/${session.id}`}
                  className="ml-auto flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[#a0704b]/10 hover:bg-[#a0704b]/20 text-[#a0704b] dark:text-[#cd853f] transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              {session.notes && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-1">
                  {session.notes}
                </p>
              )}
            </div>
            <div className={cn("w-10 flex-shrink-0 flex items-center justify-center", statusConfig.bgClass)}>
              <StatusIcon className="h-4 w-4 text-white" />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// Tests Tab Component
function TestsTab({ tests, student, isMobile }: { tests: CalendarEvent[]; student: any; isMobile: boolean }) {
  if (tests.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <StickyNote variant="green" size="md" showTape={true}>
          <div className="text-center">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-gray-600 dark:text-gray-400" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No upcoming tests</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {student.school && student.grade
                ? `No tests found for ${student.school} ${student.grade}`
                : 'Set school and grade to see relevant tests'}
            </p>
          </div>
        </StickyNote>
      </div>
    );
  }

  // Sort by date
  const sortedTests = [...tests].sort((a, b) =>
    new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  return (
    <div className="space-y-2">
      {sortedTests.map((test, index) => {
        const testDate = new Date(test.start_date + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((testDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const isPast = daysUntil < 0;

        return (
          <motion.div
            key={test.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: isMobile ? 0 : index * 0.03, duration: 0.2 }}
            className={cn(
              "p-3 rounded-lg border",
              isPast
                ? "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700 opacity-60"
                : "bg-white dark:bg-[#1a1a1a] border-[#e8d4b8] dark:border-[#6b5a4a]",
              !isMobile && "paper-texture"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-medium",
                    isPast ? "text-gray-500" : "text-gray-900 dark:text-gray-100"
                  )}>
                    {test.title}
                  </span>
                  {test.event_type && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded",
                      test.event_type === 'Test' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" :
                      test.event_type === 'Exam' ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" :
                      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                    )}>
                      {test.event_type}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {testDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                {test.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                    {test.description}
                  </p>
                )}
              </div>
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap",
                isPast
                  ? "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  : daysUntil === 0
                    ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                    : daysUntil <= 3
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                      : "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
              )}>
                {isPast ? 'Past' : daysUntil === 0 ? 'Today' : daysUntil === 1 ? '1 day' : `${daysUntil} days`}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// Notes Tab Component
function NotesTab({ sessions, isMobile }: { sessions: Session[]; isMobile: boolean }) {
  // Extract notes from sessions
  const sessionNotes = sessions.filter(s => s.notes && s.notes.trim().length > 0);

  if (sessionNotes.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <StickyNote variant="blue" size="md" showTape={true}>
          <div className="text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-gray-600 dark:text-gray-400" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No notes yet</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Session notes will appear here
            </p>
          </div>
        </StickyNote>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessionNotes.map((session, index) => {
        const sessionDate = new Date(session.session_date + 'T00:00:00');
        return (
          <motion.div
            key={session.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: isMobile ? 0 : index * 0.05, duration: 0.2 }}
            className={cn(
              "p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400",
              !isMobile && "paper-texture"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {session.tutor_name && (
                <>
                  <span className="text-xs text-amber-500">•</span>
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    {session.tutor_name}
                  </span>
                </>
              )}
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {session.notes}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
