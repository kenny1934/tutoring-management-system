"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import {
  Building2,
  GraduationCap,
  ClipboardPaste,
  ListChecks,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertCircle,
  FileSearch,
  Plus,
  X,
  Check,
  Info,
  AlertTriangle,
} from "lucide-react";
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

// ---- Shared styles ----

const inputSmall =
  "text-xs border-2 border-border rounded-lg px-2 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors duration-200";

// ---- Types for parsed rows ----

interface ParsedRow {
  _key: string;
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
  preferred_time_note: string;
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

// ---- Color maps (hoisted for perf) ----

const INTENTION_SELECT_COLORS: Record<ProspectIntention, string> = {
  Yes: "bg-green-50 text-green-700 border-green-300",
  No: "bg-red-50 text-red-700 border-red-300",
  Considering: "bg-yellow-50 text-yellow-700 border-yellow-300",
};

const INTENTION_BADGE_COLORS: Record<string, string> = {
  Yes: "bg-green-100 text-green-700",
  No: "bg-red-100 text-red-700",
  Considering: "bg-yellow-100 text-yellow-700",
};

const OUTREACH_BADGE_COLORS: Record<string, string> = {
  "Not Started": "bg-gray-100 text-gray-600",
  "WeChat - Not Found": "bg-red-100 text-red-700",
  "WeChat - Cannot Add": "bg-orange-100 text-orange-700",
  "WeChat - Added": "bg-green-100 text-green-700",
  Called: "bg-blue-100 text-blue-700",
  "No Response": "bg-yellow-100 text-yellow-700",
};

// ---- Small Components ----

function IntentionSelect({
  value,
  onChange,
}: {
  value: ProspectIntention;
  onChange: (v: ProspectIntention) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ProspectIntention)}
      className={`text-xs px-2 py-1.5 rounded-lg border-2 cursor-pointer font-medium transition-colors duration-200 ${INTENTION_SELECT_COLORS[value]}`}
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
        <label
          key={b}
          className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border-2 transition-all duration-200 font-medium ${
            value.includes(b)
              ? "bg-primary/10 border-primary text-primary"
              : "border-border hover:border-primary/50"
          }`}
        >
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
            className="sr-only"
          />
          {value.includes(b) && <Check className="h-3 w-3" />}
          {b}
        </label>
      ))}
    </div>
  );
}

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

// ---- Main Page ----

export default function ProspectPage() {
  const searchParams = useSearchParams();
  const branchParam = searchParams.get("branch")?.toUpperCase() as ProspectBranch | undefined;
  const branch = branchParam && PROSPECT_BRANCHES.includes(branchParam) ? branchParam : null;

  const [year, setYear] = useState(CURRENT_YEAR);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
  const [pasteZoneFocused, setPasteZoneFocused] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<PrimaryProspect>>({});
  const parseInfoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const swrKey = branch ? `prospects-${branch}-${year}` : null;
  const { data: existing, isLoading } = useSWR(
    swrKey,
    () => prospectsAPI.list(branch!, year),
    { revalidateOnFocus: false }
  );

  // ---- Duplicate & validation detection ----

  const existingPhones = useMemo(() => {
    const set = new Set<string>();
    for (const e of existing || []) {
      if (e.phone_1) set.add(e.phone_1);
    }
    return set;
  }, [existing]);

  const rowWarnings = useMemo(() => {
    const phoneCounts = new Map<string, number>();
    for (const r of parsedRows) {
      if (r.phone_1) phoneCounts.set(r.phone_1, (phoneCounts.get(r.phone_1) || 0) + 1);
    }
    return parsedRows.map((r) => ({
      duplicateInBatch: r.phone_1 ? (phoneCounts.get(r.phone_1) || 0) > 1 : false,
      alreadySubmitted: r.phone_1 ? existingPhones.has(r.phone_1) : false,
      invalidPhone: r.phone_1 ? !/^\d{8}$/.test(r.phone_1) : false,
      missingName: !r.student_name.trim(),
    }));
  }, [parsedRows, existingPhones]);

  const validCount = parsedRows.filter((r) => r.student_name.trim()).length;
  const warningCount = rowWarnings.filter((w) => w.invalidPhone || w.duplicateInBatch || w.alreadySubmitted).length;

  // ---- Paste & Parse ----

  const focusPasteArea = useCallback(() => pasteRef.current?.focus(), []);

  const handleClipboardPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    e.preventDefault();
    const rows = parsePastedData(text);
    if (rows.length > 0) {
      setParsedRows((prev) => [...prev, ...rows]);
      setSubmitResult(null);
      setParseInfo(`Parsed ${rows.length} student${rows.length !== 1 ? "s" : ""} from clipboard`);
      if (parseInfoTimer.current) clearTimeout(parseInfoTimer.current);
      parseInfoTimer.current = setTimeout(() => setParseInfo(null), 3000);
    }
  }, []);

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

  const clearAllRows = useCallback(() => {
    if (!confirm("Clear all parsed rows?")) return;
    setParsedRows([]);
  }, []);

  // ---- Submit ----

  const handleSubmit = useCallback(async () => {
    if (!branch || parsedRows.length === 0) return;

    const valid = parsedRows.filter((r) => r.student_name.trim());
    if (valid.length === 0) {
      setSubmitResult({ ok: false, message: "No valid rows to submit (student name is required)" });
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

      setSubmitResult({ ok: true, message: `${result.created} students submitted successfully` });
      setParsedRows([]);
      if (swrKey) globalMutate(swrKey);
    } catch (err) {
      setSubmitResult({ ok: false, message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  }, [branch, parsedRows, year, swrKey]);

  // ---- Inline edit ----

  const startEdit = useCallback((prospect: PrimaryProspect) => {
    setEditingId(prospect.id);
    setEditData({
      student_name: prospect.student_name,
      phone_1: prospect.phone_1 ?? "",
      wechat_id: prospect.wechat_id ?? "",
      tutor_remark: prospect.tutor_remark ?? "",
      wants_summer: prospect.wants_summer,
      wants_regular: prospect.wants_regular,
    });
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
  }, [editData, swrKey, branch]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Delete this entry?")) return;
    try {
      await prospectsAPI.delete(id, branch!);
      if (swrKey) globalMutate(swrKey);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [swrKey, branch]);

  // ---- Branch Selector ----

  if (!branch) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8 sm:p-10 text-center space-y-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">P6 Student Registration</h1>
            <p className="text-muted-foreground mt-2">
              Register P6 students transitioning to secondary. Select your branch to begin.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PROSPECT_BRANCHES.map((b) => (
              <a
                key={b}
                href={`/summer/prospect?branch=${b}`}
                className="group flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border bg-card hover:border-primary hover:shadow-md hover:scale-[1.02] transition-all duration-200"
              >
                <Building2 className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="font-semibold text-foreground">{b}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- Main Form ----

  return (
    <div className="py-6 space-y-6 max-w-none">
      {/* Header */}
      <div className="bg-primary/5 rounded-2xl p-5 sm:p-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {branch} — P6 Student Registration
            </h1>
            <p className="text-sm text-muted-foreground">
              Register P6 students transitioning to secondary
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="text-sm border-2 border-border rounded-xl px-3 py-2 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors"
          >
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Result Alert */}
      {submitResult && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border-2 text-sm font-medium transition-all duration-300 ${
            submitResult.ok
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {submitResult.ok ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          {submitResult.message}
        </div>
      )}

      {/* Section A: Paste & Submit */}
      <section className="bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-2">
          <ClipboardPaste className="h-5 w-5 text-primary/70" />
          <h2 className="text-lg font-semibold">Add Students</h2>
        </div>

        {/* Paste Zone */}
        {parsedRows.length === 0 ? (
          /* Large paste zone — no rows yet */
          <div
            onClick={focusPasteArea}
            className={`relative border-2 rounded-2xl p-10 transition-all duration-200 cursor-pointer text-center ${
              pasteZoneFocused
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-dashed border-primary/30 bg-primary/[0.02] hover:bg-primary/5 hover:border-primary/50"
            }`}
          >
            <textarea
              ref={pasteRef}
              className="absolute inset-0 opacity-0 cursor-pointer resize-none"
              onPaste={handleClipboardPaste}
              onFocus={() => setPasteZoneFocused(true)}
              onBlur={() => setPasteZoneFocused(false)}
              value=""
              onChange={() => {}}
              aria-label="Paste student data from clipboard"
            />
            <ClipboardPaste className={`h-10 w-10 mx-auto mb-3 transition-colors ${pasteZoneFocused ? "text-primary" : "text-primary/40"}`} />
            {pasteZoneFocused ? (
              <>
                <p className="text-base font-semibold text-primary">Ready — press Ctrl+V to paste</p>
                <p className="text-sm text-muted-foreground mt-1">Or Cmd+V on Mac</p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-foreground">Paste student data here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click here, then press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">Ctrl+V</kbd> to paste from Excel
                </p>
              </>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); addEmptyRow(); }}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Or add a row manually
            </button>
          </div>
        ) : (
          /* Collapsed paste strip — rows exist */
          <div
            onClick={focusPasteArea}
            className={`relative border-2 rounded-xl p-3 flex items-center gap-3 transition-all duration-200 cursor-pointer ${
              pasteZoneFocused
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-dashed border-border bg-muted/30 hover:border-primary/30"
            }`}
          >
            <textarea
              ref={pasteRef}
              className="absolute inset-0 opacity-0 cursor-pointer resize-none"
              onPaste={handleClipboardPaste}
              onFocus={() => setPasteZoneFocused(true)}
              onBlur={() => setPasteZoneFocused(false)}
              value=""
              onChange={() => {}}
              aria-label="Paste more student data"
            />
            <ClipboardPaste className={`h-4 w-4 shrink-0 transition-colors ${pasteZoneFocused ? "text-primary" : "text-primary/60"}`} />
            <span className={`text-sm transition-colors ${pasteZoneFocused ? "text-primary font-medium" : "text-muted-foreground"}`}>
              {pasteZoneFocused ? "Ready — press Ctrl+V to paste" : "Paste more data to append rows"}
            </span>
          </div>
        )}

        {/* Parse info banner */}
        {parseInfo && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-sm font-medium transition-all duration-300">
            <Info className="h-4 w-4 shrink-0" />
            {parseInfo}
          </div>
        )}

        {/* Parsed Table */}
        {parsedRows.length > 0 && (
          <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary/10">
                    <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-primary/70 uppercase tracking-wider" colSpan={5}>Student Info</th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-primary/70 uppercase tracking-wider border-l border-primary/10" colSpan={4}>Contact</th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-primary/70 uppercase tracking-wider border-l border-primary/10" colSpan={6}>Intentions & Preferences</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                  <tr className="bg-primary/5 border-b border-border">
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground w-8">#</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">ID</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Name *</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Grade</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Tutor</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground border-l border-primary/10">Phone</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Relation</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">School</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">WeChat</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground border-l border-primary/10">Remark</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Summer</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Regular</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Branch</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Time/Tutor</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Sibling</th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {parsedRows.map((row, idx) => {
                    const w = rowWarnings[idx];
                    return (
                      <tr key={row._key} className="hover:bg-primary/[0.03] transition-colors">
                        <td className="px-2 py-2 text-muted-foreground text-xs font-mono">
                          {idx + 1}
                          {(w?.duplicateInBatch || w?.alreadySubmitted) && (
                            <AlertTriangle className="inline h-3 w-3 ml-0.5 text-yellow-500" />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input value={row.primary_student_id} onChange={(e) => updateRow(row._key, "primary_student_id", e.target.value)} className={`w-16 ${inputSmall}`} />
                        </td>
                        <td className="px-2 py-2">
                          <input value={row.student_name} onChange={(e) => updateRow(row._key, "student_name", e.target.value)} className={`w-32 ${inputSmall} ${w?.missingName ? "border-red-400 bg-red-50" : ""}`} />
                        </td>
                        <td className="px-2 py-2">
                          <input value={row.grade} onChange={(e) => updateRow(row._key, "grade", e.target.value)} className={`w-14 ${inputSmall}`} />
                        </td>
                        <td className="px-2 py-2">
                          <input value={row.tutor_name} onChange={(e) => updateRow(row._key, "tutor_name", e.target.value)} className={`w-20 ${inputSmall}`} />
                        </td>
                        <td className="px-2 py-2">
                          <div className="relative">
                            <input
                              type="tel"
                              inputMode="numeric"
                              value={row.phone_1}
                              onChange={(e) => updateRow(row._key, "phone_1", e.target.value)}
                              className={`w-24 ${inputSmall} ${w?.invalidPhone ? "border-yellow-400 bg-yellow-50" : ""} ${w?.duplicateInBatch ? "border-yellow-400" : ""} ${w?.alreadySubmitted ? "border-orange-400 bg-orange-50" : ""}`}
                              title={w?.alreadySubmitted ? "This phone is already in submitted records" : w?.duplicateInBatch ? "Duplicate phone within this batch" : w?.invalidPhone ? "Phone should be 8 digits" : ""}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <select value={row.phone_1_relation} onChange={(e) => updateRow(row._key, "phone_1_relation", e.target.value)} className={`${inputSmall}`}>
                            {PHONE_RELATIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input value={row.school} onChange={(e) => updateRow(row._key, "school", e.target.value)} className={`w-16 ${inputSmall}`} />
                        </td>
                        <td className="px-2 py-2">
                          <input value={row.wechat_id} onChange={(e) => updateRow(row._key, "wechat_id", e.target.value)} className={`w-24 ${inputSmall}`} placeholder="WeChat ID" />
                        </td>
                        <td className="px-2 py-2">
                          <input value={row.tutor_remark} onChange={(e) => updateRow(row._key, "tutor_remark", e.target.value)} className={`w-32 ${inputSmall}`} placeholder="Notes..." />
                        </td>
                        <td className="px-2 py-2">
                          <IntentionSelect value={row.wants_summer} onChange={(v) => updateRow(row._key, "wants_summer", v)} />
                        </td>
                        <td className="px-2 py-2">
                          <IntentionSelect value={row.wants_regular} onChange={(v) => updateRow(row._key, "wants_regular", v)} />
                        </td>
                        <td className="px-2 py-2">
                          <BranchCheckboxes value={row.preferred_branches} onChange={(v) => updateRow(row._key, "preferred_branches", v)} />
                        </td>
                        <td className="px-2 py-2">
                          <input value={row.preferred_time_note} onChange={(e) => updateRow(row._key, "preferred_time_note", e.target.value)} className={`w-28 ${inputSmall}`} placeholder="Time/tutor pref..." />
                        </td>
                        <td className="px-2 py-2">
                          <input value={row.sibling_info} onChange={(e) => updateRow(row._key, "sibling_info", e.target.value)} className={`w-28 ${inputSmall}`} placeholder="Sibling info..." />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => removeRow(row._key)}
                            className="p-1 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove row"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-border bg-primary/5 flex items-center justify-between sticky bottom-0 z-10">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-medium text-xs">
                    {validCount}
                  </span>
                  <span className="ml-1.5">ready</span>
                  {warningCount > 0 && (
                    <>
                      <span className="mx-1.5 text-muted-foreground/50">|</span>
                      <span className="inline-flex items-center gap-1 text-yellow-600 text-xs font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        {warningCount} warning{warningCount !== 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                </span>
                <button
                  onClick={addEmptyRow}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add Row
                </button>
                <button
                  onClick={clearAllRows}
                  className="text-xs font-medium text-muted-foreground hover:text-red-600 transition-colors"
                >
                  Clear All
                </button>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || validCount === 0}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 font-medium transition-colors duration-200"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Submit All
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section B: Previously Submitted */}
      <section className="bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary/70" />
          <h2 className="text-lg font-semibold">
            Submitted Students
            {existing && existing.length > 0 && (
              <span className="ml-2 inline-flex items-center bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-medium text-xs">
                {existing.length}
              </span>
            )}
          </h2>
        </div>

        {isLoading ? (
          /* Skeleton loading */
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !existing || existing.length === 0 ? (
          /* Empty state */
          <div className="text-center py-10">
            <FileSearch className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No students submitted yet for <strong>{branch}</strong> ({year}).
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Paste student data above to get started.
            </p>
          </div>
        ) : (
          <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-primary/5 border-b border-border">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">ID</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Name</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Grade</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Tutor</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Phone</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">School</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">WeChat</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Remark</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Summer</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Regular</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Branch</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Outreach</th>
                    <th className="px-3 py-2.5 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {existing.map((p) => {
                    const isEditing = editingId === p.id;
                    return (
                      <tr
                        key={p.id}
                        className={`transition-all duration-200 ${
                          isEditing
                            ? "bg-primary/5 ring-2 ring-inset ring-primary/20"
                            : "hover:bg-primary/[0.03]"
                        }`}
                      >
                        <td className="px-3 py-2 text-muted-foreground text-xs font-mono">
                          {p.primary_student_id || "-"}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input value={editData.student_name ?? p.student_name} onChange={(e) => setEditData((d) => ({ ...d, student_name: e.target.value }))} className={`w-32 ${inputSmall}`} />
                          ) : (
                            <span className="text-sm font-medium text-foreground">{p.student_name}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{p.grade}</td>
                        <td className="px-3 py-2 text-xs">{p.tutor_name}</td>
                        <td className="px-3 py-2 text-xs">
                          {isEditing ? (
                            <input value={editData.phone_1 ?? p.phone_1 ?? ""} onChange={(e) => setEditData((d) => ({ ...d, phone_1: e.target.value }))} className={`w-24 ${inputSmall}`} />
                          ) : (
                            <span>
                              {p.phone_1}
                              {p.phone_1_relation && (
                                <span className="text-muted-foreground ml-1 text-[10px]">({p.phone_1_relation})</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{p.school}</td>
                        <td className="px-3 py-2 text-xs">
                          {isEditing ? (
                            <input value={editData.wechat_id ?? p.wechat_id ?? ""} onChange={(e) => setEditData((d) => ({ ...d, wechat_id: e.target.value }))} className={`w-24 ${inputSmall}`} placeholder="WeChat ID" />
                          ) : (
                            p.wechat_id || <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[150px] truncate" title={p.tutor_remark || ""}>
                          {isEditing ? (
                            <input value={editData.tutor_remark ?? p.tutor_remark ?? ""} onChange={(e) => setEditData((d) => ({ ...d, tutor_remark: e.target.value }))} className={`w-32 ${inputSmall}`} />
                          ) : (
                            p.tutor_remark || <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <IntentionSelect
                              value={(editData.wants_summer as ProspectIntention) ?? (p.wants_summer as ProspectIntention) ?? "Considering"}
                              onChange={(v) => setEditData((d) => ({ ...d, wants_summer: v }))}
                            />
                          ) : (
                            <IntentionBadge value={p.wants_summer} />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <IntentionSelect
                              value={(editData.wants_regular as ProspectIntention) ?? (p.wants_regular as ProspectIntention) ?? "Considering"}
                              onChange={(v) => setEditData((d) => ({ ...d, wants_regular: v }))}
                            />
                          ) : (
                            <IntentionBadge value={p.wants_regular} />
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {(p.preferred_branches || []).join(", ") || "-"}
                        </td>
                        <td className="px-3 py-2">
                          <OutreachBadge status={p.outreach_status} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(p.id)}
                                  className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                                  title="Save"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-gray-100 transition-colors"
                                  title="Cancel"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(p)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(p.id)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
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
          </div>
        )}
      </section>
    </div>
  );
}
