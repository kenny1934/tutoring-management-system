"use client";

import React, { useState, useCallback, useMemo, useRef } from "react";
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
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
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
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const PASTE_SHORTCUT = IS_MAC ? "Cmd+V" : "Ctrl+V";

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

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full ${inputSmall} ${required && !value.trim() ? "border-red-400 bg-red-50" : ""}`}
        placeholder={placeholder}
      />
    </div>
  );
}

// ---- Main Page ----

export default function ProspectPage() {
  const searchParams = useSearchParams();
  const branchParam = searchParams.get("branch")?.toUpperCase() as ProspectBranch | undefined;
  const branch = branchParam && PROSPECT_BRANCHES.includes(branchParam) ? branchParam : null;

  const year = CURRENT_YEAR;
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
  const [pasteZoneFocused, setPasteZoneFocused] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<PrimaryProspect>>({});
  const parseInfoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const submittedRef = useRef<HTMLElement>(null);

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
    const row = createEmptyRow();
    setParsedRows((prev) => [...prev, row]);
    setExpandedKeys((prev) => new Set([...prev, row._key]));
  }, []);

  const clearAllRows = useCallback(() => {
    if (!confirm("Clear all parsed rows?")) return;
    setParsedRows([]);
    setExpandedKeys(new Set());
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleExpandAll = useCallback(() => {
    setExpandedKeys((prev) =>
      prev.size === parsedRows.length
        ? new Set()
        : new Set(parsedRows.map((r) => r._key))
    );
  }, [parsedRows]);

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
      setExpandedKeys(new Set());
      if (swrKey) globalMutate(swrKey);
      setTimeout(() => submittedRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
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
      <div className="max-w-lg mx-auto py-4">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8 sm:p-10 text-center space-y-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">P6 Student Registration</h1>
            <p className="text-muted-foreground mt-2">
              Register P6 students transitioning to secondary ({CURRENT_YEAR}). Select your branch to begin.
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
    <div className="space-y-6 max-w-none">
      {/* Header */}
      <div className="bg-primary/5 rounded-2xl p-5 sm:p-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {branch} — P6 Student Registration ({year})
            </h1>
            <a href="/summer/prospect" className="text-xs text-muted-foreground hover:text-primary transition-colors mt-0.5 inline-block">
              &larr; Change branch
            </a>
          </div>
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
              className="absolute inset-0 opacity-0 pointer-events-none resize-none"
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
                <p className="text-base font-semibold text-primary">Ready — press {PASTE_SHORTCUT} to paste</p>
                <p className="text-sm text-muted-foreground mt-1">Paste your student data from Excel</p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-foreground">Paste student data here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click here, then press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">{PASTE_SHORTCUT}</kbd> to paste from Excel
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
              className="absolute inset-0 opacity-0 pointer-events-none resize-none"
              onPaste={handleClipboardPaste}
              onFocus={() => setPasteZoneFocused(true)}
              onBlur={() => setPasteZoneFocused(false)}
              value=""
              onChange={() => {}}
              aria-label="Paste more student data"
            />
            <ClipboardPaste className={`h-4 w-4 shrink-0 transition-colors ${pasteZoneFocused ? "text-primary" : "text-primary/60"}`} />
            <span className={`text-sm transition-colors ${pasteZoneFocused ? "text-primary font-medium" : "text-muted-foreground"}`}>
              {pasteZoneFocused ? <>Ready — press {PASTE_SHORTCUT} to paste</> : "Paste more data to append rows"}
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

        {/* Parsed Table — compact main rows with expandable detail panels */}
        {parsedRows.length > 0 && (
          <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-primary/5 border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground w-8">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Name</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Grade</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Tutor</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Phone</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">School</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Summer</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Regular</th>
                  <th className="px-3 py-2.5 w-20">
                    <button
                      onClick={toggleExpandAll}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      title={expandedKeys.size === parsedRows.length ? "Collapse all" : "Expand all"}
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((row, idx) => {
                  const w = rowWarnings[idx];
                  const isExpanded = expandedKeys.has(row._key);
                  return (
                    <React.Fragment key={row._key}>
                      {/* Main row — read-only display */}
                      <tr
                        className={`border-t border-border/50 cursor-pointer transition-colors ${isExpanded ? "bg-primary/[0.03]" : "hover:bg-primary/[0.03]"}`}
                        onClick={() => toggleExpand(row._key)}
                      >
                        <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono">
                          {idx + 1}
                          {(w?.duplicateInBatch || w?.alreadySubmitted) && (
                            <AlertTriangle className="inline h-3 w-3 ml-0.5 text-yellow-500" />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`font-medium ${w?.missingName ? "text-red-500" : "text-foreground"}`}>
                            {row.student_name || <span className="text-red-400 italic">Name required</span>}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.grade}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.tutor_name || "-"}</td>
                        <td className="px-3 py-2.5 text-xs">
                          <span
                            className={w?.alreadySubmitted ? "text-orange-600 font-medium" : w?.invalidPhone ? "text-yellow-600" : "text-muted-foreground"}
                            title={w?.alreadySubmitted ? "Already in submitted records" : w?.duplicateInBatch ? "Duplicate in batch" : w?.invalidPhone ? "Should be 8 digits" : ""}
                          >
                            {row.phone_1 || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.school || "-"}</td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <IntentionSelect value={row.wants_summer} onChange={(v) => updateRow(row._key, "wants_summer", v)} />
                        </td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <IntentionSelect value={row.wants_regular} onChange={(v) => updateRow(row._key, "wants_regular", v)} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                              title={isExpanded ? "Collapse" : "Expand details"}
                              onClick={(e) => { e.stopPropagation(); toggleExpand(row._key); }}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeRow(row._key); }}
                              className="p-1 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Remove row"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="px-3 py-3 bg-primary/[0.02] border-t border-dashed border-border">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                              <FieldInput label="Student ID" value={row.primary_student_id} onChange={(v) => updateRow(row._key, "primary_student_id", v)} />
                              <FieldInput label="Student Name" value={row.student_name} onChange={(v) => updateRow(row._key, "student_name", v)} required />
                              <FieldInput label="Phone" value={row.phone_1} onChange={(v) => updateRow(row._key, "phone_1", v)} type="tel" inputMode="numeric" />
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Phone Relation</label>
                                <select
                                  value={row.phone_1_relation}
                                  onChange={(e) => updateRow(row._key, "phone_1_relation", e.target.value)}
                                  className={`w-full ${inputSmall}`}
                                >
                                  {PHONE_RELATIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                                </select>
                              </div>
                              <FieldInput label="WeChat ID" value={row.wechat_id} onChange={(v) => updateRow(row._key, "wechat_id", v)} placeholder="WeChat ID" />
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Preferred Branch</label>
                                <BranchCheckboxes value={row.preferred_branches} onChange={(v) => updateRow(row._key, "preferred_branches", v)} />
                              </div>
                              <FieldInput label="Time / Tutor Preference" value={row.preferred_time_note} onChange={(v) => updateRow(row._key, "preferred_time_note", v)} placeholder="e.g. Sat afternoon, Kenny Sir" />
                              <FieldInput label="Sibling Info" value={row.sibling_info} onChange={(v) => updateRow(row._key, "sibling_info", v)} placeholder="e.g. 1397 Elvanie (sister)" />
                              <div className="col-span-full">
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Tutor Remark</label>
                                <textarea
                                  value={row.tutor_remark}
                                  onChange={(e) => updateRow(row._key, "tutor_remark", e.target.value)}
                                  className={`w-full ${inputSmall} resize-y`}
                                  rows={2}
                                  placeholder="Notes about the student's ability, learning style, etc."
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

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
      <section ref={submittedRef} className="bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8 space-y-5">
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
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !existing || existing.length === 0 ? (
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
            <table className="w-full text-sm">
              <thead className="bg-primary/5 border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Name</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Grade</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Phone</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">School</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Summer</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Regular</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Outreach</th>
                  <th className="px-3 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody>
                {existing.map((p) => {
                  const isEditing = editingId === p.id;
                  const isOpen = editingId === p.id || expandedKeys.has(`sub-${p.id}`);
                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`border-t border-border/50 cursor-pointer transition-colors ${isOpen ? "bg-primary/[0.03]" : "hover:bg-primary/[0.03]"}`}
                        onClick={() => {
                          if (!isEditing) {
                            setExpandedKeys((prev) => {
                              const key = `sub-${p.id}`;
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }
                        }}
                      >
                        <td className="px-3 py-2.5 font-medium text-foreground">{p.student_name}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.grade}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {p.phone_1}
                          {p.phone_1_relation && <span className="text-[10px] ml-0.5">({p.phone_1_relation})</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.school || "-"}</td>
                        <td className="px-3 py-2.5"><IntentionBadge value={p.wants_summer} /></td>
                        <td className="px-3 py-2.5"><IntentionBadge value={p.wants_regular} /></td>
                        <td className="px-3 py-2.5"><OutreachBadge status={p.outreach_status} /></td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                              title={isOpen ? "Collapse" : "Expand"}
                              onClick={() => {
                                setExpandedKeys((prev) => {
                                  const key = `sub-${p.id}`;
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                            >
                              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            {!isEditing && (
                              <>
                                <button
                                  onClick={() => startEdit(p)}
                                  className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(p.id)}
                                  className="p-1 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="px-3 py-3 bg-primary/[0.02] border-t border-dashed border-border">
                            {isEditing ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                                  <FieldInput label="Student Name" value={editData.student_name as string ?? p.student_name} onChange={(v) => setEditData((d) => ({ ...d, student_name: v }))} required />
                                  <FieldInput label="Phone" value={editData.phone_1 as string ?? p.phone_1 ?? ""} onChange={(v) => setEditData((d) => ({ ...d, phone_1: v }))} type="tel" inputMode="numeric" />
                                  <FieldInput label="WeChat ID" value={editData.wechat_id as string ?? p.wechat_id ?? ""} onChange={(v) => setEditData((d) => ({ ...d, wechat_id: v }))} placeholder="WeChat ID" />
                                  <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Summer</label>
                                    <IntentionSelect
                                      value={(editData.wants_summer as ProspectIntention) ?? (p.wants_summer as ProspectIntention) ?? "Considering"}
                                      onChange={(v) => setEditData((d) => ({ ...d, wants_summer: v }))}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Regular (Sept)</label>
                                    <IntentionSelect
                                      value={(editData.wants_regular as ProspectIntention) ?? (p.wants_regular as ProspectIntention) ?? "Considering"}
                                      onChange={(v) => setEditData((d) => ({ ...d, wants_regular: v }))}
                                    />
                                  </div>
                                  <div className="col-span-full">
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Tutor Remark</label>
                                    <textarea
                                      value={editData.tutor_remark as string ?? p.tutor_remark ?? ""}
                                      onChange={(e) => setEditData((d) => ({ ...d, tutor_remark: e.target.value }))}
                                      className={`w-full ${inputSmall} resize-y`}
                                      rows={2}
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => saveEdit(p.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                                    <Check className="h-3.5 w-3.5" /> Save
                                  </button>
                                  <button onClick={cancelEdit} className="px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                                <div><span className="text-xs text-muted-foreground">ID:</span> <span className="font-mono text-xs">{p.primary_student_id || "-"}</span></div>
                                <div><span className="text-xs text-muted-foreground">Tutor:</span> {p.tutor_name || "-"}</div>
                                <div><span className="text-xs text-muted-foreground">WeChat:</span> {p.wechat_id || "-"}</div>
                                <div><span className="text-xs text-muted-foreground">Pref. Branch:</span> {(p.preferred_branches || []).join(", ") || "-"}</div>
                                <div><span className="text-xs text-muted-foreground">Time/Tutor:</span> {p.preferred_time_note || "-"}</div>
                                <div><span className="text-xs text-muted-foreground">Sibling:</span> {p.sibling_info || "-"}</div>
                                {p.tutor_remark && (
                                  <div className="col-span-full border-l-4 border-primary/20 pl-3 py-1 bg-primary/[0.02] rounded-r">
                                    <span className="text-xs text-muted-foreground">Remark:</span> <span className="text-xs">{p.tutor_remark}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
