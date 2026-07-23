"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { regularAPI } from "@/lib/api";
import { LOCATION_TO_CODE, CODE_TO_LOCATION } from "@/lib/regular-utils";
import {
  RegularApplicationCard, REGULAR_ALL_STATUSES, REGULAR_STATUS_COLORS,
} from "@/components/admin/RegularApplicationCard";
import { RegularApplicationDetailModal } from "@/components/admin/RegularApplicationDetailModal";
import { RegularLinkSuggestionsModal } from "@/components/admin/RegularLinkSuggestionsModal";
import { PublishFilterDropdown } from "@/components/admin/PublishFilterDropdown";
import { DropdownMenu, menuItemClass } from "@/components/ui/dropdown-menu";
import { TimeAgo } from "@/components/ui/time-ago";
import {
  ClipboardList, Search, X, Loader2, RefreshCw, ExternalLink, Sparkles,
  ChevronDown, Check, CheckSquare, SlidersHorizontal, Send, AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { RegularApplication } from "@/types";

const selectClass = "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

/** The ladder, split the way the status menu groups it: the rungs an
 *  application climbs, then the ways it leaves. Same split as summer's. */
const PIPELINE_STATUSES = [
  "Submitted", "Under Review", "Placement Offered", "Placement Confirmed",
  "Fee Sent", "Paid", "Enrolled",
];
const EXIT_STATUSES_LIST = REGULAR_ALL_STATUSES.filter(
  (s) => !PIPELINE_STATUSES.includes(s)
);

type BatchPublishResult = {
  application_id: number;
  success: boolean;
  enrollment_id?: number | null;
  sessions_created?: number | null;
  error_code?: string | null;
  error?: string | null;
};

export default function RegularApplicationsPage() {
  usePageTitle("Regular Applications");
  const { canViewAdminPages, isReadOnly } = useAuth();
  const { showToast } = useToast();

  const [configId, setConfigId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
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
  const [batchPublishResults, setBatchPublishResults] = useState<BatchPublishResult[] | null>(null);
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
  const { data: stats } = useSWR(statsKey, () =>
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
  const { data: applications, isLoading, isValidating } = useSWR(
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

  const handleRefresh = useCallback(() => {
    const pending: Promise<unknown>[] = [];
    if (appsKey) pending.push(mutate(appsKey));
    if (statsKey) pending.push(mutate(statsKey));
    return Promise.all(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId, statusFilter, gradeFilter, locationFilter, debouncedSearch, publishedFilter]);

  const selectedApp: RegularApplication | null =
    applications?.find((a) => a.id === selectedId) ?? null;

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

  // Arrow keys mirror the prev/next buttons while the modal is open. Typing in
  // a field inside the modal must still move the caret, not the selection.
  useEffect(() => {
    if (!detailOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      stepSelection(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailOpen, stepSelection]);

  // "/" jumps to the search box, as on the summer list.
  useEffect(() => {
    if (detailOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailOpen]);

  const hasFilters =
    !!statusFilter || !!gradeFilter || !!locationFilter || !!publishedFilter || !!debouncedSearch;

  const clearFilters = () => {
    setStatusFilter(null);
    setGradeFilter(null);
    setLocationFilter(null);
    setPublishedFilter(null);
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
  const moreFilterCount = gradeFilter ? 1 : 0;

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
                    disabled={!configId}
                    className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium disabled:opacity-50"
                    title="Preview which unlinked applications can be matched to existing students"
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
                {configs && configs.length > 1 && (() => {
                  const currentConfig = configs.find((c) => c.id === configId);
                  return (
                    <DropdownMenu
                      align="right"
                      trigger={({ triggerProps }) => (
                        <button
                          type="button"
                          {...triggerProps}
                          className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm border border-border rounded-lg bg-card text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          title={currentConfig?.is_active ? "Active season" : "Past season"}
                        >
                          <span>{currentConfig?.year}</span>
                          {currentConfig?.is_active && (
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
                  );
                })()}
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
                      <span className="font-semibold text-foreground tabular-nums">{applications.length}</span>
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
                    {moreFilterCount > 0 && (
                      <button
                        onClick={() => setGradeFilter(null)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear these filters
                      </button>
                    )}
                  </>
                )}
              </DropdownMenu>

              {!isReadOnly && (
                <button
                  onClick={() => {
                    if (batchMode || checkedIds.size > 0) {
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
              {showCheckboxes && (
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
            ) : !applications || applications.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                {hasFilters ? "No applications match the current filters." : "No applications yet."}
              </div>
            ) : (
              <div className="space-y-2 pb-4">
                {applications.map((a, i) => (
                  <RegularApplicationCard
                    key={a.id}
                    application={a}
                    index={i}
                    isFocused={detailOpen && a.id === selectedId}
                    onSelect={(picked) => {
                      setSelectedId(picked.id);
                      setDetailOpen(true);
                    }}
                    isChecked={checkedIds.has(a.id)}
                    onToggleCheck={isReadOnly ? undefined : toggleCheck}
                    showCheckbox={showCheckboxes}
                    onStatusChange={isReadOnly ? undefined : handleStatusChange}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </PageTransition>

      {/* Batch action bar */}
      <AnimatePresence>
        {checkedIds.size > 0 && !isReadOnly && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50"
          >
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
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">
                {checkedIds.size} selected
              </span>
              <select
                value={batchStatus}
                onChange={(e) => setBatchStatus(e.target.value)}
                className={selectClass}
              >
                {REGULAR_ALL_STATUSES.map((s) => (
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
              <span className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
              <button
                onClick={handleBatchPublish}
                disabled={batchPublishing || batchUpdating}
                title="Publish selected applications to enrollments, each from its assigned slot. Every application runs independently, so failures don't block successes."
                className="px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
              >
                {batchPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Publish Selected
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

      {/* Batch publish results — one row per application, so a failure names
          itself instead of hiding inside a count. */}
      {batchPublishResults && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setBatchPublishResults(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Publish results</h3>
              <button
                onClick={() => setBatchPublishResults(null)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 text-sm">
              {batchPublishResults.map((r) => {
                const app = applications?.find((a) => a.id === r.application_id);
                const label = app ? `${app.student_name} (${app.reference_code})` : `App #${r.application_id}`;
                return (
                  <div
                    key={r.application_id}
                    className={cn(
                      "flex items-start gap-2 px-3 py-2 rounded-lg border",
                      r.success
                        ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
                    )}
                  >
                    {r.success
                      ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                      : <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground truncate">{label}</div>
                      {r.success ? (
                        <div className="text-xs text-muted-foreground">
                          Created enrollment #{r.enrollment_id} with {r.sessions_created} session(s).
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{r.error_code}</span> — {r.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setBatchPublishResults(null)}
                className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
      />

      <RegularLinkSuggestionsModal
        isOpen={linkSuggestionsOpen}
        onClose={() => setLinkSuggestionsOpen(false)}
        configId={configId}
        onDone={handleRefresh}
      />
    </DeskSurface>
  );
}
