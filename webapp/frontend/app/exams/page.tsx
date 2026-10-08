"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { toDateString, getWeekBounds, getMonthBounds, getMonthCalendarDates } from "@/lib/calendar-utils";
import { useExamsWithSlots, usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { useBackNavigation } from "@/lib/ui-hooks";
import { examRevisionAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ExamCard, EXAM_TYPE_COLORS, getTypeColors } from "@/components/exams/ExamCard";

// Lazy load modals - only imported when opened
const CreateRevisionSlotModal = dynamic(
  () => import("@/components/exams/CreateRevisionSlotModal").then(mod => ({ default: mod.CreateRevisionSlotModal })),
  { ssr: false }
);
const CalendarEventModal = dynamic(
  () => import("@/components/dashboard/CalendarEventModal").then(mod => ({ default: mod.CalendarEventModal })),
  { ssr: false }
);
import { PageSurface } from "@/components/layout/PageSurface";
import { EmptyCloud } from "@/components/illustrations/EmptyStates";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { useLocation } from "@/contexts/LocationContext";
import type { ExamWithRevisionSlots, SlotDefaults, CalendarEvent } from "@/types";
import { Button, IconButton, Input, PageHeader, Segmented, Select } from "@/components/controls";
import {
  GraduationCap,
  Loader2,
  Search,
  Calendar,
  List,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Plus,
} from "lucide-react";

type ViewStyle = "list" | "calendar";
type DatePreset = "thisWeek" | "next2Weeks" | "thisMonth" | "next30Days";

// Ordered list of known exam types for the filter dropdown
const EXAM_TYPES = ["Test", "Exam", "Quiz"] as const;

// Calendar view component
function ExamCalendarView({
  exams,
  currentMonth,
  onMonthChange,
  onExamClick,
  currentTutorId,
  location,
  onRefresh,
  onEditEvent,
  canManageEvents,
  readOnly,
}: {
  exams: ExamWithRevisionSlots[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onExamClick: (exam: ExamWithRevisionSlots) => void;
  currentTutorId: number;
  location: string | null;
  onRefresh: () => void;
  onEditEvent: (exam: ExamWithRevisionSlots) => void;
  canManageEvents: boolean;
  readOnly?: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Get calendar dates for the current month
  const calendarDates = useMemo(() => getMonthCalendarDates(currentMonth), [currentMonth]);

  // Group exams by date, pre-sorted by title
  const examsByDate = useMemo(() => {
    const map = new Map<string, ExamWithRevisionSlots[]>();
    exams.forEach((exam) => {
      const dateStr = exam.start_date.split('T')[0];
      const existing = map.get(dateStr) || [];
      existing.push(exam);
      map.set(dateStr, existing);
    });
    // Sort each date's exams by title
    map.forEach((dateExams, date) => {
      map.set(date, dateExams.sort((a, b) => a.title.localeCompare(b.title)));
    });
    return map;
  }, [exams]);

  // Get exams for selected date (already sorted)
  const selectedDateExams = selectedDate ? examsByDate.get(selectedDate) || [] : [];

  // Navigation handlers
  const goToPrevMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() - 1);
    onMonthChange(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + 1);
    onMonthChange(newDate);
  };

  const goToToday = () => {
    onMonthChange(new Date());
    setSelectedDate(toDateString(new Date()));
  };

  const today = toDateString(new Date());
  const currentMonthNum = currentMonth.getMonth();

  return (
    <div className="space-y-4">
      {/* Calendar grid */}
      <div className={cn(
        "rounded-xl border overflow-hidden",
        "bg-raised border-line",
        "paper-texture"
      )}>
        {/* Calendar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <IconButton icon={ChevronLeft} label="Previous month" onClick={goToPrevMonth} />
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h3>
            <Button size="sm" onClick={goToToday}>
              Today
            </Button>
          </div>
          <IconButton icon={ChevronRight} label="Next month" onClick={goToNextMonth} />
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-line">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {calendarDates.map((date, index) => {
            const dateStr = toDateString(date);
            const dayExams = examsByDate.get(dateStr) || [];
            const isCurrentMonth = date.getMonth() === currentMonthNum;
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const hasExams = dayExams.length > 0;

            return (
              <button
                key={index}
                onClick={() => setSelectedDate(dateStr)}
                className={cn(
                  "relative p-2 min-h-[70px] border-b border-r border-line/50 text-left transition-colors",
                  !isCurrentMonth && "bg-gray-50 dark:bg-gray-900/30",
                  isSelected && "bg-tint dark:bg-tint ring-2 ring-inset ring-primary",
                  !isSelected && hasExams && "hover:bg-paper"
                )}
              >
                <span className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm",
                  isToday && "bg-primary text-white font-bold",
                  !isToday && isCurrentMonth && "text-gray-900 dark:text-gray-100",
                  !isToday && !isCurrentMonth && "text-gray-500 dark:text-gray-400"
                )}>
                  {date.getDate()}
                </span>

                {/* Exam indicators */}
                {hasExams && (
                  <div className="mt-1 space-y-0.5">
                    {dayExams.slice(0, 2).map((exam) => {
                      const colors = getTypeColors(exam.event_type);
                      return (
                      <div
                        key={exam.id}
                        className={cn(
                          "text-[11px] px-1 py-0.5 rounded truncate",
                          colors.bg, colors.text
                        )}
                        title={exam.title}
                      >
                        {exam.title.length > 12 ? exam.title.slice(0, 12) + "…" : exam.title}
                      </div>
                      );
                    })}
                    {dayExams.length > 2 && (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 px-1">
                        +{dayExams.length - 2} more
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date exams */}
      {selectedDate && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            {selectedDateExams.length > 0 && (
              <span className="ml-2 text-gray-500 dark:text-gray-400">
                ({selectedDateExams.length} exam{selectedDateExams.length !== 1 ? "s" : ""})
              </span>
            )}
          </h4>
          {selectedDateExams.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
              No exams on this date
            </div>
          ) : (
            selectedDateExams.map((exam) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                currentTutorId={currentTutorId}
                location={location}
                onCreateSlot={() => onExamClick(exam)}
                onRefresh={onRefresh}
                onEditEvent={onEditEvent}
                canManageEvents={canManageEvents}
                readOnly={readOnly}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ExamsPage() {
  const { selectedLocation } = useLocation();
  const { user, isReadOnly, isImpersonating, impersonatedTutor, effectiveRole } = useAuth();
  const searchParams = useSearchParams();
  const goBack = useBackNavigation();
  const highlightExamId = searchParams.get('exam');
  const viewParam = searchParams.get('view');

  usePageTitle("Exam revision classes");

  // Refs for auto-scroll to highlighted exam
  const highlightedRef = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

  // Default tutor for new revision slots: the logged-in user (or impersonated tutor)
  const currentTutorId = useMemo(() => {
    if (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id) {
      return impersonatedTutor.id;
    }
    return user?.id;
  }, [user?.id, isImpersonating, effectiveRole, impersonatedTutor?.id]);

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [schoolFilter, setSchoolFilter] = useState<string>("");
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [selectedExam, setSelectedExam] = useState<ExamWithRevisionSlots | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [slotDefaults, setSlotDefaults] = useState<SlotDefaults | undefined>(undefined);
  const [viewStyle, setViewStyle] = useState<ViewStyle>("list");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  // Edit event modal state
  const canManageEvents = !!user && !isReadOnly;
  const [isEditEventModalOpen, setIsEditEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>(undefined);

  // Date range state - default to next 30 days
  const [fromDate, setFromDate] = useState<string>(() => toDateString(new Date()));
  const [toDate, setToDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return toDateString(d);
  });
  const debouncedFromDate = useDebouncedValue(fromDate, 300);
  const debouncedToDate = useDebouncedValue(toDate, 300);

  // Quick date filter helpers
  const setThisWeek = () => {
    const { start, end } = getWeekBounds(new Date());
    setFromDate(toDateString(start));
    setToDate(toDateString(end));
  };

  const setNext2Weeks = () => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 14);
    setFromDate(toDateString(today));
    setToDate(toDateString(end));
  };

  const setThisMonth = () => {
    const { start, end } = getMonthBounds(new Date());
    setFromDate(toDateString(start));
    setToDate(toDateString(end));
  };

  const setNext30Days = () => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    setFromDate(toDateString(today));
    setToDate(toDateString(end));
  };

  // Check if date range is at default (Next 30 Days from today)
  const isDefaultDateRange = useMemo(() => {
    const today = toDateString(new Date());
    const defaultEnd = new Date();
    defaultEnd.setDate(defaultEnd.getDate() + 30);
    return fromDate === today && toDate === toDateString(defaultEnd);
  }, [fromDate, toDate]);

  // Detect which preset matches current date range
  const activePreset = useMemo(() => {
    const today = toDateString(new Date());

    // Check This Week
    const { start: weekStart, end: weekEnd } = getWeekBounds(new Date());
    if (fromDate === toDateString(weekStart) && toDate === toDateString(weekEnd)) return 'thisWeek';

    // Check Next 2 Weeks
    const twoWeeksEnd = new Date();
    twoWeeksEnd.setDate(twoWeeksEnd.getDate() + 14);
    if (fromDate === today && toDate === toDateString(twoWeeksEnd)) return 'next2Weeks';

    // Check This Month
    const { start: monthStart, end: monthEnd } = getMonthBounds(new Date());
    if (fromDate === toDateString(monthStart) && toDate === toDateString(monthEnd)) return 'thisMonth';

    // Check Next 30 Days (default)
    const thirtyDaysEnd = new Date();
    thirtyDaysEnd.setDate(thirtyDaysEnd.getDate() + 30);
    if (fromDate === today && toDate === toDateString(thirtyDaysEnd)) return 'next30Days';

    return null; // Custom range
  }, [fromDate, toDate]);

  // Date params for API (debounced to avoid excessive fetching)
  const dateParams = useMemo(() => ({
    from_date: debouncedFromDate,
    to_date: debouncedToDate,
  }), [debouncedFromDate, debouncedToDate]);

  // Fetch exams with revision slots
  const { data: exams = [], isLoading, mutate } = useExamsWithSlots({
    location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
    school: schoolFilter || undefined,
    grade: gradeFilter || undefined,
    ...dateParams,
  });

  // Extract unique schools and grades for filters
  const schools = useMemo(() => {
    const schoolSet = new Set<string>();
    exams.forEach((e) => {
      if (e.school) schoolSet.add(e.school);
    });
    return Array.from(schoolSet).sort();
  }, [exams]);

  const grades = useMemo(() => {
    const gradeSet = new Set<string>();
    exams.forEach((e) => {
      if (e.grade) gradeSet.add(e.grade);
    });
    // Sort grades: F1, F2, F3, F4, F5, F6
    return Array.from(gradeSet).sort((a, b) => {
      const numA = parseInt(a.replace("F", ""));
      const numB = parseInt(b.replace("F", ""));
      return numA - numB;
    });
  }, [exams]);

  // Filter exams by search query and type filter
  const filteredExams = useMemo(() => {
    let result = exams;

    // Type filter
    if (typeFilter) {
      result = result.filter((exam) => exam.event_type === typeFilter);
    }

    // Search filter
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase();
      result = result.filter((exam) => {
        return (
          exam.title.toLowerCase().includes(query) ||
          exam.school?.toLowerCase().includes(query) ||
          exam.grade?.toLowerCase().includes(query) ||
          exam.event_type?.toLowerCase().includes(query)
        );
      });
    }

    return result;
  }, [exams, debouncedSearch, typeFilter]);

  // Sort exams by date ascending
  const sortedExams = useMemo(() => {
    return [...filteredExams].sort((a, b) => {
      const dateA = new Date(a.start_date).getTime();
      const dateB = new Date(b.start_date).getTime();
      return dateA - dateB;
    });
  }, [filteredExams]);

  // Handle creating a revision slot (with optional defaults for duplication)
  const handleCreateSlot = useCallback((exam: ExamWithRevisionSlots, defaults?: SlotDefaults) => {
    setSelectedExam(exam);
    setSlotDefaults(defaults);
    setShowCreateModal(true);
  }, []);

  // Handle successful slot creation
  const handleSlotCreated = useCallback(() => {
    mutate();
    setShowCreateModal(false);
    setSelectedExam(null);
    setSlotDefaults(undefined);
  }, [mutate]);

  // Stable refresh callback
  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  // Handle editing a calendar event
  const handleEditEvent = useCallback((exam: ExamWithRevisionSlots) => {
    setEditingEvent({
      id: exam.id,
      event_id: exam.event_id,
      title: exam.title,
      description: exam.description,
      start_date: exam.start_date,
      end_date: exam.end_date,
      school: exam.school,
      grade: exam.grade,
      academic_stream: exam.academic_stream,
      event_type: exam.event_type,
      created_at: '',
      updated_at: '',
      last_synced_at: '',
      revision_slot_count: exam.revision_slots.length,
    });
    setIsEditEventModalOpen(true);
  }, []);

  // Handle successful event edit
  const handleEditEventSuccess = useCallback(() => {
    mutate();
    setIsEditEventModalOpen(false);
    setEditingEvent(undefined);
  }, [mutate]);

  // Handle opening create event modal
  const handleOpenCreateEvent = useCallback(() => {
    setEditingEvent(undefined);
    setIsEditEventModalOpen(true);
  }, []);

  // Close type dropdown on outside click/tap or Escape key
  useEffect(() => {
    if (!typeDropdownOpen) return;
    const handleClick = (e: Event) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTypeDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [typeDropdownOpen]);

  // If URL has ?exam=ID and the exam isn't in current results, expand date range to include it
  useEffect(() => {
    if (highlightExamId && !isLoading) {
      const found = exams.some(e => String(e.id) === highlightExamId);
      if (!found) {
        examRevisionAPI.getExamDate(highlightExamId).then(data => {
          if (data?.start_date && data.start_date < fromDate) {
            setFromDate(data.start_date);
          }
        }).catch(() => {});
      }
    }
  }, [highlightExamId, isLoading, exams]);

  // Auto-scroll to highlighted exam after data loads
  useEffect(() => {
    if (highlightExamId && !isLoading && highlightedRef.current && stickyHeaderRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const headerHeight = stickyHeaderRef.current?.offsetHeight || 0;
        const element = highlightedRef.current;
        const scrollContainer = element?.closest('.overflow-y-auto') as HTMLElement | null;
        if (scrollContainer && element) {
          const elementTop = element.getBoundingClientRect().top;
          const containerTop = scrollContainer.getBoundingClientRect().top;
          const currentScroll = scrollContainer.scrollTop;
          const targetScroll = currentScroll + elementTop - containerTop - headerHeight - 16; // 16px padding
          scrollContainer.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }
      }, 100);
    }
  }, [highlightExamId, isLoading, sortedExams]);

  if (!currentTutorId) {
    return (
      <PageSurface fullHeight>
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-accent-ink" />
          </div>
        </div>
      </PageSurface>
    );
  }

  return (
    <PageSurface fullHeight>
      {/* Single scroll container */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Single sticky container for header + toolbar */}
        <div ref={stickyHeaderRef} className="sticky top-0 z-40 surface-bar">
          {/* Header */}
          <div className="p-4 sm:px-6 sm:py-4">
            <PageHeader
              onBack={goBack}
              backLabel="Back"
              icon={GraduationCap}
              title="Exam revision classes"
              subtitle="Create and manage revision sessions for upcoming exams"
              actions={
                canManageEvents && (
                  <Button
                    variant="primary"
                    icon={Plus}
                    onClick={handleOpenCreateEvent}
                    title="Add event"
                    aria-label="Add event"
                  >
                    <span className="hidden md:inline">Add event</span>
                  </Button>
                )
              }
            />
          </div>

          {/* Toolbar */}
          <div
            className={cn(
              "mx-4 sm:mx-6 mb-4",
              "bg-raised rounded-xl border border-line",
              "paper-texture"
            )}
          >
          {/* Top row: Search, School, Grade, View Toggle */}
          <div className="px-4 py-3 flex flex-wrap gap-2 sm:gap-3 items-center">
            {/* Search - full width on mobile */}
            <div className="relative w-full sm:w-auto sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
              <Input
                type="text"
                placeholder="Search exams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search exams"
                className="pl-9"
              />
            </div>

            {/* School and grade filters - half the row each on a phone, so
                "All schools" and "All grades" stay readable */}
            <div className="basis-[calc(50%-0.25rem)] min-w-0 sm:basis-auto">
              <Select
                value={schoolFilter}
                onChange={(e) => setSchoolFilter(e.target.value)}
                aria-label="Filter by school"
              >
                <option value="">All schools</option>
                {schools.map((school) => (
                  <option key={school} value={school}>
                    {school}
                  </option>
                ))}
              </Select>
            </div>

            <div className="basis-[calc(50%-0.25rem)] min-w-0 sm:basis-auto">
              <Select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                aria-label="Filter by grade"
              >
                <option value="">All grades</option>
                {grades.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </Select>
            </div>

            {/* Type filter - custom dropdown with colored dots */}
            <div ref={typeDropdownRef} className="relative flex-1 min-w-0 sm:flex-none">
              <button
                onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
                aria-label="Filter by type"
                aria-haspopup="listbox"
                aria-expanded={typeDropdownOpen}
                className="flex h-8 items-center gap-2 w-full sm:w-auto px-2.5 text-sm whitespace-nowrap border border-field rounded bg-field-fill text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
              >
                {typeFilter ? (
                  <>
                    <span className={cn("w-2 h-2 rounded-full", getTypeColors(typeFilter).dot)} />
                    <span>{typeFilter}</span>
                  </>
                ) : (
                  <span>All types</span>
                )}
                <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", typeDropdownOpen && "rotate-180")} />
              </button>
              {typeDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-full sm:w-36 z-50 bg-raised border border-line rounded-lg shadow-lg overflow-hidden">
                  <button
                    onClick={() => { setTypeFilter(""); setTypeDropdownOpen(false); }}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-tint transition-colors",
                      !typeFilter && "bg-tint font-medium"
                    )}
                  >
                    All types
                  </button>
                  {EXAM_TYPES.map((type) => {
                    const colors = EXAM_TYPE_COLORS[type];
                    return (
                      <button
                        key={type}
                        onClick={() => { setTypeFilter(type); setTypeDropdownOpen(false); }}
                        className={cn(
                          "flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-tint transition-colors",
                          typeFilter === type && "bg-tint font-medium"
                        )}
                      >
                        <span className={cn("w-2 h-2 rounded-full", colors.dot)} />
                        {type}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* View style toggle */}
            <Segmented<ViewStyle>
              label="View"
              value={viewStyle}
              onChange={setViewStyle}
              options={[
                { value: "list", icon: List, title: "List view", label: <span className="sr-only">List view</span> },
                { value: "calendar", icon: Calendar, title: "Calendar view", label: <span className="sr-only">Calendar view</span> },
              ]}
            />

          </div>

          {/* Date range row */}
          <div className="px-4 pb-3 flex flex-col sm:flex-row sm:flex-wrap gap-3 items-center border-t border-line/50 pt-3">
            {/* Date inputs */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="From date"
                className={cn("w-auto", !isDefaultDateRange && "border-primary ring-1 ring-primary/30")}
              />
              <span className="text-gray-500 text-sm">to</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="To date"
                className={cn("w-auto", !isDefaultDateRange && "border-primary ring-1 ring-primary/30")}
              />
              {!isDefaultDateRange && (
                <IconButton icon={X} size="sm" label="Reset date filter" onClick={setNext30Days} />
              )}
            </div>

            {/* Quick filters - hidden on mobile */}
            <div className="hidden sm:flex">
              <Segmented<DatePreset>
                label="Date range"
                value={activePreset as DatePreset}
                onChange={(preset) => {
                  if (preset === "thisWeek") setThisWeek();
                  else if (preset === "next2Weeks") setNext2Weeks();
                  else if (preset === "thisMonth") setThisMonth();
                  else setNext30Days();
                }}
                options={[
                  { value: "thisWeek", label: "This week" },
                  { value: "next2Weeks", label: "Next 2 weeks" },
                  { value: "thisMonth", label: "This month" },
                  { value: "next30Days", label: "Next 30 days" },
                ]}
              />
            </div>

            {/* Results count */}
            <div className="text-xs text-gray-500 dark:text-gray-400 sm:ml-auto">
              {sortedExams.length} exam{sortedExams.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        </div>

        {/* Exams Content */}
        <div className="px-4 sm:px-6 pt-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-accent-ink" />
            </div>
          ) : sortedExams.length === 0 ? (
            <div className={cn(
              "flex flex-col items-center justify-center py-16 rounded-xl",
              "bg-raised border border-line",
              "paper-texture"
            )}>
              <EmptyCloud className="mb-2" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                No exams found
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center px-4">
                {searchQuery || schoolFilter || gradeFilter || typeFilter
                  ? "Try adjusting your filters"
                  : "No exams found in the selected date range"}
              </p>
            </div>
          ) : viewStyle === "calendar" ? (
            <ExamCalendarView
              exams={sortedExams}
              currentMonth={calendarMonth}
              onMonthChange={setCalendarMonth}
              onExamClick={(exam) => handleCreateSlot(exam)}
              currentTutorId={currentTutorId}
              location={selectedLocation !== "All Locations" ? selectedLocation : null}
              onRefresh={handleRefresh}
              onEditEvent={handleEditEvent}
              canManageEvents={canManageEvents}
              readOnly={isReadOnly}
            />
          ) : (
            <div className="space-y-4">
              {sortedExams.map((exam) => {
                const isHighlighted = exam.id === parseInt(highlightExamId || '0', 10);
                return (
                  <div
                    key={exam.id}
                    ref={isHighlighted ? highlightedRef : undefined}
                                      >
                    <ExamCard
                      exam={exam}
                      currentTutorId={currentTutorId}
                      location={selectedLocation !== "All Locations" ? selectedLocation : null}
                      onCreateSlot={(defaults) => handleCreateSlot(exam, defaults)}
                      onRefresh={handleRefresh}
                      onEditEvent={handleEditEvent}
                      canManageEvents={canManageEvents}
                      highlighted={isHighlighted}
                      defaultExpanded={isHighlighted}
                      readOnly={isReadOnly}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create Revision Slot Modal */}
        {selectedExam && (
          <CreateRevisionSlotModal
            exam={selectedExam}
            isOpen={showCreateModal}
            onClose={() => {
              setShowCreateModal(false);
              setSelectedExam(null);
              setSlotDefaults(undefined);
            }}
            onCreated={handleSlotCreated}
            currentTutorId={currentTutorId}
            defaults={slotDefaults}
            readOnly={isReadOnly}
          />
        )}

        {/* Edit Calendar Event Modal */}
        <CalendarEventModal
          isOpen={isEditEventModalOpen}
          onClose={() => {
            setIsEditEventModalOpen(false);
            setEditingEvent(undefined);
          }}
          onSuccess={handleEditEventSuccess}
          event={editingEvent}
          readOnly={isReadOnly}
        />

        {/* Scroll to top button */}
        <ScrollToTopButton threshold={400} />
      </div>
    </PageSurface>
  );
}
