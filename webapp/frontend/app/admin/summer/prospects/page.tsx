"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  Sparkles,
  Link2,
  Phone,
  School,
  User,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  X,
  Clock,
} from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { prospectsAPI, summerAPI } from "@/lib/api";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import {
  IntentionBadge,
  OutreachBadge,
  BranchBadges,
  CopyableCell,
  INTENTION_LABELS,
} from "@/components/summer/prospect-badges";
import type {
  PrimaryProspect,
  PrimaryProspectStats,
  ProspectOutreachStatus,
  ProspectStatus,
  ProspectIntention,
} from "@/types";
import {
  PROSPECT_BRANCHES,
  OUTREACH_STATUS_HINTS,
} from "@/types";

const OUTREACH_OPTIONS: ProspectOutreachStatus[] = [
  "Not Started",
  "WeChat - Not Found",
  "WeChat - Cannot Add",
  "WeChat - Added",
  "Called",
  "No Response",
];

const STATUS_OPTIONS: ProspectStatus[] = [
  "New",
  "Contacted",
  "Interested",
  "Applied",
  "Enrolled",
  "Declined",
];

const INTENTION_OPTIONS: ProspectIntention[] = ["Yes", "No", "Considering"];

/** Prospect timestamps are UTC (Cloud SQL func.now()). Append Z so the browser displays in local time. */
function parseUTC(ts: string): Date {
  return ts.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(ts) ? new Date(ts) : new Date(ts + "Z");
}

function relativeTimeUTC(ts: string): string {
  const diffMs = Date.now() - parseUTC(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diffMs / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diffMs / 86400000);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return parseUTC(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const inputSmall =
  "text-xs border-2 border-border rounded-lg px-2 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors duration-200";

// ---- Color maps (admin-specific) ----

const STATUS_BADGE_COLORS: Record<string, string> = {
  New: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Interested: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Applied: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Enrolled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Declined: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ---- Detail Modal ----

function ProspectDetailModal({
  prospect,
  onClose,
  onSave,
}: {
  prospect: PrimaryProspect;
  onClose: () => void;
  onSave: () => void;
}) {
  const [outreachStatus, setOutreachStatus] = useState(prospect.outreach_status);
  const [status, setStatus] = useState(prospect.status);
  const [contactNotes, setContactNotes] = useState(prospect.contact_notes || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const unlinkTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data: matchResult } = useSWR(
    !prospect.summer_application_id ? `prospect-match-${prospect.id}` : null,
    () => prospectsAPI.findMatches(prospect.id),
    { revalidateOnFocus: false }
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await prospectsAPI.adminUpdate(prospect.id, {
        outreach_status: outreachStatus,
        status,
        contact_notes: contactNotes || undefined,
      });
      onSave();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async (applicationId: number) => {
    setSaveError(null);
    try {
      await prospectsAPI.adminUpdate(prospect.id, {
        summer_application_id: applicationId,
        status: "Applied",
      });
      onSave();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Link failed");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Prospect details: ${prospect.student_name}`}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 to-transparent p-6 pb-4 rounded-t-2xl">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">{prospect.student_name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {prospect.source_branch} &middot; {prospect.primary_student_id || "No ID"} &middot; {prospect.grade}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-background/50 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoItem icon={School} label="School" value={prospect.school} />
            <InfoItem icon={User} label="Tutor" value={prospect.tutor_name} />
            <InfoItem icon={Phone} label="Phone 1" value={prospect.phone_1 ? `${prospect.phone_1}${prospect.phone_1_relation ? ` (${prospect.phone_1_relation})` : ""}` : null} />
            <InfoItem icon={Phone} label="Phone 2" value={prospect.phone_2 ? `${prospect.phone_2}${prospect.phone_2_relation ? ` (${prospect.phone_2_relation})` : ""}` : null} />
            <InfoItem icon={MessageSquare} label="WeChat" value={prospect.wechat_id} />
            <div className="flex items-start gap-2.5 text-sm">
              <School className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Branch Choice</div>
                <BranchBadges branches={prospect.preferred_branches || []} />
              </div>
            </div>
          </div>

          {/* Tutor Remark */}
          {prospect.tutor_remark && (
            <div className="border-l-4 border-primary/30 bg-primary/5 rounded-r-xl p-4">
              <div className="text-[10px] font-semibold text-primary/60 uppercase tracking-wider mb-1">Tutor Remark</div>
              <p className="text-sm text-foreground">{prospect.tutor_remark}</p>
            </div>
          )}

          {/* Intention */}
          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Wants Summer?</span>
              <IntentionBadge value={prospect.wants_summer} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Wants Regular (Sept)?</span>
              <IntentionBadge value={prospect.wants_regular} />
            </div>
          </div>

          {(prospect.preferred_time_note || prospect.preferred_tutor_note) && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Preferences:</span>{" "}
              {[prospect.preferred_time_note, prospect.preferred_tutor_note].filter(Boolean).join(" / ")}
            </p>
          )}

          {prospect.sibling_info && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Sibling:</span> {prospect.sibling_info}
            </p>
          )}

          {/* Admin Controls */}
          <div className="border-t border-border pt-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Outreach Status</label>
                <select
                  value={outreachStatus}
                  onChange={(e) => setOutreachStatus(e.target.value as ProspectOutreachStatus)}
                  className={`w-full ${inputSmall}`}
                >
                  {OUTREACH_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1 italic">
                  {OUTREACH_STATUS_HINTS[outreachStatus as ProspectOutreachStatus]}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProspectStatus)}
                  className={`w-full ${inputSmall}`}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Contact Notes</label>
              <textarea
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
                className={`w-full ${inputSmall} resize-y`}
                rows={2}
                placeholder="Internal notes about contacting this parent..."
              />
            </div>

            {saveError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{saveError}</span>
                <button onClick={() => setSaveError(null)} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-medium transition-colors duration-200"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>

          {/* Application Match */}
          {prospect.summer_application_id ? (
            <div className="border-t border-border pt-5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Linked Summer Application</div>
              <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">{prospect.matched_application_ref}</span>
                  <ProspectStatusBadge status={prospect.matched_application_status as ProspectStatus || "New"} />
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={`/admin/summer/applications?search=${prospect.matched_application_ref}`}
                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    View &rarr;
                  </a>
                  <button
                    onClick={async () => {
                      if (!confirmingUnlink) {
                        setConfirmingUnlink(true);
                        clearTimeout(unlinkTimerRef.current);
                        unlinkTimerRef.current = setTimeout(() => setConfirmingUnlink(false), 3000);
                        return;
                      }
                      clearTimeout(unlinkTimerRef.current);
                      setConfirmingUnlink(false);
                      setSaveError(null);
                      try {
                        await prospectsAPI.adminUpdate(prospect.id, { summer_application_id: null });
                        onSave();
                        onClose();
                      } catch (err) {
                        setSaveError(err instanceof Error ? err.message : "Unlink failed");
                      }
                    }}
                    className={`text-xs font-medium transition-colors ${confirmingUnlink ? "bg-red-500 text-white px-2 py-0.5 rounded" : "text-red-600 hover:text-red-700"}`}
                  >
                    {confirmingUnlink ? "Sure? Click again" : "Unlink"}
                  </button>
                </div>
              </div>
            </div>
          ) : matchResult && matchResult.matches.length > 0 ? (
            <div className="border-t border-border pt-5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Potential Matches ({matchResult.matches.length})
              </div>
              <div className="space-y-2">
                {matchResult.matches.map((m) => (
                  <div
                    key={m.application_id}
                    className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-4 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-sm font-medium">{m.student_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {m.reference_code} &middot; {m.contact_phone} &middot; {m.match_type}
                      </span>
                    </div>
                    <button
                      onClick={() => handleLink(m.application_id)}
                      className="inline-flex items-center gap-1.5 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 font-medium transition-colors"
                    >
                      <Link2 className="h-3 w-3" />
                      Link
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Edit History */}
          {prospect.edit_history && prospect.edit_history.length > 0 && (
            <div className="border-t border-border pt-4">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Edit History ({prospect.edit_history.length})
              </button>
              {showHistory && (
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {prospect.edit_history.map((h, i) => (
                    <div key={i} className="text-xs text-muted-foreground font-mono">
                      {parseUTC(h.timestamp).toLocaleString()} — {h.field}: {h.old_value ?? "null"} &rarr; {h.new_value ?? "null"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="font-medium text-foreground">{value || "-"}</div>
      </div>
    </div>
  );
}

// ---- Main Page ----

export default function AdminProspectsPage() {
  const [year, setYear] = useState<number | null>(null);
  const [tab, setTab] = useState<"list" | "dashboard">("list");
  const [filters, setFilters] = useState({
    branch: "",
    status: "",
    outreach_status: "",
    wants_summer: "",
    wants_regular: "",
    linked: "",
    search: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedProspect, setSelectedProspect] = useState<PrimaryProspect | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  const [confirmingAutoMatch, setConfirmingAutoMatch] = useState(false);
  const autoMatchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pageError, setPageError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<{ matched: number; total_unlinked: number; skipped_ambiguous: number } | null>(null);
  const matchResultTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => { clearTimeout(matchResultTimer.current); clearTimeout(autoMatchTimerRef.current); }, []);

  // Fetch available years from summer configs
  const { data: configs } = useSWR("summer-configs", () => summerAPI.getConfigs(), { revalidateOnFocus: false });
  const availableYears = configs?.map((c) => c.year).sort((a, b) => b - a) ?? [];

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

  const statsKey = tab === "dashboard" && year ? `admin-prospect-stats-${year}` : null;
  const { data: stats } = useSWR(
    statsKey,
    () => prospectsAPI.stats(year!),
    { revalidateOnFocus: false }
  );

  const refresh = useCallback(() => {
    if (swrKey) globalMutate(swrKey);
    globalMutate(`admin-prospect-stats-${year}`);
  }, [swrKey, year]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!prospects) return;
    setSelectedIds((prev) =>
      prev.size === prospects.length
        ? new Set()
        : new Set(prospects.map((p) => p.id))
    );
  }, [prospects]);

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

  const handleAutoMatch = useCallback(async () => {
    if (!year) return;
    if (!confirmingAutoMatch) {
      setConfirmingAutoMatch(true);
      clearTimeout(autoMatchTimerRef.current);
      autoMatchTimerRef.current = setTimeout(() => setConfirmingAutoMatch(false), 3000);
      return;
    }
    clearTimeout(autoMatchTimerRef.current);
    setConfirmingAutoMatch(false);
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
  }, [year, refresh, confirmingAutoMatch]);

  const activeFilterCount = [filters.status, filters.outreach_status, filters.wants_summer, filters.wants_regular, filters.linked, filters.search].filter(Boolean).length;

  return (
    <DeskSurface>
      <PageTransition className="p-4 sm:p-6">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm paper-texture overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-foreground inline-flex items-center gap-1.5">
                  P6 Prospects
                  <a href="/summer/prospect" target="_blank" rel="noopener noreferrer" title="Open public prospect page" className="text-muted-foreground hover:text-primary transition-colors">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </h1>
                <p className="text-xs text-muted-foreground">Track and manage P6 student feeder list</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={year ?? ""}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  onClick={handleAutoMatch}
                  disabled={autoMatching}
                  className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                    confirmingAutoMatch
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  {autoMatching ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-primary/30 border-t-primary" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {autoMatching ? "Matching..." : confirmingAutoMatch ? "Click again to confirm" : "Auto-Match"}
                </button>
                {/* Pill toggle */}
                <div className="flex bg-muted rounded-full p-0.5">
                  <button
                    onClick={() => setTab("list")}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                      tab === "list"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    List
                  </button>
                  <button
                    onClick={() => setTab("dashboard")}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                      tab === "dashboard"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6">
      {tab === "list" ? (
        <div className="space-y-5">
          {/* Branch Pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilters((f) => ({ ...f, branch: "" }))}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                !filters.branch
                  ? "bg-primary text-white shadow-sm"
                  : "border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              All
            </button>
            {PROSPECT_BRANCHES.map((b) => (
              <button
                key={b}
                onClick={() => setFilters((f) => ({ ...f, branch: f.branch === b ? "" : b }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                  filters.branch === b
                    ? "bg-primary text-white shadow-sm"
                    : "border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Search + Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search..."
                className={`${inputSmall} pl-8 w-40 sm:w-52`}
              />
            </div>
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
              <option value="">App: All</option>
              <option value="linked">Linked</option>
              <option value="unlinked">Unlinked</option>
            </select>
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setSearchInput(""); setFilters((f) => ({ ...f, status: "", outreach_status: "", wants_summer: "", wants_regular: "", linked: "", search: "" })); }}
                className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

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
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !prospects || prospects.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No prospects found</p>
              <p className="text-xs mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1000px]">
                  <thead className="bg-primary/5 border-b border-border">
                    <tr>
                      <th className="px-2 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === prospects.length && prospects.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded"
                        />
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">ID</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Name</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">School</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Grade</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Tutor</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Phone</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Branch Choice</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground"><span className="inline-flex items-center gap-1"><WeChatIcon className="h-3 w-3 text-green-600" />WeChat</span></th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Remark</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground" title="Admin contact notes"><MessageSquare className="h-3 w-3" /></th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Outreach</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Status</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground">App</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-foreground"><Clock className="h-3 w-3" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {prospects.map((p) => (
                      <tr
                        key={p.id}
                        className={`cursor-pointer transition-colors ${selectedIds.has(p.id) ? "bg-primary/[0.05]" : "hover:bg-primary/[0.03]"}`}
                        onClick={() => setSelectedProspect(p)}
                      >
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground font-mono">{p.primary_student_id || "-"}</td>
                        <td className="px-2 py-2 font-medium text-foreground">
                          <CopyableCell text={p.student_name} />
                          {!filters.branch && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{p.source_branch}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground"><CopyableCell text={p.school || ""} /></td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">{p.grade || "-"}</td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">{p.tutor_name || "-"}</td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">
                          <CopyableCell text={p.phone_1 || ""} title={p.phone_1_relation ? `${p.phone_1_relation}'s phone` : undefined} />
                        </td>
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
                        <td className="px-2 py-2 text-xs text-muted-foreground max-w-[100px]"><CopyableCell text={p.wechat_id || ""} /></td>
                        <td className="px-2 py-2 text-xs text-muted-foreground max-w-[120px]"><CopyableCell text={p.tutor_remark || ""} /></td>
                        <td className="px-2 py-2 text-center">
                          {p.contact_notes ? (
                            <MessageSquare className="h-3 w-3 text-primary/60" title={p.contact_notes} />
                          ) : (
                            <span className="text-xs text-muted-foreground/30">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2"><OutreachBadge status={p.outreach_status} /></td>
                        <td className="px-2 py-2"><ProspectStatusBadge status={p.status} /></td>
                        <td className="px-2 py-2">
                          {p.summer_application_id ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium" title={p.matched_application_ref || ""}>
                              <Link2 className="h-3 w-3" />
                              Linked
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-[10px] text-muted-foreground" title={p.updated_at ? parseUTC(p.updated_at).toLocaleString() : undefined}>
                          {p.updated_at ? relativeTimeUTC(p.updated_at) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 border-t border-border bg-primary/5 text-xs text-muted-foreground font-medium">
                {prospects.length} prospect{prospects.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>
      ) : (
        <DashboardView stats={stats || []} year={year} />
      )}
          </div>
        </div>
      </PageTransition>

      {/* Detail Modal */}
      {selectedProspect && (
        <ProspectDetailModal
          prospect={selectedProspect}
          onClose={() => setSelectedProspect(null)}
          onSave={refresh}
        />
      )}

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 animate-slide-up">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <span className="text-xs text-muted-foreground">|</span>
            <span className="text-xs text-muted-foreground">Set outreach:</span>
            {OUTREACH_OPTIONS.map((o) => (
              <button
                key={o}
                onClick={() => handleBulkOutreach(o)}
                className="text-xs px-1.5 py-0.5 border rounded-lg hover:bg-primary/5 transition-colors"
                title={OUTREACH_STATUS_HINTS[o]}
              >
                {o}
              </button>
            ))}
            <button onClick={() => setSelectedIds(new Set())} className="p-1 text-muted-foreground hover:text-foreground ml-auto">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </DeskSurface>
  );
}

// ---- Dashboard ----

function DashboardView({ stats, year }: { stats: PrimaryProspectStats[]; year: number }) {
  if (stats.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No data for {year}</p>
      </div>
    );
  }

  const totals = stats.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      wants_summer_yes: acc.wants_summer_yes + s.wants_summer_yes,
      wants_summer_considering: acc.wants_summer_considering + s.wants_summer_considering,
      wants_regular_yes: acc.wants_regular_yes + s.wants_regular_yes,
      wants_regular_considering: acc.wants_regular_considering + s.wants_regular_considering,
      matched: acc.matched + s.matched_to_application,
      not_started: acc.not_started + s.outreach_not_started,
      wechat_added: acc.wechat_added + s.outreach_wechat_added,
      wechat_issues: acc.wechat_issues + s.outreach_wechat_not_found + s.outreach_wechat_cannot_add,
    }),
    { total: 0, wants_summer_yes: 0, wants_summer_considering: 0, wants_regular_yes: 0, wants_regular_considering: 0, matched: 0, not_started: 0, wechat_added: 0, wechat_issues: 0 }
  );

  return (
    <div className="space-y-5">
      {/* Compact totals strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm pb-4 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
        <div><span className="text-2xl font-bold text-foreground">{totals.total}</span> <span className="text-muted-foreground">prospects</span></div>
        <span className="text-border hidden sm:inline">|</span>
        <div><span className="font-semibold text-green-600">{totals.wants_summer_yes}</span> <span className="text-muted-foreground">summer yes</span> <span className="text-yellow-600 text-xs">+{totals.wants_summer_considering}</span></div>
        <div><span className="font-semibold text-blue-600">{totals.wants_regular_yes}</span> <span className="text-muted-foreground">regular yes</span> <span className="text-yellow-600 text-xs">+{totals.wants_regular_considering}</span></div>
        <span className="text-border hidden sm:inline">|</span>
        <div className="inline-flex items-center gap-1"><span className="font-semibold text-green-600">{totals.wechat_added}</span> <WeChatIcon className="h-3 w-3 text-green-600" /> <span className="text-muted-foreground">added</span></div>
        <div className="inline-flex items-center gap-1"><span className="text-red-600">{totals.wechat_issues}</span> <WeChatIcon className="h-3 w-3 text-red-500" /> <span className="text-muted-foreground">issues</span></div>
        <span className="text-border hidden sm:inline">|</span>
        <div><span className="font-semibold text-purple-600">{totals.matched}</span> <span className="text-muted-foreground">matched</span></div>
        <div><span className="text-muted-foreground">{totals.not_started} not started</span></div>
      </div>

      {/* Per-Branch Table */}
      <div className="border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#f0e6d8]/50 dark:bg-[#2a2520]">
            <tr className="border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30">
              <th rowSpan={2} className="px-3 py-1.5 text-left font-medium text-foreground align-bottom">Branch</th>
              <th rowSpan={2} className="px-3 py-1.5 text-right font-medium text-foreground align-bottom">Total</th>
              <th colSpan={2} className="px-3 py-1 text-center font-medium text-foreground text-[10px] uppercase tracking-wider">Summer</th>
              <th colSpan={2} className="px-3 py-1 text-center font-medium text-foreground text-[10px] uppercase tracking-wider">Regular</th>
              <th colSpan={2} className="px-3 py-1 text-center font-medium text-foreground align-bottom"><WeChatIcon className="h-3 w-3 inline text-green-600" /></th>
              <th rowSpan={2} className="px-3 py-1.5 text-right font-medium text-foreground align-bottom cursor-help" title="Linked to a summer application">Matched</th>
              <th rowSpan={2} className="px-3 py-1.5 text-right font-medium text-foreground align-bottom cursor-help" title="Outreach not yet attempted">Not Started</th>
            </tr>
            <tr>
              <th className="px-3 py-1 text-right"><IntentionBadge value="Yes" /></th>
              <th className="px-3 py-1 text-right"><IntentionBadge value="Considering" /></th>
              <th className="px-3 py-1 text-right"><IntentionBadge value="Yes" /></th>
              <th className="px-3 py-1 text-right"><IntentionBadge value="Considering" /></th>
              <th className="px-3 py-1 text-right text-[10px] text-green-600 font-medium">Added</th>
              <th className="px-3 py-1 text-right text-[10px] text-red-600 font-medium">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30">
            {stats.map((s, i) => (
              <tr key={s.branch} className={i % 2 === 1 ? "bg-[#f5efe7]/30 dark:bg-[#222]" : ""}>
                <td className="px-3 py-2 font-semibold text-foreground">{s.branch}</td>
                <td className="px-3 py-2 text-right font-medium">{s.total}</td>
                <td className="px-3 py-2 text-right text-green-600 font-medium">{s.wants_summer_yes}</td>
                <td className="px-3 py-2 text-right text-yellow-600">{s.wants_summer_considering}</td>
                <td className="px-3 py-2 text-right text-blue-600 font-medium">{s.wants_regular_yes}</td>
                <td className="px-3 py-2 text-right text-yellow-600">{s.wants_regular_considering}</td>
                <td className="px-3 py-2 text-right text-green-600">{s.outreach_wechat_added}</td>
                <td className="px-3 py-2 text-right text-red-600">{s.outreach_wechat_not_found + s.outreach_wechat_cannot_add}</td>
                <td className="px-3 py-2 text-right text-purple-600 font-medium">{s.matched_to_application}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{s.outreach_not_started}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[#f0e6d8]/50 dark:bg-[#2a2520] font-semibold border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
            <tr>
              <td className="px-3 py-2 text-foreground">Total</td>
              <td className="px-3 py-2 text-right">{totals.total}</td>
              <td className="px-3 py-2 text-right text-green-600">{totals.wants_summer_yes}</td>
              <td className="px-3 py-2 text-right text-yellow-600">{totals.wants_summer_considering}</td>
              <td className="px-3 py-2 text-right text-blue-600">{totals.wants_regular_yes}</td>
              <td className="px-3 py-2 text-right text-yellow-600">{totals.wants_regular_considering}</td>
              <td className="px-3 py-2 text-right text-green-600">{totals.wechat_added}</td>
              <td className="px-3 py-2 text-right text-red-600">{totals.wechat_issues}</td>
              <td className="px-3 py-2 text-right text-purple-600">{totals.matched}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{totals.not_started}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---- Admin-specific Components ----

function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_BADGE_COLORS[status] || "bg-gray-100"}`}>
      {status}
    </span>
  );
}

