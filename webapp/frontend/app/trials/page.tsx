"use client";

import Link from "next/link";
import { trialBillingPreviewHref } from "@/lib/billing-preview";
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageSurface } from "@/components/layout/PageSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { FlaskConical, Plus, Calendar, User, MapPin, ArrowRight, Loader2, RefreshCcw, X, Search, ArrowUpDown, Phone, Clock, UserX, CheckCircle2, ClipboardList, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR from "swr";
import { enrollmentsAPI, TrialListItem } from "@/lib/api";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
import { EnrollmentDetailModal } from "@/components/enrollments/EnrollmentDetailModal";
import { RecordContactModal } from "@/components/parent-contacts/RecordContactModal";
import { TutorLink } from "@/components/tutors/TutorLink";
import { Button, Input, PageHeader, Select } from "@/components/controls";
import { useAsSheet } from "@/hooks/usePopoverSheet";
import { useScrollFade } from "@/hooks/useScrollFade";
import { TrialConversionWorkspace, TrialWorkspaceOverlay } from "@/components/trials/TrialConversionWorkspace";

// Column configuration
const COLUMNS = [
  { id: 'scheduled', label: 'Scheduled', color: 'blue', description: 'Upcoming trial sessions', Icon: Calendar },
  { id: 'pending', label: 'Attended', color: 'amber', description: 'Awaiting conversion decision', Icon: Clock },
  { id: 'lost', label: 'Lost', color: 'red', description: 'No conversion after 2+ weeks', Icon: UserX },
  { id: 'converted', label: 'Converted', color: 'green', description: 'Enrolled in regular course', Icon: CheckCircle2 },
] as const;

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

type ColumnId = typeof COLUMNS[number]['id'];

// Color classes for columns - moved to module level to avoid recreation
const COLUMN_COLOR_CLASSES = {
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
} as const;

// Trial Card Component - memoized to prevent unnecessary re-renders
const TrialCard = React.memo(function TrialCard({
  trial,
  onConvert,
  onViewDetails,
  onRecordContact,
  showLocationPrefix,
  isAdmin,
  showContactButton,
}: {
  trial: TrialListItem;
  onConvert: (trial: TrialListItem) => void;
  onViewDetails: (trial: TrialListItem) => void;
  onRecordContact: (studentId: number) => void;
  showLocationPrefix?: boolean;
  isAdmin?: boolean;
  showContactButton?: boolean;
}) {
  const sessionDate = new Date(trial.session_date + 'T00:00:00');
  const isToday = new Date().toDateString() === sessionDate.toDateString();
  const isPast = sessionDate < new Date() && !isToday;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "bg-paper rounded-lg border border-line p-3",
        "hover:bg-tint/50 transition-colors cursor-pointer",
        "group"
      )}
      onClick={() => onViewDetails(trial)}
    >
      {/* Student Info Badges */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <StudentInfoBadges
            student={{
              student_id: trial.student_id,
              student_name: trial.student_name,
              school_student_id: trial.school_student_id,
              grade: trial.grade,
              lang_stream: trial.lang_stream,
              school: trial.school,
              home_location: trial.location,
            }}
            showLocationPrefix={showLocationPrefix}
          />
        </div>
        {/* Payment Status Badge - show subsequent enrollment's status for converted trials */}
        {(() => {
          const displayStatus = trial.trial_status === 'converted' && trial.subsequent_payment_status
            ? trial.subsequent_payment_status
            : trial.payment_status;
          return (
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
              displayStatus === "Paid"
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
            )}>
              {displayStatus === "Paid" ? "Paid" : "Pending"}
            </span>
          );
        })()}
      </div>

      {/* Session Info */}
      <div className="space-y-1 text-sm text-foreground/70">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          <span className={cn(
            isToday && "text-blue-600 dark:text-blue-400 font-medium",
            isPast && trial.trial_status === 'scheduled' && "text-red-600 dark:text-red-400"
          )}>
            {sessionDate.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })}
            {isToday && " (Today)"}
          </span>
          <span className="text-foreground/50">•</span>
          <span>{trial.time_slot}</span>
        </div>
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 flex-shrink-0" />
          <TutorLink tutorId={trial.tutor_id} tutorName={trial.tutor_name} />
          <span className="text-foreground/50">•</span>
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{trial.location}</span>
        </div>
      </div>

      {/* Actions - Show for attended/lost trials */}
      {showContactButton && (
        <div className="mt-3 pt-2 border-t border-line space-y-2">
          {trial.trial_status === "pending" && (
            <Link href={trialBillingPreviewHref(trial)} onClick={e => e.stopPropagation()} className="block rounded border border-line px-3 py-1.5 text-center text-xs font-medium hover:bg-tint">
              Preview enrollment fees
            </Link>
          )}
          {/* Record Contact - all users */}
          <Button
            size="sm"
            icon={Phone}
            onClick={(e) => {
              e.stopPropagation();
              onRecordContact(trial.student_id);
            }}
            className="w-full"
          >
            Record contact
          </Button>
          {/* Convert to Regular - admin only, pending status only */}
          {isAdmin && trial.trial_status === 'pending' && (
            <Button
              size="sm"
              icon={ArrowRight}
              onClick={(e) => {
                e.stopPropagation();
                onConvert(trial);
              }}
              className="w-full"
            >
              Convert to Regular
            </Button>
          )}
        </div>
      )}

      {/* Converted info */}
      {trial.trial_status === 'converted' && trial.subsequent_enrollment_id && (
        <div className="mt-2 pt-2 border-t border-line">
          <span className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
            <RefreshCcw className="h-3 w-3" />
            Enrolled in regular course
          </span>
        </div>
      )}
    </motion.div>
  );
});

// Unified Column Component - handles both status-based and dynamic grouping
interface ColumnProps {
  label: string;
  description?: string;
  color?: keyof typeof COLUMN_COLOR_CLASSES;
  Icon?: LucideIcon;
  trials: TrialListItem[];
  onConvert: (trial: TrialListItem) => void;
  onViewDetails: (trial: TrialListItem) => void;
  onRecordContact: (studentId: number) => void;
  showLocationPrefix?: boolean;
  isAdmin?: boolean;
  showContactButton?: boolean | ((trial: TrialListItem) => boolean);
  /** On a phone the one column shown takes the full width and grows to fit. */
  fullWidth?: boolean;
}

// Unified Column Component - merged KanbanColumn and DynamicColumn to reduce duplication
const TrialColumn = React.memo(function TrialColumn({
  label,
  description,
  color,
  Icon,
  trials,
  onConvert,
  onViewDetails,
  onRecordContact,
  showLocationPrefix,
  isAdmin,
  showContactButton,
  fullWidth,
}: ColumnProps) {
  const headerColorClass = color
    ? COLUMN_COLOR_CLASSES[color]
    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';

  return (
    // 240px lets all four status columns fit side by side at 1440 with the
    // sidebar open. Narrower screens still scroll the board sideways.
    <div className={cn("flex flex-col", fullWidth ? "w-full" : "flex-1 min-w-[240px] max-w-[400px] h-full")}>
      {/* Column Header */}
      <div className={cn("px-3 py-2 rounded-t-lg border-b-2", headerColorClass)}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold truncate flex items-center gap-1.5">
            {Icon && <Icon className="h-4 w-4" />}
            {label}
          </h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/50 dark:bg-black/20 flex-shrink-0">
            {trials.length}
          </span>
        </div>
        {description && <p className="text-xs opacity-75 mt-0.5">{description}</p>}
      </div>

      {/* Column Content */}
      <div className={cn(
        "p-2 rounded-b-lg",
        !fullWidth && "flex-1 min-h-0 overflow-y-auto",
        "bg-gray-50/50 dark:bg-gray-900/20 border border-t-0",
        "border-gray-200 dark:border-gray-700"
      )}>
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {trials.map((trial) => {
              const shouldShow = typeof showContactButton === 'function'
                ? showContactButton(trial)
                : showContactButton;
              return (
                <TrialCard
                  key={trial.enrollment_id}
                  trial={trial}
                  onConvert={onConvert}
                  onViewDetails={onViewDetails}
                  onRecordContact={onRecordContact}
                  showLocationPrefix={showLocationPrefix}
                  isAdmin={isAdmin}
                  showContactButton={shouldShow}
                />
              );
            })}
          </AnimatePresence>
          {trials.length === 0 && (
            <div className="text-center py-8 text-foreground/40 text-sm">
              No trials
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default function TrialsPage() {
  usePageTitle("Trials");
  const { user, isAdmin, effectiveRole, isImpersonating, impersonatedTutor } = useAuth();
  const { selectedLocation } = useLocation();

  // Get effective tutor ID for filtering (tutors see only their trials)
  const currentTutorId = (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id)
    ? impersonatedTutor.id
    : user?.id;

  const isTutorView = effectiveRole === 'Tutor';

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(null);
  const [convertFromTrial, setConvertFromTrial] = useState<TrialListItem | null>(null);

  // Tab view for narrow screens (when detail + create are both open)
  const [modalTabView, setModalTabView] = useState<'detail' | 'create'>('detail');

  // Comparison mode state (trial + subsequent enrollment side-by-side)
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonTrialId, setComparisonTrialId] = useState<number | null>(null);
  const [comparisonSubsequentId, setComparisonSubsequentId] = useState<number | null>(null);

  // Contact modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactStudentId, setContactStudentId] = useState<number | null>(null);

  const [conversionBusy, setConversionBusy] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [timeRange, setTimeRange] = useState<"30" | "90" | "academic" | "all">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [groupBy, setGroupBy] = useState<"status" | "school" | "grade">("status");
  // On a phone the board shows one column at a time, picked from a row of
  // chips, and the page scrolls as a whole.
  const onPhone = useAsSheet();
  const [phoneColumnKey, setPhoneColumnKey] = useState<string | null>(null);
  const chipsFade = useScrollFade<HTMLDivElement>();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          setSearchQuery("");
          searchInputRef.current?.blur();
        }
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch trials
  const { data: trials, isLoading, mutate } = useSWR(
    ['trials', selectedLocation, isTutorView ? currentTutorId : null],
    () => enrollmentsAPI.getTrials({
      location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
      tutor_id: isTutorView ? currentTutorId : undefined,
    }),
    { revalidateOnFocus: false }
  );

  // Group trials by status/school/grade for Kanban columns (with filtering and sorting)
  const { groupedTrials, dynamicColumns, totalFiltered } = useMemo(() => {
    if (!trials) return { groupedTrials: {} as Record<string, TrialListItem[]>, dynamicColumns: [] as string[], totalFiltered: 0 };

    // 1. Filter by search
    let filtered = trials;
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter(t =>
        t.student_name.toLowerCase().includes(query) ||
        (t.school_student_id?.toLowerCase().includes(query) ?? false)
      );
    }

    // 2. Filter by time range
    if (timeRange !== "all") {
      const now = new Date();
      let startDate: Date;

      if (timeRange === "30") {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (timeRange === "90") {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      } else if (timeRange === "academic") {
        const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        startDate = new Date(year, 8, 1);
      } else {
        startDate = new Date(0);
      }

      filtered = filtered.filter(t => {
        const sessionDate = new Date(t.session_date);
        return sessionDate >= startDate;
      });
    }

    const totalFiltered = filtered.length;

    // Sort function for all groups
    const sortFn = (a: TrialListItem, b: TrialListItem) => {
      const dateA = new Date(a.session_date).getTime();
      const dateB = new Date(b.session_date).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    };

    // 3. Group by selected mode
    if (groupBy === "status") {
      // Group by status (original 4-column layout)
      const groups: Record<ColumnId, TrialListItem[]> = {
        scheduled: [],
        pending: [],
        lost: [],
        converted: [],
      };

      for (const trial of filtered) {
        if (trial.trial_status === 'converted') {
          groups.converted.push(trial);
        } else if (trial.trial_status === 'pending' || trial.trial_status === 'attended') {
          const sessionDate = new Date(trial.session_date + 'T00:00:00');
          const timeSinceSession = Date.now() - sessionDate.getTime();
          if (timeSinceSession > TWO_WEEKS_MS) {
            groups.lost.push(trial);
          } else {
            groups.pending.push(trial);
          }
        } else if (trial.trial_status === 'no_show') {
          groups.pending.push(trial);
        } else {
          groups.scheduled.push(trial);
        }
      }

      for (const key of Object.keys(groups) as ColumnId[]) {
        groups[key].sort(sortFn);
      }

      return { groupedTrials: groups, dynamicColumns: [], totalFiltered };
    } else {
      // Group by school or grade (dynamic columns)
      const groups: Record<string, TrialListItem[]> = {};
      const field = groupBy === "school" ? "school" : "grade";

      for (const trial of filtered) {
        const key = trial[field] || "(No " + (groupBy === "school" ? "School" : "Grade") + ")";
        if (!groups[key]) groups[key] = [];
        groups[key].push(trial);
      }

      // Sort each group
      for (const key of Object.keys(groups)) {
        groups[key].sort(sortFn);
      }

      // Get sorted column keys
      const columnKeys = Object.keys(groups).sort((a, b) => {
        if (a.startsWith("(No")) return 1;
        if (b.startsWith("(No")) return -1;
        return a.localeCompare(b);
      });

      return { groupedTrials: groups, dynamicColumns: columnKeys, totalFiltered };
    }
  }, [trials, debouncedSearch, timeRange, sortOrder, groupBy]);

  // The board's columns, whichever way the trials are grouped.
  const boardColumns = useMemo(() => {
    const byKey = groupedTrials as Record<string, TrialListItem[]>;
    if (groupBy === "status") {
      return COLUMNS.map((column) => ({
        key: column.id as string,
        label: column.label as string,
        description: column.description as string | undefined,
        color: column.color as ColumnProps["color"],
        Icon: column.Icon as LucideIcon | undefined,
        trials: byKey[column.id] || [],
        showContactButton: (column.id === "pending" || column.id === "lost") as ColumnProps["showContactButton"],
      }));
    }
    const showContact = (trial: TrialListItem) => trial.trial_status !== "converted" && trial.trial_status !== "scheduled";
    return dynamicColumns.map((key) => ({
      key,
      label: key,
      description: undefined,
      color: undefined,
      Icon: undefined,
      trials: byKey[key] || [],
      showContactButton: showContact as ColumnProps["showContactButton"],
    }));
  }, [groupBy, groupedTrials, dynamicColumns]);

  // The column a phone shows: the one picked, or else the first with trials
  // in it, so the board doesn't open on an empty column.
  const phoneColumn =
    boardColumns.find((column) => column.key === phoneColumnKey) ??
    boardColumns.find((column) => column.trials.length > 0) ??
    boardColumns[0];

  // Memoized handlers to prevent unnecessary re-renders of memoized children
  const handleViewDetails = useCallback((trial: TrialListItem) => {
    // For converted trials, open comparison mode to show trial + subsequent enrollment
    if (trial.trial_status === 'converted' && trial.subsequent_enrollment_id) {
      setComparisonTrialId(trial.enrollment_id);
      setComparisonSubsequentId(trial.subsequent_enrollment_id);
      setComparisonMode(true);
    } else {
      // Regular detail view for non-converted trials
      setSelectedEnrollmentId(trial.enrollment_id);
      setDetailModalOpen(true);
    }
  }, []);

  const handleCloseComparison = useCallback(() => {
    setComparisonMode(false);
    setComparisonTrialId(null);
    setComparisonSubsequentId(null);
  }, []);

  const handleConvert = useCallback((trial: TrialListItem) => {
    setConvertFromTrial(trial);
    setSelectedEnrollmentId(trial.enrollment_id);
    setDetailModalOpen(true);
    setCreateModalOpen(true);
    setModalTabView('create');
  }, []);

  const handleNewTrial = useCallback(() => {
    setConvertFromTrial(null);
    setCreateModalOpen(true);
  }, []);

  const handleCreateSuccess = useCallback(() => {
    mutate();
    setCreateModalOpen(false);
    setConvertFromTrial(null);
    setDetailModalOpen(false);
    setSelectedEnrollmentId(null);
  }, [mutate]);

  const handleConvertCloseAll = useCallback(() => {
    if (conversionBusy) return;
    setDetailModalOpen(false);
    setSelectedEnrollmentId(null);
    setCreateModalOpen(false);
    setConvertFromTrial(null);
  }, [conversionBusy]);

  const handleConvertCreateClose = useCallback(() => {
    if (conversionBusy) return;
    setCreateModalOpen(false);
    setConvertFromTrial(null);
  }, [conversionBusy]);

  const handleRecordContact = useCallback((studentId: number) => {
    setContactStudentId(studentId);
    setContactModalOpen(true);
  }, []);

  return (
    <PageSurface>
      <PageTransition className="md:h-[calc(100dvh-2.5rem)] p-4 pb-2 sm:p-6 sm:pb-2 md:overflow-hidden">
        <div className="bg-paper dark:bg-raised rounded-xl border border-line shadow-sm p-4 sm:p-6 md:h-full flex flex-col">
          <PageHeader
            icon={FlaskConical}
            title="Trials"
            subtitle={isTutorView ? "Your trial sessions" : "Manage trial enrollments"}
            className="mb-4"
            actions={isAdmin && (
              <Button variant="primary" icon={Plus} onClick={handleNewTrial} aria-label="New trial">
                <span className="hidden sm:inline">New trial</span>
              </Button>
            )}
          />

          {/* Filter Bar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
              <Input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                enterKeyHint="search" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                aria-label="Search trials"
                className="pl-9 pr-8 w-40 sm:w-48"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <X className="h-4 w-4 text-foreground/40" />
                </button>
              )}
            </div>

            {/* Time Range Filter */}
            <Select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
              aria-label="Time range"
              className="w-auto"
            >
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="academic">This academic year</option>
              <option value="all">All time</option>
            </Select>

            {/* Group By Filter */}
            <Select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
              aria-label="Group trials"
              className="w-auto"
            >
              <option value="status">By status</option>
              <option value="school">By school</option>
              <option value="grade">By grade</option>
            </Select>

            {/* Sort Toggle */}
            <Button
              icon={ArrowUpDown}
              onClick={() => setSortOrder(prev => prev === "newest" ? "oldest" : "newest")}
              title="Change the sort order"
            >
              {sortOrder === "newest" ? "Newest" : "Oldest"}
            </Button>

            {/* Result count */}
            {trials && (
              <span className="text-sm text-foreground/50 ml-auto">
                {totalFiltered} trial{totalFiltered !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-foreground/40" />
            </div>
          )}

          {/* Kanban Board */}
          {!isLoading && onPhone && phoneColumn && (
            <>
              <div
                ref={chipsFade.ref}
                style={chipsFade.style}
                role="tablist"
                aria-label="Trial columns"
                className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 scrollbar-hide"
              >
                {boardColumns.map((column) => {
                  const on = column.key === phoneColumn.key;
                  const Icon = column.Icon;
                  return (
                    <button
                      key={column.key}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setPhoneColumnKey(column.key)}
                      className={cn(
                        "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                        on
                          ? column.color ? COLUMN_COLOR_CLASSES[column.color] : "border-line-strong bg-tint text-foreground"
                          : "border-line text-ink-subtle active:bg-tint",
                      )}
                    >
                      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                      {column.label}
                      <span className="text-xs opacity-75">{column.trials.length}</span>
                    </button>
                  );
                })}
              </div>
              <TrialColumn
                label={phoneColumn.label}
                description={phoneColumn.description}
                color={phoneColumn.color}
                Icon={phoneColumn.Icon}
                trials={phoneColumn.trials}
                onConvert={handleConvert}
                onViewDetails={handleViewDetails}
                onRecordContact={handleRecordContact}
                showLocationPrefix={selectedLocation === "All Locations"}
                isAdmin={isAdmin}
                showContactButton={phoneColumn.showContactButton}
                fullWidth
              />
            </>
          )}
          {!isLoading && !onPhone && (
            <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-4">
              {boardColumns.map((column) => (
                <TrialColumn
                  key={column.key}
                  label={column.label}
                  description={column.description}
                  color={column.color}
                  Icon={column.Icon}
                  trials={column.trials}
                  onConvert={handleConvert}
                  onViewDetails={handleViewDetails}
                  onRecordContact={handleRecordContact}
                  showLocationPrefix={selectedLocation === "All Locations"}
                  isAdmin={isAdmin}
                  showContactButton={column.showContactButton}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && trials?.length === 0 && (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 mx-auto text-foreground/20 mb-4" />
              <h3 className="text-lg font-medium text-foreground/60 mb-2">
                No trials yet
              </h3>
              <p className="text-sm text-foreground/40 mb-4">
                {isAdmin ? "Create a trial enrollment to get started" : "No trial sessions assigned to you"}
              </p>
              {isAdmin && (
                <Button icon={Plus} onClick={handleNewTrial}>
                  New trial
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Keep the original detail and conversion panes inside the available app width. */}
        <AnimatePresence mode="wait">
          {detailModalOpen && <TrialConversionWorkspace key="detail-modal-container"
            converting={!!(createModalOpen && convertFromTrial)} tab={modalTabView} onTabChange={setModalTabView} busy={conversionBusy}
            onClose={convertFromTrial ? handleConvertCloseAll : () => { setDetailModalOpen(false); setSelectedEnrollmentId(null); }}
            detail={wide => <EnrollmentDetailModal
              isOpen={true}
              onClose={convertFromTrial ? handleConvertCloseAll : () => { setDetailModalOpen(false); setSelectedEnrollmentId(null); }}
              enrollmentId={selectedEnrollmentId}
              compact={wide && !!(createModalOpen && convertFromTrial)}
              standalone={false}
              headerLabel={convertFromTrial ? "Trial" : undefined}
            />}
            create={createModalOpen && convertFromTrial ? <CreateEnrollmentModal
              isOpen={true} onClose={handleConvertCreateClose} onSuccess={handleCreateSuccess}
              onBusyChange={setConversionBusy} convertFromTrial={convertFromTrial} standalone={false}
            /> : undefined}
          />}
        </AnimatePresence>

        {/* Standalone create modal (when opened from "New Trial" button without detail) */}
        {createModalOpen && !detailModalOpen && (
          <CreateEnrollmentModal
            isOpen={true}
            onClose={() => {
              setCreateModalOpen(false);
              setConvertFromTrial(null);
            }}
            onSuccess={handleCreateSuccess}
            trialMode={true}
          />
        )}

        {/* Record Contact Modal */}
        <RecordContactModal
          isOpen={contactModalOpen}
          onClose={() => {
            setContactModalOpen(false);
            setContactStudentId(null);
          }}
          editingContact={null}
          preselectedStudentId={contactStudentId}
          tutorId={currentTutorId}
          location={selectedLocation !== "All Locations" ? selectedLocation : undefined}
          currentUserTutorId={user?.id}
          currentUserRole={effectiveRole as 'Tutor' | 'Admin' | 'Super Admin'}
        />

        {/* Comparison mode follows the same live app bounds as conversion. */}
        <AnimatePresence mode="wait">
          {comparisonMode && <TrialWorkspaceOverlay key="comparison-container" kind="comparison" onClose={handleCloseComparison}>{wide => <div data-workspace-frame
            className={cn("relative flex h-[85dvh] w-full min-w-0", wide ? "max-w-[60rem] items-center" : "max-w-[22rem] flex-col")}>
            <button onClick={handleCloseComparison} aria-label="Close" className={cn(
              "absolute z-10 rounded-full bg-white p-1.5 shadow-lg transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700",
              wide ? "-right-2 -top-2" : "right-2 top-2"
            )}><X className="h-5 w-5 text-foreground/60" /></button>
            <div className={cn("flex w-full min-w-0", wide ? "items-stretch justify-center" : "min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2")}>
              <div className={cn("w-[22rem] min-w-0 max-w-full", wide && "opacity-75")}>
                <EnrollmentDetailModal isOpen={true} onClose={handleCloseComparison} enrollmentId={comparisonTrialId}
                  compact={true} standalone={false} hideCloseButton={true} headerLabel="Trial" />
              </div>
              {wide && <div className="flex shrink-0 items-center px-3"><ArrowRight className="h-6 w-6 text-foreground/30" /></div>}
              <div className="w-[22rem] min-w-0 max-w-full rounded-lg ring-2 ring-green-400/50 dark:ring-green-500/50">
                <EnrollmentDetailModal isOpen={true} onClose={handleCloseComparison} enrollmentId={comparisonSubsequentId}
                  compact={true} standalone={false} hideCloseButton={true} headerLabel="Enrolled" showRenewalActions={true} onStatusChange={() => mutate()} />
              </div>
            </div>
          </div>}</TrialWorkspaceOverlay>}
        </AnimatePresence>
      </PageTransition>
    </PageSurface>
  );
}
