"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { regularAPI } from "@/lib/api";
import { LOCATION_TO_CODE, CODE_TO_LOCATION } from "@/lib/regular-utils";
import {
  RegularApplicationCard, REGULAR_ALL_STATUSES, REGULAR_STATUS_COLORS,
} from "@/components/admin/RegularApplicationCard";
import { RegularApplicationDetailModal } from "@/components/admin/RegularApplicationDetailModal";
import { RegularLinkSuggestionsModal } from "@/components/admin/RegularLinkSuggestionsModal";
import {
  ClipboardList, Search, X, Loader2, RefreshCw, ExternalLink, Sparkles,
} from "lucide-react";
import type { RegularApplication } from "@/types";

const selectClass = "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

export default function RegularApplicationsPage() {
  usePageTitle("Regular Applications");
  const { canViewAdminPages, isReadOnly } = useAuth();

  const [configId, setConfigId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [publishedFilter, setPublishedFilter] = useState<"published" | "unpublished" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Suggest-links flow: the modal previews every match and lets the admin
  // resolve the ambiguous ones before applying.
  const [linkSuggestionsOpen, setLinkSuggestionsOpen] = useState(false);

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
  const { data: applications, isLoading, isValidating } = useSWR(appsKey, () =>
    regularAPI.getApplications({
      config_id: configId!,
      application_status: statusFilter || undefined,
      grade: gradeFilter || undefined,
      location: locationParam,
      search: debouncedSearch || undefined,
      published: publishedFilter || undefined,
    })
  );

  const handleRefresh = () => {
    const pending: Promise<unknown>[] = [];
    if (appsKey) pending.push(mutate(appsKey));
    if (statsKey) pending.push(mutate(statsKey));
    return Promise.all(pending);
  };

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
                {configs && configs.length > 1 && (
                  <select
                    value={configId ?? ""}
                    onChange={(e) => setConfigId(parseInt(e.target.value, 10))}
                    className={selectClass}
                    title="Application season"
                  >
                    {configs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.year}{c.is_active ? " (active)" : ""}
                      </option>
                    ))}
                  </select>
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
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, phone, ref code, student ID..."
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
              <select
                value={statusFilter || ""}
                onChange={(e) => setStatusFilter(e.target.value || null)}
                className={selectClass}
                title="Filter by status"
              >
                <option value="">All statuses</option>
                {REGULAR_ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={gradeFilter || ""}
                onChange={(e) => setGradeFilter(e.target.value || null)}
                className={selectClass}
                title="Filter by grade"
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
                title="Filter by branch"
              >
                <option value="">All branches</option>
                {locationOptions.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <select
                value={publishedFilter || ""}
                onChange={(e) =>
                  setPublishedFilter((e.target.value || null) as "published" | "unpublished" | null)
                }
                className={selectClass}
                title="Filter by publish state"
              >
                <option value="">Published + not</option>
                <option value="published">Published</option>
                <option value="unpublished">Not published</option>
              </select>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="Clear all filters"
                >
                  Clear
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Stats chips */}
            {stats && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => setStatusFilter(null)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                    statusFilter === null
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-card text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  All <span className="tabular-nums">{stats.total}</span>
                </button>
                {REGULAR_ALL_STATUSES.map((s) => {
                  const count = stats.by_status[s] || 0;
                  if (count === 0) return null;
                  const colors = REGULAR_STATUS_COLORS[s];
                  const active = statusFilter === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatusFilter(active ? null : s)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                        colors.bg, colors.text,
                        active ? "border-current ring-1 ring-current" : "border-transparent hover:border-current/40"
                      )}
                      title={`Show ${s} applications`}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
                      {s} <span className="tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
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
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </PageTransition>

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
