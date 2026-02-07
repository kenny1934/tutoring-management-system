"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTutors, usePageTitle, useTerminationQuarters, useTerminatedStudents, useTerminationStats, useStatDetails, useTerminationTrends } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { TutorSelector, type TutorValue, ALL_TUTORS } from "@/components/selectors/TutorSelector";
import { terminationsAPI, enrollmentsAPI } from "@/lib/api";
import { UserMinus, Loader2, Users, TrendingDown, ChevronDown, ChevronRight, Check, Save, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown, Info, LayoutList, Grid3X3, Search, X, Download } from "lucide-react";
import { getGradeColor } from "@/lib/constants";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { EnrollmentDetailPopover } from "@/components/enrollments/EnrollmentDetailPopover";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { mutate } from "swr";
import type { TerminatedStudent, TutorTerminationStats, StatDetailStudent } from "@/types";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { CategoryDropdown } from "@/components/terminations/CategoryDropdown";
import { TerminationTrendChart } from "@/components/terminations/TerminationTrendChart";
import { ReasonDistributionChart } from "@/components/terminations/ReasonDistributionChart";

// Exited student with optional transfer destination
type ExitedStudent = StatDetailStudent & { transferred_to_tutor: string | null };
type EnrolledStudent = StatDetailStudent & { transferred_from_tutor: string | null };

// Type for pending changes
interface PendingChange {
  countAsTerminated?: boolean;
  reason?: string;
  reasonCategory?: string;
}

// --- Shared helpers ---

function exportTerminatedStudentsCSV(
  groups: Array<{ tutorName: string; students: TerminatedStudent[] }>,
  quarter: number,
  year: number,
  getChecked: (s: TerminatedStudent) => boolean,
  getReason: (s: TerminatedStudent) => string,
  getCategory: (s: TerminatedStudent) => string,
) {
  const headers = ["Student ID", "Name", "Grade", "Instructor", "Schedule", "End Date", "Category", "Reason", "Count as Terminated"];
  const rows = groups.flatMap(({ students }) =>
    students.map(s => [
      s.school_student_id || "",
      s.student_name,
      s.grade || "",
      s.tutor_name || "",
      formatSchedule(s.schedule),
      new Date(s.termination_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      getCategory(s),
      getReason(s),
      getChecked(s) ? "Yes" : "No",
    ])
  );
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `terminated-students-Q${quarter}-${year}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatSchedule(schedule: string | undefined): string {
  if (!schedule) return "-";
  // Backend format: "[10:00 - 11:30], Sun" → "Sun 10:00 - 11:30"
  const match = schedule.match(/^\[(.+?)\],?\s*(\w+)$/);
  if (match) return `${match[2]} ${match[1]}`;
  return schedule;
}

function deduplicateByStudentId<T extends { student_id: number }>(arr: T[]): T[] {
  const seen = new Map<number, T>();
  for (const s of arr) if (!seen.has(s.student_id)) seen.set(s.student_id, s);
  return Array.from(seen.values());
}

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  return direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

function useToggleSort<T extends string>(defaultColumn: T, defaultDir: 'asc' | 'desc' = 'asc') {
  const [config, setConfig] = useState({ column: defaultColumn, direction: defaultDir });
  const toggle = useCallback((col: T) => {
    setConfig(prev => ({ column: col, direction: prev.column === col && prev.direction === 'asc' ? 'desc' : 'asc' }));
  }, []);
  return [config, toggle] as const;
}

export default function TerminatedStudentsPage() {
  usePageTitle("Terminated Students");

  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const { user, isAdmin, canViewAdminPages, isReadOnly, isImpersonating, impersonatedTutor, effectiveRole } = useAuth();
  const { data: tutors = [] } = useTutors();
  const { showToast } = useToast();

  // State from URL params
  const [selectedTutorId, setSelectedTutorId] = useState<TutorValue>(() => {
    const tutor = searchParams.get('tutor');
    if (tutor === 'all') return ALL_TUTORS;
    return tutor ? parseInt(tutor) : null;
  });

  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(() => {
    const q = searchParams.get('quarter');
    return q ? parseInt(q) : null;
  });

  const [selectedYear, setSelectedYear] = useState<number | null>(() => {
    const y = searchParams.get('year');
    return y ? parseInt(y) : null;
  });

  const [isMobile, setIsMobile] = useState(false);
  const [isQuarterDropdownOpen, setIsQuarterDropdownOpen] = useState(false);
  const [sortConfig, handleSort] = useToggleSort<'id' | 'endDate'>('endDate');
  const [tutorStatsSortConfig, handleTutorStatsSort] = useToggleSort<'instructor' | 'opening' | 'enrollTransfer' | 'terminated' | 'closing' | 'termRate'>('instructor');

  // Search, filter, and collapsible state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Pending changes state for batch save
  const [pendingChanges, setPendingChanges] = useState<Map<number, PendingChange>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Clear pending changes when quarter/year changes
  useEffect(() => {
    setPendingChanges(new Map());
  }, [selectedQuarter, selectedYear]);

  // Determine effective location
  const effectiveLocation = selectedLocation && selectedLocation !== "All Locations" ? selectedLocation : undefined;

  // Determine effective tutor ID for API calls
  const effectiveTutorId = useMemo(() => {
    // Non-admin-level users always see only their own data
    if (!canViewAdminPages) {
      // Handle impersonation
      if (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id) {
        return impersonatedTutor.id;
      }
      return user?.id;
    }

    // Admin-level users in my-view sees own data
    if (viewMode === 'my-view') {
      if (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id) {
        return impersonatedTutor.id;
      }
      return user?.id;
    }

    // Admin-level users in center-view can select any tutor
    if (selectedTutorId === ALL_TUTORS) return undefined;
    if (typeof selectedTutorId === 'number') return selectedTutorId;
    return undefined;
  }, [canViewAdminPages, viewMode, selectedTutorId, user?.id, isImpersonating, effectiveRole, impersonatedTutor]);

  // Fetch available quarters
  const { data: quarters = [], isLoading: loadingQuarters } = useTerminationQuarters(effectiveLocation);

  // Auto-select most recent COMPLETED quarter (skip current/in-progress quarter)
  useEffect(() => {
    if (!loadingQuarters && quarters.length > 0 && selectedQuarter === null) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);

      // Find first quarter that is completed (before current quarter)
      const completedQuarter = quarters.find(q =>
        q.year < currentYear || (q.year === currentYear && q.quarter < currentQuarter)
      );

      if (completedQuarter) {
        setSelectedQuarter(completedQuarter.quarter);
        setSelectedYear(completedQuarter.year);
      } else if (quarters.length > 0) {
        // Fallback to most recent if no completed quarters
        setSelectedQuarter(quarters[0].quarter);
        setSelectedYear(quarters[0].year);
      }
    }
  }, [quarters, loadingQuarters, selectedQuarter]);

  // Fetch terminated students
  const { data: terminatedStudents = [], isLoading: loadingStudents, mutate: mutateStudents } = useTerminatedStudents(
    selectedQuarter,
    selectedYear,
    effectiveLocation,
    effectiveTutorId
  );

  // Fetch stats
  const { data: stats, isLoading: loadingStats } = useTerminationStats(
    selectedQuarter,
    selectedYear,
    effectiveLocation,
    effectiveTutorId
  );

  // Fetch trends
  const { data: trendData, isLoading: loadingTrends } = useTerminationTrends(
    effectiveLocation,
    effectiveTutorId
  );

  // Stat detail modal state
  const [statDetailModal, setStatDetailModal] = useState<{
    statType: string;
    tutorId?: number;
    tutorName?: string;
  } | null>(null);
  const [gridViewActive, setGridViewActive] = useState(false);

  // Reset grid view when modal opens/closes
  useEffect(() => {
    setGridViewActive(false);
  }, [statDetailModal]);

  // Fetch stat details when modal is open (for opening/terminated/closing)
  const detailStatType = statDetailModal?.statType === "termRate"
    ? "terminated"
    : statDetailModal?.statType === "enrollTransfer"
      ? null // handled client-side
      : statDetailModal?.statType ?? null;

  const { data: statDetailStudents, isLoading: loadingStatDetails } = useStatDetails(
    detailStatType,
    selectedQuarter,
    selectedYear,
    effectiveLocation,
    statDetailModal?.tutorId ?? effectiveTutorId
  );

  // For enroll/transfer, fetch all 3 lists and compute set diff
  const { data: openingStudents } = useStatDetails(
    statDetailModal?.statType === "enrollTransfer" ? "opening" : null,
    selectedQuarter,
    selectedYear,
    effectiveLocation,
    statDetailModal?.tutorId ?? effectiveTutorId
  );
  const { data: closingStudents } = useStatDetails(
    statDetailModal?.statType === "enrollTransfer" ? "closing" : null,
    selectedQuarter,
    selectedYear,
    effectiveLocation,
    statDetailModal?.tutorId ?? effectiveTutorId
  );
  const { data: terminatedStudentsForDiff } = useStatDetails(
    statDetailModal?.statType === "enrollTransfer" ? "terminated" : null,
    selectedQuarter,
    selectedYear,
    effectiveLocation,
    statDetailModal?.tutorId ?? effectiveTutorId
  );
  // Fetch opening/closing for ALL tutors to detect transfers (only when viewing a specific tutor)
  const { data: allClosingStudents } = useStatDetails(
    statDetailModal?.statType === "enrollTransfer" && statDetailModal?.tutorId ? "closing" : null,
    selectedQuarter,
    selectedYear,
    effectiveLocation,
    undefined
  );
  const { data: allOpeningStudents } = useStatDetails(
    statDetailModal?.statType === "enrollTransfer" && statDetailModal?.tutorId ? "opening" : null,
    selectedQuarter,
    selectedYear,
    effectiveLocation,
    undefined
  );

  const enrollTransferData = useMemo(() => {
    if (statDetailModal?.statType !== "enrollTransfer") return null;
    if (!openingStudents || !closingStudents || !terminatedStudentsForDiff) return null;

    const opening = deduplicateByStudentId(openingStudents);
    const closing = deduplicateByStudentId(closingStudents);

    const openingIds = new Set(opening.map(s => s.student_id));
    const closingIds = new Set(closing.map(s => s.student_id));
    const terminatedIds = new Set(terminatedStudentsForDiff.map(s => s.student_id));

    const enrolledInRaw = closing.filter(s => !openingIds.has(s.student_id));
    const exitedRaw = opening.filter(s => !closingIds.has(s.student_id) && !terminatedIds.has(s.student_id));

    // Build lookup from all-tutors closing to find transfer destinations
    const allClosingMap = new Map<number, StatDetailStudent>();
    if (allClosingStudents) {
      for (const s of allClosingStudents) {
        if (!allClosingMap.has(s.student_id)) allClosingMap.set(s.student_id, s);
      }
    }

    // Build lookup from all-tutors opening to find transfer sources
    const allOpeningMap = new Map<number, StatDetailStudent>();
    if (allOpeningStudents) {
      for (const s of allOpeningStudents) {
        if (!allOpeningMap.has(s.student_id)) allOpeningMap.set(s.student_id, s);
      }
    }

    const enrolledIn: EnrolledStudent[] = enrolledInRaw.map(s => {
      const openingRecord = allOpeningMap.get(s.student_id);
      const transferredFrom = openingRecord?.tutor_name && openingRecord.tutor_name !== s.tutor_name
        ? openingRecord.tutor_name
        : null;
      return { ...s, transferred_from_tutor: transferredFrom };
    });

    const exited: ExitedStudent[] = exitedRaw.map(s => {
      const closingRecord = allClosingMap.get(s.student_id);
      const transferredTo = closingRecord?.tutor_name && closingRecord.tutor_name !== s.tutor_name
        ? closingRecord.tutor_name
        : null;
      return { ...s, transferred_to_tutor: transferredTo };
    });

    return { enrolledIn, exited };
  }, [statDetailModal?.statType, openingStudents, closingStudents, terminatedStudentsForDiff, allClosingStudents, allOpeningStudents]);

  // Auto-select tutor for my-view mode
  useEffect(() => {
    if (viewMode === 'my-view' && selectedTutorId === null && tutors.length > 0) {
      const filteredTutors = effectiveLocation
        ? tutors.filter(t => t.default_location === effectiveLocation)
        : tutors;
      if (filteredTutors.length > 0) {
        setSelectedTutorId(filteredTutors[0].id);
      }
    }
  }, [selectedTutorId, tutors, effectiveLocation, viewMode]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedTutorId === ALL_TUTORS) {
      params.set('tutor', 'all');
    } else if (typeof selectedTutorId === 'number') {
      params.set('tutor', selectedTutorId.toString());
    }
    if (selectedQuarter) params.set('quarter', selectedQuarter.toString());
    if (selectedYear) params.set('year', selectedYear.toString());
    const query = params.toString();
    router.replace(`/terminated-students${query ? `?${query}` : ''}`, { scroll: false });
  }, [selectedTutorId, selectedQuarter, selectedYear, router]);

  // Handle reason update - updates pending changes (no API call)
  const handleReasonUpdate = useCallback((student: TerminatedStudent, newReason: string) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(student.student_id) || {};
      next.set(student.student_id, {
        ...existing,
        reason: newReason,
      });
      return next;
    });
  }, []);

  // Handle reason category update
  const handleCategoryUpdate = useCallback((student: TerminatedStudent, newCategory: string) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(student.student_id) || {};
      next.set(student.student_id, {
        ...existing,
        reasonCategory: newCategory || undefined,
      });
      return next;
    });
  }, []);

  // Handle checkbox toggle - updates pending changes (no API call)
  const handleCheckboxToggle = useCallback((student: TerminatedStudent) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(student.student_id);
      // Get current effective value (pending or original)
      const currentValue = existing?.countAsTerminated ?? student.count_as_terminated;
      next.set(student.student_id, {
        ...existing,
        countAsTerminated: !currentValue,
      });
      return next;
    });
  }, []);

  // Discard all pending changes
  const handleDiscardChanges = useCallback(() => {
    setPendingChanges(new Map());
  }, []);

  const handleTutorStatClick = useCallback((statType: string, tutorId: number, tutorName: string) => {
    setStatDetailModal({ statType, tutorId, tutorName });
  }, []);


  // Save all pending changes
  const handleSaveChanges = useCallback(async () => {
    if (!selectedQuarter || !selectedYear || pendingChanges.size === 0) return;

    setIsSaving(true);
    setShowConfirmDialog(false);

    const CONCURRENCY = 5;
    const entries = Array.from(pendingChanges.entries());
    let successCount = 0;
    let failCount = 0;

    try {
      // Find original student data to merge with pending changes
      const studentMap = new Map(terminatedStudents.map(s => [s.student_id, s]));

      for (let i = 0; i < entries.length; i += CONCURRENCY) {
        const batch = entries.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(([studentId, changes]) => {
            const originalStudent = studentMap.get(studentId);
            return terminationsAPI.updateRecord(studentId, {
              quarter: selectedQuarter,
              year: selectedYear,
              reason: changes.reason ?? originalStudent?.reason ?? undefined,
              reason_category: changes.reasonCategory ?? originalStudent?.reason_category ?? undefined,
              count_as_terminated: changes.countAsTerminated ?? originalStudent?.count_as_terminated ?? false,
            }, 'system'); // TODO: Replace with actual user email from auth context when OAuth is implemented
          })
        );

        results.forEach(r => {
          if (r.status === 'fulfilled') successCount++;
          else failCount++;
        });
      }

      // Revalidate data
      mutateStudents();
      mutate(['termination-stats', selectedQuarter, selectedYear, effectiveLocation || 'all', effectiveTutorId || 'all']);

      // Clear pending changes
      setPendingChanges(new Map());

      if (failCount > 0) {
        showToast(`Saved ${successCount} changes, ${failCount} failed`, "info");
      } else {
        showToast(`Saved ${successCount} change${successCount !== 1 ? 's' : ''} successfully`, "success");
      }
    } catch (error) {
      showToast("Failed to save changes", "error");
    } finally {
      setIsSaving(false);
    }
  }, [selectedQuarter, selectedYear, pendingChanges, terminatedStudents, effectiveLocation, effectiveTutorId, mutateStudents, showToast]);

  const getEffectiveChecked = useCallback((student: TerminatedStudent): boolean => {
    const pending = pendingChanges.get(student.student_id);
    return pending?.countAsTerminated ?? student.count_as_terminated;
  }, [pendingChanges]);

  const getEffectiveReason = useCallback((student: TerminatedStudent): string => {
    const pending = pendingChanges.get(student.student_id);
    return pending?.reason ?? student.reason ?? '';
  }, [pendingChanges]);

  const getEffectiveCategory = useCallback((student: TerminatedStudent): string => {
    const pending = pendingChanges.get(student.student_id);
    return pending?.reasonCategory ?? student.reason_category ?? '';
  }, [pendingChanges]);

  // Check if a student has pending changes
  const hasPendingChanges = useCallback((studentId: number) => {
    return pendingChanges.has(studentId);
  }, [pendingChanges]);

  // Group students by tutor
  const studentsByTutor = useMemo(() => {
    const grouped: Record<string, TerminatedStudent[]> = {};
    for (const student of terminatedStudents) {
      const tutorName = student.tutor_name || "Unassigned";
      if (!grouped[tutorName]) grouped[tutorName] = [];
      grouped[tutorName].push(student);
    }
    return grouped;
  }, [terminatedStudents]);

  // Pre-compute sorted tutor groups with checked counts to avoid inline sort/filter on every render
  const sortedTutorGroups = useMemo(() => {
    return Object.entries(studentsByTutor)
      .sort(([a], [b]) => getTutorSortName(a).localeCompare(getTutorSortName(b)))
      .map(([tutorName, students]) => {
        const sorted = [...students].sort((a, b) => {
          const dir = sortConfig.direction === 'asc' ? 1 : -1;
          if (sortConfig.column === 'id') {
            return dir * (a.school_student_id || '').localeCompare(b.school_student_id || '');
          }
          return dir * (a.termination_date || '').localeCompare(b.termination_date || '');
        });
        const checkedCount = students.filter(s => getEffectiveChecked(s)).length;
        return { tutorName, students: sorted, checkedCount, totalCount: students.length };
      });
  }, [studentsByTutor, sortConfig, getEffectiveChecked]);

  // Filter tutor groups by search term and category
  const filteredTutorGroups = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const hasSearch = !!q;
    const hasCategory = !!selectedCategory;
    if (!hasSearch && !hasCategory) return sortedTutorGroups;
    return sortedTutorGroups
      .map(group => {
        const students = group.students.filter(s => {
          if (hasSearch) {
            const matchesSearch = s.student_name.toLowerCase().includes(q) ||
              (s.school_student_id && s.school_student_id.toLowerCase().includes(q));
            if (!matchesSearch) return false;
          }
          if (hasCategory) {
            const cat = getEffectiveCategory(s);
            if (cat !== selectedCategory) return false;
          }
          return true;
        });
        return {
          ...group,
          students,
          checkedCount: students.filter(s => getEffectiveChecked(s)).length,
          totalCount: students.length,
        };
      })
      .filter(group => group.students.length > 0);
  }, [sortedTutorGroups, searchTerm, selectedCategory, getEffectiveChecked, getEffectiveCategory]);

  const totalCheckedCount = useMemo(() => {
    return filteredTutorGroups.reduce((sum, g) => sum + g.checkedCount, 0);
  }, [filteredTutorGroups]);

  const filteredStudentCount = useMemo(() => {
    return filteredTutorGroups.reduce((sum, g) => sum + g.totalCount, 0);
  }, [filteredTutorGroups]);

  // Collapsible group helpers
  const toggleGroup = useCallback((tutorName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(tutorName)) next.delete(tutorName);
      else next.add(tutorName);
      return next;
    });
  }, []);

  const toggleAllGroups = useCallback(() => {
    setCollapsedGroups(prev => {
      if (prev.size === 0) {
        return new Set(filteredTutorGroups.map(g => g.tutorName));
      }
      return new Set();
    });
  }, [filteredTutorGroups]);

  // When search is active, auto-expand all groups so results aren't hidden
  const effectiveCollapsedGroups = searchTerm.trim() ? new Set<string>() : collapsedGroups;

  // Memoize tutor stats sorting
  const sortedTutorStats = useMemo(() => {
    if (!stats?.tutor_stats) return [];
    const dir = tutorStatsSortConfig.direction === 'asc' ? 1 : -1;
    return [...stats.tutor_stats].sort((a, b) => {
      switch (tutorStatsSortConfig.column) {
        case 'instructor':
          return dir * getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name));
        case 'opening': return dir * (a.opening - b.opening);
        case 'enrollTransfer': return dir * (a.enrollment_transfer - b.enrollment_transfer);
        case 'terminated': return dir * (a.terminated - b.terminated);
        case 'closing': return dir * (a.closing - b.closing);
        case 'termRate': return dir * (a.term_rate - b.term_rate);
        default: return 0;
      }
    });
  }, [stats?.tutor_stats, tutorStatsSortConfig]);

  const isLoading = loadingQuarters || loadingStudents || loadingStats;

  return (
    <DeskSurface>
      <PageTransition>
        <div className="min-h-screen">
          <div className="flex flex-col gap-3 p-2 sm:p-4">
            {/* Toolbar - outer div is sticky container, inner div has visual styling */}
            <div className="sticky top-0 z-30">
              <div className={cn(
                "flex flex-wrap items-center gap-2 sm:gap-3",
                "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47]",
                "rounded-lg px-3 sm:px-4 py-2",
                !isMobile && "paper-texture"
              )}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full">
              {/* Title and filters */}
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap flex-1">
                <div className="flex items-center gap-2">
                  <UserMinus className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                  <h1 className="text-lg font-semibold">Terminated Students</h1>
                </div>

                {/* Quarter Selector */}
                <div className="relative">
                  <button
                    onClick={() => setIsQuarterDropdownOpen(!isQuarterDropdownOpen)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                      "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#8b6f47]",
                      "text-[#a0704b] dark:text-[#cd853f]",
                      "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] hover:shadow-sm"
                    )}
                  >
                    {selectedQuarter && selectedYear
                      ? `Q${selectedQuarter} ${selectedYear}`
                      : "Select Quarter"}
                    <ChevronDown className={cn(
                      "h-4 w-4 transition-transform",
                      isQuarterDropdownOpen && "rotate-180"
                    )} />
                  </button>

                  {isQuarterDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-40 bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-lg z-50">
                      {quarters.map((q) => (
                        <button
                          key={`${q.quarter}-${q.year}`}
                          onClick={() => {
                            setSelectedQuarter(q.quarter);
                            setSelectedYear(q.year);
                            setIsQuarterDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full px-4 py-2 text-left text-sm hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors first:rounded-t-lg last:rounded-b-lg",
                            selectedQuarter === q.quarter && selectedYear === q.year
                              ? "bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b] dark:text-[#cd853f] font-medium"
                              : ""
                          )}
                        >
                          Q{q.quarter} {q.year}
                        </button>
                      ))}
                      {quarters.length === 0 && (
                        <div className="px-4 py-2 text-sm text-muted-foreground">
                          No data available
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Tutor Selector (admin-level users in center-view only) */}
                {canViewAdminPages && viewMode === 'center-view' && (
                  <TutorSelector
                    value={selectedTutorId}
                    onChange={setSelectedTutorId}
                    location={effectiveLocation}
                    showAllTutors
                  />
                )}

                {/* Search */}
                <div className="relative min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={cn(
                      "w-full pl-8 pr-8 py-1.5 text-sm rounded-full",
                      "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#8b6f47]",
                      "text-foreground placeholder:text-muted-foreground",
                      "focus:outline-none focus:ring-1 focus:ring-[#a0704b] dark:focus:ring-[#cd853f]"
                    )}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Category Filter */}
                <CategoryDropdown
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  placeholder="All Categories"
                  showAllOption
                />
              </div>

              {/* Export + Save Buttons */}
              <div className="flex items-center gap-2">
                {/* CSV Export */}
                <button
                  onClick={() => selectedQuarter && selectedYear && exportTerminatedStudentsCSV(
                    filteredTutorGroups, selectedQuarter, selectedYear,
                    getEffectiveChecked, getEffectiveReason, getEffectiveCategory
                  )}
                  disabled={!selectedQuarter || !selectedYear || terminatedStudents.length === 0}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                    "border border-[#d4a574] dark:border-[#8b6f47]",
                    "text-[#a0704b] dark:text-[#cd853f]",
                    "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]",
                    "disabled:opacity-50"
                  )}
                  title="Export as CSV"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                </button>

                {/* Save/Discard - hide for read-only users */}
                {!isReadOnly && pendingChanges.size > 0 && (
                <>
                  <button
                    onClick={handleDiscardChanges}
                    disabled={isSaving}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                      "border border-[#d4a574] dark:border-[#8b6f47]",
                      "text-[#a0704b] dark:text-[#cd853f]",
                      "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]",
                      "disabled:opacity-50"
                    )}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Discard
                  </button>
                  <button
                    onClick={() => setShowConfirmDialog(true)}
                    disabled={isSaving}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                      "bg-[#a0704b] text-white",
                      "hover:bg-[#8b6140]",
                      "disabled:opacity-50"
                    )}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Changes
                    <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">
                      {pendingChanges.size}
                    </span>
                  </button>
                </>
                )}
              </div>
            </div>
          </div>
          </div>

          {/* Click outside to close dropdown */}
          {isQuarterDropdownOpen && (
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsQuarterDropdownOpen(false)}
            />
          )}

            {/* Main content */}
            <div className="space-y-6">
            {/* Location Stats Card */}
            {stats && (
              <div className={cn(
                "bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-4 shadow-sm",
                !isMobile && "paper-texture"
              )}>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                  {effectiveLocation || "All Locations"} - Q{selectedQuarter} {selectedYear}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center p-4 bg-[#f5ede3] dark:bg-[#3d3628] rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]">
                    <button onClick={() => setStatDetailModal({ statType: "opening" })} className="text-2xl font-bold text-[#6b5a4a] dark:text-[#cd853f] hover:underline cursor-pointer">{stats.location_stats.opening}</button>
                    <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      Opening
                      <Tooltip content="Students with an active enrollment during the first week of the quarter, plus continuing students whose renewal starts within 21 days after (accounts for holidays).">
                        <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </Tooltip>
                    </div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <button
                      onClick={() => setStatDetailModal({ statType: "enrollTransfer" })}
                      className={cn(
                        "text-2xl font-bold hover:underline cursor-pointer",
                        stats.location_stats.enrollment_transfer >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
                      )}
                    >
                      {stats.location_stats.enrollment_transfer >= 0 ? "+" : ""}{stats.location_stats.enrollment_transfer}
                    </button>
                    <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      Enroll/Transfer
                      <Tooltip content="Net student change: Closing − Opening + Terminated. Positive means more students enrolled or transferred in than left.">
                        <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </Tooltip>
                    </div>
                  </div>
                  <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <button onClick={() => setStatDetailModal({ statType: "terminated" })} className="text-2xl font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer">{stats.location_stats.terminated}</button>
                    <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      Terminated
                      <Tooltip content="Students from the terminated list marked as &quot;Count as Terminated&quot; for this quarter.">
                        <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </Tooltip>
                    </div>
                  </div>
                  <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <button onClick={() => setStatDetailModal({ statType: "closing" })} className="text-2xl font-bold text-green-600 dark:text-green-400 hover:underline cursor-pointer">{stats.location_stats.closing}</button>
                    <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      Closing
                      <Tooltip content="Students still active at the end of the quarter, including those who renewed within 21 days after the quarter boundary (must have had an enrollment during the quarter).">
                        <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </Tooltip>
                    </div>
                  </div>
                  <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <button onClick={() => setStatDetailModal({ statType: "termRate" })} className="text-2xl font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer">{stats.location_stats.term_rate.toFixed(2)}%</button>
                    <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      Term Rate
                      <Tooltip content="Terminated ÷ Opening × 100%.">
                        <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TerminationTrendChart
                data={trendData}
                isLoading={loadingTrends}
                selectedQuarter={selectedQuarter}
                selectedYear={selectedYear}
                isMobile={isMobile}
              />
              {terminatedStudents.length > 0 && (
                <ReasonDistributionChart
                  students={terminatedStudents}
                  getEffectiveChecked={getEffectiveChecked}
                  getEffectiveCategory={getEffectiveCategory}
                  isMobile={isMobile}
                />
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : terminatedStudents.length === 0 ? (
              <StickyNote icon={UserMinus} color="blue">
                <p className="text-lg font-medium">No terminated students</p>
                <p className="text-muted-foreground">
                  {selectedQuarter && selectedYear
                    ? `No students terminated in Q${selectedQuarter} ${selectedYear}`
                    : "Select a quarter to view terminated students"}
                </p>
              </StickyNote>
            ) : (
              <>
                {/* Terminated Students List */}
                <div className={cn(
                  "bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm overflow-hidden",
                  !isMobile && "paper-texture"
                )}>
                  <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3]/50 dark:bg-[#3d3628]/50 flex items-center justify-between">
                    <h2 className="font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Terminated Students ({totalCheckedCount}/{searchTerm ? `${filteredStudentCount} of ${terminatedStudents.length}` : terminatedStudents.length})
                    </h2>
                    {filteredTutorGroups.length > 1 && (
                      <button
                        onClick={toggleAllGroups}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {collapsedGroups.size === 0 ? "Collapse All" : "Expand All"}
                      </button>
                    )}
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium w-10">Count</th>
                          <th className="px-4 py-3 text-left font-medium">
                            <button
                              onClick={() => handleSort('id')}
                              className="flex items-center gap-1 hover:text-[#a0704b] dark:hover:text-[#cd853f] transition-colors"
                            >
                              ID#
                              <SortIcon active={sortConfig.column === 'id'} direction={sortConfig.direction} />
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left font-medium">Student</th>
                          <th className="px-4 py-3 text-left font-medium">Grade</th>
                          <th className="px-4 py-3 text-left font-medium">Instructor</th>
                          <th className="px-4 py-3 text-left font-medium">Schedule</th>
                          <th className="px-4 py-3 text-left font-medium">
                            <button
                              onClick={() => handleSort('endDate')}
                              className="flex items-center gap-1 hover:text-[#a0704b] dark:hover:text-[#cd853f] transition-colors"
                            >
                              End Date
                              <SortIcon active={sortConfig.column === 'endDate'} direction={sortConfig.direction} />
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left font-medium min-w-[140px]">Category</th>
                          <th className="px-4 py-3 text-left font-medium min-w-[200px]">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
                        {filteredTutorGroups.map(({ tutorName, students, checkedCount, totalCount }) => (
                          <React.Fragment key={tutorName}>
                            <tr
                              className="bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors select-none"
                              onClick={() => toggleGroup(tutorName)}
                            >
                              <td colSpan={9} className="px-4 py-2 font-medium text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                  {effectiveCollapsedGroups.has(tutorName) ? (
                                    <ChevronRight className="h-4 w-4 shrink-0" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 shrink-0" />
                                  )}
                                  {tutorName} ({checkedCount}/{totalCount})
                                </span>
                              </td>
                            </tr>
                            {!effectiveCollapsedGroups.has(tutorName) && students.map((student) => (
                              <TerminatedStudentRow
                                key={student.student_id}
                                student={student}
                                onCheckboxToggle={handleCheckboxToggle}
                                onReasonUpdate={handleReasonUpdate}
                                onCategoryUpdate={handleCategoryUpdate}
                                effectiveCountAsTerminated={getEffectiveChecked(student)}
                                effectiveReason={getEffectiveReason(student)}
                                effectiveCategory={getEffectiveCategory(student)}
                                hasPendingChanges={hasPendingChanges(student.student_id)}
                                showLocationPrefix={selectedLocation === "All Locations"}
                                readOnly={isReadOnly}
                              />
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tutor Stats Table */}
                {stats && stats.tutor_stats.length > 0 && (
                  <div className={cn(
                    "bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm overflow-hidden",
                    !isMobile && "paper-texture"
                  )}>
                    <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3]/50 dark:bg-[#3d3628]/50">
                      <h2 className="font-medium">Tutor Statistics</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">
                              <button
                                onClick={() => handleTutorStatsSort('instructor')}
                                className="flex items-center gap-1 hover:text-foreground/80"
                              >
                                Instructor
                                <SortIcon active={tutorStatsSortConfig.column === 'instructor'} direction={tutorStatsSortConfig.direction} />
                              </button>
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                              <button onClick={() => handleTutorStatsSort('opening')} className="flex items-center gap-1 hover:text-foreground/80 ml-auto">
                                Opening
                                <Tooltip content="Students active during the first week, plus continuing students renewing within 21 days after."><Info className="h-3 w-3 opacity-40" /></Tooltip>
                                <SortIcon active={tutorStatsSortConfig.column === 'opening'} direction={tutorStatsSortConfig.direction} />
                              </button>
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                              <button onClick={() => handleTutorStatsSort('enrollTransfer')} className="flex items-center gap-1 hover:text-foreground/80 ml-auto">
                                Enroll/Transfer
                                <Tooltip content="Net student change: Closing − Opening + Terminated."><Info className="h-3 w-3 opacity-40" /></Tooltip>
                                <SortIcon active={tutorStatsSortConfig.column === 'enrollTransfer'} direction={tutorStatsSortConfig.direction} />
                              </button>
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                              <button onClick={() => handleTutorStatsSort('terminated')} className="flex items-center gap-1 hover:text-foreground/80 ml-auto">
                                Terminated
                                <Tooltip content="Students marked as &quot;Count as Terminated&quot; for this quarter."><Info className="h-3 w-3 opacity-40" /></Tooltip>
                                <SortIcon active={tutorStatsSortConfig.column === 'terminated'} direction={tutorStatsSortConfig.direction} />
                              </button>
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                              <button onClick={() => handleTutorStatsSort('closing')} className="flex items-center gap-1 hover:text-foreground/80 ml-auto">
                                Closing
                                <Tooltip content="Students still active at quarter end, including renewals within 21 days after the boundary."><Info className="h-3 w-3 opacity-40" /></Tooltip>
                                <SortIcon active={tutorStatsSortConfig.column === 'closing'} direction={tutorStatsSortConfig.direction} />
                              </button>
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                              <button onClick={() => handleTutorStatsSort('termRate')} className="flex items-center gap-1 hover:text-foreground/80 ml-auto">
                                Term Rate
                                <Tooltip content="Terminated ÷ Opening × 100%." align="right"><Info className="h-3 w-3 opacity-40" /></Tooltip>
                                <SortIcon active={tutorStatsSortConfig.column === 'termRate'} direction={tutorStatsSortConfig.direction} />
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
                          {sortedTutorStats.map((tutor) => (
                            <TutorStatsRow key={tutor.tutor_id} stats={tutor} onStatClick={handleTutorStatClick} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
            </div>
          </div>
        </div>
        {/* Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showConfirmDialog}
          onConfirm={handleSaveChanges}
          onCancel={() => setShowConfirmDialog(false)}
          title="Confirm Changes"
          message={`You are about to save ${pendingChanges.size} change${pendingChanges.size !== 1 ? 's' : ''} to terminated student records.`}
          confirmText="Save Changes"
          loading={isSaving}
        />
      </PageTransition>

      {/* Stat Detail Modal */}
      <Modal
        isOpen={!!statDetailModal}
        onClose={() => setStatDetailModal(null)}
        title={
          statDetailModal ? (
            <span>
              {statDetailModal.statType === "opening" && "Opening Students"}
              {statDetailModal.statType === "closing" && "Closing Students"}
              {statDetailModal.statType === "terminated" && "Terminated Students"}
              {statDetailModal.statType === "termRate" && "Terminated Students"}
              {statDetailModal.statType === "enrollTransfer" && "Enroll/Transfer Breakdown"}
              {" — "}Q{selectedQuarter} {selectedYear}
              {statDetailModal.tutorName && ` — ${statDetailModal.tutorName}`}
            </span>
          ) : ""
        }
        size={gridViewActive ? "xl" : "md"}
      >
        <StatDetailContent
          statType={statDetailModal?.statType ?? null}
          students={statDetailStudents}
          enrollTransferData={enrollTransferData}
          loading={
            statDetailModal?.statType === "enrollTransfer"
              ? !openingStudents || !closingStudents || !terminatedStudentsForDiff
              : loadingStatDetails
          }
          gridViewActive={gridViewActive}
          setGridViewActive={setGridViewActive}
          showLocationPrefix={selectedLocation === "All Locations"}
        />
      </Modal>
    </DeskSurface>
  );
}

// Sort options for stat detail lists
type StatDetailSort = 'id' | 'name';

function useSortedStudents(students: StatDetailStudent[], sortBy: StatDetailSort) {
  return useMemo(() => {
    return [...students].sort((a, b) => {
      if (sortBy === 'id') {
        return (a.school_student_id || '').localeCompare(b.school_student_id || '');
      }
      return a.student_name.localeCompare(b.student_name);
    });
  }, [students, sortBy]);
}

function SortToggle({ sortBy, onChange }: { sortBy: StatDetailSort; onChange: (v: StatDetailSort) => void }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <span>Sort:</span>
      <button
        onClick={() => onChange('id')}
        className={cn("px-1.5 py-0.5 rounded", sortBy === 'id' ? "bg-[#a0704b]/15 text-[#a0704b] dark:text-[#cd853f] font-medium" : "hover:bg-muted/50")}
      >
        ID
      </button>
      <button
        onClick={() => onChange('name')}
        className={cn("px-1.5 py-0.5 rounded", sortBy === 'name' ? "bg-[#a0704b]/15 text-[#a0704b] dark:text-[#cd853f] font-medium" : "hover:bg-muted/50")}
      >
        Name
      </button>
    </div>
  );
}

function ViewToggle({ viewMode, onChange }: { viewMode: 'list' | 'grid'; onChange: (v: 'list' | 'grid') => void }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <span>View:</span>
      <button
        onClick={() => onChange('list')}
        className={cn("px-1.5 py-0.5 rounded flex items-center gap-0.5", viewMode === 'list' ? "bg-[#a0704b]/15 text-[#a0704b] dark:text-[#cd853f] font-medium" : "hover:bg-muted/50")}
      >
        <LayoutList className="h-3 w-3" /> List
      </button>
      <button
        onClick={() => onChange('grid')}
        className={cn("px-1.5 py-0.5 rounded flex items-center gap-0.5", viewMode === 'grid' ? "bg-[#a0704b]/15 text-[#a0704b] dark:text-[#cd853f] font-medium" : "hover:bg-muted/50")}
      >
        <Grid3X3 className="h-3 w-3" /> Grid
      </button>
    </div>
  );
}

// Stat Detail Content Component
function StatDetailContent({
  statType,
  students,
  enrollTransferData,
  loading,
  gridViewActive,
  setGridViewActive,
  showLocationPrefix,
}: {
  statType: string | null;
  students: StatDetailStudent[] | undefined;
  enrollTransferData: { enrolledIn: EnrolledStudent[]; exited: ExitedStudent[] } | null;
  loading: boolean;
  gridViewActive: boolean;
  setGridViewActive: (v: boolean) => void;
  showLocationPrefix: boolean;
}) {
  const [sortBy, setSortBy] = useState<StatDetailSort>('id');
  const [searchQuery, setSearchQuery] = useState('');
  const [popoverEnrollment, setPopoverEnrollment] = useState<import("@/types").Enrollment | null>(null);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [fetchingEnrollmentId, setFetchingEnrollmentId] = useState<number | null>(null);

  const filterStudents = useCallback(<T extends StatDetailStudent>(list: T[]): T[] => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(s =>
      s.student_name.toLowerCase().includes(q) ||
      (s.school_student_id && s.school_student_id.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const handleStudentClick = useCallback(async (e: React.MouseEvent, student: StatDetailStudent) => {
    if (!student.enrollment_id) return;
    setPopoverClickPosition({ x: e.clientX, y: e.clientY });
    setFetchingEnrollmentId(student.enrollment_id);
    try {
      const enrollment = await enrollmentsAPI.getById(student.enrollment_id);
      setPopoverEnrollment(enrollment);
    } catch {
      // Failed to fetch enrollment
      setPopoverClickPosition(null);
    } finally {
      setFetchingEnrollmentId(null);
    }
  }, []);

  const onPopoverClose = useCallback(() => {
    setPopoverEnrollment(null);
    setPopoverClickPosition(null);
  }, []);

  // Apply search filter (must be before any early returns to satisfy Rules of Hooks)
  const filteredStudents = useMemo(() => filterStudents(students ?? []), [students, filterStudents]);
  const filteredEnrollTransferData = useMemo(() => {
    if (!enrollTransferData) return null;
    return {
      enrolledIn: filterStudents(enrollTransferData.enrolledIn),
      exited: filterStudents(enrollTransferData.exited),
    };
  }, [enrollTransferData, filterStudents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const viewMode = gridViewActive ? 'grid' : 'list';

  // Toolbar: search + sort + view toggle
  const toolbar = (
    <div className="flex items-center gap-2 mb-2">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-7 pr-2 py-1 text-xs rounded border border-[#e8d4b8] dark:border-[#6b5a4a] bg-transparent focus:outline-none focus:border-[#a0704b] dark:focus:border-[#cd853f]"
        />
      </div>
      <SortToggle sortBy={sortBy} onChange={setSortBy} />
      <ViewToggle viewMode={viewMode} onChange={(v) => setGridViewActive(v === 'grid')} />
    </div>
  );

  const isEnrollTransfer = statType === "enrollTransfer" && filteredEnrollTransferData;

  return (
    <div>
      {toolbar}
      {isEnrollTransfer ? (
        gridViewActive ? (
          <TimetableGridEnrollTransfer
            enrollTransferData={filteredEnrollTransferData}
            onStudentClick={handleStudentClick}
            fetchingEnrollmentId={fetchingEnrollmentId}
            sortBy={sortBy}
            showLocationPrefix={showLocationPrefix}
          />
        ) : (
          <StatDetailEnrollTransfer
            enrollTransferData={filteredEnrollTransferData}
            sortBy={sortBy}
            onStudentClick={handleStudentClick}
            fetchingEnrollmentId={fetchingEnrollmentId}
            showLocationPrefix={showLocationPrefix}
          />
        )
      ) : (
        gridViewActive ? (
          <TimetableGrid
            students={filteredStudents}
            onStudentClick={handleStudentClick}
            fetchingEnrollmentId={fetchingEnrollmentId}
            sortBy={sortBy}
            showLocationPrefix={showLocationPrefix}
          />
        ) : (
          <StatDetailList
            students={filteredStudents}
            sortBy={sortBy}
            onStudentClick={handleStudentClick}
            fetchingEnrollmentId={fetchingEnrollmentId}
            showLocationPrefix={showLocationPrefix}
          />
        )
      )}
      <EnrollmentDetailPopover
        enrollment={popoverEnrollment}
        isOpen={!!popoverEnrollment}
        onClose={onPopoverClose}
        clickPosition={popoverClickPosition}
      />
    </div>
  );
}

function StatDetailEnrollTransfer({
  enrollTransferData,
  sortBy,
  onStudentClick,
  fetchingEnrollmentId,
  showLocationPrefix,
}: {
  enrollTransferData: { enrolledIn: EnrolledStudent[]; exited: ExitedStudent[] };
  sortBy: StatDetailSort;
  onStudentClick: (e: React.MouseEvent, s: StatDetailStudent) => void;
  fetchingEnrollmentId: number | null;
  showLocationPrefix: boolean;
}) {
  const sortedEnrolledIn = useSortedStudents(enrollTransferData.enrolledIn, sortBy);
  const sortedExited = useSortedStudents(enrollTransferData.exited, sortBy);

  return (
    <div className="space-y-4 max-h-[400px] overflow-y-auto">
      <div>
        <h3 className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
          +{enrollTransferData.enrolledIn.length} Enrolled / Transferred In
        </h3>
        {sortedEnrolledIn.length === 0 ? (
          <p className="text-sm text-muted-foreground pl-2">None</p>
        ) : (
          <ul className="space-y-0.5">
            {sortedEnrolledIn.map((s) => (
              <StudentDetailItem key={s.student_id} student={s} onClick={onStudentClick} fetchingEnrollmentId={fetchingEnrollmentId} transferredFromTutor={(s as EnrolledStudent).transferred_from_tutor} showLocationPrefix={showLocationPrefix} />
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-sm font-medium text-orange-700 dark:text-orange-400 mb-2">
          −{enrollTransferData.exited.length} Exited (not terminated)
        </h3>
        {sortedExited.length === 0 ? (
          <p className="text-sm text-muted-foreground pl-2">None</p>
        ) : (
          <ul className="space-y-0.5">
            {sortedExited.map((s) => (
              <StudentDetailItem key={s.student_id} student={s} onClick={onStudentClick} fetchingEnrollmentId={fetchingEnrollmentId} transferredToTutor={(s as ExitedStudent).transferred_to_tutor} showLocationPrefix={showLocationPrefix} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatDetailList({
  students,
  sortBy,
  onStudentClick,
  fetchingEnrollmentId,
  showLocationPrefix,
}: {
  students: StatDetailStudent[] | undefined;
  sortBy: StatDetailSort;
  onStudentClick: (e: React.MouseEvent, s: StatDetailStudent) => void;
  fetchingEnrollmentId: number | null;
  showLocationPrefix: boolean;
}) {
  const deduped = useMemo(() => deduplicateByStudentId(students ?? []), [students]);

  const sorted = useSortedStudents(deduped, sortBy);

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No students found</p>
      ) : (
        <ul className="space-y-0.5">
          {sorted.map((s) => (
            <StudentDetailItem key={s.student_id} student={s} onClick={onStudentClick} fetchingEnrollmentId={fetchingEnrollmentId} showLocationPrefix={showLocationPrefix} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
        {sorted.length} student{sorted.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

const StudentDetailItem = React.memo(function StudentDetailItem({
  student,
  onClick,
  fetchingEnrollmentId,
  transferredToTutor,
  transferredFromTutor,
  showLocationPrefix,
}: {
  student: StatDetailStudent;
  onClick: (e: React.MouseEvent, s: StatDetailStudent) => void;
  fetchingEnrollmentId: number | null;
  transferredToTutor?: string | null;
  transferredFromTutor?: string | null;
  showLocationPrefix?: boolean;
}) {
  const isFetching = fetchingEnrollmentId === student.enrollment_id;

  return (
    <li
      className={cn(
        "flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors",
        student.enrollment_id ? "hover:bg-muted/50 cursor-pointer" : ""
      )}
      onClick={(e) => onClick(e, student)}
    >
      <StudentInfoBadges
        student={{
          student_id: student.student_id,
          student_name: student.student_name,
          school_student_id: student.school_student_id ?? undefined,
          grade: student.grade ?? undefined,
          lang_stream: student.lang_stream ?? undefined,
          school: student.school ?? undefined,
          home_location: student.home_location ?? undefined,
        }}
        showLocationPrefix={showLocationPrefix}
      />
      <span className="text-muted-foreground text-xs flex items-center gap-1.5 ml-2 shrink-0">
        {transferredFromTutor ? (
          <>
            <span className="text-blue-600 dark:text-blue-400">{transferredFromTutor}</span>
            <span className="text-muted-foreground">{"\u2192"}</span>
            <span className="text-[#a0704b] dark:text-[#cd853f]">{student.tutor_name}</span>
          </>
        ) : transferredToTutor ? (
          <>
            <span className="text-[#a0704b] dark:text-[#cd853f]">{student.tutor_name}</span>
            <span className="text-muted-foreground">{"\u2192"}</span>
            <span className="text-blue-600 dark:text-blue-400">{transferredToTutor}</span>
          </>
        ) : (
          student.tutor_name && <span className="text-[#a0704b] dark:text-[#cd853f]">{student.tutor_name}</span>
        )}
        {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
      </span>
    </li>
  );
});

// Day ordering for grid columns (Sun first)
const DAY_ORDER: Record<string, number> = {
  'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6,
};

function useGridData(students: StatDetailStudent[], sortBy: StatDetailSort) {
  return useMemo(() => {
    const gridMap: Record<string, Record<string, StatDetailStudent[]>> = {};
    const unscheduled: StatDetailStudent[] = [];
    const daySet = new Set<string>();
    const timeSet = new Set<string>();

    // Dedup first
    const deduped = deduplicateByStudentId(students);

    for (const student of deduped) {
      if (!student.assigned_day || !student.assigned_time) {
        unscheduled.push(student);
        continue;
      }
      const day = student.assigned_day;
      const time = student.assigned_time;
      daySet.add(day);
      timeSet.add(time);
      if (!gridMap[time]) gridMap[time] = {};
      if (!gridMap[time][day]) gridMap[time][day] = [];
      gridMap[time][day].push(student);
    }

    // Sort students within each cell and unscheduled list
    const sortFn = (a: StatDetailStudent, b: StatDetailStudent) =>
      sortBy === 'id'
        ? (a.school_student_id || '').localeCompare(b.school_student_id || '')
        : a.student_name.localeCompare(b.student_name);

    for (const time of Object.keys(gridMap)) {
      for (const day of Object.keys(gridMap[time])) {
        gridMap[time][day].sort(sortFn);
      }
    }
    unscheduled.sort(sortFn);

    const sortedDays = Array.from(daySet).sort(
      (a, b) => (DAY_ORDER[a] ?? 99) - (DAY_ORDER[b] ?? 99)
    );

    const parseStartMinutes = (slot: string) => {
      const m = slot.match(/^(\d{1,2}):(\d{2})/);
      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 9999;
    };
    const sortedTimes = Array.from(timeSet).sort(
      (a, b) => parseStartMinutes(a) - parseStartMinutes(b)
    );

    return { grid: gridMap, unscheduled, days: sortedDays, timeSlots: sortedTimes, total: deduped.length };
  }, [students, sortBy]);
}

function TimetableGridTable({
  grid,
  days,
  timeSlots,
  onStudentClick,
  fetchingEnrollmentId,
  showTransferInfo,
  showTransferFromInfo,
  showLocationPrefix,
}: {
  grid: Record<string, Record<string, StatDetailStudent[]>>;
  days: string[];
  timeSlots: string[];
  onStudentClick: (e: React.MouseEvent, s: StatDetailStudent) => void;
  fetchingEnrollmentId: number | null;
  showTransferInfo?: boolean;
  showTransferFromInfo?: boolean;
  showLocationPrefix?: boolean;
}) {
  if (days.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground border-b border-[#e8d4b8] dark:border-[#6b5a4a] w-28">
              Time
            </th>
            {days.map(day => (
              <th key={day} className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map(time => (
            <tr key={time}>
              <td className="px-2 py-2 text-[10px] font-mono text-muted-foreground border-r border-[#e8d4b8] dark:border-[#6b5a4a] align-top whitespace-nowrap">
                {time}
              </td>
              {days.map(day => {
                const cellStudents = grid[time]?.[day] ?? [];
                return (
                  <td key={day} className="px-1 py-1 align-top border-r border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
                    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                      {cellStudents.map(s => (
                        <div
                          key={s.student_id}
                          className={cn(
                            "flex items-center gap-1 px-1.5 py-1 rounded-sm",
                            "bg-[#fef9f3] dark:bg-[#2d2618] border-l-2 border-[#d4a574] dark:border-[#8b6f47]",
                            s.enrollment_id && "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] cursor-pointer",
                            "transition-colors"
                          )}
                          onClick={(e) => onStudentClick(e, s)}
                        >
                          {s.school_student_id && (
                            <span className="text-gray-400 dark:text-gray-500 font-mono text-[9px] shrink-0">
                              {showLocationPrefix && s.home_location ? `${s.home_location}-` : ''}{s.school_student_id}
                            </span>
                          )}
                          <span className="font-medium text-[11px] text-gray-800 dark:text-gray-200 truncate">
                            {s.student_name}
                          </span>
                          {s.grade && (
                            <span
                              className="text-[8px] px-1 py-px rounded shrink-0 text-gray-800"
                              style={{ backgroundColor: getGradeColor(s.grade, s.lang_stream ?? undefined) }}
                            >
                              {s.grade}
                            </span>
                          )}
                          {showTransferFromInfo && (s as EnrolledStudent).transferred_from_tutor && (
                            <span className="text-[9px] text-blue-600 dark:text-blue-400 shrink-0 truncate">
                              {"\u2190"} {(s as EnrolledStudent).transferred_from_tutor}
                            </span>
                          )}
                          {showTransferInfo && (s as ExitedStudent).transferred_to_tutor && (
                            <span className="text-[9px] text-blue-600 dark:text-blue-400 shrink-0 truncate">
                              {"\u2192"} {(s as ExitedStudent).transferred_to_tutor}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimetableGrid({
  students,
  onStudentClick,
  fetchingEnrollmentId,
  sortBy,
  showLocationPrefix,
}: {
  students: StatDetailStudent[];
  onStudentClick: (e: React.MouseEvent, s: StatDetailStudent) => void;
  fetchingEnrollmentId: number | null;
  sortBy: StatDetailSort;
  showLocationPrefix: boolean;
}) {
  const { grid, unscheduled, days, timeSlots, total } = useGridData(students, sortBy);

  if (days.length === 0 && unscheduled.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No students found</p>;
  }

  return (
    <div>
      <TimetableGridTable
        grid={grid}
        days={days}
        timeSlots={timeSlots}
        onStudentClick={onStudentClick}
        fetchingEnrollmentId={fetchingEnrollmentId}
        showLocationPrefix={showLocationPrefix}
      />
      {unscheduled.length > 0 && (
        <div className="mt-3 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          <p className="text-xs text-muted-foreground mb-1">Unscheduled ({unscheduled.length})</p>
          <ul className="space-y-0.5">
            {unscheduled.map(s => (
              <StudentDetailItem key={s.student_id} student={s} onClick={onStudentClick} fetchingEnrollmentId={fetchingEnrollmentId} showLocationPrefix={showLocationPrefix} />
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
        {total} student{total !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function TimetableGridEnrollTransfer({
  enrollTransferData,
  onStudentClick,
  fetchingEnrollmentId,
  sortBy,
  showLocationPrefix,
}: {
  enrollTransferData: { enrolledIn: EnrolledStudent[]; exited: ExitedStudent[] };
  onStudentClick: (e: React.MouseEvent, s: StatDetailStudent) => void;
  fetchingEnrollmentId: number | null;
  sortBy: StatDetailSort;
  showLocationPrefix: boolean;
}) {
  const enrolledGrid = useGridData(enrollTransferData.enrolledIn, sortBy);
  const exitedGrid = useGridData(enrollTransferData.exited, sortBy);

  return (
    <div className="space-y-4 max-h-[400px] overflow-y-auto">
      <div>
        <h3 className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
          +{enrolledGrid.total} Enrolled / Transferred In
        </h3>
        {enrolledGrid.total === 0 ? (
          <p className="text-sm text-muted-foreground pl-2">None</p>
        ) : (
          <>
            <TimetableGridTable
              grid={enrolledGrid.grid}
              days={enrolledGrid.days}
              timeSlots={enrolledGrid.timeSlots}
              onStudentClick={onStudentClick}
              fetchingEnrollmentId={fetchingEnrollmentId}
              showTransferFromInfo
              showLocationPrefix={showLocationPrefix}
            />
            {enrolledGrid.unscheduled.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground mb-1">Unscheduled ({enrolledGrid.unscheduled.length})</p>
                <ul className="space-y-0.5">
                  {enrolledGrid.unscheduled.map(s => (
                    <StudentDetailItem key={s.student_id} student={s} onClick={onStudentClick} fetchingEnrollmentId={fetchingEnrollmentId} transferredFromTutor={(s as EnrolledStudent).transferred_from_tutor} showLocationPrefix={showLocationPrefix} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      <div>
        <h3 className="text-sm font-medium text-orange-700 dark:text-orange-400 mb-2">
          −{exitedGrid.total} Exited (not terminated)
        </h3>
        {exitedGrid.total === 0 ? (
          <p className="text-sm text-muted-foreground pl-2">None</p>
        ) : (
          <>
            <TimetableGridTable
              grid={exitedGrid.grid}
              days={exitedGrid.days}
              timeSlots={exitedGrid.timeSlots}
              onStudentClick={onStudentClick}
              fetchingEnrollmentId={fetchingEnrollmentId}
              showTransferInfo
              showLocationPrefix={showLocationPrefix}
            />
            {exitedGrid.unscheduled.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground mb-1">Unscheduled ({exitedGrid.unscheduled.length})</p>
                <ul className="space-y-0.5">
                  {exitedGrid.unscheduled.map(s => (
                    <StudentDetailItem key={s.student_id} student={s} onClick={onStudentClick} fetchingEnrollmentId={fetchingEnrollmentId} transferredToTutor={(s as ExitedStudent).transferred_to_tutor} showLocationPrefix={showLocationPrefix} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Terminated Student Row Component
const TerminatedStudentRow = React.memo(function TerminatedStudentRow({
  student,
  onCheckboxToggle,
  onReasonUpdate,
  onCategoryUpdate,
  effectiveCountAsTerminated,
  effectiveReason,
  effectiveCategory,
  hasPendingChanges,
  showLocationPrefix,
  readOnly = false,
}: {
  student: TerminatedStudent;
  onCheckboxToggle: (student: TerminatedStudent) => void;
  onReasonUpdate: (student: TerminatedStudent, reason: string) => void;
  onCategoryUpdate: (student: TerminatedStudent, category: string) => void;
  effectiveCountAsTerminated: boolean;
  effectiveReason: string;
  effectiveCategory: string;
  hasPendingChanges: boolean;
  showLocationPrefix: boolean;
  readOnly?: boolean;
}) {
  const [localReason, setLocalReason] = useState(effectiveReason);
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, []);

  // Sync local state when effective reason changes
  useEffect(() => {
    setLocalReason(effectiveReason);
  }, [effectiveReason]);

  // Adjust height when content changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [localReason, adjustTextareaHeight]);

  const handleReasonBlur = () => {
    setIsEditing(false);
    if (localReason !== effectiveReason) {
      onReasonUpdate(student, localReason);
    }
  };

  return (
    <tr className={cn(
      "hover:bg-[#f5ede3]/50 dark:hover:bg-[#3d3628]/50 transition-colors",
      hasPendingChanges && "bg-[#fef9f3] dark:bg-[#3d3628]"
    )}>
      {/* Checkbox */}
      <td className="px-4 py-3">
        <button
          onClick={() => !readOnly && onCheckboxToggle(student)}
          disabled={readOnly}
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
            readOnly && "opacity-50 cursor-not-allowed",
            effectiveCountAsTerminated
              ? "bg-[#dc2626] dark:bg-red-600 border-[#dc2626] dark:border-red-600 text-white"
              : "border-[#d4a574] dark:border-[#6b5a4a]",
            !readOnly && !effectiveCountAsTerminated && "hover:border-[#a0704b] dark:hover:border-[#8b6f47]"
          )}
          title={readOnly ? "Read-only access" : undefined}
        >
          {effectiveCountAsTerminated && <Check className="h-3 w-3" />}
        </button>
      </td>
      {/* ID */}
      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
        {showLocationPrefix && student.home_location && `${student.home_location}-`}{student.school_student_id || "-"}
      </td>
      {/* Name */}
      <td className="px-4 py-3 font-medium">
        <Link
          href={`/students/${student.student_id}`}
          className="hover:text-[#a0704b] dark:hover:text-[#cd853f] hover:underline"
        >
          {student.student_name}
        </Link>
        {hasPendingChanges && (
          <span className="ml-2 text-xs text-[#a0704b] dark:text-[#cd853f]">•</span>
        )}
      </td>
      {/* Grade */}
      <td className="px-4 py-3">{student.grade || "-"}</td>
      {/* Tutor */}
      <td className="px-4 py-3">{student.tutor_name || "-"}</td>
      {/* Schedule */}
      <td className="px-4 py-3 text-xs">{formatSchedule(student.schedule)}</td>
      {/* End Date */}
      <td className="px-4 py-3 text-xs">
        {new Date(student.termination_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </td>
      {/* Category */}
      <td className="px-4 py-3">
        <CategoryDropdown
          value={effectiveCategory}
          onChange={(val) => !readOnly && onCategoryUpdate(student, val)}
          disabled={readOnly}
          compact
        />
      </td>
      {/* Reason */}
      <td className="px-4 py-3">
        <textarea
          ref={textareaRef}
          rows={1}
          value={localReason}
          onChange={(e) => !readOnly && setLocalReason(e.target.value)}
          onFocus={() => !readOnly && setIsEditing(true)}
          onBlur={handleReasonBlur}
          placeholder={readOnly ? "-" : "Enter reason..."}
          disabled={readOnly}
          className={cn(
            "w-full px-2 py-1 text-sm rounded border transition-colors resize-none max-h-[120px] overflow-y-auto",
            readOnly && "opacity-60 cursor-not-allowed bg-transparent",
            !readOnly && isEditing
              ? "border-[#a0704b] dark:border-[#cd853f] ring-1 ring-[#a0704b]/20 dark:ring-[#cd853f]/20"
              : !readOnly && hasPendingChanges
                ? "border-[#d4a574] dark:border-[#6b5a4a] bg-[#fef9f3]/50 dark:bg-[#3d3628]/50"
                : "border-transparent hover:border-[#d4a574] dark:hover:border-[#6b5a4a] bg-transparent"
          )}
        />
      </td>
    </tr>
  );
});

const TutorStatsRow = React.memo(function TutorStatsRow({ stats, onStatClick }: { stats: TutorTerminationStats; onStatClick: (statType: string, tutorId: number, tutorName: string) => void }) {
  const termRateColor = stats.term_rate > 30 ? "text-red-600 dark:text-red-400"
    : stats.term_rate > 15 ? "text-amber-600 dark:text-amber-400"
    : "text-green-600 dark:text-green-400";

  const enrollTransferColor = stats.enrollment_transfer >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400";

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 font-medium">{stats.tutor_name}</td>
      <td className="px-4 py-3 text-right">
        <button onClick={() => onStatClick("opening", stats.tutor_id, stats.tutor_name)} className="hover:underline cursor-pointer">{stats.opening}</button>
      </td>
      <td className={cn("px-4 py-3 text-right", enrollTransferColor)}>
        <button onClick={() => onStatClick("enrollTransfer", stats.tutor_id, stats.tutor_name)} className="hover:underline cursor-pointer">
          {stats.enrollment_transfer >= 0 ? "+" : ""}{stats.enrollment_transfer}
        </button>
      </td>
      <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
        <button onClick={() => onStatClick("terminated", stats.tutor_id, stats.tutor_name)} className="hover:underline cursor-pointer">{stats.terminated}</button>
      </td>
      <td className="px-4 py-3 text-right">
        <button onClick={() => onStatClick("closing", stats.tutor_id, stats.tutor_name)} className="hover:underline cursor-pointer">{stats.closing}</button>
      </td>
      <td className={cn("px-4 py-3 text-right font-medium", termRateColor)}>
        <button onClick={() => onStatClick("termRate", stats.tutor_id, stats.tutor_name)} className="hover:underline cursor-pointer">{stats.term_rate.toFixed(2)}%</button>
      </td>
    </tr>
  );
});
