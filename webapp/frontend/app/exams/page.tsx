"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useExamsWithSlots, useTutors, usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { ExamCard } from "@/components/exams/ExamCard";
import { CreateRevisionSlotModal } from "@/components/exams/CreateRevisionSlotModal";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { EmptyCloud } from "@/components/illustrations/EmptyStates";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { CURRENT_USER_TUTOR } from "@/lib/constants";
import { useLocation } from "@/contexts/LocationContext";
import type { ExamWithRevisionSlots } from "@/types";
import {
  GraduationCap,
  ArrowLeft,
  Loader2,
  Search,
} from "lucide-react";

type ExamViewMode = "upcoming" | "past";

export default function ExamsPage() {
  const { data: tutors = [] } = useTutors();
  const { selectedLocation } = useLocation();
  const searchParams = useSearchParams();
  const highlightExamId = searchParams.get('exam');
  const viewParam = searchParams.get('view');

  usePageTitle("Exam Revision Classes");

  // Ref for auto-scroll to highlighted exam
  const highlightedRef = useRef<HTMLDivElement>(null);

  // Get current tutor ID
  const currentTutorId = useMemo(() => {
    const tutor = tutors.find((t) => t.tutor_name === CURRENT_USER_TUTOR);
    return tutor?.id;
  }, [tutors]);

  // Slot defaults interface for duplication
  interface SlotDefaults {
    tutor_id?: number;
    location?: string;
    notes?: string;
  }

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [schoolFilter, setSchoolFilter] = useState<string>("");
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [selectedExam, setSelectedExam] = useState<ExamWithRevisionSlots | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [slotDefaults, setSlotDefaults] = useState<SlotDefaults | undefined>(undefined);
  const [viewMode, setViewMode] = useState<ExamViewMode>(
    viewParam === 'past' ? 'past' : 'upcoming'
  );

  // Calculate date range based on view mode
  const dateParams = useMemo(() => {
    const today = new Date();
    if (viewMode === "past") {
      const fromDate = new Date(today);
      fromDate.setDate(fromDate.getDate() - 365); // 1 year back
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1); // Exclude today
      return {
        from_date: fromDate.toISOString().split('T')[0],
        to_date: yesterday.toISOString().split('T')[0],
      };
    }
    // Upcoming: today to +60 days
    const toDate = new Date(today);
    toDate.setDate(toDate.getDate() + 60);
    return {
      from_date: today.toISOString().split('T')[0],
      to_date: toDate.toISOString().split('T')[0],
    };
  }, [viewMode]);

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

  // Sort exams: upcoming=ascending, past=descending
  const sortedExams = useMemo(() => {
    return [...filteredExams].sort((a, b) => {
      const dateA = new Date(a.start_date).getTime();
      const dateB = new Date(b.start_date).getTime();
      return viewMode === "past" ? dateB - dateA : dateA - dateB;
    });
  }, [filteredExams, viewMode]);

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
    if (highlightExamId && !isLoading && highlightedRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        highlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        <div className="sticky top-0 z-40 desk-background">
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
                <div className="p-2 rounded-lg bg-[#f5ede3] dark:bg-[#3d3628]">
                  <GraduationCap className="h-6 w-6 text-[#a0704b]" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    Exam Revision Classes
                  </h1>
                  <p className="text-sm text-white/70">
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
          <div className="px-4 py-3 flex flex-col sm:flex-row gap-3">
            {/* Upcoming/Past segment control */}
            <div className="inline-flex rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] p-0.5 bg-[#fef9f3] dark:bg-[#2d2618]">
              {(["upcoming", "past"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize",
                    viewMode === mode
                      ? "bg-[#a0704b] text-white"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search exams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] placeholder-gray-400"
              />
            </div>

            {/* School filter */}
            <select
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300"
            >
              <option value="">All Schools</option>
              {schools.map((school) => (
                <option key={school} value={school}>
                  {school}
                </option>
              ))}
            </select>

            {/* Grade filter */}
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300"
            >
              <option value="">All Grades</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </div>
        </div>
        </div>

        {/* Exams List */}
        <div className="px-4 sm:px-6 pt-4 pb-4 space-y-4">
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
                No {viewMode} exams found
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center px-4">
                {searchQuery || schoolFilter || gradeFilter
                  ? "Try adjusting your filters"
                  : viewMode === "past"
                    ? "No exams found in the past year"
                    : "No exams scheduled in the next 60 days"}
              </p>
            </div>
          ) : (
            sortedExams.map((exam) => {
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
            })
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
