"use client";

import { useMemo } from "react";
import { ChevronRight, FileText, Lock, Stamp, FolderOpen, GitBranch } from "lucide-react";
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
  // Context menu
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
  // Empty state
  emptyTitle: string;
  emptyMessage: string;
}

interface RowData {
  doc: Document;
  indent: number;
  isVariant: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  isLast: boolean;
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

  // Group documents by parent-child for variant tree
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
      result.push({ doc, indent: 0, isVariant: false, hasChildren, isExpanded, isLast: false });
      if (isExpanded && children) {
        children.forEach((child, i) => {
          result.push({ doc: child, indent: 1, isVariant: true, hasChildren: false, isExpanded: false, isLast: i === children.length - 1 });
        });
      }
    }
    return result;
  }, [documents, expandedIds]);

  // Selection state
  const allVisibleIds = useMemo(() => rows.map(r => r.doc.id), [rows]);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));
  const someSelected = !allSelected && allVisibleIds.some(id => selectedIds.has(id));

  if (isLoading) {
    return (
      <div className="px-3">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a]">
              <th className="w-10 py-2.5" />
              <th className="py-2.5 text-left"><div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></th>
              <th className="w-16 py-2.5 hidden sm:table-cell" />
              <th className="w-40 py-2.5 hidden md:table-cell" />
              <th className="w-20 py-2.5 hidden lg:table-cell" />
              <th className="w-36 py-2.5 hidden sm:table-cell" />
              <th className="w-10 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {[65, 45, 78, 52, 70, 40, 58, 73].map((w, i) => (
              <tr key={i} className="border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30">
                <td className="py-3 px-2"><div className="w-4 h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
                <td className="py-3"><div className="h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" style={{ width: `${w}%` }} /></td>
                <td className="py-3 hidden sm:table-cell"><div className="h-5 w-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
                <td className="py-3 hidden md:table-cell"><div className="h-4 w-16 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
                <td className="py-3 hidden lg:table-cell" />
                <td className="py-3 hidden sm:table-cell"><div className="h-3 w-14 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
                <td className="py-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!documents.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{emptyTitle}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="px-1 sm:px-3 overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a] text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <th className="w-10 py-2 px-2 text-center">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={() => onToggleSelectAll(allVisibleIds)}
                className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 accent-[#a0704b]"
              />
            </th>
            <th className="py-2 pl-2 text-left">Title</th>
            <th className="w-14 py-2 text-center hidden sm:table-cell">Type</th>
            <th className="w-36 py-2 text-left hidden md:table-cell">Tags</th>
            <th className="w-16 py-2 text-center hidden lg:table-cell">Info</th>
            <th className="w-32 py-2 text-left hidden sm:table-cell">Modified</th>
            <th className="w-10 py-2" />
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
                className={cn(
                  "group border-b border-[#e8d4b8]/20 dark:border-[#6b5a4a]/20 cursor-pointer transition-colors",
                  isVariant && "bg-[#faf5ef]/50 dark:bg-[#1f1a14]/30",
                  selected && "!bg-[#f5ede3] dark:!bg-[#2d2618]",
                  isPreviewing && "ring-1 ring-inset ring-[#a0704b]/30",
                  doc.is_archived && "opacity-50",
                  doc.is_template && !isVariant && "border-l-2 border-l-purple-400",
                  !selected && !isPreviewing && !isVariant && "hover:bg-[#faf5ef] dark:hover:bg-[#1f1a14]",
                )}
              >
                {/* Checkbox */}
                <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(doc.id)}
                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 accent-[#a0704b]"
                  />
                </td>

                {/* Title */}
                <td className="py-2 pl-2 pr-2">
                  <div className="flex items-center gap-1.5 min-w-0" style={indent ? { paddingLeft: `${indent * 1.5}rem` } : undefined}>
                    {/* Expand toggle or tree connector */}
                    {hasChildren ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleExpand(doc.id); }}
                        className="shrink-0 p-0.5 rounded hover:bg-[#e8d4b8]/30 dark:hover:bg-[#6b5a4a]/30 transition-colors"
                      >
                        <ChevronRight className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", isExpanded && "rotate-90")} />
                      </button>
                    ) : isVariant ? (
                      <span className="shrink-0 w-5 text-center text-gray-300 dark:text-gray-600 text-xs select-none">└</span>
                    ) : (
                      <span className="shrink-0 w-5" />
                    )}

                    {/* Type icon */}
                    <meta.icon className={cn("w-4 h-4 shrink-0", meta.iconColor)} />

                    {/* Title text */}
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{doc.title}</span>

                    {/* Badges */}
                    {doc.is_template && (
                      <Stamp className="w-3 h-3 shrink-0 text-purple-500" />
                    )}
                    {doc.locked_by && (
                      <Lock className="w-3 h-3 shrink-0 text-amber-500" />
                    )}
                  </div>
                  {/* Mobile-only: meta row */}
                  <div className="sm:hidden flex items-center gap-1.5 mt-0.5 pl-6 text-[10px] text-gray-400 dark:text-gray-500">
                    <span className={cn("px-1 py-0.5 rounded text-[9px] font-semibold", meta.color)}>{meta.abbr}</span>
                    <span>{doc.created_by_name}</span>
                    {doc.updated_at && <span>· {formatTimeAgo(doc.updated_at)}</span>}
                  </div>
                </td>

                {/* Type badge */}
                <td className="py-2 text-center hidden sm:table-cell">
                  <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", meta.color)}>
                    {meta.abbr}
                  </span>
                </td>

                {/* Tags */}
                <td className="py-2 hidden md:table-cell">
                  <div className="flex items-center gap-1 flex-wrap">
                    {(doc.tags || []).slice(0, 2).map((tag) => (
                      <span key={tag} className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-medium", getTagColor(tag))}>
                        {tag}
                      </span>
                    ))}
                    {(doc.tags || []).length > 2 && (
                      <span className="text-[9px] text-gray-400">+{doc.tags!.length - 2}</span>
                    )}
                  </div>
                </td>

                {/* Info: questions + variants */}
                <td className="py-2 text-center hidden lg:table-cell">
                  <div className="flex items-center justify-center gap-1.5">
                    {questionCount > 0 && (
                      <span className="text-[10px] text-gray-500 dark:text-gray-400" title={`${questionCount} questions`}>
                        {questionCount}Q
                      </span>
                    )}
                    {hasChildren && (
                      <span className="flex items-center gap-0.5 text-[10px] text-gray-500 dark:text-gray-400" title="Has variants">
                        <GitBranch className="w-3 h-3" />
                      </span>
                    )}
                    {isVariant && doc.parent_id && (
                      <span className="text-[10px] text-gray-400" title="Variant">
                        <GitBranch className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </td>

                {/* Modified */}
                <td className="py-2 hidden sm:table-cell">
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    {doc.updated_at && formatTimeAgo(doc.updated_at)}
                  </div>
                  {doc.updated_by_name && doc.updated_by !== doc.created_by && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[8rem]">
                      {doc.updated_by_name}
                    </div>
                  )}
                </td>

                {/* Actions */}
                <td className="py-2 pr-1" onClick={(e) => e.stopPropagation()}>
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
      {/* Folder indicator below table for unfiled context */}
      {!activeFolderId && rows.some(r => r.doc.folder_name) && (
        <div className="py-1 px-2 text-[9px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
          <FolderOpen className="w-2.5 h-2.5" />
          Folder names shown in context menu &quot;Move to&quot;
        </div>
      )}
    </div>
  );
}
