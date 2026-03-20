"use client";

import { useState, useCallback, useEffect } from "react";
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
  X,
} from "lucide-react";
import { prospectsAPI } from "@/lib/api";
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

const CURRENT_YEAR = new Date().getFullYear();

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

const selectClass =
  "text-sm border-2 border-border rounded-lg px-2.5 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors";

// ---- Color maps (hoisted for perf) ----

const INTENTION_BADGE_COLORS: Record<string, string> = {
  Yes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  No: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Considering: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

const OUTREACH_BADGE_COLORS: Record<string, string> = {
  "Not Started": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  "WeChat - Not Found": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "WeChat - Cannot Add": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "WeChat - Added": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Called: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "No Response": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

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
  const [showHistory, setShowHistory] = useState(false);

  const { data: matchResult } = useSWR(
    !prospect.summer_application_id ? `prospect-match-${prospect.id}` : null,
    () => prospectsAPI.findMatches(prospect.id),
    { revalidateOnFocus: false }
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await prospectsAPI.adminUpdate(prospect.id, {
        outreach_status: outreachStatus,
        status,
        contact_notes: contactNotes || undefined,
      });
      onSave();
      onClose();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async (applicationId: number) => {
    try {
      await prospectsAPI.adminUpdate(prospect.id, {
        summer_application_id: applicationId,
        status: "Applied",
      });
      onSave();
      onClose();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
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
            <InfoItem icon={School} label="Pref. Branch" value={(prospect.preferred_branches || []).join(", ")} />
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
              <span className="text-muted-foreground">Summer:</span>
              <IntentionBadge value={prospect.wants_summer} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Regular (Sept):</span>
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
                  className={`w-full ${selectClass}`}
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
                  className={`w-full ${selectClass}`}
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
                className={`w-full ${selectClass} resize-y`}
                rows={2}
                placeholder="Internal notes about contacting this parent..."
              />
            </div>

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
                <a
                  href={`/admin/summer/applications?search=${prospect.matched_application_ref}`}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  View &rarr;
                </a>
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
                      {new Date(h.timestamp).toLocaleString()} — {h.field}: {h.old_value ?? "null"} &rarr; {h.new_value ?? "null"}
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
  const [year, setYear] = useState(CURRENT_YEAR);
  const [tab, setTab] = useState<"list" | "dashboard">("list");
  const [filters, setFilters] = useState({
    branch: "",
    status: "",
    outreach_status: "",
    wants_summer: "",
    wants_regular: "",
    search: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedProspect, setSelectedProspect] = useState<PrimaryProspect | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const swrKey = tab === "list"
    ? ["admin-prospects", year, filters.branch, filters.status, filters.outreach_status, filters.wants_summer, filters.wants_regular, filters.search]
    : null;
  const { data: prospects, isLoading } = useSWR(
    swrKey,
    () => prospectsAPI.adminList({
      year,
      branch: filters.branch || undefined,
      status: filters.status || undefined,
      outreach_status: filters.outreach_status || undefined,
      wants_summer: filters.wants_summer || undefined,
      wants_regular: filters.wants_regular || undefined,
      search: filters.search || undefined,
    }),
    { revalidateOnFocus: false }
  );

  const statsKey = tab === "dashboard" ? `admin-prospect-stats-${year}` : null;
  const { data: stats } = useSWR(
    statsKey,
    () => prospectsAPI.stats(year),
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
    try {
      await prospectsAPI.bulkOutreach(Array.from(selectedIds), outreachStatus);
      setSelectedIds(new Set());
      refresh();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }, [selectedIds, refresh]);

  const handleAutoMatch = useCallback(async () => {
    try {
      const result = await prospectsAPI.autoMatch(year);
      alert(`Auto-match complete: ${result.matched} matched out of ${result.total_unlinked} unlinked`);
      refresh();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }, [year, refresh]);

  const activeFilterCount = [filters.branch, filters.status, filters.outreach_status, filters.wants_summer, filters.wants_regular, filters.search].filter(Boolean).length;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">P6 Prospects</h1>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={selectClass}
          >
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoMatch}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Auto-Match
          </button>
          {/* Pill toggle */}
          <div className="flex bg-muted rounded-full p-0.5">
            <button
              onClick={() => setTab("list")}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
                tab === "list"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setTab("dashboard")}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
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

      {tab === "list" ? (
        <>
          {/* Filters */}
          <div className="bg-card rounded-xl border border-border p-3 flex flex-wrap gap-2 items-center">
            <select value={filters.branch} onChange={(e) => setFilters((f) => ({ ...f, branch: e.target.value }))} className={selectClass}>
              <option value="">All Branches</option>
              {PROSPECT_BRANCHES.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={selectClass}>
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <select value={filters.outreach_status} onChange={(e) => setFilters((f) => ({ ...f, outreach_status: e.target.value }))} className={selectClass}>
              <option value="">All Outreach</option>
              {OUTREACH_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
            </select>
            <select value={filters.wants_summer} onChange={(e) => setFilters((f) => ({ ...f, wants_summer: e.target.value }))} className={selectClass}>
              <option value="">Summer: All</option>
              {INTENTION_OPTIONS.map((i) => (<option key={i} value={i}>Summer: {i}</option>))}
            </select>
            <select value={filters.wants_regular} onChange={(e) => setFilters((f) => ({ ...f, wants_regular: e.target.value }))} className={selectClass}>
              <option value="">Regular: All</option>
              {INTENTION_OPTIONS.map((i) => (<option key={i} value={i}>Regular: {i}</option>))}
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search..."
                className={`${selectClass} pl-8 w-44`}
              />
            </div>
            {activeFilterCount > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="sticky bottom-4 z-30 bg-card/95 backdrop-blur border-2 border-primary/20 shadow-lg rounded-xl p-3 flex items-center gap-3 flex-wrap">
              <span className="bg-primary text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {selectedIds.size}
              </span>
              <span className="text-sm font-medium">selected</span>
              <span className="text-xs text-muted-foreground mx-1">|</span>
              <span className="text-xs text-muted-foreground">Set outreach:</span>
              {OUTREACH_OPTIONS.map((o) => (
                <button
                  key={o}
                  onClick={() => handleBulkOutreach(o)}
                  className="text-xs px-2.5 py-1 border rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all font-medium"
                  title={OUTREACH_STATUS_HINTS[o]}
                >
                  {o}
                </button>
              ))}
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
                <table className="w-full text-sm">
                  <thead className="bg-primary/5 border-b border-border">
                    <tr>
                      <th className="px-3 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === prospects.length && prospects.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded"
                        />
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium">Name</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium">Branch</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium">School</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium">Phone</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium">Summer</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium">Regular</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium">Pref.</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium">Outreach</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium">Status</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium">App</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {prospects.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-primary/[0.03] cursor-pointer transition-colors"
                        onClick={() => setSelectedProspect(p)}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{p.student_name}</td>
                        <td className="px-3 py-2 text-xs">{p.source_branch}</td>
                        <td className="px-3 py-2 text-xs">{p.school || "-"}</td>
                        <td className="px-3 py-2 text-xs">
                          {p.phone_1}
                          {p.phone_1_relation && (
                            <span className="text-muted-foreground ml-0.5 text-[10px]">({p.phone_1_relation})</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <IntentionBadge value={p.wants_summer} />
                        </td>
                        <td className="px-3 py-2">
                          <IntentionBadge value={p.wants_regular} />
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {(p.preferred_branches || []).join(", ") || "-"}
                        </td>
                        <td className="px-3 py-2">
                          <OutreachBadge status={p.outreach_status} />
                        </td>
                        <td className="px-3 py-2">
                          <ProspectStatusBadge status={p.status} />
                        </td>
                        <td className="px-3 py-2">
                          {p.summer_application_id ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium" title={p.matched_application_ref || ""}>
                              <Link2 className="h-3 w-3" />
                              Linked
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 border-t border-border bg-primary/5 text-xs text-muted-foreground font-medium">
                {prospects.length} prospect{prospects.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </>
      ) : (
        <DashboardView stats={stats || []} year={year} />
      )}

      {/* Detail Modal */}
      {selectedProspect && (
        <ProspectDetailModal
          prospect={selectedProspect}
          onClose={() => setSelectedProspect(null)}
          onSave={refresh}
        />
      )}
    </div>
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
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Prospects" value={totals.total} color="primary" />
        <StatCard label="Wants Summer" value={totals.wants_summer_yes} sub={`+${totals.wants_summer_considering} considering`} color="green" />
        <StatCard label="Wants Regular" value={totals.wants_regular_yes} sub={`+${totals.wants_regular_considering} considering`} color="blue" />
        <StatCard label="Matched to App" value={totals.matched} color="purple" />
      </div>

      {/* Outreach Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Not Started" value={totals.not_started} color="gray" />
        <StatCard label="WeChat Added" value={totals.wechat_added} color="green" />
        <StatCard label="WeChat Issues" value={totals.wechat_issues} sub="Not found + Cannot add" color="red" />
      </div>

      {/* Per-Branch Table */}
      <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-primary/5">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">Branch</th>
              <th className="px-3 py-2.5 text-right font-medium">Total</th>
              <th className="px-3 py-2.5 text-right font-medium">Summer Yes</th>
              <th className="px-3 py-2.5 text-right font-medium">Summer ?</th>
              <th className="px-3 py-2.5 text-right font-medium">Regular Yes</th>
              <th className="px-3 py-2.5 text-right font-medium">Regular ?</th>
              <th className="px-3 py-2.5 text-right font-medium">Matched</th>
              <th className="px-3 py-2.5 text-right font-medium">WC Added</th>
              <th className="px-3 py-2.5 text-right font-medium">WC Issues</th>
              <th className="px-3 py-2.5 text-right font-medium">Not Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {stats.map((s, i) => (
              <tr key={s.branch} className={`hover:bg-primary/[0.03] ${i % 2 === 1 ? "bg-primary/[0.02]" : ""}`}>
                <td className="px-3 py-2.5 font-semibold">{s.branch}</td>
                <td className="px-3 py-2.5 text-right font-medium">{s.total}</td>
                <td className="px-3 py-2.5 text-right text-green-600 font-medium">{s.wants_summer_yes}</td>
                <td className="px-3 py-2.5 text-right text-yellow-600">{s.wants_summer_considering}</td>
                <td className="px-3 py-2.5 text-right text-blue-600 font-medium">{s.wants_regular_yes}</td>
                <td className="px-3 py-2.5 text-right text-yellow-600">{s.wants_regular_considering}</td>
                <td className="px-3 py-2.5 text-right text-purple-600 font-medium">{s.matched_to_application}</td>
                <td className="px-3 py-2.5 text-right text-green-600">{s.outreach_wechat_added}</td>
                <td className="px-3 py-2.5 text-right text-red-600">{s.outreach_wechat_not_found + s.outreach_wechat_cannot_add}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{s.outreach_not_started}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-primary/5 font-semibold border-t-2 border-border">
            <tr>
              <td className="px-3 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right">{totals.total}</td>
              <td className="px-3 py-2.5 text-right text-green-600">{totals.wants_summer_yes}</td>
              <td className="px-3 py-2.5 text-right text-yellow-600">{totals.wants_summer_considering}</td>
              <td className="px-3 py-2.5 text-right text-blue-600">{totals.wants_regular_yes}</td>
              <td className="px-3 py-2.5 text-right text-yellow-600">{totals.wants_regular_considering}</td>
              <td className="px-3 py-2.5 text-right text-purple-600">{totals.matched}</td>
              <td className="px-3 py-2.5 text-right text-green-600">{totals.wechat_added}</td>
              <td className="px-3 py-2.5 text-right text-red-600">{totals.wechat_issues}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{totals.not_started}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---- Shared Small Components ----

function IntentionBadge({ value }: { value: string | null }) {
  const v = value || "Considering";
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${INTENTION_BADGE_COLORS[v] || "bg-gray-100"}`}>
      {v}
    </span>
  );
}

function OutreachBadge({ status }: { status: ProspectOutreachStatus }) {
  return (
    <span
      className={`text-xs px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap ${OUTREACH_BADGE_COLORS[status] || "bg-gray-100"}`}
      title={OUTREACH_STATUS_HINTS[status]}
    >
      {status}
    </span>
  );
}

function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_BADGE_COLORS[status] || "bg-gray-100"}`}>
      {status}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  color = "primary",
}: {
  label: string;
  value: number;
  sub?: string;
  color?: string;
}) {
  const accents: Record<string, { border: string; icon: string }> = {
    primary: { border: "border-l-primary", icon: "bg-primary/10 text-primary" },
    green: { border: "border-l-green-500", icon: "bg-green-100 text-green-600" },
    blue: { border: "border-l-blue-500", icon: "bg-blue-100 text-blue-600" },
    purple: { border: "border-l-purple-500", icon: "bg-purple-100 text-purple-600" },
    red: { border: "border-l-red-500", icon: "bg-red-100 text-red-600" },
    gray: { border: "border-l-gray-400", icon: "bg-gray-100 text-gray-500" },
  };
  const accent = accents[color] || accents.primary;
  return (
    <div className={`bg-card rounded-2xl shadow-sm border border-border border-l-4 ${accent.border} p-4`}>
      <div className="text-3xl font-bold text-foreground">{value}</div>
      <div className="text-xs font-medium text-muted-foreground mt-1">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
