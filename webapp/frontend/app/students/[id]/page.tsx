"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useStudent, useStudentEnrollments, useStudentSessions, useCalendarEvents, usePageTitle, useProposals, useTutors } from "@/lib/hooks";
import type { Session, CalendarEvent, Enrollment, Student, MakeupProposal } from "@/types";
import { studentsAPI } from "@/lib/api";
import { mutate } from "swr";
import Link from "next/link";
import {
  ArrowLeft, User, BookOpen, Calendar, FileText,
  GraduationCap, Phone, MapPin, ExternalLink, Clock, CreditCard, X,
  CheckCircle2, HandCoins, BookMarked, PenTool, Home, Pencil,
  Palette, FlaskConical, Briefcase, ChevronDown, Tag
} from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig, getDisplayStatus } from "@/lib/session-status";
import { getGradeColor, CURRENT_USER_TUTOR } from "@/lib/constants";
import { getDisplayName } from "@/lib/exercise-utils";
import { formatShortDate } from "@/lib/formatters";
import { getDisplayPaymentStatus } from "@/lib/enrollment-utils";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { ProposalIndicatorBadge } from "@/components/sessions/ProposalIndicatorBadge";
import { ProposalDetailModal } from "@/components/sessions/ProposalDetailModal";
import { createSessionProposalMap } from "@/lib/proposal-utils";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react";

// Tab types
type TabId = "profile" | "sessions" | "courseware" | "tests" | "notes";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "sessions", label: "Sessions", icon: Calendar },
  { id: "courseware", label: "Courseware", icon: BookMarked },
  { id: "tests", label: "Tests", icon: BookOpen },
  { id: "notes", label: "Notes", icon: FileText },
];

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentId = params.id ? parseInt(params.id as string) : null;

  // Read initial tab from URL, default to "profile"
  const initialTab = (searchParams.get('tab') as TabId) || 'profile';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [isMobile, setIsMobile] = useState(false);

  // Fetch student data
  const { data: student, error: studentError, isLoading: studentLoading } = useStudent(studentId);

  // Dynamic page title
  usePageTitle(
    student ? `${student.school_student_id || ''} ${student.student_name}`.trim() : "Loading..."
  );

  // Update URL when tab changes (without adding to history)
  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/students/${params.id}?tab=${tab}`, { scroll: false });
  };

  // Session popover state (lifted to page level for correct positioning)
  const [popoverSession, setPopoverSession] = useState<Session | null>(null);
  const [sessionClickPosition, setSessionClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Enrollment popover state
  const [popoverEnrollment, setPopoverEnrollment] = useState<Enrollment | null>(null);
  const [enrollmentClickPosition, setEnrollmentClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Edit mode state
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isEditingAcademic, setIsEditingAcademic] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Student>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [allSchools, setAllSchools] = useState<string[]>([]);

  const { data: enrollments = [] } = useStudentEnrollments(studentId);

  // Fetch all schools for autocomplete
  useEffect(() => {
    studentsAPI.getSchools().then(setAllSchools).catch(console.error);
  }, []);
  const { data: sessions = [], isLoading: sessionsLoading } = useStudentSessions(studentId);
  const { data: calendarEvents = [] } = useCalendarEvents(60);

  // Fetch all pending proposals and filter for this student's sessions
  const { data: allProposals = [] } = useProposals({ status: 'pending', includeSession: true });

  // Fetch tutors for current user ID lookup
  const { data: tutors = [] } = useTutors();

  // Get current user's tutor ID for proposal actions
  const currentTutorId = useMemo(() => {
    const tutor = tutors.find((t) => t.tutor_name === CURRENT_USER_TUTOR);
    return tutor?.id ?? 0;
  }, [tutors]);

  // Create map of session ID to proposal for sessions with pending proposals
  const sessionProposalMap = useMemo(() => {
    // Filter proposals to only those for this student's sessions
    const studentSessionIds = new Set(sessions.map(s => s.id));
    const studentProposals = allProposals.filter(p =>
      studentSessionIds.has(p.original_session_id)
    );
    return createSessionProposalMap(studentProposals);
  }, [allProposals, sessions]);

  // Proposal modal state
  const [selectedProposal, setSelectedProposal] = useState<MakeupProposal | null>(null);

  // Sync popover session with updated data from SWR (e.g., after marking attended)
  useEffect(() => {
    if (popoverSession && sessions) {
      const updatedSession = sessions.find((s) => s.id === popoverSession.id);
      if (updatedSession && updatedSession !== popoverSession) {
        setPopoverSession(updatedSession);
      }
    }
  }, [sessions, popoverSession]);

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

  // Aggregate all exercises from sessions for courseware history
  const coursewareHistory = useMemo(() => {
    if (!sessions.length) return [];

    return sessions
      .filter(s => s.exercises && s.exercises.length > 0)
      .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
      .flatMap(session =>
        session.exercises!.map(ex => ({
          ...ex,
          session_id: session.id,
          session_date: session.session_date,
          tutor_name: session.tutor_name,
        }))
      );
  }, [sessions]);

  // Get active enrollments
  const activeEnrollments = useMemo(() => {
    return enrollments.filter(e =>
      e.payment_status === 'Paid' || e.payment_status === 'Pending Payment'
    );
  }, [enrollments]);

  // Edit handlers
  const handleEditPersonal = () => {
    if (student) {
      setEditForm({ ...student });
      setIsEditingPersonal(true);
    }
  };

  const handleEditAcademic = () => {
    if (student) {
      setEditForm({ ...student });
      setIsEditingAcademic(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingPersonal(false);
    setIsEditingAcademic(false);
    setEditForm({});
  };

  const handleFormChange = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!student) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const updatedStudent = await studentsAPI.update(student.id, editForm);
      // Optimistic update - set new data immediately, skip revalidation
      mutate(['student', student.id], { ...student, ...updatedStudent }, false);
      setIsEditingPersonal(false);
      setIsEditingAcademic(false);
      setEditForm({});
    } catch (error) {
      console.error('Failed to save student:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save changes');
      // Don't close edit mode on error - let user fix and retry
    } finally {
      setIsSaving(false);
    }
  };

  if (studentLoading) {
    return (
      <DeskSurface fullHeight>
        <PageTransition className="flex flex-col gap-3 p-2 sm:p-4">
          {/* Header Skeleton */}
          <div className={cn(
            "flex flex-wrap items-center gap-3 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 sm:px-4 py-2",
            !isMobile && "paper-texture"
          )}>
            {/* Back button */}
            <div className="h-8 w-8 bg-gray-300 dark:bg-gray-600 rounded-lg animate-pulse" />
            {/* Student ID */}
            <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            {/* Name */}
            <div className="h-6 w-32 sm:w-40 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
            {/* Grade badge */}
            <div className="h-5 w-12 bg-blue-100 dark:bg-blue-900/50 rounded animate-pulse" />
            {/* School badge (hidden on mobile) */}
            <div className="h-5 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse hidden sm:block" />
            <div className="flex-1" />
            {/* Enrollment count */}
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>

          {/* Tabs Skeleton - 5 tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className={cn(
                  "h-9 rounded-full animate-pulse",
                  i === 1 ? "w-24 bg-[#a0704b]" : "w-24 bg-gray-200 dark:bg-gray-700"
                )}
              />
            ))}
          </div>

          {/* Content Skeleton - Profile tab style with cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Personal Info Card */}
            <div className={cn(
              "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
              !isMobile && "paper-texture"
            )}>
              <div className="h-5 w-28 bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex justify-between">
                    <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
            {/* Academic Info Card */}
            <div className={cn(
              "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
              !isMobile && "paper-texture"
            )}>
              <div className="h-5 w-32 bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex justify-between">
                    <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
            {/* Enrollments Card - spans full width */}
            <div className={cn(
              "lg:col-span-2 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
              !isMobile && "paper-texture"
            )}>
              <div className="h-5 w-36 bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
                ))}
              </div>
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
              <span
                className="text-xs px-2 py-0.5 rounded text-gray-800"
                style={{ backgroundColor: getGradeColor(student.grade, student.lang_stream) }}
              >
                {student.grade}{student.lang_stream || ''}
              </span>
            )}

            {/* School Badge */}
            {student.school && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-gray-800 dark:text-amber-200 hidden sm:inline">
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
                  onClick={() => handleTabChange(tab.id)}
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
                      isActive ? "bg-white/20 text-white" : "bg-amber-500/20 text-amber-600"
                    )}>
                      {sortedSessions.length}
                    </span>
                  )}
                  {tab.id === "courseware" && coursewareHistory.length > 0 && (
                    <span className={cn(
                      "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                      isActive ? "bg-white/20 text-white" : "bg-amber-500/20 text-amber-600"
                    )}>
                      {coursewareHistory.length}
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
                <ProfileTab
                  student={student}
                  enrollments={enrollments}
                  isMobile={isMobile}
                  onEnrollmentClick={(enrollment, e) => {
                    setEnrollmentClickPosition({ x: e.clientX, y: e.clientY });
                    setPopoverEnrollment(enrollment);
                  }}
                  selectedEnrollmentId={popoverEnrollment?.id}
                  // Edit props
                  isEditingPersonal={isEditingPersonal}
                  isEditingAcademic={isEditingAcademic}
                  editForm={editForm}
                  onEditPersonal={handleEditPersonal}
                  onEditAcademic={handleEditAcademic}
                  onCancelEdit={handleCancelEdit}
                  onSave={handleSave}
                  onFormChange={handleFormChange}
                  isSaving={isSaving}
                  saveError={saveError}
                  allSchools={allSchools}
                />
              )}

              {/* Sessions Tab */}
              {activeTab === "sessions" && (
                <SessionsTab
                  sessions={sortedSessions}
                  enrollments={enrollments}
                  loading={sessionsLoading}
                  isMobile={isMobile}
                  onSessionClick={(session, e) => {
                    setSessionClickPosition({ x: e.clientX, y: e.clientY });
                    setPopoverSession(session);
                  }}
                  selectedSessionId={popoverSession?.id}
                  sessionProposalMap={sessionProposalMap}
                  onProposalClick={setSelectedProposal}
                />
              )}

              {/* Courseware Tab */}
              {activeTab === "courseware" && (
                <CoursewareTab
                  coursewareHistory={coursewareHistory}
                  loading={sessionsLoading}
                  isMobile={isMobile}
                />
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

      {/* Session Detail Popover */}
      {popoverSession && (
        <SessionDetailPopover
          session={popoverSession}
          isOpen={!!popoverSession}
          onClose={() => setPopoverSession(null)}
          clickPosition={sessionClickPosition}
        />
      )}

      {/* Proposal Detail Modal */}
      <ProposalDetailModal
        proposal={selectedProposal}
        currentTutorId={currentTutorId}
        isOpen={!!selectedProposal}
        onClose={() => setSelectedProposal(null)}
      />

      {/* Enrollment Detail Popover */}
      {popoverEnrollment && (
        <EnrollmentDetailPopover
          enrollment={popoverEnrollment}
          isOpen={!!popoverEnrollment}
          onClose={() => setPopoverEnrollment(null)}
          clickPosition={enrollmentClickPosition}
          isMobile={isMobile}
        />
      )}
    </DeskSurface>
  );
}

// Profile Tab Component
const GRADE_OPTIONS = [
  { value: "F1", label: "F1" },
  { value: "F2", label: "F2" },
  { value: "F3", label: "F3" },
  { value: "F4", label: "F4" },
  { value: "F5", label: "F5" },
  { value: "F6", label: "F6" },
];

const STREAM_OPTIONS = [
  { value: "C", label: "C" },
  { value: "E", label: "E" },
];

const ACADEMIC_STREAM_OPTIONS = [
  { value: "Arts", label: "Arts", icon: Palette, color: "#e2b1cc" },
  { value: "Science", label: "Science", icon: FlaskConical, color: "#cedaf5" },
  { value: "Commerce", label: "Commerce", icon: Briefcase, color: "#fbf2d0" },
];

function ProfileTab({
  student,
  enrollments,
  isMobile,
  onEnrollmentClick,
  selectedEnrollmentId,
  // Edit props
  isEditingPersonal,
  isEditingAcademic,
  editForm,
  onEditPersonal,
  onEditAcademic,
  onCancelEdit,
  onSave,
  onFormChange,
  isSaving,
  saveError,
  allSchools,
}: {
  student: Student;
  enrollments: Enrollment[];
  isMobile: boolean;
  onEnrollmentClick: (enrollment: Enrollment, e: React.MouseEvent) => void;
  selectedEnrollmentId?: number;
  // Edit props
  isEditingPersonal: boolean;
  isEditingAcademic: boolean;
  editForm: Partial<Student>;
  onEditPersonal: () => void;
  onEditAcademic: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onFormChange: (field: string, value: string) => void;
  isSaving: boolean;
  saveError: string | null;
  allSchools: string[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Personal Info Card */}
      <div className={cn(
        "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4 transition-all",
        !isMobile && "paper-texture",
        isEditingPersonal && "ring-2 ring-amber-400"
      )}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <User className="h-4 w-4" />
            Personal Info
          </h3>
          {isEditingPersonal ? (
            <div className="flex items-center gap-2">
              {saveError && (
                <span className="text-xs text-red-500 max-w-[120px] truncate" title={saveError}>
                  {saveError}
                </span>
              )}
              <button
                onClick={onCancelEdit}
                disabled={isSaving}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={isSaving}
                className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <button
              onClick={onEditPersonal}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
              title="Edit personal info"
            >
              <Pencil className="h-3.5 w-3.5 text-gray-400 group-hover:text-amber-600" />
            </button>
          )}
        </div>
        <div className="space-y-3">
          {isEditingPersonal ? (
            <>
              <EditableInfoRow label="Name" field="student_name" value={editForm.student_name} onChange={onFormChange} required />
              <InfoRow label="Student ID" value={student.school_student_id} mono />
              <EditableInfoRow label="Phone" field="phone" value={editForm.phone} onChange={onFormChange} type="tel" />
              <InfoRow label="Location" value={student.home_location} icon={MapPin} />
            </>
          ) : (
            <>
              <InfoRow label="Name" value={student.student_name} />
              <InfoRow label="Student ID" value={student.school_student_id} mono />
              <InfoRow label="Phone" value={student.phone} icon={Phone} />
              <InfoRow label="Location" value={student.home_location} icon={MapPin} />
            </>
          )}
        </div>
      </div>

      {/* Academic Info Card */}
      <div className={cn(
        "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4 transition-all",
        !isMobile && "paper-texture",
        isEditingAcademic && "ring-2 ring-amber-400"
      )}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Academic Info
          </h3>
          {isEditingAcademic ? (
            <div className="flex items-center gap-2">
              {saveError && (
                <span className="text-xs text-red-500 max-w-[120px] truncate" title={saveError}>
                  {saveError}
                </span>
              )}
              <button
                onClick={onCancelEdit}
                disabled={isSaving}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={isSaving}
                className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <button
              onClick={onEditAcademic}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
              title="Edit academic info"
            >
              <Pencil className="h-3.5 w-3.5 text-gray-400 group-hover:text-amber-600" />
            </button>
          )}
        </div>
        <div className="space-y-3">
          {isEditingAcademic ? (
            <>
              <EditableInfoRow label="School" field="school" value={editForm.school} onChange={onFormChange} type="autocomplete" suggestions={allSchools} />
              <EditableInfoRow label="Grade" field="grade" value={editForm.grade} onChange={onFormChange} type="select" options={GRADE_OPTIONS} />
              <EditableInfoRow label="Lang Stream" field="lang_stream" value={editForm.lang_stream} onChange={onFormChange} type="select" options={STREAM_OPTIONS} />
              <EditableInfoRow label="Acad. Stream" field="academic_stream" value={editForm.academic_stream} onChange={onFormChange} type="icon-select" iconOptions={ACADEMIC_STREAM_OPTIONS} />
            </>
          ) : (
            <>
              <InfoRow label="School" value={student.school} />
              <InfoRow label="Grade" value={student.grade} />
              <InfoRow label="Lang Stream" value={student.lang_stream} />
              <InfoRow label="Acad. Stream" value={student.academic_stream} />
            </>
          )}
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
                onClick={(e) => onEnrollmentClick(enrollment, e)}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all",
                  "bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50",
                  selectedEnrollmentId === enrollment.id && "ring-2 ring-[#a0704b]"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {enrollment.assigned_day} {enrollment.assigned_time}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {enrollment.location} • {enrollment.tutor_name || 'No tutor'}
                      {enrollment.first_lesson_date && ` • Started ${formatShortDate(enrollment.first_lesson_date)}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Enrollment Type badge (only for non-Regular) */}
                  {enrollment.enrollment_type && enrollment.enrollment_type !== 'Regular' && (
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      enrollment.enrollment_type === 'Trial'
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                    )}>
                      {enrollment.enrollment_type}
                    </span>
                  )}
                  {/* Payment Status badge */}
                  {(() => {
                    const displayStatus = getDisplayPaymentStatus(enrollment);
                    return (
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        displayStatus === 'Paid'
                          ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                          : displayStatus === 'Overdue'
                          ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                      )}>
                        {displayStatus}
                      </span>
                    );
                  })()}
                </div>
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

// Autocomplete Input component
function AutocompleteInput({ value, onChange, suggestions, className }: {
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
  className: string;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()));

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        className={className}
      />
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-32 overflow-y-auto bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-md shadow-lg z-10">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(s); setShowSuggestions(false); }}
              className="w-full px-2 py-1 text-left text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Icon Select component for Academic Stream
function IconSelect({ value, onChange, options, className }: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; icon: React.ElementType; color: string }[];
  className: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        className={cn(className, "flex items-center justify-between text-left w-full")}
      >
        <span className="flex items-center gap-2">
          {selected ? (
            <>
              <selected.icon className="h-3.5 w-3.5" style={{ color: selected.color }} />
              {selected.label}
            </>
          ) : (
            <span className="text-gray-400">None</span>
          )}
        </span>
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-md shadow-lg z-10">
          {/* None/clear option */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(""); setIsOpen(false); }}
            className={cn(
              "w-full px-2 py-1.5 text-left text-sm text-gray-400",
              "hover:bg-amber-50 dark:hover:bg-amber-900/20",
              !value && "bg-amber-100 dark:bg-amber-900/40"
            )}
          >
            None
          </button>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={cn(
                "w-full px-2 py-1.5 text-left text-sm flex items-center gap-2",
                "hover:bg-amber-50 dark:hover:bg-amber-900/20",
                value === opt.value && "bg-amber-100 dark:bg-amber-900/40"
              )}
            >
              <opt.icon className="h-3.5 w-3.5" style={{ color: opt.color }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Editable Info Row helper for edit mode
function EditableInfoRow({
  label,
  field,
  value,
  onChange,
  type = "text",
  required = false,
  options,
  suggestions,
  iconOptions,
}: {
  label: string;
  field: string;
  value?: string;
  onChange: (field: string, value: string) => void;
  type?: "text" | "tel" | "select" | "autocomplete" | "icon-select";
  required?: boolean;
  options?: { value: string; label: string }[];
  suggestions?: string[];
  iconOptions?: { value: string; label: string; icon: React.ElementType; color: string }[];
}) {
  const inputClass = cn(
    "flex-1 px-2 py-1 rounded border text-sm",
    "bg-white dark:bg-gray-900",
    "border-amber-300 dark:border-amber-700",
    "focus:outline-none focus:ring-2 focus:ring-amber-400",
    "transition-all"
  );

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap w-20 flex-shrink-0">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {type === "autocomplete" && suggestions ? (
        <AutocompleteInput
          value={value || ""}
          onChange={(val) => onChange(field, val)}
          suggestions={suggestions}
          className={inputClass}
        />
      ) : type === "icon-select" && iconOptions ? (
        <IconSelect
          value={value || ""}
          onChange={(val) => onChange(field, val)}
          options={iconOptions}
          className={inputClass}
        />
      ) : type === "select" && options ? (
        <select
          value={value || ""}
          onChange={(e) => onChange(field, e.target.value)}
          className={inputClass}
        >
          <option value="">Select...</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={type === "autocomplete" || type === "icon-select" ? "text" : type}
          value={value || ""}
          onChange={(e) => onChange(field, e.target.value)}
          className={inputClass}
          required={required}
        />
      )}
    </div>
  );
}

// Sessions Tab Component
function SessionsTab({
  sessions,
  enrollments,
  loading,
  isMobile,
  onSessionClick,
  selectedSessionId,
  sessionProposalMap,
  onProposalClick,
}: {
  sessions: Session[];
  enrollments: Enrollment[];
  loading: boolean;
  isMobile: boolean;
  onSessionClick: (session: Session, e: React.MouseEvent) => void;
  selectedSessionId?: number;
  sessionProposalMap?: Map<number, MakeupProposal>;
  onProposalClick?: (proposal: MakeupProposal) => void;
}) {
  // Group sessions by enrollment
  const sessionsByEnrollment = useMemo(() => {
    const grouped = new Map<number, Session[]>();
    sessions.forEach((session) => {
      const enrollmentId = session.enrollment_id;
      if (!grouped.has(enrollmentId)) {
        grouped.set(enrollmentId, []);
      }
      grouped.get(enrollmentId)!.push(session);
    });

    // Sort sessions within each group by date (most recent first)
    grouped.forEach((enrollmentSessions) => {
      enrollmentSessions.sort((a, b) =>
        new Date(b.session_date).getTime() - new Date(a.session_date).getTime()
      );
    });

    return grouped;
  }, [sessions]);

  // Create enrollment lookup map
  const enrollmentMap = useMemo(() => {
    return new Map(enrollments.map(e => [e.id, e]));
  }, [enrollments]);

  // Sort enrollment groups by most recent session date
  const sortedEnrollmentIds = useMemo(() => {
    return Array.from(sessionsByEnrollment.entries())
      .sort(([, sessionsA], [, sessionsB]) => {
        const latestA = Math.max(...sessionsA.map(s => new Date(s.session_date).getTime()));
        const latestB = Math.max(...sessionsB.map(s => new Date(s.session_date).getTime()));
        return latestB - latestA;
      })
      .map(([id]) => id);
  }, [sessionsByEnrollment]);

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

  // Render a single session card
  const renderSessionCard = (session: Session, index: number) => {
    const statusConfig = getSessionStatusConfig(getDisplayStatus(session));
    const StatusIcon = statusConfig.Icon;
    const sessionDate = new Date(session.session_date + 'T00:00:00');

    return (
      <motion.div
        key={session.id}
        onClick={(e) => onSessionClick(session, e)}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: isMobile ? 0 : index * 0.03, duration: 0.2 }}
        className={cn(
          "flex rounded-lg overflow-hidden bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] cursor-pointer",
          statusConfig.bgTint,
          !isMobile && "paper-texture",
          selectedSessionId === session.id && "ring-2 ring-[#a0704b]"
        )}
      >
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400 font-mono">#{session.id}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {session.time_slot}
            </span>
            {session.financial_status && (
              <>
                <span className="text-xs text-gray-400">•</span>
                {session.financial_status === "Paid" ? (
                  <span className="flex items-center gap-0.5 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    <span className="hidden sm:inline">Paid</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-xs text-red-600">
                    <HandCoins className="h-3 w-3" />
                    <span className="hidden sm:inline">Unpaid</span>
                  </span>
                )}
              </>
            )}
            {/* Proposal indicator for pending makeup sessions */}
            {sessionProposalMap?.has(session.id) && (
              <ProposalIndicatorBadge
                proposal={sessionProposalMap.get(session.id)!}
                onClick={(e) => {
                  e.stopPropagation();
                  onProposalClick?.(sessionProposalMap.get(session.id)!);
                }}
                size="sm"
              />
            )}
            <Link
              href={`/sessions/${session.id}`}
              onClick={(e) => e.stopPropagation()}
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
          <StatusIcon className={cn("h-4 w-4 text-white", statusConfig.iconClass)} />
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      {sortedEnrollmentIds.map((enrollmentId) => {
        const enrollment = enrollmentMap.get(enrollmentId);
        const enrollmentSessions = sessionsByEnrollment.get(enrollmentId) || [];

        return (
          <div key={enrollmentId} className="space-y-2">
            {/* Enrollment Header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[#f5ede3] dark:bg-[#2d2820] rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]">
              <Calendar className="h-4 w-4 text-[#a0704b]" />
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {enrollment?.assigned_day || 'Unassigned'} {enrollment?.assigned_time || ''}
              </span>
              {enrollment?.tutor_name && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {enrollment.tutor_name}
                  </span>
                </>
              )}
              {enrollment?.location && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {enrollment.location}
                  </span>
                </>
              )}
              <span className="ml-auto text-xs text-gray-500">
                {enrollment?.lessons_paid ?? 0} lesson{(enrollment?.lessons_paid ?? 0) !== 1 ? 's' : ''} paid
              </span>
            </div>

            {/* Session Cards */}
            <div className="space-y-2 pl-3 border-l-2 border-[#e8d4b8] dark:border-[#6b5a4a]">
              {enrollmentSessions.map((session, index) => renderSessionCard(session, index))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Tests Tab Component
function TestsTab({ tests, student, isMobile }: { tests: CalendarEvent[]; student: Student; isMobile: boolean }) {
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

// Courseware Tab Component
interface CoursewareExercise {
  id?: number;
  exercise_type: string;
  pdf_name: string;
  page_start?: number;
  page_end?: number;
  remarks?: string;
  session_id: number;
  session_date: string;
  tutor_name?: string;
}

function CoursewareTab({
  coursewareHistory,
  loading,
  isMobile,
}: {
  coursewareHistory: CoursewareExercise[];
  loading: boolean;
  isMobile: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (coursewareHistory.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <StickyNote variant="blue" size="md" showTape={true}>
          <div className="text-center">
            <BookMarked className="h-10 w-10 mx-auto mb-3 text-gray-600 dark:text-gray-400" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No courseware yet</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Classwork and homework will appear here
            </p>
          </div>
        </StickyNote>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {coursewareHistory.map((exercise, index) => {
        const sessionDate = new Date(exercise.session_date + 'T00:00:00');
        const isCW = exercise.exercise_type === "CW" || exercise.exercise_type === "Classwork";

        return (
          <motion.div
            key={`${exercise.session_id}-${exercise.id || index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: isMobile ? 0 : index * 0.03, duration: 0.2 }}
            className={cn(
              "p-4 rounded-lg border-l-4",
              isCW
                ? "bg-red-50 dark:bg-red-900/10 border-red-400"
                : "bg-blue-50 dark:bg-blue-900/10 border-blue-400",
              !isMobile && "paper-texture"
            )}
          >
            {/* Header: Date, Tutor, Session Link */}
            <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">
                {sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {exercise.tutor_name && (
                <>
                  <span>•</span>
                  <span>{exercise.tutor_name}</span>
                </>
              )}
              <Link
                href={`/sessions/${exercise.session_id}`}
                className="ml-auto text-blue-600 dark:text-blue-400 hover:underline font-mono"
              >
                #{exercise.session_id}
              </Link>
            </div>

            {/* Content: Type badge + PDF name + Pages */}
            <div className="flex items-center gap-2">
              <span className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                isCW
                  ? "bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200"
                  : "bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200"
              )}>
                {isCW ? <PenTool className="h-3 w-3" /> : <Home className="h-3 w-3" />}
                {isCW ? "CW" : "HW"}
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {getDisplayName(exercise.pdf_name)}
              </span>
              {exercise.page_start && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  p{exercise.page_start}{exercise.page_end && exercise.page_end !== exercise.page_start ? `-${exercise.page_end}` : ''}
                </span>
              )}
            </div>

            {/* Remarks if any */}
            {exercise.remarks && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {exercise.remarks}
              </p>
            )}
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

// Enrollment Detail Popover Component
function EnrollmentDetailPopover({
  enrollment,
  isOpen,
  onClose,
  clickPosition,
  isMobile,
}: {
  enrollment: Enrollment;
  isOpen: boolean;
  onClose: () => void;
  clickPosition: { x: number; y: number } | null;
  isMobile: boolean;
}) {
  // Virtual reference based on click position
  const virtualReference = useMemo(() => {
    if (!clickPosition) return null;
    return {
      getBoundingClientRect: () => ({
        x: clickPosition.x,
        y: clickPosition.y,
        top: clickPosition.y,
        left: clickPosition.x,
        bottom: clickPosition.y,
        right: clickPosition.x,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }),
    };
  }, [clickPosition]);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end", padding: 16 }),
      shift({ padding: 16 }),
    ],
    whileElementsMounted: autoUpdate,
    placement: "bottom-start",
  });

  // Use setPositionReference for virtual references
  useEffect(() => {
    if (virtualReference) {
      refs.setPositionReference(virtualReference);
    }
  }, [virtualReference, refs]);

  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!isOpen) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        className={cn(
          "z-[9999] w-72 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-xl",
          !isMobile && "paper-texture"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#d4a574]/30">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-[#a0704b]/20 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-[#a0704b]" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                Enrollment
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                #{enrollment.id}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Schedule */}
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {enrollment.assigned_day} {enrollment.assigned_time}
            </span>
          </div>

          {/* Tutor */}
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-purple-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {enrollment.tutor_name || 'No tutor assigned'}
            </span>
          </div>

          {/* Location */}
          {enrollment.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {enrollment.location}
              </span>
            </div>
          )}

          {/* Enrollment Type */}
          {enrollment.enrollment_type && (
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-blue-500" />
              <span className={cn(
                "text-sm",
                enrollment.enrollment_type === 'Trial'
                  ? "text-blue-600 dark:text-blue-400"
                  : enrollment.enrollment_type === 'One-Time'
                  ? "text-purple-600 dark:text-purple-400"
                  : "text-gray-700 dark:text-gray-300"
              )}>
                {enrollment.enrollment_type}
              </span>
            </div>
          )}

          {/* Payment */}
          {(() => {
            const displayStatus = getDisplayPaymentStatus(enrollment);
            return (
              <div className="flex items-center gap-2">
                <CreditCard className={cn(
                  "h-4 w-4",
                  displayStatus === 'Paid' ? 'text-green-500' :
                  displayStatus === 'Overdue' ? 'text-red-500' :
                  'text-amber-500'
                )} />
                <span className={cn(
                  "text-sm font-medium",
                  displayStatus === 'Paid' ? 'text-green-600' :
                  displayStatus === 'Overdue' ? 'text-red-600' :
                  displayStatus === 'Pending Payment' ? 'text-amber-600' :
                  'text-gray-500'
                )}>
                  {displayStatus}
                </span>
                {enrollment.lessons_paid && (
                  <span className="text-xs text-gray-500">({enrollment.lessons_paid} lessons)</span>
                )}
              </div>
            );
          })()}

          {/* Start Date */}
          {enrollment.first_lesson_date && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Started: {formatShortDate(enrollment.first_lesson_date)}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#d4a574]/30">
          <Link
            href={`/enrollments/${enrollment.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-[#a0704b] hover:bg-[#8b6140] text-white rounded-lg text-sm font-medium transition-colors"
          >
            View Details
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </FloatingPortal>
  );
}
