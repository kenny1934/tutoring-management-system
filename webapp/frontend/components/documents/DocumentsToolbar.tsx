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
    onBulkArchive, onBulkDelete,
  } = props;

  const isTemplatesTab = activeTab === "templates";
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  useClickOutside(sortRef, () => setShowSortMenu(false), showSortMenu);

  return (
    <div className="shrink-0">
      {/* Row 1: Tabs + create actions */}
      <div className="flex items-center px-4 py-1.5 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
        {/* Mobile: Folder drawer trigger */}
        {!isTemplatesTab && (
          <button
            onClick={onOpenMobileDrawer}
            className="lg:hidden p-1.5 mr-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "px-2.5 py-1 text-[13px] font-medium rounded-md transition-colors",
                activeTab === tab.id
                  ? "text-[#a0704b] dark:text-[#cd853f] bg-[#a0704b]/10 dark:bg-[#cd853f]/10 border-b-2 border-[#a0704b] dark:border-[#cd853f] rounded-b-none"
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
              <button
                onClick={onCreateTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Template</span>
              </button>
            ) : (
              <>
                <button
                  onClick={onImportWorksheet}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  Import
                </button>
                <button
                  onClick={onCreateDocument}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md bg-[#a0704b] text-white hover:bg-[#8b5e3c] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Row 2: Search + filters + view controls */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 bg-[#fef9f3]/60 dark:bg-[#1a1a1a]/20">
        <div className="relative flex-1 min-w-0 max-w-[14rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-7 py-1 rounded-md border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#fef9f3] dark:bg-[#1a1a1a]/50 text-[13px] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#a0704b]/40 focus:border-[#a0704b]/40 transition-colors"
          />
          {search && (
            <button onClick={() => onSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
              <X className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>

        {/* Type filter */}
        {!isTemplatesTab && (
          <div className="flex items-center gap-px rounded-md bg-[#f5ede3]/80 dark:bg-[#2d2618]/60 p-0.5">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => onFilterTypeChange(f.value)}
                className={cn(
                  "px-2 py-0.5 text-[11px] font-medium rounded transition-all",
                  filterType === f.value
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Sort */}
        <div ref={sortRef} className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors focus-warm"
            title="Sort"
          >
            <span className="hidden sm:inline">{SORT_OPTIONS[sortIdx].label}</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform", showSortMenu && "rotate-180")} />
          </button>
          {showSortMenu && (
            <div className="absolute top-full right-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[10rem] animate-scale-in">
              {SORT_OPTIONS.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => { onSortChange(i); setShowSortMenu(false); }}
                  className={cn(
                    "w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors",
                    sortIdx === i ? "text-[#a0704b] dark:text-[#cd853f] font-medium" : "text-gray-600 dark:text-gray-400"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Archive toggle */}
        <button
          onClick={onToggleArchived}
          className={cn(
            "hidden sm:flex items-center p-1.5 rounded-md transition-colors focus-warm",
            showArchived
              ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
              : "text-gray-400 dark:text-gray-500 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          )}
          title={showArchived ? "Hide archived" : "Show archived"}
        >
          <Archive className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 hidden sm:block" />

        {/* View toggle */}
        <div className="flex items-center gap-px rounded-md bg-[#f5ede3]/80 dark:bg-[#2d2618]/60 p-0.5">
          <button
            onClick={() => onViewModeChange("table")}
            className={cn("p-1 rounded transition-all", viewMode === "table" ? "bg-white dark:bg-[#1a1a1a] shadow-sm text-[#a0704b] dark:text-[#cd853f]" : "text-gray-400 hover:text-gray-600")}
            title="Table view"
          >
            <Table2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange("grid")}
            className={cn("p-1 rounded transition-all", viewMode === "grid" ? "bg-white dark:bg-[#1a1a1a] shadow-sm text-[#a0704b] dark:text-[#cd853f]" : "text-gray-400 hover:text-gray-600")}
            title="Grid view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Preview toggle (desktop) */}
        <button
          onClick={() => onTogglePreview()}
          className={cn(
            "hidden lg:flex p-1.5 rounded-md transition-colors focus-warm",
            previewEnabled
              ? "bg-[#a0704b]/10 text-[#a0704b] dark:text-[#cd853f]"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          )}
          title="Preview pane"
        >
          <PanelRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Row 3 (conditional): Active filters or bulk actions */}
      {(activeTag || activeFolderId || selectedCount > 0) && !isTemplatesTab && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 bg-[#fef9f3]/80 dark:bg-[#2d2618]/30 animate-slide-down">
          {selectedCount > 0 ? (
            <>
              <span className="text-[12px] font-medium text-[#a0704b] dark:text-[#cd853f]">{selectedCount} selected</span>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
              <button onClick={onBulkMoveToFolder} className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors">
                <FolderInput className="w-3 h-3" /> Move
              </button>
              <button onClick={onBulkAddTag} className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors">
                <Tag className="w-3 h-3" /> Tag
              </button>
              <button onClick={onBulkArchive} className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors">
                <Archive className="w-3 h-3" /> Archive
              </button>
              <button onClick={onBulkDelete} className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
              <div className="flex-1" />
              <button onClick={onClearSelection} className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Clear
              </button>
            </>
          ) : (
            <>
              {activeFolder && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                  <FolderOpen className="w-3 h-3 text-gray-400" />
                  {activeFolder.name}
                  <button onClick={onClearFolder} className="ml-0.5 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
                </span>
              )}
              {activeTag && (
                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium", getTagColor(activeTag))}>
                  {activeTag}
                  <button onClick={onClearTag} className="ml-0.5 hover:text-red-500"><X className="w-3 h-3" /></button>
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
