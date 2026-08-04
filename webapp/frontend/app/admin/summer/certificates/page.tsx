"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { summerAPI } from "@/lib/api";
import { getLinkedStudentId, LOCATION_TO_CODE, SUMMER_GRADE_BG } from "@/lib/summer-utils";
import { Award, Check, ChevronDown, Download, Loader2 } from "lucide-react";
import { DropdownMenu, menuItemClass } from "@/components/ui/dropdown-menu";
import { SummerApplicationDetailModal } from "@/components/admin/SummerApplicationDetailModal";
import type { SummerStudentLessonsRow } from "@/types";

const selectClass = "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

/** Official rule: at least 80% of the full course, rounded up (7 of 8). */
function officialThreshold(totalLessons: number): number {
  return Math.ceil(totalLessons * 0.8);
}

/** Whole-number percent of the student's own paid plan. */
function attendancePct(row: SummerStudentLessonsRow): number | null {
  return row.lessons_paid > 0
    ? Math.round((row.attended_count / row.lessons_paid) * 100)
    : null;
}

/** The bare student code (the branch has its own column). */
function studentCode(row: SummerStudentLessonsRow): string {
  return getLinkedStudentId(row) ?? "";
}

/** The CSM student record's name wins over the self-filled application name. */
function displayName(row: SummerStudentLessonsRow): string {
  return row.linked_student?.student_name || row.student_name;
}

/** One dropdown in the house style, shared by the year and branch pickers. */
function PickerDropdown({ label, align, items }: {
  label: string | number;
  align: "left" | "right";
  items: { key: string; label: string | number; selected: boolean; onSelect: () => void }[];
}) {
  return (
    <DropdownMenu
      align={align}
      trigger={({ triggerProps }) => (
        <button type="button" {...triggerProps} className={cn(selectClass, "inline-flex items-center gap-1.5")}>
          <span className="font-medium">{label}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
    >
      {(close) => (
        <div className="py-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => { item.onSelect(); close(); }}
              className={cn(menuItemClass, item.selected && "font-semibold text-primary")}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </DropdownMenu>
  );
}

/** Quote a CSV cell only when it contains a comma, quote, or newline. */
function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCertificatesCsv(rows: SummerStudentLessonsRow[], threshold: number): string {
  const lines: (string | number | null | undefined)[][] = [];
  lines.push(["Branch", "Code", "Student", "Grade", "Stream", "Attended", "Lessons paid", "Attendance %", "Certificate"]);
  rows.forEach((r) => {
    const pct = attendancePct(r);
    lines.push([
      r.branch_code, studentCode(r), displayName(r), r.grade, r.lang_stream,
      r.attended_count, r.lessons_paid, pct === null ? "" : `${pct}%`,
      r.attended_count >= threshold ? "Eligible" : "",
    ]);
  });
  return lines.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export default function SummerCertificatesPage() {
  usePageTitle("Summer Certificates");
  const { canViewAdminPages, isReadOnly } = useAuth();
  const [configId, setConfigId] = useState<number | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);

  const { data: configs } = useSWR(
    canViewAdminPages ? "summer-configs" : null,
    () => summerAPI.getConfigs()
  );

  useEffect(() => {
    if (configs && configs.length > 0 && configId === null) {
      const active = configs.find((c) => c.is_active);
      setConfigId((active ?? configs[0]).id);
    }
  }, [configs, configId]);

  const config = configs?.find((c) => c.id === configId);

  // Same key family as the arrangement Students tab (third element null =
  // all branches), so the existing prefix invalidators refresh this page
  // when attendance or lesson numbers change elsewhere.
  const { data, isLoading, mutate } = useSWR(
    configId !== null ? ["summer-student-lessons", configId, null] : null,
    () => summerAPI.getStudentLessons(configId!)
  );

  // The detail modal fetches its own application, same key as the
  // arrangement page so the two share the cache.
  const { data: selectedApp, mutate: mutateSelectedApp } = useSWR(
    selectedAppId ? ["summer-app", selectedAppId] : null,
    () => summerAPI.getApplication(selectedAppId!)
  );

  const threshold = config ? officialThreshold(config.total_lessons) : null;

  // The config owns which branches exist; rows only say who sits where.
  const branchOptions = (config?.locations ?? []).map((l) => LOCATION_TO_CODE[l.name] ?? l.name);

  // Branch and search narrow the list; the eligible count reflects that
  // narrowed list so the toggle never changes the numbers, only the rows.
  const baseRows = useMemo(() => {
    // Certificates only concern students who actually enrolled; the shared
    // endpoint also returns applicants still mid-workflow, all at 0 attended.
    let list = (data?.students ?? []).filter((s) => s.application_status === "Enrolled");
    if (branch) list = list.filter((s) => s.branch_code === branch);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) => displayName(s).toLowerCase().includes(q) || studentCode(s).toLowerCase().includes(q)
      );
    }
    return [...list].sort(
      (a, b) => b.attended_count - a.attended_count || displayName(a).localeCompare(displayName(b))
    );
  }, [data, branch, search]);

  const eligibleRows = threshold === null ? [] : baseRows.filter((s) => s.attended_count >= threshold);

  const rows = eligibleOnly ? eligibleRows : baseRows;

  const handleExport = () => {
    if (rows.length === 0 || threshold === null || !config) return;
    const BOM = String.fromCharCode(0xfeff); // so Excel reads the UTF-8 file
    const csv = BOM + buildCertificatesCsv(rows, threshold);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `summer-certificates-${config.year}${branch ? `-${branch}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!canViewAdminPages) {
    return (
      <DeskSurface fullHeight>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          You do not have access to this page.
        </div>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex flex-col h-full p-4 sm:p-6">
        <div className="flex flex-col h-full bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm paper-texture overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-foreground">Certificates</h1>
                <p className="hidden sm:block text-xs text-muted-foreground">
                  {threshold !== null && config
                    ? `Students qualify by attending at least ${threshold} of the ${config.total_lessons} lessons.`
                    : "Sessions attended by each summer student."}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {configs && configs.length > 1 && (
                  <PickerDropdown
                    align="right"
                    label={config?.year ?? "Year"}
                    items={configs.map((c) => ({
                      key: String(c.id),
                      label: c.year,
                      selected: c.id === configId,
                      onSelect: () => { setConfigId(c.id); setBranch(null); },
                    }))}
                  />
                )}
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={rows.length === 0}
                  className={cn(selectClass, "inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed")}
                  title="Download this list as CSV"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="px-4 sm:px-6 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center gap-2 flex-wrap">
            {branchOptions.length > 1 && (
              <PickerDropdown
                align="left"
                label={branch ?? "All branches"}
                items={[
                  { key: "all", label: "All branches", selected: branch === null, onSelect: () => setBranch(null) },
                  ...branchOptions.map((b) => ({
                    key: b, label: b, selected: b === branch, onSelect: () => setBranch(b),
                  })),
                ]}
              />
            )}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or code"
              aria-label="Search students"
              className={cn(selectClass, "w-40 sm:w-52")}
            />
            <button
              type="button"
              onClick={() => setEligibleOnly((v) => !v)}
              aria-pressed={eligibleOnly}
              className={cn(
                selectClass,
                "inline-flex items-center gap-1.5",
                eligibleOnly &&
                  "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
              )}
            >
              <Award className="h-3.5 w-3.5" />
              Eligible only
            </button>
            <div className="ml-auto text-xs text-muted-foreground tabular-nums">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{eligibleRows.length}</span>
              {" of "}
              <span className="font-semibold text-foreground">{baseRows.length}</span>
              {" students eligible"}
            </div>
          </div>

          {/* Body */}
          {isLoading || !data ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="bg-[#f0e6d8]/50 dark:bg-[#2a2520] sticky top-0 z-10">
                  <tr className="border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30">
                    <th className="px-3 py-2 text-left font-medium text-foreground">Branch</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Code</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Student</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Grade</th>
                    <th
                      className="px-3 py-2 text-right font-medium text-foreground cursor-help"
                      title="Sessions attended out of the lessons the student paid for"
                    >
                      Attended
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-foreground">Certificate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30">
                  {rows.map((row, i) => {
                    const pct = attendancePct(row);
                    const eligible = threshold !== null && row.attended_count >= threshold;
                    const name = displayName(row);
                    return (
                      <tr
                        key={row.application_id}
                        onClick={() => setSelectedAppId(row.application_id)}
                        className={cn(
                          "cursor-pointer hover:bg-primary/5",
                          i % 2 === 1 && "bg-[#f5efe7]/30 dark:bg-[#222]"
                        )}
                      >
                        <td className="px-3 py-2 font-medium text-foreground">{row.branch_code}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{studentCode(row)}</td>
                        <td
                          className="px-3 py-2 font-medium text-foreground"
                          title={name !== row.student_name ? `Application form name: ${row.student_name}` : undefined}
                        >
                          {name}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            "text-[10px] font-bold px-1 rounded",
                            SUMMER_GRADE_BG[row.grade] || "bg-gray-100 dark:bg-gray-700"
                          )}>
                            {row.grade}
                            {row.lang_stream || ""}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <span className="font-semibold text-foreground">{row.attended_count}</span>
                          <span className="text-muted-foreground"> / {row.lessons_paid}</span>
                          {pct !== null && <span className="text-muted-foreground"> · {pct}%</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {eligible && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-medium">
                              <Check className="h-3 w-3" />
                              Eligible
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground italic">
                        {eligibleOnly ? "No eligible students match the filters." : "No students match the filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <SummerApplicationDetailModal
          application={selectedApp?.id === selectedAppId ? selectedApp : null}
          isOpen={selectedAppId !== null}
          onClose={() => setSelectedAppId(null)}
          onUpdated={() => {
            void mutateSelectedApp();
            void mutate();
          }}
          locations={config?.locations}
          config={config ?? null}
          baseFee={config?.pricing_config?.base_fee}
          readOnly={isReadOnly}
        />
      </PageTransition>
    </DeskSurface>
  );
}
