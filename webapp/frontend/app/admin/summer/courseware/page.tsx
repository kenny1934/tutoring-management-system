"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { usePageTitle } from "@/lib/hooks";
import { summerAPI, summerCoursewareAPI } from "@/lib/api";
import type {
  SummerCourseConfig,
  SummerCoursewareFile,
  SummerCoursewareIndexResponse,
} from "@/types";
import { isFileSystemAccessSupported } from "@/lib/file-system";
import { pickAndScanTree, ScanTreeResult } from "@/lib/summer-courseware-scan";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatShortDate } from "@/lib/formatters";
import { BookOpen, FolderSearch, AlertTriangle, Loader2 } from "lucide-react";

const INDEXED_GRADES = ["F1", "F2", "F3"];

interface Chapter {
  grade: string;
  code: string;
  lessonNumber: number | null;
  topicZh: string | null;
  topicEn: string | null;
  files: SummerCoursewareFile[];
  latestMtime: string | null;
}

function groupChapters(files: SummerCoursewareFile[]): Map<string, Chapter[]> {
  const byChapter = new Map<string, Chapter>();
  for (const f of files) {
    if (!f.grade || !f.course_code) continue;
    const key = `${f.grade}|${f.course_code}`;
    let ch = byChapter.get(key);
    if (!ch) {
      ch = {
        grade: f.grade,
        code: f.course_code,
        lessonNumber: f.lesson_number,
        topicZh: f.topic_zh,
        topicEn: f.topic_en,
        files: [],
        latestMtime: null,
      };
      byChapter.set(key, ch);
    }
    ch.files.push(f);
    if (f.file_mtime && (!ch.latestMtime || f.file_mtime > ch.latestMtime)) {
      ch.latestMtime = f.file_mtime;
    }
  }
  const byGrade = new Map<string, Chapter[]>();
  for (const ch of byChapter.values()) {
    if (!byGrade.has(ch.grade)) byGrade.set(ch.grade, []);
    byGrade.get(ch.grade)!.push(ch);
  }
  for (const chapters of byGrade.values()) {
    chapters.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }
  return byGrade;
}

/** Presence chip for one language variant of a document type. */
function LangChip({
  chapter,
  docType,
  lang,
}: {
  chapter: Chapter;
  docType: "CW" | "HW" | "Extra";
  lang: "e" | "c";
}) {
  const question = chapter.files.some(
    (f) => f.doc_type === docType && f.lang === lang && !f.is_parallel && !f.is_answer
  );
  const answer = chapter.files.some(
    (f) => f.doc_type === docType && f.lang === lang && !f.is_parallel && f.is_answer
  );
  const label = lang === "e" ? "E" : "C";

  if (!question) {
    // Extra material legitimately exists in one language only, so an absent
    // chip is informational rather than an error.
    return (
      <span
        title={`No ${lang === "e" ? "English" : "Chinese"} ${docType} file`}
        className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-300 dark:text-gray-600"
      >
        {label}
      </span>
    );
  }
  return (
    <span
      title={
        answer
          ? `${lang === "e" ? "English" : "Chinese"} ${docType} with answer file`
          : `${lang === "e" ? "English" : "Chinese"} ${docType} found, but its answer file is missing`
      }
      className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-semibold ${
        answer
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      }`}
    >
      {label}
    </span>
  );
}

/** Presence chip for a parallel (merged-language) version. */
function ParallelChip({ chapter, docType }: { chapter: Chapter; docType: "CW" | "HW" | "Extra" }) {
  const present = chapter.files.some(
    (f) => f.doc_type === docType && f.is_parallel && !f.is_answer
  );
  if (!present) {
    return (
      <span
        title={`No parallel ${docType} version`}
        className="inline-flex items-center justify-center h-6 px-1.5 rounded text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-300 dark:text-gray-600"
      >
        {docType}
      </span>
    );
  }
  return (
    <span
      title={`Parallel ${docType} version available`}
      className="inline-flex items-center justify-center h-6 px-1.5 rounded text-xs font-semibold bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
    >
      {docType}
    </span>
  );
}

export default function AdminSummerCoursewarePage() {
  usePageTitle("Summer Courseware");
  const { user, isLoading: authLoading, canViewAdminPages, isReadOnly } = useAuth();
  const { showToast } = useToast();

  const [configs, setConfigs] = useState<SummerCourseConfig[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [index, setIndex] = useState<SummerCoursewareIndexResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Rescan flow: walk the picked folder first, then confirm before replacing.
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [pendingScan, setPendingScan] = useState<ScanTreeResult | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user || !canViewAdminPages) return;
    summerAPI
      .getConfigs()
      .then((data) => {
        const sorted = data.sort((a, b) => b.year - a.year);
        setConfigs(sorted);
        const active = sorted.find((c) => c.is_active) ?? sorted[0];
        setYear((y) => y ?? active?.year ?? new Date().getFullYear());
      })
      .catch(() => showToast("Failed to load summer configs", "error"));
  }, [user, canViewAdminPages, showToast]);

  const loadIndex = useCallback(async (targetYear: number) => {
    setLoading(true);
    try {
      setIndex(await summerCoursewareAPI.getIndex(targetYear));
    } catch {
      showToast("Failed to load courseware index", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (year !== null) loadIndex(year);
  }, [year, loadIndex]);

  const handlePickFolder = async () => {
    if (!isFileSystemAccessSupported()) {
      showToast("Folder scanning needs Chrome or Edge", "error");
      return;
    }
    setScanning(true);
    setScanProgress(0);
    try {
      const result = await pickAndScanTree(setScanProgress);
      if (!result) return; // cancelled
      if (result.truncated) {
        showToast("That folder is too large to scan. Pick the year's Finalised folder.", "error");
        return;
      }
      if (result.files.length === 0) {
        showToast("The selected folder contains no files", "error");
        return;
      }
      setPendingScan(result);
    } finally {
      setScanning(false);
    }
  };

  const handleConfirmScan = async () => {
    if (!pendingScan || year === null) return;
    setUploading(true);
    try {
      const result = await summerCoursewareAPI.scan({
        year,
        root_name: pendingScan.rootName,
        files: pendingScan.files,
      });
      setIndex(result);
      showToast(`Courseware index updated for ${year}`, "success");
      setPendingScan(null);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Scan failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const chaptersByGrade = useMemo(
    () => groupChapters(index?.files ?? []),
    [index]
  );
  const totalLessons = configs.find((c) => c.year === year)?.total_lessons ?? 8;

  if (authLoading) {
    return (
      <DeskSurface>
        <PageTransition className="min-h-full p-4 sm:p-6">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  if (!user || !canViewAdminPages) {
    return (
      <DeskSurface>
        <PageTransition className="min-h-full p-4 sm:p-6">
          <p className="text-center py-20 text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </PageTransition>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Summer Courseware</h1>
                <p className="text-xs text-muted-foreground">
                  Scanned snapshot of the courseware drive, used for lesson defaults
                  {isReadOnly && <span className="ml-2 text-amber-600">(Read-only)</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={year ?? ""}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground text-sm"
              >
                {configs.map((c) => (
                  <option key={c.id} value={c.year}>
                    {c.year}
                  </option>
                ))}
              </select>
              {!isReadOnly && (
                <button
                  onClick={handlePickFolder}
                  disabled={scanning || year === null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Scanning… {scanProgress > 0 && `${scanProgress} files`}
                    </>
                  ) : (
                    <>
                      <FolderSearch className="h-3.5 w-3.5" />
                      Rescan Drive
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-6">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 rounded-lg border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 animate-pulse">
                    <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-4 w-64 bg-gray-100 dark:bg-gray-800 rounded mt-2" />
                  </div>
                ))}
              </div>
            ) : !index?.scan ? (
              /* Empty state doubles as next-year setup instructions */
              <div className="text-center py-12 max-w-md mx-auto">
                <FolderSearch className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="mt-4 font-medium text-foreground">
                  No courseware index for {year} yet
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  On a centre PC with the courseware drive mapped, click Rescan Drive and
                  pick the year&apos;s <span className="font-medium">Finalised</span> folder
                  (under Secondary&nbsp;&gt;&nbsp;Summer Course&nbsp;&gt;&nbsp;{year} Summer).
                  Lesson defaults switch on automatically once the index exists.
                </p>
                {!isFileSystemAccessSupported() && (
                  <p className="mt-3 text-sm text-amber-600">
                    Folder scanning needs Chrome or Edge.
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Scan summary */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    Last scanned {index.scan.scanned_at ? formatShortDate(index.scan.scanned_at) : "-"}
                    {index.scan.scanned_by && ` by ${index.scan.scanned_by}`}
                  </span>
                  <span>·</span>
                  <span>{index.scan.classified_count} files indexed</span>
                  {index.scan.excluded_count > 0 && (
                    <>
                      <span>·</span>
                      <span title="Working files such as Word documents and Raw folders are left out on purpose">
                        {index.scan.excluded_count} working files skipped
                      </span>
                    </>
                  )}
                  {index.scan.skipped_grade_count > 0 && (
                    <>
                      <span>·</span>
                      <span title="Only F1 to F3 materials are indexed for now">
                        {index.scan.skipped_grade_count} files outside F1-F3
                      </span>
                    </>
                  )}
                </div>

                {/* Unclassified files: the naming-drift alarm */}
                {index.unclassified.length > 0 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                    <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300 text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      {index.unclassified.length} file{index.unclassified.length !== 1 ? "s" : ""} didn&apos;t
                      match the naming convention
                    </div>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      These files are on the drive but won&apos;t appear as lesson defaults.
                      Rename them to match the usual pattern and rescan.
                    </p>
                    <ul className="mt-2 space-y-1 text-xs font-mono text-amber-900 dark:text-amber-200 max-h-48 overflow-y-auto">
                      {index.unclassified.map((f) => (
                        <li key={f.id}>
                          {f.rel_path}
                          <span className="ml-2 font-sans text-amber-600 dark:text-amber-400">
                            ({f.unclassified_reason})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Health matrix per grade */}
                {INDEXED_GRADES.map((grade) => {
                  const chapters = chaptersByGrade.get(grade) ?? [];
                  return (
                    <div key={grade} className="rounded-lg border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                        <span className="font-semibold text-foreground">{grade}</span>
                        <span className="text-xs text-muted-foreground">
                          {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {chapters.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                          No chapters found for {grade} in the last scan.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-muted-foreground border-b border-gray-100 dark:border-gray-800">
                                <th className="text-left font-medium px-4 py-2">Lesson</th>
                                <th className="text-left font-medium px-2 py-2">Chapter</th>
                                <th className="text-left font-medium px-2 py-2">Classwork</th>
                                <th className="text-left font-medium px-2 py-2">Homework</th>
                                <th className="text-left font-medium px-2 py-2">Extra</th>
                                <th className="text-left font-medium px-2 py-2">Parallel</th>
                                <th className="text-left font-medium px-4 py-2">Updated</th>
                              </tr>
                            </thead>
                            <tbody>
                              {chapters.map((ch) => {
                                const isExtraChapter =
                                  ch.lessonNumber !== null && ch.lessonNumber > totalLessons;
                                return (
                                  <tr key={ch.code} className="border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                                    <td className="px-4 py-2 whitespace-nowrap">
                                      {ch.lessonNumber === null ? (
                                        <span className="text-muted-foreground">-</span>
                                      ) : isExtraChapter ? (
                                        <span
                                          title="Beyond the scheduled lessons. Available for tutors to assign, never a default."
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                                        >
                                          Extra chapter
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                          L{ch.lessonNumber}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-2 py-2 min-w-[14rem]">
                                      <div className="font-medium text-foreground whitespace-nowrap">
                                        SM{ch.code} {ch.topicZh}
                                      </div>
                                      {ch.topicEn && (
                                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                                          {ch.topicEn}
                                        </div>
                                      )}
                                    </td>
                                    {(["CW", "HW", "Extra"] as const).map((dt) => (
                                      <td key={dt} className="px-2 py-2 whitespace-nowrap">
                                        <span className="inline-flex gap-1">
                                          <LangChip chapter={ch} docType={dt} lang="e" />
                                          <LangChip chapter={ch} docType={dt} lang="c" />
                                        </span>
                                      </td>
                                    ))}
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <span className="inline-flex gap-1">
                                        <ParallelChip chapter={ch} docType="CW" />
                                        <ParallelChip chapter={ch} docType="HW" />
                                        <ParallelChip chapter={ch} docType="Extra" />
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                                      {ch.latestMtime ? formatShortDate(ch.latestMtime) : "-"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Legend */}
                <p className="text-xs text-muted-foreground">
                  E / C = English / Chinese version. Green = file and answer present,
                  amber = answer file missing, dashed = not on the drive.
                  Parallel versions merge both languages side by side for mixed classes.
                </p>
              </>
            )}
          </div>

          {/* Replace-index confirmation */}
          <ConfirmDialog
            isOpen={pendingScan !== null}
            onCancel={() => setPendingScan(null)}
            onConfirm={handleConfirmScan}
            title="Update Courseware Index"
            message={`Replace the ${year} index with ${pendingScan?.files.length ?? 0} files scanned from "${pendingScan?.rootName}"? Lesson defaults will follow the new scan immediately.`}
            confirmText="Update Index"
            loading={uploading}
          />
        </div>
      </PageTransition>
    </DeskSurface>
  );
}
