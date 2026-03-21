"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
} from "lucide-react";
import { prospectsAPI } from "@/lib/api";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
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

function parsePastedData(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const rows: ParsedRow[] = [];
  let startIdx = 0;
  let columnMap: Record<string, number> | null = null;

  // Check if first line is a header
  const firstCols = lines[0].split("\t").map((c) => c.trim());
  columnMap = detectColumnMap(firstCols);
  if (columnMap) startIdx = 1;

  for (let lineIdx = startIdx; lineIdx < lines.length; lineIdx++) {
    const cols = lines[lineIdx].split("\t").map((c) => c?.trim() ?? "");
    if (cols.length < 2) continue;

    let id: string, name: string, grade: string, tutor: string, phone: string, school: string;

    if (columnMap) {
      // Header-mapped parsing (guard against missing columns)
      id = columnMap.id != null ? (cols[columnMap.id] || "").replace(/\.0$/, "") : "";
      name = columnMap.name != null ? (cols[columnMap.name] || "") : "";
      grade = columnMap.grade != null ? (cols[columnMap.grade] || "") : "";
      tutor = columnMap.tutor != null ? (cols[columnMap.tutor] || "") : "";
      phone = columnMap.phone != null ? (cols[columnMap.phone] || "").replace(/\.0$/, "") : "";
      school = columnMap.school != null ? (cols[columnMap.school] || "") : "";
    } else {
      // Heuristic parsing
      ({ id, name, grade, tutor, phone, school } = detectColumnsFromData(cols));
    }

    // Filter out Bobby template row
    if ((id === "1001") && (phone === "66666666")) continue;
    // Filter out header-like rows
    if (/^id/i.test(id) && /name|student/i.test(name)) continue;
    // Skip if no meaningful data
    if (!name && !phone) continue;

    rows.push({
      ...createEmptyRow(),
      primary_student_id: id,
      student_name: name,
      grade: grade || "P6",
      tutor_name: tutor,
      phone_1: phone,
      school: school,
    });
  }

  return rows;
}

// ---- Color maps (hoisted for perf) ----

const INTENTION_SELECT_COLORS: Record<ProspectIntention, string> = {
  Yes: "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
  No: "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
  Considering: "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700",
};

const INTENTION_BADGE_COLORS: Record<string, string> = {
  Yes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  No: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Considering: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

const INTENTION_LABELS: Record<ProspectIntention, string> = {
  Yes: "Yes",
  No: "No",
  Considering: "Maybe",
};

const BRANCH_COLORS: Record<string, { badge: string; selected: string }> = {
  MSA: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    selected: "bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-400",
  },
  MSB: {
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    selected: "bg-purple-100 border-purple-400 text-purple-700 dark:bg-purple-900/30 dark:border-purple-600 dark:text-purple-400",
  },
};

const OUTREACH_BADGE_COLORS: Record<string, string> = {
  "Not Started": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  "WeChat - Not Found": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "WeChat - Cannot Add": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "WeChat - Added": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Called: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "No Response": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
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
    <div className="flex gap-2">
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

function IntentionBadge({ value }: { value: string | null }) {
  const v = value || "Considering";
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${INTENTION_BADGE_COLORS[v] || "bg-gray-100"}`}>
      {INTENTION_LABELS[v as ProspectIntention] || v}
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

function BranchBadges({ branches }: { branches: string[] }) {
  if (!branches || branches.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="flex gap-1">
      {branches.map((b, i) => (
        <span key={b} className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${BRANCH_COLORS[b]?.badge || "bg-gray-100"}`}>
          {b}{branches.length > 1 && <span className="opacity-60 ml-0.5">{i === 0 ? "1st" : "2nd"}</span>}
        </span>
      ))}
    </span>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  inputMode?: "numeric" | "text";
  span?: 2 | 3;
}) {
  return (
    <div className={span === 3 ? "col-span-3" : span === 2 ? "col-span-2" : undefined}>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full ${inputSmall} ${required && !value.trim() ? "border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-500" : ""}`}
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

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
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
  const parseInfoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSubmittedSearch(submittedSearchInput), 300);
    return () => clearTimeout(t);
  }, [submittedSearchInput]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (parseInfoTimer.current) clearTimeout(parseInfoTimer.current); };
  }, []);
  const submittedRef = useRef<HTMLElement>(null);

  const swrKey = branch ? `prospects-${branch}-${CURRENT_YEAR}` : null;
  const { data: existing, isLoading } = useSWR(
    swrKey,
    () => prospectsAPI.list(branch!, CURRENT_YEAR),
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

  const validCount = useMemo(() => parsedRows.filter((r) => r.student_name.trim()).length, [parsedRows]);
  const warningCount = useMemo(() => rowWarnings.filter((w) => w.invalidPhone || w.duplicateInBatch || w.alreadySubmitted).length, [rowWarnings]);

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
    setParsedExpandedKeys((prev) => new Set([...prev, row._key]));
  }, []);

  const clearAllRows = useCallback(() => {
    if (!confirm("Clear all parsed rows?")) return;
    setParsedRows([]);
    setParsedExpandedKeys(new Set());
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
    setSelectedParsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleParsedSelectAll = useCallback(() => {
    setSelectedParsedKeys((prev) =>
      prev.size === parsedRows.length ? new Set() : new Set(parsedRows.map((r) => r._key))
    );
  }, [parsedRows]);

  const bulkDeleteParsed = useCallback(() => {
    if (!confirm(`Delete ${selectedParsedKeys.size} selected rows?`)) return;
    setParsedRows((prev) => prev.filter((r) => !selectedParsedKeys.has(r._key)));
    setSelectedParsedKeys(new Set());
  }, [selectedParsedKeys]);

  const bulkSetParsedIntention = useCallback((field: "wants_summer" | "wants_regular", value: ProspectIntention) => {
    setParsedRows((prev) => prev.map((r) => selectedParsedKeys.has(r._key) ? { ...r, [field]: value } : r));
  }, [selectedParsedKeys]);

  const toggleSubmittedSelect = useCallback((id: number) => {
    setSelectedSubmittedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSubmittedSelectAll = useCallback(() => {
    setSelectedSubmittedIds((prev) =>
      prev.size === filteredExisting.length ? new Set() : new Set(filteredExisting.map((p) => p.id))
    );
  }, [filteredExisting]);

  const bulkDeleteSubmitted = useCallback(async () => {
    if (!confirm(`Delete ${selectedSubmittedIds.size} selected submissions?`)) return;
    try {
      await Promise.all([...selectedSubmittedIds].map((id) => prospectsAPI.delete(id, branch!)));
      setSelectedSubmittedIds(new Set());
      if (swrKey) globalMutate(swrKey);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
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
        year: CURRENT_YEAR,
        source_branch: branch,
        prospects,
      });

      setSubmitResult({ ok: true, message: `${result.created} students submitted successfully` });
      setParsedRows([]);
      setParsedExpandedKeys(new Set());
      if (swrKey) globalMutate(swrKey);
      setTimeout(() => submittedRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setSubmitResult({ ok: false, message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  }, [branch, parsedRows, swrKey]);

  // ---- Inline edit ----

  const startEdit = useCallback((prospect: PrimaryProspect) => {
    setEditingId(prospect.id);
    setEditData({
      student_name: prospect.student_name,
      school: prospect.school ?? "",
      phone_1: prospect.phone_1 ?? "",
      phone_1_relation: prospect.phone_1_relation ?? "Mother",
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
      <div>
        <h1 className="text-lg font-bold text-foreground">
          {branch} — P6 Student Registration ({CURRENT_YEAR})
        </h1>
        <a href="/summer/prospect" className="text-xs text-muted-foreground hover:text-primary transition-colors">
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
            className={`relative border-2 rounded-2xl p-6 sm:p-10 transition-all duration-200 cursor-pointer text-center ${
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
          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-sm font-medium transition-all duration-300">
            <Info className="h-4 w-4 shrink-0" />
            {parseInfo}
          </div>
        )}

        {/* Parsed Table — compact main rows with expandable detail panels */}
        {parsedRows.length > 0 && (
          <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-primary/5 border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 w-8">
                    <input type="checkbox" className="rounded" ref={(el) => { if (el) el.indeterminate = selectedParsedKeys.size > 0 && selectedParsedKeys.size < parsedRows.length; }} checked={selectedParsedKeys.size === parsedRows.length && parsedRows.length > 0} onChange={toggleParsedSelectAll} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium hidden sm:table-cell">
                    <SortableHeader label="ID" dir={parsedSort.field === "id" ? parsedSort.dir : null} onToggle={() => setParsedSort((s) => toggleSort(s, "id"))} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium">
                    <SortableHeader label="Name" dir={parsedSort.field === "name" ? parsedSort.dir : null} onToggle={() => setParsedSort((s) => toggleSort(s, "name"))} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium hidden sm:table-cell">
                    <SortableHeader label="School" dir={parsedSort.field === "school" ? parsedSort.dir : null} onToggle={() => setParsedSort((s) => toggleSort(s, "school"))} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground hidden sm:table-cell">Grade</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground hidden sm:table-cell">Tutor</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Phone</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground hidden sm:table-cell">Branch</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Summer?</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Regular (Sept)?</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground hidden md:table-cell"><span className="inline-flex items-center gap-1"><WeChatIcon className="h-3 w-3 text-green-600" />WeChat</span></th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground hidden md:table-cell">Remark</th>
                  <th className="px-3 py-2.5 w-20">
                    <button
                      onClick={toggleExpandAll}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      title={parsedExpandedKeys.size === parsedRows.length ? "Collapse all" : "Expand all"}
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">All</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedParsedIndices.map((idx) => {
                  const row = parsedRows[idx];
                  const w = rowWarnings[idx];
                  const isExpanded = parsedExpandedKeys.has(row._key);
                  return (
                    <React.Fragment key={row._key}>
                      {/* Main row — read-only display */}
                      <tr
                        className={`border-t border-border dark:border-gray-700 cursor-pointer transition-colors ${isExpanded ? "bg-primary/[0.03]" : "hover:bg-primary/[0.03]"}`}
                        onClick={() => toggleExpand(row._key)}
                      >
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="rounded" checked={selectedParsedKeys.has(row._key)} onChange={() => toggleParsedSelect(row._key)} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono hidden sm:table-cell">
                          {row.primary_student_id || "-"}
                          {(w?.duplicateInBatch || w?.alreadySubmitted) && (
                            <AlertTriangle className="inline h-3 w-3 ml-0.5 text-yellow-500" />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`font-medium ${w?.missingName ? "text-red-500" : "text-foreground"}`}>
                            {row.student_name || <span className="text-red-400 italic">Name required</span>}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{row.school || "-"}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{row.grade}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{row.tutor_name || "-"}</td>
                        <td className="px-3 py-2.5 text-xs">
                          <span
                            className={w?.alreadySubmitted ? "text-orange-600 font-medium" : w?.invalidPhone ? "text-yellow-600" : "text-muted-foreground"}
                            title={w?.alreadySubmitted ? "Already in submitted records" : w?.duplicateInBatch ? "Duplicate in batch" : w?.invalidPhone ? "Should be 8 digits" : ""}
                          >
                            {row.phone_1 || "-"}
                          </span>
                          {row.phone_1 && row.phone_1_relation && <span className="text-[10px] text-muted-foreground ml-0.5">({row.phone_1_relation})</span>}
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell"><BranchBadges branches={row.preferred_branches} /></td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <IntentionSelect value={row.wants_summer} onChange={(v) => updateRow(row._key, "wants_summer", v)} />
                        </td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <IntentionSelect value={row.wants_regular} onChange={(v) => updateRow(row._key, "wants_regular", v)} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{row.wechat_id || "-"}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden md:table-cell max-w-[120px] truncate" title={row.tutor_remark}>{row.tutor_remark || "-"}</td>
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
                          <td colSpan={13} className="px-3 py-3 bg-muted/50 dark:bg-muted/20 border-l-4 border-l-primary/30 border-t-2 border-b-2 border-border dark:border-gray-700">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2 text-sm">
                              <SectionDivider label="Student Info" />
                              <FieldInput label="Student ID" value={row.primary_student_id} onChange={(v) => updateRow(row._key, "primary_student_id", v)} />
                              <FieldInput label="Student Name" value={row.student_name} onChange={(v) => updateRow(row._key, "student_name", v)} required span={3} />
                              <FieldInput label="School" value={row.school} onChange={(v) => updateRow(row._key, "school", v)} />
                              <FieldInput label="Grade" value={row.grade} onChange={(v) => updateRow(row._key, "grade", v)} />
                              <FieldInput label="Tutor" value={row.tutor_name} onChange={(v) => updateRow(row._key, "tutor_name", v)} />

                              <SectionDivider label="Contact" />
                              <FieldInput label="Phone" value={row.phone_1} onChange={(v) => updateRow(row._key, "phone_1", v)} type="tel" inputMode="numeric" />
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Phone Relation</label>
                                <select value={row.phone_1_relation} onChange={(e) => updateRow(row._key, "phone_1_relation", e.target.value)} className={`w-full ${inputSmall}`}>
                                  {PHONE_RELATIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                                </select>
                              </div>
                              <FieldInput label="Phone 2 (Optional)" value={row.phone_2} onChange={(v) => updateRow(row._key, "phone_2", v)} type="tel" inputMode="numeric" />
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Phone 2 Relation</label>
                                <select value={row.phone_2_relation} onChange={(e) => updateRow(row._key, "phone_2_relation", e.target.value)} className={`w-full ${inputSmall}`}>
                                  <option value="">—</option>
                                  {PHONE_RELATIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                                </select>
                              </div>
                              <div>
                                <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
                                  <WeChatIcon className="h-3 w-3 text-green-600" /> WeChat ID
                                </label>
                                <input value={row.wechat_id} onChange={(e) => updateRow(row._key, "wechat_id", e.target.value)} className={`w-full ${inputSmall}`} placeholder="WeChat ID" />
                              </div>

                              <SectionDivider label="Preferences" />
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Preferred Branch</label>
                                <BranchCheckboxes value={row.preferred_branches} onChange={(v) => updateRow(row._key, "preferred_branches", v)} />
                              </div>
                              <FieldInput label="Time / Tutor Preference" value={row.preferred_time_note} onChange={(v) => updateRow(row._key, "preferred_time_note", v)} placeholder="e.g. Sat afternoon, Ivan Sir" span={2} />

                              <SectionDivider label="Notes" />
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
            </div>

            {/* Bulk action bar */}
            {selectedParsedKeys.size > 0 && (
              <div className="p-3 border-t-2 border-primary/30 bg-card/95 dark:bg-card/90 backdrop-blur flex items-center gap-3 flex-wrap sticky bottom-12 z-20">
                <span className="bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">{selectedParsedKeys.size}</span>
                <span className="text-xs font-medium">selected</span>
                <button onClick={bulkDeleteParsed} className="text-xs font-medium text-red-600 border border-red-300 dark:border-red-700 rounded-lg px-2 py-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
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
              </div>
            )}

            <div className="p-3 sm:p-4 border-t border-border bg-primary/5 flex items-center justify-between sticky bottom-0 z-10 flex-wrap gap-2">
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
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary border border-primary/30 rounded-lg px-2 py-0.5 hover:bg-primary/5 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add Row
                </button>
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
            <select value={submittedFilters.wants_regular} onChange={(e) => setSubmittedFilters((f) => ({ ...f, wants_regular: e.target.value }))} className={`${inputSmall} hidden sm:inline`}>
              <option value="">Regular: All</option>
              {INTENTIONS.map((i) => (<option key={i} value={i}>{INTENTION_LABELS[i]}</option>))}
            </select>
            <select value={submittedFilters.outreach_status} onChange={(e) => setSubmittedFilters((f) => ({ ...f, outreach_status: e.target.value }))} className={`${inputSmall} hidden sm:inline`}>
              <option value="">Outreach: All</option>
              {OUTREACH_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
            </select>
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
        ) : (
          <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-primary/5 border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 w-8">
                    <input type="checkbox" className="rounded" ref={(el) => { if (el) el.indeterminate = selectedSubmittedIds.size > 0 && selectedSubmittedIds.size < filteredExisting.length; }} checked={selectedSubmittedIds.size === filteredExisting.length && filteredExisting.length > 0} onChange={toggleSubmittedSelectAll} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium hidden sm:table-cell">
                    <SortableHeader label="ID" dir={submittedSort.field === "id" ? submittedSort.dir : null} onToggle={() => setSubmittedSort((s) => toggleSort(s, "id"))} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium">
                    <SortableHeader label="Name" dir={submittedSort.field === "name" ? submittedSort.dir : null} onToggle={() => setSubmittedSort((s) => toggleSort(s, "name"))} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium hidden sm:table-cell">
                    <SortableHeader label="School" dir={submittedSort.field === "school" ? submittedSort.dir : null} onToggle={() => setSubmittedSort((s) => toggleSort(s, "school"))} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground hidden sm:table-cell">Grade</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium hidden sm:table-cell">
                    <SortableHeader label="Tutor" dir={submittedSort.field === "tutor" ? submittedSort.dir : null} onToggle={() => setSubmittedSort((s) => toggleSort(s, "tutor"))} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Phone</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground hidden sm:table-cell">Branch</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Summer?</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground hidden sm:table-cell">Regular (Sept)?</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground hidden md:table-cell"><span className="inline-flex items-center gap-1"><WeChatIcon className="h-3 w-3 text-green-600" />WeChat</span></th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground hidden md:table-cell">Remark</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-foreground">Outreach</th>
                  <th className="px-3 py-2.5 w-24">
                    <button
                      onClick={toggleSubmittedExpandAll}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      title="Expand/collapse all"
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">All</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredExisting.map((p) => {
                  const isEditing = editingId === p.id;
                  const isOpen = editingId === p.id || submittedExpandedKeys.has(`sub-${p.id}`);
                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`border-t border-border dark:border-gray-700 cursor-pointer transition-colors ${isOpen ? "bg-primary/[0.03]" : "hover:bg-primary/[0.03]"}`}
                        onClick={() => { if (!isEditing) toggleSubmittedExpand(p.id); }}
                      >
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="rounded" checked={selectedSubmittedIds.has(p.id)} onChange={() => toggleSubmittedSelect(p.id)} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono hidden sm:table-cell">{p.primary_student_id || "-"}</td>
                        <td className="px-3 py-2.5 font-medium text-foreground">{p.student_name}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{p.school || "-"}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{p.grade}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{p.tutor_name || "-"}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {p.phone_1}
                          {p.phone_1_relation && <span className="text-[10px] ml-0.5">({p.phone_1_relation})</span>}
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell"><BranchBadges branches={p.preferred_branches || []} /></td>
                        <td className="px-3 py-2.5"><IntentionBadge value={p.wants_summer} /></td>
                        <td className="px-3 py-2.5 hidden sm:table-cell"><IntentionBadge value={p.wants_regular} /></td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{p.wechat_id || "-"}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden md:table-cell max-w-[120px] truncate" title={p.tutor_remark || ""}>{p.tutor_remark || "-"}</td>
                        <td className="px-3 py-2.5"><OutreachBadge status={p.outreach_status} /></td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                              title={isOpen ? "Collapse" : "Expand"}
                              onClick={() => toggleSubmittedExpand(p.id)}
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
                          <td colSpan={14} className="px-3 py-3 bg-muted/50 dark:bg-muted/20 border-l-4 border-l-primary/30 border-t-2 border-b-2 border-border dark:border-gray-700">
                            {isEditing ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2 text-sm">
                                  <SectionDivider label="Student Info" />
                                  <FieldInput label="Student ID" value={p.primary_student_id || ""} onChange={() => {}} />
                                  <FieldInput label="Student Name" value={editData.student_name as string ?? p.student_name} onChange={(v) => setEditData((d) => ({ ...d, student_name: v }))} required span={3} />
                                  <FieldInput label="School" value={editData.school as string ?? p.school ?? ""} onChange={(v) => setEditData((d) => ({ ...d, school: v }))} />
                                  <FieldInput label="Grade" value={p.grade || ""} onChange={() => {}} />
                                  <FieldInput label="Tutor" value={p.tutor_name || ""} onChange={() => {}} />

                                  <SectionDivider label="Contact" />
                                  <FieldInput label="Phone" value={editData.phone_1 as string ?? p.phone_1 ?? ""} onChange={(v) => setEditData((d) => ({ ...d, phone_1: v }))} type="tel" inputMode="numeric" />
                                  <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Phone Relation</label>
                                    <select value={editData.phone_1_relation as string ?? p.phone_1_relation ?? "Mother"} onChange={(e) => setEditData((d) => ({ ...d, phone_1_relation: e.target.value }))} className={`w-full ${inputSmall}`}>
                                      {PHONE_RELATIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                                    </select>
                                  </div>
                                  <FieldInput label="Phone 2 (Optional)" value={editData.phone_2 as string ?? p.phone_2 ?? ""} onChange={(v) => setEditData((d) => ({ ...d, phone_2: v }))} type="tel" inputMode="numeric" />
                                  <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Phone 2 Relation</label>
                                    <select value={editData.phone_2_relation as string ?? p.phone_2_relation ?? ""} onChange={(e) => setEditData((d) => ({ ...d, phone_2_relation: e.target.value }))} className={`w-full ${inputSmall}`}>
                                      <option value="">—</option>
                                      {PHONE_RELATIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
                                      <WeChatIcon className="h-3 w-3 text-green-600" /> WeChat ID
                                    </label>
                                    <input value={editData.wechat_id as string ?? p.wechat_id ?? ""} onChange={(e) => setEditData((d) => ({ ...d, wechat_id: e.target.value }))} className={`w-full ${inputSmall}`} placeholder="WeChat ID" />
                                  </div>

                                  <SectionDivider label="Preferences" />
                                  <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Preferred Branch</label>
                                    <BranchCheckboxes
                                      value={(editData.preferred_branches as string[]) ?? p.preferred_branches ?? []}
                                      onChange={(v) => setEditData((d) => ({ ...d, preferred_branches: v }))}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Summer?</label>
                                    <IntentionSelect
                                      value={(editData.wants_summer as ProspectIntention) ?? (p.wants_summer as ProspectIntention) ?? "Considering"}
                                      onChange={(v) => setEditData((d) => ({ ...d, wants_summer: v }))}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Regular (Sept)?</label>
                                    <IntentionSelect
                                      value={(editData.wants_regular as ProspectIntention) ?? (p.wants_regular as ProspectIntention) ?? "Considering"}
                                      onChange={(v) => setEditData((d) => ({ ...d, wants_regular: v }))}
                                    />
                                  </div>
                                  <FieldInput label="Time / Tutor Preference" value={editData.preferred_time_note as string ?? p.preferred_time_note ?? ""} onChange={(v) => setEditData((d) => ({ ...d, preferred_time_note: v }))} placeholder="e.g. Sat afternoon, Ivan Sir" span={2} />

                                  <SectionDivider label="Notes" />
                                  <div className="col-span-full">
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Tutor Remark</label>
                                    <textarea
                                      value={editData.tutor_remark as string ?? p.tutor_remark ?? ""}
                                      onChange={(e) => setEditData((d) => ({ ...d, tutor_remark: e.target.value }))}
                                      className={`w-full ${inputSmall} resize-y`}
                                      rows={2}
                                      placeholder="Notes about the student's ability, learning style, etc."
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
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2 text-sm">
                                <SectionDivider label="Contact" />
                                <div><span className="text-xs text-muted-foreground">Phone 2:</span> {p.phone_2 ? `${p.phone_2}${p.phone_2_relation ? ` (${p.phone_2_relation})` : ""}` : "-"}</div>

                                <SectionDivider label="Preferences" />
                                <div><span className="text-xs text-muted-foreground">Time/Tutor Pref:</span> {p.preferred_time_note || "-"}</div>

                                {p.tutor_remark && (
                                  <>
                                    <SectionDivider label="Notes" />
                                    <div className="col-span-full border-l-4 border-primary/20 pl-3 py-1 bg-primary/[0.03] dark:bg-primary/[0.06] rounded-r">
                                      <span className="text-xs">{p.tutor_remark}</span>
                                    </div>
                                  </>
                                )}
                                {p.submitted_at && (
                                  <div className="col-span-full text-[10px] text-muted-foreground pt-1">
                                    Submitted {new Date(p.submitted_at).toLocaleString()}
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
            {/* Bulk action bar */}
            {selectedSubmittedIds.size > 0 && (
              <div className="p-3 border-t-2 border-primary/30 bg-card/95 dark:bg-card/90 backdrop-blur flex items-center gap-3 flex-wrap sticky bottom-0 z-20">
                <span className="bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">{selectedSubmittedIds.size}</span>
                <span className="text-xs font-medium">selected</span>
                <button onClick={bulkDeleteSubmitted} className="text-xs font-medium text-red-600 border border-red-300 dark:border-red-700 rounded-lg px-2 py-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 className="h-3 w-3 inline mr-1" />Delete
                </button>
              </div>
            )}

            <div className="px-3 py-2 border-t border-border bg-primary/5 flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>{filteredExisting.length}{submittedSearch ? ` of ${existing?.length || 0}` : ""} student{filteredExisting.length !== 1 ? "s" : ""}</span>
              <button onClick={exportCSV} className="inline-flex items-center gap-1 text-xs font-medium text-primary border border-primary/30 rounded-lg px-2 py-0.5 hover:bg-primary/5 transition-colors">
                <Download className="h-3 w-3" />
                Export CSV
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
