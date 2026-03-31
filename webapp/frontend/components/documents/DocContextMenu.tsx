"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { MoreVertical, Copy, Tag, Stamp, Trash2, ArchiveRestore, FolderInput, FolderOpen, ChevronDown, ExternalLink, Download } from "lucide-react";
import FloatingDropdown from "@/components/inbox/FloatingDropdown";
import { cn } from "@/lib/utils";
import { flattenFolderTree } from "@/lib/folder-utils";
import type { Document, DocumentFolder } from "@/types";

function FolderSubmenu({ doc, folders, onMoveToFolder }: {
  doc: Document;
  folders: DocumentFolder[];
  onMoveToFolder: (folderId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const tree = useMemo(() => open ? flattenFolderTree(folders) : [], [open, folders]);
  return (
    <div>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
      >
        <FolderInput className="w-3.5 h-3.5" />
        Move to
        <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="py-0.5 border-t border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30">
          <button
            onClick={(e) => { e.stopPropagation(); onMoveToFolder(null); }}
            className={cn(
              "w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]",
              !doc.folder_id && "font-semibold"
            )}
          >
            <FolderOpen className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            No folder
          </button>
          {tree.map(({ folder: f, depth }) => (
            <button
              key={f.id}
              onClick={(e) => { e.stopPropagation(); onMoveToFolder(f.id); }}
              className={cn(
                "w-full flex items-center gap-2 pr-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]",
                doc.folder_id === f.id && "font-semibold"
              )}
              style={{ paddingLeft: `${32 + depth * 16}px` }}
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#a0704b]" />
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface DocContextMenuProps {
  doc: Document;
  menuOpenId: number | null;
  setMenuOpenId: (id: number | null) => void;
  onDuplicate: (id: number) => void;
  onArchive: (id: number) => void;
  onUnarchive: (id: number) => void;
  onPermanentDelete: (id: number) => void;
  onSaveAsTemplate?: (id: number) => void;
  folders: DocumentFolder[];
  onMoveToFolder: (folderId: number | null) => void;
  onEditTags: () => void;
}

const menuItemCls = "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] [&>svg]:text-gray-400 [&>svg]:dark:text-gray-500 [&>svg]:shrink-0";
const menuDangerCls = "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20";

export default function DocContextMenu({ doc, menuOpenId, setMenuOpenId, onDuplicate, onArchive, onUnarchive, onPermanentDelete, onSaveAsTemplate, folders, onMoveToFolder, onEditTags }: DocContextMenuProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const isOpen = menuOpenId === doc.id;
  const isVisible = isOpen && btnRef.current?.offsetParent !== null;
  const close = useCallback(() => setMenuOpenId(null), [setMenuOpenId]);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setMenuOpenId(isOpen ? null : doc.id); }}
        className="p-1 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] sm:opacity-0 sm:group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity"
      >
        <MoreVertical className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </button>
      <FloatingDropdown
        triggerRef={btnRef}
        isOpen={isVisible}
        onClose={close}
        className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg py-1 min-w-[10rem] whitespace-nowrap overflow-hidden animate-menu-stagger"
      >
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(doc.id); }}
          className={menuItemCls}
        >
          <Copy className="w-3.5 h-3.5" />
          Duplicate
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEditTags(); }}
          className={menuItemCls}
        >
          <Tag className="w-3.5 h-3.5" />
          Edit Tags
        </button>
        {onSaveAsTemplate && (
          <button
            onClick={(e) => { e.stopPropagation(); onSaveAsTemplate(doc.id); }}
            className={menuItemCls}
          >
            <Stamp className="w-3.5 h-3.5" />
            Save as Template
          </button>
        )}
        {folders.length > 0 && (
          <FolderSubmenu doc={doc} folders={folders} onMoveToFolder={onMoveToFolder} />
        )}
        <div className="my-1 border-t border-[#e8d4b8]/60 dark:border-[#6b5a4a]/40" />
        <button
          onClick={(e) => { e.stopPropagation(); window.open(`/documents/${doc.id}`, "_blank"); close(); }}
          className={menuItemCls}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in New Tab
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); window.open(`/documents/${doc.id}?print=student`, "_blank"); close(); }}
          className={menuItemCls}
        >
          <Download className="w-3.5 h-3.5" />
          Export PDF
        </button>
        <div className="my-1 border-t border-[#e8d4b8]/60 dark:border-[#6b5a4a]/40" />
        {doc.is_archived ? (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onUnarchive(doc.id); }}
              className={cn(menuItemCls, "text-[#a0704b] dark:text-[#cd853f]")}
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
              Restore
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onPermanentDelete(doc.id); }}
              className={menuDangerCls}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Permanently
            </button>
          </>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(doc.id); }}
            className={menuItemCls}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Move to Trash
          </button>
        )}
      </FloatingDropdown>
    </div>
  );
}
