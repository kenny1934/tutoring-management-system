"use client";

import { useRef, useState } from "react";
import { useClickOutside } from "@/lib/hooks";
import { Search, X, ChevronDown, ArchiveRestore, LayoutGrid, Table2, PanelRight, Plus, ScanLine, FolderOpen, Tag, Trash2, FolderInput } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTagColor } from "@/lib/tag-colors";
import type { DocumentFolder } from "@/types";
import { Button, IconButton, Input, Segmented } from "@/components/controls";

const SORT_OPTIONS = [
  { label: "Last modified", sort_by: "updated_at", sort_order: "desc" },
  { label: "Newest first", sort_by: "created_at", sort_order: "desc" },
  { label: "Oldest first", sort_by: "created_at", sort_order: "asc" },
  { label: "Title A\u2013Z", sort_by: "title", sort_order: "asc" },
  { label: "Title Z\u2013A", sort_by: "title", sort_order: "desc" },
] as const;

export { SORT_OPTIONS };

type Tab = "all" | "mine" | "recent" | "templates" | "trash";

export interface DocumentsToolbarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sortIdx: number;
  onSortChange: (idx: number) => void;
  viewMode: "table" | "grid";
  onViewModeChange: (mode: "table" | "grid") => void;
  previewEnabled: boolean;
  onTogglePreview: () => void;
  activeTags: string[];
  onClearTag: (tag?: string) => void;
  activeFolderId: number | null;
  folderPath?: DocumentFolder[];
  onClearFolder: (folderId?: number) => void;
  onOpenMobileDrawer: () => void;
  onCreateDocument: () => void;
  onImportWorksheet: () => void;
  onCreateTemplate: () => void;
  isReadOnly: boolean;
  selectedCount: number;
  onClearSelection: () => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onBulkMoveToFolder: () => void;
  onBulkAddTag: () => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "recent", label: "Recent" },
  { id: "templates", label: "Templates" },
];


export default function DocumentsToolbar(props: DocumentsToolbarProps) {
  const {
    activeTab, onTabChange, search, onSearchChange,
    sortIdx, onSortChange,
    viewMode, onViewModeChange, previewEnabled, onTogglePreview,
    activeTags, onClearTag, activeFolderId, folderPath, onClearFolder,
    onOpenMobileDrawer, onCreateDocument, onImportWorksheet, onCreateTemplate,
    isReadOnly, selectedCount, onClearSelection,
    onBulkArchive, onBulkDelete, onBulkMoveToFolder, onBulkAddTag,
  } = props;

  const isTemplatesTab = activeTab === "templates";
  const isTrashTab = activeTab === "trash";
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  useClickOutside(sortRef, () => setShowSortMenu(false), showSortMenu);

  return (
    <div className="shrink-0">
      {/* Row 1: Tabs + create actions */}
      <div className="flex items-center px-4 py-1.5 border-b border-line/40">
        {/* Mobile: Folder drawer trigger */}
        {!isTemplatesTab && !isTrashTab && (
          <IconButton
            icon={FolderOpen}
            size="sm"
            label="Folders"
            onClick={onOpenMobileDrawer}
            className="lg:hidden mr-1"
          />
        )}

        <div className="flex items-center gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "px-2.5 py-1 text-[13px] font-medium rounded-md transition-colors",
                activeTab === tab.id && !isTrashTab
                  ? "text-accent-ink bg-primary/10 dark:bg-[#cd853f]/10 border-b-2 border-primary dark:border-[#cd853f] rounded-b-none"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b-2 border-transparent"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {!isReadOnly && (
          <div className="flex items-center gap-1.5">
            {isTemplatesTab ? (
              <Button variant="primary" size="sm" icon={Plus} onClick={onCreateTemplate} aria-label="New template">
                <span className="hidden sm:inline">Template</span>
              </Button>
            ) : (
              <>
                <Button variant="quiet" size="sm" icon={ScanLine} onClick={onImportWorksheet} aria-label="Import worksheet">
                  <span className="hidden sm:inline">Import</span>
                </Button>
                <Button variant="primary" size="sm" icon={Plus} onClick={onCreateDocument} aria-label="New document">
                  <span className="hidden sm:inline">New</span>
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Row 2: Search + filters + view controls */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-line/40 bg-[#fef9f3]/60 dark:bg-[#1a1a1a]/20">
        <div className="relative flex-1 min-w-0 sm:max-w-[14rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
          <Input
            size="sm"
            type="text"
            placeholder="Search by title or tag..."
            aria-label="Search documents"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 pr-7"
          />
          {search && (
            <button onClick={() => onSearchChange("")} aria-label="Clear search" className="absolute right-2 top-1/2 z-10 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
              <X className="w-3 h-3 text-gray-500" />
            </button>
          )}
        </div>

        {/* Sort */}
        <div ref={sortRef} className="relative">
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setShowSortMenu(!showSortMenu)}
            title="Sort" aria-label="Sort documents"
            aria-expanded={showSortMenu}
          >
            <span className="hidden sm:inline">{SORT_OPTIONS[sortIdx].label}</span>
            <ChevronDown className={cn("w-3.5 h-3.5 text-ink-subtle transition-transform", showSortMenu && "rotate-180")} aria-hidden="true" />
          </Button>
          {showSortMenu && (
            <div className="absolute top-full right-0 mt-1 z-20 bg-raised border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[10rem] animate-scale-in">
              {SORT_OPTIONS.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => { onSortChange(i); setShowSortMenu(false); }}
                  className={cn(
                    "w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors",
                    sortIdx === i ? "text-accent-ink font-medium" : "text-gray-600 dark:text-gray-400"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View toggle (hidden on small screens — card view is forced) */}
        <Segmented
          label="View"
          className="hidden sm:inline-flex"
          value={viewMode}
          onChange={onViewModeChange}
          options={[
            { value: "table", icon: Table2, title: "Table view", label: <span className="sr-only">Table view</span> },
            { value: "grid", icon: LayoutGrid, title: "Grid view", label: <span className="sr-only">Grid view</span> },
          ]}
        />

        {/* Preview toggle (desktop) */}
        <IconButton
          icon={PanelRight}
          size="sm"
          label="Preview pane"
          aria-pressed={previewEnabled}
          onClick={() => onTogglePreview()}
          className={cn("hidden lg:inline-flex", previewEnabled && "bg-tint text-accent-ink")}
        />
      </div>

      {/* Row 3 (conditional): Active filters or bulk actions */}
      {(activeTags.length > 0 || activeFolderId || selectedCount > 0) && !isTemplatesTab && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-line/40 bg-paper/80 dark:bg-paper/30 animate-slide-down">
          {selectedCount > 0 ? (
            <>
              <span className="text-[12px] font-medium text-accent-ink">{selectedCount} selected</span>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
              {isTrashTab ? (
                <>
                  <Button variant="quiet" size="sm" icon={ArchiveRestore} onClick={onBulkArchive}>
                    Restore
                  </Button>
                  <Button variant="quiet" size="sm" icon={Trash2} iconClassName="text-red-600 dark:text-red-400" onClick={onBulkDelete}>
                    Delete forever
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="quiet" size="sm" icon={FolderInput} onClick={onBulkMoveToFolder}>
                    Move
                  </Button>
                  <Button variant="quiet" size="sm" icon={Tag} onClick={onBulkAddTag}>
                    Tag
                  </Button>
                  <Button variant="quiet" size="sm" icon={Trash2} onClick={onBulkArchive}>
                    Trash
                  </Button>
                </>
              )}
              <div className="flex-1" />
              <Button variant="quiet" size="sm" onClick={onClearSelection}>
                Clear
              </Button>
            </>
          ) : (
            <>
              {folderPath && folderPath.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-line">
                  <FolderOpen className="w-3 h-3 text-accent-ink/60" />
                  {folderPath.map((f, i) => (
                    <span key={f.id} className="inline-flex items-center gap-1">
                      {i > 0 && <span className="text-gray-300 dark:text-gray-400">/</span>}
                      <button onClick={() => onClearFolder(f.id)} className="hover:text-accent-ink transition-colors" title={`Go to ${f.name}`}>
                        {f.name}
                      </button>
                    </span>
                  ))}
                  <button onClick={() => onClearFolder()} aria-label="Clear folder filter" className="ml-0.5 text-gray-500 hover:text-gray-600"><X className="w-3 h-3" /></button>
                </span>
              )}
              {activeTags.map((tag) => (
                <span key={tag} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium", getTagColor(tag))}>
                  {tag}
                  <button onClick={() => onClearTag(tag)} aria-label={`Remove the ${tag} filter`} className="ml-0.5 hover:text-red-600"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
