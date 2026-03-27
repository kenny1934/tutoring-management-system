"use client";

import useSWR from "swr";
import { X, ExternalLink, Printer, FileText, Lock, GitBranch, ListChecks, CheckCircle2 } from "lucide-react";
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
      <aside className="hidden lg:flex flex-col w-[24rem] shrink-0 border-l border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 bg-white dark:bg-[#1a1a1a] h-full overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 p-6">
          <FileText className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">Select a document to preview</p>
        </div>
      </aside>
    );
  }

  // ── Document selected ──────────────────────────────────────────

  return (
    <aside className="hidden lg:flex flex-col w-[24rem] shrink-0 border-l border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 bg-white dark:bg-[#1a1a1a] h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 p-4 shrink-0">
        {/* Top row: open + close */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => onOpenEditor(docId)}
            className="flex items-center gap-1.5 text-xs font-medium text-[#a0704b] dark:text-[#cd853f] hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Open in Editor
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-5 w-3/4 rounded bg-gray-200 dark:bg-gray-700 skeleton-shimmer" />
            <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700 skeleton-shimmer" />
          </div>
        ) : error ? (
          <div className="text-sm text-red-500">Failed to load document.</div>
        ) : doc ? (
          <>
            {/* Title */}
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate mb-1.5">
              {doc.title || "Untitled"}
            </h2>

            {/* Type + lock */}
            <div className="flex items-center gap-2 mb-2">
              {typeInfo && (
                <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium", typeInfo.color)}>
                  <TypeIcon className="w-3 h-3" />
                  {typeInfo.label}
                </span>
              )}
              {doc.locked_by && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                  <Lock className="w-3 h-3" />
                  {doc.locked_by_name || "Locked"}
                </span>
              )}
              {doc.is_archived && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400 italic">Archived</span>
              )}
            </div>

            {/* Metadata */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              {doc.created_by_name && <span>By {doc.created_by_name}</span>}
              <span>Modified {formatTimeAgo(doc.updated_at)}</span>
            </div>

            {/* Tags */}
            {doc.tags && doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {doc.tags.map((tag) => (
                  <span
                    key={tag}
                    className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", getTagColor(tag))}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Print buttons */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => onPrint(docId, "student")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
              >
                <Printer className="w-3 h-3" />
                Questions Only
              </button>
              <button
                onClick={() => onPrint(docId, "answers")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-[#e8d4b8] dark:border-[#6b5a4a] text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
              >
                With Answers
              </button>
            </div>

            {/* Variant tree */}
            {(doc.parent_id || (doc.children && doc.children.length > 0)) && (
              <div className="py-2 border-t border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30">
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
              <div className="py-2 border-t border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400">
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
