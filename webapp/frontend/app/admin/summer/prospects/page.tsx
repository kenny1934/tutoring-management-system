"use client";

import { useState, useCallback, useEffect, useMemo, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import {
  Search,
  Sparkles,
  Link2,
  MessageSquare,
  ChevronDown,
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  X,
  Clock,
  Pencil,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Columns3,
  SlidersHorizontal,
  List as ListIcon,
  LayoutGrid,
} from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { prospectsAPI, summerAPI } from "@/lib/api";
import { parseHKTimestamp, formatTimeAgo, wasEdited } from "@/lib/formatters";
import { BRANCH_INFO } from "@/lib/summer-utils";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import {
  IntentionBadge,
  OutreachBadge,
  BranchBadges,
  CopyableCell,
  ProspectStatusBadge,
  INTENTION_LABELS,
  OUTREACH_BADGE_COLORS,
  STATUS_BADGE_COLORS,
  BRANCH_COLORS,
  OUTREACH_OPTIONS,
  STATUS_OPTIONS,
  INTENTION_OPTIONS,
} from "@/components/summer/prospect-badges";
import { ProspectDetailModal } from "@/components/summer/prospect-detail-modal";
import { ProspectDashboard } from "@/components/summer/prospect-dashboard";
import { usePortalPopover } from "@/hooks/usePortalPopover";
import type {
  PrimaryProspect,
  PrimaryProspectStats,
  ProspectOutreachStatus,
  ProspectStatus,
} from "@/types";
import {
  PROSPECT_BRANCHES,
  SECONDARY_BRANCHES,
  OUTREACH_STATUS_HINTS,
} from "@/types";

const inputSmall =
  "text-xs border-2 border-border rounded-lg px-2 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors duration-200";


// ---- Main Page ----

// Hideable columns — keys map to <th>/<td> visibility predicates
type ColKey = "id" | "school" | "grade" | "tutor" | "phone" | "wechat" | "pref" | "remark" | "notes";
const HIDEABLE_COLS: { key: ColKey; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "school", label: "School" },
  { key: "grade", label: "Grade" },
  { key: "tutor", label: "Tutor" },
  { key: "phone", label: "Phone" },
  { key: "wechat", label: "WeChat" },
  { key: "pref", label: "Time/Tutor Pref" },
  { key: "remark", label: "Remark" },
  { key: "notes", label: "Notes" },
];

const SORT_KEYS = [
  "primary_student_id",
  "student_name",
  "school",
  "grade",
  "tutor_name",
  "outreach_status",
  "status",
  "submitted_at",
] as const;
type SortKey = typeof SORT_KEYS[number];
type SortOrder = "asc" | "desc";

function isSortKey(s: string | null): s is SortKey {
  return !!s && (SORT_KEYS as readonly string[]).includes(s);
}

// Typed accessor for sort — keeps the comparator strict and documents what
// each sort key actually compares.
function getSortValue(p: PrimaryProspect, key: SortKey): string | number | null {
  switch (key) {
    case "primary_student_id": return p.primary_student_id;
    case "student_name": return p.student_name;
    case "school": return p.school;
    case "grade": return p.grade;
    case "tutor_name": return p.tutor_name;
    case "outreach_status": return p.outreach_status;
    case "status": return p.status;
    case "submitted_at": return p.submitted_at;
  }
}

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  // Nulls/empties always sort last
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export default function AdminProspectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-backed state
  const [year, setYear] = useState<number | null>(() => {
    const y = searchParams.get("year");
    return y ? Number(y) : null;
  });
  const [tab, setTab] = useState<"list" | "dashboard">(() =>
    searchParams.get("tab") === "dashboard" ? "dashboard" : "list"
  );
  const [filters, setFilters] = useState(() => ({
    branch: searchParams.get("branch") ?? "",
    status: searchParams.get("status") ?? "",
    outreach_status: searchParams.get("outreach") ?? "",
    wants_summer: searchParams.get("wantsSummer") ?? "",
    wants_regular: searchParams.get("wantsRegular") ?? "",
    linked: searchParams.get("linked") ?? "",
    search: searchParams.get("q") ?? "",
  }));
  const [choice, setChoice] = useState<string[]>(() => {
    const c = searchParams.get("choice");
    return c ? c.split(",").filter(Boolean) : [];
  });
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    const s = searchParams.get("sort");
    return isSortKey(s) ? s : "submitted_at";
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(() =>
    searchParams.get("order") === "asc" ? "asc" : "desc"
  );
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "");
  // Capture the initial `focus` param once — the URL-sync effect below strips
  // it from the address bar on the next render, so we can't re-read it later.
  const initialFocusId = useRef(searchParams.get("focus")).current;

  // Column visibility — persisted to localStorage
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem("prospect_hidden_cols");
      if (saved) return new Set(JSON.parse(saved) as ColKey[]);
    } catch { /* ignore */ }
    // Default-hide low-frequency columns to keep table compact on first load
    return new Set<ColKey>(["pref"]);
  });
  const [showColMenu, setShowColMenu] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem("prospect_hidden_cols", JSON.stringify([...hiddenCols]));
    } catch { /* ignore */ }
  }, [hiddenCols]);
  const colVisible = useCallback((k: ColKey) => !hiddenCols.has(k), [hiddenCols]);
  const toggleCol = useCallback((k: ColKey) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedProspect, setSelectedProspect] = useState<PrimaryProspect | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  const [confirmCountdown, setConfirmCountdown] = useState(0);
  const autoMatchTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const confirmingAutoMatch = confirmCountdown > 0;
  const [pageError, setPageError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<{ matched: number; total_unlinked: number; skipped_ambiguous: number } | null>(null);
  const matchResultTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => { clearTimeout(matchResultTimer.current); clearInterval(autoMatchTimerRef.current); }, []);

  // Fetch available years from summer configs
  const { data: configs } = useSWR("summer-configs", () => summerAPI.getConfigs(), { revalidateOnFocus: false });
  const availableYears = useMemo(() => configs?.map((c) => c.year).sort((a, b) => b - a) ?? [], [configs]);

  // Default to active config's year
  useEffect(() => {
    if (configs && configs.length > 0 && year === null) {
      const active = configs.find((c) => c.is_active);
      setYear(active?.year ?? configs[0].year);
    }
  }, [configs, year]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const swrKey = tab === "list" && year
    ? ["admin-prospects", year, filters.branch, filters.status, filters.outreach_status, filters.wants_summer, filters.wants_regular, filters.linked, filters.search]
    : null;
  const { data: prospects, isLoading } = useSWR(
    swrKey,
    () => prospectsAPI.adminList({
      year: year!,
      branch: filters.branch || undefined,
      status: filters.status || undefined,
      outreach_status: filters.outreach_status || undefined,
      wants_summer: filters.wants_summer || undefined,
      wants_regular: filters.wants_regular || undefined,
      linked: filters.linked || undefined,
      search: filters.search || undefined,
    }),
    { revalidateOnFocus: false }
  );

  // Sync modal with refreshed list data after save. Ref is updated in an effect
  // (not during render) so the prospects-only dep below stays valid.
  const selectedProspectRef = useRef(selectedProspect);
  useEffect(() => { selectedProspectRef.current = selectedProspect; }, [selectedProspect]);
  useEffect(() => {
    if (!selectedProspectRef.current || !prospects) return;
    const updated = prospects.find((p) => p.id === selectedProspectRef.current!.id);
    if (updated) setSelectedProspect(updated);
  }, [prospects]);

  // Counts per secondary branch from the server-filtered set (before client choice filter)
  // so each pill shows "how many would match if I picked just this".
  const choiceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!prospects) return counts;
    for (const p of prospects) {
      for (const b of p.preferred_branches || []) {
        counts[b] = (counts[b] || 0) + 1;
      }
    }
    return counts;
  }, [prospects]);

  // Client-side Branch Choice filter + sort layered on top of server-filtered rows
  const displayedProspects = useMemo(() => {
    if (!prospects) return undefined;
    const choiceSet = new Set(choice);
    const filtered = choiceSet.size === 0
      ? prospects
      : prospects.filter((p) => p.preferred_branches?.some((b) => choiceSet.has(b)));
    const sorted = [...filtered].sort((a, b) => {
      const cmp = compareValues(getSortValue(a, sortBy), getSortValue(b, sortBy));
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [prospects, choice, sortBy, sortOrder]);

  // Focus highlight: arrive via /admin/summer/prospects?focus=<id> (e.g. from the
  // summer applications card's linked-prospect chip). Open the detail modal,
  // scroll the row into view, and flash a ring for ~2.5s. No-op if the prospect
  // isn't in the current filtered view. Runs once per page load.
  const focusAppliedRef = useRef(false);
  useEffect(() => {
    if (focusAppliedRef.current || !initialFocusId || !displayedProspects) return;
    const id = Number(initialFocusId);
    if (!Number.isFinite(id)) return;
    const target = displayedProspects.find((p) => p.id === id);
    if (!target) return;
    focusAppliedRef.current = true;
    setSelectedProspect(target);
    const el = document.querySelector<HTMLElement>(`[data-prospect-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const flashClasses = ["ring-2", "ring-primary", "ring-offset-2", "ring-offset-background"];
    el.classList.add(...flashClasses);
    const t = setTimeout(() => el.classList.remove(...flashClasses), 2500);
    return () => clearTimeout(t);
  }, [initialFocusId, displayedProspects]);

  // Sync state → URL (replace, not push — filter clicks shouldn't clog history)
  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== "list") params.set("tab", tab);
    if (year != null) params.set("year", String(year));
    if (filters.branch) params.set("branch", filters.branch);
    if (choice.length > 0) params.set("choice", choice.join(","));
    if (filters.status) params.set("status", filters.status);
    if (filters.outreach_status) params.set("outreach", filters.outreach_status);
    if (filters.wants_summer) params.set("wantsSummer", filters.wants_summer);
    if (filters.wants_regular) params.set("wantsRegular", filters.wants_regular);
    if (filters.linked) params.set("linked", filters.linked);
    if (filters.search) params.set("q", filters.search);
    if (sortBy !== "submitted_at") params.set("sort", sortBy);
    if (sortOrder !== "desc") params.set("order", sortOrder);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [tab, year, filters, choice, sortBy, sortOrder, router]);

  const handleSort = useCallback((key: SortKey) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      // New column: default desc for time, asc for text
      setSortOrder(key === "submitted_at" ? "desc" : "asc");
      return key;
    });
  }, []);

  const statsKey = year ? `admin-prospect-stats-${year}` : null;
  const { data: stats } = useSWR(
    statsKey,
    () => prospectsAPI.stats(year!),
    { revalidateOnFocus: false }
  );

  // Stable: matches any current admin-prospects list key + the stats key for any year.
  // Stable identity matters because handleInlineUpdate flows into the memoized ProspectRow.
  const refresh = useCallback(() => {
    globalMutate((key) => Array.isArray(key) && key[0] === "admin-prospects");
    globalMutate((key) => typeof key === "string" && key.startsWith("admin-prospect-stats-"));
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!displayedProspects) return;
    setSelectedIds((prev) =>
      prev.size === displayedProspects.length
        ? new Set()
        : new Set(displayedProspects.map((p) => p.id))
    );
  }, [displayedProspects]);

  const handleBulkOutreach = useCallback(async (outreachStatus: ProspectOutreachStatus) => {
    if (selectedIds.size === 0) return;
    setPageError(null);
    try {
      await prospectsAPI.bulkOutreach(Array.from(selectedIds), outreachStatus);
      setSelectedIds(new Set());
      refresh();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Bulk update failed");
    }
  }, [selectedIds, refresh]);

  const handleBulkStatus = useCallback(async (status: ProspectStatus) => {
    if (selectedIds.size === 0) return;
    setPageError(null);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => prospectsAPI.adminUpdate(id, { status }))
      );
      setSelectedIds(new Set());
      refresh();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Bulk status update failed");
    }
  }, [selectedIds, refresh]);

  // Quick inline edit — outreach or status on a single row
  const handleInlineUpdate = useCallback(
    async (id: number, patch: { outreach_status?: ProspectOutreachStatus; status?: ProspectStatus }) => {
      setPageError(null);
      try {
        await prospectsAPI.adminUpdate(id, patch);
        refresh();
      } catch (err) {
        setPageError(err instanceof Error ? err.message : "Update failed");
      }
    },
    [refresh]
  );

  // Clear selection when filters change so we don't act on hidden rows
  const filterFingerprint = `${filters.branch}|${filters.status}|${filters.outreach_status}|${filters.wants_summer}|${filters.wants_regular}|${filters.linked}|${filters.search}|${choice.join(",")}`;
  useEffect(() => {
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFingerprint]);

  // Skeleton row count tracks last successful fetch to avoid layout jump
  const lastCountRef = useRef(5);
  useEffect(() => {
    if (prospects && prospects.length > 0) {
      lastCountRef.current = Math.min(prospects.length, 12);
    }
  }, [prospects]);

  const handleAutoMatch = useCallback(async () => {
    if (!year) return;
    if (confirmCountdown === 0) {
      // First click — enter confirm mode with a visible countdown.
      setConfirmCountdown(3);
      clearInterval(autoMatchTimerRef.current);
      autoMatchTimerRef.current = setInterval(() => {
        setConfirmCountdown((c) => {
          if (c <= 1) {
            clearInterval(autoMatchTimerRef.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return;
    }
    clearInterval(autoMatchTimerRef.current);
    setConfirmCountdown(0);
    setAutoMatching(true);
    setMatchResult(null);
    setPageError(null);
    try {
      const result = await prospectsAPI.autoMatch(year);
      setMatchResult(result);
      refresh();
      clearTimeout(matchResultTimer.current);
      matchResultTimer.current = setTimeout(() => setMatchResult(null), 10000);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Auto-match failed");
    } finally {
      setAutoMatching(false);
    }
  }, [year, refresh, confirmCountdown]);

  const activeFilterCount = [filters.status, filters.outreach_status, filters.wants_summer, filters.wants_regular, filters.linked, filters.search].filter(Boolean).length + choice.length;

  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setChoice([]);
    setFilters((f) => ({ ...f, status: "", outreach_status: "", wants_summer: "", wants_regular: "", linked: "", search: "" }));
  }, []);

  // Active filter chip descriptors (for the chip strip above the table)
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (filters.search) chips.push({
      key: "search",
      label: `"${filters.search}"`,
      onRemove: () => { setSearchInput(""); setFilters((f) => ({ ...f, search: "" })); },
    });
    if (filters.branch) chips.push({
      key: "branch",
      label: `Branch: ${filters.branch}`,
      onRemove: () => setFilters((f) => ({ ...f, branch: "" })),
    });
    for (const c of choice) chips.push({
      key: `choice-${c}`,
      label: `Wants: ${c}`,
      onRemove: () => setChoice((prev) => prev.filter((x) => x !== c)),
    });
    if (filters.wants_summer) chips.push({
      key: "wants_summer",
      label: `Summer: ${filters.wants_summer}`,
      onRemove: () => setFilters((f) => ({ ...f, wants_summer: "" })),
    });
    if (filters.wants_regular) chips.push({
      key: "wants_regular",
      label: `Regular: ${filters.wants_regular}`,
      onRemove: () => setFilters((f) => ({ ...f, wants_regular: "" })),
    });
    if (filters.outreach_status) chips.push({
      key: "outreach_status",
      label: `Outreach: ${filters.outreach_status}`,
      onRemove: () => setFilters((f) => ({ ...f, outreach_status: "" })),
    });
    if (filters.status) chips.push({
      key: "status",
      label: `Status: ${filters.status}`,
      onRemove: () => setFilters((f) => ({ ...f, status: "" })),
    });
    if (filters.linked) chips.push({
      key: "linked",
      label: filters.linked === "linked" ? "Linked" : "Unlinked",
      onRemove: () => setFilters((f) => ({ ...f, linked: "" })),
    });
    return chips;
  }, [filters, choice]);

  // Body scroll lock while mobile filter drawer is open
  useEffect(() => {
    if (!showFilterDrawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowFilterDrawer(false); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [showFilterDrawer]);

  return (
    <DeskSurface fullHeight>
      <PageTransition className="p-4 sm:p-6 flex-1 min-h-0 flex flex-col">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm paper-texture overflow-hidden flex-1 min-h-0 flex flex-col">
          <HeaderBar
            year={year}
            availableYears={availableYears}
            onYearChange={setYear}
            autoMatching={autoMatching}
            confirmCountdown={confirmCountdown}
            onAutoMatch={handleAutoMatch}
            tab={tab}
            onTabChange={setTab}
          />

          {/* Content */}
          <div className="p-4 sm:p-6 flex-1 min-h-0 flex flex-col">
      {tab === "list" ? (
        <div className="space-y-5 flex-1 min-h-0 flex flex-col">
          <div className="-mx-4 sm:mx-0">
            <div className="flex sm:flex-wrap gap-1.5 overflow-x-auto sm:overflow-visible px-4 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] sm:[mask-image:none]">
            <button
              onClick={() => setFilters((f) => ({ ...f, branch: "" }))}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                !filters.branch
                  ? "bg-primary text-white shadow-sm"
                  : "border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              All
              {stats && stats.length > 0 && (
                <span className="ml-1 opacity-60">{stats.reduce((sum, s) => sum + s.total, 0)}</span>
              )}
            </button>
            {PROSPECT_BRANCHES.map((b) => {
              const branchTotal = stats?.find((s) => s.branch === b)?.total;
              return (
                <button
                  key={b}
                  onClick={() => setFilters((f) => ({ ...f, branch: f.branch === b ? "" : b }))}
                  className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                    filters.branch === b
                      ? `${BRANCH_INFO[b]?.badge || "bg-primary text-white"} shadow-sm ring-1 ring-current/20`
                      : "border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {b}
                  {branchTotal != null && (
                    <span className="ml-1 opacity-60">{branchTotal}</span>
                  )}
                </button>
              );
            })}
            </div>
          </div>

          {/* Branch Choice — desktop only; mobile copy lives in the filter drawer */}
          <div className="hidden sm:flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">Branch Choice</span>
            {SECONDARY_BRANCHES.map((b) => {
              const active = choice.includes(b);
              const count = choiceCounts[b] ?? 0;
              const badge = BRANCH_COLORS[b]?.badge || "bg-primary text-white";
              return (
                <button
                  key={b}
                  onClick={() =>
                    setChoice((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]))
                  }
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-full transition-all duration-200 ${
                    active
                      ? `${badge} ring-2 ring-current shadow-sm`
                      : "border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {b}
                  <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
            {choice.length > 0 && (
              <button
                onClick={() => setChoice([])}
                className="text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors ml-1"
              >
                clear
              </button>
            )}
          </div>

          <div className="flex sm:hidden gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search..."
                className={`${inputSmall} pl-8 w-full`}
              />
            </div>
            <button
              onClick={() => setShowFilterDrawer(true)}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:border-primary/50 transition-colors"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-white">{activeFilterCount}</span>
              )}
            </button>
          </div>

          <div className="hidden sm:flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search..."
                className={`${inputSmall} pl-8 w-52`}
              />
            </div>
            <FilterSelects filters={filters} setFilters={setFilters} className="contents" />
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                Clear all
              </button>
            )}
            <div className="relative ml-auto">
              <button
                onClick={() => setShowColMenu((v) => !v)}
                className="hidden sm:inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              >
                <Columns3 className="h-3 w-3" />
                Columns
                {hiddenCols.size > 0 && <span className="text-[10px] opacity-60">({hiddenCols.size} hidden)</span>}
              </button>
              {showColMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowColMenu(false)} />
                  <div className="absolute right-0 mt-1 w-44 bg-card border border-border rounded-lg shadow-lg p-2 z-20">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-1">Show columns</div>
                    {HIDEABLE_COLS.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-primary/5 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!hiddenCols.has(c.key)}
                          onChange={() => toggleCol(c.key)}
                          className="rounded"
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {activeChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                >
                  {chip.label}
                  <button
                    onClick={chip.onRemove}
                    aria-label={`Remove filter ${chip.label}`}
                    className="hover:bg-primary/20 rounded-full p-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <button
                onClick={clearAllFilters}
                className="text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors ml-1"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Error banner */}
          {pageError && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{pageError}</span>
              <button onClick={() => setPageError(null)} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Auto-match result banner */}
          {matchResult && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <span className="flex-1">
                <span className="font-medium text-green-700 dark:text-green-400">{matchResult.matched}</span> matched out of {matchResult.total_unlinked} unlinked
                {matchResult.skipped_ambiguous > 0 && (
                  <span className="ml-2 text-yellow-600 dark:text-yellow-400 inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {matchResult.skipped_ambiguous} skipped (ambiguous phone)
                  </span>
                )}
              </span>
              <button onClick={() => setMatchResult(null)} className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: lastCountRef.current }).map((_, i) => (
                <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !displayedProspects || displayedProspects.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No prospects found</p>
              <p className="text-xs mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <>
            {/* Mobile card list */}
            <div className="sm:hidden flex-1 min-h-0 overflow-y-auto space-y-2">
              {displayedProspects.map((p) => (
                <ProspectCard
                  key={p.id}
                  prospect={p}
                  selected={selectedIds.has(p.id)}
                  onToggleSelect={() => toggleSelect(p.id)}
                  onOpen={() => setSelectedProspect(p)}
                />
              ))}
              <div className="px-1 pt-2 text-xs text-muted-foreground font-medium">
                {displayedProspects.length} prospect{displayedProspects.length !== 1 ? "s" : ""}
                {prospects && displayedProspects.length !== prospects.length && (
                  <span className="opacity-60"> (of {prospects.length})</span>
                )}
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden sm:flex flex-1 min-h-0 flex-col border-2 border-border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-primary/5 border-b border-border sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="px-2 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === displayedProspects.length && displayedProspects.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded"
                        />
                      </th>
                      {colVisible("id") && <SortTh label="ID" sortKey="primary_student_id" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />}
                      <SortTh label="Name" sortKey="student_name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                      {colVisible("school") && <SortTh label="School" sortKey="school" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />}
                      {colVisible("grade") && <SortTh label="Grade" sortKey="grade" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />}
                      {colVisible("tutor") && <SortTh label="Tutor" sortKey="tutor_name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />}
                      {colVisible("phone") && <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Phone</th>}
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Branch Choice</th>
                      {colVisible("pref") && <th className="px-2 py-2 text-left text-xs font-medium text-foreground" title="Preferred time / tutor notes">Pref</th>}
                      {colVisible("wechat") && <th className="px-2 py-2 text-left text-xs font-medium text-foreground"><span className="inline-flex items-center gap-1"><WeChatIcon className="h-3 w-3 text-green-600" />WeChat</span></th>}
                      {colVisible("remark") && <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Remark</th>}
                      {colVisible("notes") && <th className="px-2 py-2 text-left text-xs font-medium text-foreground" title="Admin contact notes"><span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />Notes</span></th>}
                      <SortTh label="Outreach" sortKey="outreach_status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                      <SortTh label="Status" sortKey="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Linked</th>
                      <SortTh label="Updated" icon={<Clock className="h-3 w-3" />} sortKey="submitted_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {displayedProspects.map((p) => (
                      <ProspectRow
                        key={p.id}
                        p={p}
                        selected={selectedIds.has(p.id)}
                        colVisible={colVisible}
                        onToggleSelect={toggleSelect}
                        onOpen={setSelectedProspect}
                        onInlineUpdate={handleInlineUpdate}
                        onRefresh={refresh}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 border-t border-border bg-primary/5 text-xs text-muted-foreground font-medium">
                {displayedProspects.length} prospect{displayedProspects.length !== 1 ? "s" : ""}
                {prospects && displayedProspects.length !== prospects.length && (
                  <span className="opacity-60"> (of {prospects.length})</span>
                )}
              </div>
            </div>
            </>
          )}
        </div>
      ) : (
        <ProspectDashboard
          stats={stats || []}
          year={year}
          onJumpToList={(patch) => {
            setFilters((f) => ({
              branch: "",
              status: "",
              outreach_status: "",
              wants_summer: "",
              wants_regular: "",
              linked: "",
              search: f.search,
              ...patch,
            }));
            setChoice([]);
            setTab("list");
          }}
        />
      )}
          </div>
        </div>
      </PageTransition>

      {selectedProspect && displayedProspects && (
        <ProspectDetailModal
          prospect={selectedProspect}
          onClose={() => setSelectedProspect(null)}
          onSave={refresh}
          siblings={displayedProspects}
          onNavigate={(next) => setSelectedProspect(next)}
        />
      )}

      {showFilterDrawer && (
        <MobileFilterDrawer
          filters={filters}
          setFilters={setFilters}
          choice={choice}
          setChoice={setChoice}
          choiceCounts={choiceCounts}
          activeFilterCount={activeFilterCount}
          onClearAll={clearAllFilters}
          onClose={() => setShowFilterDrawer(false)}
        />
      )}

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          onBulkOutreach={handleBulkOutreach}
          onBulkStatus={handleBulkStatus}
        />
      )}
    </DeskSurface>
  );
}

// ---- Admin-specific Components ----

type FiltersShape = {
  branch: string;
  status: string;
  outreach_status: string;
  wants_summer: string;
  wants_regular: string;
  linked: string;
  search: string;
};

function FilterSelects({
  filters,
  setFilters,
  className = "",
}: {
  filters: FiltersShape;
  setFilters: React.Dispatch<React.SetStateAction<FiltersShape>>;
  className?: string;
}) {
  return (
    <div className={className}>
      <select value={filters.wants_summer} onChange={(e) => setFilters((f) => ({ ...f, wants_summer: e.target.value }))} className={inputSmall}>
        <option value="">Summer: All</option>
        {INTENTION_OPTIONS.map((i) => (<option key={i} value={i}>{INTENTION_LABELS[i]}</option>))}
      </select>
      <select value={filters.wants_regular} onChange={(e) => setFilters((f) => ({ ...f, wants_regular: e.target.value }))} className={inputSmall}>
        <option value="">Regular: All</option>
        {INTENTION_OPTIONS.map((i) => (<option key={i} value={i}>{INTENTION_LABELS[i]}</option>))}
      </select>
      <select value={filters.outreach_status} onChange={(e) => setFilters((f) => ({ ...f, outreach_status: e.target.value }))} className={inputSmall}>
        <option value="">Outreach: All</option>
        {OUTREACH_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
      </select>
      <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={inputSmall}>
        <option value="">Status: All</option>
        {STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
      </select>
      <select value={filters.linked} onChange={(e) => setFilters((f) => ({ ...f, linked: e.target.value }))} className={inputSmall}>
        <option value="">Linked: All</option>
        <option value="linked">Linked</option>
        <option value="unlinked">Unlinked</option>
      </select>
    </div>
  );
}

function QuickLinkButton({ prospectId, onLinked }: { prospectId: number; onLinked: () => void }) {
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState<number | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const { triggerRef, menuRef, pos } = usePortalPopover(open, close);

  // Lazy + cached + deduped via SWR. Fetches only when the popover opens.
  const { data, error, isLoading } = useSWR(
    open ? ["prospect-matches", prospectId] : null,
    () => prospectsAPI.findMatches(prospectId),
    { revalidateOnFocus: false }
  );
  const matches = data?.matches;

  const handleLink = async (applicationId: number) => {
    setLinking(applicationId);
    setLinkError(null);
    try {
      await prospectsAPI.adminUpdate(prospectId, { summer_application_id: applicationId, status: "Applied" });
      setOpen(false);
      onLinked();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setLinking(null);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Find and link a summer application"
        className="text-[10px] font-medium text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded border border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors"
      >
        + Link
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 w-72 bg-card border border-border rounded-lg shadow-lg p-2"
          style={{ top: pos.top, left: pos.left }}
        >
          {isLoading ? (
            <div className="p-3 text-xs text-muted-foreground text-center">Searching matches…</div>
          ) : error ? (
            <div className="p-2 text-xs text-red-600">{error instanceof Error ? error.message : "Failed to find matches"}</div>
          ) : linkError ? (
            <div className="p-2 text-xs text-red-600">{linkError}</div>
          ) : matches && matches.length > 0 ? (
            <>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-1">
                Potential matches
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {matches.map((m) => (
                  <div key={m.application_id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-primary/5 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{m.student_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {m.reference_code} · {m.contact_phone} · {m.match_type}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLink(m.application_id)}
                      disabled={linking !== null}
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] bg-primary text-white px-2 py-0.5 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <Link2 className="h-2.5 w-2.5" />
                      Link
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="p-3 text-xs text-muted-foreground text-center">No matching applications</div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

function InlineSelect<T extends string>({
  value,
  options,
  onChange,
  renderTrigger,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  renderTrigger: (v: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { triggerRef, menuRef, pos } = usePortalPopover(open, close);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Click to change"
        className="group/edit inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity cursor-pointer"
      >
        {renderTrigger(value)}
        <ChevronDown className="h-3 w-3 text-muted-foreground/50 group-hover/edit:text-muted-foreground transition-colors" />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[140px] bg-card border border-border rounded-lg shadow-lg p-1"
          style={{ top: pos.top, left: pos.left }}
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setOpen(false);
                if (opt !== value) onChange(opt);
              }}
              className={`block w-full text-left text-xs px-2 py-1 rounded hover:bg-primary/10 ${opt === value ? "font-semibold text-primary" : "text-foreground"}`}
            >
              {opt}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function ProspectCard({
  prospect: p,
  selected,
  onToggleSelect,
  onOpen,
}: {
  prospect: PrimaryProspect;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      data-prospect-id={p.id}
      onClick={onOpen}
      className={`border-2 rounded-xl p-3 cursor-pointer transition-colors ${
        selected ? "border-primary bg-primary/[0.05]" : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="rounded mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-semibold text-foreground truncate">{p.student_name}</div>
            <div className="text-[10px] text-muted-foreground shrink-0">
              {p.grade || "—"} · <span className={`px-1 py-0.5 rounded ${BRANCH_INFO[p.source_branch]?.badge || ""}`}>{p.source_branch}</span>
            </div>
          </div>
          {p.school && <div className="text-xs text-muted-foreground truncate">{p.school}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <BranchBadges branches={p.preferred_branches || []} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Summer</span>
            <IntentionBadge value={p.wants_summer} />
            <span className="text-muted-foreground">Reg</span>
            <IntentionBadge value={p.wants_regular} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <OutreachBadge status={p.outreach_status} />
            <ProspectStatusBadge status={p.status} />
            {p.summer_application_id && <Link2 className="h-3.5 w-3.5 text-green-600" />}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {p.submitted_at ? formatTimeAgo(p.submitted_at) : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const ProspectRow = memo(function ProspectRow({
  p,
  selected,
  colVisible,
  onToggleSelect,
  onOpen,
  onInlineUpdate,
  onRefresh,
}: {
  p: PrimaryProspect;
  selected: boolean;
  colVisible: (k: ColKey) => boolean;
  onToggleSelect: (id: number) => void;
  onOpen: (p: PrimaryProspect) => void;
  onInlineUpdate: (id: number, patch: { outreach_status?: ProspectOutreachStatus; status?: ProspectStatus }) => void;
  onRefresh: () => void;
}) {
  return (
    <tr
      data-prospect-id={p.id}
      className={`cursor-pointer transition-colors ${selected ? "bg-primary/10" : "hover:bg-primary/[0.04]"}`}
      onClick={() => onOpen(p)}
    >
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(p.id)}
          className="rounded"
        />
      </td>
      {colVisible("id") && <td className="px-2 py-2 text-xs text-muted-foreground font-mono">{p.primary_student_id || "-"}</td>}
      <td className="px-2 py-2 font-medium text-foreground max-w-[180px]">
        <CopyableCell text={p.student_name} />
      </td>
      {colVisible("school") && <td className="px-2 py-2 text-xs text-muted-foreground max-w-[160px]"><CopyableCell text={p.school || ""} /></td>}
      {colVisible("grade") && <td className="px-2 py-2 text-xs text-muted-foreground">{p.grade || "-"}</td>}
      {colVisible("tutor") && <td className="px-2 py-2 text-xs text-muted-foreground">{p.tutor_name || "-"}</td>}
      {colVisible("phone") && (
        <td className="px-2 py-2 text-xs text-muted-foreground">
          <CopyableCell
            text={p.phone_1 || ""}
            title={[
              p.phone_1 && `${p.phone_1_relation ? p.phone_1_relation + ": " : ""}${p.phone_1}`,
              p.phone_2 && `${p.phone_2_relation ? p.phone_2_relation + ": " : ""}${p.phone_2}`,
            ].filter(Boolean).join("\n") || undefined}
          />
        </td>
      )}
      <td className="px-2 py-2">
        <div className="space-y-0.5">
          <BranchBadges branches={p.preferred_branches || []} />
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground shrink-0">Summer</span>
            <IntentionBadge value={p.wants_summer} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground shrink-0">Regular</span>
            <IntentionBadge value={p.wants_regular} />
          </div>
        </div>
      </td>
      {colVisible("pref") && (
        <td className="px-2 py-2 text-xs text-muted-foreground max-w-[140px]">
          <CopyableCell text={[p.preferred_time_note, p.preferred_tutor_note].filter(Boolean).join(" / ") || ""} />
        </td>
      )}
      {colVisible("wechat") && <td className="px-2 py-2 text-xs text-muted-foreground max-w-[100px]"><CopyableCell text={p.wechat_id || ""} /></td>}
      {colVisible("remark") && <td className="px-2 py-2 text-xs text-muted-foreground max-w-[120px]"><CopyableCell text={p.tutor_remark || ""} /></td>}
      {colVisible("notes") && (
        <td className="px-2 py-2 text-center">
          {p.contact_notes ? (
            <MessageSquare className="h-3 w-3 text-primary/60" title={p.contact_notes} />
          ) : (
            <span className="text-xs text-muted-foreground/30">-</span>
          )}
        </td>
      )}
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <InlineSelect
          value={p.outreach_status}
          options={OUTREACH_OPTIONS}
          onChange={(v) => onInlineUpdate(p.id, { outreach_status: v as ProspectOutreachStatus })}
          renderTrigger={(v) => <OutreachBadge status={v as ProspectOutreachStatus} />}
        />
      </td>
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <InlineSelect
          value={p.status}
          options={STATUS_OPTIONS}
          onChange={(v) => onInlineUpdate(p.id, { status: v as ProspectStatus })}
          renderTrigger={(v) => <ProspectStatusBadge status={v as ProspectStatus} />}
        />
      </td>
      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        {p.summer_application_id ? (
          <a
            href={`/admin/summer/applications?search=${encodeURIComponent(p.matched_application_ref || "")}`}
            target="_blank"
            rel="noopener noreferrer"
            title={p.matched_application_ref || "Linked"}
            className="inline-flex"
          >
            <Link2 className="h-3.5 w-3.5 text-green-600 hover:text-green-700" />
          </a>
        ) : (
          <QuickLinkButton prospectId={p.id} onLinked={onRefresh} />
        )}
      </td>
      <td
        className="px-2 py-2 text-[10px] text-muted-foreground"
        title={[
          p.submitted_at && `Submitted: ${parseHKTimestamp(p.submitted_at).toLocaleString()}`,
          wasEdited(p.submitted_at, p.updated_at) && `Edited: ${parseHKTimestamp(p.updated_at!).toLocaleString()}`,
        ].filter(Boolean).join(" · ") || undefined}
      >
        {p.submitted_at ? formatTimeAgo(p.submitted_at) : "-"}
        {wasEdited(p.submitted_at, p.updated_at) && (
          <Pencil className="h-3 w-3 inline ml-0.5 text-muted-foreground/70" />
        )}
      </td>
    </tr>
  );
});

function SortTh({
  label,
  icon,
  sortKey,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  icon?: React.ReactNode;
  sortKey: SortKey;
  sortBy: SortKey;
  sortOrder: SortOrder;
  onSort: (key: SortKey) => void;
}) {
  const active = sortBy === sortKey;
  return (
    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition-colors ${active ? "text-primary" : "hover:text-primary"}`}
        aria-label={`Sort by ${label || sortKey}`}
      >
        {icon}
        {label}
        {active ? (
          sortOrder === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );
}

function HeaderBar({
  year,
  availableYears,
  onYearChange,
  autoMatching,
  confirmCountdown,
  onAutoMatch,
  tab,
  onTabChange,
}: {
  year: number | null;
  availableYears: number[];
  onYearChange: (y: number) => void;
  autoMatching: boolean;
  confirmCountdown: number;
  onAutoMatch: () => void;
  tab: "list" | "dashboard";
  onTabChange: (t: "list" | "dashboard") => void;
}) {
  const confirming = confirmCountdown > 0;
  return (
    <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
          <GraduationCap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-foreground inline-flex items-center gap-1.5">
            P6 Prospects
            <a href="/summer/prospect" target="_blank" rel="noopener noreferrer" title="Open public prospect page" className="text-muted-foreground hover:text-primary transition-colors">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </h1>
          <p className="hidden sm:block text-xs text-muted-foreground">Track and manage P6 student feeder list</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <label className="inline-flex items-center gap-1.5 text-sm">
            <span className="hidden sm:inline text-xs text-muted-foreground">Year</span>
            <select
              value={year ?? ""}
              onChange={(e) => onYearChange(Number(e.target.value))}
              aria-label="Year"
              className="px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <button
            onClick={onAutoMatch}
            disabled={autoMatching}
            title="Scan unlinked prospects and link each one to a summer application that matches by phone number. Skips ambiguous matches."
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
              confirming
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            {autoMatching ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-primary/30 border-t-primary" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">
              {autoMatching
                ? "Matching..."
                : confirming
                  ? `Link unlinked prospects? Click again (${confirmCountdown})`
                  : "Auto-Match"}
            </span>
            {confirming && (
              <span className="sm:hidden text-xs font-bold tabular-nums">{confirmCountdown}</span>
            )}
          </button>
          <div className="flex bg-muted rounded-full p-0.5">
            <button
              onClick={() => onTabChange("list")}
              aria-label="List view"
              className={`px-2 sm:px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 inline-flex items-center gap-1 ${
                tab === "list"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListIcon className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => onTabChange("dashboard")}
              aria-label="Dashboard view"
              className={`px-2 sm:px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 inline-flex items-center gap-1 ${
                tab === "dashboard"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileFilterDrawer({
  filters,
  setFilters,
  choice,
  setChoice,
  choiceCounts,
  activeFilterCount,
  onClearAll,
  onClose,
}: {
  filters: FiltersShape;
  setFilters: React.Dispatch<React.SetStateAction<FiltersShape>>;
  choice: string[];
  setChoice: React.Dispatch<React.SetStateAction<string[]>>;
  choiceCounts: Record<string, number>;
  activeFilterCount: number;
  onClearAll: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sm:hidden fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mt-auto bg-card rounded-t-2xl shadow-2xl border-t border-border max-h-[85vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:bg-primary/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Branch Choice</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {SECONDARY_BRANCHES.map((b) => {
                const active = choice.includes(b);
                const count = choiceCounts[b] ?? 0;
                const badge = BRANCH_COLORS[b]?.badge || "bg-primary text-white";
                return (
                  <button
                    key={b}
                    onClick={() =>
                      setChoice((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]))
                    }
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                      active
                        ? `${badge} ring-2 ring-current shadow-sm`
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    {b}
                    <span className="ml-1 opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <FilterSelects filters={filters} setFilters={setFilters} className="grid grid-cols-2 gap-2" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card">
          <span className="text-xs text-muted-foreground">{activeFilterCount} active</span>
          <button
            onClick={onClearAll}
            disabled={activeFilterCount === 0}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-border text-foreground hover:border-primary/50 disabled:opacity-50 transition-colors"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkActionBar({
  count,
  onClear,
  onBulkOutreach,
  onBulkStatus,
}: {
  count: number;
  onClear: () => void;
  onBulkOutreach: (status: ProspectOutreachStatus) => void;
  onBulkStatus: (status: ProspectStatus) => void;
}) {
  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 animate-slide-up max-w-[95vw] sm:max-w-[680px]">
      <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{count} selected</span>
          <span className="text-xs text-muted-foreground">|</span>
          <span className="text-xs text-muted-foreground shrink-0">Outreach:</span>
          {OUTREACH_OPTIONS.map((o) => {
            const label = o.startsWith("WeChat - ") ? o.replace("WeChat - ", "") : o;
            const showWeChatIcon = o.startsWith("WeChat");
            return (
              <button
                key={o}
                onClick={() => onBulkOutreach(o)}
                className={`text-xs px-2 py-0.5 rounded-full font-medium hover:opacity-80 transition-opacity inline-flex items-center gap-1 ${OUTREACH_BADGE_COLORS[o] || "bg-gray-100"}`}
                title={OUTREACH_STATUS_HINTS[o]}
              >
                {showWeChatIcon && <WeChatIcon className="h-3 w-3" />}
                {label}
              </button>
            );
          })}
          <button onClick={onClear} className="p-1 text-muted-foreground hover:text-foreground ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border">
          <span className="text-xs text-muted-foreground shrink-0">Status:</span>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onBulkStatus(s)}
              className={`text-xs px-2 py-0.5 rounded-full font-medium hover:opacity-80 transition-opacity ${STATUS_BADGE_COLORS[s] || "bg-gray-100"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

