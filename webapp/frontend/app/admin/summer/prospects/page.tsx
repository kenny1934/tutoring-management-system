"use client";

import { useState, useCallback, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { prospectsAPI } from "@/lib/api";
import type {
  PrimaryProspect,
  PrimaryProspectStats,
  ProspectOutreachStatus,
  ProspectStatus,
  ProspectIntention,
  ProspectBranch,
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

  // Match finding — skip if already linked
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{prospect.student_name}</h2>
            <p className="text-sm text-muted-foreground">
              {prospect.source_branch} &middot; {prospect.primary_student_id || "No ID"} &middot; {prospect.grade}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
        </div>

        {/* Student Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">School:</span>{" "}
            <span className="font-medium">{prospect.school || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Tutor:</span>{" "}
            <span className="font-medium">{prospect.tutor_name || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Phone 1:</span>{" "}
            <span className="font-medium">
              {prospect.phone_1 || "-"}
              {prospect.phone_1_relation && ` (${prospect.phone_1_relation})`}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Phone 2:</span>{" "}
            <span className="font-medium">
              {prospect.phone_2 || "-"}
              {prospect.phone_2_relation && ` (${prospect.phone_2_relation})`}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">WeChat:</span>{" "}
            <span className="font-medium">{prospect.wechat_id || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Pref. Branch:</span>{" "}
            <span className="font-medium">{(prospect.preferred_branches || []).join(", ") || "-"}</span>
          </div>
        </div>

        {/* Tutor Remark */}
        {prospect.tutor_remark && (
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">Tutor Remark</div>
            <p className="text-sm">{prospect.tutor_remark}</p>
          </div>
        )}

        {/* Intention */}
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Summer:</span>{" "}
            <IntentionBadge value={prospect.wants_summer} />
          </div>
          <div>
            <span className="text-muted-foreground">Regular (Sept):</span>{" "}
            <IntentionBadge value={prospect.wants_regular} />
          </div>
        </div>

        {prospect.preferred_time_note && (
          <div className="text-sm">
            <span className="text-muted-foreground">Time/Tutor Pref:</span>{" "}
            {prospect.preferred_time_note}
            {prospect.preferred_tutor_note && ` / ${prospect.preferred_tutor_note}`}
          </div>
        )}

        {prospect.sibling_info && (
          <div className="text-sm">
            <span className="text-muted-foreground">Sibling:</span> {prospect.sibling_info}
          </div>
        )}

        {/* Admin Controls */}
        <div className="border-t pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Outreach Status</label>
              <select
                value={outreachStatus}
                onChange={(e) => setOutreachStatus(e.target.value as ProspectOutreachStatus)}
                className="w-full text-sm border rounded px-2 py-1.5"
              >
                {OUTREACH_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-0.5">
                {OUTREACH_STATUS_HINTS[outreachStatus as ProspectOutreachStatus]}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProspectStatus)}
                className="w-full text-sm border rounded px-2 py-1.5"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Contact Notes</label>
            <textarea
              value={contactNotes}
              onChange={(e) => setContactNotes(e.target.value)}
              className="w-full text-sm border rounded px-2 py-1.5 resize-y"
              rows={2}
              placeholder="Internal notes about contacting this parent..."
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Application Match */}
        {prospect.summer_application_id ? (
          <div className="border-t pt-4">
            <div className="text-xs font-medium text-muted-foreground mb-1">Linked Summer Application</div>
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{prospect.matched_application_ref}</span>
                <span className="text-xs text-muted-foreground ml-2">{prospect.matched_application_status}</span>
              </div>
              <a
                href={`/admin/summer/applications?search=${prospect.matched_application_ref}`}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                View
              </a>
            </div>
          </div>
        ) : matchResult && matchResult.matches.length > 0 ? (
          <div className="border-t pt-4">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Potential Matches ({matchResult.matches.length})
            </div>
            <div className="space-y-2">
              {matchResult.matches.map((m) => (
                <div
                  key={m.application_id}
                  className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center justify-between"
                >
                  <div>
                    <span className="text-sm font-medium">{m.student_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {m.reference_code} &middot; {m.contact_phone} &middot; {m.match_type}
                    </span>
                  </div>
                  <button
                    onClick={() => handleLink(m.application_id)}
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                  >
                    Link
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Edit History */}
        {prospect.edit_history && prospect.edit_history.length > 0 && (
          <div className="border-t pt-4">
            <div className="text-xs font-medium text-muted-foreground mb-1">Edit History</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {prospect.edit_history.map((h, i) => (
                <div key={i} className="text-xs text-muted-foreground">
                  <span className="font-mono">{new Date(h.timestamp).toLocaleString()}</span>
                  {" "}{h.field}: {h.old_value ?? "null"} &rarr; {h.new_value ?? "null"}
                </div>
              ))}
            </div>
          </div>
        )}
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

  // Debounce search input
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

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">P6 Prospects</h1>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="text-sm border rounded px-2 py-1"
          >
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoMatch}
            className="text-sm px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Auto-Match
          </button>
          <div className="flex border rounded overflow-hidden">
            <button
              onClick={() => setTab("list")}
              className={`px-3 py-1.5 text-sm ${tab === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              List
            </button>
            <button
              onClick={() => setTab("dashboard")}
              className={`px-3 py-1.5 text-sm ${tab === "dashboard" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>

      {tab === "list" ? (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              value={filters.branch}
              onChange={(e) => setFilters((f) => ({ ...f, branch: e.target.value }))}
              className="text-sm border rounded px-2 py-1.5"
            >
              <option value="">All Branches</option>
              {PROSPECT_BRANCHES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="text-sm border rounded px-2 py-1.5"
            >
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={filters.outreach_status}
              onChange={(e) => setFilters((f) => ({ ...f, outreach_status: e.target.value }))}
              className="text-sm border rounded px-2 py-1.5"
            >
              <option value="">All Outreach</option>
              {OUTREACH_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <select
              value={filters.wants_summer}
              onChange={(e) => setFilters((f) => ({ ...f, wants_summer: e.target.value }))}
              className="text-sm border rounded px-2 py-1.5"
            >
              <option value="">Summer: All</option>
              {INTENTION_OPTIONS.map((i) => (
                <option key={i} value={i}>Summer: {i}</option>
              ))}
            </select>
            <select
              value={filters.wants_regular}
              onChange={(e) => setFilters((f) => ({ ...f, wants_regular: e.target.value }))}
              className="text-sm border rounded px-2 py-1.5"
            >
              <option value="">Regular: All</option>
              {INTENTION_OPTIONS.map((i) => (
                <option key={i} value={i}>Regular: {i}</option>
              ))}
            </select>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, phone, school..."
              className="text-sm border rounded px-2 py-1.5 w-48"
            />
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <span className="text-xs text-muted-foreground">Set outreach:</span>
              {OUTREACH_OPTIONS.map((o) => (
                <button
                  key={o}
                  onClick={() => handleBulkOutreach(o)}
                  className="text-xs px-2 py-1 border rounded hover:bg-muted"
                  title={OUTREACH_STATUS_HINTS[o]}
                >
                  {o}
                </button>
              ))}
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !prospects || prospects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No prospects found.</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === prospects.length && prospects.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-2 py-2 text-left font-medium">Name</th>
                    <th className="px-2 py-2 text-left font-medium">Branch</th>
                    <th className="px-2 py-2 text-left font-medium">School</th>
                    <th className="px-2 py-2 text-left font-medium">Phone</th>
                    <th className="px-2 py-2 text-left font-medium">Summer</th>
                    <th className="px-2 py-2 text-left font-medium">Regular</th>
                    <th className="px-2 py-2 text-left font-medium">Pref.</th>
                    <th className="px-2 py-2 text-left font-medium">Outreach</th>
                    <th className="px-2 py-2 text-left font-medium">Status</th>
                    <th className="px-2 py-2 text-left font-medium">App</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {prospects.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelectedProspect(p)}
                    >
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-medium">{p.student_name}</td>
                      <td className="px-2 py-1.5">{p.source_branch}</td>
                      <td className="px-2 py-1.5">{p.school || "-"}</td>
                      <td className="px-2 py-1.5">
                        {p.phone_1}
                        {p.phone_1_relation && (
                          <span className="text-muted-foreground ml-0.5 text-xs">({p.phone_1_relation})</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <IntentionBadge value={p.wants_summer} />
                      </td>
                      <td className="px-2 py-1.5">
                        <IntentionBadge value={p.wants_regular} />
                      </td>
                      <td className="px-2 py-1.5 text-xs">
                        {(p.preferred_branches || []).join(", ") || "-"}
                      </td>
                      <td className="px-2 py-1.5">
                        <OutreachBadge status={p.outreach_status} />
                      </td>
                      <td className="px-2 py-1.5">
                        <ProspectStatusBadge status={p.status} />
                      </td>
                      <td className="px-2 py-1.5">
                        {p.summer_application_id ? (
                          <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded" title={p.matched_application_ref || ""}>
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
              <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
                {prospects.length} prospect{prospects.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Dashboard Tab */
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

// ---- Dashboard Component ----

function DashboardView({ stats, year }: { stats: PrimaryProspectStats[]; year: number }) {
  if (stats.length === 0) {
    return <p className="text-sm text-muted-foreground">No data for {year}.</p>;
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
        <StatCard label="Total Prospects" value={totals.total} />
        <StatCard label="Wants Summer" value={totals.wants_summer_yes} sub={`+${totals.wants_summer_considering} considering`} color="green" />
        <StatCard label="Wants Regular" value={totals.wants_regular_yes} sub={`+${totals.wants_regular_considering} considering`} color="blue" />
        <StatCard label="Matched to App" value={totals.matched} color="purple" />
      </div>

      {/* Outreach Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Not Started" value={totals.not_started} color="gray" />
        <StatCard label="WeChat Added" value={totals.wechat_added} color="green" />
        <StatCard label="WeChat Issues" value={totals.wechat_issues} sub="Not found + Cannot add" color="red" />
      </div>

      {/* Per-Branch Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Branch</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Summer Yes</th>
              <th className="px-3 py-2 text-right font-medium">Summer ?</th>
              <th className="px-3 py-2 text-right font-medium">Regular Yes</th>
              <th className="px-3 py-2 text-right font-medium">Regular ?</th>
              <th className="px-3 py-2 text-right font-medium">Matched</th>
              <th className="px-3 py-2 text-right font-medium">WC Added</th>
              <th className="px-3 py-2 text-right font-medium">WC Issues</th>
              <th className="px-3 py-2 text-right font-medium">Not Started</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stats.map((s) => (
              <tr key={s.branch} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{s.branch}</td>
                <td className="px-3 py-2 text-right">{s.total}</td>
                <td className="px-3 py-2 text-right text-green-600">{s.wants_summer_yes}</td>
                <td className="px-3 py-2 text-right text-yellow-600">{s.wants_summer_considering}</td>
                <td className="px-3 py-2 text-right text-blue-600">{s.wants_regular_yes}</td>
                <td className="px-3 py-2 text-right text-yellow-600">{s.wants_regular_considering}</td>
                <td className="px-3 py-2 text-right text-purple-600">{s.matched_to_application}</td>
                <td className="px-3 py-2 text-right text-green-600">{s.outreach_wechat_added}</td>
                <td className="px-3 py-2 text-right text-red-600">
                  {s.outreach_wechat_not_found + s.outreach_wechat_cannot_add}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">{s.outreach_not_started}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-medium">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right">{totals.total}</td>
              <td className="px-3 py-2 text-right text-green-600">{totals.wants_summer_yes}</td>
              <td className="px-3 py-2 text-right text-yellow-600">{totals.wants_summer_considering}</td>
              <td className="px-3 py-2 text-right text-blue-600">{totals.wants_regular_yes}</td>
              <td className="px-3 py-2 text-right text-yellow-600">{totals.wants_regular_considering}</td>
              <td className="px-3 py-2 text-right text-purple-600">{totals.matched}</td>
              <td className="px-3 py-2 text-right text-green-600">{totals.wechat_added}</td>
              <td className="px-3 py-2 text-right text-red-600">{totals.wechat_issues}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{totals.not_started}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---- Small Helpers ----

function IntentionBadge({ value }: { value: string | null }) {
  const colors: Record<string, string> = {
    Yes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    No: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    Considering: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
  const v = value || "Considering";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[v] || "bg-gray-100"}`}>
      {v}
    </span>
  );
}

function OutreachBadge({ status }: { status: ProspectOutreachStatus }) {
  const colors: Record<string, string> = {
    "Not Started": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    "WeChat - Not Found": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "WeChat - Cannot Add": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    "WeChat - Added": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    Called: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "No Response": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${colors[status] || "bg-gray-100"}`}
      title={OUTREACH_STATUS_HINTS[status]}
    >
      {status}
    </span>
  );
}

function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  const colors: Record<string, string> = {
    New: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    Contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    Interested: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    Applied: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    Enrolled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    Declined: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[status] || "bg-gray-100"}`}>
      {status}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  color = "default",
}: {
  label: string;
  value: number;
  sub?: string;
  color?: string;
}) {
  const borderColors: Record<string, string> = {
    green: "border-l-green-500",
    blue: "border-l-blue-500",
    purple: "border-l-purple-500",
    red: "border-l-red-500",
    gray: "border-l-gray-400",
    default: "border-l-primary",
  };
  return (
    <div className={`border rounded-lg p-3 border-l-4 ${borderColors[color] || borderColors.default}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
