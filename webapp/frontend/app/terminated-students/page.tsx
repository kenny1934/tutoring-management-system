"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useTutors, usePageTitle, useTerminationQuarters, useTerminatedStudents, useTerminationStats } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import { TutorSelector, type TutorValue, ALL_TUTORS } from "@/components/selectors/TutorSelector";
import { terminationsAPI } from "@/lib/api";
import { UserMinus, Loader2, Users, TrendingDown, ChevronDown, Check, Save, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { mutate } from "swr";
import type { TerminatedStudent, TutorTerminationStats } from "@/types";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";

// Type for pending changes
interface PendingChange {
  countAsTerminated?: boolean;
  reason?: string;
}

export default function TerminatedStudentsPage() {
  usePageTitle("Terminated Students");

  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
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
  const [sortConfig, setSortConfig] = useState<{
    column: 'id' | 'lastLesson';
    direction: 'asc' | 'desc';
  }>({ column: 'lastLesson', direction: 'asc' });

  // Pending changes state for batch save
  const [pendingChanges, setPendingChanges] = useState<Map<number, PendingChange>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Clear pending changes when quarter/year changes
  useEffect(() => {
    setPendingChanges(new Map());
  }, [selectedQuarter, selectedYear]);

  // Determine effective location
  const effectiveLocation = useMemo(() => {
    return selectedLocation && selectedLocation !== "All Locations" ? selectedLocation : undefined;
  }, [selectedLocation]);

  // Determine effective tutor ID for API calls
  const effectiveTutorId = useMemo(() => {
    if (viewMode === 'my-view' && tutors.length > 0) {
      // In my-view, filter to first tutor or selected
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

  // Handle sort column click
  const handleSort = useCallback((column: 'id' | 'lastLesson') => {
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
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
        showToast(`Saved ${successCount} changes, ${failCount} failed`, "warning");
      } else {
        showToast(`Saved ${successCount} change${successCount !== 1 ? 's' : ''} successfully`, "success");
      }
    } catch (error) {
      showToast("Failed to save changes", "error");
    } finally {
      setIsSaving(false);
    }
  }, [selectedQuarter, selectedYear, pendingChanges, terminatedStudents, effectiveLocation, effectiveTutorId, mutateStudents, showToast]);

  // Get effective value for a student field (pending or original)
  const getEffectiveValue = useCallback((student: TerminatedStudent, field: 'countAsTerminated' | 'reason') => {
    const pending = pendingChanges.get(student.student_id);
    if (field === 'countAsTerminated') {
      return pending?.countAsTerminated ?? student.count_as_terminated;
    }
    return pending?.reason ?? student.reason ?? '';
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
                          <span className="text-muted-foreground ml-2">({q.count})</span>
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

              {/* Save Changes Button */}
              {pendingChanges.size > 0 && (
                <div className="flex items-center gap-2">
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
                </div>
              )}
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
                    <div className="text-2xl font-bold text-[#6b5a4a] dark:text-[#cd853f]">{stats.location_stats.opening}</div>
                    <div className="text-sm text-muted-foreground">Opening</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className={cn(
                      "text-2xl font-bold",
                      stats.location_stats.enrollment_transfer >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
                    )}>
                      {stats.location_stats.enrollment_transfer >= 0 ? "+" : ""}{stats.location_stats.enrollment_transfer}
                    </div>
                    <div className="text-sm text-muted-foreground">Enroll/Transfer</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.location_stats.terminated}</div>
                    <div className="text-sm text-muted-foreground">Terminated</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.location_stats.closing}</div>
                    <div className="text-sm text-muted-foreground">Closing</div>
                  </div>
                  <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.location_stats.term_rate}%</div>
                    <div className="text-sm text-muted-foreground">Term Rate</div>
                  </div>
                </div>
              </div>
            )}

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
                  <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3]/50 dark:bg-[#3d3628]/50">
                    <h2 className="font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Terminated Students ({terminatedStudents.length})
                    </h2>
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
                              {sortConfig.column === 'id' ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-30" />
                              )}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left font-medium">Student</th>
                          <th className="px-4 py-3 text-left font-medium">Grade</th>
                          <th className="px-4 py-3 text-left font-medium">Instructor</th>
                          <th className="px-4 py-3 text-left font-medium">Schedule</th>
                          <th className="px-4 py-3 text-left font-medium">
                            <button
                              onClick={() => handleSort('lastLesson')}
                              className="flex items-center gap-1 hover:text-[#a0704b] dark:hover:text-[#cd853f] transition-colors"
                            >
                              Last Lesson
                              {sortConfig.column === 'lastLesson' ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-30" />
                              )}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left font-medium min-w-[200px]">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
                        {Object.entries(studentsByTutor)
                          .sort(([a], [b]) => getTutorSortName(a).localeCompare(getTutorSortName(b)))
                          .map(([tutorName, students]) => (
                          <React.Fragment key={tutorName}>
                            {/* Tutor group header */}
                            <tr className="bg-muted/30">
                              <td colSpan={8} className="px-4 py-2 font-medium text-muted-foreground">
                                {tutorName} ({students.length})
                              </td>
                            </tr>
                            {/* Students */}
                            {[...students]
                              .sort((a, b) => {
                                const dir = sortConfig.direction === 'asc' ? 1 : -1;
                                if (sortConfig.column === 'id') {
                                  return dir * (a.school_student_id || '').localeCompare(b.school_student_id || '');
                                }
                                return dir * (a.termination_date || '').localeCompare(b.termination_date || '');
                              })
                              .map((student) => (
                              <TerminatedStudentRow
                                key={student.student_id}
                                student={student}
                                onCheckboxToggle={handleCheckboxToggle}
                                onReasonUpdate={handleReasonUpdate}
                                effectiveCountAsTerminated={getEffectiveValue(student, 'countAsTerminated') as boolean}
                                effectiveReason={getEffectiveValue(student, 'reason') as string}
                                hasPendingChanges={hasPendingChanges(student.student_id)}
                                showLocationPrefix={selectedLocation === "All Locations"}
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
                            <th className="px-4 py-3 text-left font-medium">Instructor</th>
                            <th className="px-4 py-3 text-right font-medium">Opening</th>
                            <th className="px-4 py-3 text-right font-medium">Enroll/Transfer</th>
                            <th className="px-4 py-3 text-right font-medium">Terminated</th>
                            <th className="px-4 py-3 text-right font-medium">Closing</th>
                            <th className="px-4 py-3 text-right font-medium">Term Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e8d4b8] dark:divide-[#6b5a4a]">
                          {[...stats.tutor_stats]
                            .sort((a, b) => getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name)))
                            .map((tutor) => (
                            <TutorStatsRow key={tutor.tutor_id} stats={tutor} />
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
        {showConfirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirmDialog(false)} />
            <div className={cn(
              "relative bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl shadow-xl max-w-md w-full min-w-[400px] mx-4 p-6",
              "border-2 border-[#d4a574] dark:border-[#8b6f47]",
              "paper-texture"
            )}>
              <h3 className="text-lg font-semibold mb-2">Confirm Changes</h3>
              <p className="text-muted-foreground mb-4">
                You are about to save {pendingChanges.size} change{pendingChanges.size !== 1 ? 's' : ''} to terminated student records.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-[#d4a574] dark:border-[#8b6f47] text-[#a0704b] dark:text-[#cd853f] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChanges}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-[#a0704b] text-white hover:bg-[#8b6140]"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </PageTransition>
    </DeskSurface>
  );
}

// Terminated Student Row Component
function TerminatedStudentRow({
  student,
  onCheckboxToggle,
  onReasonUpdate,
  effectiveCountAsTerminated,
  effectiveReason,
  hasPendingChanges,
  showLocationPrefix,
}: {
  student: TerminatedStudent;
  onCheckboxToggle: (student: TerminatedStudent) => void;
  onReasonUpdate: (student: TerminatedStudent, reason: string) => void;
  effectiveCountAsTerminated: boolean;
  effectiveReason: string;
  hasPendingChanges: boolean;
  showLocationPrefix: boolean;
}) {
  const [localReason, setLocalReason] = useState(effectiveReason);
  const [isEditing, setIsEditing] = useState(false);

  // Sync local state when effective reason changes
  useEffect(() => {
    setLocalReason(effectiveReason);
  }, [effectiveReason]);

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
          onClick={() => onCheckboxToggle(student)}
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
            effectiveCountAsTerminated
              ? "bg-[#dc2626] dark:bg-red-600 border-[#dc2626] dark:border-red-600 text-white"
              : "border-[#d4a574] dark:border-[#6b5a4a] hover:border-[#a0704b] dark:hover:border-[#8b6f47]"
          )}
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
      <td className="px-4 py-3 text-xs">{student.schedule || "-"}</td>
      {/* Last Lesson */}
      <td className="px-4 py-3 text-xs">{student.termination_date}</td>
      {/* Reason */}
      <td className="px-4 py-3">
        <input
          type="text"
          value={localReason}
          onChange={(e) => setLocalReason(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={handleReasonBlur}
          placeholder="Enter reason..."
          className={cn(
            "w-full px-2 py-1 text-sm rounded border transition-colors",
            isEditing
              ? "border-[#a0704b] dark:border-[#cd853f] ring-1 ring-[#a0704b]/20 dark:ring-[#cd853f]/20"
              : hasPendingChanges
                ? "border-[#d4a574] dark:border-[#6b5a4a] bg-[#fef9f3]/50 dark:bg-[#3d3628]/50"
                : "border-transparent hover:border-[#d4a574] dark:hover:border-[#6b5a4a] bg-transparent"
          )}
        />
      </td>
    </tr>
  );
}

// Tutor Stats Row Component
function TutorStatsRow({ stats }: { stats: TutorTerminationStats }) {
  const termRateColor = useMemo(() => {
    if (stats.term_rate > 30) return "text-red-600 dark:text-red-400";
    if (stats.term_rate > 15) return "text-amber-600 dark:text-amber-400";
    return "text-green-600 dark:text-green-400";
  }, [stats.term_rate]);

  const enrollTransferColor = useMemo(() => {
    return stats.enrollment_transfer >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400";
  }, [stats.enrollment_transfer]);

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 font-medium">{stats.tutor_name}</td>
      <td className="px-4 py-3 text-right">{stats.opening}</td>
      <td className={cn("px-4 py-3 text-right", enrollTransferColor)}>
        {stats.enrollment_transfer >= 0 ? "+" : ""}{stats.enrollment_transfer}
      </td>
      <td className="px-4 py-3 text-right">{stats.terminated}</td>
      <td className="px-4 py-3 text-right">{stats.closing}</td>
      <td className={cn("px-4 py-3 text-right font-medium", termRateColor)}>
        {stats.term_rate}%
      </td>
    </tr>
  );
}
