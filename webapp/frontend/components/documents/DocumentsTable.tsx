"use client";

import { useMemo } from "react";
import { ChevronRight, FileText, Lock, Stamp, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/formatters";
import { getTagColor } from "@/lib/tag-colors";
import { DOC_TYPE_CONFIG } from "@/lib/doc-type-config";
import DocContextMenu from "./DocContextMenu";
import type { Document, DocType, DocumentFolder } from "@/types";

export interface DocumentsTableProps {
  documents: Document[];
  isLoading: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: (visibleIds: number[]) => void;
  expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
  onDocClick: (docId: number) => void;
  previewDocId: number | null;
  menuOpenId: number | null;
  onMenuOpen: (id: number | null) => void;
  onDuplicate: (id: number) => void;
  onArchive: (id: number) => void;
  onUnarchive: (id: number) => void;
  onPermanentDelete: (id: number) => void;
  onSaveAsTemplate?: (id: number) => void;
  onEditTags: (id: number) => void;
  folders: DocumentFolder[];
  onMoveToFolder: (docId: number, folderId: number | null) => void;
  isReadOnly: boolean;
  isTemplatesTab: boolean;
  activeFolderId: number | null;
  emptyTitle: string;
  emptyMessage: string;
}

interface RowData {
  doc: Document;
  indent: number;
  isVariant: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
}

export default function DocumentsTable(props: DocumentsTableProps) {
  const {
    documents, isLoading, selectedIds, onToggleSelect, onToggleSelectAll,
    expandedIds, onToggleExpand, onDocClick, previewDocId,
    menuOpenId, onMenuOpen, onDuplicate, onArchive, onUnarchive, onPermanentDelete,
    onSaveAsTemplate, onEditTags, folders, onMoveToFolder,
    isReadOnly, isTemplatesTab, activeFolderId,
    emptyTitle, emptyMessage,
  } = props;

  const rows = useMemo(() => {
    if (!documents.length) return [];
    const childrenMap = new Map<number, Document[]>();
    const roots: Document[] = [];
    const idsInPage = new Set(documents.map(d => d.id));

    for (const doc of documents) {
      if (doc.parent_id && idsInPage.has(doc.parent_id)) {
        const siblings = childrenMap.get(doc.parent_id) || [];
        siblings.push(doc);
        childrenMap.set(doc.parent_id, siblings);
      } else {
        roots.push(doc);
      }
    }

    const result: RowData[] = [];
    for (const doc of roots) {
      const children = childrenMap.get(doc.id);
      const hasChildren = !!children?.length;
      const isExpanded = expandedIds.has(doc.id);
      result.push({ doc, indent: 0, isVariant: false, hasChildren, isExpanded });
      if (isExpanded && children) {
        children.forEach((child) => {
          result.push({ doc: child, indent: 1, isVariant: true, hasChildren: false, isExpanded: false });
        });
      }
    }
    return result;
  }, [documents, expandedIds]);

  const allVisibleIds = useMemo(() => rows.map(r => r.doc.id), [rows]);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));
  const someSelected = !allSelected && allVisibleIds.some(id => selectedIds.has(id));

  if (isLoading) {
    return (
      <div className="px-2 sm:px-4 py-1">
        {[72, 55, 85, 48, 68, 42, 60, 78].map((w, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-100 dark:border-gray-800/50">
            <div className="w-4 h-4 rounded bg-gray-100 dark:bg-gray-800 animate-pulse shrink-0" />
            <div className="h-4 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ width: `${w}%` }} />
            <div className="ml-auto h-3 w-16 rounded bg-gray-100 dark:bg-gray-800 animate-pulse shrink-0 hidden sm:block" />
          </div>
        ))}
      </div>
    );
  }

  if (!documents.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileText className="w-10 h-10 text-gray-200 dark:text-gray-700 mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{emptyTitle}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-[20rem]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px]">
        <thead className="sticky top-0 z-10 bg-white dark:bg-[#1a1a1a]">
          <tr className="border-b border-gray-200 dark:border-gray-700/50">
            <th className="w-10 py-2.5 px-4">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={() => onToggleSelectAll(allVisibleIds)}
                className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 accent-[#a0704b]"
              />
            </th>
            <th className="py-2.5 pl-1 pr-4 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Name</th>
            <th className="w-24 py-2.5 px-2 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden md:table-cell">Tags</th>
            <th className="w-28 py-2.5 px-2 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden sm:table-cell">Modified</th>
            <th className="w-8 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { doc, indent, isVariant, hasChildren, isExpanded } = row;
            const selected = selectedIds.has(doc.id);
            const isPreviewing = previewDocId === doc.id;
            const meta = DOC_TYPE_CONFIG[doc.doc_type as DocType] || DOC_TYPE_CONFIG.worksheet;
            const questionCount = doc.questions?.length ?? 0;

            return (
              <tr
                key={doc.id}
                onClick={() => onDocClick(doc.id)}
                data-doc-id={doc.id}
                className={cn(
                  "group border-l-2 border-b border-b-gray-100 dark:border-b-gray-800/40 cursor-pointer transition-colors",
                  isVariant && !selected && !isPreviewing && "bg-gray-50/70 dark:bg-gray-800/20",
                  selected && "bg-[#a0704b]/5 dark:bg-[#a0704b]/10 border-l-[#a0704b]",
                  isPreviewing && !selected && "bg-blue-50/50 dark:bg-blue-900/10 border-l-blue-400",
                  !selected && !isPreviewing && "border-l-transparent hover:border-l-[#a0704b]/40 hover:bg-gray-50 dark:hover:bg-gray-800/30",
                  doc.is_archived && "opacity-40",
                )}
              >
                {/* Checkbox */}
                <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(doc.id)}
                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 accent-[#a0704b]"
                  />
                </td>

                {/* Name cell: icon + title + inline badges */}
                <td className="py-2.5 pl-1 pr-4">
                  <div className="flex items-center gap-2 min-w-0" style={indent ? { paddingLeft: `${indent * 1.25}rem` } : undefined}>
                    {hasChildren ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleExpand(doc.id); }}
                        className="shrink-0 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <ChevronRight className={cn("w-3.5 h-3.5 text-gray-300 dark:text-gray-600 transition-transform", isExpanded && "rotate-90")} />
                      </button>
                    ) : isVariant ? (
                      <span className="shrink-0 w-[18px] text-center text-gray-300 dark:text-gray-600 text-[11px] select-none">└</span>
                    ) : (
                      <span className="shrink-0 w-[18px]" />
                    )}

                    <meta.icon className={cn("w-4 h-4 shrink-0", meta.iconColor)} />

                    <span className={cn(
                      "truncate text-[13px]",
                      isVariant ? "text-gray-500 dark:text-gray-400" : "text-gray-800 dark:text-gray-200 font-medium"
                    )}>
                      {doc.title}
                    </span>

                    {/* Inline type abbreviation — subtle */}
                    <span className={cn("shrink-0 text-[10px] font-medium px-1 py-0.5 rounded", meta.color, "opacity-70")}>
                      {meta.abbr}
                    </span>

                    {doc.is_template && <Stamp className="w-3 h-3 shrink-0 text-purple-400" />}
                    {doc.locked_by && <Lock className="w-3 h-3 shrink-0 text-amber-400" />}
                    {hasChildren && (
                      <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-gray-400">
                        <GitBranch className="w-3 h-3" />
                      </span>
                    )}
                    {questionCount > 0 && (
                      <span className="shrink-0 text-[10px] text-gray-400 hidden lg:inline">{questionCount}Q</span>
                    )}
                  </div>
                  {/* Mobile subtitle */}
                  <div className="sm:hidden flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400 dark:text-gray-500" style={indent ? { paddingLeft: `${indent * 1.25 + 2.25}rem` } : { paddingLeft: "2.25rem" }}>
                    <span>{doc.created_by_name}</span>
                    {doc.updated_at && <span>· {formatTimeAgo(doc.updated_at)}</span>}
                  </div>
                </td>

                {/* Tags */}
                <td className="py-2.5 px-2 hidden md:table-cell">
                  <div className="flex items-center gap-1">
                    {(doc.tags || []).slice(0, 2).map((tag) => (
                      <span key={tag} className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", getTagColor(tag))}>
                        {tag}
                      </span>
                    ))}
                    {(doc.tags || []).length > 2 && (
                      <span className="text-[10px] text-gray-400">+{doc.tags!.length - 2}</span>
                    )}
                  </div>
                </td>

                {/* Modified */}
                <td className="py-2.5 px-2 hidden sm:table-cell">
                  <span className="text-[12px] text-gray-400 dark:text-gray-500">
                    {doc.updated_at && formatTimeAgo(doc.updated_at)}
                  </span>
                </td>

                {/* Actions */}
                <td className="py-2.5 pr-2" onClick={(e) => e.stopPropagation()}>
                  {!isReadOnly && (
                    <DocContextMenu
                      doc={doc}
                      menuOpenId={menuOpenId}
                      setMenuOpenId={onMenuOpen}
                      onDuplicate={onDuplicate}
                      onArchive={onArchive}
                      onUnarchive={onUnarchive}
                      onPermanentDelete={onPermanentDelete}
                      onSaveAsTemplate={isTemplatesTab ? undefined : onSaveAsTemplate}
                      folders={folders}
                      onMoveToFolder={(folderId) => onMoveToFolder(doc.id, folderId)}
                      onEditTags={() => onEditTags(doc.id)}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
