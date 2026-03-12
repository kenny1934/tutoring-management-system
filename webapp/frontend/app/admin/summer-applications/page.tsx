"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { ClipboardList, Search, X, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR, { mutate } from "swr";
import { summerAPI } from "@/lib/api";
import { SummerApplicationCard, STATUS_COLORS, ALL_STATUSES } from "@/components/admin/SummerApplicationCard";
import { SummerApplicationDetailModal } from "@/components/admin/SummerApplicationDetailModal";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import type { SummerApplication } from "@/types";

const PIPELINE_STATUSES = [
  "Submitted", "Under Review", "Placement Offered", "Placement Confirmed",
  "Fee Sent", "Paid", "Enrolled",
];
const EXIT_STATUSES = ["Waitlisted", "Withdrawn", "Rejected"];

const selectClass = "px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground";

function renderStatusButtons(
  statuses: string[],
  byStatus: Record<string, number>,
  activeFilter: string | null,
  setFilter: (v: string | null) => void,
) {
  return statuses.map((s) => {
    const count = byStatus[s] || 0;
    if (count === 0) return null;
    const colors = STATUS_COLORS[s];
    const isActive = activeFilter === s;
    return (
      <button
        key={s}
        onClick={() => setFilter(isActive ? null : s)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all",
          isActive ? cn(colors.bg, colors.text, "ring-1 ring-current") : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
        )}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
        {s} <span className="font-normal">{count}</span>
      </button>
    );
  });
}

export default function SummerApplicationsPage() {
  usePageTitle("Summer Applications");
  const { isAdmin, isSuperAdmin } = useAuth();
  const { showToast } = useToast();
  const canViewAdminPages = isAdmin || isSuperAdmin;
  const readOnly = !isAdmin && !isSuperAdmin;

  // Config selector
  const [configId, setConfigId] = useState<number | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Sorting
  type SortField = "submitted" | "name" | "status" | "grade" | "location";
  const [sortField, setSortField] = useState<SortField>("submitted");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // UI state
  const [selectedAppIndex, setSelectedAppIndex] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [batchStatus, setBatchStatus] = useState("Under Review");
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  // Group-by
  type GroupByField = null | "location" | "grade";
  const [groupBy, setGroupBy] = useState<GroupByField>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Keyboard nav
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showShortcutHints, setShowShortcutHints] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Fetch configs
  const { data: configs } = useSWR(
    canViewAdminPages ? "summer-configs" : null,
    () => summerAPI.getConfigs()
  );

  // Default to active config
  useEffect(() => {
    if (configs && configs.length > 0 && configId === null) {
      const active = configs.find((c) => c.is_active);
      setConfigId(active?.id ?? configs[0].id);
    }
  }, [configs, configId]);

  // Fetch stats
  const { data: stats } = useSWR(
    configId ? ["summer-app-stats", configId] : null,
    () => summerAPI.getApplicationStats(configId!)
  );

  // Fetch applications
  const swrKey = configId
    ? ["summer-apps", configId, statusFilter, gradeFilter, locationFilter, debouncedSearch]
    : null;
  const {
    data: applications,
    isLoading: appsLoading,
    isValidating,
  } = useSWR(swrKey, () =>
    summerAPI.getApplications({
      config_id: configId!,
      application_status: statusFilter || undefined,
      grade: gradeFilter || undefined,
      location: locationFilter || undefined,
      search: debouncedSearch || undefined,
    }),
    { refreshInterval: 60000 }
  );

  // Refresh handler
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const handleRefresh = useCallback(() => {
    if (swrKey) {
      mutate(swrKey);
      if (configId) mutate(["summer-app-stats", configId]);
    }
    setLastRefreshed(new Date());
  }, [swrKey, configId]);

  const searchRef = useRef<HTMLInputElement>(null);

  // Batch selection
  const showCheckboxes = checkedIds.size > 0;
  const toggleCheck = useCallback((id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBatchUpdate = async () => {
    if (checkedIds.size === 0 || batchUpdating) return;
    setBatchUpdating(true);
    try {
      const results = await Promise.allSettled(
        Array.from(checkedIds).map((id) =>
          summerAPI.updateApplication(id, { application_status: batchStatus })
        )
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        showToast(`Updated ${succeeded}, failed ${failed}`, "error");
      } else {
        showToast(`Updated ${succeeded} application${succeeded !== 1 ? "s" : ""}`, "success");
      }
      setCheckedIds(new Set());
      handleRefresh();
    } catch {
      showToast("Batch update failed", "error");
    } finally {
      setBatchUpdating(false);
    }
  };

  // Filters active?
  const hasFilters = statusFilter || gradeFilter || locationFilter || debouncedSearch;
  const clearFilters = useCallback(() => {
    setStatusFilter(null);
    setGradeFilter(null);
    setLocationFilter(null);
    setSearchQuery("");
  }, []);

  // Grade/location options from stats
  const gradeOptions = useMemo(() => Object.keys(stats?.by_grade || {}).sort(), [stats]);
  const locationOptions = useMemo(() => Object.keys(stats?.by_location || {}).sort(), [stats]);

  // Client-side sorting
  const sortedApplications = useMemo(() => {
    if (!applications) return [];
    const sorted = [...applications];
    const dir = sortDirection === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      switch (sortField) {
        case "name":
          return dir * (a.student_name || "").localeCompare(b.student_name || "");
        case "status":
          return dir * (ALL_STATUSES.indexOf(a.application_status) - ALL_STATUSES.indexOf(b.application_status));
        case "grade":
          return dir * (a.grade || "").localeCompare(b.grade || "");
        case "location":
          return dir * (a.preferred_location || "").localeCompare(b.preferred_location || "");
        case "submitted":
        default:
          return dir * ((a.submitted_at || "").localeCompare(b.submitted_at || ""));
      }
    });
    return sorted;
  }, [applications, sortField, sortDirection]);

  // Group-by computation
  const groupedApplications = useMemo(() => {
    if (!groupBy) return null;
    const groups = new Map<string, SummerApplication[]>();
    for (const app of sortedApplications) {
      const key = (groupBy === "location" ? app.preferred_location : app.grade) || "Unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(app);
    }
    return groups;
  }, [sortedApplications, groupBy]);

  // Navigable items (excluding collapsed groups) for keyboard nav
  const navigableItems = useMemo(() => {
    if (!groupBy || !groupedApplications) return sortedApplications;
    const items: SummerApplication[] = [];
    for (const [key, apps] of groupedApplications) {
      if (!collapsedGroups.has(key)) items.push(...apps);
    }
    return items;
  }, [sortedApplications, groupBy, groupedApplications, collapsedGroups]);

  // Derive selectedApp from index
  const selectedApp = selectedAppIndex !== null ? navigableItems[selectedAppIndex] ?? null : null;

  // Detail modal
  const openDetail = useCallback((app: SummerApplication) => {
    const idx = navigableItems.findIndex((a) => a.id === app.id);
    setSelectedAppIndex(idx >= 0 ? idx : null);
    setDetailOpen(true);
  }, [navigableItems]);

  // Prev/Next navigation in modal
  const handlePrevApp = useCallback(() => {
    setSelectedAppIndex((prev) => (prev !== null && prev > 0) ? prev - 1 : prev);
  }, []);

  const handleNextApp = useCallback(() => {
    setSelectedAppIndex((prev) =>
      (prev !== null && prev < navigableItems.length - 1) ? prev + 1 : prev
    );
  }, [navigableItems.length]);

  // O(1) lookup for navigable index (keyed by id, not object identity)
  const navigableIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    navigableItems.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [navigableItems]);

  // Preference demand summary (computed from ALL apps, not filtered)
  const demandBySlot = useMemo(() => {
    if (!applications || applications.length === 0) return [];
    const counts = new Map<string, number>();
    for (const app of applications) {
      if (app.preference_1_day && app.preference_1_time) {
        const key = `${app.preference_1_day} ${app.preference_1_time}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      if (app.preference_2_day && app.preference_2_time) {
        const key = `${app.preference_2_day} ${app.preference_2_time}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [applications]);
  const [showDemand, setShowDemand] = useState(false);

  // Select-all indeterminate state
  const [allVisibleChecked, someVisibleChecked] = useMemo(() => {
    if (sortedApplications.length === 0) return [false, false] as const;
    const all = sortedApplications.every((a) => checkedIds.has(a.id));
    if (all) return [true, true] as const;
    return [false, sortedApplications.some((a) => checkedIds.has(a.id))] as const;
  }, [sortedApplications, checkedIds]);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleChecked && !allVisibleChecked;
    }
  }, [someVisibleChecked, allVisibleChecked]);

  const toggleSelectAll = useCallback(() => {
    setCheckedIds((prev) => {
      if (allVisibleChecked) {
        // Uncheck all visible
        const next = new Set(prev);
        sortedApplications.forEach((a) => next.delete(a.id));
        return next;
      } else {
        // Check all visible
        const next = new Set(prev);
        sortedApplications.forEach((a) => next.add(a.id));
        return next;
      }
    });
  }, [allVisibleChecked, sortedApplications]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Modal open: only Escape, ArrowLeft/Right
      if (detailOpen) {
        if (e.key === "Escape") setDetailOpen(false);
        if (e.key === "ArrowLeft") { e.preventDefault(); handlePrevApp(); }
        if (e.key === "ArrowRight") { e.preventDefault(); handleNextApp(); }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = (prev ?? -1) + 1;
            return Math.min(next, navigableItems.length - 1);
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = (prev ?? 0) - 1;
            return Math.max(next, 0);
          });
          break;
        case "Enter":
          if (selectedIndex !== null && navigableItems[selectedIndex]) {
            openDetail(navigableItems[selectedIndex]);
          }
          break;
        case " ":
          e.preventDefault();
          if (selectedIndex !== null && navigableItems[selectedIndex]) {
            toggleCheck(navigableItems[selectedIndex].id);
          }
          break;
        case "Escape":
          if (showShortcutHints) { setShowShortcutHints(false); break; }
          if (checkedIds.size > 0) { setCheckedIds(new Set()); break; }
          if (hasFilters) { clearFilters(); break; }
          setSelectedIndex(null);
          break;
        case "?":
          e.preventDefault();
          setShowShortcutHints((prev) => !prev);
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, navigableItems, detailOpen, showShortcutHints, checkedIds.size, hasFilters, clearFilters, handlePrevApp, handleNextApp]);

  // Reset selection when sort/filter/group changes
  useEffect(() => {
    setSelectedIndex(null);
  }, [sortField, sortDirection, statusFilter, gradeFilter, locationFilter, debouncedSearch, groupBy, collapsedGroups]);

  // Scroll focused card into view
  useEffect(() => {
    if (selectedIndex === null) return;
    const element = document.querySelector(`[data-app-index="${selectedIndex}"]`);
    const container = scrollContainerRef.current;
    if (!element || !container) return;
    const containerRect = container.getBoundingClientRect();
    const cardRect = element.getBoundingClientRect();
    if (cardRect.bottom > containerRect.bottom - 20) {
      element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else if (cardRect.top < containerRect.top + 20) {
      element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  if (!canViewAdminPages) {
    return (
      <DeskSurface fullHeight>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Access denied
        </div>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex flex-col h-full p-4 sm:p-6">
        {/* Paper card */}
        <div className="flex flex-col h-full bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm paper-texture overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                  <ClipboardList className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-semibold text-foreground">Summer Applications</h1>
                  <p className="text-xs text-muted-foreground">
                    Review and process summer course applications
                    {readOnly && <span className="ml-1 text-amber-600">(Read-only)</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {configs && configs.length > 1 && (
                    <select
                      value={configId ?? ""}
                      onChange={(e) => {
                        setConfigId(parseInt(e.target.value));
                        setCheckedIds(new Set());
                      }}
                      className={selectClass}
                    >
                      {configs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.year}{c.is_active ? " (Active)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  <RefreshButton
                    onRefresh={handleRefresh}
                    isRefreshing={isValidating}
                    lastUpdated={lastRefreshed}
                  />
                </div>
              </div>
            </div>

            {/* Stats strip */}
            {stats && stats.total > 0 && (
              <div className="px-4 sm:px-6 py-2.5 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-2 min-w-max">
                  <span className="text-sm font-semibold text-foreground mr-1">{stats.total}</span>
                  {/* Pipeline statuses */}
                  {renderStatusButtons(PIPELINE_STATUSES, stats.by_status, statusFilter, setStatusFilter)}
                  {/* Divider */}
                  {EXIT_STATUSES.some((s) => (stats.by_status[s] || 0) > 0) && (
                    <span className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
                  )}
                  {/* Exit statuses */}
                  {renderStatusButtons(EXIT_STATUSES, stats.by_status, statusFilter, setStatusFilter)}
                </div>
              </div>
            )}

            {/* Preference demand summary */}
            {demandBySlot.length > 0 && (
              <div className="px-4 sm:px-6 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
                <button
                  onClick={() => setShowDemand((d) => !d)}
                  className="w-full py-1.5 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showDemand ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  <span className="font-medium">Slot Demand</span>
                  <span className="text-muted-foreground/60">({demandBySlot.length} slots)</span>
                </button>
                {showDemand && (
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {demandBySlot.map(([slot, count]) => {
                      const maxCount = demandBySlot[0]?.[1] || 1;
                      const intensity = Math.min(count / maxCount, 1);
                      return (
                        <span
                          key={slot}
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
                            intensity > 0.7
                              ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium"
                              : intensity > 0.4
                              ? "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                              : "bg-gray-100 dark:bg-gray-800 text-muted-foreground"
                          )}
                        >
                          {slot} <span className="font-semibold">({count})</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Filter bar */}
            <div className="px-4 sm:px-6 py-2.5 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
              <div className="flex flex-col sm:flex-row gap-2">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder='Search name, phone, ref code... (press "/")'
                    className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground placeholder:text-muted-foreground/60"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {/* Dropdowns */}
                <div className="flex gap-2">
                  <select
                    value={gradeFilter || ""}
                    onChange={(e) => setGradeFilter(e.target.value || null)}
                    className={selectClass}
                  >
                    <option value="">All grades</option>
                    {gradeOptions.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <select
                    value={locationFilter || ""}
                    onChange={(e) => setLocationFilter(e.target.value || null)}
                    className={selectClass}
                  >
                    <option value="">All locations</option>
                    {locationOptions.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  {hasFilters && (
                    <button
                      onClick={clearFilters}
                      className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Sort controls + select-all */}
            {sortedApplications.length > 0 && (
              <div className="px-4 sm:px-6 py-1.5 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mr-1">Sort</span>
                {(["submitted", "name", "status", "grade", "location"] as SortField[]).map((field) => (
                  <button
                    key={field}
                    onClick={() => {
                      if (sortField === field) {
                        setSortDirection((d) => d === "asc" ? "desc" : "asc");
                      } else {
                        setSortField(field);
                        setSortDirection(field === "submitted" ? "desc" : "asc");
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs transition-all",
                      sortField === field
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                  >
                    {field === "submitted" ? "Date" : field.charAt(0).toUpperCase() + field.slice(1)}
                    {sortField === field && (
                      sortDirection === "asc"
                        ? <ChevronUp className="h-3 w-3" />
                        : <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                ))}
                {/* Divider */}
                <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                {/* Group-by toggle */}
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Group</span>
                {([null, "location", "grade"] as GroupByField[]).map((field) => (
                  <button
                    key={field ?? "none"}
                    onClick={() => { setGroupBy(field); setCollapsedGroups(new Set()); }}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs transition-all",
                      groupBy === field
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                  >
                    {field === null ? "None" : field.charAt(0).toUpperCase() + field.slice(1)}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {sortedApplications.length} result{sortedApplications.length !== 1 ? "s" : ""}
                  </span>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleChecked}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                    title={allVisibleChecked ? "Deselect all" : "Select all"}
                  />
                </div>
              </div>
            )}

            {/* Application list */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
              {appsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : sortedApplications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ClipboardList className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {hasFilters ? "No applications match your filters" : "No applications yet"}
                  </p>
                  {hasFilters && (
                    <button
                      onClick={clearFilters}
                      className="mt-2 text-xs text-primary hover:text-primary/80"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : groupBy && groupedApplications ? (
                <div className="space-y-4">
                  {Array.from(groupedApplications.entries()).map(([groupKey, groupApps]) => {
                    const isCollapsed = collapsedGroups.has(groupKey);
                    const groupAllChecked = groupApps.length > 0 && groupApps.every((a) => checkedIds.has(a.id));
                    const groupSomeChecked = groupApps.some((a) => checkedIds.has(a.id));
                    return (
                      <CollapsibleSection
                        key={groupKey}
                        id={groupKey}
                        label={groupKey}
                        count={groupApps.length}
                        colorTheme="gray"
                        isCollapsed={isCollapsed}
                        onToggle={() => setCollapsedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
                          return next;
                        })}
                        showCheckbox={showCheckboxes}
                        isAllChecked={groupAllChecked}
                        isSomeChecked={groupSomeChecked}
                        onCheckboxClick={(e) => {
                          e.stopPropagation();
                          setCheckedIds((prev) => {
                            const next = new Set(prev);
                            if (groupAllChecked) {
                              groupApps.forEach((a) => next.delete(a.id));
                            } else {
                              groupApps.forEach((a) => next.add(a.id));
                            }
                            return next;
                          });
                        }}
                      >
                        {groupApps.map((app) => {
                          const navIdx = navigableIndexMap.get(app.id) ?? -1;
                          return (
                            <SummerApplicationCard
                              key={app.id}
                              application={app}
                              index={navIdx}
                              isFocused={selectedIndex === navIdx}
                              onSelect={openDetail}
                              isChecked={checkedIds.has(app.id)}
                              onToggleCheck={toggleCheck}
                              showCheckbox={showCheckboxes}
                            />
                          );
                        })}
                      </CollapsibleSection>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedApplications.map((app, i) => (
                    <SummerApplicationCard
                      key={app.id}
                      application={app}
                      index={i}
                      isFocused={selectedIndex === i}
                      onSelect={openDetail}
                      isChecked={checkedIds.has(app.id)}
                      onToggleCheck={toggleCheck}
                      showCheckbox={showCheckboxes}
                    />
                  ))}
                </div>
              )}
              <ScrollToTopButton />
            </div>
          </div>

          {/* Batch action bar */}
          <AnimatePresence>
            {checkedIds.size > 0 && !readOnly && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50"
              >
                {/* Confirmation card */}
                <AnimatePresence>
                  {showBatchConfirm && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="mb-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 text-center"
                    >
                      <p className="text-sm text-foreground mb-2">
                        Update <span className="font-semibold">{checkedIds.size}</span> application{checkedIds.size !== 1 ? "s" : ""} to <span className="font-semibold">{batchStatus}</span>?
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setShowBatchConfirm(false)}
                          className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { setShowBatchConfirm(false); handleBatchUpdate(); }}
                          disabled={batchUpdating}
                          className="px-3 py-1 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                        >
                          {batchUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Confirm
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Main batch bar */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {checkedIds.size} selected
                  </span>
                  <select
                    value={batchStatus}
                    onChange={(e) => setBatchStatus(e.target.value)}
                    className={selectClass}
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowBatchConfirm(true)}
                    disabled={batchUpdating}
                    className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {batchUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Update
                  </button>
                  <button
                    onClick={() => { setCheckedIds(new Set()); setShowBatchConfirm(false); }}
                    className="p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Detail modal */}
          <SummerApplicationDetailModal
            application={selectedApp}
            isOpen={detailOpen}
            onClose={() => setDetailOpen(false)}
            onUpdated={handleRefresh}
            readOnly={readOnly}
            onPrev={handlePrevApp}
            onNext={handleNextApp}
            hasPrev={selectedAppIndex !== null && selectedAppIndex > 0}
            hasNext={selectedAppIndex !== null && selectedAppIndex < navigableItems.length - 1}
            currentIndex={selectedAppIndex ?? undefined}
            totalCount={navigableItems.length}
          />

          {/* Keyboard shortcut hint button */}
          {!showShortcutHints && (
            <button
              onClick={() => setShowShortcutHints(true)}
              className="fixed right-4 bottom-4 z-40 w-8 h-8 rounded-full bg-[#fef9f3] dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#8b6f47] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shadow-md flex items-center justify-center"
              title="Keyboard shortcuts (?)"
            >
              <span className="text-sm font-mono">?</span>
            </button>
          )}

          {/* Keyboard Shortcut Hints Panel */}
          <AnimatePresence>
            {showShortcutHints && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg border bg-[#fef9f3] dark:bg-[#2d2618] border-[#d4a574] dark:border-[#8b6f47] text-sm w-56"
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold text-[#5c4033] dark:text-[#d4a574]">Shortcuts</span>
                  <button onClick={() => setShowShortcutHints(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1.5 text-gray-600 dark:text-gray-300">
                  {[
                    ["↑ ↓", "Navigate cards"],
                    ["Enter", "Open details"],
                    ["Space", "Toggle checkbox"],
                    ["← →", "Prev/Next (in modal)"],
                    ["/", "Focus search"],
                    ["Esc", "Clear / Close"],
                    ["?", "Toggle this panel"],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex justify-between gap-4">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">{key}</kbd>
                      <span>{desc}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
      </PageTransition>
    </DeskSurface>
  );
}
