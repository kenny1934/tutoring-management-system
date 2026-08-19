"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { usePageTitle, useDebouncedValue, useProspectPreview } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { regularAPI } from "@/lib/api";
import {
  LOCATION_TO_CODE, CODE_TO_LOCATION, REGULAR_STATUS_STEPS, REGULAR_EXIT_STATUSES,
  schoolGroupKey,
} from "@/lib/regular-utils";
import { RegularApplicationStats } from "@/components/admin/RegularApplicationStats";
import {
  RegularApplicationCard, REGULAR_ALL_STATUSES, REGULAR_STATUS_COLORS,
} from "@/components/admin/RegularApplicationCard";
import { RegularApplicationDetailModal } from "@/components/admin/RegularApplicationDetailModal";
import { ProspectDetailModal } from "@/components/summer/prospect-detail-modal";
import { RegularLinkSuggestionsModal } from "@/components/admin/RegularLinkSuggestionsModal";
import { PublishFilterDropdown } from "@/components/admin/PublishFilterDropdown";
import { BatchActionBar } from "@/components/admin/BatchActionBar";
import { BatchPublishResultsModal } from "@/components/admin/BatchPublishResultsModal";
import { DropdownMenu, menuItemClass } from "@/components/ui/dropdown-menu";
import { TimeAgo } from "@/components/ui/time-ago";
import {
  ClipboardList, Search, X, Loader2, RefreshCw, ExternalLink, Sparkles,
  ChevronDown, Check, CheckSquare, SlidersHorizontal, LayoutList, BarChart3,
} from "lucide-react";
import type { RegularApplication, RegularPublishResult } from "@/types";

const selectClass = "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

/** The ladder, split the way the status menu groups it: the rungs an
 *  application climbs, then the ways it leaves. Both come from the shared
 *  ladder so a new rung reaches the menu without a second edit. */
const PIPELINE_STATUSES: readonly string[] = REGULAR_STATUS_STEPS;
const EXIT_STATUSES_LIST = REGULAR_ALL_STATUSES.filter((s) => REGULAR_EXIT_STATUSES.has(s));

export default function RegularApplicationsPage() {
  usePageTitle("Regular Applications");
  const { canViewAdminPages, isReadOnly } = useAuth();
  const { showToast } = useToast();

  const [configId, setConfigId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "stats">("list");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  // Client-side school filter, set by clicking a bar on the stats view. Holds
  // the shared school key: a canonical code, or a folded spelling for schools
  // the alias table does not recognise yet.
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null);
  // Client-side journey filter: the prospect block rides on each application.
  const [prospectFilter, setProspectFilter] = useState<"skipped" | "did" | "none" | null>(null);
  const [unverifiedOriginOnly, setUnverifiedOriginOnly] = useState(false);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [publishedFilter, setPublishedFilter] = useState<"published" | "unpublished" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const searchRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Suggest-links flow: the modal previews every match and lets the admin
  // resolve the ambiguous ones before applying.
  const [linkSuggestionsOpen, setLinkSuggestionsOpen] = useState(false);

  // Batch mode: bulk status change and bulk publish over checked rows.
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [batchStatus, setBatchStatus] = useState("Under Review");
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchPublishing, setBatchPublishing] = useState(false);
  const [batchPublishResults, setBatchPublishResults] = useState<RegularPublishResult[] | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Data freshness
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const { data: configs } = useSWR(
    canViewAdminPages ? "regular-configs" : null,
    () => regularAPI.getConfigs()
  );

  useEffect(() => {
    if (configs && configs.length > 0 && configId === null) {
      const active = configs.find((c) => c.is_active);
      setConfigId(active?.id ?? configs[0].id);
    }
  }, [configs, configId]);

  const activeConfig = useMemo(
    () => configs?.find((c) => c.id === configId) ?? null,
    [configs, configId]
  );

  // Applications store the branch display name; the filter UI shows MSA/MSB.
  const locationParam = locationFilter ? CODE_TO_LOCATION[locationFilter] || locationFilter : undefined;

  const statsKey = configId
    ? ["regular-app-stats", configId, gradeFilter, locationFilter, debouncedSearch, publishedFilter]
    : null;
  const { data: stats, mutate: mutateStats } = useSWR(statsKey, () =>
    regularAPI.getApplicationStats({
      config_id: configId!,
      grade: gradeFilter || undefined,
      location: locationParam,
      search: debouncedSearch || undefined,
      published: publishedFilter || undefined,
    })
  );

  const appsKey = configId
    ? ["regular-apps", configId, statusFilter, gradeFilter, locationFilter, debouncedSearch, publishedFilter]
    : null;
  const { data: applications, isLoading, isValidating, mutate: mutateApps } = useSWR(
    appsKey,
    () =>
      regularAPI.getApplications({
        config_id: configId!,
        application_status: statusFilter || undefined,
        grade: gradeFilter || undefined,
        location: locationParam,
        search: debouncedSearch || undefined,
        published: publishedFilter || undefined,
      }),
    { onSuccess: () => setLastUpdated(Date.now()) }
  );

  // SWR's bound mutate always targets the current key and is referentially
  // stable, so this callback never goes stale and never re-renders the list.
  const handleRefresh = useCallback(
    () => Promise.all([mutateApps(), mutateStats()]),
    [mutateApps, mutateStats]
  );

  // Journey, origin and school filters are applied client-side, so they refine
  // the fetched list rather than changing the SWR key.
  const displayedApps = useMemo(() => {
    if (!applications) return applications;
    if (!prospectFilter && !unverifiedOriginOnly && !schoolFilter) return applications;
    return applications.filter((a) => {
      if (unverifiedOriginOnly && !!a.verified_branch_origin) return false;
      if (schoolFilter && schoolGroupKey(a) !== schoolFilter) return false;
      if (!prospectFilter) return true;
      const j = a.prospect_journey;
      if (prospectFilter === "none") return !j;
      if (prospectFilter === "skipped") return !!j && !j.attended_summer;
      return !!j && j.attended_summer; // "did"
    });
  }, [applications, prospectFilter, unverifiedOriginOnly, schoolFilter]);

  const selectedApp: RegularApplication | null =
    applications?.find((a) => a.id === selectedId) ?? null;

  // Stable, so the memoised cards don't all re-render on every keystroke.
  const openDetail = useCallback((picked: RegularApplication) => {
    setSelectedId(picked.id);
    setDetailOpen(true);
  }, []);

  // Prospect preview — opened from the journey chip, on a card or inside the
  // detail modal. The page owns one of these so both entry points share a fetch.
  const prospectPreview = useProspectPreview();

  // Modal prev/next walks the filtered list in display order.
  const selectedIndex = applications?.findIndex((a) => a.id === selectedId) ?? -1;
  const totalCount = applications?.length ?? 0;
  const stepSelection = useCallback((delta: number) => {
    setSelectedId((current) => {
      if (!applications) return current;
      const idx = applications.findIndex((a) => a.id === current);
      if (idx === -1) return current;
      const next = applications[idx + delta];
      return next ? next.id : current;
    });
  }, [applications]);

  // Keyboard shortcuts: arrows walk the list while the modal is open, "/"
  // jumps to search while it is closed. Typing in a field must still move the
  // caret, so anything originating in an input is left alone.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (detailOpen) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        stepSelection(e.key === "ArrowLeft" ? -1 : 1);
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailOpen, stepSelection]);

  const hasFilters =
    !!statusFilter || !!gradeFilter || !!locationFilter || !!publishedFilter || !!debouncedSearch
    || !!prospectFilter || unverifiedOriginOnly || !!schoolFilter;

  const clearFilters = () => {
    setStatusFilter(null);
    setGradeFilter(null);
    setProspectFilter(null);
    setUnverifiedOriginOnly(false);
    setLocationFilter(null);
    setPublishedFilter(null);
    setSchoolFilter(null);
    setSearchQuery("");
  };

  const gradeOptions = useMemo(
    () => (activeConfig?.available_grades || []).map((g) => g.value ?? g.name),
    [activeConfig]
  );
  const locationOptions = useMemo(
    () => (activeConfig?.locations || []).map((l) => LOCATION_TO_CODE[l.name] || l.name),
    [activeConfig]
  );
  const moreFilterCount =
    (gradeFilter ? 1 : 0) + (prospectFilter ? 1 : 0) + (unverifiedOriginOnly ? 1 : 0);

  // --- Batch selection ---

  const showCheckboxes = batchMode || checkedIds.size > 0;
  const toggleCheck = useCallback((id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const [allVisibleChecked, someVisibleChecked] = useMemo(() => {
    const list = applications ?? [];
    if (list.length === 0) return [false, false] as const;
    if (list.every((a) => checkedIds.has(a.id))) return [true, true] as const;
    return [false, list.some((a) => checkedIds.has(a.id))] as const;
  }, [applications, checkedIds]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleChecked && !allVisibleChecked;
    }
  }, [someVisibleChecked, allVisibleChecked]);

  const toggleSelectAll = useCallback(() => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      (applications ?? []).forEach((a) => {
        if (allVisibleChecked) next.delete(a.id); else next.add(a.id);
      });
      return next;
    });
  }, [allVisibleChecked, applications]);

  const handleStatusChange = useCallback(async (id: number, status: string) => {
    try {
      await regularAPI.updateApplication(id, { application_status: status });
      showToast(`Status set to ${status}`, "success");
      await handleRefresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    }
  }, [handleRefresh, showToast]);

  const handleBatchUpdate = async () => {
    if (checkedIds.size === 0 || batchUpdating) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(checkedIds);
      const results = await Promise.allSettled(
        ids.map((id) => regularAPI.updateApplication(id, { application_status: batchStatus }))
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (failed > 0) {
        showToast(`Updated ${succeeded}, failed ${failed}`, "error");
      } else {
        showToast(`Updated ${succeeded} application${succeeded !== 1 ? "s" : ""}`, "success");
      }
      setCheckedIds(new Set());
      await handleRefresh();
    } catch {
      showToast("Batch update failed", "error");
    } finally {
      setBatchUpdating(false);
    }
  };

  const handleBatchPublish = async () => {
    if (checkedIds.size === 0 || batchPublishing) return;
    setBatchPublishing(true);
    try {
      // Schedule fields are omitted: each application publishes from the slot
      // it was assigned on the arrangement page.
      const resp = await regularAPI.publishApplicationsBatch(
        Array.from(checkedIds).map((id) => ({ application_id: id }))
      );
      setBatchPublishResults(resp.results);
      if (resp.failed_count === 0) {
        showToast(
          `Published ${resp.published_count} application${resp.published_count !== 1 ? "s" : ""}`,
          "success"
        );
      } else {
        showToast(`Published ${resp.published_count}, failed ${resp.failed_count}`, "error");
      }
      setCheckedIds(new Set());
      await handleRefresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Batch publish failed", "error");
    } finally {
      setBatchPublishing(false);
    }
  };

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
        <div className="flex flex-col h-full bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm paper-texture overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-1.5 min-w-0">
                  <span className="truncate">Regular Applications</span>
                  <a
                    href="/regular/apply"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open application form"
                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  {isReadOnly && <span className="shrink-0 text-[10px] font-normal text-amber-600">(Read-only)</span>}
                </h1>
                <p className="hidden sm:block text-xs text-muted-foreground">
                  Review September intake applications and publish confirmed schedules
                </p>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {lastUpdated && <TimeAgo timestamp={lastUpdated} />}
                <button
                  onClick={handleRefresh}
                  disabled={isValidating}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  title="Refresh"
                  aria-label="Refresh applications"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} />
                </button>
                {!isReadOnly && (
                  <button
                    onClick={() => setLinkSuggestionsOpen(true)}
                    disabled={!configId || !activeConfig?.year}
                    className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium disabled:opacity-50"
                    title="Preview which applications can be matched to P6 prospects and existing student records"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Link suggestions</span>
                  </button>
                )}
                {locationOptions.length > 0 && (
                  <select
                    value={locationFilter || ""}
                    onChange={(e) => setLocationFilter(e.target.value || null)}
                    className="px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm border border-border rounded-lg bg-card text-foreground"
                    title="Filter by branch"
                  >
                    <option value="">All</option>
                    {locationOptions.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                )}
                {configs && configs.length > 1 && (
                  <DropdownMenu
                    align="right"
                    trigger={({ triggerProps }) => (
                      <button
                        type="button"
                        {...triggerProps}
                        className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm border border-border rounded-lg bg-card text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        title={activeConfig?.is_active ? "Active season" : "Past season"}
                      >
                        <span>{activeConfig?.year}</span>
                        {activeConfig?.is_active && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        )}
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                      </button>
                    )}
                  >
                    {(close) => configs.map((c) => {
                      const active = c.id === configId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            setConfigId(c.id);
                            setCheckedIds(new Set());
                            close();
                          }}
                          className={cn(menuItemClass, active && "bg-primary/5")}
                        >
                          <span className="flex-1 text-foreground">{c.year}</span>
                          {c.is_active && (
                            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                              Active
                            </span>
                          )}
                          {active && <Check className="h-3 w-3 text-primary" />}
                        </button>
                      );
                    })}
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>

          {/* Filter row */}
          <div className="px-4 sm:px-6 py-2.5 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='Search name, phone, ref code, student ID... (press "/")'
                  className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground placeholder:text-muted-foreground/60"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <DropdownMenu
                menuClassName="min-w-[220px]"
                trigger={({ open, triggerProps }) => {
                  const colors = statusFilter ? REGULAR_STATUS_COLORS[statusFilter] : null;
                  return (
                    <button
                      type="button"
                      {...triggerProps}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg border transition-colors",
                        statusFilter
                          ? cn(colors?.bg, colors?.text, "border-current/30")
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-foreground hover:bg-gray-50 dark:hover:bg-gray-700/50",
                        open && "ring-1 ring-primary/30",
                      )}
                      title="Filter by status"
                    >
                      {colors && <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />}
                      <span className="font-medium">{statusFilter || "All statuses"}</span>
                      {statusFilter && stats && (
                        <span className="font-normal opacity-70">{stats.by_status[statusFilter] || 0}</span>
                      )}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </button>
                  );
                }}
              >
                {(close) => {
                  const renderRow = (s: string | null) => {
                    const isAll = s === null;
                    const count = isAll ? stats?.total ?? 0 : stats?.by_status[s!] ?? 0;
                    if (!isAll && count === 0) return null;
                    const colors = isAll ? null : REGULAR_STATUS_COLORS[s!];
                    const active = statusFilter === s;
                    return (
                      <button
                        key={s ?? "__all"}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => { setStatusFilter(s); close(); }}
                        className={cn(menuItemClass, active && "bg-primary/5")}
                      >
                        {colors ? (
                          <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
                        ) : (
                          <span className="w-1.5 h-1.5" />
                        )}
                        <span className="flex-1 text-foreground">{s ?? "All statuses"}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                        {active && <Check className="h-3 w-3 text-primary" />}
                      </button>
                    );
                  };
                  return (
                    <>
                      {renderRow(null)}
                      <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                      {PIPELINE_STATUSES.map(renderRow)}
                      {EXIT_STATUSES_LIST.some((s) => (stats?.by_status[s] || 0) > 0) && (
                        <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                      )}
                      {EXIT_STATUSES_LIST.map(renderRow)}
                    </>
                  );
                }}
              </DropdownMenu>

              {applications && stats && (
                hasFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="group inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="Clear all filters"
                  >
                    <span>
                      <span className="font-semibold text-foreground tabular-nums">{displayedApps?.length ?? applications.length}</span>
                      <span className="mx-1">of</span>
                      <span className="tabular-nums">{stats.total}</span>
                    </span>
                    <X className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">{stats.total}</span>
                    <span className="ml-1">total</span>
                  </span>
                )
              )}

              <PublishFilterDropdown
                publishedFilter={publishedFilter}
                onChangePublished={setPublishedFilter}
                statusFilter={statusFilter}
                onChangeStatus={setStatusFilter}
              />

              {schoolFilter && (
                <button
                  type="button"
                  onClick={() => setSchoolFilter(null)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 transition-colors"
                  title="Showing one school. Click to clear."
                >
                  <span className="font-medium">{schoolFilter}</span>
                  <X className="h-3 w-3" />
                </button>
              )}

              <div className="flex-1" />

              <DropdownMenu
                align="right"
                menuClassName="min-w-[220px] p-3 space-y-3"
                trigger={({ open, triggerProps }) => (
                  <button
                    type="button"
                    {...triggerProps}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg border transition-colors",
                      moreFilterCount > 0
                        ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-foreground hover:bg-gray-50 dark:hover:bg-gray-700/50",
                      open && "ring-1 ring-primary/30",
                    )}
                    title="More filters"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="font-medium">More</span>
                    {moreFilterCount > 0 && (
                      <span className="bg-amber-500 text-white text-[10px] rounded-full px-1 min-w-[16px] text-center leading-[16px]">
                        {moreFilterCount}
                      </span>
                    )}
                  </button>
                )}
              >
                {() => (
                  <>
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
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Prospect journey</label>
                      <select
                        value={prospectFilter || ""}
                        onChange={(e) => setProspectFilter((e.target.value || null) as typeof prospectFilter)}
                        className={cn(selectClass, "w-full")}
                      >
                        <option value="">Any</option>
                        <option value="skipped">Prospect, skipped summer</option>
                        <option value="did">Prospect, did summer</option>
                        <option value="none">Not a prospect</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={unverifiedOriginOnly}
                        onChange={(e) => setUnverifiedOriginOnly(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs text-foreground">Unverified branch origin</span>
                    </label>
                    {moreFilterCount > 0 && (
                      <button
                        onClick={() => {
                          setGradeFilter(null);
                          setProspectFilter(null);
                          setUnverifiedOriginOnly(false);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear these filters
                      </button>
                    )}
                  </>
                )}
              </DropdownMenu>

              <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  title="List view"
                  aria-label="List view"
                  aria-pressed={viewMode === "list"}
                  className={cn(
                    "px-2 py-1.5 transition-colors",
                    viewMode === "list"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800",
                  )}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("stats")}
                  title="Stats"
                  aria-label="Stats view"
                  aria-pressed={viewMode === "stats"}
                  className={cn(
                    "px-2 py-1.5 transition-colors border-l border-gray-200 dark:border-gray-700",
                    viewMode === "stats"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800",
                  )}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                </button>
              </div>

              {!isReadOnly && viewMode === "list" && (
                <button
                  onClick={() => {
                    if (showCheckboxes) {
                      setBatchMode(false);
                      setCheckedIds(new Set());
                    } else {
                      setBatchMode(true);
                    }
                  }}
                  title={showCheckboxes ? "Exit batch mode" : "Enter batch mode"}
                  aria-label={showCheckboxes ? "Exit batch mode" : "Enter batch mode"}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    showCheckboxes
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </button>
              )}
              {showCheckboxes && viewMode === "list" && (
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer shrink-0"
                  title={allVisibleChecked ? "Deselect all visible" : "Select all visible"}
                />
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : viewMode === "stats" ? (
              <RegularApplicationStats
                applications={displayedApps ?? []}
                readOnly={isReadOnly}
                onAliasCreated={handleRefresh}
                filters={{
                  onStatusFilter: (status) => { setStatusFilter(status); setViewMode("list"); },
                  onGradeFilter: (grade) => { setGradeFilter(grade); setViewMode("list"); },
                  onLocationFilter: (code) => { setLocationFilter(code); setViewMode("list"); },
                  onSchoolFilter: (key) => { setSchoolFilter(key); setViewMode("list"); },
                }}
              />
            ) : !displayedApps || displayedApps.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                {hasFilters ? "No applications match the current filters." : "No applications yet."}
              </div>
            ) : (
              <div className="space-y-2 pb-4">
                {displayedApps.map((a, i) => (
                  <RegularApplicationCard
                    key={a.id}
                    application={a}
                    index={i}
                    isFocused={detailOpen && a.id === selectedId}
                    onSelect={openDetail}
                    isChecked={checkedIds.has(a.id)}
                    onToggleCheck={isReadOnly ? undefined : toggleCheck}
                    showCheckbox={showCheckboxes}
                    onStatusChange={isReadOnly ? undefined : handleStatusChange}
                    onProspectClick={prospectPreview.open}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </PageTransition>

      {!isReadOnly && (
        <BatchActionBar
          count={checkedIds.size}
          statuses={REGULAR_ALL_STATUSES}
          status={batchStatus}
          onStatusChange={setBatchStatus}
          confirmOpen={showBatchConfirm}
          onConfirmOpenChange={setShowBatchConfirm}
          onUpdate={handleBatchUpdate}
          updating={batchUpdating}
          onPublish={handleBatchPublish}
          publishing={batchPublishing}
          publishTitle="Publish selected applications to enrollments, each from its assigned slot. Every application runs independently, so failures don't block successes."
          onClear={() => { setCheckedIds(new Set()); setShowBatchConfirm(false); }}
        />
      )}

      <BatchPublishResultsModal
        results={batchPublishResults}
        applications={applications}
        onClose={() => setBatchPublishResults(null)}
      />

      <RegularApplicationDetailModal
        application={selectedApp}
        isOpen={detailOpen && !!selectedApp}
        onClose={() => setDetailOpen(false)}
        onUpdated={handleRefresh}
        config={activeConfig}
        readOnly={isReadOnly}
        onPrev={() => stepSelection(-1)}
        onNext={() => stepSelection(1)}
        hasPrev={selectedIndex > 0}
        hasNext={selectedIndex !== -1 && selectedIndex < totalCount - 1}
        currentIndex={selectedIndex === -1 ? undefined : selectedIndex}
        totalCount={totalCount}
        onProspectClick={prospectPreview.open}
      />

      <RegularLinkSuggestionsModal
        isOpen={linkSuggestionsOpen}
        onClose={() => setLinkSuggestionsOpen(false)}
        year={activeConfig?.year ?? null}
        configId={configId}
        onDone={handleRefresh}
      />

      {/* Last in the tree so it stacks above the application modal it can be
          opened from — both overlays sit at the same z-index. */}
      {prospectPreview.prospect && (
        <ProspectDetailModal
          prospect={prospectPreview.prospect}
          onClose={prospectPreview.close}
          onSave={() => { prospectPreview.invalidate(); handleRefresh(); }}
          readOnly={isReadOnly}
        />
      )}
    </DeskSurface>
  );
}
