"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import {
  ClipboardList, Search, X, Loader2, ChevronDown, Check,
  ArrowUpNarrowWide, ArrowDownNarrowWide, ExternalLink,
  RefreshCw, CheckSquare, SlidersHorizontal, Sparkles, LayoutList, LayoutGrid, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR, { mutate } from "swr";
import { List, type RowComponentProps, useListRef, useDynamicRowHeight } from "react-window";
import { summerAPI } from "@/lib/api";
import { SummerApplicationCard, STATUS_COLORS, ALL_STATUSES } from "@/components/admin/SummerApplicationCard";
import { SummerApplicationStats } from "@/components/admin/SummerApplicationStats";
import { SummerApplicationDetailModal } from "@/components/admin/SummerApplicationDetailModal";
import { ApplicationLinkSuggestionsModal } from "@/components/admin/ApplicationLinkSuggestionsModal";
import { SummerBuddyBoard } from "@/components/admin/SummerBuddyBoard";
import { computeDiscountsForAll } from "@/lib/summer-discounts";
import { ProspectDetailModal } from "@/components/summer/prospect-detail-modal";
import { prospectsAPI } from "@/lib/api";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { displayLocation, LOCATION_TO_CODE, MIN_GROUP_SIZE, isPlaced, EXIT_STATUSES } from "@/lib/summer-utils";
import { allPrefSlots } from "@/lib/summer-preferences";
import { useLocation } from "@/contexts/LocationContext";
import { formatTimeAgo } from "@/lib/formatters";
import type { SummerApplication } from "@/types";

const CODE_TO_LOCATION = Object.fromEntries(
  Object.entries(LOCATION_TO_CODE).map(([k, v]) => [v, k])
);

// Resolve the branch an application belongs to, in priority order:
// confirmed link first (secondary student, then primary prospect), then the
// applicant's own claim. Returns null for "new" applicants with no signal.
function getAppBranchCode(a: SummerApplication): string | null {
  return (
    a.linked_student?.home_location ||
    a.linked_prospect?.source_branch ||
    a.claimed_branch_code ||
    null
  );
}

const PIPELINE_STATUSES = [
  "Submitted", "Under Review", "Placement Offered", "Placement Confirmed",
  "Fee Sent", "Paid", "Enrolled",
];
const EXIT_STATUSES_LIST = [...EXIT_STATUSES];
const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  ALL_STATUSES.map((s, i) => [s, i])
);

type ViewPreset = "latest" | "pipeline" | "by_location" | "by_grade" | "by_time_slot";

const VIEW_PRESET_CONFIG: Record<ViewPreset, {
  label: string;
  groupBy: null | "status" | "location" | "grade" | "time_slot";
  sortField: "submitted" | "name" | "status" | "grade" | "location" | "time_slot";
  defaultDirection: "asc" | "desc";
}> = {
  latest:       { label: "Submitted",    groupBy: null,       sortField: "submitted",  defaultDirection: "desc" },
  pipeline:     { label: "Pipeline",     groupBy: "status",   sortField: "status",     defaultDirection: "asc" },
  by_location:  { label: "By Location",  groupBy: "location", sortField: "name",       defaultDirection: "asc" },
  by_grade:     { label: "By Grade",     groupBy: "grade",    sortField: "name",       defaultDirection: "asc" },
  by_time_slot: { label: "By Time Slot", groupBy: "time_slot", sortField: "time_slot", defaultDirection: "asc" },
};

const ALL_PRESETS: ViewPreset[] = ["latest", "pipeline", "by_location", "by_grade", "by_time_slot"];

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

const selectClass = "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

// Inline dropdown with click-outside + escape handling. The menu is portalled
// to document.body so it escapes any overflow-hidden ancestors (the paper
// card), and its position is computed from the trigger's bounding rect and
// clamped to the viewport so it never overflows on narrow screens.
type DropdownTriggerProps = {
  onClick: () => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
};
function DropdownMenu({
  trigger,
  children,
  align = "left",
  menuClassName,
}: {
  trigger: (ctx: { open: boolean; triggerProps: DropdownTriggerProps }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // `left` is always the final clamped x-coordinate. We use left-only
  // positioning (no `right`) so the menu can never escape the viewport
  // regardless of whether align is "left" or "right".
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const compute = () => {
      const rect = wrapperRef.current!.getBoundingClientRect();
      // Fall back to 220 on the first pass before the menu is in the DOM;
      // the rAF pass below corrects once the real width is measured.
      const menuWidth = menuRef.current?.offsetWidth ?? 220;
      const preferred = align === "right" ? rect.right - menuWidth : rect.left;
      const maxLeft = window.innerWidth - menuWidth - 8;
      const left = Math.max(8, Math.min(preferred, maxLeft));
      setPos({ top: rect.bottom + 6, left });
    };
    compute();
    const raf = requestAnimationFrame(compute);
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const triggerProps: DropdownTriggerProps = {
    onClick: () => setOpen((o) => !o),
    "aria-haspopup": "menu",
    "aria-expanded": open,
  };

  return (
    <>
      <span ref={wrapperRef} className="inline-flex">
        {trigger({ open, triggerProps })}
      </span>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            top: `${pos.top}px`,
            left: `${pos.left}px`,
            maxWidth: "calc(100vw - 1rem)",
          }}
          className={cn(
            "z-[60] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[180px]",
            menuClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  );
}

const menuItemClass = "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors";

/** Self-ticking "Updated X ago" label. Keeps its own 30s interval so the
 *  parent page doesn't re-render just to update a timestamp string. */
function TimeAgo({ timestamp }: { timestamp: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="hidden md:inline text-[11px] text-muted-foreground tabular-nums"
      title={new Date(timestamp).toLocaleString()}
    >
      Updated {formatTimeAgo(new Date(timestamp).toISOString())}
    </span>
  );
}

// Row heights are measured per-row so wrapping preference chips
// (2× slots + alts on mobile) don't overlap the next card.
const VIRTUAL_ROW_HEIGHT = 112;
const VIRTUALIZE_THRESHOLD = 50;
const ROW_GUTTER_PX = 8;

interface VirtualAppRowProps {
  applications: SummerApplication[];
  selectedIndex: number | null;
  checkedIds: Set<number>;
  showCheckboxes: boolean;
  onSelect: (app: SummerApplication) => void;
  onToggleCheck: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onProspectClick: (prospectId: number) => void;
  totalLessons?: number;
  setRowHeight: (index: number, size: number) => void;
}

function VirtualAppRow({
  index,
  style,
  applications,
  selectedIndex,
  checkedIds,
  showCheckboxes,
  onSelect,
  onToggleCheck,
  onStatusChange,
  onProspectClick,
  totalLessons,
  setRowHeight,
}: RowComponentProps<VirtualAppRowProps>) {
  const app = applications[index];
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const report = () => setRowHeight(index, el.offsetHeight + ROW_GUTTER_PX);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [index, setRowHeight]);

  return (
    <div style={{ ...style, paddingBottom: ROW_GUTTER_PX }}>
      <div ref={innerRef}>
        <SummerApplicationCard
          application={app}
          index={index}
          isFocused={selectedIndex === index}
          onSelect={onSelect}
          isChecked={checkedIds.has(app.id)}
          onToggleCheck={onToggleCheck}
          showCheckbox={showCheckboxes}
          onStatusChange={onStatusChange}
          onProspectClick={onProspectClick}
          totalLessons={totalLessons}
        />
      </div>
    </div>
  );
}

export default function SummerApplicationsPage() {
  usePageTitle("Summer Applications");
  const { isAdmin, isSuperAdmin } = useAuth();
  const { showToast } = useToast();
  const { selectedLocation } = useLocation();
  const canViewAdminPages = isAdmin || isSuperAdmin;
  const readOnly = !isAdmin && !isSuperAdmin;

  // URL state (read once on mount for initial values)
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlInit = useRef({
    status: searchParams.get("status"),
    grade: searchParams.get("grade"),
    location: searchParams.get("location"),
    q: searchParams.get("q") || "",
    pending: searchParams.get("pending") === "1",
    claim: searchParams.get("claim") === "1" || searchParams.get("unverified") === "1",
    branch: searchParams.get("branch"),
    placement: searchParams.get("placement") as "placed" | "unplaced" | null,
    buddy: searchParams.get("buddy") as "solo" | "grouped" | "threshold" | "below" | null,
    view: (searchParams.get("view") as ViewPreset | null),
    dir: (searchParams.get("dir") as "asc" | "desc" | null),
    legacyBuddyView: searchParams.get("view") === "by_buddy",
    mode: (searchParams.get("mode") as "list" | "board" | "stats" | null),
  }).current;

  // Config selector
  const [configId, setConfigId] = useState<number | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string | null>(urlInit.status);
  const [gradeFilter, setGradeFilter] = useState<string | null>(urlInit.grade);
  const [locationFilter, setLocationFilter] = useState<string | null>(urlInit.location);
  const [pendingSiblingOnly, setPendingSiblingOnly] = useState(urlInit.pending);
  const [unverifiedBranchOnly, setUnverifiedBranchOnly] = useState(urlInit.claim);
  // Branch scope: null = all, "new" = no link/claim, or a branch code (MAC…).
  const [branchFilter, setBranchFilter] = useState<string | null>(urlInit.branch);
  const [placementFilter, setPlacementFilter] = useState<"placed" | "unplaced" | null>(urlInit.placement);
  const [buddyFilter, setBuddyFilter] = useState<"solo" | "grouped" | "threshold" | "below" | null>(urlInit.buddy);
  const [searchQuery, setSearchQuery] = useState(urlInit.q);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // View preset (replaces separate sort + group controls)
  const initialPreset: ViewPreset = urlInit.view && ALL_PRESETS.includes(urlInit.view) ? urlInit.view : "latest";
  const [viewPreset, setViewPreset] = useState<ViewPreset>(initialPreset);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(
    urlInit.dir ?? VIEW_PRESET_CONFIG[initialPreset].defaultDirection
  );
  const presetConfig = VIEW_PRESET_CONFIG[viewPreset];
  const sortField = presetConfig.sortField;
  const groupBy = presetConfig.groupBy;

  // Board vs list view mode. Legacy `?view=by_buddy` migrates to mode=board.
  const [viewMode, setViewMode] = useState<"list" | "board" | "stats">(
    urlInit.mode === "board" || urlInit.legacyBuddyView ? "board" : urlInit.mode === "stats" ? "stats" : "list",
  );

  // UI state
  // Single index for both card focus highlight and modal prev/next navigation.
  // Card list and modal are never visible simultaneously, so one state suffices.
  const [selectedAppIndex, setSelectedAppIndex] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [batchStatus, setBatchStatus] = useState("Under Review");
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [linkSuggestionsOpen, setLinkSuggestionsOpen] = useState(false);

  // Data freshness
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Keyboard nav
  const selectedIndex = selectedAppIndex;
  const [showShortcutHints, setShowShortcutHints] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useListRef(null);
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: VIRTUAL_ROW_HEIGHT });
  const [listHeight, setListHeight] = useState(600);
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

  // Apply filters everywhere — so the stats chips reflect what the list shows.
  // Note: statusFilter is applied client-side for the chip strip so it still
  // shows per-status counts; grade/location/search/pending go to both.
  const statsFilterParams = useMemo(
    () => ({
      config_id: configId ?? undefined,
      grade: gradeFilter || undefined,
      location: locationFilter || undefined,
      search: debouncedSearch || undefined,
    }),
    [configId, gradeFilter, locationFilter, debouncedSearch]
  );

  // Fetch stats — keyed off everything that affects the numbers.
  const statsKey = configId
    ? ["summer-app-stats", configId, gradeFilter, locationFilter, debouncedSearch]
    : null;
  const { data: stats } = useSWR(
    statsKey,
    () => summerAPI.getApplicationStats(statsFilterParams)
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
    {
      refreshInterval: 60000,
      onSuccess: () => setLastUpdated(Date.now()),
    }
  );

  // Refresh handler
  const handleRefresh = useCallback(() => {
    if (swrKey) mutate(swrKey);
    if (statsKey) mutate(statsKey);
  }, [swrKey, statsKey]);

  const searchRef = useRef<HTMLInputElement>(null);

  // Batch selection — batch mode is either explicitly toggled or implicit when
  // the user has checked at least one row via the hover checkbox.
  const showCheckboxes = batchMode || checkedIds.size > 0;
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

  // Prospect preview — opened inline from the card's linked-prospect chip
  const [previewProspectId, setPreviewProspectId] = useState<number | null>(null);
  const { data: previewProspect } = useSWR(
    previewProspectId ? ["prospect-preview", previewProspectId] : null,
    () => prospectsAPI.adminGet(previewProspectId!)
  );
  const handleProspectClick = useCallback((prospectId: number) => {
    setPreviewProspectId(prospectId);
  }, []);

  // Inline single-row status change from the card
  const handleStatusChange = useCallback(async (id: number, status: string) => {
    try {
      await summerAPI.updateApplication(id, { application_status: status });
      handleRefresh();
    } catch {
      showToast("Status update failed", "error");
    }
  }, [handleRefresh, showToast]);

  // Filters active?
  const hasFilters = statusFilter || gradeFilter || locationFilter || debouncedSearch || pendingSiblingOnly || unverifiedBranchOnly || branchFilter || placementFilter || buddyFilter;
  // Count of filters that live in the "More" menu.
  // Location lives in the header scope, status has its own dropdown, search is visible.
  const moreFilterCount = [
    gradeFilter,
    branchFilter,
    pendingSiblingOnly ? "pending-sibling" : null,
    unverifiedBranchOnly ? "unverified-branch" : null,
    placementFilter,
    buddyFilter,
  ].filter(Boolean).length;
  const clearFilters = useCallback(() => {
    setStatusFilter(null);
    setGradeFilter(null);
    setLocationFilter(null);
    setSearchQuery("");
    setPendingSiblingOnly(false);
    setUnverifiedBranchOnly(false);
    setBranchFilter(null);
    setPlacementFilter(null);
    setBuddyFilter(null);
  }, []);

  // Sync state → URL (replace, not push)
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (gradeFilter) params.set("grade", gradeFilter);
    if (locationFilter) params.set("location", locationFilter);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (pendingSiblingOnly) params.set("pending", "1");
    if (unverifiedBranchOnly) params.set("unverified", "1");
    if (branchFilter) params.set("branch", branchFilter);
    if (placementFilter) params.set("placement", placementFilter);
    if (buddyFilter) params.set("buddy", buddyFilter);
    if (viewMode !== "list") params.set("mode", viewMode);
    if (viewPreset !== "latest" && viewMode !== "board") params.set("view", viewPreset);
    if (sortDirection !== VIEW_PRESET_CONFIG[viewPreset].defaultDirection && viewMode !== "board") params.set("dir", sortDirection);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [statusFilter, gradeFilter, locationFilter, debouncedSearch, pendingSiblingOnly, unverifiedBranchOnly, branchFilter, placementFilter, buddyFilter, viewPreset, sortDirection, viewMode, router]);

  // Grade options from stats (stats is scoped by location, which is fine here).
  const gradeOptions = useMemo(() => Object.keys(stats?.by_grade || {}).sort(), [stats]);
  // Only codes that actually appear in the current applications, so the
  // dropdown never shows empty branches.
  const branchOptions = useMemo(() => {
    if (!applications) return [];
    const seen = new Set<string>();
    for (const a of applications) {
      const code = getAppBranchCode(a);
      if (code) seen.add(code);
    }
    return [...seen].sort();
  }, [applications]);
  // Location options come from the active config — not from stats — so that
  // picking one location does not remove the others from the dropdown.
  const activeConfig = configs?.find((c) => c.id === configId);
  // Discount eligibility per application. Computed once per data load off
  // the full applications list — the group-reach calculation needs all
  // members, not just the filtered view, so we can't use sortedApplications.
  const discountByAppId = useMemo(
    () => activeConfig
      ? computeDiscountsForAll(applications ?? [], activeConfig.pricing_config)
      : new Map(),
    [applications, activeConfig],
  );
  const locationOptions = useMemo(
    () => (activeConfig?.locations ?? [])
      .map((l) => l.name)
      .sort((a, b) => displayLocation(a).localeCompare(displayLocation(b))),
    [activeConfig]
  );

  // Default the location filter to the user's app-wide setting. Tracks changes
  // to that setting until the user explicitly picks a location on this page
  // (or arrived with a ?location= URL param), at which point we stop syncing.
  const locationUserOverride = useRef(!!urlInit.location);
  useEffect(() => {
    if (locationUserOverride.current || locationOptions.length === 0) return;
    if (!selectedLocation || selectedLocation === "All Locations") {
      if (locationFilter !== null) setLocationFilter(null);
      return;
    }
    const chineseName = CODE_TO_LOCATION[selectedLocation];
    if (chineseName && locationOptions.includes(chineseName) && locationFilter !== chineseName) {
      setLocationFilter(chineseName);
    }
  }, [locationOptions, selectedLocation, locationFilter]);

  // Client-side sorting
  const sortedApplications = useMemo(() => {
    if (!applications) return [];
    let filtered = applications;
    if (pendingSiblingOnly) {
      filtered = filtered.filter((a) => (a.pending_sibling_count ?? 0) > 0);
    }
    if (unverifiedBranchOnly) {
      filtered = filtered.filter((a) => !a.verified_branch_origin);
    }
    if (branchFilter) {
      filtered = filtered.filter((a) => {
        if (branchFilter === "new") return getAppBranchCode(a) === null;
        return (a.verified_branch_origin || getAppBranchCode(a)) === branchFilter;
      });
    }
    if (placementFilter) {
      filtered = filtered.filter((a) => {
        return placementFilter === "placed" ? isPlaced(a) : !isPlaced(a);
      });
    }
    if (buddyFilter) {
      filtered = filtered.filter((a) => {
        const hasGroup = !!a.buddy_group_id;
        const size = a.buddy_group_member_count ?? 0;
        switch (buddyFilter) {
          case "solo": return !hasGroup;
          case "grouped": return hasGroup;
          case "threshold": return hasGroup && size >= MIN_GROUP_SIZE;
          case "below": return hasGroup && size < MIN_GROUP_SIZE;
          default: return true;
        }
      });
    }
    const sorted = [...filtered];
    const dir = sortDirection === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      switch (sortField) {
        case "name":
          return dir * (a.student_name || "").localeCompare(b.student_name || "");
        case "status":
          return dir * ((STATUS_ORDER[a.application_status] ?? 99) - (STATUS_ORDER[b.application_status] ?? 99));
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
  }, [applications, sortField, sortDirection, pendingSiblingOnly, unverifiedBranchOnly, branchFilter, placementFilter, buddyFilter]);

  // Member-level filter for the board view. Status/location/grade/search are
  // already applied server-side (they drive the SWR key), so this only needs
  // to enforce the two client-side filters.
  const buddyBoardPredicate = useCallback((a: SummerApplication) => {
    if (pendingSiblingOnly && (a.pending_sibling_count ?? 0) === 0) return false;
    if (unverifiedBranchOnly && !!a.verified_branch_origin) return false;
    if (branchFilter) {
      if (branchFilter === "new") {
        if (getAppBranchCode(a) !== null) return false;
      } else {
        if ((a.verified_branch_origin || getAppBranchCode(a)) !== branchFilter) return false;
      }
    }
    if (placementFilter) {
      if (placementFilter === "placed" ? !isPlaced(a) : isPlaced(a)) return false;
    }
    if (buddyFilter) {
      const hasGroup = !!a.buddy_group_id;
      const size = a.buddy_group_member_count ?? 0;
      if (buddyFilter === "solo" && hasGroup) return false;
      if (buddyFilter === "grouped" && !hasGroup) return false;
      if (buddyFilter === "threshold" && !(hasGroup && size >= MIN_GROUP_SIZE)) return false;
      if (buddyFilter === "below" && !(hasGroup && size < MIN_GROUP_SIZE)) return false;
    }
    return true;
  }, [pendingSiblingOnly, unverifiedBranchOnly, branchFilter, placementFilter, buddyFilter]);

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
      for (const s of [...PIPELINE_STATUSES, ...EXIT_STATUSES_LIST]) {
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
      for (const s of allPrefSlots(app)) {
        const key = `${s.day} ${s.time}`;
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
          setSelectedAppIndex((prev) => {
            const next = (prev ?? -1) + 1;
            return Math.min(next, navigableItems.length - 1);
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedAppIndex((prev) => {
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
          setSelectedAppIndex(null);
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
    setSelectedAppIndex(null);
  }, [viewPreset, sortDirection, statusFilter, gradeFilter, locationFilter, debouncedSearch, pendingSiblingOnly, unverifiedBranchOnly, branchFilter, placementFilter, buddyFilter, collapsedGroups]);

  // Scroll focused card into view. In virtualized mode the row may not be in
  // the DOM, so fall back to the list's imperative scrollToRow.
  useEffect(() => {
    if (selectedIndex === null) return;
    const element = document.querySelector(`[data-app-index="${selectedIndex}"]`);
    const container = scrollContainerRef.current;
    if (!element) {
      listRef.current?.scrollToRow({ index: selectedIndex, behavior: "smooth", align: "auto" });
      return;
    }
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const cardRect = element.getBoundingClientRect();
    if (cardRect.bottom > containerRect.bottom - 20) {
      element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else if (cardRect.top < containerRect.top + 20) {
      element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex, listRef]);

  // Measure list container height so react-window can size its viewport.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => setListHeight(Math.max(200, el.clientHeight));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <div className="w-9 h-9 shrink-0 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                  <ClipboardList className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-1.5 min-w-0">
                    <span className="truncate">Summer Applications</span>
                    <a href="/summer/apply" target="_blank" rel="noopener noreferrer" title="Open application form" className="shrink-0 text-muted-foreground hover:text-primary transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {readOnly && <span className="shrink-0 text-[10px] font-normal text-amber-600">(Read-only)</span>}
                  </h1>
                  <p className="hidden sm:block text-xs text-muted-foreground">
                    Review and process summer course applications
                  </p>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  {lastUpdated && (
                    <TimeAgo timestamp={lastUpdated} />
                  )}
                  <button
                    onClick={handleRefresh}
                    disabled={isValidating}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                    title="Refresh"
                    aria-label="Refresh applications"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} />
                  </button>
                  {!readOnly && (
                    <button
                      onClick={() => setLinkSuggestionsOpen(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                      title="Preview which unlinked applications can be matched to prospects or existing students"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Link suggestions</span>
                    </button>
                  )}
                  {locationOptions.length > 0 && (
                    <select
                      value={locationFilter || ""}
                      onChange={(e) => {
                        locationUserOverride.current = true;
                        setLocationFilter(e.target.value || null);
                      }}
                      className="px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm border border-border rounded-lg bg-card text-foreground"
                      title="Filter by location"
                    >
                      <option value="">All</option>
                      {locationOptions.map((l) => (
                        <option key={l} value={l}>{displayLocation(l)}</option>
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

            <div className="px-4 sm:px-6 py-2.5 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
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
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <DropdownMenu
                  menuClassName="min-w-[220px]"
                  trigger={({ open, triggerProps }) => {
                    const colors = statusFilter ? STATUS_COLORS[statusFilter] : null;
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
                      const colors = isAll ? null : STATUS_COLORS[s!];
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
                        <span className="font-semibold text-foreground tabular-nums">{navigableItems.length}</span>
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

                {placementFilter && (
                  <button
                    type="button"
                    onClick={() => setPlacementFilter(null)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    {placementFilter === "placed" ? "Placed" : "Unplaced"}
                    <X className="h-3 w-3" />
                  </button>
                )}
                {buddyFilter && (
                  <button
                    type="button"
                    onClick={() => setBuddyFilter(null)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                  >
                    {{ solo: "Solo", grouped: "Grouped", threshold: "At threshold", below: "Below threshold" }[buddyFilter]}
                    <X className="h-3 w-3" />
                  </button>
                )}

                <div className="flex-1" />

                {viewMode === "list" && (
                <DropdownMenu
                  align="right"
                  menuClassName="min-w-[220px]"
                  trigger={({ open, triggerProps }) => (
                    <button
                      type="button"
                      {...triggerProps}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg border font-medium transition-colors",
                        "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-foreground hover:bg-amber-100/70 dark:hover:bg-amber-900/30",
                        open && "ring-1 ring-amber-400/40",
                      )}
                      title="Grouping and sort"
                    >
                      <span>{VIEW_PRESET_CONFIG[viewPreset].label}</span>
                      {sortDirection === "asc"
                        ? <ArrowUpNarrowWide className="h-3.5 w-3.5 opacity-70" />
                        : <ArrowDownNarrowWide className="h-3.5 w-3.5 opacity-70" />}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Group by
                      </div>
                      {ALL_PRESETS.map((p) => {
                        const active = viewPreset === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            role="menuitemradio"
                            aria-checked={active}
                            onClick={() => { handlePresetChange(p); close(); }}
                            className={cn(menuItemClass, active && "bg-primary/5")}
                          >
                            <span className="flex-1 text-foreground">
                              {VIEW_PRESET_CONFIG[p].label}
                            </span>
                            {active && <Check className="h-3 w-3 text-primary" />}
                          </button>
                        );
                      })}
                      <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setSortDirection((d) => d === "asc" ? "desc" : "asc")}
                        className={menuItemClass}
                      >
                        {sortDirection === "asc"
                          ? <ArrowUpNarrowWide className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ArrowDownNarrowWide className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="flex-1 text-foreground">{getDirectionLabel(viewPreset, sortDirection)}</span>
                      </button>
                    </>
                  )}
                </DropdownMenu>
                )}

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
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Branch origin</label>
                        <select
                          value={branchFilter || ""}
                          onChange={(e) => setBranchFilter(e.target.value || null)}
                          className={cn(selectClass, "w-full")}
                        >
                          <option value="">All branches</option>
                          <option value="new">New (no branch)</option>
                          {branchOptions.map((code) => (
                            <option key={code} value={code}>{code}</option>
                          ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pendingSiblingOnly}
                          onChange={(e) => setPendingSiblingOnly(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-xs text-foreground">Pending sibling verification</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={unverifiedBranchOnly}
                          onChange={(e) => setUnverifiedBranchOnly(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-xs text-foreground">Unverified branch origin</span>
                      </label>
                      {moreFilterCount > 0 && (
                        <button
                          onClick={() => { setGradeFilter(null); setBranchFilter(null); setPendingSiblingOnly(false); setUnverifiedBranchOnly(false); }}
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
                    onClick={() => setViewMode("board")}
                    title="Buddy board"
                    aria-label="Buddy board"
                    aria-pressed={viewMode === "board"}
                    className={cn(
                      "px-2 py-1.5 transition-colors border-l border-gray-200 dark:border-gray-700",
                      viewMode === "board"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800",
                    )}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
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
              ) : viewMode === "stats" ? (
                <SummerApplicationStats
                  applications={applications ?? []}
                  filters={{
                    onStatusFilter: (status) => { setStatusFilter(status); setViewMode("list"); },
                    onGradeFilter: (grade) => { setGradeFilter(grade); setViewMode("list"); },
                    onBranchFilter: (branch) => { setBranchFilter(branch); setViewMode("list"); },
                    onUnverifiedFilter: () => { setUnverifiedBranchOnly(true); setViewMode("list"); },
                    onLocationFilter: (code) => { locationUserOverride.current = true; setLocationFilter(CODE_TO_LOCATION[code] || code); setViewMode("list"); },
                    onPlacementFilter: (v) => { setPlacementFilter(v); setViewMode("list"); },
                    onBuddyFilter: (v) => { setBuddyFilter(v); setViewMode("list"); },
                  }}
                />
              ) : viewMode === "board" ? (
                <SummerBuddyBoard
                  applications={applications}
                  config={activeConfig}
                  discountByAppId={discountByAppId}
                  memberPredicate={buddyBoardPredicate}
                  onSelectApp={openDetail}
                />
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
                        colorTheme={
                          groupBy === "status" ? (STATUS_GROUP_COLORS[groupKey] || "gray")
                          : "gray"
                        }
                        annotation={
                          groupBy === "time_slot" && demandMap?.has(groupKey) && demandMap.get(groupKey) !== groupApps.length
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
                              onStatusChange={handleStatusChange}
                              onProspectClick={handleProspectClick}
                              totalLessons={activeConfig?.total_lessons}
                            />
                          );
                        })}
                      </CollapsibleSection>
                    );
                  })}
                </div>
              ) : sortedApplications.length > VIRTUALIZE_THRESHOLD ? (
                <List<VirtualAppRowProps>
                  listRef={listRef}
                  rowCount={sortedApplications.length}
                  rowHeight={dynamicRowHeight}
                  rowComponent={VirtualAppRow}
                  rowProps={{
                    applications: sortedApplications,
                    selectedIndex,
                    checkedIds,
                    showCheckboxes,
                    onSelect: openDetail,
                    onToggleCheck: toggleCheck,
                    onStatusChange: handleStatusChange,
                    onProspectClick: handleProspectClick,
                    totalLessons: activeConfig?.total_lessons,
                    setRowHeight: dynamicRowHeight.setRowHeight,
                  }}
                  defaultHeight={listHeight}
                  style={{ height: listHeight }}
                />
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
                      onStatusChange={handleStatusChange}
                      onProspectClick={handleProspectClick}
                      totalLessons={activeConfig?.total_lessons}
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
            locations={activeConfig?.locations}
            allApplications={applications}
            onSelectApplication={openDetail}
            discount={selectedApp ? discountByAppId.get(selectedApp.id) ?? null : null}
            baseFee={activeConfig?.pricing_config?.base_fee}
            config={activeConfig ?? null}
          />

          {previewProspectId && previewProspect && (
            <ProspectDetailModal
              prospect={previewProspect}
              onClose={() => setPreviewProspectId(null)}
              onSave={() => {
                mutate(["prospect-preview", previewProspect.id]);
                handleRefresh();
              }}
            />
          )}

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
      <ApplicationLinkSuggestionsModal
        isOpen={linkSuggestionsOpen}
        onClose={() => setLinkSuggestionsOpen(false)}
        year={activeConfig?.year ?? null}
        configId={configId}
        onDone={handleRefresh}
      />
    </DeskSurface>
  );
}
