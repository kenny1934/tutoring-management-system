"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStudents, useCalendarEvents, useStudent, useStudentSessions, usePageTitle } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import type { Student, StudentFilters } from "@/types";
import Link from "next/link";
import { Users, Search, GraduationCap, BookOpen, ExternalLink, ChevronLeft, ChevronRight, Phone, MapPin, X, Calendar, Clock, Star, User, CreditCard, Loader2, ArrowUpDown, Building2, Tag } from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
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
import { studentsAPI } from "@/lib/api";
import type { Session, Enrollment, CalendarEvent } from "@/types";
import { TutorSelector, ALL_TUTORS, type TutorValue } from "@/components/selectors/TutorSelector";
import { MyStudentsView } from "@/components/students/MyStudentsView";
import { getDisplayPaymentStatus } from "@/lib/enrollment-utils";
import { getGradeColor } from "@/lib/constants";

// Key for storing scroll position
const SCROLL_POSITION_KEY = 'students-list-scroll-position';
const STUDENTS_PER_PAGE = 50;

export default function StudentsPage() {
  usePageTitle("Students");

  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedLocation } = useLocation();

  // Initialize state from URL params
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [gradeFilter, setGradeFilter] = useState(searchParams.get('grade') || '');
  const [schoolFilter, setSchoolFilter] = useState(searchParams.get('school') || '');
  const [sortOption, setSortOption] = useState(searchParams.get('sort') || 'id_desc');
  const [currentPage, setCurrentPage] = useState(() => {
    const page = searchParams.get('page');
    return page ? parseInt(page) : 1;
  });
  const [isMobile, setIsMobile] = useState(false);

  // View mode state: 'all' (default student list) or 'my' (tutor's students)
  const [viewMode, setViewMode] = useState<'all' | 'my'>(() => {
    const view = searchParams.get('view');
    return view === 'my' ? 'my' : 'all';
  });
  const [selectedTutorId, setSelectedTutorId] = useState<TutorValue>(() => {
    const tutor = searchParams.get('tutor');
    if (tutor === 'all') return ALL_TUTORS;
    return tutor ? parseInt(tutor) : null;
  });

  // My Students view state (persisted to URL)
  const [myMobileTab, setMyMobileTab] = useState<'list' | 'calendar'>(() => {
    const tab = searchParams.get('tab');
    return tab === 'calendar' ? 'calendar' : 'list';
  });
  const [myGroups, setMyGroups] = useState<string[]>(() => {
    const groups = searchParams.get('groups');
    return groups ? groups.split(',').filter(Boolean) : [];
  });
  const [mySort, setMySort] = useState<'student_id' | 'name'>(() => {
    const sort = searchParams.get('mysort');
    return sort === 'name' ? 'name' : 'student_id';
  });
  const [mySortDirection, setMySortDirection] = useState<'asc' | 'desc'>(() => {
    const dir = searchParams.get('mydir');
    return dir === 'desc' ? 'desc' : 'asc';
  });

  // School autocomplete state
  const [allSchools, setAllSchools] = useState<string[]>([]);
  const [schoolSearchInput, setSchoolSearchInput] = useState(searchParams.get('school') || '');
  const [showSchoolSuggestions, setShowSchoolSuggestions] = useState(false);
  const schoolInputRef = useRef<HTMLInputElement>(null);

  // Popover state (lifted to page level for correct positioning)
  const [popoverStudent, setPopoverStudent] = useState<Student | null>(null);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch all schools for autocomplete
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const schools = await studentsAPI.getSchools();
        setAllSchools(schools);
      } catch (err) {
        console.error('Failed to fetch schools:', err);
      }
    };
    fetchSchools();
  }, []);

  // Filter schools for autocomplete suggestions
  const filteredSchools = useMemo(() => {
    if (!schoolSearchInput) return allSchools;
    const search = schoolSearchInput.toLowerCase();
    return allSchools.filter(school => school.toLowerCase().includes(search));
  }, [allSchools, schoolSearchInput]);

  // Handle search on blur or Enter key
  const handleSearchSubmit = () => {
    if (searchInput !== searchTerm) {
      setSearchTerm(searchInput);
      setCurrentPage(1); // Reset to page 1 on search
    }
  };

  // Parse sort option into sort_by and sort_order
  const [sortBy, sortOrder] = useMemo(() => {
    const [field, order] = sortOption.split('_') as [string, 'asc' | 'desc'];
    return [field, order];
  }, [sortOption]);

  // Build filters for SWR hook
  const filters: StudentFilters = useMemo(() => ({
    search: searchTerm || undefined,
    grade: gradeFilter || undefined,
    school: schoolFilter || undefined,
    location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    limit: STUDENTS_PER_PAGE,
    offset: (currentPage - 1) * STUDENTS_PER_PAGE,
  }), [searchTerm, gradeFilter, schoolFilter, selectedLocation, sortBy, sortOrder, currentPage]);

  // SWR hook for data fetching
  const { data: students = [], error, isLoading: loading } = useStudents(filters);

  // Note: Total count fetching removed for performance
  // The display now shows "X+ students" when on a paginated page

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (viewMode === 'my') {
      params.set('view', 'my');
      if (selectedTutorId === ALL_TUTORS) {
        params.set('tutor', 'all');
      } else if (selectedTutorId) {
        params.set('tutor', selectedTutorId.toString());
      }
      if (myMobileTab === 'calendar') params.set('tab', 'calendar');
      if (myGroups.length > 0) params.set('groups', myGroups.join(','));
      if (mySort !== 'student_id') params.set('mysort', mySort);
      if (mySortDirection !== 'asc') params.set('mydir', mySortDirection);
    } else {
      // Only include filters for "all" view
      if (searchTerm) params.set('search', searchTerm);
      if (gradeFilter) params.set('grade', gradeFilter);
      if (schoolFilter) params.set('school', schoolFilter);
      if (sortOption !== 'id_desc') params.set('sort', sortOption);
      if (currentPage > 1) params.set('page', currentPage.toString());
    }

    const query = params.toString();
    router.replace(`/students${query ? `?${query}` : ''}`, { scroll: false });
  }, [searchTerm, gradeFilter, schoolFilter, sortOption, currentPage, viewMode, selectedTutorId, myMobileTab, myGroups, mySort, mySortDirection, router]);

  // Restore scroll position
  useEffect(() => {
    if (loading) return;
    const savedPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (savedPosition && scrollContainerRef.current) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = parseInt(savedPosition, 10);
        }
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
      });
    }
  }, [loading]);

  const saveScrollPosition = () => {
    if (scrollContainerRef.current) {
      sessionStorage.setItem(SCROLL_POSITION_KEY, scrollContainerRef.current.scrollTop.toString());
    }
  };


  // Calculate if there might be more pages
  const hasMorePages = students.length === STUDENTS_PER_PAGE;

  // Toolbar classes
  const toolbarClasses = cn(
    "sticky top-0 z-30 flex flex-wrap items-center gap-2 sm:gap-3 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 sm:px-4 py-2",
    !isMobile && "paper-texture"
  );

  if (loading) {
    return (
      <DeskSurface fullHeight>
        <PageTransition className="flex flex-col gap-2 sm:gap-3 p-2 sm:p-4">
          {/* Toolbar Skeleton */}
          <div className={toolbarClasses}>
            <div className="h-5 w-5 bg-[#d4a574]/50 rounded animate-pulse" />
            <div className="h-5 w-20 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
            <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />
            <div className="h-7 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse hidden sm:block" />
            <div className="ml-auto h-5 w-16 bg-amber-200/50 rounded-full animate-pulse" />
          </div>

          {/* Card Skeletons */}
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className={cn(
                "flex rounded-lg overflow-hidden bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
                !isMobile && "paper-texture"
              )}>
                <div className="flex-1 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-5 w-32 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                  </div>
                  <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
                <div className="w-10 sm:w-12 bg-gray-300 dark:bg-gray-600 animate-pulse" />
              </div>
            ))}
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  if (error) {
    return (
      <DeskSurface>
        <PageTransition className="flex h-full items-center justify-center p-8">
          <StickyNote variant="pink" size="lg" showTape={true}>
            <div className="text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Oops!</p>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                Error: {error instanceof Error ? error.message : "Failed to load students"}
              </p>
            </div>
          </StickyNote>
        </PageTransition>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface fullHeight>
      <div ref={scrollContainerRef} className={cn(
        "flex-1",
        viewMode === 'my'
          ? "flex flex-col overflow-hidden"
          : "overflow-y-auto"
      )}>
        <div className={cn(
          "flex flex-col gap-2 sm:gap-3 p-2 sm:p-4",
          viewMode === 'my' && "flex-1 min-h-0"
        )}>
          {/* Compact Toolbar */}
          <div className={toolbarClasses}>
            {/* Title */}
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
              <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">Students</h1>
            </div>

            <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-foreground/5 border border-border/30 rounded-xl p-1">
              <button
                onClick={() => setViewMode('all')}
                className={cn(
                  "px-2 py-1 text-xs rounded-lg transition-colors",
                  viewMode === 'all'
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "text-foreground/70 hover:bg-foreground/8"
                )}
              >
                All
              </button>
              <button
                onClick={() => setViewMode('my')}
                className={cn(
                  "px-2 py-1 text-xs rounded-lg transition-colors",
                  viewMode === 'my'
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "text-foreground/70 hover:bg-foreground/8"
                )}
              >
                My Students
              </button>
            </div>

            {/* Tutor Selector - only in "My Students" view */}
            {viewMode === 'my' && (
              <TutorSelector
                value={selectedTutorId}
                onChange={setSelectedTutorId}
                location={selectedLocation}
                allowClear
                showAllTutors
              />
            )}

            {/* Filters - only in "All" view */}
            {viewMode === 'all' && (
              <>
                {/* Search Input */}
            <div className="relative flex-1 min-w-[140px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onBlur={handleSearchSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                className="w-full pl-8 pr-3 py-1 text-sm bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-900 dark:text-gray-100"
              />
            </div>

            {/* Grade Filter */}
            <select
              value={gradeFilter}
              onChange={(e) => { setGradeFilter(e.target.value); setCurrentPage(1); }}
              className="px-2 py-1 text-sm bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-900 dark:text-gray-100 appearance-none cursor-pointer pr-7"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%23a0704b' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.5rem center',
              }}
            >
              <option value="">Grade</option>
              <option value="F1">F1</option>
              <option value="F2">F2</option>
              <option value="F3">F3</option>
              <option value="F4">F4</option>
              <option value="F5">F5</option>
              <option value="F6">F6</option>
            </select>

            {/* School Filter - Autocomplete */}
            <div className="relative hidden sm:block">
              <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                ref={schoolInputRef}
                type="text"
                placeholder="School..."
                value={schoolSearchInput}
                onChange={(e) => {
                  setSchoolSearchInput(e.target.value);
                  setShowSchoolSuggestions(true);
                }}
                onFocus={() => setShowSchoolSuggestions(true)}
                onBlur={() => {
                  // Delay to allow click on suggestion
                  setTimeout(() => setShowSchoolSuggestions(false), 150);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // If exact match, select it
                    const match = allSchools.find(s => s.toLowerCase() === schoolSearchInput.toLowerCase());
                    if (match) {
                      setSchoolFilter(match);
                      setSchoolSearchInput(match);
                    } else if (schoolSearchInput === '') {
                      setSchoolFilter('');
                    }
                    setShowSchoolSuggestions(false);
                    setCurrentPage(1);
                  } else if (e.key === 'Escape') {
                    setShowSchoolSuggestions(false);
                  }
                }}
                className="w-28 pl-7 pr-6 py-1 text-sm bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-900 dark:text-gray-100"
              />
              {schoolFilter && (
                <button
                  onClick={() => {
                    setSchoolFilter('');
                    setSchoolSearchInput('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  <X className="h-3 w-3 text-gray-400" />
                </button>
              )}
              {/* Suggestions dropdown */}
              {showSchoolSuggestions && filteredSchools.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-40 max-h-48 overflow-y-auto bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md shadow-lg z-50">
                  {filteredSchools.map((school) => (
                    <button
                      key={school}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSchoolFilter(school);
                        setSchoolSearchInput(school);
                        setShowSchoolSuggestions(false);
                        setCurrentPage(1);
                      }}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-sm hover:bg-[#a0704b]/10",
                        schoolFilter === school && "bg-[#a0704b]/20 font-medium"
                      )}
                    >
                      {school}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortOption}
              onChange={(e) => { setSortOption(e.target.value); setCurrentPage(1); }}
              className="px-2 py-1 text-sm bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-900 dark:text-gray-100 appearance-none cursor-pointer pr-7 hidden sm:block"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%23a0704b' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.5rem center',
              }}
            >
              <option value="id_desc">Newest</option>
              <option value="id_asc">Oldest</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
              <option value="school_asc">School A-Z</option>
            </select>
              </>
            )}

            <div className="flex-1" />
          </div>

          {/* All Students View */}
          {viewMode === 'all' && (
            <>
              {/* Student Cards */}
              {students.length === 0 ? (
                <div className="flex justify-center py-12">
                  <StickyNote variant="yellow" size="lg" showTape={true} className="desk-shadow-medium">
                    <div className="text-center">
                      <Users className="h-12 w-12 mx-auto mb-4 text-gray-700 dark:text-gray-300" />
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No students found</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Try adjusting your search or filters
                      </p>
                    </div>
                  </StickyNote>
                </div>
              ) : (
                <div className="space-y-2">
                  {students.map((student, index) => (
                    <StudentCard
                      key={student.id}
                      student={student}
                      index={index}
                      isMobile={isMobile}
                      isSelected={popoverStudent?.id === student.id}
                      saveScrollPosition={saveScrollPosition}
                      onClick={(e) => {
                        setPopoverClickPosition({ x: e.clientX, y: e.clientY });
                        setPopoverStudent(student);
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Student Detail Popover (rendered at page level for correct positioning) */}
              {popoverStudent && (
                <StudentDetailPopover
                  student={popoverStudent}
                  isOpen={!!popoverStudent}
                  onClose={() => setPopoverStudent(null)}
                  clickPosition={popoverClickPosition}
                  isMobile={isMobile}
                  saveScrollPosition={saveScrollPosition}
                />
              )}

              {/* Pagination */}
              {(currentPage > 1 || hasMorePages) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className="flex items-center justify-center gap-4 py-4"
                >
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      currentPage === 1
                        ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                        : "bg-[#a0704b] text-white hover:bg-[#8b6140]"
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>

                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Page {currentPage}
                  </span>

                  <button
                    onClick={() => setCurrentPage(p => p + 1)}
                    disabled={!hasMorePages}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      !hasMorePages
                        ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                        : "bg-[#a0704b] text-white hover:bg-[#8b6140]"
                    )}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </>
          )}

          {/* My Students View */}
          {viewMode === 'my' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <MyStudentsView
                tutorId={selectedTutorId}
                location={selectedLocation}
                isMobile={isMobile}
                mobileTab={myMobileTab}
                onMobileTabChange={setMyMobileTab}
                activeGroups={myGroups as ('payment_status' | 'grade_lang' | 'school' | 'day' | 'time_slot')[]}
                onGroupsChange={setMyGroups}
                sortOption={mySort}
                onSortChange={setMySort}
                sortDirection={mySortDirection}
                onSortDirectionChange={setMySortDirection}
              />
            </div>
          )}
        </div>
      </div>
    </DeskSurface>
  );
}

// Helper to format date
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Helper to get days until a date
function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// getDisplayPaymentStatus is now imported from @/lib/enrollment-utils

// Rich popover content component
function RichPopoverContent({
  student,
  isMobile,
  saveScrollPosition,
  onClose,
}: {
  student: Student;
  isMobile: boolean;
  saveScrollPosition: () => void;
  onClose: () => void;
}) {
  // Use SWR hooks for caching (data persists between popover opens)
  const { data: studentDetail, isLoading: loadingDetail } = useStudent(student.id);
  const { data: recentSessions = [], isLoading: loadingSessions } = useStudentSessions(student.id, 20);
  const { data: calendarEvents = [] } = useCalendarEvents(30);

  const loading = loadingDetail || loadingSessions;

  // Filter upcoming tests for this student's school/grade
  const upcomingTests = useMemo(() => {
    const filtered = calendarEvents.filter((event: CalendarEvent) => {
      const schoolMatch = !event.school || event.school === student.school;
      const gradeMatch = !event.grade || event.grade === student.grade;
      return schoolMatch && gradeMatch;
    });
    return filtered.slice(0, 3);
  }, [calendarEvents, student.school, student.grade]);

  // Get active enrollment (latest by first_lesson_date, non-cancelled)
  const activeEnrollment = useMemo(() => {
    if (!studentDetail?.enrollments?.length) return null;
    const sorted = [...studentDetail.enrollments].sort((a: Enrollment, b: Enrollment) => {
      const dateA = a.first_lesson_date ? new Date(a.first_lesson_date).getTime() : 0;
      const dateB = b.first_lesson_date ? new Date(b.first_lesson_date).getTime() : 0;
      return dateB - dateA; // Latest first
    });
    return sorted.find((e: Enrollment) => e.payment_status !== 'Cancelled') || sorted[0];
  }, [studentDetail]);

  // Get last attended session
  const lastSession = useMemo(() => {
    return recentSessions.find(
      (s) => s.session_status === 'Attended' || s.session_status === 'Attended (Make-up)'
    ) || recentSessions[0];
  }, [recentSessions]);

  // Get next upcoming test
  const nextTest = upcomingTests[0];

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#d4a574]/30">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-[#a0704b]/20 flex items-center justify-center">
            <Users className="h-4 w-4 text-[#a0704b]" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">
              {student.student_name}
            </h3>
            <p className="text-xs text-gray-500 font-mono">
              {student.school_student_id || `#${student.id}`}
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
      <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
        {/* School & Grade Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {student.school && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-gray-800 dark:text-amber-200">
              {student.school}
            </span>
          )}
          {student.grade && (
            <span
              className="text-xs px-2 py-0.5 rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(student.grade, student.lang_stream) }}
            >
              {student.grade}{student.lang_stream || ''}
            </span>
          )}
          {student.academic_stream && (
            <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              {student.academic_stream}
            </span>
          )}
        </div>

        {/* Contact Info */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {student.phone && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <Phone className="h-3 w-3" />
              <span className="font-mono">{student.phone}</span>
            </div>
          )}
          {student.home_location && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <MapPin className="h-3 w-3" />
              <span>{student.home_location}</span>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
            <span className="ml-2 text-xs text-gray-500">Loading...</span>
          </div>
        )}

        {/* Current Enrollment Section */}
        {!loading && (
          <div className="border-t border-[#d4a574]/20 pt-3">
            <h4 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Current Enrollment
            </h4>
            {activeEnrollment ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <User className="h-3 w-3 text-blue-500" />
                  <span className="text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{activeEnrollment.tutor_name || 'Unassigned'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Clock className="h-3 w-3 text-amber-500" />
                  <span className="text-gray-700 dark:text-gray-300">
                    {activeEnrollment.assigned_day || 'TBD'} {activeEnrollment.assigned_time || ''}
                    {activeEnrollment.location && <span className="text-gray-500"> @ {activeEnrollment.location}</span>}
                  </span>
                </div>
                {/* Enrollment Type */}
                {activeEnrollment.enrollment_type && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Tag className={cn(
                      "h-3 w-3",
                      activeEnrollment.enrollment_type === 'Trial' ? 'text-blue-500' :
                      activeEnrollment.enrollment_type === 'One-Time' ? 'text-purple-500' :
                      'text-gray-500'
                    )} />
                    <span className={cn(
                      activeEnrollment.enrollment_type === 'Trial'
                        ? "text-blue-600 dark:text-blue-400"
                        : activeEnrollment.enrollment_type === 'One-Time'
                        ? "text-purple-600 dark:text-purple-400"
                        : "text-gray-700 dark:text-gray-300"
                    )}>
                      {activeEnrollment.enrollment_type}
                    </span>
                  </div>
                )}
                {(() => {
                  const displayStatus = getDisplayPaymentStatus(activeEnrollment);
                  return (
                    <div className="flex items-center gap-1.5 text-xs">
                      <CreditCard className={cn(
                        "h-3 w-3",
                        displayStatus === 'Paid' ? 'text-green-500' :
                        displayStatus === 'Overdue' ? 'text-red-500' :
                        'text-amber-500'
                      )} />
                      <span className={cn(
                        "font-medium",
                        displayStatus === 'Paid' ? 'text-green-600' :
                        displayStatus === 'Overdue' ? 'text-red-600' :
                        displayStatus === 'Pending Payment' ? 'text-amber-600' :
                        'text-gray-500'
                      )}>
                        {displayStatus}
                      </span>
                      {activeEnrollment.lessons_paid && (
                        <span className="text-gray-500">({activeEnrollment.lessons_paid} lessons)</span>
                      )}
                    </div>
                  );
                })()}
                {activeEnrollment.first_lesson_date && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Calendar className="h-3 w-3 text-purple-500" />
                    <span className="text-gray-700 dark:text-gray-300">
                      Started: {formatDate(activeEnrollment.first_lesson_date)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No current enrollment</p>
            )}
          </div>
        )}

        {/* Last Session Section */}
        {!loading && (
          <div className="border-t border-[#d4a574]/20 pt-3">
            <h4 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Last Session
            </h4>
            {lastSession ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    {formatDate(lastSession.session_date)}
                  </span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium",
                    lastSession.session_status === 'Attended' || lastSession.session_status === 'Attended (Make-up)'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                      : lastSession.session_status === 'Cancelled'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  )}>
                    {lastSession.session_status}
                  </span>
                </div>
                {lastSession.performance_rating && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm">{lastSession.performance_rating}</span>
                  </div>
                )}
                {lastSession.notes && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 italic">
                    &ldquo;{lastSession.notes}&rdquo;
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No sessions yet</p>
            )}
          </div>
        )}

        {/* Upcoming Test Section */}
        {!loading && (
          <div className="border-t border-[#d4a574]/20 pt-3">
            <h4 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Upcoming Tests
            </h4>
            {nextTest ? (
              <div className="space-y-1">
                {upcomingTests.map((test) => {
                  const daysUntil = getDaysUntil(test.start_date);
                  return (
                    <div key={test.id} className="flex items-center gap-2 text-xs">
                      <Calendar className="h-3 w-3 text-red-500 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                        {test.title}
                      </span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap",
                        daysUntil <= 3 ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                        daysUntil <= 7 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      )}>
                        {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `in ${daysUntil}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No upcoming tests</p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#d4a574]/30">
        <Link
          href={`/students/${student.id}`}
          onClick={(e) => {
            e.stopPropagation();
            saveScrollPosition();
          }}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-[#a0704b] hover:bg-[#8b6140] text-white rounded-lg text-sm font-medium transition-colors"
        >
          View Full Profile
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </>
  );
}

// Simple StudentCard component (popover logic lifted to page level)
function StudentCard({
  student,
  index,
  isMobile,
  isSelected,
  saveScrollPosition,
  onClick,
}: {
  student: Student;
  index: number;
  isMobile: boolean;
  isSelected: boolean;
  saveScrollPosition: () => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: isMobile ? 0 : index * 0.03,
        duration: 0.3,
        ease: [0.38, 1.21, 0.22, 1.00]
      }}
      whileHover={!isMobile ? { scale: 1.01, y: -2, transition: { duration: 0.15 } } : {}}
      className={cn(
        "relative rounded-lg cursor-pointer transition-all duration-200 overflow-hidden flex bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
        !isMobile && "paper-texture",
        isSelected && "ring-2 ring-[#a0704b]"
      )}
      style={{
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* Main content */}
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Student ID */}
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
            {student.school_student_id || `#${student.id}`}
          </span>
          {/* Student Name */}
          <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {student.student_name}
          </span>
          {/* Grade Badge */}
          {student.grade && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded text-gray-800 whitespace-nowrap"
              style={{ backgroundColor: getGradeColor(student.grade, student.lang_stream) }}
            >
              {student.grade}{student.lang_stream || ''}
            </span>
          )}
          {/* School Badge */}
          {student.school && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-gray-800 dark:text-amber-200 whitespace-nowrap hidden sm:inline">
              {student.school}
            </span>
          )}
          {/* View Link */}
          <Link
            href={`/students/${student.id}`}
            onClick={(e) => {
              e.stopPropagation();
              saveScrollPosition();
            }}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#a0704b]/10 hover:bg-[#a0704b]/20 dark:bg-[#cd853f]/10 dark:hover:bg-[#cd853f]/20 text-[#a0704b] dark:text-[#cd853f] font-medium whitespace-nowrap transition-colors flex-shrink-0 ml-auto"
          >
            <span className="hidden sm:inline">View</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        {/* Location */}
        {student.home_location && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
            {student.home_location}
          </p>
        )}
      </div>

      {/* Enrollment count strip */}
      <div className={cn(
        "w-10 sm:w-12 flex-shrink-0 flex flex-col items-center justify-center",
        student.enrollment_count && student.enrollment_count > 0
          ? "bg-green-500 dark:bg-green-600"
          : "bg-gray-300 dark:bg-gray-600"
      )}>
        <BookOpen className="h-4 w-4 text-white mb-0.5" />
        <span className="text-xs font-bold text-white">
          {student.enrollment_count || 0}
        </span>
      </div>
    </motion.div>
  );
}

// StudentDetailPopover component (follows SessionDetailPopover pattern)
function StudentDetailPopover({
  student,
  isOpen,
  onClose,
  clickPosition,
  isMobile,
  saveScrollPosition,
}: {
  student: Student;
  isOpen: boolean;
  onClose: () => void;
  clickPosition: { x: number; y: number } | null;
  isMobile: boolean;
  saveScrollPosition: () => void;
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

  // Use setPositionReference for virtual references (not elements.reference)
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
          "z-[9999] w-80 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-xl",
          !isMobile && "paper-texture"
        )}
      >
        <RichPopoverContent
          student={student}
          isMobile={isMobile}
          saveScrollPosition={saveScrollPosition}
          onClose={onClose}
        />
      </div>
    </FloatingPortal>
  );
}
