"use client";

import { useRef, useState } from "react";
import { useClickOutside } from "@/lib/hooks";
import { Search, X, ChevronDown, Archive, LayoutGrid, Table2, PanelRight, Plus, ScanLine, FolderOpen, Tag, Trash2, FolderInput } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTagColor } from "@/lib/tag-colors";
import type { DocType, DocumentFolder } from "@/types";

const SORT_OPTIONS = [
  { label: "Last modified", sort_by: "updated_at", sort_order: "desc" },
  { label: "Newest first", sort_by: "created_at", sort_order: "desc" },
  { label: "Oldest first", sort_by: "created_at", sort_order: "asc" },
  { label: "Title A\u2013Z", sort_by: "title", sort_order: "asc" },
  { label: "Title Z\u2013A", sort_by: "title", sort_order: "desc" },
] as const;

export { SORT_OPTIONS };

type Tab = "all" | "mine" | "recent" | "templates";

export interface DocumentsToolbarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filterType: DocType | "all";
  onFilterTypeChange: (type: DocType | "all") => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  sortIdx: number;
  onSortChange: (idx: number) => void;
  viewMode: "table" | "grid";
  onViewModeChange: (mode: "table" | "grid") => void;
  previewEnabled: boolean;
  onTogglePreview: () => void;
  activeTag: string | null;
  onClearTag: () => void;
  activeFolderId: number | null;
  activeFolder: DocumentFolder | undefined;
  onClearFolder: () => void;
  onOpenMobileDrawer: () => void;
  onCreateDocument: () => void;
  onImportWorksheet: () => void;
  onCreateTemplate: () => void;
  isReadOnly: boolean;
  // Bulk selection
  selectedCount: number;
  onClearSelection: () => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onBulkMoveToFolder: () => void;
  onBulkAddTag: () => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All Docs" },
  { id: "mine", label: "My Docs" },
  { id: "recent", label: "Recent" },
  { id: "templates", label: "Templates" },
];

const TYPE_FILTERS: { value: DocType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "worksheet", label: "WS" },
  { value: "lesson_plan", label: "LP" },
];

export default function DocumentsToolbar(props: DocumentsToolbarProps) {
  const {
    activeTab, onTabChange, search, onSearchChange, filterType, onFilterTypeChange,
    showArchived, onToggleArchived, sortIdx, onSortChange,
    viewMode, onViewModeChange, previewEnabled, onTogglePreview,
    activeTag, onClearTag, activeFolderId, activeFolder, onClearFolder,
    onOpenMobileDrawer, onCreateDocument, onImportWorksheet, onCreateTemplate,
    isReadOnly, selectedCount, onClearSelection,
    onBulkArchive, onBulkDelete, onBulkMoveToFolder, onBulkAddTag,
  } = props;

  const isTemplatesTab = activeTab === "templates";
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  useClickOutside(sortRef, () => setShowSortMenu(false), showSortMenu);

  return (
    <div className="border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] shrink-0">
      {/* Row 1: Tabs + Create */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-0">
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors relative",
                activeTab === tab.id
                  ? "text-[#a0704b] dark:text-[#cd853f] bg-[#fef9f3] dark:bg-[#2d2618]"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#a0704b] dark:bg-[#cd853f] rounded-t" />
              )}
            </button>
          ))}
        </div>
        {!isReadOnly && (
          <div className="flex items-center gap-1.5 shrink-0">
            {isTemplatesTab ? (
              <button
                onClick={onCreateTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Template</span>
              </button>
            ) : (
              <>
                <button
                  onClick={onImportWorksheet}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Import</span>
                </button>
                <button
                  onClick={onCreateDocument}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#a0704b] text-white hover:bg-[#8b5e3c] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Row 2: Search + Filters */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        {/* Mobile: Folder drawer trigger */}
        {!isTemplatesTab && (
          <button
            onClick={onOpenMobileDrawer}
            className="lg:hidden p-1.5 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] text-gray-500 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        )}

        {/* Search */}
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder={isTemplatesTab ? "Search templates..." : "Search..."}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#a0704b]/40"
          />
          {search && (
            <button onClick={() => onSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>

        {/* Type filter */}
        {!isTemplatesTab && (
          <div className="hidden sm:flex items-center rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => onFilterTypeChange(f.value)}
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium transition-colors",
                  filterType === f.value
                    ? "bg-[#a0704b] text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Archive toggle */}
        <button
          onClick={onToggleArchived}
          className={cn(
            "hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors border",
            showArchived
              ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
          )}
        >
          <Archive className="w-3.5 h-3.5" />
        </button>

        {/* Sort */}
        <div ref={sortRef} className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
          >
            <span className="hidden sm:inline">{SORT_OPTIONS[sortIdx].label}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showSortMenu && (
            <div className="absolute top-full right-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg py-1 min-w-[10rem]">
              {SORT_OPTIONS.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => { onSortChange(i); setShowSortMenu(false); }}
                  className={cn(
                    "w-full px-3 py-1.5 text-xs text-left hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]",
                    sortIdx === i ? "text-[#a0704b] dark:text-[#cd853f] font-medium" : "text-gray-700 dark:text-gray-300"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden">
          <button
            onClick={() => onViewModeChange("table")}
            className={cn("p-1.5 transition-colors", viewMode === "table" ? "bg-[#a0704b] text-white" : "text-gray-500 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]")}
            title="Table view"
          >
            <Table2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange("grid")}
            className={cn("p-1.5 transition-colors", viewMode === "grid" ? "bg-[#a0704b] text-white" : "text-gray-500 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]")}
            title="Grid view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Preview toggle (desktop) */}
        <button
          onClick={() => onTogglePreview()}
          className={cn(
            "hidden lg:flex p-1.5 rounded-lg transition-colors border",
            previewEnabled
              ? "bg-[#f5ede3] dark:bg-[#2d2618] text-[#a0704b] dark:text-[#cd853f] border-[#e8d4b8] dark:border-[#6b5a4a]"
              : "border-transparent text-gray-500 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
          )}
          title="Preview pane"
        >
          <PanelRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Row 3: Active filters */}
      {(activeTag || activeFolderId) && !isTemplatesTab && (
        <div className="flex items-center gap-1.5 px-3 pb-1.5">
          {activeFolder && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#f5ede3] dark:bg-[#2d2618] text-gray-700 dark:text-gray-300 border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
              <FolderOpen className="w-2.5 h-2.5" />
              {activeFolder.name}
              <button onClick={onClearFolder} className="ml-0.5 hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {activeTag && (
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium", getTagColor(activeTag))}>
              {activeTag}
              <button onClick={onClearTag} className="ml-0.5 hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#a0704b]/10 dark:bg-[#a0704b]/20 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          <span className="text-xs font-medium text-[#a0704b] dark:text-[#cd853f]">{selectedCount} selected</span>
          <button disabled title="Coming soon" className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50">
            <FolderInput className="w-3 h-3" /> Move
          </button>
          <button disabled title="Coming soon" className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50">
            <Tag className="w-3 h-3" /> Tag
          </button>
          <button onClick={onBulkArchive} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]">
            <Archive className="w-3 h-3" /> Archive
          </button>
          <button onClick={onBulkDelete} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
          <div className="flex-1" />
          <button onClick={onClearSelection} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
