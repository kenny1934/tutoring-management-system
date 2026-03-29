"use client";

import { useRef, useLayoutEffect } from "react";
import useSWR from "swr";
import { X, ExternalLink, Printer, FileText, Lock, GitBranch, ListChecks, ScanLine } from "lucide-react";
import { ReadOnlyRenderer } from "@/components/documents/ReadOnlyRenderer";
import { documentsAPI } from "@/lib/document-api";
import { buildHFontFamily } from "@/lib/tiptap-extensions";
import { formatTimeAgo } from "@/lib/formatters";
import { getTagColor } from "@/lib/tag-colors";
import { DOC_TYPE_CONFIG } from "@/lib/doc-type-config";
import { cn } from "@/lib/utils";
import type { DocType } from "@/types";

interface DocumentPreviewPaneProps {
  docId: number | null;
  onClose: () => void;
  onOpenEditor: (id: number) => void;
  onPrint: (id: number, mode: "student" | "answers") => void;
  /** When true, collapse to zero width with animation (always mounted). */
  collapsed?: boolean;
}

export function DocumentPreviewPane({ docId, onClose, onOpenEditor, onPrint, collapsed }: DocumentPreviewPaneProps) {
  const { data: doc, error, isLoading } = useSWR(
    docId !== null ? ["document-preview", docId] : null,
    () => documentsAPI.get(docId!)
  );

  const margins = {
    top: doc?.page_layout?.margins?.top ?? 25.4,
    right: doc?.page_layout?.margins?.right ?? 25.4,
    bottom: doc?.page_layout?.margins?.bottom ?? 25.4,
    left: doc?.page_layout?.margins?.left ?? 25.4,
  };

  const typeInfo = doc ? DOC_TYPE_CONFIG[doc.doc_type as DocType] : null;
  const questionCount = doc?.questions?.length ?? 0;
  const solvedCount = doc?.solutions ? Object.keys(doc.solutions).length : 0;

  // Fade-in when switching documents.
  // useLayoutEffect runs BEFORE browser paint — set opacity=0 before user sees
  // the new content, then transition it to 1.
  const fadeRef = useRef<HTMLDivElement>(null);
  const prevDocIdRef = useRef(docId);
  useLayoutEffect(() => {
    if (docId !== null && docId !== prevDocIdRef.current) {
      prevDocIdRef.current = docId;
      const el = fadeRef.current;
      if (el) {
        el.style.transition = "none";
        el.style.opacity = "0";
        el.getBoundingClientRect(); // force reflow
        el.style.transition = "opacity 250ms ease-out";
        el.style.opacity = "1";
      }
    } else {
      prevDocIdRef.current = docId;
    }
  }, [docId]);

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col shrink-0 h-full overflow-hidden transition-[width] duration-200 ease-out",
        !collapsed && "border-l border-gray-200 dark:border-gray-700/50"
      )}
      style={{ width: collapsed ? 0 : "20rem" }}
    >
      {docId === null ? (
        /* Empty state */
        <div className={cn("flex-1 flex flex-col items-center justify-center p-6 text-center", !collapsed && "min-w-[20rem]")}>
          <div className={cn("relative mb-4", !collapsed && "animate-empty-float")}>
            <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-[#e8d4b8]/50 dark:bg-[#6b5a4a]/20" />
            <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg bg-[#f5ede3]/70 dark:bg-[#2d2618]/50" />
            <div className="relative w-12 h-16 rounded-lg bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-[var(--shadow-paper-sm)] flex items-center justify-center">
              <FileText className="w-6 h-6 text-[#a0704b]/40 dark:text-[#cd853f]/30" />
            </div>
          </div>
          <p className="text-[13px] font-medium text-gray-400 dark:text-gray-500">No document selected</p>
          <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Click any row to preview</p>
        </div>
      ) : (
        <div ref={fadeRef} className={cn("flex flex-col h-full", !collapsed && "min-w-[20rem]")}>
          {/* Header */}
          <div className="border-b border-[#e8d4b8]/60 dark:border-[#6b5a4a]/40 px-3 py-3 shrink-0 bg-gradient-to-b from-[#fef9f3] to-[#fdf4ec] dark:from-[#1c1811] dark:to-[#181410]">
            {/* Top row: open + close */}
            <div className="flex items-center justify-between mb-1.5">
              <button
                onClick={() => onOpenEditor(docId)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-[#a0704b] dark:text-[#cd853f] hover:text-[#8b5e3c] dark:hover:text-[#e8a84a] transition-colors group/open"
              >
                <ExternalLink className="w-3 h-3 transition-transform duration-150 group-hover/open:translate-x-0.5 group-hover/open:-translate-y-0.5" />
                Open in Editor
              </button>
              <button
                onClick={onClose}
                className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700 shimmer-sepia" />
                <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700 shimmer-sepia" />
              </div>
            ) : error ? (
              <div className="text-xs text-red-500">Failed to load document.</div>
            ) : doc ? (
              <>
                {/* Breadcrumb */}
                {doc.folder_name && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mb-0.5">{doc.folder_name}</p>
                )}

                {/* Title + type */}
                <div className="flex items-center gap-1.5 mb-1">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {doc.title || "Untitled"}
                  </h2>
                  {typeInfo && (
                    <span className={cn("shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tracking-tight", typeInfo.color)}>
                      {typeInfo.abbr}
                    </span>
                  )}
                  {doc.locked_by && <Lock className="w-3 h-3 shrink-0 text-amber-500" />}
                  {doc.is_archived && <span className="text-[9px] text-red-400 dark:text-red-500 italic shrink-0">In Trash</span>}
                </div>

                {/* Metadata line */}
                <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
                  {doc.created_by_name} · {formatTimeAgo(doc.updated_at)}
                </div>

                {/* Tags + source */}
                <div className="flex flex-wrap items-center gap-1 mb-2">
                  {doc.tags?.map((tag) => (
                    <span key={tag} className={cn("px-1.5 py-0.5 rounded text-[9px] font-medium", getTagColor(tag))}>{tag}</span>
                  ))}
                  {doc.source_filename && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] text-gray-400" title={doc.source_filename}>
                      <ScanLine className="w-2.5 h-2.5" />
                      <span className="truncate max-w-[8rem]">{doc.source_filename}</span>
                    </span>
                  )}
                </div>

                {/* Print buttons */}
                <div className="flex items-center gap-1.5 mb-2 p-1.5 rounded-lg bg-gray-50/80 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.04]">
                  <button
                    onClick={() => onPrint(docId, "student")}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
                  >
                    <Printer className="w-3 h-3" />
                    Questions
                  </button>
                  <button
                    onClick={() => onPrint(docId, "answers")}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-gray-600 dark:text-gray-400 border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
                  >
                    With Answers
                  </button>
                </div>

                {/* Variant tree */}
                {(doc.parent_id || (doc.children && doc.children.length > 0)) && (
                  <div className="py-2 border-t border-gray-100 dark:border-gray-800/50">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      <GitBranch className="w-3 h-3" />
                      Variants
                    </div>
                    <div className="space-y-0.5 text-xs">
                      {doc.parent_id && (
                        <button
                          onClick={() => onOpenEditor(doc.parent_id!)}
                          className="flex items-center gap-1.5 w-full px-2 py-1 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-left text-[#a0704b] dark:text-[#cd853f] transition-colors"
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="truncate">{doc.parent_title || `Doc #${doc.parent_id}`}</span>
                          <span className="text-[9px] text-gray-400 ml-auto shrink-0">parent</span>
                        </button>
                      )}
                      <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded text-gray-700 dark:text-gray-300 font-medium ring-1 ring-[#a0704b]/20 bg-[#a0704b]/5", doc.parent_id && "pl-5")}>
                        <FileText className="w-3 h-3 shrink-0" />
                        <span className="truncate">{doc.title}</span>
                        <span className="text-[9px] text-gray-400 ml-auto shrink-0">current</span>
                      </div>
                      {doc.children?.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => onOpenEditor(child.id)}
                          className={cn(
                            "flex items-center gap-1.5 w-full px-2 py-1 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-left text-[#a0704b] dark:text-[#cd853f] transition-colors",
                            !doc.parent_id && "pl-5"
                          )}
                        >
                          <svg className="shrink-0 w-[14px] h-[14px] text-[#a0704b]/25 dark:text-[#cd853f]/20" viewBox="0 0 18 18" fill="none">
                        <path d="M5 0L5 10Q5 14 9 14L18 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                          <span className="truncate">{child.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {questionCount > 0 && (
                  <div className="py-2 border-t border-gray-100 dark:border-gray-800/50">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                      <span className="flex items-center gap-1">
                        <ListChecks className="w-3.5 h-3.5" />
                        {questionCount} question{questionCount !== 1 ? "s" : ""}
                      </span>
                      {solvedCount > 0 && (
                        <span className="text-green-600 dark:text-green-400 font-medium">{solvedCount}/{questionCount}</span>
                      )}
                    </div>
                    {solvedCount > 0 && (
                      <div className="h-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", solvedCount === questionCount ? "bg-[#6aa87a]" : "bg-[#a0704b]")}
                          style={{ width: `${(solvedCount / questionCount) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[85, 70, 95, 60, 80, 90, 65, 75].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-gray-200 dark:bg-gray-700 shimmer-sepia" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : error ? (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Could not load document content.
              </div>
            ) : doc && !doc.content ? (
              <div className="p-4 text-center text-sm text-gray-400 dark:text-gray-500 italic">
                This document is empty.
              </div>
            ) : doc ? (
              <div className="p-4 preview-desk-surface">
              <div className="bg-white dark:bg-[#1a1a1a] rounded-[2px] paper-mode overflow-hidden shadow-paper-preview paper-texture">
                <div
                  style={{
                    padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
                    fontFamily: buildHFontFamily(doc.page_layout?.bodyFontFamily, doc.page_layout?.bodyFontFamilyCjk),
                    fontSize: doc.page_layout?.bodyFontSize ? `${doc.page_layout.bodyFontSize}px` : undefined,
                  }}
                >
                  <ReadOnlyRenderer content={doc.content ?? null} paperMode={true} />
                </div>
              </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
