"use client";

import { useMemo } from "react";
import { ChevronRight, FileText, Lock, Stamp, GitBranch, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/formatters";
import { getTagColor } from "@/lib/tag-colors";
import DocContextMenu from "./DocContextMenu";
import type { Document, DocumentFolder } from "@/types";

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
  isTrashTab?: boolean;
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
    isReadOnly, isTemplatesTab, isTrashTab, activeFolderId,
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
    const addRows = (docs: Document[], indent: number) => {
      for (const doc of docs) {
        const children = childrenMap.get(doc.id);
        const hasChildren = !!children?.length;
        const isExpanded = expandedIds.has(doc.id);
        result.push({ doc, indent, isVariant: indent > 0, hasChildren, isExpanded });
        if (isExpanded && children) {
          addRows(children, indent + 1);
        }
      }
    };
    addRows(roots, 0);
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
            <div className="w-4 h-4 rounded bg-gray-100 dark:bg-gray-800 shimmer-sepia shrink-0" />
            <div className="h-4 rounded bg-gray-100 dark:bg-gray-800 shimmer-sepia" style={{ width: `${w}%` }} />
            <div className="ml-auto h-3 w-16 rounded bg-gray-100 dark:bg-gray-800 shimmer-sepia shrink-0 hidden sm:block" />
          </div>
        ))}
      </div>
    );
  }

  if (!documents.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className={cn("animate-empty-float w-14 h-14 rounded-2xl flex items-center justify-center mb-4", isTrashTab ? "bg-red-50 dark:bg-red-950/20" : "bg-[#f5ede3] dark:bg-[#2d2618]")}>
          {isTrashTab ? <Trash2 className="w-7 h-7 text-red-300 dark:text-red-800" /> : <FileText className="w-7 h-7 text-[#a0704b]/40 dark:text-[#cd853f]/30" />}
        </div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{emptyTitle}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-[20rem]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px]">
        <thead className="sticky top-0 z-10 bg-white dark:bg-[#1a1a1a] docs-table-header">
          <tr className="border-b border-[#e8d4b8] dark:border-[#6b5a4a]/50">
            <th className="w-10 py-2.5 px-4">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={() => onToggleSelectAll(allVisibleIds)}
                className="w-3.5 h-3.5 rounded border-[#e8d4b8] dark:border-[#6b5a4a] accent-[#a0704b]"
              />
            </th>
            <th className="py-2.5 pl-1 pr-4 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
            <th className="w-24 py-2.5 px-2 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden md:table-cell">{isTrashTab ? "Location" : "Tags"}</th>
            <th className="w-28 py-2.5 px-2 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden sm:table-cell">{isTrashTab ? "Trashed" : "Modified"}</th>
            <th className="w-8 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { doc, indent, isVariant, hasChildren, isExpanded } = row;
            const selected = selectedIds.has(doc.id);
            const isPreviewing = previewDocId === doc.id;
            const questionCount = doc.questions?.length ?? 0;

            return (
              <tr
                key={doc.id}
                onClick={() => onDocClick(doc.id)}
                data-doc-id={doc.id}
                className={cn(
                  "group border-l-2 border-b border-b-[#e8d4b8]/30 dark:border-b-[#6b5a4a]/30 cursor-pointer transition-colors",
                  isVariant && !selected && !isPreviewing && "bg-gray-50/70 dark:bg-gray-800/20 animate-fade-slide-in",
                  selected && "bg-[#a0704b]/5 dark:bg-[#a0704b]/10 border-l-[#a0704b]",
                  isPreviewing && !selected && "bg-[#f5ede3]/50 dark:bg-[#2d2618]/30 border-l-[#a0704b]",
                  !selected && !isPreviewing && "border-l-transparent hover:border-l-[#a0704b]/60 hover:bg-[#fef9f3] dark:hover:bg-[#2d2618]/40",
                  doc.is_archived && !isTrashTab && "opacity-40",
                )}
              >
                {/* Checkbox */}
                <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(doc.id)}
                    className="w-3.5 h-3.5 rounded border-[#e8d4b8] dark:border-[#6b5a4a] accent-[#a0704b]"
                  />
                </td>

                {/* Name cell: icon + title + inline badges */}
                <td className="py-2.5 pl-1 pr-4">
                  <div className="flex items-center gap-2 min-w-0 table-row-name-hover" style={indent ? { paddingLeft: `${indent * 1.25}rem` } : undefined}>
                    {hasChildren ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleExpand(doc.id); }}
                        className="shrink-0 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <ChevronRight className={cn("w-3.5 h-3.5 text-gray-300 dark:text-gray-600 transition-transform", isExpanded && "rotate-90")} />
                      </button>
                    ) : isVariant ? (
                      <svg className="shrink-0 w-[18px] h-[18px] text-[#a0704b]/25 dark:text-[#cd853f]/20" viewBox="0 0 18 18" fill="none">
                        <path d="M5 0L5 10Q5 14 9 14L18 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="animate-path-draw" />
                      </svg>
                    ) : (
                      <span className="shrink-0 w-[18px]" />
                    )}

                    <FileText className="w-4 h-4 shrink-0 text-[#a0704b]/60 dark:text-[#cd853f]/50" />

                    <span className={cn(
                      "truncate text-[13px]",
                      isTrashTab ? "text-gray-400 dark:text-gray-500" : isVariant ? "text-gray-500 dark:text-gray-400" : "text-gray-800 dark:text-gray-200 font-medium"
                    )}>
                      {doc.title}
                    </span>

                    {doc.is_template && <Stamp className="w-3 h-3 shrink-0 text-purple-400" />}
                    {doc.locked_by && <Lock className="w-3 h-3 shrink-0 text-amber-400" />}
                    {hasChildren && (
                      <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-gray-400">
                        <GitBranch className="w-3 h-3" />
                      </span>
                    )}
                    {questionCount > 0 && (
                      <span className="shrink-0 text-[9px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full hidden lg:inline tabular-nums">{questionCount}Q</span>
                    )}
                  </div>
                  {/* Mobile subtitle */}
                  <div className="sm:hidden flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400 dark:text-gray-500" style={indent ? { paddingLeft: `${indent * 1.25 + 2.25}rem` } : { paddingLeft: "2.25rem" }}>
                    <span>{doc.created_by_name}</span>
                    {doc.updated_at && <span>· {formatTimeAgo(doc.updated_at)}</span>}
                  </div>
                </td>

                {/* Tags / Location (trash) */}
                <td className="py-2.5 px-2 hidden md:table-cell">
                  {isTrashTab ? (
                    <span className="text-[12px] text-gray-400 dark:text-gray-500 truncate">
                      {doc.folder_name || "—"}
                    </span>
                  ) : (
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
                  )}
                </td>

                {/* Modified / Trashed date */}
                <td className="py-2.5 px-2 hidden sm:table-cell">
                  <span className="text-[12px] text-gray-400 dark:text-gray-500">
                    {isTrashTab && doc.archived_at
                      ? formatTimeAgo(doc.archived_at)
                      : doc.updated_at && formatTimeAgo(doc.updated_at)}
                  </span>
                </td>

                {/* Actions */}
                <td className="py-2.5 pr-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150" onClick={(e) => e.stopPropagation()}>
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
