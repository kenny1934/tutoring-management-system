"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useClickOutside } from "@/lib/hooks";
import {
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  Tag,
  FileText,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTagColor } from "@/lib/tag-colors";
import type { DocumentFolder } from "@/types";

/* ── Types ─────────────────────────────────────────────── */

interface FolderTreeNode extends DocumentFolder {
  children: FolderTreeNode[];
}

interface FolderSidebarProps {
  folders: DocumentFolder[];
  allTags: string[];
  activeFolderId: number | null;
  activeTag: string | null;
  onSelectFolder: (id: number | null) => void;
  onSelectTag: (tag: string | null) => void;
  onCreateFolder: (name: string, parentId?: number | null) => void;
  onRenameFolder: (folder: DocumentFolder, newName: string) => void;
  onDeleteFolder: (folder: DocumentFolder) => void;
  totalDocCount?: number;
  /** When true, always show (skip hidden md:flex). Used inside mobile drawer. */
  mobile?: boolean;
}

/* ── Build tree from flat list ─────────────────────────── */

function buildFolderTree(folders: DocumentFolder[]): FolderTreeNode[] {
  const map = new Map<number, FolderTreeNode>();
  const roots: FolderTreeNode[] = [];

  // Create nodes
  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }

  // Build tree
  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parent_id && map.has(f.parent_id)) {
      map.get(f.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children alphabetically
  const sortChildren = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortChildren(n.children));
  };
  sortChildren(roots);

  return roots;
}

/* ── Folder Tree Item ──────────────────────────────────── */

function FolderTreeItem({
  node,
  depth,
  activeFolderId,
  onSelect,
  onCreateSubfolder,
  onRename,
  onDelete,
}: {
  node: FolderTreeNode;
  depth: number;
  activeFolderId: number | null;
  onSelect: (id: number | null) => void;
  onCreateSubfolder: (parentId: number) => void;
  onRename: (folder: DocumentFolder) => void;
  onDelete: (folder: DocumentFolder) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isActive = activeFolderId === node.id;
  const hasChildren = node.children.length > 0;

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useClickOutside(menuRef, closeMenu, menuOpen);

  return (
    <div>
      <div
        className={cn(
          "group/folder flex items-center gap-1 px-2 py-1.5 md:py-1 rounded-lg cursor-pointer transition-colors text-sm",
          isActive
            ? "bg-[#f5ede3] dark:bg-[#2d2618] text-[#a0704b] dark:text-[#cd853f] font-medium"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5"
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(isActive ? null : node.id)}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setExpanded(!expanded);
          }}
          className={cn(
            "p-0.5 rounded shrink-0 transition-colors",
            hasChildren ? "hover:bg-gray-200 dark:hover:bg-white/10" : "invisible"
          )}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>

        <FolderOpen className={cn("w-4 h-4 shrink-0", isActive ? "text-[#a0704b] dark:text-[#cd853f]" : "text-gray-500 dark:text-gray-400")} />
        <span className="flex-1 truncate">{node.name}</span>
        <span className="text-[10px] opacity-50 shrink-0 tabular-nums">{node.document_count}</span>

        {/* Hover menu trigger */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!menuOpen) {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const menuHeight = 110; // approximate: 3 items × ~36px
                const spaceBelow = window.innerHeight - rect.bottom - 8;
                const top = spaceBelow >= menuHeight ? rect.bottom + 4 : rect.top - menuHeight - 4;
                setMenuPos({ top, left: rect.right });
              }
              setMenuOpen(!menuOpen);
            }}
            className="p-0.5 rounded opacity-100 md:opacity-0 md:group-hover/folder:opacity-100 hover:bg-gray-200 dark:hover:bg-white/10 transition-opacity"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && menuPos && (
            <div
              className="fixed z-50 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg py-1 min-w-[9rem] max-w-[calc(100vw-2rem)]"
              style={{ top: menuPos.top, left: menuPos.left, transform: "translateX(-100%)" }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onCreateSubfolder(node.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                New Subfolder
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onRename(node);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
              >
                <Pencil className="w-3.5 h-3.5" />
                Rename
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(node);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFolderId={activeFolderId}
              onSelect={onSelect}
              onCreateSubfolder={onCreateSubfolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Inline Create Folder ──────────────────────────────── */

function InlineCreateFolder({ parentId, onCreate, onCancel }: {
  parentId: number | null;
  onCreate: (name: string, parentId: number | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const trimmed = name.trim();
    if (trimmed) {
      onCreate(trimmed, parentId);
    }
    onCancel();
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <FolderPlus className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0 ml-1" />
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={submit}
        placeholder="Folder name..."
        className="flex-1 min-w-0 text-sm bg-transparent outline-none border-none text-gray-900 dark:text-white placeholder-gray-400"
      />
    </div>
  );
}

/* ── Main FolderSidebar ────────────────────────────────── */

export default function FolderSidebar({
  folders,
  allTags,
  activeFolderId,
  activeTag,
  onSelectFolder,
  onSelectTag,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  totalDocCount,
  mobile,
}: FolderSidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("doc-sidebar-collapsed") === "true";
    }
    return false;
  });
  const [creating, setCreating] = useState<{ parentId: number | null } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<DocumentFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("doc-sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  const handleCreateSubfolder = useCallback((parentId: number) => {
    setCreating({ parentId });
  }, []);

  const handleStartRename = useCallback((folder: DocumentFolder) => {
    setRenamingFolder(folder);
    setRenameValue(folder.name);
    setTimeout(() => renameRef.current?.focus(), 50);
  }, []);

  const handleSubmitRename = useCallback(() => {
    if (renamingFolder && renameValue.trim() && renameValue.trim() !== renamingFolder.name) {
      onRenameFolder(renamingFolder, renameValue.trim());
    }
    setRenamingFolder(null);
    setRenameValue("");
  }, [renamingFolder, renameValue, onRenameFolder]);

  /* Single container — width animates on collapse/expand */
  const isCollapsed = collapsed && !mobile;

  return (
    <div
      className={cn(
        mobile
          ? "flex w-full"
          : cn(
              "hidden md:flex border-r border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 transition-[width] duration-200 ease-out",
              !isCollapsed && "w-56 lg:w-60"
            ),
        "flex-col shrink-0 bg-white/95 dark:bg-[#1a1a1a]/60 overflow-hidden",
        !isCollapsed && !mobile && "overflow-y-auto"
      )}
      style={!mobile && isCollapsed ? { width: 40 } : undefined}
    >
      {/* Collapsed icon strip */}
      {isCollapsed && (
        <div className="flex flex-col items-center py-3 w-10">
          <button
            onClick={toggleCollapse}
            className="p-1.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors mb-3"
            title="Expand sidebar"
          >
            <PanelLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
          <button
            onClick={() => onSelectFolder(null)}
            className={cn(
              "p-1.5 rounded transition-colors",
              activeFolderId === null && !activeTag
                ? "bg-[#f5ede3] dark:bg-[#2d2618] text-[#a0704b]"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
            )}
            title="All Documents"
          >
            <FileText className="w-4 h-4" />
          </button>
          {tree.length > 0 && (
            <div className="w-5 border-t border-gray-200 dark:border-gray-700 my-2" />
          )}
          {tree.slice(0, 6).map((node) => (
            <button
              key={node.id}
              onClick={() => onSelectFolder(activeFolderId === node.id ? null : node.id)}
              className={cn(
                "p-1.5 rounded transition-colors",
                activeFolderId === node.id
                  ? "bg-[#f5ede3] dark:bg-[#2d2618] text-[#a0704b]"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
              )}
              title={node.name}
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          ))}
        </div>
      )}

      {/* Expanded content */}
      {!isCollapsed && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Folders
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCreating({ parentId: null })}
                className="p-1 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
                title="New folder"
              >
                <Plus className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
              </button>
              {!mobile && (
                <button
                  onClick={toggleCollapse}
                  className="p-1 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                </button>
              )}
            </div>
          </div>

          {/* All Documents */}
          <div className="px-1 mb-1">
            <button
              onClick={() => onSelectFolder(null)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-2 md:py-1.5 rounded-lg text-sm transition-colors",
                activeFolderId === null
                  ? "bg-[#f5ede3] dark:bg-[#2d2618] text-[#a0704b] dark:text-[#cd853f] font-medium"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5"
              )}
            >
              <FileText className={cn("w-4 h-4", activeFolderId === null ? "text-[#a0704b] dark:text-[#cd853f]" : "text-gray-500 dark:text-gray-400")} />
              <span className="flex-1 text-left">All Documents</span>
              {totalDocCount !== undefined && (
                <span className="text-[10px] opacity-50 tabular-nums">{totalDocCount}</span>
              )}
            </button>
          </div>

          {/* Folder tree */}
          <div className="px-1 flex-1">
            {tree.map((node) => (
              <FolderTreeItem
                key={node.id}
                node={node}
                depth={0}
                activeFolderId={activeFolderId}
                onSelect={onSelectFolder}
                onCreateSubfolder={handleCreateSubfolder}
                onRename={handleStartRename}
                onDelete={onDeleteFolder}
              />
            ))}

            {/* Inline create */}
            {creating && (
              <InlineCreateFolder
                parentId={creating.parentId}
                onCreate={onCreateFolder}
                onCancel={() => setCreating(null)}
              />
            )}

            {/* Empty state */}
            {tree.length === 0 && !creating && (
              <button
                onClick={() => setCreating({ parentId: null })}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors border border-dashed border-gray-300 dark:border-gray-600 mt-1"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Create a folder
              </button>
            )}
          </div>

          {/* Tags section */}
          {allTags.length > 0 && (
            <div className="border-t border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 px-3 pt-2 pb-3 mt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5 block">
                Tags
              </span>
              <div className="flex flex-wrap gap-1">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onSelectTag(activeTag === tag ? null : tag)}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 md:py-0.5 rounded-full text-xs font-medium transition-colors",
                      activeTag === tag
                        ? "ring-2 ring-[#a0704b]/50 ring-offset-1 dark:ring-offset-[#1a1a1a]"
                        : "hover:opacity-80",
                      getTagColor(tag)
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Rename modal (inline overlay) */}
      {renamingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRenamingFolder(null)}>
          <div
            className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl p-5"
            style={{ width: "20rem", maxWidth: "calc(100vw - 2rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Rename Folder</h3>
            <input
              ref={renameRef}
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmitRename();
                if (e.key === "Escape") setRenamingFolder(null);
              }}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-[#1a1a1a] text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/40 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRenamingFolder(null)}
                className="flex-1 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors rounded-lg border border-border"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRename}
                disabled={!renameValue.trim()}
                className="flex-1 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
