"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { prospectsAPI } from "@/lib/api";
import type {
  PrimaryProspect,
  PrimaryProspectBulkItem,
  ProspectIntention,
  ProspectBranch,
} from "@/types";
import {
  PROSPECT_BRANCHES,
  SECONDARY_BRANCHES,
  OUTREACH_STATUS_HINTS,
  type ProspectOutreachStatus,
} from "@/types";

// ---- Constants ----

const CURRENT_YEAR = new Date().getFullYear();
const PHONE_RELATIONS = ["Mum", "Dad", "Guardian", "Other"] as const;
const INTENTIONS: ProspectIntention[] = ["Yes", "No", "Considering"];

// ---- Types for parsed rows ----

interface ParsedRow {
  _key: string; // client-side unique key
  primary_student_id: string;
  student_name: string;
  grade: string;
  tutor_name: string;
  phone_1: string;
  school: string;
  phone_1_relation: string;
  phone_2: string;
  phone_2_relation: string;
  wechat_id: string;
  tutor_remark: string;
  wants_summer: ProspectIntention;
  wants_regular: ProspectIntention;
  preferred_branches: string[];
  preferred_time_note: string; // also covers tutor preference
  sibling_info: string;
  _error?: string;
}

function createEmptyRow(): ParsedRow {
  return {
    _key: crypto.randomUUID(),
    primary_student_id: "",
    student_name: "",
    grade: "P6",
    tutor_name: "",
    phone_1: "",
    school: "",
    phone_1_relation: "Mum",
    phone_2: "",
    phone_2_relation: "",
    wechat_id: "",
    tutor_remark: "",
    wants_summer: "Considering",
    wants_regular: "Considering",
    preferred_branches: [],
    preferred_time_note: "",
    sibling_info: "",
  };
}

// ---- Parse pasted data ----

function parsePastedData(text: string): ParsedRow[] {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 2) continue;

    const [id, name, grade, tutor, phone, school] = cols.map((c) =>
      c?.trim() ?? ""
    );

    // Filter out Bobby template row
    if (
      (id === "1001" || id === "1001.0") &&
      (phone === "66666666" || phone === "66666666.0")
    )
      continue;
    // Filter out header row
    if (id.toLowerCase() === "id" && name.toLowerCase().includes("name"))
      continue;

    // Clean phone: remove .0 suffix from Excel number format
    const cleanPhone = phone.replace(/\.0$/, "");

    rows.push({
      ...createEmptyRow(),
      primary_student_id: id.replace(/\.0$/, ""),
      student_name: name,
      grade: grade || "P6",
      tutor_name: tutor,
      phone_1: cleanPhone,
      school: school,
    });
  }

  return rows;
}

// ---- Components ----

function IntentionSelect({
  value,
  onChange,
}: {
  value: ProspectIntention;
  onChange: (v: ProspectIntention) => void;
}) {
  const colors: Record<ProspectIntention, string> = {
    Yes: "bg-green-100 text-green-800 border-green-300",
    No: "bg-red-100 text-red-800 border-red-300",
    Considering: "bg-yellow-100 text-yellow-800 border-yellow-300",
  };
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ProspectIntention)}
      className={`text-xs px-1.5 py-1 rounded border ${colors[value]} cursor-pointer`}
    >
      {INTENTIONS.map((i) => (
        <option key={i} value={i}>
          {i}
        </option>
      ))}
    </select>
  );
}

function BranchCheckboxes({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex gap-2">
      {SECONDARY_BRANCHES.map((b) => (
        <label key={b} className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={value.includes(b)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, b]
                  : value.filter((v) => v !== b)
              )
            }
            className="rounded"
          />
          {b}
        </label>
      ))}
    </div>
  );
}

function OutreachBadge({ status }: { status: ProspectOutreachStatus }) {
  const colors: Record<string, string> = {
    "Not Started": "bg-gray-100 text-gray-600",
    "WeChat - Not Found": "bg-red-100 text-red-700",
    "WeChat - Cannot Add": "bg-orange-100 text-orange-700",
    "WeChat - Added": "bg-green-100 text-green-700",
    Called: "bg-blue-100 text-blue-700",
    "No Response": "bg-yellow-100 text-yellow-700",
  };
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded ${colors[status] || "bg-gray-100"}`}
      title={OUTREACH_STATUS_HINTS[status]}
    >
      {status}
    </span>
  );
}

// ---- Main Page ----

export default function ProspectPage() {
  const searchParams = useSearchParams();
  const branchParam = searchParams.get("branch")?.toUpperCase() as ProspectBranch | undefined;
  const branch = branchParam && PROSPECT_BRANCHES.includes(branchParam) ? branchParam : null;

  const [year, setYear] = useState(CURRENT_YEAR);
  const [pasteText, setPasteText] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<PrimaryProspect>>({});

  // Fetch existing submissions for this branch
  const swrKey = branch ? `prospects-${branch}-${year}` : null;
  const { data: existing, isLoading } = useSWR(
    swrKey,
    () => prospectsAPI.list(branch!, year),
    { revalidateOnFocus: false }
  );

  // ---- Paste & Parse ----

  const handleParse = useCallback(() => {
    if (!pasteText.trim()) return;
    const rows = parsePastedData(pasteText);
    setParsedRows(rows);
    setSubmitResult(null);
  }, [pasteText]);

  const updateRow = useCallback((key: string, field: keyof ParsedRow, value: unknown) => {
    setParsedRows((prev) =>
      prev.map((r) => (r._key === key ? { ...r, [field]: value } : r))
    );
  }, []);

  const removeRow = useCallback((key: string) => {
    setParsedRows((prev) => prev.filter((r) => r._key !== key));
  }, []);

  const addEmptyRow = useCallback(() => {
    setParsedRows((prev) => [...prev, createEmptyRow()]);
  }, []);

  // ---- Submit ----

  const handleSubmit = useCallback(async () => {
    if (!branch || parsedRows.length === 0) return;

    // Validate
    const valid = parsedRows.filter((r) => r.student_name.trim());
    if (valid.length === 0) {
      setSubmitResult("No valid rows to submit (student name is required)");
      return;
    }

    setSubmitting(true);
    setSubmitResult(null);
    try {
      const prospects: PrimaryProspectBulkItem[] = valid.map((r) => ({
        primary_student_id: r.primary_student_id || undefined,
        student_name: r.student_name,
        school: r.school || undefined,
        grade: r.grade || undefined,
        tutor_name: r.tutor_name || undefined,
        phone_1: r.phone_1 || undefined,
        phone_1_relation: r.phone_1_relation || undefined,
        phone_2: r.phone_2 || undefined,
        phone_2_relation: r.phone_2_relation || undefined,
        wechat_id: r.wechat_id || undefined,
        tutor_remark: r.tutor_remark || undefined,
        wants_summer: r.wants_summer,
        wants_regular: r.wants_regular,
        preferred_branches: r.preferred_branches.length > 0 ? r.preferred_branches : undefined,
        preferred_time_note: r.preferred_time_note || undefined,
        sibling_info: r.sibling_info || undefined,
      }));

      const result = await prospectsAPI.bulkCreate({
        year,
        source_branch: branch,
        prospects,
      });

      setSubmitResult(`${result.created} students submitted successfully`);
      setParsedRows([]);
      setPasteText("");
      // Refresh the existing list
      if (swrKey) globalMutate(swrKey);
    } catch (err) {
      setSubmitResult(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  }, [branch, parsedRows, year, swrKey]);

  // ---- Inline edit for existing records ----

  const startEdit = useCallback((prospect: PrimaryProspect) => {
    setEditingId(prospect.id);
    setEditData({});
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditData({});
  }, []);

  const saveEdit = useCallback(async (id: number) => {
    if (Object.keys(editData).length === 0) {
      setEditingId(null);
      return;
    }
    try {
      await prospectsAPI.update(id, branch!, editData);
      setEditingId(null);
      setEditData({});
      if (swrKey) globalMutate(swrKey);
    } catch (err) {
      alert(`Error saving: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [editData, swrKey]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Delete this entry?")) return;
    try {
      await prospectsAPI.delete(id, branch!);
      if (swrKey) globalMutate(swrKey);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [swrKey]);

  // ---- Render ----

  if (!branch) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-xl font-bold mb-4">P6 Student Registration</h1>
        <p className="text-muted-foreground mb-6">Select your branch:</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-md mx-auto">
          {PROSPECT_BRANCHES.map((b) => (
            <a
              key={b}
              href={`/summer/prospect?branch=${b}`}
              className="block p-4 rounded-lg border border-border bg-card hover:border-blue-400 hover:shadow-md transition-all text-center font-medium"
            >
              {b}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 space-y-8 max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {branch} — P6 Student Registration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Register P6 students transitioning to secondary
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Year:</label>
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
      </div>

      {/* Section A: Paste & Submit */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Add Students</h2>

        <div>
          <label className="block text-sm font-medium mb-1">
            Paste from Excel
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            Columns: ID, Name, Grade, Tutor, Phone, School (tab-separated)
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste rows from Excel here..."
            rows={5}
            className="w-full border rounded-lg p-3 text-sm font-mono resize-y bg-background"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleParse}
              disabled={!pasteText.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Parse
            </button>
            <button
              onClick={addEmptyRow}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              + Add Row Manually
            </button>
          </div>
        </div>

        {/* Parsed Table */}
        {parsedRows.length > 0 && (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">#</th>
                  <th className="px-2 py-2 text-left font-medium">ID</th>
                  <th className="px-2 py-2 text-left font-medium">Name *</th>
                  <th className="px-2 py-2 text-left font-medium">Grade</th>
                  <th className="px-2 py-2 text-left font-medium">Tutor</th>
                  <th className="px-2 py-2 text-left font-medium">Phone</th>
                  <th className="px-2 py-2 text-left font-medium">Relation</th>
                  <th className="px-2 py-2 text-left font-medium">School</th>
                  <th className="px-2 py-2 text-left font-medium">WeChat ID</th>
                  <th className="px-2 py-2 text-left font-medium">Remark</th>
                  <th className="px-2 py-2 text-left font-medium">Summer</th>
                  <th className="px-2 py-2 text-left font-medium">Regular (Sept)</th>
                  <th className="px-2 py-2 text-left font-medium">Pref. Branch</th>
                  <th className="px-2 py-2 text-left font-medium">Time/Tutor Pref.</th>
                  <th className="px-2 py-2 text-left font-medium">Sibling Info</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {parsedRows.map((row, idx) => (
                  <tr key={row._key} className="hover:bg-muted/30">
                    <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.primary_student_id}
                        onChange={(e) => updateRow(row._key, "primary_student_id", e.target.value)}
                        className="w-16 text-xs border rounded px-1.5 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.student_name}
                        onChange={(e) => updateRow(row._key, "student_name", e.target.value)}
                        className={`w-32 text-xs border rounded px-1.5 py-1 ${!row.student_name.trim() ? "border-red-400" : ""}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.grade}
                        onChange={(e) => updateRow(row._key, "grade", e.target.value)}
                        className="w-14 text-xs border rounded px-1.5 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.tutor_name}
                        onChange={(e) => updateRow(row._key, "tutor_name", e.target.value)}
                        className="w-20 text-xs border rounded px-1.5 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.phone_1}
                        onChange={(e) => updateRow(row._key, "phone_1", e.target.value)}
                        className="w-24 text-xs border rounded px-1.5 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={row.phone_1_relation}
                        onChange={(e) => updateRow(row._key, "phone_1_relation", e.target.value)}
                        className="text-xs border rounded px-1 py-1"
                      >
                        {PHONE_RELATIONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.school}
                        onChange={(e) => updateRow(row._key, "school", e.target.value)}
                        className="w-16 text-xs border rounded px-1.5 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.wechat_id}
                        onChange={(e) => updateRow(row._key, "wechat_id", e.target.value)}
                        className="w-24 text-xs border rounded px-1.5 py-1"
                        placeholder="WeChat ID"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.tutor_remark}
                        onChange={(e) => updateRow(row._key, "tutor_remark", e.target.value)}
                        className="w-32 text-xs border rounded px-1.5 py-1"
                        placeholder="Notes..."
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <IntentionSelect
                        value={row.wants_summer}
                        onChange={(v) => updateRow(row._key, "wants_summer", v)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <IntentionSelect
                        value={row.wants_regular}
                        onChange={(v) => updateRow(row._key, "wants_regular", v)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <BranchCheckboxes
                        value={row.preferred_branches}
                        onChange={(v) => updateRow(row._key, "preferred_branches", v)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.preferred_time_note}
                        onChange={(e) => updateRow(row._key, "preferred_time_note", e.target.value)}
                        className="w-28 text-xs border rounded px-1.5 py-1"
                        placeholder="Time/tutor pref..."
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.sibling_info}
                        onChange={(e) => updateRow(row._key, "sibling_info", e.target.value)}
                        className="w-28 text-xs border rounded px-1.5 py-1"
                        placeholder="Sibling info..."
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => removeRow(row._key)}
                        className="text-red-400 hover:text-red-600 text-xs"
                        title="Remove row"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="p-3 border-t bg-muted/30 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {parsedRows.length} student{parsedRows.length !== 1 ? "s" : ""} ready
              </span>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                {submitting ? "Submitting..." : "Submit All"}
              </button>
            </div>
          </div>
        )}

        {submitResult && (
          <div
            className={`p-3 rounded-lg text-sm ${
              submitResult.startsWith("Error")
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-green-50 text-green-700 border border-green-200"
            }`}
          >
            {submitResult}
          </div>
        )}
      </section>

      {/* Section B: Previously Submitted */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Submitted Students
          {existing && existing.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({existing.length})
            </span>
          )}
        </h2>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !existing || existing.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No students submitted yet for {branch} ({year}).
          </p>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">ID</th>
                  <th className="px-2 py-2 text-left font-medium">Name</th>
                  <th className="px-2 py-2 text-left font-medium">Grade</th>
                  <th className="px-2 py-2 text-left font-medium">Tutor</th>
                  <th className="px-2 py-2 text-left font-medium">Phone</th>
                  <th className="px-2 py-2 text-left font-medium">School</th>
                  <th className="px-2 py-2 text-left font-medium">WeChat</th>
                  <th className="px-2 py-2 text-left font-medium">Remark</th>
                  <th className="px-2 py-2 text-left font-medium">Summer</th>
                  <th className="px-2 py-2 text-left font-medium">Regular</th>
                  <th className="px-2 py-2 text-left font-medium">Pref. Branch</th>
                  <th className="px-2 py-2 text-left font-medium">Outreach</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {existing.map((p) => {
                  const isEditing = editingId === p.id;
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-2 py-1.5 text-muted-foreground text-xs">
                        {p.primary_student_id || "-"}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <input
                            defaultValue={p.student_name}
                            onChange={(e) => setEditData((d) => ({ ...d, student_name: e.target.value }))}
                            className="w-32 text-xs border rounded px-1.5 py-1"
                          />
                        ) : (
                          <span className="text-xs font-medium">{p.student_name}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs">{p.grade}</td>
                      <td className="px-2 py-1.5 text-xs">{p.tutor_name}</td>
                      <td className="px-2 py-1.5 text-xs">
                        {isEditing ? (
                          <input
                            defaultValue={p.phone_1 || ""}
                            onChange={(e) => setEditData((d) => ({ ...d, phone_1: e.target.value }))}
                            className="w-24 text-xs border rounded px-1.5 py-1"
                          />
                        ) : (
                          <span>
                            {p.phone_1}
                            {p.phone_1_relation && (
                              <span className="text-muted-foreground ml-1">({p.phone_1_relation})</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs">{p.school}</td>
                      <td className="px-2 py-1.5 text-xs">
                        {isEditing ? (
                          <input
                            defaultValue={p.wechat_id || ""}
                            onChange={(e) => setEditData((d) => ({ ...d, wechat_id: e.target.value }))}
                            className="w-24 text-xs border rounded px-1.5 py-1"
                            placeholder="WeChat ID"
                          />
                        ) : (
                          p.wechat_id || <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs max-w-[150px] truncate" title={p.tutor_remark || ""}>
                        {isEditing ? (
                          <input
                            defaultValue={p.tutor_remark || ""}
                            onChange={(e) => setEditData((d) => ({ ...d, tutor_remark: e.target.value }))}
                            className="w-32 text-xs border rounded px-1.5 py-1"
                          />
                        ) : (
                          p.tutor_remark || <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <IntentionSelect
                            value={(editData.wants_summer as ProspectIntention) ?? (p.wants_summer as ProspectIntention) ?? "Considering"}
                            onChange={(v) => setEditData((d) => ({ ...d, wants_summer: v }))}
                          />
                        ) : (
                          <IntentionBadge value={p.wants_summer} />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <IntentionSelect
                            value={(editData.wants_regular as ProspectIntention) ?? (p.wants_regular as ProspectIntention) ?? "Considering"}
                            onChange={(v) => setEditData((d) => ({ ...d, wants_regular: v }))}
                          />
                        ) : (
                          <IntentionBadge value={p.wants_regular} />
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs">
                        {(p.preferred_branches || []).join(", ") || "-"}
                      </td>
                      <td className="px-2 py-1.5">
                        <OutreachBadge status={p.outreach_status} />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => saveEdit(p.id)}
                                className="text-xs text-green-600 hover:text-green-800"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(p)}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(p.id)}
                                className="text-xs text-red-400 hover:text-red-600"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---- Small helpers ----

function IntentionBadge({ value }: { value: string | null }) {
  const colors: Record<string, string> = {
    Yes: "bg-green-100 text-green-700",
    No: "bg-red-100 text-red-700",
    Considering: "bg-yellow-100 text-yellow-700",
  };
  const v = value || "Considering";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[v] || "bg-gray-100"}`}>
      {v}
    </span>
  );
}
