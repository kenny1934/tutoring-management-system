"use client";

import useSWR from "swr";
import { X, ExternalLink, Printer, FileText, Lock, GitBranch, ListChecks, CheckCircle2, ScanLine } from "lucide-react";
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
}

export function DocumentPreviewPane({ docId, onClose, onOpenEditor, onPrint }: DocumentPreviewPaneProps) {
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
  const TypeIcon = typeInfo?.icon ?? FileText;
  const questionCount = doc?.questions?.length ?? 0;
  const solvedCount = doc?.solutions ? Object.keys(doc.solutions).length : 0;

  // ── Empty state (no document selected) ─────────────────────────

  if (docId === null) {
    return (
      <aside className="hidden lg:flex flex-col w-[20rem] shrink-0 border-l border-gray-200 dark:border-gray-700/50 h-full overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 p-6">
          <FileText className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">Select a document to preview</p>
        </div>
      </aside>
    );
  }

  // ── Document selected ──────────────────────────────────────────

  return (
    <aside className="hidden lg:flex flex-col w-[20rem] shrink-0 border-l border-gray-200 dark:border-gray-700/50 h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700/50 px-3 py-2.5 shrink-0">
        {/* Top row: open + close */}
        <div className="flex items-center justify-between mb-1.5">
          <button
            onClick={() => onOpenEditor(docId)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-[#a0704b] dark:text-[#cd853f] hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
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
            <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700 skeleton-shimmer" />
            <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700 skeleton-shimmer" />
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
                <span className={cn("shrink-0 px-1 py-0.5 rounded text-[9px] font-medium", typeInfo.color)}>
                  {typeInfo.abbr}
                </span>
              )}
              {doc.locked_by && <Lock className="w-3 h-3 shrink-0 text-amber-500" />}
              {doc.is_archived && <span className="text-[9px] text-gray-400 italic shrink-0">Archived</span>}
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
            <div className="flex items-center gap-1.5 mb-2">
              <button
                onClick={() => onPrint(docId, "student")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
              >
                <Printer className="w-3 h-3" />
                Questions
              </button>
              <button
                onClick={() => onPrint(docId, "answers")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
                  <div className={cn("flex items-center gap-1.5 px-2 py-1 text-gray-700 dark:text-gray-300 font-medium", doc.parent_id && "pl-5")}>
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
                      <span className="text-gray-300 dark:text-gray-600 text-[10px] shrink-0">└</span>
                      <span className="truncate">{child.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {questionCount > 0 && (
              <div className="py-2 border-t border-gray-100 dark:border-gray-800/50 flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <ListChecks className="w-3.5 h-3.5" />
                  {questionCount} question{questionCount !== 1 ? "s" : ""}
                </span>
                {solvedCount > 0 && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    {solvedCount}/{questionCount} solved
                  </span>
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
              <div key={i} className="h-3 rounded bg-gray-200 dark:bg-gray-700 skeleton-shimmer" style={{ width: `${w}%` }} />
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
          <div className="p-4 bg-white rounded paper-mode">
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
        ) : null}
      </div>
    </aside>
  );
}
