"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEnrollment, useEnrollmentSessions, usePageTitle, useLocations } from "@/lib/hooks";
import type { Session, Enrollment, Tutor } from "@/types";
import Link from "next/link";
import { tutorsAPI, enrollmentsAPI } from "@/lib/api";
import { mutate } from "swr";
import {
  ArrowLeft, User, BookOpen, Calendar, MapPin, Clock, CreditCard,
  ExternalLink, X, CheckCircle2, HandCoins, Pencil, CalendarClock, History,
  MessageSquare, Copy, Check, Send, Undo2, Loader2, XCircle, ChevronDown, ChevronUp
} from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig, getDisplayStatus } from "@/lib/session-status";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { useLocation } from "@/contexts/LocationContext";
import { useAuth } from "@/contexts/AuthContext";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { formatShortDate } from "@/lib/formatters";
import { getDisplayPaymentStatus } from "@/lib/enrollment-utils";
import { ScheduleChangeReviewModal } from "@/components/enrollments/ScheduleChangeReviewModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/contexts/ToastContext";

// Helper to format day/time as a badge
function formatScheduleBadge(day?: string, time?: string): string {
  if (!day && !time) return "Not scheduled";
  if (!time) return day || "";
  return `${day} ${time}`;
}

export default function EnrollmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const enrollmentId = params.id ? parseInt(params.id as string) : null;

  const [isMobile, setIsMobile] = useState(false);
  const { selectedLocation } = useLocation();
  const { effectiveRole } = useAuth();
  const { showToast } = useToast();
  const isAdmin = effectiveRole === "Admin" || effectiveRole === "Super Admin";

  // Edit mode state
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [isEditingExtension, setIsEditingExtension] = useState(false);
  const [extensionForm, setExtensionForm] = useState({ weeks: 0, reason: "" });
  const [isSavingExtension, setIsSavingExtension] = useState(false);
  const [showExtensionHistory, setShowExtensionHistory] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Enrollment>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCustomTime, setIsCustomTime] = useState(false);

  // Schedule change modal state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Fee message panel state
  const [showFeePanel, setShowFeePanel] = useState(false);
  const [feeLanguage, setFeeLanguage] = useState<'zh' | 'en'>('zh');
  const [feeMessage, setFeeMessage] = useState('');
  const [originalFeeMessage, setOriginalFeeMessage] = useState('');
  const [feeMessageLoading, setFeeMessageLoading] = useState(false);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [copied, setCopied] = useState(false);

  // Action states
  const [markingSent, setMarkingSent] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // For tutor dropdown
  const [allTutors, setAllTutors] = useState<Tutor[]>([]);

  // Fetch tutor for dropdown
  useEffect(() => {
    tutorsAPI.getAll().then(setAllTutors).catch(() => setAllTutors([]));
  }, []);

  const handleEditSchedule = () => {
    if (enrollment) {
      setEditForm({ ...enrollment });
      setIsEditingSchedule(true);
      // Check if current time is not in predefined options
      const currentTime = enrollment.assigned_time || "";
      const isWeekendDay = ["Sat", "Sun"].includes(enrollment.assigned_day || "");
      const options = isWeekendDay ? WEEKEND_TIME_OPTIONS : WEEKDAY_TIME_OPTIONS;
      setIsCustomTime(currentTime !== "" && !options.includes(currentTime));
    }
  };

  const handleEditPayment = () => {
    if (enrollment) {
      setEditForm({ ...enrollment });
      setIsEditingPayment(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingSchedule(false);
    setIsEditingPayment(false);
    setEditForm({});
    setSaveError(null);
    setIsCustomTime(false);
  };

  const handleFormChange = (field: string, value: string | number | null) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!enrollment) return;

    // Check if this is a schedule edit with schedule field changes
    if (isEditingSchedule) {
      const dayChanged = editForm.assigned_day !== enrollment.assigned_day;
      const timeChanged = editForm.assigned_time !== enrollment.assigned_time;
      const locationChanged = editForm.location !== enrollment.location;
      const tutorChanged = editForm.tutor_id !== enrollment.tutor_id;

      if (dayChanged || timeChanged || locationChanged || tutorChanged) {
        // Open the schedule change review modal
        setIsScheduleModalOpen(true);
        setIsEditingSchedule(false);
        return;
      }
    }

    // Direct save (for payment edits or non-schedule-related changes)
    setIsSaving(true);
    setSaveError(null);

    try {
      const updatedEnrollment = await enrollmentsAPI.update(enrollment.id, editForm);
      mutate(['enrollment', enrollment.id], { ...enrollment, ...updatedEnrollment }, false);
      setIsEditingSchedule(false);
      setIsEditingPayment(false);
      setEditForm({});
    } catch (error) {
      console.error('Failed to save enrollment:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle schedule change modal success
  const handleScheduleChangeSuccess = () => {
    mutate(['enrollment', enrollment?.id]);
    mutate(['enrollment-sessions', enrollment?.id]);
    setEditForm({});
  };

  // Fee message and action handlers
  const handleCopyFee = async () => {
    try {
      await navigator.clipboard.writeText(feeMessage);
      setCopied(true);
      showToast("Fee message copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      showToast("Failed to copy to clipboard", "error");
    }
  };

  const handleMarkSent = async () => {
    if (!enrollment) return;
    setMarkingSent(true);
    try {
      await enrollmentsAPI.update(enrollment.id, { fee_message_sent: true });
      mutate(['enrollment', enrollment.id]);
      showToast("Marked as sent!");
    } catch (err) {
      console.error("Failed to mark as sent:", err);
      showToast("Failed to mark as sent", "error");
    } finally {
      setMarkingSent(false);
    }
  };

  const handleUnmarkSent = async () => {
    if (!enrollment) return;
    setMarkingSent(true);
    try {
      await enrollmentsAPI.update(enrollment.id, { fee_message_sent: false });
      mutate(['enrollment', enrollment.id]);
      showToast("Unmarked as sent");
    } catch (err) {
      console.error("Failed to unmark:", err);
      showToast("Failed to unmark", "error");
    } finally {
      setMarkingSent(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!enrollment) return;
    setMarkingPaid(true);
    try {
      await enrollmentsAPI.update(enrollment.id, { payment_status: "Paid" });
      mutate(['enrollment', enrollment.id]);
      showToast("Payment confirmed!");
      setConfirmPayment(false);
    } catch (err) {
      console.error("Failed to confirm payment:", err);
      showToast("Failed to confirm payment", "error");
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleCancelEnrollment = async () => {
    if (!enrollment) return;
    setIsCancelling(true);
    try {
      await enrollmentsAPI.cancel(enrollment.id);
      showToast("Enrollment cancelled");
      setConfirmCancel(false);
      router.back();
    } catch (err) {
      console.error("Failed to cancel enrollment:", err);
      showToast("Failed to cancel enrollment", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleResetMessage = () => {
    setFeeMessage(originalFeeMessage);
    setIsEditingMessage(false);
  };

  const handleSaveExtension = async () => {
    if (!enrollment) return;
    setIsSavingExtension(true);
    setSaveError(null);

    try {
      const updatedEnrollment = await enrollmentsAPI.updateExtension(enrollment.id, {
        deadline_extension_weeks: extensionForm.weeks,
        reason: extensionForm.reason,
      });
      mutate(['enrollment', enrollment.id], { ...enrollment, ...updatedEnrollment }, false);
      setIsEditingExtension(false);
      setExtensionForm({ weeks: 0, reason: "" });
    } catch (error) {
      console.error('Failed to save extension:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save extension');
    } finally {
      setIsSavingExtension(false);
    }
  };

  const handleEditExtension = () => {
    if (enrollment) {
      setExtensionForm({
        weeks: enrollment.deadline_extension_weeks || 0,
        reason: "",
      });
      setIsEditingExtension(true);
    }
  };

  // Fetch enrollment data
  const { data: enrollment, error: enrollmentError, isLoading: enrollmentLoading } = useEnrollment(enrollmentId);

  // Fetch locations for dropdown
  const { data: locations = [] } = useLocations();
  const locationOptions = locations.filter(loc => loc !== "Various");

  // Calculate preview effective end date when extension weeks change
  const previewEffectiveEndDate = useMemo(() => {
    if (!enrollment?.first_lesson_date || !isEditingExtension) return null;
    const firstLesson = new Date(enrollment.first_lesson_date + "T00:00:00Z");
    const lessonsPaid = enrollment.lessons_paid || 0;
    const totalWeeks = lessonsPaid + extensionForm.weeks;
    const endDate = new Date(firstLesson);
    endDate.setUTCDate(endDate.getUTCDate() + totalWeeks * 7);
    return endDate.toISOString().split("T")[0];
  }, [enrollment?.first_lesson_date, enrollment?.lessons_paid, extensionForm.weeks, isEditingExtension]);

  // Filter tutors by selected location and sort by first name (ignoring Mr/Ms)
  const filteredTutors = useMemo(() => {
    const selectedLocation = editForm.location || enrollment?.location;
    if (!selectedLocation) {
      return [...allTutors].sort((a, b) =>
        getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name))
      );
    }
    return allTutors
      .filter(t => t.default_location === selectedLocation)
      .sort((a, b) =>
        getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name))
      );
  }, [allTutors, editForm.location, enrollment?.location]);

  // Day options
  const DAY_OPTIONS = [
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
  ];

  // Time options (day-dependent)
  const WEEKDAY_TIME_OPTIONS = [
    "16:45 - 18:15", "18:25 - 19:55"
  ];

  const WEEKEND_TIME_OPTIONS = [
    "10:00 - 11:30", "11:45 - 13:15", "14:30 - 16:00", "16:15 - 17:45", "18:00 - 19:30"
  ];

  const isWeekend = ["Sat", "Sun"].includes(editForm.assigned_day || enrollment?.assigned_day || "");
  const timeOptions = isWeekend ? WEEKEND_TIME_OPTIONS : WEEKDAY_TIME_OPTIONS;

  // Other options
  const PAYMENT_STATUS_OPTIONS = ["Pending Payment", "Paid", "Cancelled"];
  const ENROLLMENT_TYPE_OPTIONS = ["Regular", "One-Time", "Trial"];



  // Dynamic page title
  usePageTitle(
    enrollment ? `Enrollment #${enrollment.id}` : "Loading..."
  );

  // Session popover state
  const [popoverSession, setPopoverSession] = useState<Session | null>(null);
  const [sessionClickPosition, setSessionClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Fetch sessions for this enrollment
  const { data: enrollmentSessions = [], isLoading: sessionsLoading } = useEnrollmentSessions(enrollmentId);

  // Sync popover session with updated data from SWR (e.g., after marking attended)
  useEffect(() => {
    if (popoverSession && enrollmentSessions) {
      const updatedSession = enrollmentSessions.find((s) => s.id === popoverSession.id);
      if (updatedSession && updatedSession !== popoverSession) {
        setPopoverSession(updatedSession);
      }
    }
  }, [enrollmentSessions, popoverSession]);

  // Sort sessions by date (most recent first)
  const sortedSessions = useMemo(() => {
    return [...enrollmentSessions].sort((a, b) =>
      new Date(b.session_date).getTime() - new Date(a.session_date).getTime()
    );
  }, [enrollmentSessions]);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch fee message when panel is opened or language changes
  useEffect(() => {
    if (!showFeePanel || !enrollment?.id) return;

    let cancelled = false;
    setFeeMessageLoading(true);

    enrollmentsAPI.getFeeMessage(enrollment.id, feeLanguage, enrollment.lessons_paid || 6)
      .then(response => {
        if (!cancelled) {
          setFeeMessage(response.message);
          setOriginalFeeMessage(response.message);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error("Failed to fetch fee message:", err);
          setFeeMessage("Failed to generate fee message");
        }
      })
      .finally(() => {
        if (!cancelled) setFeeMessageLoading(false);
      });

    return () => { cancelled = true; };
  }, [showFeePanel, enrollment?.id, feeLanguage, enrollment?.lessons_paid]);

  // Calculate session stats
  const sessionStats = useMemo(() => {
    const completed = enrollmentSessions.filter(s =>
      s.session_status === 'Attended' || s.session_status === 'Attended (Make-up)'
    ).length;
    const scheduled = enrollmentSessions.filter(s =>
      s.session_status === 'Scheduled' ||
      s.session_status === 'Trial Class' ||
      s.session_status === 'Make-up Class'
    ).length;
    const pendingMakeup = enrollmentSessions.filter(s =>
      s.session_status?.includes('Pending Make-up')
    ).length;
    return { completed, scheduled, pendingMakeup, total: enrollmentSessions.length };
  }, [enrollmentSessions]);

  if (enrollmentLoading) {
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
            <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>

          {/* Content Skeleton */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  if (enrollmentError || !enrollment) {
    return (
      <DeskSurface>
        <PageTransition className="flex h-full items-center justify-center p-8">
          <StickyNote variant="pink" size="lg" showTape={true}>
            <div className="text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Enrollment not found</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 mb-4">
                {enrollmentError instanceof Error ? enrollmentError.message : "Unable to load enrollment data"}
              </p>
              <button
                onClick={() => router.back()}
                className="px-4 py-2 bg-[#a0704b] text-white rounded-lg hover:bg-[#8b6140] transition-colors"
              >
                Go Back
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
          {/* Header */}
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

            {/* Enrollment ID */}
            <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
              #{enrollment.id}
            </span>

            {/* Location (only when All Locations selected) */}
            {selectedLocation === "All Locations" && enrollment.location && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {enrollment.location}
              </span>
            )}

            {/* Student ID */}
            {enrollment.school_student_id && (
              <span className="text-sm font-bold text-gray-600 dark:text-gray-400">
                {enrollment.school_student_id}
              </span>
            )}

            {/* Student Name Link */}
            <Link
              href={`/students/${enrollment.student_id}`}
              className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 hover:text-[#a0704b] dark:hover:text-[#cd853f] transition-colors flex items-center gap-1"
            >
              {enrollment.student_name}
              <ExternalLink className="h-4 w-4 opacity-50" />
            </Link>

            {/* Schedule Badge */}
            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium">
              {formatScheduleBadge(enrollment.assigned_day, enrollment.assigned_time)}
            </span>

            <div className="flex-1" />

            {/* Session count */}
            <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
              <Calendar className="h-4 w-4" />
              <span>{sessionStats.total} session{sessionStats.total !== 1 ? 's' : ''}</span>
            </div>
          </motion.div>

          {/* Main Content Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Schedule & Tutor Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className={cn(
                "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
                !isMobile && "paper-texture",
                isEditingSchedule && "ring-2 ring-amber-400"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Schedule & Tutor
                </h3>
                {isEditingSchedule ? (
                  <div className="flex items-center gap-2">
                    {saveError && (
                      <span className="text-xs text-red-500 max-w-[120px] truncate" title={saveError}>
                        {saveError}
                      </span>
                    )}
                    <button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleEditSchedule}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                    title="Edit schedule"
                  >
                    <Pencil className="h-3.5 w-3.5 text-gray-400 group-hover:text-amber-600" />
                  </button>
                )}
              </div>
              
              <div className="space-y-4">
                {isEditingSchedule ? (
                  // EDIT MODE
                  <>
                    {/* Day */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-500 w-24">Day</label>
                      <select
                        value={editForm.assigned_day || ""}
                        onChange={(e) => handleFormChange("assigned_day", e.target.value)}
                        className="flex-1 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm"
                      >
                        <option value="">Select day...</option>
                        {DAY_OPTIONS.map(day => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                    </div>

                    {/* Time */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-500 w-24">Time</label>
                      {isCustomTime ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="e.g. 15:00 - 16:30"
                            value={editForm.assigned_time || ""}
                            onChange={(e) => handleFormChange("assigned_time", e.target.value)}
                            className="flex-1 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setIsCustomTime(false)}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                          >
                            Back
                          </button>
                        </div>
                      ) : (
                        <select
                          value={timeOptions.includes(editForm.assigned_time || "") ? editForm.assigned_time : ""}
                          onChange={(e) => {
                            if (e.target.value === "__custom__") {
                              setIsCustomTime(true);
                              handleFormChange("assigned_time", "");
                            } else {
                              handleFormChange("assigned_time", e.target.value);
                            }
                          }}
                          className="flex-1 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm"
                        >
                          <option value="">Select time...</option>
                          {timeOptions.map(time => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                          <option value="__custom__">Other (custom)...</option>
                        </select>
                      )}
                    </div>

                    {/* Location */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-500 w-24">Location</label>
                      <select
                        value={editForm.location || ""}
                        onChange={(e) => {
                          handleFormChange("location", e.target.value);
                          handleFormChange("tutor_id", null); // Reset tutor when location changes
                        }}
                        className="flex-1 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm"
                      >
                        <option value="">Select location...</option>
                        {locationOptions.map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>

                    {/* Tutor */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-500 w-24">Tutor</label>
                      <select
                        value={editForm.tutor_id || ""}
                        onChange={(e) => handleFormChange("tutor_id", e.target.value ? parseInt(e.target.value) : null)}
                        className="flex-1 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm"
                      >
                        <option value="">Select tutor...</option>
                        {filteredTutors.map(tutor => (
                          <option key={tutor.id} value={tutor.id}>{tutor.tutor_name}</option>
                        ))}
                      </select>
                    </div>

                    {/* First Lesson Date */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-500 w-24">First Lesson</label>
                      <input
                        type="date"
                        value={editForm.first_lesson_date || ""}
                        onChange={(e) => handleFormChange("first_lesson_date", e.target.value)}
                        className="flex-1 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm"
                      />
                    </div>

                    {/* Enrollment Type */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-500 w-24">Type</label>
                      <select
                        value={editForm.enrollment_type || ""}
                        onChange={(e) => handleFormChange("enrollment_type", e.target.value)}
                        className="flex-1 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm"
                      >
                        <option value="">Select type...</option>
                        {ENROLLMENT_TYPE_OPTIONS.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  // VIEW MODE
                  <>
                    {/* Schedule Display */}
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                        <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {enrollment.assigned_day || 'Not set'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {enrollment.assigned_time || 'Time not set'}
                        </p>
                      </div>
                    </div>

                    {/* Tutor */}
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                        <User className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {enrollment.tutor_name || 'Not assigned'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Tutor</p>
                      </div>
                    </div>

                    {/* Location */}
                    {enrollment.location && (
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                          <MapPin className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {enrollment.location}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Location</p>
                        </div>
                      </div>
                    )}

                    {/* First Lesson Date */}
                    {enrollment.first_lesson_date && (
                      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">First Lesson</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatShortDate(enrollment.first_lesson_date)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Effective End Date */}
                    {enrollment.effective_end_date && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Enrollment Ends</span>
                        <span className={cn(
                          "text-sm font-medium",
                          new Date(enrollment.effective_end_date) < new Date()
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-900 dark:text-gray-100"
                        )}>
                          {formatShortDate(enrollment.effective_end_date)}
                          {(enrollment.deadline_extension_weeks ?? 0) > 0 && (
                            <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                              (+{enrollment.deadline_extension_weeks}w ext)
                            </span>
                          )}
                        </span>
                      </div>
                    )}

                    {/* Enrollment Type */}
                    {enrollment.enrollment_type && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Type</span>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          enrollment.enrollment_type === 'Regular'
                            ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                            : enrollment.enrollment_type === 'Trial'
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                              : "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                        )}>
                          {enrollment.enrollment_type}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>

            {/* Payment Summary Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className={cn(
                "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
                !isMobile && "paper-texture",
                isEditingPayment && "ring-2 ring-amber-400"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment Summary
                </h3>
                {isEditingPayment ? (
                  <div className="flex items-center gap-2">
                    {saveError && (
                      <span className="text-xs text-red-500 max-w-[120px] truncate" title={saveError}>
                        {saveError}
                      </span>
                    )}
                    <button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleEditPayment}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                    title="Edit payment"
                  >
                    <Pencil className="h-3.5 w-3.5 text-gray-400 group-hover:text-amber-600" />
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {isEditingPayment ? (
                  // EDIT MODE
                  <>
                    {/* Payment Status */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-500 w-24">Status</label>
                      <select
                        value={editForm.payment_status || ""}
                        onChange={(e) => handleFormChange("payment_status", e.target.value)}
                        className="flex-1 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm"
                      >
                        <option value="">Select status...</option>
                        {PAYMENT_STATUS_OPTIONS.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>

                    {/* Lessons Paid */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-500 w-24">Lessons Paid</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.lessons_paid || ""}
                        onChange={(e) => handleFormChange("lessons_paid", e.target.value ? parseInt(e.target.value) : null)}
                        className="flex-1 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm"
                      />
                    </div>

                    {/* Payment Date */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-500 w-24">Payment Date</label>
                      <input
                        type="date"
                        value={editForm.payment_date || ""}
                        onChange={(e) => handleFormChange("payment_date", e.target.value)}
                        className="flex-1 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm"
                      />
                    </div>

                    {/* Discount - read only */}
                    {enrollment.discount_name && (
                      <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Discount</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 font-medium">
                          {enrollment.discount_name}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  // VIEW MODE
                  <>
                    {/* Payment Status */}
                    {(() => {
                      const displayStatus = getDisplayPaymentStatus(enrollment);
                      return (
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-12 w-12 rounded-lg flex items-center justify-center",
                            displayStatus === 'Paid'
                              ? "bg-green-100 dark:bg-green-900/50"
                              : displayStatus === 'Overdue'
                                ? "bg-red-100 dark:bg-red-900/50"
                                : displayStatus === 'Pending Payment'
                                  ? "bg-amber-100 dark:bg-amber-900/50"
                                  : "bg-gray-100 dark:bg-gray-900/50"
                          )}>
                            <CreditCard className={cn(
                              "h-6 w-6",
                              displayStatus === 'Paid'
                                ? "text-green-600 dark:text-green-400"
                                : displayStatus === 'Overdue'
                                  ? "text-red-600 dark:text-red-400"
                                  : displayStatus === 'Pending Payment'
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-gray-600 dark:text-gray-400"
                            )} />
                          </div>
                          <div>
                            <p className={cn(
                              "text-lg font-semibold",
                              displayStatus === 'Paid'
                                ? "text-green-600 dark:text-green-400"
                                : displayStatus === 'Overdue'
                                  ? "text-red-600 dark:text-red-400"
                                  : displayStatus === 'Pending Payment'
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-gray-600 dark:text-gray-400"
                            )}>
                              {displayStatus}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Payment Status</p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Lessons Paid */}
                    {enrollment.lessons_paid && (
                      <div className="flex items-center justify-between py-3 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Lessons Paid</span>
                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {enrollment.lessons_paid}
                        </span>
                      </div>
                    )}

                    {/* Payment Date */}
                    {enrollment.payment_date && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Payment Date</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {formatShortDate(enrollment.payment_date)}
                        </span>
                      </div>
                    )}

                    {/* Discount */}
                    {enrollment.discount_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Discount</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 font-medium">
                          {enrollment.discount_name}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Session Stats - always visible (read-only) */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Session Progress</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">{sessionStats.completed}</p>
                      <p className="text-xs text-gray-500">Attended</p>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{sessionStats.scheduled}</p>
                      <p className="text-xs text-gray-500">Scheduled</p>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                      <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{sessionStats.pendingMakeup}</p>
                      <p className="text-xs text-gray-500">Pending</p>
                    </div>
                  </div>
                </div>

                {/* Fee Message & Actions - Collapsible */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setShowFeePanel(!showFeePanel)}
                    className="w-full flex items-center justify-between px-3 py-2 -mx-3 rounded-lg text-sm font-medium text-[#a0704b] dark:text-[#cd853f] hover:bg-[#a0704b]/10 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Fee Message & Actions
                    </span>
                    {showFeePanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  <AnimatePresence>
                    {showFeePanel && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4 space-y-4">
                          {/* Language & Lessons selector */}
                          <div className="flex items-center justify-between gap-4 flex-wrap">
                            {/* Language toggle */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">Language:</span>
                              <div className="flex rounded overflow-hidden border border-[#d4a574]">
                                <button
                                  onClick={() => setFeeLanguage('zh')}
                                  className={cn(
                                    "px-2 py-1 text-xs font-medium transition-colors",
                                    feeLanguage === 'zh'
                                      ? "bg-[#a0704b] text-white"
                                      : "bg-white dark:bg-gray-800 text-gray-600 hover:bg-gray-100"
                                  )}
                                >
                                  中文
                                </button>
                                <button
                                  onClick={() => setFeeLanguage('en')}
                                  className={cn(
                                    "px-2 py-1 text-xs font-medium transition-colors border-l border-[#d4a574]",
                                    feeLanguage === 'en'
                                      ? "bg-[#a0704b] text-white"
                                      : "bg-white dark:bg-gray-800 text-gray-600 hover:bg-gray-100"
                                  )}
                                >
                                  EN
                                </button>
                              </div>
                            </div>

                            {/* Lessons paid display */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">Lessons:</span>
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {enrollment.lessons_paid || 6}
                              </span>
                            </div>
                          </div>

                          {/* Fee message textarea */}
                          {feeMessageLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
                              <span className="ml-2 text-sm text-gray-500">Generating...</span>
                            </div>
                          ) : (
                            <div>
                              <textarea
                                value={feeMessage}
                                onChange={(e) => isEditingMessage && setFeeMessage(e.target.value)}
                                readOnly={!isEditingMessage}
                                className={cn(
                                  "w-full h-48 p-3 text-xs font-mono rounded-lg border resize-none transition-colors",
                                  isEditingMessage
                                    ? "border-[#a0704b] bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#a0704b]/30"
                                    : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 cursor-default"
                                )}
                              />
                              <label className="flex items-center gap-2 mt-2 text-xs text-gray-500 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isEditingMessage}
                                  onChange={(e) => setIsEditingMessage(e.target.checked)}
                                  className="rounded border-gray-300 text-[#a0704b] focus:ring-[#a0704b]"
                                />
                                Edit before copying
                                {isEditingMessage && feeMessage !== originalFeeMessage && (
                                  <button onClick={handleResetMessage} className="text-[#a0704b] hover:underline ml-1">
                                    Reset
                                  </button>
                                )}
                              </label>
                            </div>
                          )}

                          {/* Action buttons - responsive grid */}
                          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
                            {/* Copy Fee */}
                            <button
                              onClick={handleCopyFee}
                              disabled={feeMessageLoading}
                              className={cn(
                                "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                                copied
                                  ? "bg-green-500 text-white"
                                  : "bg-[#a0704b] hover:bg-[#8b6140] text-white"
                              )}
                            >
                              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              {copied ? "Copied!" : "Copy Fee"}
                            </button>

                            {/* Mark Sent / Unmark Sent */}
                            {enrollment?.fee_message_sent ? (
                              <button
                                onClick={handleUnmarkSent}
                                disabled={markingSent}
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-gray-300 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                              >
                                {markingSent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                                Unmark Sent
                              </button>
                            ) : (
                              <button
                                onClick={handleMarkSent}
                                disabled={markingSent}
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                              >
                                {markingSent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                Mark Sent
                              </button>
                            )}

                            {/* Confirm Payment - only show if not already paid */}
                            {enrollment?.payment_status !== "Paid" && (
                              <button
                                onClick={() => setConfirmPayment(true)}
                                disabled={markingPaid}
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
                              >
                                {markingPaid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                                Confirm Payment
                              </button>
                            )}

                            {/* Cancel Enrollment - only show if not already cancelled */}
                            {enrollment?.payment_status !== "Cancelled" && (
                              <button
                                onClick={() => setConfirmCancel(true)}
                                disabled={isCancelling}
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                              >
                                {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                                Cancel Enrollment
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Deadline Extension Section - Admin Only */}
          {isAdmin && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className={cn(
                "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
                !isMobile && "paper-texture"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Deadline Extension
                </h3>
                {!isEditingExtension && (
                  <button
                    onClick={handleEditExtension}
                    className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                )}
              </div>

              {isEditingExtension ? (
                /* Edit Mode */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Extension Weeks
                    </label>
                    <select
                      value={extensionForm.weeks}
                      onChange={(e) => setExtensionForm({ ...extensionForm, weeks: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#a0704b] focus:border-transparent"
                    >
                      {[...Array(53)].map((_, i) => (
                        <option key={i} value={i}>{i} week{i !== 1 ? 's' : ''}</option>
                      ))}
                    </select>
                  </div>

                  {/* Preview of new end date */}
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">New Effective End Date:</span>
                      <span className="font-medium text-blue-700 dark:text-blue-300">
                        {previewEffectiveEndDate || 'N/A'}
                      </span>
                    </div>
                    {enrollment.effective_end_date && previewEffectiveEndDate !== enrollment.effective_end_date && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        (Currently: {enrollment.effective_end_date})
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={extensionForm.reason}
                      onChange={(e) => setExtensionForm({ ...extensionForm, reason: e.target.value })}
                      placeholder="Enter reason for extension (required for audit trail)"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-[#a0704b] focus:border-transparent resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditingExtension(false)}
                      className="px-4 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveExtension}
                      disabled={isSavingExtension || !extensionForm.reason.trim()}
                      className="px-4 py-2 text-sm rounded-md bg-[#a0704b] hover:bg-[#8a5f3d] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isSavingExtension ? (
                        <>
                          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Extension'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Extension Weeks</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {enrollment.deadline_extension_weeks || 0} week{(enrollment.deadline_extension_weeks || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Effective End Date</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {enrollment.effective_end_date || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {enrollment.last_extension_date && (
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Last extended on {enrollment.last_extension_date} by {enrollment.extension_granted_by || 'Unknown'}
                      </p>
                    </div>
                  )}

                  {enrollment.extension_notes && (
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setShowExtensionHistory(!showExtensionHistory)}
                        className="text-xs text-[#a0704b] hover:text-[#8a5f3d] flex items-center gap-1"
                      >
                        <History className="h-3 w-3" />
                        {showExtensionHistory ? 'Hide' : 'View'} Extension History
                      </button>

                      {showExtensionHistory && (
                        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg max-h-48 overflow-y-auto">
                          <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                            {enrollment.extension_notes}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Session History */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className={cn(
              "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
              !isMobile && "paper-texture"
            )}
          >
            <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Session History ({sortedSessions.length})
            </h3>

            {sessionsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : sortedSessions.length === 0 ? (
              <div className="flex justify-center py-8">
                <StickyNote variant="yellow" size="sm" showTape={true}>
                  <div className="text-center">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-600 dark:text-gray-400" />
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No sessions yet</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Sessions will appear here once scheduled
                    </p>
                  </div>
                </StickyNote>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedSessions.map((session, index) => {
                  const statusConfig = getSessionStatusConfig(getDisplayStatus(session));
                  const StatusIcon = statusConfig.Icon;
                  const sessionDate = new Date(session.session_date + 'T00:00:00');

                  return (
                    <motion.div
                      key={session.id}
                      onClick={(e) => {
                        setSessionClickPosition({ x: e.clientX, y: e.clientY });
                        setPopoverSession(session);
                      }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: isMobile ? 0 : index * 0.03, duration: 0.2 }}
                      className={cn(
                        "flex rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors",
                        statusConfig.bgTint,
                        popoverSession?.id === session.id && "ring-2 ring-[#a0704b]"
                      )}
                    >
                      <div className="flex-1 p-3 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-gray-400 font-mono">#{session.id}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className="text-xs text-gray-400">|</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {session.time_slot}
                          </span>
                          {session.financial_status && (
                            <>
                              <span className="text-xs text-gray-400">|</span>
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
                })}
              </div>
            )}
          </motion.div>
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

      {/* Schedule Change Review Modal */}
      {enrollment && (
        <ScheduleChangeReviewModal
          isOpen={isScheduleModalOpen}
          onClose={() => {
            setIsScheduleModalOpen(false);
            setEditForm({});
          }}
          enrollmentId={enrollment.id}
          currentSchedule={{
            day: enrollment.assigned_day || '',
            time: enrollment.assigned_time || '',
            location: enrollment.location || '',
            tutorId: enrollment.tutor_id || 0,
            tutorName: enrollment.tutor_name || '',
          }}
          newSchedule={{
            day: editForm.assigned_day || enrollment.assigned_day || '',
            time: editForm.assigned_time || enrollment.assigned_time || '',
            location: editForm.location || enrollment.location || '',
            tutorId: editForm.tutor_id || enrollment.tutor_id || 0,
            tutorName: allTutors.find(t => t.id === (editForm.tutor_id || enrollment.tutor_id))?.tutor_name || '',
          }}
          onSuccess={handleScheduleChangeSuccess}
        />
      )}

      {/* Confirm Payment Dialog */}
      <ConfirmDialog
        isOpen={confirmPayment}
        onCancel={() => setConfirmPayment(false)}
        onConfirm={handleConfirmPayment}
        title="Confirm Payment"
        message={`Mark enrollment #${enrollment?.id} for ${enrollment?.student_name} as Paid?`}
        confirmText={markingPaid ? "Processing..." : "Confirm Payment"}
        loading={markingPaid}
        variant="default"
      />

      {/* Cancel Enrollment Dialog */}
      <ConfirmDialog
        isOpen={confirmCancel}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={handleCancelEnrollment}
        title="Cancel Enrollment"
        message={`Are you sure you want to cancel enrollment #${enrollment?.id} for ${enrollment?.student_name}? This action cannot be undone.`}
        confirmText={isCancelling ? "Cancelling..." : "Cancel Enrollment"}
        loading={isCancelling}
        variant="danger"
      />
    </DeskSurface>
  );
}
