"use client";

import { useState, useRef, useCallback } from "react";
import { MoreVertical, Copy, Tag, Stamp, Trash2, Archive, ArchiveRestore, FolderInput, FolderOpen, ChevronDown } from "lucide-react";
import FloatingDropdown from "@/components/inbox/FloatingDropdown";
import { cn } from "@/lib/utils";
import type { Document, DocumentFolder } from "@/types";

/* Folder submenu inside context menu */
function FolderSubmenu({ doc, folders, onMoveToFolder }: {
  doc: Document;
  folders: DocumentFolder[];
  onMoveToFolder: (folderId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
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
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={(e) => { e.stopPropagation(); onMoveToFolder(f.id); }}
              className={cn(
                "w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]",
                doc.folder_id === f.id && "font-semibold"
              )}
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
        className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg py-1 min-w-[10rem] whitespace-nowrap overflow-hidden"
      >
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(doc.id); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
        >
          <Copy className="w-3.5 h-3.5" />
          Duplicate
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEditTags(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
        >
          <Tag className="w-3.5 h-3.5" />
          Edit Tags
        </button>
        {onSaveAsTemplate && (
          <button
            onClick={(e) => { e.stopPropagation(); onSaveAsTemplate(doc.id); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
          >
            <Stamp className="w-3.5 h-3.5" />
            Save as Template
          </button>
        )}
        {folders.length > 0 && (
          <FolderSubmenu doc={doc} folders={folders} onMoveToFolder={onMoveToFolder} />
        )}
        {doc.is_archived ? (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onUnarchive(doc.id); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[#a0704b] dark:text-[#cd853f] hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
              Restore
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onPermanentDelete(doc.id); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Permanently
            </button>
          </>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(doc.id); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
          >
            <Archive className="w-3.5 h-3.5" />
            Archive
          </button>
        )}
      </FloatingDropdown>
    </div>
  );
}
