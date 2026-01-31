"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { FlaskConical, Plus, Calendar, User, MapPin, CreditCard, ArrowRight, Loader2, RefreshCcw, X, Search, ArrowUpDown, Phone, Clock, UserX, CheckCircle2, ClipboardList, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR from "swr";
import { enrollmentsAPI, TrialListItem } from "@/lib/api";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
import { EnrollmentDetailModal } from "@/components/enrollments/EnrollmentDetailModal";
import { RecordContactModal } from "@/components/parent-contacts/RecordContactModal";

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
  const sessionDate = new Date(trial.session_date);
  const isToday = new Date().toDateString() === sessionDate.toDateString();
  const isPast = sessionDate < new Date() && !isToday;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg border-2 p-3",
        "border-[#d4a574] dark:border-[#8b6f47]",
        "paper-texture shadow-sm",
        "hover:shadow-md transition-shadow cursor-pointer",
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
        {/* Payment Status Badge */}
        <span className={cn(
          "px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
          trial.payment_status === "Paid"
            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
            : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
        )}>
          {trial.payment_status === "Paid" ? "Paid" : "Pending"}
        </span>
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
          <span>{trial.tutor_name}</span>
          <span className="text-foreground/50">•</span>
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{trial.location}</span>
        </div>
      </div>

      {/* Actions - Show for attended/lost trials */}
      {showContactButton && (
        <div className="mt-3 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] space-y-2">
          {/* Record Contact - all users */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRecordContact(trial.student_id);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 w-full justify-center border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-sm font-medium transition-colors"
          >
            <Phone className="h-4 w-4" />
            Record Contact
          </button>
          {/* Convert to Regular - admin only, pending status only */}
          {isAdmin && trial.trial_status === 'pending' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConvert(trial);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 w-full justify-center bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium transition-colors"
            >
              <ArrowRight className="h-4 w-4" />
              Convert to Regular
            </button>
          )}
        </div>
      )}

      {/* Converted info */}
      {trial.trial_status === 'converted' && trial.subsequent_enrollment_id && (
        <div className="mt-2 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
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
}: ColumnProps) {
  const headerColorClass = color
    ? COLUMN_COLOR_CLASSES[color]
    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';

  return (
    <div className="flex-1 min-w-[280px] max-w-[400px] flex flex-col h-full">
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
        "p-2 rounded-b-lg flex-1 min-h-0 overflow-y-auto",
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

  // Comparison mode state (trial + subsequent enrollment side-by-side)
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonTrialId, setComparisonTrialId] = useState<number | null>(null);
  const [comparisonSubsequentId, setComparisonSubsequentId] = useState<number | null>(null);

  // Contact modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactStudentId, setContactStudentId] = useState<number | null>(null);

  // Track screen size for responsive modal layout
  const [isLargeScreen, setIsLargeScreen] = useState(true);
  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [timeRange, setTimeRange] = useState<"30" | "90" | "academic" | "all">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [groupBy, setGroupBy] = useState<"status" | "school" | "grade">("status");
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
          const sessionDate = new Date(trial.session_date);
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
    setCreateModalOpen(true);
  }, []);

  const handleNewTrial = useCallback(() => {
    setConvertFromTrial(null);
    setCreateModalOpen(true);
  }, []);

  const handleCreateSuccess = useCallback(() => {
    mutate();
    setCreateModalOpen(false);
    setConvertFromTrial(null);
  }, [mutate]);

  const handleRecordContact = useCallback((studentId: number) => {
    setContactStudentId(studentId);
    setContactModalOpen(true);
  }, []);

  return (
    <DeskSurface>
      <PageTransition className="h-[calc(100vh-5rem)] sm:h-[calc(100vh-2.5rem)] p-4 pb-2 sm:p-6 sm:pb-2 overflow-hidden">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm p-4 sm:p-6 h-full flex flex-col">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                  <FlaskConical className="h-5 w-5 sm:h-6 sm:w-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                    Trials
                  </h1>
                  <p className="text-sm text-foreground/60">
                    {isTutorView ? "Your trial sessions" : "Manage trial enrollments"}
                  </p>
                </div>
              </div>

              {isAdmin && (
                <button
                  onClick={handleNewTrial}
                  className="flex items-center gap-2 px-2 sm:px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New Trial</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="pl-9 pr-8 py-1.5 w-40 sm:w-48 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <X className="h-4 w-4 text-foreground/40" />
                </button>
              )}
            </div>

            {/* Time Range Filter */}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
              className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="academic">This academic year</option>
              <option value="all">All time</option>
            </select>

            {/* Group By Filter */}
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
              className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="status">By Status</option>
              <option value="school">By School</option>
              <option value="grade">By Grade</option>
            </select>

            {/* Sort Toggle */}
            <button
              onClick={() => setSortOrder(prev => prev === "newest" ? "oldest" : "newest")}
              className="flex items-center gap-1.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <ArrowUpDown className="h-4 w-4" />
              {sortOrder === "newest" ? "Newest" : "Oldest"}
            </button>

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
          {!isLoading && (
            <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-4">
              {groupBy === "status" ? (
                // Status-based columns (fixed 4 columns)
                COLUMNS.map((column) => (
                  <TrialColumn
                    key={column.id}
                    label={column.label}
                    description={column.description}
                    color={column.color}
                    Icon={column.Icon}
                    trials={(groupedTrials as Record<ColumnId, TrialListItem[]>)[column.id] || []}
                    onConvert={handleConvert}
                    onViewDetails={handleViewDetails}
                    onRecordContact={handleRecordContact}
                    showLocationPrefix={selectedLocation === "All Locations"}
                    isAdmin={isAdmin}
                    showContactButton={column.id === 'pending' || column.id === 'lost'}
                  />
                ))
              ) : (
                // Dynamic columns (school or grade)
                dynamicColumns.map((columnKey) => (
                  <TrialColumn
                    key={columnKey}
                    label={columnKey}
                    trials={(groupedTrials as Record<string, TrialListItem[]>)[columnKey] || []}
                    onConvert={handleConvert}
                    onViewDetails={handleViewDetails}
                    onRecordContact={handleRecordContact}
                    showLocationPrefix={selectedLocation === "All Locations"}
                    isAdmin={isAdmin}
                    showContactButton={(trial) => trial.trial_status !== 'converted' && trial.trial_status !== 'scheduled'}
                  />
                ))
              )}
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
                <button
                  onClick={handleNewTrial}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  New Trial
                </button>
              )}
            </div>
          )}
        </div>

        {/* Create Enrollment Modal */}
        <CreateEnrollmentModal
          isOpen={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false);
            setConvertFromTrial(null);
          }}
          onSuccess={handleCreateSuccess}
          trialMode={!convertFromTrial}
          // When converting, pre-fill student info
          convertFromTrial={convertFromTrial || undefined}
        />

        {/* Enrollment Detail Modal */}
        {selectedEnrollmentId && (
          <EnrollmentDetailModal
            isOpen={detailModalOpen}
            onClose={() => {
              setDetailModalOpen(false);
              setSelectedEnrollmentId(null);
            }}
            enrollmentId={selectedEnrollmentId}
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

        {/* Comparison mode: Trial + Subsequent Enrollment side-by-side */}
        <AnimatePresence mode="wait">
          {comparisonMode && (
            <motion.div
              key="comparison-container"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden"
            >
              {/* Backdrop */}
              <motion.div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={handleCloseComparison}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />

              {/* Modal container - responsive: side-by-side on large, stacked on narrow */}
              <div className={cn(
                "relative flex h-[85vh]",
                isLargeScreen
                  ? "items-center max-w-[60rem]"
                  : "flex-col max-w-[22rem] w-full"
              )}>
                {/* Close button - floating top right */}
                <button
                  onClick={handleCloseComparison}
                  className={cn(
                    "absolute z-10 p-1.5 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                    isLargeScreen ? "-top-2 -right-2" : "top-2 right-2"
                  )}
                >
                  <X className="h-5 w-5 text-foreground/60" />
                </button>

                {/* Side-by-side on large, stacked on narrow */}
                <LayoutGroup>
                  <motion.div
                    layout
                    className={cn(
                      "flex",
                      isLargeScreen
                        ? "items-stretch"
                        : "flex-col gap-4 flex-1 overflow-y-auto py-2"
                    )}
                  >
                    {/* Trial Enrollment */}
                    <motion.div
                      layoutId="trial-enrollment"
                      className={cn("w-[22rem] max-w-full", isLargeScreen && "opacity-75")}
                      transition={{
                        layout: { type: "spring", stiffness: 300, damping: 30 }
                      }}
                    >
                      <EnrollmentDetailModal
                        isOpen={true}
                        onClose={handleCloseComparison}
                        enrollmentId={comparisonTrialId}
                        compact={true}
                        standalone={false}
                        hideCloseButton={true}
                        headerLabel="Trial"
                      />
                    </motion.div>

                    {/* Arrow between panels - only on large screens */}
                    {isLargeScreen && (
                      <div className="flex items-center px-3">
                        <ArrowRight className="h-6 w-6 text-foreground/30" />
                      </div>
                    )}

                    {/* Subsequent Enrollment */}
                    <motion.div
                      layoutId="subsequent-enrollment"
                      className="w-[22rem] max-w-full ring-2 ring-green-400/50 dark:ring-green-500/50 rounded-lg"
                      transition={{
                        layout: { type: "spring", stiffness: 300, damping: 30 }
                      }}
                    >
                      <EnrollmentDetailModal
                        isOpen={true}
                        onClose={handleCloseComparison}
                        enrollmentId={comparisonSubsequentId}
                        compact={true}
                        standalone={false}
                        hideCloseButton={true}
                        headerLabel="Enrolled"
                      />
                    </motion.div>
                  </motion.div>
                </LayoutGroup>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PageTransition>
    </DeskSurface>
  );
}
