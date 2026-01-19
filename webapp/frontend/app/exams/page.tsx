"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useExamsWithSlots, useTutors, usePageTitle } from "@/lib/hooks";
import { ExamCard } from "@/components/exams/ExamCard";
import { CreateRevisionSlotModal } from "@/components/exams/CreateRevisionSlotModal";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { EmptyCloud } from "@/components/illustrations/EmptyStates";
import { CURRENT_USER_TUTOR } from "@/lib/constants";
import { useLocation } from "@/contexts/LocationContext";
import type { ExamWithRevisionSlots, CalendarEvent } from "@/types";
import {
  GraduationCap,
  ArrowLeft,
  Loader2,
  Search,
  Filter,
  Plus,
  Calendar,
} from "lucide-react";

export default function ExamsPage() {
  const { data: tutors = [] } = useTutors();
  const { selectedLocation } = useLocation();
  const searchParams = useSearchParams();
  const highlightExamId = searchParams.get('exam');

  usePageTitle("Exam Revision Classes");

  // Get current tutor ID
  const currentTutorId = useMemo(() => {
    const tutor = tutors.find((t) => t.tutor_name === CURRENT_USER_TUTOR);
    return tutor?.id;
  }, [tutors]);

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [schoolFilter, setSchoolFilter] = useState<string>("");
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [selectedExam, setSelectedExam] = useState<ExamWithRevisionSlots | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch exams with revision slots
  const { data: exams = [], isLoading, mutate } = useExamsWithSlots({
    location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
    school: schoolFilter || undefined,
    grade: gradeFilter || undefined,
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

  // Filter exams by search query
  const filteredExams = useMemo(() => {
    if (!searchQuery.trim()) return exams;

    const query = searchQuery.toLowerCase();
    return exams.filter((exam) => {
      return (
        exam.title.toLowerCase().includes(query) ||
        exam.school?.toLowerCase().includes(query) ||
        exam.grade?.toLowerCase().includes(query) ||
        exam.event_type?.toLowerCase().includes(query)
      );
    });
  }, [exams, searchQuery]);

  // Handle creating a revision slot
  const handleCreateSlot = (exam: ExamWithRevisionSlots) => {
    setSelectedExam(exam);
    setShowCreateModal(true);
  };

  // Handle successful slot creation
  const handleSlotCreated = () => {
    mutate(); // Refresh the exams list
    setShowCreateModal(false);
    setSelectedExam(null);
  };

  if (!currentTutorId) {
    return (
      <DeskSurface>
        <PageTransition className="flex flex-col gap-4 p-4 sm:p-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-4 p-4 sm:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Exam Revision Classes
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Create and manage revision sessions for upcoming exams
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className={cn(
          "bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
          "paper-texture"
        )}>
          <div className="px-4 py-3 flex flex-col sm:flex-row gap-3">
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

        {/* Exams List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
            </div>
          ) : filteredExams.length === 0 ? (
            <div className={cn(
              "flex flex-col items-center justify-center py-16 rounded-xl",
              "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
              "paper-texture"
            )}>
              <EmptyCloud className="mb-2" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                No upcoming exams found
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center px-4">
                {searchQuery || schoolFilter || gradeFilter
                  ? "Try adjusting your filters"
                  : "No exams scheduled in the next 60 days"}
              </p>
            </div>
          ) : (
            filteredExams.map((exam) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                currentTutorId={currentTutorId}
                location={selectedLocation !== "All Locations" ? selectedLocation : null}
                onCreateSlot={() => handleCreateSlot(exam)}
                onRefresh={() => mutate()}
                highlighted={exam.id === parseInt(highlightExamId || '0', 10)}
                defaultExpanded={exam.id === parseInt(highlightExamId || '0', 10)}
              />
            ))
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
            }}
            onCreated={handleSlotCreated}
            currentTutorId={currentTutorId}
          />
        )}
      </PageTransition>
    </DeskSurface>
  );
}
