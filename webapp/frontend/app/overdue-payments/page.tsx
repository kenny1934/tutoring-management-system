"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useTutors, usePageTitle, useOverdueEnrollments, useDebouncedValue, useFilteredList } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { TutorSelector, type TutorValue, ALL_TUTORS } from "@/components/selectors/TutorSelector";
import { enrollmentsAPI } from "@/lib/api";
import { AlertTriangle, Loader2, DollarSign, Calendar, ExternalLink, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { mutate } from "swr";
import type { OverdueEnrollment } from "@/types";
import { AdminPageGuard } from "@/components/auth/AdminPageGuard";

// Urgency levels
type UrgencyLevel = 'critical' | 'high' | 'medium' | 'new' | 'dueSoon';

interface UrgencyConfig {
  label: string;
  sectionLabel: string;
  min: number;
  max: number;
  bgColor: string;
  borderColor: string;
  textColor: string;
  badgeBg: string;
}

const URGENCY_LEVELS: Record<UrgencyLevel, UrgencyConfig> = {
  critical: {
    label: '30+ Days',
    sectionLabel: '30+ Days Overdue',
    min: 30,
    max: Infinity,
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
    textColor: 'text-red-600 dark:text-red-400',
    badgeBg: 'bg-red-100 dark:bg-red-900/40',
  },
  high: {
    label: '15-30 Days',
    sectionLabel: '15-30 Days Overdue',
    min: 15,
    max: 29,
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-200 dark:border-orange-800',
    textColor: 'text-orange-600 dark:text-orange-400',
    badgeBg: 'bg-orange-100 dark:bg-orange-900/40',
  },
  medium: {
    label: '8-14 Days',
    sectionLabel: '8-14 Days Overdue',
    min: 8,
    max: 14,
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-200 dark:border-amber-800',
    textColor: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
  },
  new: {
    label: '1-7 Days',
    sectionLabel: '1-7 Days Overdue',
    min: 1,
    max: 7,
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    textColor: 'text-yellow-600 dark:text-yellow-400',
    badgeBg: 'bg-yellow-100 dark:bg-yellow-900/40',
  },
  dueSoon: {
    label: 'Due Soon',
    sectionLabel: 'Starting This Week',
    min: -7,
    max: 0,
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-600 dark:text-blue-400',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/40',
  },
};

function getUrgencyLevel(daysOverdue: number): UrgencyLevel {
  if (daysOverdue >= 30) return 'critical';
  if (daysOverdue >= 15) return 'high';
  if (daysOverdue >= 8) return 'medium';
  if (daysOverdue >= 1) return 'new';
  return 'dueSoon';
}

const OVERDUE_SEARCH_FIELDS: (keyof OverdueEnrollment)[] = ['student_name', 'school_student_id', 'tutor_name', 'grade'];

export default function OverduePaymentsPage() {
  usePageTitle("Overdue Payments");

  const searchParams = useSearchParams();
  const urgencyFilter = searchParams.get('urgency') as UrgencyLevel | null;

  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const { data: tutors = [] } = useTutors();
  const { showToast } = useToast();

  const [selectedTutorId, setSelectedTutorId] = useState<TutorValue>(ALL_TUTORS);
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [markingPaidId, setMarkingPaidId] = useState<number | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<OverdueEnrollment | null>(null);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Pagination limits per urgency section
  const [sectionLimits, setSectionLimits] = useState<Record<UrgencyLevel, number>>({
    critical: 10,
    high: 10,
    medium: 10,
    new: 10,
    dueSoon: 10,
  });

  // Determine effective location
  const effectiveLocation = useMemo(() => {
    return selectedLocation && selectedLocation !== "All Locations" ? selectedLocation : undefined;
  }, [selectedLocation]);

  // Determine effective tutor ID for API calls
  const effectiveTutorId = useMemo(() => {
    if (viewMode === 'my-view' && tutors.length > 0) {
      const filteredTutors = effectiveLocation
        ? tutors.filter(t => t.default_location === effectiveLocation)
        : tutors;
      if (typeof selectedTutorId === 'number') return selectedTutorId;
      if (filteredTutors.length > 0) return filteredTutors[0].id;
    }
    if (selectedTutorId === ALL_TUTORS) return undefined;
    if (typeof selectedTutorId === 'number') return selectedTutorId;
    return undefined;
  }, [selectedTutorId, viewMode, tutors, effectiveLocation]);

  // Fetch overdue enrollments
  const { data: overdueEnrollments = [], isLoading, mutate: mutateOverdue } = useOverdueEnrollments(
    effectiveLocation,
    effectiveTutorId
  );

  // Auto-select tutor for my-view mode
  useEffect(() => {
    if (viewMode === 'my-view' && tutors.length > 0) {
      const filteredTutors = effectiveLocation
        ? tutors.filter(t => t.default_location === effectiveLocation)
        : tutors;
      if (filteredTutors.length > 0 && selectedTutorId === ALL_TUTORS) {
        setSelectedTutorId(filteredTutors[0].id);
      }
    }
  }, [tutors, effectiveLocation, viewMode, selectedTutorId]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setSectionLimits({
      critical: 10,
      high: 10,
      medium: 10,
      new: 10,
      dueSoon: 10,
    });
  }, [effectiveLocation, effectiveTutorId, debouncedSearch]);

  // Search filter (applied before urgency grouping so counts update)
  const searchFilteredEnrollments = useFilteredList(
    overdueEnrollments,
    debouncedSearch,
    OVERDUE_SEARCH_FIELDS
  );

  // Group enrollments by urgency level
  const enrollmentsByUrgency = useMemo(() => {
    const grouped: Record<UrgencyLevel, OverdueEnrollment[]> = {
      critical: [],
      high: [],
      medium: [],
      new: [],
      dueSoon: [],
    };
    for (const enrollment of searchFilteredEnrollments) {
      const level = getUrgencyLevel(enrollment.days_overdue);
      grouped[level].push(enrollment);
    }
    return grouped;
  }, [searchFilteredEnrollments]);

  // Filter by URL param if present
  const filteredEnrollmentsByUrgency = useMemo(() => {
    if (!urgencyFilter || !URGENCY_LEVELS[urgencyFilter]) {
      return enrollmentsByUrgency;
    }
    // Show only the filtered urgency level
    const filtered: Record<UrgencyLevel, OverdueEnrollment[]> = {
      critical: [],
      high: [],
      medium: [],
      new: [],
      dueSoon: [],
    };
    filtered[urgencyFilter] = enrollmentsByUrgency[urgencyFilter];
    return filtered;
  }, [enrollmentsByUrgency, urgencyFilter]);

  // Count by urgency level
  const urgencyCounts = useMemo(() => ({
    critical: enrollmentsByUrgency.critical.length,
    high: enrollmentsByUrgency.high.length,
    medium: enrollmentsByUrgency.medium.length,
    new: enrollmentsByUrgency.new.length,
    dueSoon: enrollmentsByUrgency.dueSoon.length,
  }), [enrollmentsByUrgency]);

  // Count only actual overdue (not due soon)
  const overdueCount = useMemo(() =>
    urgencyCounts.critical + urgencyCounts.high + urgencyCounts.medium + urgencyCounts.new,
  [urgencyCounts]);

  // Open payment modal
  const handleMarkPaid = useCallback((enrollment: OverdueEnrollment) => {
    setSelectedEnrollment(enrollment);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setShowPaymentModal(true);
  }, []);

  // Submit payment
  const handleSubmitPayment = useCallback(async () => {
    if (!selectedEnrollment) return;

    setMarkingPaidId(selectedEnrollment.id);
    try {
      await enrollmentsAPI.update(selectedEnrollment.id, {
        payment_status: 'Paid',
        payment_date: paymentDate,
      });

      // Revalidate data
      mutateOverdue();
      mutate(['dashboard-stats']);

      showToast(`Payment recorded for ${selectedEnrollment.student_name}`, "success");
      setShowPaymentModal(false);
      setSelectedEnrollment(null);
    } catch (error) {
      showToast("Failed to record payment", "error");
    } finally {
      setMarkingPaidId(null);
    }
  }, [selectedEnrollment, paymentDate, mutateOverdue, showToast]);

  return (
    <DeskSurface>
      <AdminPageGuard accessDeniedMessage="Admin access required to view overdue payments">
      <PageTransition>
        <div className="min-h-screen">
          <div className="flex flex-col gap-3 p-2 sm:p-4">
            {/* Toolbar */}
            <div className={cn(
              "sticky top-0 z-30",
              "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47]",
              "rounded-lg px-3 sm:px-4 py-2",
              !isMobile && "paper-texture"
            )}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full">
                {/* Title and filters */}
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap flex-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                    <h1 className="text-lg font-semibold">Overdue Payments</h1>
                    {urgencyFilter && URGENCY_LEVELS[urgencyFilter] && (
                      <Link
                        href="/overdue-payments"
                        className={cn(
                          "px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1",
                          URGENCY_LEVELS[urgencyFilter].badgeBg,
                          URGENCY_LEVELS[urgencyFilter].textColor
                        )}
                      >
                        {URGENCY_LEVELS[urgencyFilter].label}
                        <span className="text-[10px]">×</span>
                      </Link>
                    )}
                  </div>

                  {/* Tutor Selector (center-view only) */}
                  {viewMode === 'center-view' && (
                    <TutorSelector
                      value={selectedTutorId}
                      onChange={setSelectedTutorId}
                      location={effectiveLocation}
                      showAllTutors
                    />
                  )}
                </div>

                {/* Total count badge */}
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium",
                    overdueCount > 0
                      ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                      : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  )}>
                    {overdueCount} Overdue
                  </span>
                </div>
              </div>

              {/* Search input */}
              <div className="mt-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by student, ID, tutor, or grade..."
                  className={cn(
                    "w-full pl-9 pr-8 py-1.5 text-sm rounded-lg",
                    "border border-[#e8d4b8] dark:border-[#6b5a4a]",
                    "bg-white dark:bg-[#1a1a1a]",
                    "placeholder-gray-400",
                    "focus:outline-none focus:ring-1 focus:ring-[#a0704b] dark:focus:ring-[#cd853f]",
                    "focus:border-[#a0704b] dark:focus:border-[#cd853f]"
                  )}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-[#3d3628]"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Main content */}
            <div className="space-y-4">
              {/* Urgency Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {(['critical', 'high', 'medium', 'new', 'dueSoon'] as UrgencyLevel[]).map((level) => {
                  const config = URGENCY_LEVELS[level];
                  const count = urgencyCounts[level];
                  return (
                    <div
                      key={level}
                      className={cn(
                        "rounded-lg border p-3 text-center",
                        config.bgColor,
                        config.borderColor
                      )}
                    >
                      <div className={cn("text-2xl font-bold", config.textColor)}>
                        {count}
                      </div>
                      <div className="text-sm text-muted-foreground">{config.label}</div>
                    </div>
                  );
                })}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : overdueEnrollments.length === 0 ? (
                <StickyNote icon={DollarSign} color="green">
                  <p className="text-lg font-medium">All payments are up to date!</p>
                  <p className="text-muted-foreground">
                    No overdue payments found for the current filters.
                  </p>
                </StickyNote>
              ) : searchFilteredEnrollments.length === 0 ? (
                <StickyNote icon={Search} color="yellow">
                  <p className="text-lg font-medium">No results found</p>
                  <p className="text-muted-foreground">
                    No overdue enrollments match &quot;{debouncedSearch}&quot;
                  </p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="mt-2 text-sm text-[#a0704b] dark:text-[#cd853f] hover:underline"
                  >
                    Clear search
                  </button>
                </StickyNote>
              ) : (
                <>
                  {/* Overdue Enrollments by Urgency Level */}
                  {(['critical', 'high', 'medium', 'new', 'dueSoon'] as UrgencyLevel[]).map((level) => {
                    const enrollments = filteredEnrollmentsByUrgency[level];
                    if (enrollments.length === 0) return null;
                    const config = URGENCY_LEVELS[level];
                    const isDueSoon = level === 'dueSoon';

                    return (
                      <div
                        key={level}
                        className={cn(
                          "bg-white dark:bg-[#1a1a1a] rounded-xl border shadow-sm overflow-hidden",
                          config.borderColor,
                          !isMobile && "paper-texture"
                        )}
                      >
                        <div className={cn(
                          "px-4 py-3 border-b flex items-center justify-between",
                          config.bgColor,
                          config.borderColor
                        )}>
                          <h2 className={cn("font-medium flex items-center gap-2", config.textColor)}>
                            {isDueSoon ? <Calendar className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                            {config.sectionLabel}
                          </h2>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-medium",
                            config.badgeBg,
                            config.textColor
                          )}>
                            {enrollments.length}
                          </span>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="px-4 py-3 text-left font-medium w-20">ID#</th>
                                <th className="px-4 py-3 text-left font-medium min-w-[120px]">Student</th>
                                <th className="px-4 py-3 text-left font-medium w-16">Grade</th>
                                <th className="px-4 py-3 text-left font-medium min-w-[100px]">Instructor</th>
                                <th className="px-4 py-3 text-left font-medium w-28">Schedule</th>
                                <th className="px-4 py-3 text-left font-medium w-28">First Lesson</th>
                                <th className="px-4 py-3 text-center font-medium w-16">Days</th>
                                <th className="px-4 py-3 text-center font-medium w-16">Lessons</th>
                                <th className="px-4 py-3 text-right w-36"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
                              {enrollments.slice(0, sectionLimits[level]).map((enrollment) => (
                                <OverdueRow
                                  key={enrollment.id}
                                  enrollment={enrollment}
                                  onMarkPaid={handleMarkPaid}
                                  isMarking={markingPaidId === enrollment.id}
                                  urgencyConfig={config}
                                  showLocationPrefix={selectedLocation === "All Locations"}
                                />
                              ))}
                            </tbody>
                            {enrollments.length > sectionLimits[level] && (
                              <tfoot>
                                <tr>
                                  <td colSpan={9} className="px-4 py-2 text-center">
                                    <button
                                      onClick={() => setSectionLimits(prev => ({
                                        ...prev,
                                        [level]: prev[level] + 10
                                      }))}
                                      className="text-sm font-medium text-[#a0704b] dark:text-[#cd853f] hover:underline"
                                    >
                                      Show {Math.min(10, enrollments.length - sectionLimits[level])} more...
                                    </button>
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Payment Modal */}
        {showPaymentModal && selectedEnrollment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowPaymentModal(false)} />
            <div className={cn(
              "relative bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl shadow-xl max-w-md w-full min-w-[400px] mx-4 p-6",
              "border-2 border-[#d4a574] dark:border-[#8b6f47]",
              "paper-texture"
            )}>
              <h3 className="text-lg font-semibold mb-2">Record Payment</h3>
              <p className="text-muted-foreground mb-4">
                Mark payment as received for <strong>{selectedEnrollment.student_name}</strong>
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border",
                    "border-[#d4a574] dark:border-[#6b5a4a]",
                    "bg-white dark:bg-[#1a1a1a]",
                    "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/20"
                  )}
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-[#d4a574] dark:border-[#8b6f47] text-[#a0704b] dark:text-[#cd853f] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitPayment}
                  disabled={markingPaidId !== null}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium",
                    "bg-green-600 text-white hover:bg-green-700",
                    "disabled:opacity-50"
                  )}
                >
                  {markingPaidId !== null ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Confirm Payment"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </PageTransition>
      </AdminPageGuard>
    </DeskSurface>
  );
}

// Overdue Row Component
function OverdueRow({
  enrollment,
  onMarkPaid,
  isMarking,
  urgencyConfig,
  showLocationPrefix,
}: {
  enrollment: OverdueEnrollment;
  onMarkPaid: (enrollment: OverdueEnrollment) => void;
  isMarking: boolean;
  urgencyConfig: UrgencyConfig;
  showLocationPrefix: boolean;
}) {
  const schedule = useMemo(() => {
    if (enrollment.assigned_day && enrollment.assigned_time) {
      return `${enrollment.assigned_day} ${enrollment.assigned_time}`;
    }
    return enrollment.assigned_day || enrollment.assigned_time || "-";
  }, [enrollment.assigned_day, enrollment.assigned_time]);

  return (
    <tr className="hover:bg-[#f5ede3]/50 dark:hover:bg-[#3d3628]/50 transition-colors">
      {/* ID */}
      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
        {showLocationPrefix && enrollment.location && `${enrollment.location}-`}{enrollment.school_student_id || "-"}
      </td>
      {/* Name */}
      <td className="px-4 py-3 font-medium">
        <Link
          href={`/students/${enrollment.student_id}`}
          className="hover:text-[#a0704b] dark:hover:text-[#cd853f] hover:underline"
        >
          {enrollment.student_name}
        </Link>
      </td>
      {/* Grade */}
      <td className="px-4 py-3">{enrollment.grade || "-"}</td>
      {/* Tutor */}
      <td className="px-4 py-3">{enrollment.tutor_name || "-"}</td>
      {/* Schedule */}
      <td className="px-4 py-3 text-xs">{schedule}</td>
      {/* First Lesson */}
      <td className="px-4 py-3 text-xs">{enrollment.first_lesson_date}</td>
      {/* Days Overdue / Until */}
      <td className="px-4 py-3 text-center whitespace-nowrap">
        <span className={cn(
          "px-2 py-0.5 rounded-full text-xs font-medium inline-block",
          urgencyConfig.badgeBg,
          urgencyConfig.textColor
        )}>
          {enrollment.days_overdue === 0
            ? "Today"
            : enrollment.days_overdue < 0
            ? `in ${Math.abs(enrollment.days_overdue)}d`
            : enrollment.days_overdue}
        </span>
      </td>
      {/* Lessons Paid */}
      <td className="px-4 py-3 text-center font-medium">
        {enrollment.lessons_paid}
      </td>
      {/* Actions */}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-2 flex-nowrap">
          <button
            onClick={() => onMarkPaid(enrollment)}
            disabled={isMarking}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              "bg-green-600 text-white shadow-sm",
              "hover:bg-green-700 hover:shadow",
              "disabled:opacity-50"
            )}
          >
            {isMarking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Confirm Payment
          </button>
          <Link
            href={`/enrollments/${enrollment.id}`}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
              "bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b] dark:text-[#cd853f]",
              "hover:bg-[#e8d4b8] dark:hover:bg-[#4d4638]"
            )}
          >
            <ExternalLink className="h-3 w-3" />
            View
          </Link>
        </div>
      </td>
    </tr>
  );
}
