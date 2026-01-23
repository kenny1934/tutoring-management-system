"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { toDateString, getWeekBounds, getMonthBounds, getMonthCalendarDates } from "@/lib/calendar-utils";
import { useExamsWithSlots, useTutors, usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { ExamCard } from "@/components/exams/ExamCard";

// Lazy load modal - only imported when opened
const CreateRevisionSlotModal = dynamic(
  () => import("@/components/exams/CreateRevisionSlotModal").then(mod => ({ default: mod.CreateRevisionSlotModal })),
  { ssr: false }
);
import { DeskSurface } from "@/components/layout/DeskSurface";
import { EmptyCloud } from "@/components/illustrations/EmptyStates";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { CURRENT_USER_TUTOR } from "@/lib/constants";
import { useLocation } from "@/contexts/LocationContext";
import type { ExamWithRevisionSlots, SlotDefaults } from "@/types";
import {
  GraduationCap,
  ArrowLeft,
  Loader2,
  Search,
  Calendar,
  List,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

type ViewStyle = "list" | "calendar";

// Calendar view component
function ExamCalendarView({
  exams,
  currentMonth,
  onMonthChange,
  onExamClick,
  currentTutorId,
  location,
  onRefresh,
}: {
  exams: ExamWithRevisionSlots[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onExamClick: (exam: ExamWithRevisionSlots) => void;
  currentTutorId: number;
  location: string | null;
  onRefresh: () => void;
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
        "bg-white dark:bg-[#1a1a1a] border-[#e8d4b8] dark:border-[#6b5a4a]",
        "paper-texture"
      )}>
        {/* Calendar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <button
            onClick={goToPrevMonth}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h3>
            <button
              onClick={goToToday}
              className="px-2 py-1 text-xs font-medium rounded-md border border-[#e8d4b8] dark:border-[#6b5a4a] text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
            >
              Today
            </button>
          </div>
          <button
            onClick={goToNextMonth}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          >
            <ChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
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
                  "relative p-2 min-h-[70px] border-b border-r border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 text-left transition-colors",
                  !isCurrentMonth && "bg-gray-50 dark:bg-gray-900/30",
                  isSelected && "bg-[#f5ede3] dark:bg-[#3d3628] ring-2 ring-inset ring-[#a0704b]",
                  !isSelected && hasExams && "hover:bg-[#faf6f1] dark:hover:bg-[#2d2820]"
                )}
              >
                <span className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm",
                  isToday && "bg-[#a0704b] text-white font-bold",
                  !isToday && isCurrentMonth && "text-gray-900 dark:text-gray-100",
                  !isToday && !isCurrentMonth && "text-gray-400 dark:text-gray-600"
                )}>
                  {date.getDate()}
                </span>

                {/* Exam indicators */}
                {hasExams && (
                  <div className="mt-1 space-y-0.5">
                    {dayExams.slice(0, 2).map((exam) => (
                      <div
                        key={exam.id}
                        className={cn(
                          "text-[10px] px-1 py-0.5 rounded truncate",
                          "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                        )}
                        title={exam.title}
                      >
                        {exam.title.length > 12 ? exam.title.slice(0, 12) + "…" : exam.title}
                      </div>
                    ))}
                    {dayExams.length > 2 && (
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 px-1">
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
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ExamsPage() {
  const { data: tutors = [] } = useTutors();
  const { selectedLocation } = useLocation();
  const searchParams = useSearchParams();
  const highlightExamId = searchParams.get('exam');
  const viewParam = searchParams.get('view');

  usePageTitle("Exam Revision Classes");

  // Refs for auto-scroll to highlighted exam
  const highlightedRef = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);

  // Get current tutor ID
  const currentTutorId = useMemo(() => {
    const tutor = tutors.find((t) => t.tutor_name === CURRENT_USER_TUTOR);
    return tutor?.id;
  }, [tutors]);

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [schoolFilter, setSchoolFilter] = useState<string>("");
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [selectedExam, setSelectedExam] = useState<ExamWithRevisionSlots | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [slotDefaults, setSlotDefaults] = useState<SlotDefaults | undefined>(undefined);
  const [viewStyle, setViewStyle] = useState<ViewStyle>("list");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

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

  // Filter exams by search query (using debounced value)
  const filteredExams = useMemo(() => {
    if (!debouncedSearch.trim()) return exams;

    const query = debouncedSearch.toLowerCase();
    return exams.filter((exam) => {
      return (
        exam.title.toLowerCase().includes(query) ||
        exam.school?.toLowerCase().includes(query) ||
        exam.grade?.toLowerCase().includes(query) ||
        exam.event_type?.toLowerCase().includes(query)
      );
    });
  }, [exams, debouncedSearch]);

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
      <DeskSurface fullHeight>
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
          </div>
        </div>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface fullHeight>
      {/* Single scroll container */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Single sticky container for header + toolbar */}
        <div ref={stickyHeaderRef} className="sticky top-0 z-40 desk-background">
          {/* Header */}
          <div className="p-4 sm:px-6 sm:py-4 desk-background">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="p-2 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="hidden sm:block p-2 rounded-lg bg-[#f5ede3] dark:bg-[#3d3628]">
                  <GraduationCap className="h-6 w-6 text-[#a0704b]" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold text-white">
                    Exam Revision Classes
                  </h1>
                  <p className="hidden sm:block text-sm text-white/70">
                    Create and manage revision sessions for upcoming exams
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div
            className={cn(
              "mx-4 sm:mx-6 mb-4",
              "bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
              "paper-texture"
            )}
          >
          {/* Top row: Search, School, Grade, View Toggle */}
          <div className="px-4 py-3 flex flex-wrap gap-2 sm:gap-3 items-center">
            {/* Search - full width on mobile */}
            <div className="relative w-full sm:w-auto sm:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search exams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search exams"
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] placeholder-gray-400"
              />
            </div>

            {/* School filter - share space on mobile */}
            <select
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              aria-label="Filter by school"
              className="flex-1 sm:flex-none px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300"
            >
              <option value="">All Schools</option>
              {schools.map((school) => (
                <option key={school} value={school}>
                  {school}
                </option>
              ))}
            </select>

            {/* Grade filter - share space on mobile */}
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              aria-label="Filter by grade"
              className="flex-1 sm:flex-none px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300"
            >
              <option value="">All Grades</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>

            {/* View style toggle */}
            <div className="inline-flex rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] p-0.5 bg-[#fef9f3] dark:bg-[#2d2618]">
              <button
                onClick={() => setViewStyle("list")}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  viewStyle === "list"
                    ? "bg-[#a0704b] text-white"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                )}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewStyle("calendar")}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  viewStyle === "calendar"
                    ? "bg-[#a0704b] text-white"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                )}
                title="Calendar view"
              >
                <Calendar className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Date range row */}
          <div className="px-4 pb-3 flex flex-col sm:flex-row gap-3 items-center border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 pt-3">
            {/* Date inputs */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="From date"
                className={cn(
                  "px-2 py-1.5 text-sm border rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300",
                  isDefaultDateRange
                    ? "border-[#e8d4b8] dark:border-[#6b5a4a]"
                    : "border-[#a0704b] ring-1 ring-[#a0704b]/30"
                )}
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="To date"
                className={cn(
                  "px-2 py-1.5 text-sm border rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300",
                  isDefaultDateRange
                    ? "border-[#e8d4b8] dark:border-[#6b5a4a]"
                    : "border-[#a0704b] ring-1 ring-[#a0704b]/30"
                )}
              />
              {!isDefaultDateRange && (
                <button
                  onClick={setNext30Days}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Reset date filter"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Quick filters - hidden on mobile */}
            <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
              <button
                onClick={setThisWeek}
                className={cn(
                  "px-2 py-1 text-xs font-medium rounded-md border transition-colors",
                  activePreset === 'thisWeek'
                    ? "bg-[#a0704b] text-white border-[#a0704b]"
                    : "border-[#e8d4b8] dark:border-[#6b5a4a] text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                )}
              >
                This Week
              </button>
              <button
                onClick={setNext2Weeks}
                className={cn(
                  "px-2 py-1 text-xs font-medium rounded-md border transition-colors",
                  activePreset === 'next2Weeks'
                    ? "bg-[#a0704b] text-white border-[#a0704b]"
                    : "border-[#e8d4b8] dark:border-[#6b5a4a] text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                )}
              >
                Next 2 Weeks
              </button>
              <button
                onClick={setThisMonth}
                className={cn(
                  "px-2 py-1 text-xs font-medium rounded-md border transition-colors",
                  activePreset === 'thisMonth'
                    ? "bg-[#a0704b] text-white border-[#a0704b]"
                    : "border-[#e8d4b8] dark:border-[#6b5a4a] text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                )}
              >
                This Month
              </button>
              <button
                onClick={setNext30Days}
                className={cn(
                  "px-2 py-1 text-xs font-medium rounded-md border transition-colors",
                  activePreset === 'next30Days'
                    ? "bg-[#a0704b] text-white border-[#a0704b]"
                    : "border-[#e8d4b8] dark:border-[#6b5a4a] text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                )}
              >
                Next 30 Days
              </button>
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
              <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
            </div>
          ) : sortedExams.length === 0 ? (
            <div className={cn(
              "flex flex-col items-center justify-center py-16 rounded-xl",
              "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
              "paper-texture"
            )}>
              <EmptyCloud className="mb-2" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                No exams found
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center px-4">
                {searchQuery || schoolFilter || gradeFilter
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
                      highlighted={isHighlighted}
                      defaultExpanded={isHighlighted}
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
          />
        )}

        {/* Scroll to top button */}
        <ScrollToTopButton threshold={400} />
      </div>
    </DeskSurface>
  );
}
