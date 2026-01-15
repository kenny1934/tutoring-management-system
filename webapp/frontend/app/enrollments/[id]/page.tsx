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
  ExternalLink, X, CheckCircle2, HandCoins, Pencil
} from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig, getDisplayStatus } from "@/lib/session-status";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { useLocation } from "@/contexts/LocationContext";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { formatShortDate } from "@/lib/formatters";
import { getDisplayPaymentStatus } from "@/lib/enrollment-utils";

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

  // Edit mode state
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Enrollment>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCustomTime, setIsCustomTime] = useState(false);

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
  
  // Fetch enrollment data
  const { data: enrollment, error: enrollmentError, isLoading: enrollmentLoading } = useEnrollment(enrollmentId);

  // Fetch locations for dropdown
  const { data: locations = [] } = useLocations();
  const locationOptions = locations.filter(loc => loc !== "Various");

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
                              : "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300"
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
              </div>
            </motion.div>
          </div>

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
    </DeskSurface>
  );
}
