"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  ChevronsUpDown,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Lock,
  UserPlus,
  RefreshCw,
  HelpCircle,
  MousePointerClick,
  Keyboard,
  Table2,
  Sparkles,
  ArrowRight,
  ClipboardCheck,
  Copy,
} from "lucide-react";
import { prospectsAPI } from "@/lib/api";
import { useFormDirtyTracking, useCooldown } from "@/lib/ui-hooks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { KNOWN_SCHOOLS } from "@/lib/school-list";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import {
  IntentionBadge,
  OutreachBadge,
  BranchBadges,
  CopyableCell,
  INTENTION_LABELS,
  BRANCH_COLORS,
} from "@/components/summer/prospect-badges";
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
const PHONE_RELATIONS = ["Mother", "Father", "Guardian", "Other"] as const;
const INTENTIONS: ProspectIntention[] = ["Yes", "No", "Considering"];
const OUTREACH_OPTIONS: ProspectOutreachStatus[] = ["Not Started", "WeChat - Not Found", "WeChat - Cannot Add", "WeChat - Added", "Called", "No Response"];
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const PASTE_SHORTCUT = IS_MAC ? "Cmd+V" : "Ctrl+V";

function daysAgo(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function relativeTime(dateStr: string | null): string {
  const days = daysAgo(dateStr);
  if (days === 0) return "Today";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function wasEdited(submitted: string | null, updated: string | null): boolean {
  if (!submitted || !updated) return false;
  return new Date(updated).getTime() - new Date(submitted).getTime() > 5000;
}

function outreachUrgency(status: ProspectOutreachStatus): "action" | "progress" | "done" {
  if (status === "Not Started" || status === "No Response") return "action";
  if (status === "WeChat - Not Found" || status === "WeChat - Cannot Add") return "progress";
  return "done";
}

const URGENCY_BORDER: Record<string, string> = {
  action: "border-l-[3px] border-l-red-300",
  progress: "border-l-[3px] border-l-amber-300",
  done: "border-l-[3px] border-l-green-400",
};

function isRowComplete(r: { primary_student_id: string; student_name: string; school: string; grade: string; tutor_name: string; phone_1: string }): boolean {
  return !!(r.primary_student_id.trim() && r.student_name.trim() && r.school.trim() && r.grade.trim() && r.tutor_name.trim() && r.phone_1.trim());
}

type SortField = "id" | "name" | "school" | "tutor" | null;

const SORT_FIELD_KEYS: Record<Exclude<SortField, null>, string> = {
  id: "primary_student_id",
  name: "student_name",
  school: "school",
  tutor: "tutor_name",
};

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
    phone_1_relation: "Mother",
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

function createEmptyFormValues(): ProspectFormValues {
  return {
    primary_student_id: "",
    student_name: "",
    school: "",
    grade: "P6",
    tutor_name: "",
    phone_1: "",
    phone_1_relation: "Mother",
    phone_2: "",
    phone_2_relation: "",
    wechat_id: "",
    wants_summer: "Considering",
    wants_regular: "Considering",
    preferred_branches: [],
    preferred_time_note: "",
    tutor_remark: "",
  };
}

function toBulkItem(r: ParsedRow | ProspectFormValues): PrimaryProspectBulkItem {
  return {
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
    ...("sibling_info" in r && r.sibling_info ? { sibling_info: r.sibling_info } : {}),
  };
}

// ---- Parse pasted data (smart column detection) ----

const HEADER_PATTERNS: Record<string, RegExp> = {
  id: /^(id|id#|student.?id|編號)$/i,
  name: /^(name|student|student.?name|姓名)$/i,
  grade: /^(grade|class|年級)$/i,
  tutor: /^(tutor|instructor|teacher|導師)$/i,
  phone: /^(phone|mobile|tel|電話)$/i,
  school: /^(school|學校)$/i,
};

const IS_PHONE = /^\d{8}(\.0)?$/;
const IS_ID = /^[A-Za-z]{1,4}\d{3,5}(\.0)?$/;
const IS_GRADE = /^[PpFf]\d/;
const IS_TUTOR = /^(mr|ms|miss)\s/i;

function detectColumnMap(headerCols: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  let matchCount = 0;
  for (let i = 0; i < headerCols.length; i++) {
    const col = headerCols[i].trim();
    for (const [field, pattern] of Object.entries(HEADER_PATTERNS)) {
      if (pattern.test(col) && !(field in map)) {
        map[field] = i;
        matchCount++;
        break;
      }
    }
  }
  // Need at least 2 recognized headers to consider it a header row
  return matchCount >= 2 ? map : null;
}

function detectColumnsFromData(cols: string[]): { id: string; name: string; grade: string; tutor: string; phone: string; school: string } {
  let id = "", name = "", grade = "", tutor = "", phone = "", school = "";
  const used = new Set<number>();

  // Pass 1: Find phone (8-digit number, scan from end)
  for (let i = cols.length - 1; i >= 0; i--) {
    if (IS_PHONE.test(cols[i])) { phone = cols[i].replace(/\.0$/, ""); used.add(i); break; }
  }

  // Pass 2: Find ID (alphanumeric code pattern)
  for (let i = 0; i < cols.length; i++) {
    if (!used.has(i) && IS_ID.test(cols[i])) { id = cols[i].replace(/\.0$/, ""); used.add(i); break; }
  }

  // Pass 3: Find grade (P6, F1, F3/G9 etc.)
  for (let i = 0; i < cols.length; i++) {
    if (!used.has(i) && IS_GRADE.test(cols[i])) { grade = cols[i]; used.add(i); break; }
  }

  // Pass 4: Find tutor (Mr/Ms/Miss prefix)
  for (let i = 0; i < cols.length; i++) {
    if (!used.has(i) && IS_TUTOR.test(cols[i])) { tutor = cols[i]; used.add(i); break; }
  }

  // Pass 5: If no letter-prefixed ID found, use first column as ID (numeric IDs like "1001")
  if (!id && cols[0] && /^\d{3,5}(\.0)?$/.test(cols[0]) && !used.has(0)) {
    id = cols[0].replace(/\.0$/, "");
    used.add(0);
  }

  // Pass 6: Name = first unused text column that's not empty/dash/date/numeric
  for (let i = 0; i < cols.length; i++) {
    if (!used.has(i) && cols[i] && cols[i] !== "--" && !/^\d+$/.test(cols[i]) && !/^\d{4}-\d{2}/.test(cols[i]) && !/^\[/.test(cols[i])) {
      name = cols[i]; used.add(i); break;
    }
  }

  return { id, name, grade, tutor, phone, school };
}

function normalizeStudentId(id: string, branch: string | null): string {
  if (branch && /^\d{3,5}$/.test(id)) return `${branch}${id}`;
  return id;
}

function parsePastedData(text: string, branch: string | null): { rows: ParsedRow[]; totalLines: number; skipped: number } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], totalLines: 0, skipped: 0 };

  const rows: ParsedRow[] = [];
  let startIdx = 0;
  let skipped = 0;
  let columnMap: Record<string, number> | null = null;

  // Check if first line is a header
  const firstCols = lines[0].split("\t").map((c) => c.trim());
  columnMap = detectColumnMap(firstCols);
  if (columnMap) startIdx = 1;

  for (let lineIdx = startIdx; lineIdx < lines.length; lineIdx++) {
    const cols = lines[lineIdx].split("\t").map((c) => c?.trim() ?? "");
    if (cols.length < 2) { skipped++; continue; }

    let id: string, name: string, grade: string, tutor: string, phone: string, school: string;

    if (columnMap) {
      id = columnMap.id != null ? (cols[columnMap.id] || "").replace(/\.0$/, "") : "";
      name = columnMap.name != null ? (cols[columnMap.name] || "") : "";
      grade = columnMap.grade != null ? (cols[columnMap.grade] || "") : "";
      tutor = columnMap.tutor != null ? (cols[columnMap.tutor] || "") : "";
      phone = columnMap.phone != null ? (cols[columnMap.phone] || "").replace(/\.0$/, "") : "";
      school = columnMap.school != null ? (cols[columnMap.school] || "") : "";
    } else {
      ({ id, name, grade, tutor, phone, school } = detectColumnsFromData(cols));
    }

    // Filter out Bobby template row
    if ((id === "1001") && (phone === "66666666")) { skipped++; continue; }
    // Filter out header-like rows
    if (/^id/i.test(id) && /name|student/i.test(name)) { skipped++; continue; }
    // Skip if no meaningful data
    if (!name && !phone) { skipped++; continue; }

    rows.push({
      ...createEmptyRow(),
      primary_student_id: normalizeStudentId(id, branch),
      student_name: name,
      grade: grade || "P6",
      tutor_name: tutor,
      phone_1: phone,
      school: school,
    });
  }

  // Header row counts as skipped if detected
  if (columnMap) skipped++;
  return { rows, totalLines: lines.length, skipped };
}

// ---- Color maps (page-specific) ----

const INTENTION_SELECT_COLORS: Record<ProspectIntention, string> = {
  Yes: "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
  No: "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
  Considering: "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700",
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
        <option key={i} value={i} className="text-foreground bg-card">
          {INTENTION_LABELS[i]}
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
    <div className="flex flex-wrap gap-2">
      {SECONDARY_BRANCHES.map((b) => (
        <label
          key={b}
          className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border-2 transition-all duration-200 font-medium ${
            value.includes(b)
              ? (BRANCH_COLORS[b]?.selected || "bg-primary/10 border-primary text-primary")
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
          {value.includes(b) && value.length > 1 && (
            <span className="text-[9px] opacity-60">{value.indexOf(b) === 0 ? "1st" : "2nd"}</span>
          )}
        </label>
      ))}
    </div>
  );
}

function SortableHeader({ label, dir, onToggle }: { label: string; dir: "asc" | "desc" | null; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors">
      {label}
      {dir === "asc" ? <ArrowUp className="h-3 w-3" /> : dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-30" />}
    </button>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="col-span-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-2 first:pt-0 border-t border-border/50 dark:border-gray-700 first:border-0">
      {label}
    </div>
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
  span,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  inputMode?: "numeric" | "text";
  span?: 2 | 3;
  error?: string;
}) {
  const hasError = error || (required && !value.trim());
  return (
    <div className={span === 3 ? "col-span-3" : span === 2 ? "col-span-2" : undefined}>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full ${inputSmall} ${hasError ? "border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-500" : ""}`}
        placeholder={placeholder}
      />
      {error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

function stripNonDigits(v: string): string {
  return v.replace(/\D/g, "");
}

function validatePhone(v: string): string | undefined {
  if (!v.trim()) return undefined; // empty is handled by required check
  if (!/^\d{8}$/.test(v)) return "Must be 8 digits";
  return undefined;
}

function validateStudentId(v: string, branch: string | null): string | undefined {
  if (!v.trim()) return undefined;
  if (!branch) return undefined;
  const pattern = new RegExp(`^${branch}\\d{4}$`);
  if (!pattern.test(v)) return `Expected ${branch} + 4 digits`;
  return undefined;
}

// ---- Shared form components ----

interface ProspectFormValues {
  primary_student_id: string;
  student_name: string;
  school: string;
  grade: string;
  tutor_name: string;
  phone_1: string;
  phone_1_relation: string;
  phone_2: string;
  phone_2_relation: string;
  wechat_id: string;
  wants_summer: ProspectIntention;
  wants_regular: ProspectIntention;
  preferred_branches: string[];
  preferred_time_note: string;
  tutor_remark: string;
}

function mergeEditValues(editData: Partial<PrimaryProspect>, p: PrimaryProspect): ProspectFormValues {
  return {
    primary_student_id: (editData.primary_student_id as string) ?? p.primary_student_id ?? "",
    student_name: (editData.student_name as string) ?? p.student_name,
    school: (editData.school as string) ?? p.school ?? "",
    grade: (editData.grade as string) ?? p.grade ?? "",
    tutor_name: (editData.tutor_name as string) ?? p.tutor_name ?? "",
    phone_1: (editData.phone_1 as string) ?? p.phone_1 ?? "",
    phone_1_relation: (editData.phone_1_relation as string) ?? p.phone_1_relation ?? "Mother",
    phone_2: (editData.phone_2 as string) ?? p.phone_2 ?? "",
    phone_2_relation: (editData.phone_2_relation as string) ?? p.phone_2_relation ?? "",
    wechat_id: (editData.wechat_id as string) ?? p.wechat_id ?? "",
    wants_summer: (editData.wants_summer as ProspectIntention) ?? (p.wants_summer as ProspectIntention) ?? "Considering",
    wants_regular: (editData.wants_regular as ProspectIntention) ?? (p.wants_regular as ProspectIntention) ?? "Considering",
    preferred_branches: (editData.preferred_branches as string[]) ?? p.preferred_branches ?? [],
    preferred_time_note: (editData.preferred_time_note as string) ?? p.preferred_time_note ?? "",
    tutor_remark: (editData.tutor_remark as string) ?? p.tutor_remark ?? "",
  };
}

function ProspectEditForm({
  values,
  onChange,
  branch,
  compact,
  onSave,
  onCancel,
}: {
  values: ProspectFormValues;
  onChange: (field: string, value: unknown) => void;
  branch: string | null;
  compact?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  const [showSchoolSuggestions, setShowSchoolSuggestions] = useState(false);
  const [schoolHighlight, setSchoolHighlight] = useState(-1);

  const schoolQuery = values.school.toLowerCase();
  const filteredSchools = useMemo(
    () => schoolQuery
      ? KNOWN_SCHOOLS.filter((s) => s.toLowerCase().includes(schoolQuery)).slice(0, 8)
      : [],
    [schoolQuery]
  );

  useEffect(() => { setSchoolHighlight(-1); }, [schoolQuery]);

  const hasRequired = isRowComplete(values);
  const hasFormatErrors = !!validatePhone(values.phone_1) || !!validatePhone(values.phone_2) || !!validateStudentId(values.primary_student_id, branch);
  const canSave = hasRequired && !hasFormatErrors;

  return (
    <div className="space-y-3">
      <div className={`grid gap-x-3 gap-y-2 text-sm ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
        <SectionDivider label="Student Info" />
        <FieldInput label="Student ID" value={values.primary_student_id} onChange={(v) => onChange("primary_student_id", normalizeStudentId(v, branch))} required error={validateStudentId(values.primary_student_id, branch)} />
        <FieldInput label="Student Name" value={values.student_name} onChange={(v) => onChange("student_name", v)} required span={compact ? undefined : 3} />
        <div className="relative">
          <label className="block text-xs font-medium text-muted-foreground mb-1">School</label>
          <input
            type="text"
            value={values.school}
            onChange={(e) => {
              onChange("school", e.target.value);
              setShowSchoolSuggestions(true);
            }}
            onFocus={() => setShowSchoolSuggestions(true)}
            onBlur={() => setShowSchoolSuggestions(false)}
            onKeyDown={(e) => {
              if (!showSchoolSuggestions || filteredSchools.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSchoolHighlight(prev => prev < filteredSchools.length - 1 ? prev + 1 : 0);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSchoolHighlight(prev => prev > 0 ? prev - 1 : filteredSchools.length - 1);
              } else if (e.key === "Enter" && schoolHighlight >= 0) {
                e.preventDefault();
                onChange("school", filteredSchools[schoolHighlight]);
                setShowSchoolSuggestions(false);
              } else if (e.key === "Escape") {
                setShowSchoolSuggestions(false);
              }
            }}
            placeholder="Search or enter school"
            className={`w-full ${inputSmall} ${!values.school.trim() ? "border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-500" : ""}`}
          />
          {showSchoolSuggestions && filteredSchools.length > 0 && (
            <div className="absolute z-10 w-full mt-0.5 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredSchools.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  ref={i === schoolHighlight ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange("school", s);
                    setShowSchoolSuggestions(false);
                  }}
                  onMouseEnter={() => setSchoolHighlight(i)}
                  className={`w-full px-2.5 py-1.5 text-left text-xs ${i === schoolHighlight ? "bg-muted" : "hover:bg-muted"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <FieldInput label="Grade" value={values.grade} onChange={(v) => onChange("grade", v)} required />
        <FieldInput label="Tutor" value={values.tutor_name} onChange={(v) => onChange("tutor_name", v)} required />

        <SectionDivider label="Contact" />
        <FieldInput label="Phone" value={values.phone_1} onChange={(v) => onChange("phone_1", stripNonDigits(v))} type="tel" inputMode="numeric" required error={validatePhone(values.phone_1)} />
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Phone Relation</label>
          <select value={values.phone_1_relation} onChange={(e) => onChange("phone_1_relation", e.target.value)} className={`w-full ${inputSmall}`}>
            {PHONE_RELATIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
        </div>
        <FieldInput label="Phone 2 (Optional)" value={values.phone_2} onChange={(v) => onChange("phone_2", stripNonDigits(v))} type="tel" inputMode="numeric" error={validatePhone(values.phone_2)} />
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Phone 2 Relation</label>
          <select value={values.phone_2_relation} onChange={(e) => onChange("phone_2_relation", e.target.value)} className={`w-full ${inputSmall}`}>
            <option value="">—</option>
            {PHONE_RELATIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
        </div>
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
            <WeChatIcon className="h-3 w-3 text-green-600" /> WeChat ID
          </label>
          <input value={values.wechat_id} onChange={(e) => onChange("wechat_id", e.target.value)} className={`w-full ${inputSmall}`} />
        </div>

        <SectionDivider label="Preferences" />
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Preferred Branch</label>
          <BranchCheckboxes value={values.preferred_branches} onChange={(v) => onChange("preferred_branches", v)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Wants Summer?</label>
          <IntentionSelect value={values.wants_summer} onChange={(v) => onChange("wants_summer", v)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Wants Regular (Sept)?</label>
          <IntentionSelect value={values.wants_regular} onChange={(v) => onChange("wants_regular", v)} />
        </div>
        <FieldInput label="Time / Tutor Preference" value={values.preferred_time_note} onChange={(v) => onChange("preferred_time_note", v)} placeholder="e.g. Sat afternoon, Ivan Sir" span={compact ? undefined : 2} />

        <SectionDivider label="Notes" />
        <div className="col-span-full">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Tutor Remark</label>
          <textarea value={values.tutor_remark} onChange={(e) => onChange("tutor_remark", e.target.value)} className={`w-full ${inputSmall} resize-y`} rows={2} placeholder="Notes about the student's ability, learning style, etc." />
        </div>
      </div>
      {onSave && onCancel && (
        <div className="flex gap-2">
          <button onClick={onSave} disabled={!canSave} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"><Check className="h-3.5 w-3.5" /> Save</button>
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors">Cancel</button>
        </div>
      )}
    </div>
  );
}

function ProspectCardSummary({ data }: {
  data: {
    primary_student_id?: string | null;
    school?: string | null;
    grade?: string | null;
    tutor_name?: string | null;
    phone_1?: string | null;
    phone_1_relation?: string | null;
    wechat_id?: string | null;
    preferred_branches?: string[] | null;
    wants_summer?: string | null;
    wants_regular?: string | null;
    tutor_remark?: string | null;
  };
}) {
  return (
    <div className="text-xs text-muted-foreground space-y-0.5 pl-6">
      <div>{[data.primary_student_id, data.school, data.grade, data.tutor_name].filter(Boolean).join(" · ") || "-"}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {data.phone_1 && <span title={data.phone_1_relation ? `${data.phone_1_relation}'s phone` : ""}>{data.phone_1}</span>}
        {data.wechat_id && <span className="inline-flex items-center gap-0.5"><WeChatIcon className="h-3 w-3 text-green-600" />{data.wechat_id}</span>}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <BranchBadges branches={data.preferred_branches || []} />
        <span className="text-[10px] text-muted-foreground">S:</span><IntentionBadge value={data.wants_summer || null} />
        <span className="text-[10px] text-muted-foreground">R:</span><IntentionBadge value={data.wants_regular || null} />
      </div>
      {data.tutor_remark && <div className="italic truncate">{data.tutor_remark}</div>}
    </div>
  );
}

// ---- Main Page ----

export default function ProspectPage() {
  const searchParams = useSearchParams();
  const branchParam = searchParams.get("branch")?.toUpperCase() as ProspectBranch | undefined;
  const branch = branchParam && PROSPECT_BRANCHES.includes(branchParam) ? branchParam : null;
  const [isProspectSubdomain, setIsProspectSubdomain] = useState(false);
  useEffect(() => {
    setIsProspectSubdomain(window.location.hostname.startsWith('prospect.'));
  }, []);
  const prospectBasePath = isProspectSubdomain ? '/' : '/summer/prospect';

  // ---- PIN gate ----
  const [pinVerified, setPinVerified] = useState<boolean | null>(null); // null = checking
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinChecking, setPinChecking] = useState(false);
  const [pinShake, setPinShake] = useState(false);

  useEffect(() => {
    if (!branch) return;
    const stored = sessionStorage.getItem("prospect_pin");
    if (!stored) {
      setPinVerified(false);
      return;
    }
    // Fallback: if verify request stalls, show PIN form after 5s
    const timeout = setTimeout(() => {
      sessionStorage.removeItem("prospect_pin");
      setPinVerified(false);
    }, 5000);
    prospectsAPI.verifyPin(branch, stored)
      .then(() => { clearTimeout(timeout); setPinVerified(true); })
      .catch(() => {
        clearTimeout(timeout);
        sessionStorage.removeItem("prospect_pin");
        setPinVerified(false);
      });
    return () => clearTimeout(timeout);
  }, [branch]);

  const handlePinSubmit = useCallback(async () => {
    if (!branch || !pinInput.trim()) return;
    setPinChecking(true);
    setPinError(null);
    try {
      await prospectsAPI.verifyPin(branch, pinInput.trim());
      sessionStorage.setItem("prospect_pin", pinInput.trim());
      setPinVerified(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setPinError(msg.includes("Too many") || msg.includes("Rate limit")
        ? "Too many attempts. Please try again later."
        : "Incorrect PIN. Please try again.");
      setPinShake(true);
      pinShakeTimer.current = setTimeout(() => setPinShake(false), 500);
    } finally {
      setPinChecking(false);
    }
  }, [branch, pinInput]);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [parseInfo, setParseInfo] = useState<{ text: string; canUndo: boolean } | null>(null);
  const [pasteZoneFocused, setPasteZoneFocused] = useState(false);
  const [parsedExpandedKeys, setParsedExpandedKeys] = useState<Set<string>>(new Set());
  const [submittedExpandedKeys, setSubmittedExpandedKeys] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<PrimaryProspect>>({});
  const [selectedParsedKeys, setSelectedParsedKeys] = useState<Set<string>>(new Set());
  const [selectedSubmittedIds, setSelectedSubmittedIds] = useState<Set<number>>(new Set());
  const [submittedSearchInput, setSubmittedSearchInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [parsedSort, setParsedSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({ field: null, dir: "asc" });
  const [submittedSort, setSubmittedSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({ field: null, dir: "asc" });
  const [submittedFilters, setSubmittedFilters] = useState({ branch: "", wants_summer: "", wants_regular: "", outreach_status: "" });
  const [lastSavedId, setLastSavedId] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [drawerFormValues, setDrawerFormValues] = useState<ProspectFormValues>(createEmptyFormValues());
  const [drawerSubmitting, setDrawerSubmitting] = useState(false);
  const [drawerResult, setDrawerResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string; message: string; onConfirm: () => void; variant?: "danger" | "warning"; confirmText?: string;
  } | null>(null);
  const [showPasteTutorial, setShowPasteTutorial] = useState(() => {
    if (typeof window === "undefined") return true;
    return !localStorage.getItem("prospect-paste-tutorial-dismissed");
  });
  const dismissTutorial = useCallback(() => {
    setShowPasteTutorial(false);
    localStorage.setItem("prospect-paste-tutorial-dismissed", "1");
  }, []);
  const [sampleCopied, triggerSampleCopied] = useCooldown(2000);
  const demoRows = useMemo(() => [
    { id: `${branch}1048`, name: "Bobby Lam", grade: "P6", tutor: "Mr Wong", phone: "55551234" },
    { id: `${branch}1052`, name: "Alice Chan", grade: "P6", tutor: "Ms Lee", phone: "66778899" },
    { id: `${branch}1061`, name: "David Ho", grade: "P6", tutor: "Mr Wong", phone: "91234567" },
  ], [branch]);
  const copySampleData = useCallback(() => {
    const tsv = demoRows.map((r) => `${r.id}\t${r.name}\t${r.grade}\t${r.tutor}\t${r.phone}`).join("\n");
    navigator.clipboard.writeText(tsv);
    triggerSampleCopied();
  }, [demoRows, triggerSampleCopied]);
  const parseInfoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSavedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pinShakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastPasteSnapshot = useRef<ParsedRow[] | null>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const pasteStripRef = useRef<HTMLTextAreaElement>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSubmittedSearch(submittedSearchInput), 300);
    return () => clearTimeout(t);
  }, [submittedSearchInput]);

  // Warn before page unload if parsed rows have unsaved data
  useEffect(() => {
    if (parsedRows.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [parsedRows.length]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (parseInfoTimer.current) clearTimeout(parseInfoTimer.current);
      if (lastSavedTimer.current) clearTimeout(lastSavedTimer.current);
      if (pinShakeTimer.current) clearTimeout(pinShakeTimer.current);
    };
  }, []);
  const submittedRef = useRef<HTMLElement>(null);

  const swrKey = branch && pinVerified ? `prospects-${branch}-${CURRENT_YEAR}` : null;
  const { data: existing, isLoading, isValidating } = useSWR(
    swrKey,
    () => prospectsAPI.list(branch!, CURRENT_YEAR),
    { revalidateOnFocus: false, onSuccess: () => setLastUpdated(new Date()) }
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
      invalidPhone: r.phone_1 ? !!validatePhone(r.phone_1) : false,
      missingName: !r.student_name.trim(),
    }));
  }, [parsedRows, existingPhones]);

  const validCount = useMemo(() => parsedRows.filter(isRowComplete).length, [parsedRows]);
  const incompleteCount = parsedRows.length - validCount;
  const missingFields = useMemo(() => {
    const fields: Record<string, number> = {};
    for (const r of parsedRows) {
      if (!r.primary_student_id.trim()) fields["ID"] = (fields["ID"] || 0) + 1;
      if (!r.student_name.trim()) fields["Name"] = (fields["Name"] || 0) + 1;
      if (!r.school.trim()) fields["School"] = (fields["School"] || 0) + 1;
      if (!r.grade.trim()) fields["Grade"] = (fields["Grade"] || 0) + 1;
      if (!r.tutor_name.trim()) fields["Tutor"] = (fields["Tutor"] || 0) + 1;
      if (!r.phone_1.trim()) fields["Phone"] = (fields["Phone"] || 0) + 1;
    }
    return fields;
  }, [parsedRows]);
  const warningCount = useMemo(() => rowWarnings.filter((w) => w.invalidPhone || w.duplicateInBatch || w.alreadySubmitted).length, [rowWarnings]);
  const [showHelpBanner, setShowHelpBanner] = useState(false);
  const hasActiveFilters = !!(submittedSearchInput || submittedFilters.branch || submittedFilters.wants_summer || submittedFilters.wants_regular || submittedFilters.outreach_status);

  // Sort helpers
  const sortByField = useCallback((a: Record<string, unknown>, b: Record<string, unknown>, field: Exclude<SortField, null>, dir: "asc" | "desc") => {
    const key = SORT_FIELD_KEYS[field];
    const va = String(a[key] || "");
    const vb = String(b[key] || "");
    return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  }, []);

  const toggleSort = useCallback((current: { field: SortField; dir: "asc" | "desc" }, clickedField: Exclude<SortField, null>): { field: SortField; dir: "asc" | "desc" } => {
    if (current.field === clickedField) {
      return current.dir === "asc" ? { field: clickedField, dir: "desc" } : { field: null, dir: "asc" };
    }
    return { field: clickedField, dir: "asc" };
  }, []);

  // Sorted parsed rows (preserves original indices for warnings)
  const sortedParsedIndices = useMemo(() => {
    const indices = parsedRows.map((_, i) => i);
    if (parsedSort.field) {
      const f = parsedSort.field;
      const d = parsedSort.dir;
      indices.sort((a, b) => sortByField(parsedRows[a] as unknown as Record<string, unknown>, parsedRows[b] as unknown as Record<string, unknown>, f, d));
    }
    return indices;
  }, [parsedRows, parsedSort, sortByField]);

  // Filtered + sorted submitted students
  const filteredExisting = useMemo(() => {
    if (!existing) return [];
    let list = existing;
    if (submittedSearch) {
      const term = submittedSearch.toLowerCase();
      list = list.filter((p) =>
        p.student_name.toLowerCase().includes(term) ||
        (p.phone_1 && p.phone_1.includes(term)) ||
        (p.primary_student_id && p.primary_student_id.toLowerCase().includes(term))
      );
    }
    if (submittedFilters.branch) {
      list = list.filter((p) => (p.preferred_branches || []).includes(submittedFilters.branch));
    }
    if (submittedFilters.wants_summer) {
      list = list.filter((p) => p.wants_summer === submittedFilters.wants_summer);
    }
    if (submittedFilters.wants_regular) {
      list = list.filter((p) => p.wants_regular === submittedFilters.wants_regular);
    }
    if (submittedFilters.outreach_status) {
      list = list.filter((p) => p.outreach_status === submittedFilters.outreach_status);
    }
    if (submittedSort.field) {
      const f = submittedSort.field;
      const d = submittedSort.dir;
      list = [...list].sort((a, b) => sortByField(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>, f, d));
    }
    return list;
  }, [existing, submittedSearch, submittedFilters, submittedSort, sortByField]);

  // ---- Paste & Parse ----

  const focusPasteArea = useCallback(() => {
    if (parsedRows.length > 0) pasteStripRef.current?.focus();
    else pasteRef.current?.focus();
  }, [parsedRows.length]);

  const handleClipboardPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    e.preventDefault();
    const { rows, skipped } = parsePastedData(text, branch);
    if (rows.length > 0) {
      setParsedRows((prev) => {
        lastPasteSnapshot.current = prev;
        return [...prev, ...rows];
      });
      setSubmitResult(null);
      const msg = `${rows.length} student${rows.length !== 1 ? "s" : ""} added — review below, then hit Submit${skipped > 0 ? ` (${skipped} row${skipped !== 1 ? "s" : ""} skipped)` : ""}`;
      setParseInfo({ text: msg, canUndo: true });
      if (parseInfoTimer.current) clearTimeout(parseInfoTimer.current);
      parseInfoTimer.current = setTimeout(() => { setParseInfo(null); lastPasteSnapshot.current = null; }, 10000);
      if (showPasteTutorial) dismissTutorial();
    } else if (text.trim()) {
      setParseInfo({ text: "Nothing was recognized — make sure you copied rows from a spreadsheet", canUndo: false });
      if (parseInfoTimer.current) clearTimeout(parseInfoTimer.current);
      parseInfoTimer.current = setTimeout(() => setParseInfo(null), 8000);
    }
  }, [branch, showPasteTutorial, dismissTutorial]);

  const undoLastPaste = useCallback(() => {
    if (lastPasteSnapshot.current !== null) {
      setParsedRows(lastPasteSnapshot.current);
      lastPasteSnapshot.current = null;
      setParseInfo(null);
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
    setParsedExpandedKeys((prev) => new Set([...prev, row._key]));
  }, []);

  const openDrawer = useCallback(() => {
    setDrawerFormValues(createEmptyFormValues());
    setDrawerResult(null);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerClosing(true);
    setTimeout(() => { setDrawerClosing(false); setDrawerOpen(false); }, 200);
  }, []);

  const {
    setIsDirty: setDrawerDirty,
    handleCloseAttempt: handleDrawerCloseAttempt,
    showCloseConfirm: showDrawerCloseConfirm,
    confirmDiscard: confirmDrawerDiscard,
    cancelClose: cancelDrawerClose,
  } = useFormDirtyTracking(drawerOpen, closeDrawer);

  const handleDrawerSubmit = useCallback(async (andClose?: boolean) => {
    if (!branch || !isRowComplete(drawerFormValues) || !!validatePhone(drawerFormValues.phone_1) || !!validateStudentId(drawerFormValues.primary_student_id, branch)) return;
    setDrawerSubmitting(true);
    setDrawerResult(null);
    try {
      const name = drawerFormValues.student_name;
      await prospectsAPI.bulkCreate({ year: CURRENT_YEAR, source_branch: branch, prospects: [toBulkItem(drawerFormValues)] });
      if (swrKey) globalMutate(swrKey);
      setDrawerDirty(false);
      setDrawerFormValues(createEmptyFormValues());
      setDrawerResult({ ok: true, message: `${name} submitted` });
      if (andClose) closeDrawer();
    } catch (err) {
      setDrawerResult({ ok: false, message: err instanceof Error ? err.message : "Failed to submit" });
    } finally {
      setDrawerSubmitting(false);
    }
  }, [branch, drawerFormValues, swrKey, closeDrawer]);

  const clearAllRows = useCallback(() => {
    setConfirmAction({
      title: "Clear all rows",
      message: "Clear all parsed rows? This cannot be undone.",
      variant: "danger",
      confirmText: "Clear",
      onConfirm: () => {
        setParsedRows([]);
        setParsedExpandedKeys(new Set());
        setConfirmAction(null);
      },
    });
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setParsedExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleExpandAll = useCallback(() => {
    setParsedExpandedKeys((prev) =>
      prev.size === parsedRows.length
        ? new Set()
        : new Set(parsedRows.map((r) => r._key))
    );
  }, [parsedRows]);

  const toggleSubmittedExpand = useCallback((id: number) => {
    const key = `sub-${id}`;
    setSubmittedExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSubmittedExpandAll = useCallback(() => {
    const allKeys = (filteredExisting || []).map((p) => `sub-${p.id}`);
    setSubmittedExpandedKeys((prev) => {
      const openCount = allKeys.filter((k) => prev.has(k)).length;
      if (openCount === allKeys.length) return new Set();
      return new Set(allKeys);
    });
  }, [filteredExisting]);

  // ---- Bulk actions ----

  const toggleParsedSelect = useCallback((key: string) => {
    setSelectedSubmittedIds(new Set());
    setSelectedParsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleParsedSelectAll = useCallback(() => {
    setSelectedSubmittedIds(new Set());
    setSelectedParsedKeys((prev) =>
      prev.size === parsedRows.length ? new Set() : new Set(parsedRows.map((r) => r._key))
    );
  }, [parsedRows]);

  const bulkDeleteParsed = useCallback(() => {
    setConfirmAction({
      title: "Delete selected rows",
      message: `Delete ${selectedParsedKeys.size} selected rows?`,
      variant: "danger",
      onConfirm: () => {
        setParsedRows((prev) => prev.filter((r) => !selectedParsedKeys.has(r._key)));
        setSelectedParsedKeys(new Set());
        setConfirmAction(null);
      },
    });
  }, [selectedParsedKeys]);

  const bulkSetParsedIntention = useCallback((field: "wants_summer" | "wants_regular", value: ProspectIntention) => {
    setParsedRows((prev) => prev.map((r) => selectedParsedKeys.has(r._key) ? { ...r, [field]: value } : r));
  }, [selectedParsedKeys]);

  const toggleSubmittedSelect = useCallback((id: number) => {
    setSelectedParsedKeys(new Set());
    setSelectedSubmittedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSubmittedSelectAll = useCallback(() => {
    setSelectedParsedKeys(new Set());
    setSelectedSubmittedIds((prev) =>
      prev.size === filteredExisting.length ? new Set() : new Set(filteredExisting.map((p) => p.id))
    );
  }, [filteredExisting]);

  const bulkDeleteSubmitted = useCallback(() => {
    setConfirmAction({
      title: "Delete selected submissions",
      message: `Delete ${selectedSubmittedIds.size} selected submissions? This will permanently remove them.`,
      variant: "danger",
      onConfirm: async () => {
        setConfirmAction(null);
        setBulkDeleting(true);
        try {
          const ids = [...selectedSubmittedIds];
          for (let i = 0; i < ids.length; i += 5) {
            await Promise.all(ids.slice(i, i + 5).map((id) => prospectsAPI.delete(id, branch!, CURRENT_YEAR)));
          }
          setSelectedSubmittedIds(new Set());
          if (swrKey) globalMutate(swrKey);
        } catch (err) {
          alert(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
        } finally {
          setBulkDeleting(false);
        }
      },
    });
  }, [selectedSubmittedIds, branch, swrKey]);

  const exportCSV = useCallback(() => {
    const data = filteredExisting;
    if (!data.length) return;
    const headers = ["ID", "Name", "School", "Grade", "Tutor", "Phone", "Phone Relation", "Phone 2", "WeChat", "Branch Pref", "Summer", "Regular", "Time/Tutor Pref", "Remark", "Outreach"];
    const rows = data.map((p) => [
      p.primary_student_id || "", p.student_name, p.school || "", p.grade || "", p.tutor_name || "",
      p.phone_1 || "", p.phone_1_relation || "", p.phone_2 || "", p.wechat_id || "",
      (p.preferred_branches || []).join(", "), p.wants_summer || "", p.wants_regular || "",
      p.preferred_time_note || "", p.tutor_remark || "", p.outreach_status || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospects-${branch}-${CURRENT_YEAR}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [filteredExisting, branch]);

  // ---- Submit ----

  const doSubmit = useCallback(async (valid: ParsedRow[]) => {
    if (!branch) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const validKeys = new Set(valid.map((r) => r._key));
      const prospects: PrimaryProspectBulkItem[] = valid.map(toBulkItem);
      const result = await prospectsAPI.bulkCreate({
        year: CURRENT_YEAR,
        source_branch: branch,
        prospects,
      });
      // Remove only submitted rows — keep incomplete ones
      setParsedRows((prev) => prev.filter((r) => !validKeys.has(r._key)));
      setParsedExpandedKeys((prev) => {
        const next = new Set(prev);
        for (const k of validKeys) next.delete(k);
        return next;
      });
      setSubmitResult({ ok: true, message: `${result.created} student${result.created !== 1 ? "s" : ""} submitted` });
      if (swrKey) globalMutate(swrKey);
      setTimeout(() => submittedRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setSubmitResult({ ok: false, message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  }, [branch, swrKey]);

  const handleSubmit = useCallback(() => {
    if (!branch || parsedRows.length === 0) return;
    const valid = parsedRows.filter(isRowComplete);
    if (valid.length === 0) {
      setSubmitResult({ ok: false, message: "No valid rows to submit (ID, name, school, grade, tutor, and phone are required)" });
      return;
    }
    const incomplete = parsedRows.length - valid.length;
    if (incomplete > 0) {
      const missing = Object.keys(missingFields);
      setConfirmAction({
        title: "Incomplete rows will be kept",
        message: `${valid.length} complete student${valid.length !== 1 ? "s" : ""} will be submitted. ${incomplete} incomplete row${incomplete !== 1 ? "s" : ""}${missing.length > 0 ? ` (missing ${missing.join(", ")})` : ""} will stay in the table so you can fill them in later.`,
        variant: "warning",
        confirmText: `Submit ${valid.length}`,
        onConfirm: async () => {
          setConfirmAction(null);
          await doSubmit(valid);
        },
      });
      return;
    }
    doSubmit(valid);
  }, [branch, parsedRows, missingFields, doSubmit]);

  // ---- Inline edit ----

  const startEdit = useCallback((prospect: PrimaryProspect) => {
    setEditingId(prospect.id);
    setEditData({
      primary_student_id: prospect.primary_student_id ?? "",
      student_name: prospect.student_name,
      school: prospect.school ?? "",
      grade: prospect.grade ?? "",
      tutor_name: prospect.tutor_name ?? "",
      phone_1: prospect.phone_1 ?? "",
      phone_1_relation: prospect.phone_1_relation ?? "Mother",
      phone_2: prospect.phone_2 ?? "",
      phone_2_relation: prospect.phone_2_relation ?? "",
      wechat_id: prospect.wechat_id ?? "",
      tutor_remark: prospect.tutor_remark ?? "",
      wants_summer: prospect.wants_summer,
      wants_regular: prospect.wants_regular,
      preferred_branches: prospect.preferred_branches ?? [],
      preferred_time_note: prospect.preferred_time_note ?? "",
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
      await prospectsAPI.update(id, branch!, editData, CURRENT_YEAR);
      setEditingId(null);
      setEditData({});
      if (lastSavedTimer.current) clearTimeout(lastSavedTimer.current);
      setLastSavedId(id);
      lastSavedTimer.current = setTimeout(() => setLastSavedId(null), 2000);
      if (swrKey) globalMutate(swrKey);
    } catch (err) {
      alert(`Error saving: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [editData, swrKey, branch]);

  const handleDelete = useCallback((id: number) => {
    setConfirmAction({
      title: "Delete entry",
      message: "Delete this entry? This cannot be undone.",
      variant: "danger",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await prospectsAPI.delete(id, branch!, CURRENT_YEAR);
          if (swrKey) globalMutate(swrKey);
        } catch (err) {
          alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      },
    });
  }, [swrKey, branch]);

  // ---- Branch Selector ----

  if (!branch) {
    const branchInfo: Record<string, { dot: string; district: string }> = {
      MAC: { dot: "bg-blue-500", district: "高士德" },
      MCP: { dot: "bg-emerald-500", district: "水坑尾" },
      MNT: { dot: "bg-amber-500", district: "東方明珠" },
      MTA: { dot: "bg-rose-500", district: "氹仔美景I" },
      MLT: { dot: "bg-violet-500", district: "林茂塘" },
      MTR: { dot: "bg-cyan-500", district: "氹仔美景II" },
      MOT: { dot: "bg-orange-500", district: "二龍喉" },
    };
    return (
      <div className="max-w-xl mx-auto py-4">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8 sm:p-10 text-center space-y-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">P6 Prospects</h1>
            <p className="text-muted-foreground mt-2">
              Record P6 students who may transition to secondary. Select your branch to begin.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {PROSPECT_BRANCHES.map((b, i) => {
              const info = branchInfo[b];
              return (
                <a
                  key={b}
                  href={`${prospectBasePath}?branch=${b}`}
                  className="group flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200 animate-slide-up w-28"
                  style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${info.dot} opacity-60 group-hover:opacity-100 transition-opacity`} />
                  <span className="font-bold text-foreground text-sm">{b}</span>
                  <span className="text-[10px] text-muted-foreground/70 leading-tight">{info.district}</span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---- PIN Gate ----

  if (pinVerified === null) {
    return null; // Checking stored PIN — avoid flash
  }

  if (!pinVerified) {
    return (
      <div className="max-w-sm mx-auto py-4">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center animate-lock-pulse">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{branch} Branch Access</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Enter your branch PIN to continue.
            </p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handlePinSubmit(); }} className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(null); }}
              placeholder="Enter PIN"
              className={`w-full text-center text-lg tracking-widest border-2 rounded-xl px-4 py-3 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors ${pinError ? "border-red-400" : "border-border"} ${pinShake ? "animate-shake" : ""}`}
              autoFocus
            />
            {pinError && (
              <p className="text-red-500 text-sm">{pinError}</p>
            )}
            <button
              type="submit"
              disabled={pinChecking || !pinInput.trim()}
              className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {pinChecking ? "Verifying..." : "Continue"}
            </button>
          </form>
          <a href={prospectBasePath} className="text-xs text-muted-foreground hover:text-primary transition-colors">
            &larr; Change branch
          </a>
        </div>
      </div>
    );
  }

  // ---- Main Form ----

  return (
    <div className="space-y-6 max-w-none">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-foreground">
          {branch} — P6 Prospects ({CURRENT_YEAR})
        </h1>
        <a href={prospectBasePath} className="text-xs text-muted-foreground hover:text-primary transition-colors">
          &larr; Change branch
        </a>
      </div>

      {/* Result Alert */}
      {submitResult && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border-2 text-sm font-medium transition-all duration-300 ${
            submitResult.ok
              ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {submitResult.ok ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span className="flex-1">{submitResult.message}</span>
          <button onClick={() => setSubmitResult(null)} className="p-0.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors" title="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Section A: Paste & Submit */}
      <section className="bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-2">
          <ClipboardPaste className="h-5 w-5 text-primary/70" />
          <h2 className="text-lg font-semibold">Add Students</h2>
          {parsedRows.length > 0 && (
            <span className="inline-flex items-center bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-medium text-xs">
              {parsedRows.length}
            </span>
          )}
          {!(showPasteTutorial && parsedRows.length === 0) && (
            <button
              onClick={() => {
                if (parsedRows.length === 0) {
                  setShowPasteTutorial(true);
                  localStorage.removeItem("prospect-paste-tutorial-dismissed");
                } else {
                  setShowHelpBanner((v) => !v);
                }
              }}
              className="ml-auto p-1.5 rounded-lg text-muted-foreground/50 hover:text-primary hover:bg-primary/5 transition-colors hidden sm:block"
              title="How to use"
              aria-label="How to use paste"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Help banner — shown when ? is clicked with rows present */}
        {showHelpBanner && parsedRows.length > 0 && (
          <div className="hidden sm:flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="flex-1 text-muted-foreground">
              <strong className="text-foreground">Tip:</strong> Copy rows from your spreadsheet, click the paste area, then press <kbd className="px-1.5 py-0.5 rounded bg-muted text-[11px] font-mono">{PASTE_SHORTCUT}</kbd>. Columns are auto-detected — any order works.
            </span>
            <button onClick={() => setShowHelpBanner(false)} className="p-1 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors" title="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Paste Tutorial — dismissable, re-openable via ? button */}
        <div
          className="grid transition-[grid-template-rows] duration-500 ease-in-out"
          style={{ gridTemplateRows: showPasteTutorial && parsedRows.length === 0 ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
          <div className="hidden sm:block relative rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/[0.04] via-primary/[0.02] to-transparent p-8 overflow-hidden">
            {/* Dismiss button */}
            <button
              onClick={dismissTutorial}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors z-10"
              title="Dismiss"
              aria-label="Dismiss tutorial"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Title */}
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Paste an entire class list in seconds</h3>
                <p className="text-xs text-muted-foreground">Copy rows from your spreadsheet — any column order works</p>
              </div>
            </div>

            {/* 3-step flow */}
            <div className="flex items-stretch gap-3 mb-6">
              <div className="flex-1 bg-card rounded-xl border border-border p-4 text-center space-y-2 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto">
                  <Table2 className="h-5 w-5 text-blue-500" />
                </div>
                <div className="text-xs font-semibold text-foreground">1. Copy from your spreadsheet</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">Select your student rows and copy them</p>
              </div>
              <div className="flex items-center shrink-0 text-muted-foreground/30">
                <ArrowRight className="h-4 w-4" />
              </div>
              <div className="flex-1 bg-card rounded-xl border border-border p-4 text-center space-y-2 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
                  <MousePointerClick className="h-5 w-5 text-amber-500" />
                </div>
                <div className="text-xs font-semibold text-foreground">2. Click the paste area</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">Click the dashed area right below this guide</p>
              </div>
              <div className="flex items-center shrink-0 text-muted-foreground/30">
                <ArrowRight className="h-4 w-4" />
              </div>
              <div className="flex-1 bg-card rounded-xl border border-border p-4 text-center space-y-2 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto">
                  <Keyboard className="h-5 w-5 text-green-500" />
                </div>
                <div className="text-xs font-semibold text-foreground">3. Press {PASTE_SHORTCUT}</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">Students are added to the table automatically</p>
              </div>
            </div>

            {/* Multi-row demo spreadsheet with copy button */}
            <div className="mx-auto max-w-md">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-medium text-muted-foreground/70 flex items-center gap-1.5">
                  <Table2 className="h-3 w-3" />
                  What your spreadsheet might look like:
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); copySampleData(); }}
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md border transition-all duration-200 ${
                    sampleCopied
                      ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700"
                      : "bg-card text-primary border-primary/30 hover:bg-primary/5"
                  }`}
                >
                  {sampleCopied ? <><ClipboardCheck className="h-3 w-3" />Copied! Now paste below</> : <><Copy className="h-3 w-3" />Try it — copy this data</>}
                </button>
              </div>
              <div className="rounded-lg border border-border/80 overflow-hidden shadow-sm bg-card">
                <div className="flex text-[10px] font-semibold text-muted-foreground bg-muted/60 border-b border-border/60">
                  <span className="w-[80px] px-2 py-1.5">ID</span>
                  <span className="w-[80px] px-2 py-1.5">Name</span>
                  <span className="w-[44px] px-2 py-1.5">Grade</span>
                  <span className="w-[80px] px-2 py-1.5">Tutor</span>
                  <span className="w-[72px] px-2 py-1.5">Phone</span>
                </div>
                {demoRows.map((row, i) => (
                  <div
                    key={i}
                    className={`flex text-[10px] font-mono text-foreground/80 ${i < 2 ? "border-b border-border/40" : ""}`}
                    style={{ animation: `fadeSlideIn 0.4s ease-out ${0.3 + i * 0.2}s both` }}
                  >
                    <span className="w-[80px] px-2 py-1.5">{row.id}</span>
                    <span className="w-[80px] px-2 py-1.5">{row.name}</span>
                    <span className="w-[44px] px-2 py-1.5">{row.grade}</span>
                    <span className="w-[80px] px-2 py-1.5">{row.tutor}</span>
                    <span className="w-[72px] px-2 py-1.5">{row.phone}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                <Sparkles className="h-3 w-3 inline mr-1 text-primary/60" />
                Columns are <strong className="text-foreground/80">auto-detected</strong> — extra columns are ignored
              </p>
            </div>

            {/* Visual pointer to paste zone below */}
            <div className="flex justify-center mt-5 text-muted-foreground/40">
              <ChevronDown className="h-5 w-5 animate-bounce" />
            </div>
          </div>
          </div>
        </div>

        {/* Large paste zone — collapses smoothly when rows exist */}
        <div
          className="grid transition-[grid-template-rows] duration-500 ease-in-out"
          style={{ gridTemplateRows: parsedRows.length === 0 ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div
              onClick={focusPasteArea}
              className={`relative border-2 rounded-2xl p-6 sm:p-8 cursor-pointer text-center transition-colors duration-200 ${
                pasteZoneFocused
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-dashed border-primary/30 bg-primary/[0.02] hover:bg-primary/5 hover:border-primary/50"
              }`}
            >
              {/* Ping dot — first visit only */}
              {showPasteTutorial && parsedRows.length === 0 && (
                <span className="hidden sm:flex absolute top-3 right-3 h-3 w-3" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                </span>
              )}
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
              <ClipboardPaste className={`h-10 w-10 mx-auto mb-3 transition-colors hidden sm:block ${pasteZoneFocused ? "text-primary" : "text-primary/40"}`} />
              {/* Desktop: paste-first messaging */}
              <div className="hidden sm:block">
                {pasteZoneFocused ? (
                  <>
                    <p className="text-base font-semibold text-primary">Ready — press {PASTE_SHORTCUT} to paste</p>
                    <p className="text-sm text-muted-foreground mt-1">Paste your copied rows</p>
                  </>
                ) : showPasteTutorial ? (
                  <>
                    <p className="text-base font-semibold text-foreground">Paste area</p>
                    <p className="text-sm text-muted-foreground mt-1">Click here, then press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">{PASTE_SHORTCUT}</kbd></p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-semibold text-foreground">Paste student data here</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Copy rows from your spreadsheet, click here, then press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">{PASTE_SHORTCUT}</kbd>
                    </p>
                  </>
                )}
              </div>
              {/* Mobile: manual-first messaging */}
              <div className="sm:hidden">
                <Plus className="h-8 w-8 mx-auto mb-2 text-primary/40" />
                <p className="text-base font-semibold text-foreground">Add students</p>
                <p className="text-sm text-muted-foreground mt-1">Tap below to add students one by one</p>
              </div>
              <div className="mt-4 flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); addEmptyRow(); }}
                  className="sm:inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors inline-flex sm:mt-0 px-5 py-2.5 sm:px-0 sm:py-0 rounded-xl sm:rounded-none bg-primary/10 sm:bg-transparent"
                >
                  <Plus className="h-4 w-4" />
                  <span className="sm:hidden">Add a student</span>
                  <span className="hidden sm:inline">Or add a row manually</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsed paste strip — expands smoothly when rows exist */}
        <div
          className="grid transition-[grid-template-rows] duration-500 ease-in-out"
          style={{ gridTemplateRows: parsedRows.length > 0 ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div
              onClick={focusPasteArea}
              className={`hidden sm:flex relative border-2 rounded-xl p-3 items-center gap-3 cursor-pointer transition-colors duration-200 ${
                pasteZoneFocused
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-dashed border-border bg-muted/30 hover:border-primary/30"
              }`}
            >
              <textarea
                ref={pasteStripRef}
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
          </div>
        </div>

        {/* Parse info banner */}
        {parseInfo && (
          <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium transition-all duration-300 ${
            parseInfo.canUndo
              ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
              : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
          }`}>
            {parseInfo.canUndo ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span className="flex-1">{parseInfo.text}</span>
            {parseInfo.canUndo && (
              <button onClick={undoLastPaste} className="text-xs font-medium border border-green-300 dark:border-green-700 rounded-lg px-2 py-0.5 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
                Undo
              </button>
            )}
          </div>
        )}

        {/* Parsed Students — card view (narrow) + table view (wide) */}
        {parsedRows.length > 0 && (
          <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
          {/* Card view (<md) */}
          <div className="md:hidden space-y-2 p-2">
            {sortedParsedIndices.map((idx) => {
              const row = parsedRows[idx];
              const w = rowWarnings[idx];
              const isExpanded = parsedExpandedKeys.has(row._key);
              const hasWarning = !!(w?.duplicateInBatch || w?.alreadySubmitted || w?.invalidPhone);
              return (
                <div key={row._key} className={`border rounded-xl p-3 space-y-1.5 transition-colors ${
                  isExpanded ? "border-primary/30 bg-primary/[0.02]"
                    : selectedParsedKeys.has(row._key) ? "border-primary/40 bg-primary/[0.03]"
                    : hasWarning ? "border-yellow-300 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-900/10"
                    : "border-border bg-card"
                }`} style={{ animation: `fadeSlideIn 0.3s ease-out ${Math.min(idx * 0.03, 0.5)}s both` }}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="rounded shrink-0" checked={selectedParsedKeys.has(row._key)} onChange={() => toggleParsedSelect(row._key)} />
                    <span className={`font-medium flex-1 truncate text-sm ${w?.missingName ? "text-red-500" : "text-foreground"}`}>
                      {row.student_name || <span className="text-red-400 italic">Name required</span>}
                    </span>
                    {(w?.duplicateInBatch || w?.alreadySubmitted) && <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />}
                    <button onClick={() => toggleExpand(row._key)} className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    <button onClick={() => removeRow(row._key)} className="p-1 rounded-lg text-muted-foreground hover:text-red-600 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <ProspectCardSummary data={row} />
                  {isExpanded && (
                    <div className="pt-2 border-t border-border">
                      <ProspectEditForm
                        values={row}
                        onChange={(field, value) => updateRow(row._key, field as keyof ParsedRow, value)}
                        branch={branch}
                        compact
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {/* Mobile: Airtable-style add button */}
            <button
              onClick={addEmptyRow}
              className="w-full border-2 border-dashed border-border rounded-xl p-3 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add a student
            </button>
          </div>

          {/* Table view (md+) */}
          <div className="hidden md:block">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-primary/5 border-b border-border">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <input type="checkbox" className="rounded" ref={(el) => { if (el) el.indeterminate = selectedParsedKeys.size > 0 && selectedParsedKeys.size < parsedRows.length; }} checked={selectedParsedKeys.size === parsedRows.length && parsedRows.length > 0} onChange={toggleParsedSelectAll} />
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium">
                    <SortableHeader label="ID" dir={parsedSort.field === "id" ? parsedSort.dir : null} onToggle={() => setParsedSort((s) => toggleSort(s, "id"))} />
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium">
                    <SortableHeader label="Name" dir={parsedSort.field === "name" ? parsedSort.dir : null} onToggle={() => setParsedSort((s) => toggleSort(s, "name"))} />
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium">
                    <SortableHeader label="School" dir={parsedSort.field === "school" ? parsedSort.dir : null} onToggle={() => setParsedSort((s) => toggleSort(s, "school"))} />
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Grade</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Tutor</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Phone</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Branch Choice</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground"><span className="inline-flex items-center gap-1"><WeChatIcon className="h-3 w-3 text-green-600" />WeChat</span></th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Remark</th>
                  <th className="px-2 py-2 w-20">
                    <button
                      onClick={toggleExpandAll}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      title={parsedExpandedKeys.size === parsedRows.length ? "Collapse all" : "Expand all"}
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                      All
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedParsedIndices.map((idx) => {
                  const row = parsedRows[idx];
                  const w = rowWarnings[idx];
                  const isExpanded = parsedExpandedKeys.has(row._key);
                  const hasWarning = !!(w?.duplicateInBatch || w?.alreadySubmitted || w?.invalidPhone);
                  const isIncomplete = !isRowComplete(row);
                  return (
                    <React.Fragment key={row._key}>
                      {/* Main row — read-only display */}
                      <tr
                        className={`border-t border-border dark:border-gray-700 cursor-pointer transition-colors ${
                          selectedParsedKeys.has(row._key) ? "bg-primary/[0.05]"
                            : hasWarning ? "bg-yellow-50/50 dark:bg-yellow-900/10"
                            : isIncomplete ? "bg-amber-50/30 dark:bg-amber-900/5"
                            : isExpanded ? "bg-primary/[0.03]" : "hover:bg-primary/[0.03]"
                        }`}
                        style={{ animation: `fadeSlideIn 0.3s ease-out ${Math.min(idx * 0.03, 0.5)}s both` }}
                        onClick={() => toggleExpand(row._key)}
                      >
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="rounded" checked={selectedParsedKeys.has(row._key)} onChange={() => toggleParsedSelect(row._key)} />
                        </td>
                        <td className="px-2 py-2 text-xs font-mono">
                          {row.primary_student_id
                            ? <span className="text-muted-foreground">{row.primary_student_id}</span>
                            : <span className="text-red-400">-</span>
                          }
                          {(w?.duplicateInBatch || w?.alreadySubmitted) && (
                            <AlertTriangle className="inline h-3 w-3 ml-0.5 text-yellow-500" />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {row.student_name ? (
                            <span className={`font-medium ${w?.missingName ? "text-red-500" : "text-foreground"}`}>
                              <CopyableCell text={row.student_name} />
                            </span>
                          ) : (
                            <span className="text-red-400 italic font-medium">Name required</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {row.school ? <span className="text-muted-foreground"><CopyableCell text={row.school} /></span> : <span className="text-red-400 italic">Required</span>}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {row.grade ? <span className="text-muted-foreground">{row.grade}</span> : <span className="text-red-400">-</span>}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {row.tutor_name ? <span className="text-muted-foreground">{row.tutor_name}</span> : <span className="text-red-400">-</span>}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {row.phone_1 ? (
                            <span className={w?.alreadySubmitted ? "text-orange-600 font-medium" : w?.invalidPhone ? "text-yellow-600" : "text-muted-foreground"}>
                              <CopyableCell text={row.phone_1} title={[row.phone_1_relation && `${row.phone_1_relation}'s phone`, w?.alreadySubmitted && "Already submitted", w?.duplicateInBatch && "Duplicate in batch", w?.invalidPhone && "Should be 8 digits"].filter(Boolean).join(" · ") || undefined} />
                            </span>
                          ) : (
                            <span className="text-red-400 italic font-medium">Phone required</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="space-y-0.5">
                            <BranchBadges branches={row.preferred_branches} />
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground shrink-0">Summer</span>
                              <IntentionBadge value={row.wants_summer} />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground shrink-0">Regular</span>
                              <IntentionBadge value={row.wants_regular} />
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground max-w-[100px]"><CopyableCell text={row.wechat_id} /></td>
                        <td className="px-2 py-2 text-xs text-muted-foreground max-w-[120px]"><CopyableCell text={row.tutor_remark} /></td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                              title={isExpanded ? "Collapse" : "Expand details"}
                              onClick={(e) => { e.stopPropagation(); toggleExpand(row._key); }}
                            >
                              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
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
                          <td colSpan={11} className="px-3 py-3 bg-muted/50 dark:bg-muted/20 border-l-4 border-l-primary/30 border-t-2 border-b-2 border-border dark:border-gray-700">
                            <ProspectEditForm
                              values={row}
                              onChange={(field, value) => updateRow(row._key, field as keyof ParsedRow, value)}
                              branch={branch}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={11} className="border-t border-border">
                    <button
                      onClick={addEmptyRow}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-primary hover:bg-primary/[0.03] transition-colors group"
                    >
                      <Plus className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                      Add a student manually
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
            </div>

          </div>

          <div className="p-3 sm:p-4 border-t border-border bg-primary/5 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-medium text-xs">
                  {validCount}
                </span>
                <span className="ml-1.5">ready</span>
                {incompleteCount > 0 && (
                  <>
                    <span className="mx-1.5 text-muted-foreground/50">|</span>
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-medium">
                      <AlertCircle className="h-3 w-3" />
                      {incompleteCount} incomplete — missing {Object.keys(missingFields).join(", ")}
                    </span>
                  </>
                )}
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
                onClick={clearAllRows}
                className="text-xs font-medium text-muted-foreground border border-border rounded-lg px-2 py-0.5 hover:text-red-600 hover:border-red-300 transition-colors"
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
                  Submit {validCount} {validCount === 1 ? "Student" : "Students"}
                </>
              )}
            </button>
          </div>
        </div>)}
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
          {lastUpdated && (
            <span className="ml-auto text-[10px] text-muted-foreground/50 inline-flex items-center gap-1">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              <button
                onClick={() => { if (swrKey) globalMutate(swrKey); }}
                disabled={isValidating}
                className="p-1 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isValidating ? "animate-spin" : ""}`} />
              </button>
            </span>
          )}
        </div>

        {/* Search + Filters */}
        {existing && existing.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={submittedSearchInput}
                onChange={(e) => setSubmittedSearchInput(e.target.value)}
                placeholder="Search..."
                className={`${inputSmall} pl-8 w-40 sm:w-52`}
              />
            </div>
            <select value={submittedFilters.branch} onChange={(e) => setSubmittedFilters((f) => ({ ...f, branch: e.target.value }))} className={inputSmall}>
              <option value="">Branch: All</option>
              {SECONDARY_BRANCHES.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
            <select value={submittedFilters.wants_summer} onChange={(e) => setSubmittedFilters((f) => ({ ...f, wants_summer: e.target.value }))} className={inputSmall}>
              <option value="">Summer: All</option>
              {INTENTIONS.map((i) => (<option key={i} value={i}>{INTENTION_LABELS[i]}</option>))}
            </select>
            <select value={submittedFilters.wants_regular} onChange={(e) => setSubmittedFilters((f) => ({ ...f, wants_regular: e.target.value }))} className={inputSmall}>
              <option value="">Regular: All</option>
              {INTENTIONS.map((i) => (<option key={i} value={i}>{INTENTION_LABELS[i]}</option>))}
            </select>
            <select value={submittedFilters.outreach_status} onChange={(e) => setSubmittedFilters((f) => ({ ...f, outreach_status: e.target.value }))} className={inputSmall}>
              <option value="">Outreach: All</option>
              {OUTREACH_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
            </select>
            {hasActiveFilters && (
              <button
                onClick={() => { setSubmittedSearchInput(""); setSubmittedSearch(""); setSubmittedFilters({ branch: "", wants_summer: "", wants_regular: "", outreach_status: "" }); }}
                className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        )}

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
              No students submitted yet for <strong>{branch}</strong> ({CURRENT_YEAR}).
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Paste student data above to get started.
            </p>
          </div>
        ) : filteredExisting.length === 0 ? (
          <div className="text-center py-10">
            <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No students match your filters.</p>
            <button
              onClick={() => { setSubmittedSearchInput(""); setSubmittedSearch(""); setSubmittedFilters({ branch: "", wants_summer: "", wants_regular: "", outreach_status: "" }); }}
              className="mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
          {/* Card view (<md) */}
          <div className="md:hidden space-y-2 p-2">
            {filteredExisting.map((p) => {
              const isEditing = editingId === p.id;
              const isOpen = editingId === p.id || submittedExpandedKeys.has(`sub-${p.id}`);
              const urgency = outreachUrgency(p.outreach_status);
              const shouldPulse = urgency === "action" && daysAgo(p.submitted_at) >= 5;
              return (
                <div key={p.id} className={`border rounded-xl p-3 space-y-1.5 transition-colors ${URGENCY_BORDER[urgency]} ${shouldPulse ? "animate-buddy-pulse" : ""} ${
                  isOpen ? "border-primary/30 bg-primary/[0.02]"
                    : selectedSubmittedIds.has(p.id) ? "border-primary/40 bg-primary/[0.03]"
                    : "border-border bg-card"
                }`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="rounded shrink-0" checked={selectedSubmittedIds.has(p.id)} onChange={() => toggleSubmittedSelect(p.id)} />
                    <span className="font-medium flex-1 truncate text-sm">{p.student_name}</span>
                    {lastSavedId === p.id && <span className="text-[10px] text-green-600 dark:text-green-400 font-medium"><Check className="h-3 w-3 inline" /></span>}
                    <OutreachBadge status={p.outreach_status} />
                    <button onClick={() => { if (!isEditing) toggleSubmittedExpand(p.id); }} className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {!isEditing && (
                      <>
                        <button onClick={() => startEdit(p)} className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleDelete(p.id)} className="p-1 rounded-lg text-muted-foreground hover:text-red-600 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>
                  <ProspectCardSummary data={p} />
                  {isOpen && (
                    <div className="pt-2 border-t border-border">
                      {isEditing ? (
                        <ProspectEditForm
                          values={mergeEditValues(editData, p)}
                          onChange={(field, value) => setEditData((d) => ({ ...d, [field]: value }))}
                          branch={branch}
                          compact
                          onSave={() => saveEdit(p.id)}
                          onCancel={cancelEdit}
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground space-y-1">
                          {p.phone_2 && <div>Phone 2: {p.phone_2}{p.phone_2_relation ? ` (${p.phone_2_relation})` : ""}</div>}
                          {p.preferred_time_note && <div>Time/Tutor Pref: {p.preferred_time_note}</div>}
                          {p.submitted_at && (
                            <div className="text-[10px] pt-1">
                              Submitted {new Date(p.submitted_at).toLocaleString()}
                              {wasEdited(p.submitted_at, p.updated_at) && (
                                <span className="ml-1.5 text-muted-foreground/50">
                                  <Pencil className="h-2.5 w-2.5 inline mr-0.5" />Edited {relativeTime(p.updated_at)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Table view (md+) */}
          <div className="hidden md:block">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-primary/5 border-b border-border">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <input type="checkbox" className="rounded" ref={(el) => { if (el) el.indeterminate = selectedSubmittedIds.size > 0 && selectedSubmittedIds.size < filteredExisting.length; }} checked={selectedSubmittedIds.size === filteredExisting.length && filteredExisting.length > 0} onChange={toggleSubmittedSelectAll} />
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium">
                    <SortableHeader label="ID" dir={submittedSort.field === "id" ? submittedSort.dir : null} onToggle={() => setSubmittedSort((s) => toggleSort(s, "id"))} />
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium">
                    <SortableHeader label="Name" dir={submittedSort.field === "name" ? submittedSort.dir : null} onToggle={() => setSubmittedSort((s) => toggleSort(s, "name"))} />
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium">
                    <SortableHeader label="School" dir={submittedSort.field === "school" ? submittedSort.dir : null} onToggle={() => setSubmittedSort((s) => toggleSort(s, "school"))} />
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Grade</th>
                  <th className="px-2 py-2 text-left text-xs font-medium">
                    <SortableHeader label="Tutor" dir={submittedSort.field === "tutor" ? submittedSort.dir : null} onToggle={() => setSubmittedSort((s) => toggleSort(s, "tutor"))} />
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Phone</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Branch Choice</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground"><span className="inline-flex items-center gap-1"><WeChatIcon className="h-3 w-3 text-green-600" />WeChat</span></th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Remark</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-foreground">Outreach</th>
                  <th className="px-2 py-2 w-24">
                    <button
                      onClick={toggleSubmittedExpandAll}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      title="Expand/collapse all"
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                      All
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredExisting.map((p) => {
                  const isEditing = editingId === p.id;
                  const isOpen = editingId === p.id || submittedExpandedKeys.has(`sub-${p.id}`);
                  const urgency = outreachUrgency(p.outreach_status);
                  const daysSinceSubmit = daysAgo(p.submitted_at);
                  const shouldPulse = urgency === "action" && daysSinceSubmit >= 5;
                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`border-t border-border dark:border-gray-700 cursor-pointer transition-colors ${URGENCY_BORDER[urgency]} ${shouldPulse ? "animate-buddy-pulse" : ""} ${
                          selectedSubmittedIds.has(p.id) ? "bg-primary/[0.05]"
                            : isOpen ? "bg-primary/[0.03]" : "hover:bg-primary/[0.03]"
                        }`}
                        onClick={() => { if (!isEditing) toggleSubmittedExpand(p.id); }}
                      >
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="rounded" checked={selectedSubmittedIds.has(p.id)} onChange={() => toggleSubmittedSelect(p.id)} />
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground font-mono">{p.primary_student_id || "-"}</td>
                        <td className="px-2 py-2 font-medium text-foreground">
                          <CopyableCell text={p.student_name} />
                          {lastSavedId === p.id && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400 font-medium animate-in fade-in">
                              <Check className="h-3 w-3" />Saved
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground"><CopyableCell text={p.school || ""} /></td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">{p.grade}</td>
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
                        <td className="px-2 py-2"><OutreachBadge status={p.outreach_status} /></td>
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                              title={isOpen ? "Collapse" : "Expand"}
                              onClick={() => toggleSubmittedExpand(p.id)}
                            >
                              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
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
                          <td colSpan={12} className="px-3 py-3 bg-muted/50 dark:bg-muted/20 border-l-4 border-l-primary/30 border-t-2 border-b-2 border-border dark:border-gray-700">
                            {isEditing ? (
                              <ProspectEditForm
                                values={mergeEditValues(editData, p)}
                                onChange={(field, value) => setEditData((d) => ({ ...d, [field]: value }))}
                                branch={branch}
                                onSave={() => saveEdit(p.id)}
                                onCancel={cancelEdit}
                              />
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2 text-sm">
                                {p.phone_2 && (
                                  <>
                                    <SectionDivider label="Contact" />
                                    <div><span className="text-xs text-muted-foreground">Phone 2:</span> {p.phone_2}{p.phone_2_relation ? ` (${p.phone_2_relation})` : ""}</div>
                                  </>
                                )}

                                {p.preferred_time_note && (
                                  <>
                                    <SectionDivider label="Preferences" />
                                    <div><span className="text-xs text-muted-foreground">Time/Tutor Pref:</span> {p.preferred_time_note}</div>
                                  </>
                                )}

                                {p.tutor_remark && (
                                  <>
                                    <SectionDivider label="Notes" />
                                    <div className="col-span-full border-l-4 border-primary/20 pl-3 py-1 bg-primary/[0.03] dark:bg-primary/[0.06] rounded-r">
                                      <span className="text-xs">{p.tutor_remark}</span>
                                    </div>
                                  </>
                                )}

                                {!p.phone_2 && !p.preferred_time_note && !p.tutor_remark && (
                                  <div className="col-span-full text-xs text-muted-foreground italic">No additional details</div>
                                )}

                                {p.submitted_at && (
                                  <div className="col-span-full text-[10px] text-muted-foreground pt-1">
                                    Submitted {new Date(p.submitted_at).toLocaleString()}
                                    {wasEdited(p.submitted_at, p.updated_at) && (
                                      <span className="ml-1.5 text-muted-foreground/50">
                                        <Pencil className="h-2.5 w-2.5 inline mr-0.5" />Edited {relativeTime(p.updated_at)}
                                      </span>
                                    )}
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

          </div>

          <div className="px-3 py-2 border-t border-border bg-primary/5 flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>{filteredExisting.length}{hasActiveFilters ? ` of ${existing?.length || 0}` : ""} student{filteredExisting.length !== 1 ? "s" : ""}</span>
            <button onClick={exportCSV} className="inline-flex items-center gap-1 text-xs font-medium text-primary border border-primary/30 rounded-lg px-2 py-0.5 hover:bg-primary/5 transition-colors">
              <Download className="h-3 w-3" />
              Export CSV
            </button>
          </div>
        </div>)}
      </section>

      {/* Floating bulk action bars */}
      {selectedParsedKeys.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 animate-slide-up">
          <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">{selectedParsedKeys.size} selected</span>
            <button onClick={bulkDeleteParsed} className="text-xs font-medium text-red-600 border border-red-300 dark:border-red-700 rounded-lg px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <Trash2 className="h-3 w-3 inline mr-1" />Delete
            </button>
            <span className="text-xs text-muted-foreground">|</span>
            <span className="text-xs text-muted-foreground">Summer:</span>
            {INTENTIONS.map((i) => (
              <button key={`s-${i}`} onClick={() => bulkSetParsedIntention("wants_summer", i)} className="text-xs px-1.5 py-0.5 border rounded-lg hover:bg-primary/5 transition-colors">{INTENTION_LABELS[i]}</button>
            ))}
            <span className="text-xs text-muted-foreground">Regular:</span>
            {INTENTIONS.map((i) => (
              <button key={`r-${i}`} onClick={() => bulkSetParsedIntention("wants_regular", i)} className="text-xs px-1.5 py-0.5 border rounded-lg hover:bg-primary/5 transition-colors">{INTENTION_LABELS[i]}</button>
            ))}
            <button onClick={() => setSelectedParsedKeys(new Set())} className="p-1 text-muted-foreground hover:text-foreground ml-auto">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {selectedSubmittedIds.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 animate-slide-up">
          <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">{selectedSubmittedIds.size} selected</span>
            <button onClick={bulkDeleteSubmitted} disabled={bulkDeleting} className="text-xs font-medium text-red-600 border border-red-300 dark:border-red-700 rounded-lg px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50">
              {bulkDeleting ? <span className="animate-spin rounded-full h-3 w-3 border-2 border-red-300 border-t-red-600 inline-block mr-1 align-middle" /> : <Trash2 className="h-3 w-3 inline mr-1" />}
              {bulkDeleting ? "Deleting..." : "Delete"}
            </button>
            <button onClick={() => setSelectedSubmittedIds(new Set())} className="p-1 text-muted-foreground hover:text-foreground ml-auto">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* FAB — Add Student */}
      {pinVerified && selectedParsedKeys.size === 0 && selectedSubmittedIds.size === 0 && typeof document !== "undefined" && createPortal(
        <button
          onClick={() => drawerOpen ? handleDrawerCloseAttempt() : openDrawer()}
          className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center ${
            drawerOpen ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
          title={drawerOpen ? "Close" : "Add Student"}
        >
          {drawerOpen ? <X className="h-6 w-6" /> : <UserPlus className="h-6 w-6" />}
        </button>,
        document.body
      )}

      {/* Drawer — Add Student Form (direct submit) */}
      {(drawerOpen || drawerClosing) && typeof document !== "undefined" && createPortal(
        <>
          <div className={`fixed inset-0 z-40 bg-black/40 ${drawerClosing ? "animate-backdrop-out" : "animate-backdrop-in"}`} onClick={handleDrawerCloseAttempt} />
          <div className="fixed right-2 sm:right-3 bottom-[88px] z-40 w-[calc(100%-1rem)] sm:w-[420px]">
            <div className={`max-h-[calc(100vh-160px)] overflow-y-auto bg-card rounded-2xl shadow-2xl border border-border ${drawerClosing ? "animate-drawer-out" : "animate-drawer-in"}`}>
              <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10 rounded-t-2xl">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <UserPlus className="h-4 w-4 text-primary" />
                  Add Student
                </span>
                <button onClick={handleDrawerCloseAttempt} className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <ProspectEditForm
                  values={drawerFormValues}
                  onChange={(field, value) => { setDrawerFormValues(prev => ({ ...prev, [field]: value })); setDrawerResult(null); setDrawerDirty(true); }}
                  branch={branch}
                  compact
                />
                {drawerResult && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${drawerResult.ok ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"}`}>
                    {drawerResult.message}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDrawerSubmit(false)}
                    disabled={drawerSubmitting || !isRowComplete(drawerFormValues) || !!validatePhone(drawerFormValues.phone_1) || !!validateStudentId(drawerFormValues.primary_student_id, branch)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {drawerSubmitting ? (
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/30 border-t-white" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    {drawerSubmitting ? "Submitting..." : "Submit & Add Another"}
                  </button>
                  <button
                    onClick={() => handleDrawerSubmit(true)}
                    disabled={drawerSubmitting || !isRowComplete(drawerFormValues) || !!validatePhone(drawerFormValues.phone_1) || !!validateStudentId(drawerFormValues.primary_student_id, branch)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-primary/30 text-primary rounded-lg hover:bg-primary/5 disabled:opacity-50 transition-colors"
                  >
                    Submit & Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      <ConfirmDialog
        isOpen={showDrawerCloseConfirm}
        onConfirm={confirmDrawerDiscard}
        onCancel={cancelDrawerClose}
        title="Unsaved changes"
        message="You have unsaved changes. Discard them?"
        confirmText="Discard"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={!!confirmAction}
        onConfirm={() => confirmAction?.onConfirm()}
        onCancel={() => setConfirmAction(null)}
        title={confirmAction?.title || ""}
        message={confirmAction?.message || ""}
        variant={confirmAction?.variant || "danger"}
        confirmText={confirmAction?.confirmText || "Delete"}
      />
    </div>
  );
}
