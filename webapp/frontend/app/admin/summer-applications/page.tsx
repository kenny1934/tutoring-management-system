"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { ClipboardList, Search, X, Loader2, ListFilter, ArrowUpNarrowWide, ArrowDownNarrowWide } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR, { mutate } from "swr";
import { summerAPI } from "@/lib/api";
import { SummerApplicationCard, STATUS_COLORS, ALL_STATUSES } from "@/components/admin/SummerApplicationCard";
import { SummerApplicationDetailModal } from "@/components/admin/SummerApplicationDetailModal";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { displayLocation, LOCATION_TO_CODE } from "@/lib/summer-utils";
import { useLocation } from "@/contexts/LocationContext";
import type { SummerApplication } from "@/types";

const CODE_TO_LOCATION = Object.fromEntries(
  Object.entries(LOCATION_TO_CODE).map(([k, v]) => [v, k])
);

const PIPELINE_STATUSES = [
  "Submitted", "Under Review", "Placement Offered", "Placement Confirmed",
  "Fee Sent", "Paid", "Enrolled",
];
const EXIT_STATUSES = ["Waitlisted", "Withdrawn", "Rejected"];

type ViewPreset = "latest" | "pipeline" | "by_location" | "by_grade" | "by_time_slot";

const VIEW_PRESET_CONFIG: Record<ViewPreset, {
  label: string;
  groupBy: null | "status" | "location" | "grade" | "time_slot";
  sortField: "submitted" | "name" | "status" | "grade" | "location" | "time_slot";
  defaultDirection: "asc" | "desc";
}> = {
  latest:       { label: "View: Latest",       groupBy: null,       sortField: "submitted",  defaultDirection: "desc" },
  pipeline:     { label: "View: Pipeline",     groupBy: "status",   sortField: "status",     defaultDirection: "asc" },
  by_location:  { label: "View: By Location",  groupBy: "location", sortField: "name",       defaultDirection: "asc" },
  by_grade:     { label: "View: By Grade",     groupBy: "grade",    sortField: "name",       defaultDirection: "asc" },
  by_time_slot: { label: "View: By Time Slot", groupBy: "time_slot", sortField: "time_slot", defaultDirection: "asc" },
};

const STATUS_GROUP_COLORS: Record<string, "red" | "orange" | "purple" | "gray"> = {
  Rejected: "red",
  Waitlisted: "orange",
  Withdrawn: "orange",
  "Placement Offered": "purple",
  "Placement Confirmed": "purple",
  "Fee Sent": "orange",
  Paid: "orange",
};

function getDirectionLabel(preset: ViewPreset, dir: "asc" | "desc"): string {
  if (preset === "latest") return dir === "desc" ? "↓ newest" : "↑ oldest";
  if (preset === "pipeline") return dir === "asc" ? "↓ flow" : "↑ reverse";
  return dir === "asc" ? "↑ A-Z" : "↓ Z-A";
}

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
  const { selectedLocation } = useLocation();
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

  // View preset (replaces separate sort + group controls)
  const [viewPreset, setViewPreset] = useState<ViewPreset>("latest");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const presetConfig = VIEW_PRESET_CONFIG[viewPreset];
  const sortField = presetConfig.sortField;
  const groupBy = presetConfig.groupBy;

  // UI state
  const [selectedAppIndex, setSelectedAppIndex] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [batchStatus, setBatchStatus] = useState("Under Review");
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  // Keyboard nav
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showShortcutHints, setShowShortcutHints] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

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
  const activeFilterCount = [gradeFilter, locationFilter].filter(Boolean).length;
  const clearFilters = useCallback(() => {
    setStatusFilter(null);
    setGradeFilter(null);
    setLocationFilter(null);
    setSearchQuery("");
  }, []);

  // Close filter popover on click outside / escape
  useEffect(() => {
    if (!filterOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node) &&
        filterButtonRef.current && !filterButtonRef.current.contains(e.target as Node)
      ) {
        setFilterOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setFilterOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [filterOpen]);

  // Grade/location options from stats
  const gradeOptions = useMemo(() => Object.keys(stats?.by_grade || {}).sort(), [stats]);
  const locationOptions = useMemo(
    () => Object.keys(stats?.by_location || {}).sort((a, b) => displayLocation(a).localeCompare(displayLocation(b))),
    [stats]
  );

  // Initialize location filter from user's app-wide location setting (one-time)
  const locationInitialized = useRef(false);
  useEffect(() => {
    if (locationInitialized.current || !stats) return;
    locationInitialized.current = true;
    if (selectedLocation && selectedLocation !== "All Locations") {
      const chineseName = CODE_TO_LOCATION[selectedLocation];
      if (chineseName && stats.by_location?.[chineseName] !== undefined) {
        setLocationFilter(chineseName);
      }
    }
  }, [stats, selectedLocation]);

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
          return dir * displayLocation(a.preferred_location).localeCompare(displayLocation(b.preferred_location));
        case "time_slot": {
          const aSlot = [a.preference_1_day || "", a.preference_1_time || ""].join(" ");
          const bSlot = [b.preference_1_day || "", b.preference_1_time || ""].join(" ");
          return dir * aSlot.localeCompare(bSlot);
        }
        case "submitted":
        default:
          return dir * ((a.submitted_at || "").localeCompare(b.submitted_at || ""));
      }
    });
    return sorted;
  }, [applications, sortField, sortDirection]);

  // Preset change handler
  const handlePresetChange = useCallback((preset: ViewPreset) => {
    setViewPreset(preset);
    setSortDirection(VIEW_PRESET_CONFIG[preset].defaultDirection);
    setCollapsedGroups(new Set());
  }, []);

  // Group-by computation
  const groupedApplications = useMemo(() => {
    if (!groupBy) return null;
    const groups = new Map<string, SummerApplication[]>();

    // Pre-seed status groups in pipeline order
    if (groupBy === "status") {
      for (const s of [...PIPELINE_STATUSES, ...EXIT_STATUSES]) {
        groups.set(s, []);
      }
    }

    for (const app of sortedApplications) {
      let key: string;
      if (groupBy === "status") {
        key = app.application_status;
      } else if (groupBy === "time_slot") {
        key = [app.preference_1_day, app.preference_1_time].filter(Boolean).join(" ") || "No preference";
      } else if (groupBy === "location") {
        key = app.preferred_location || "Unknown";
      } else {
        key = app.grade || "Unknown";
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(app);
    }

    // Remove empty status groups
    if (groupBy === "status") {
      for (const [key, apps] of groups) {
        if (apps.length === 0) groups.delete(key);
      }
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

  // O(1) lookup for navigable index (keyed by id, not object identity)
  const navigableIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    navigableItems.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [navigableItems]);

  // Detail modal
  const openDetail = useCallback((app: SummerApplication) => {
    const idx = navigableIndexMap.get(app.id);
    setSelectedAppIndex(idx !== undefined ? idx : null);
    setDetailOpen(true);
  }, [navigableIndexMap]);

  // Prev/Next navigation in modal
  const handlePrevApp = useCallback(() => {
    setSelectedAppIndex((prev) => (prev !== null && prev > 0) ? prev - 1 : prev);
  }, []);

  const handleNextApp = useCallback(() => {
    setSelectedAppIndex((prev) =>
      (prev !== null && prev < navigableItems.length - 1) ? prev + 1 : prev
    );
  }, [navigableItems.length]);

  // Demand map for time slot group headers (1st + 2nd preference counts)
  const demandMap = useMemo(() => {
    if (groupBy !== "time_slot" || !applications) return null;
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
    return counts;
  }, [groupBy, applications]);

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
  }, [viewPreset, sortDirection, statusFilter, gradeFilter, locationFilter, debouncedSearch, collapsedGroups]);

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

            {/* Filter bar + view controls */}
            <div className="px-4 sm:px-6 py-2.5 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
              <div className="flex flex-col sm:flex-row gap-2">
                {/* Search + Filter */}
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder='Search name, phone, ref code... (press "/")'
                    className="w-full pl-9 pr-16 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground placeholder:text-muted-foreground/60"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {/* Filter button (inside search bar) */}
                  <button
                    ref={filterButtonRef}
                    onClick={() => setFilterOpen(!filterOpen)}
                    className={cn(
                      "absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 p-1 rounded transition-colors",
                      activeFilterCount > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title="Filter by grade/location"
                  >
                    <ListFilter className="h-3.5 w-3.5" />
                    {activeFilterCount > 0 && (
                      <span className="bg-amber-500 text-white text-[10px] rounded-full px-1 min-w-[16px] text-center leading-[16px]">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                  {/* Filter popover */}
                  {filterOpen && (
                    <div
                      ref={filterPopoverRef}
                      className="absolute top-full mt-1.5 right-0 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-[200px] space-y-3"
                    >
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Location</label>
                        <select
                          value={locationFilter || ""}
                          onChange={(e) => setLocationFilter(e.target.value || null)}
                          className={cn(selectClass, "w-full")}
                        >
                          <option value="">All locations</option>
                          {locationOptions.map((l) => (
                            <option key={l} value={l}>{displayLocation(l)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Grade</label>
                        <select
                          value={gradeFilter || ""}
                          onChange={(e) => setGradeFilter(e.target.value || null)}
                          className={cn(selectClass, "w-full")}
                        >
                          <option value="">All grades</option>
                          {gradeOptions.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </div>
                      {activeFilterCount > 0 && (
                        <button
                          onClick={() => { setGradeFilter(null); setLocationFilter(null); }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* View + Sort controls */}
                <div className="flex items-center gap-2">
                  {/* View dropdown */}
                  <select
                    value={viewPreset}
                    onChange={(e) => handlePresetChange(e.target.value as ViewPreset)}
                    className="px-2.5 py-1.5 text-sm rounded-lg font-medium border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-foreground"
                  >
                    {(Object.entries(VIEW_PRESET_CONFIG) as [ViewPreset, typeof VIEW_PRESET_CONFIG[ViewPreset]][]).map(([key, cfg]) => (
                      <option key={key} value={key} className="bg-white dark:bg-gray-800">{cfg.label}</option>
                    ))}
                  </select>
                  {/* Sort direction */}
                  <button
                    onClick={() => setSortDirection((d) => d === "asc" ? "desc" : "asc")}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title={getDirectionLabel(viewPreset, sortDirection)}
                  >
                    {sortDirection === "asc"
                      ? <ArrowUpNarrowWide className="h-3.5 w-3.5" />
                      : <ArrowDownNarrowWide className="h-3.5 w-3.5" />}
                  </button>
                  {/* Select-all (only during batch selection) */}
                  {showCheckboxes && (
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleChecked}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer shrink-0"
                      title={allVisibleChecked ? "Deselect all" : "Select all"}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Application list */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
              {appsLoading || !applications ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-28 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                        <div className="h-3.5 w-20 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                        <div className="ml-auto h-5 w-24 rounded-full animate-pulse bg-gray-200 dark:bg-gray-700" />
                      </div>
                      <div className="flex items-center gap-1.5 pl-6">
                        <div className="h-5 w-8 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                        <div className="h-5 w-8 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                        <div className="h-5 w-12 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        <div className="h-3 w-36 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                        <div className="ml-auto h-3 w-12 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                      </div>
                    </div>
                  ))}
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
                        label={groupBy === "location" ? displayLocation(groupKey) : groupKey}
                        count={groupApps.length}
                        colorTheme={groupBy === "status" ? (STATUS_GROUP_COLORS[groupKey] || "gray") : "gray"}
                        annotation={
                          demandMap?.has(groupKey) && demandMap.get(groupKey) !== groupApps.length
                            ? `${demandMap.get(groupKey)} total prefs`
                            : undefined
                        }
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
            locations={configs?.find(c => c.id === configId)?.locations}
            allApplications={applications}
            onSelectApplication={openDetail}
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
