"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, FileText, BookOpen, Search, MoreVertical, Trash2, ArchiveRestore, Archive, Copy, Lock, ArrowUpDown, ChevronDown, LayoutGrid, List as ListIcon, Tag, FolderOpen, X, ChevronRight, FolderInput, Stamp } from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { formatTimeAgo } from "@/lib/formatters";
import { useToast } from "@/contexts/ToastContext";
import { documentsAPI, foldersAPI } from "@/lib/document-api";
import { cn } from "@/lib/utils";
import { getTagColor } from "@/lib/tag-colors";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import FolderSidebar from "@/components/documents/FolderSidebar";
import type { Document, DocType, DocumentMetadata, DocumentFolder } from "@/types";

const DOC_TYPE_LABELS: Record<DocType, { label: string; icon: typeof FileText; color: string; iconColor: string }> = {
  worksheet: { label: "Worksheet", icon: FileText, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", iconColor: "text-blue-700 dark:text-blue-300" },
  lesson_plan: { label: "Lesson Plan", icon: BookOpen, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", iconColor: "text-green-700 dark:text-green-300" },
};

const PAGE_SIZE = 24;

const SORT_OPTIONS = [
  { label: "Last modified", sort_by: "updated_at", sort_order: "desc" },
  { label: "Newest first", sort_by: "created_at", sort_order: "desc" },
  { label: "Oldest first", sort_by: "created_at", sort_order: "asc" },
  { label: "Title A\u2013Z", sort_by: "title", sort_order: "asc" },
  { label: "Title Z\u2013A", sort_by: "title", sort_order: "desc" },
] as const;

export default function DocumentsPage() {
  usePageTitle("Documents");
  const router = useRouter();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"documents" | "templates">("documents");
  const [filterType, setFilterType] = useState<DocType | "all">("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sortIdx, setSortIdx] = useState(0);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("doc-view-mode") as "grid" | "list") || "grid";
    }
    return "grid";
  });
  const sortRef = useRef<HTMLDivElement>(null);

  // Tag & folder filters
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [tagEditDocId, setTagEditDocId] = useState<number | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: "delete-doc"; id: number } | { type: "delete-folder"; folder: DocumentFolder } | null>(null);

  const sort = SORT_OPTIONS[sortIdx];

  // Fetch tags and folders
  const { data: allTags = [], mutate: mutateTags } = useSWR("document-tags", () => documentsAPI.listTags(), { revalidateOnFocus: false });
  const { data: folders = [], mutate: mutateFolders } = useSWR("document-folders", () => foldersAPI.list(), { revalidateOnFocus: false });

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSortMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSortMenu]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [mobileDrawerOpen]);

  const toggleViewMode = useCallback((mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("doc-view-mode", mode);
  }, []);

  // Paginated fetch: SWR loads first page, "Load more" appends
  const [extraDocs, setExtraDocs] = useState<Document[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreExhausted, setMoreExhausted] = useState(false);

  const isTemplatesTab = activeTab === "templates";

  const { data: firstPage, isLoading, mutate } = useSWR(
    ["documents", filterType, debouncedSearch, showArchived, sort.sort_by, sort.sort_order, activeTag, activeFolderId, activeTab],
    () => documentsAPI.list({
      doc_type: filterType === "all" ? undefined : filterType,
      search: debouncedSearch || undefined,
      include_archived: showArchived || undefined,
      is_template: isTemplatesTab,
      sort_by: sort.sort_by,
      sort_order: sort.sort_order,
      limit: PAGE_SIZE,
      tag: isTemplatesTab ? undefined : (activeTag || undefined),
      folder_id: isTemplatesTab ? undefined : (activeFolderId ?? undefined),
    }),
    { revalidateOnFocus: false }
  );

  // Reset extra pages when filters/sort/tab change
  useEffect(() => {
    setExtraDocs([]);
    setMoreExhausted(false);
  }, [filterType, debouncedSearch, showArchived, sortIdx, activeTag, activeFolderId, activeTab]);

  const documents = firstPage ? [...firstPage, ...extraDocs] : undefined;
  const hasMore = !moreExhausted && !!firstPage && firstPage.length === PAGE_SIZE;

  // Ref to hold current filter params so loadMore doesn't recreate on every state change
  const filtersRef = useRef({ filterType, debouncedSearch, showArchived, sort, activeTag, activeFolderId, firstPage, extraDocs, isTemplatesTab });
  filtersRef.current = { filterType, debouncedSearch, showArchived, sort, activeTag, activeFolderId, firstPage, extraDocs, isTemplatesTab };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const f = filtersRef.current;
    setLoadingMore(true);
    try {
      const next = await documentsAPI.list({
        doc_type: f.filterType === "all" ? undefined : f.filterType,
        search: f.debouncedSearch || undefined,
        include_archived: f.showArchived || undefined,
        is_template: f.isTemplatesTab,
        sort_by: f.sort.sort_by,
        sort_order: f.sort.sort_order,
        limit: PAGE_SIZE,
        offset: (f.firstPage?.length ?? 0) + f.extraDocs.length,
        tag: f.isTemplatesTab ? undefined : (f.activeTag || undefined),
        folder_id: f.isTemplatesTab ? undefined : (f.activeFolderId ?? undefined),
      });
      setExtraDocs((prev) => [...prev, ...next]);
      if (next.length < PAGE_SIZE) setMoreExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  const [createStep, setCreateStep] = useState<{ step: "type" } | { step: "template"; docType: DocType }>({ step: "type" });

  const handleCreate = useCallback(async (docType: DocType, templateDoc?: Document) => {
    try {
      const doc = await documentsAPI.create({
        title: "Untitled Document",
        doc_type: docType,
        ...(templateDoc?.page_layout ? { page_layout: templateDoc.page_layout } : {}),
        ...(templateDoc?.content ? { content: templateDoc.content } : {}),
        ...(activeFolderId ? { folder_id: activeFolderId } : {}),
      });
      setShowCreateModal(false);
      setCreateStep({ step: "type" });
      router.push(`/documents/${doc.id}`);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }, [router, showToast, activeFolderId]);

  const handleCreateTemplate = useCallback(async () => {
    try {
      const doc = await documentsAPI.create({
        title: "Untitled Template",
        doc_type: "worksheet",
        is_template: true,
      });
      router.push(`/documents/${doc.id}`);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }, [router, showToast]);

  const handleSaveAsTemplate = useCallback(async (id: number) => {
    try {
      const source = await documentsAPI.get(id);
      await documentsAPI.create({
        title: `${source.title} (Template)`,
        doc_type: source.doc_type,
        ...(source.page_layout ? { page_layout: source.page_layout } : {}),
        ...(source.content ? { content: source.content } : {}),
        is_template: true,
      });
      showToast("Template created", "success");
      setActiveTab("templates");
      mutate();
    } catch (err) {
      showToast((err as Error).message, "error");
    }
    setMenuOpenId(null);
  }, [showToast, mutate]);

  const handleArchive = useCallback(async (id: number) => {
    try {
      await documentsAPI.delete(id);
      mutate();
      showToast("Document archived", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
    setMenuOpenId(null);
  }, [mutate, showToast]);

  const handleDuplicate = useCallback(async (id: number) => {
    try {
      const copy = await documentsAPI.duplicate(id);
      router.push(`/documents/${copy.id}`);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
    setMenuOpenId(null);
  }, [router, showToast]);

  const handleUnarchive = useCallback(async (id: number) => {
    try {
      await documentsAPI.update(id, { is_archived: false });
      mutate();
      showToast("Document restored", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
    setMenuOpenId(null);
  }, [mutate, showToast]);

  const handlePermanentDelete = useCallback((id: number) => {
    setMenuOpenId(null);
    setConfirmAction({ type: "delete-doc", id });
  }, []);

  const executePermanentDelete = useCallback(async (id: number) => {
    try {
      await documentsAPI.permanentDelete(id);
      mutate();
      showToast("Document permanently deleted", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
    setConfirmAction(null);
  }, [mutate, showToast]);

  const handleMoveToFolder = useCallback(async (docId: number, folderId: number | null) => {
    try {
      await documentsAPI.update(docId, { folder_id: folderId === null ? 0 : folderId });
      mutate();
      mutateFolders();
      showToast(folderId ? "Moved to folder" : "Removed from folder", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
    setMenuOpenId(null);
  }, [mutate, mutateFolders, showToast]);

  const handleUpdateTags = useCallback(async (docId: number, tags: string[]) => {
    try {
      await documentsAPI.update(docId, { tags });
      mutate();
      mutateTags();
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }, [mutate, mutateTags, showToast]);

  const handleToggleTag = useCallback(async (docId: number, tag: string, checked: boolean) => {
    const doc = documents?.find((d) => d.id === docId);
    if (!doc) return;
    const currentTags = doc.tags ?? [];
    const newTags = checked
      ? [...currentTags, tag]
      : currentTags.filter((t) => t !== tag);
    await handleUpdateTags(docId, newTags);
  }, [documents, handleUpdateTags]);

  const handleCreateTag = useCallback(async (docId: number, tag: string) => {
    const doc = documents?.find((d) => d.id === docId);
    if (!doc) return;
    const currentTags = doc.tags ?? [];
    if (!currentTags.includes(tag)) {
      await handleUpdateTags(docId, [...currentTags, tag]);
    }
  }, [documents, handleUpdateTags]);

  const handleCreateFolder = useCallback(async (name: string, parentId?: number | null) => {
    if (!name.trim()) return;
    try {
      await foldersAPI.create({ name: name.trim(), parent_id: parentId ?? undefined });
      mutateFolders();
      showToast("Folder created", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }, [mutateFolders, showToast]);

  const handleRenameFolder = useCallback(async (folder: DocumentFolder, newName: string) => {
    try {
      await foldersAPI.update(folder.id, { name: newName });
      mutateFolders();
      showToast("Folder renamed", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }, [mutateFolders, showToast]);

  const handleDeleteFolder = useCallback((folder: DocumentFolder) => {
    setConfirmAction({ type: "delete-folder", folder });
  }, []);

  const executeDeleteFolder = useCallback(async (folder: DocumentFolder) => {
    try {
      await foldersAPI.delete(folder.id);
      mutateFolders();
      if (activeFolderId === folder.id) setActiveFolderId(null);
      mutate();
      showToast("Folder deleted", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
    setConfirmAction(null);
  }, [mutateFolders, mutate, showToast, activeFolderId]);

  const activeFolder = folders.find((f) => f.id === activeFolderId);

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex flex-1 min-h-0">
        {/* Sidebar — desktop (collapses smoothly on templates tab) */}
        <FolderSidebar
          hidden={isTemplatesTab}
          folders={folders}
          allTags={allTags}
          activeFolderId={activeFolderId}
          activeTag={activeTag}
          onSelectFolder={(id) => { setActiveFolderId(id); setMobileDrawerOpen(false); }}
          onSelectTag={(tag) => { setActiveTag(tag); setMobileDrawerOpen(false); }}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          totalDocCount={firstPage?.length !== undefined ? (firstPage.length + extraDocs.length) : undefined}
        />

        {/* Mobile drawer backdrop + sidebar — always mounted, animated (hidden on templates tab) */}
        {!isTemplatesTab && (
          <div
            className={cn(
              "fixed inset-0 z-40 md:hidden transition-opacity duration-200",
              mobileDrawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={() => setMobileDrawerOpen(false)}
          >
            <div className="absolute inset-0 bg-black/40" />
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-[#1a1a1a] shadow-xl overflow-y-auto transition-transform duration-200 ease-out",
                mobileDrawerOpen ? "translate-x-0" : "-translate-x-full"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <FolderSidebar
                folders={folders}
                allTags={allTags}
                activeFolderId={activeFolderId}
                activeTag={activeTag}
                onSelectFolder={(id) => { setActiveFolderId(id); setMobileDrawerOpen(false); }}
                onSelectTag={(tag) => { setActiveTag(tag); setMobileDrawerOpen(false); }}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                mobile
              />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-6xl mx-auto">
        {/* Header + Filters card */}
        <div className="bg-white dark:bg-[#1a1a1a]/80 backdrop-blur-sm rounded-lg px-4 sm:px-5 py-3 sm:py-4 mb-4 border border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <div className="flex items-center justify-between mb-2 sm:mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 sm:w-7 sm:h-7 text-[#a0704b] dark:text-[#cd853f]" />
                  Documents
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    Beta
                  </span>
                </h1>
                {!isTemplatesTab && activeFolder && (
                  <span className="sm:hidden text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 ml-1">
                    / <FolderOpen className="w-3 h-3" /> {activeFolder.name}
                  </span>
                )}
                <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {isTemplatesTab
                    ? "Reusable templates for new documents"
                    : activeFolder
                    ? <span className="flex items-center gap-1"><FolderOpen className="w-3.5 h-3.5" />{activeFolder.name}</span>
                    : "Create and edit worksheets, exams, and lesson plans"}
                </p>
              </div>
            </div>
            {isTemplatesTab ? (
              <button
                onClick={handleCreateTemplate}
                className="flex items-center gap-2 px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors text-sm font-medium shadow-sm"
              >
                <Stamp className="w-4 h-4" />
                <span className="hidden sm:inline">New Template</span>
              </button>
            ) : (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover transition-colors text-sm font-medium shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Document</span>
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 w-fit bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-gray-700/30 rounded-xl p-1 mb-3">
            <button
              onClick={() => setActiveTab("documents")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activeTab === "documents"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-white/8"
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              Documents
            </button>
            <button
              onClick={() => setActiveTab("templates")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activeTab === "templates"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-white/8"
              )}
            >
              <Stamp className="w-3.5 h-3.5" />
              Templates
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 sm:max-w-[20rem]">
            {!isTemplatesTab && (
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors border border-gray-200 dark:border-gray-700/30 shrink-0"
                title="Folders & Tags"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Folders
              </button>
            )}
            <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={isTemplatesTab ? "Search templates..." : "Search documents..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn("w-full pl-9 py-2 rounded-lg border border-border bg-white dark:bg-[#1a1a1a] text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/40", search ? "pr-8" : "pr-3")}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
            </div>
          </div>
          <div className="flex gap-1 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-gray-700/30 rounded-xl p-1">
            {(["all", "worksheet", "lesson_plan"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  filterType === type
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-white/8"
                )}
              >
                {type === "all" ? "All" : DOC_TYPE_LABELS[type].label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              showArchived
                ? "bg-[#f5ede3] dark:bg-[#2d2618] border-[#a0704b]/30 text-[#a0704b] dark:text-[#cd853f]"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-white/5"
            )}
          >
            <Archive className="w-3.5 h-3.5" />
            Archived
          </button>
          <div className="relative ml-auto" ref={sortRef}>
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-white/5"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sort.label}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg py-1 min-w-[10rem]">
                {SORT_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.label}
                    onClick={() => { setSortIdx(i); setShowSortMenu(false); }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300",
                      i === sortIdx && "bg-[#f5ede3] dark:bg-[#2d2618] font-semibold"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-gray-700/30 rounded-lg p-0.5">
            <button
              onClick={() => toggleViewMode("grid")}
              className={cn("p-1.5 rounded transition-colors", viewMode === "grid" ? "bg-white dark:bg-[#2d2618] shadow-sm text-[#a0704b]" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300")}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => toggleViewMode("list")}
              className={cn("p-1.5 rounded transition-colors", viewMode === "list" ? "bg-white dark:bg-[#2d2618] shadow-sm text-[#a0704b]" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300")}
              title="List view"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          </div>

          {/* Active filter indicators */}
          {!isTemplatesTab && (activeTag || activeFolderId) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {activeFolderId && activeFolder && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#f5ede3] dark:bg-[#2d2618] text-[#a0704b] dark:text-[#cd853f]">
                  <FolderOpen className="w-3 h-3" />
                  {activeFolder.name}
                  <button onClick={() => setActiveFolderId(null)} className="ml-0.5 hover:opacity-70"><X className="w-3 h-3" /></button>
                </span>
              )}
              {activeTag && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#f5ede3] dark:bg-[#2d2618] text-[#a0704b] dark:text-[#cd853f]">
                  <Tag className="w-3 h-3" />
                  {activeTag}
                  <button onClick={() => setActiveTag(null)} className="ml-0.5 hover:opacity-70"><X className="w-3 h-3" /></button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Document list */}
        {isLoading ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {([
                ["w-16", "w-2/3"],
                ["w-20", "w-1/2"],
                ["w-16", "w-3/5"],
                ["w-20", "w-1/3"],
                ["w-16", "w-2/5"],
                ["w-20", "w-1/2"],
              ] as const).map(([badgeW, titleW], i) => (
                <div key={i} className="relative bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 rounded-xl p-4 overflow-hidden">
                  <div className={cn("h-5 rounded-full bg-gray-200 dark:bg-gray-700 mb-3", badgeW)} />
                  <div className={cn("h-4 rounded bg-gray-200 dark:bg-gray-700 mb-2", titleW)} />
                  <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-800" />
                  <div className="absolute inset-0 skeleton-shimmer" style={{ animationDelay: `${i * 0.15}s` }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 rounded-xl overflow-hidden">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="relative flex items-center gap-4 px-4 py-3 border-b border-[#e8d4b8]/20 dark:border-[#6b5a4a]/20 overflow-hidden">
                  <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 flex-1 max-w-xs rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-3 w-16 rounded bg-gray-100 dark:bg-gray-800 hidden sm:block" />
                  <div className="h-3 w-14 rounded bg-gray-100 dark:bg-gray-800 hidden sm:block" />
                  <div className="absolute inset-0 skeleton-shimmer" style={{ animationDelay: `${i * 0.1}s` }} />
                </div>
              ))}
            </div>
          )
        ) : !documents?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-700 dark:text-gray-400">
            {isTemplatesTab ? <Stamp className="w-12 h-12 mb-3 opacity-40" /> : <FileText className="w-12 h-12 mb-3 opacity-40" />}
            <p className="text-lg font-medium">
              {debouncedSearch || filterType !== "all" || showArchived || activeTag || activeFolderId
                ? isTemplatesTab ? "No matching templates" : "No matching documents"
                : isTemplatesTab ? "No templates yet" : "No documents yet"}
            </p>
            <p className="text-sm mt-1">
              {debouncedSearch || filterType !== "all" || showArchived || activeTag || activeFolderId
                ? "Try adjusting your search or filters"
                : isTemplatesTab ? "Create your first template to get started" : "Create your first document to get started"}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => {
              const typeInfo = DOC_TYPE_LABELS[doc.doc_type as DocType];
              const Icon = typeInfo?.icon ?? FileText;
              return (
                <div
                  key={doc.id}
                  onClick={() => router.push(`/documents/${doc.id}`)}
                  className={cn(
                    "relative group border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all",
                    doc.is_archived
                      ? "bg-white dark:bg-[#1a1a1a] border-dashed border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 opacity-60"
                      : doc.is_template
                      ? "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40 hover:border-purple-300 dark:hover:border-purple-700/50"
                      : "bg-white dark:bg-[#1a1a1a] border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-[#a0704b]/50"
                  )}
                >
                  {/* Type badge */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", typeInfo?.color)}>
                        <Icon className="w-3 h-3" />
                        {typeInfo?.label}
                      </span>
                      {doc.is_template && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          <Stamp className="w-3 h-3" />
                          Template
                        </span>
                      )}
                    </div>
                    <DocContextMenu
                      doc={doc} menuOpenId={menuOpenId} setMenuOpenId={setMenuOpenId}
                      onDuplicate={handleDuplicate} onArchive={handleArchive} onUnarchive={handleUnarchive} onPermanentDelete={handlePermanentDelete}
                      onSaveAsTemplate={!isTemplatesTab ? handleSaveAsTemplate : undefined}
                      folders={folders} onMoveToFolder={(fId) => handleMoveToFolder(doc.id, fId)}
                      onEditTags={() => { setTagEditDocId(doc.id); setMenuOpenId(null); }}
                    />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">{doc.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <span>
                      {doc.updated_by_name && doc.updated_by !== doc.created_by
                        ? <>{doc.created_by_name} &middot; Edited by {doc.updated_by_name} &middot; {formatTimeAgo(doc.updated_at)}</>
                        : <>{doc.created_by_name} &middot; {formatTimeAgo(doc.updated_at)}</>
                      }
                    </span>
                    {doc.locked_by && (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400" title={`Locked by ${doc.locked_by_name}`}>
                        <Lock className="w-3 h-3" />
                        <span className="truncate max-w-[5rem]">{doc.locked_by_name}</span>
                      </span>
                    )}
                  </div>
                  {/* Tags */}
                  {doc.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {doc.tags.map((tag) => (
                        <span key={tag} className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium", getTagColor(tag))}>{tag}</span>
                      ))}
                    </div>
                  )}
                  {/* Folder indicator */}
                  {doc.folder_name && !activeFolderId && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                      <FolderOpen className="w-3 h-3" />
                      {doc.folder_name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-xl">
            {/* List header */}
            <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf5ef] dark:bg-[#1f1a14] rounded-t-xl text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
              <span className="w-24">Type</span>
              <span className="flex-1">Title</span>
              <span className="w-28">Author</span>
              <span className="w-36">Modified</span>
              <span className="w-8" />
            </div>
            {documents.map((doc) => {
              const typeInfo = DOC_TYPE_LABELS[doc.doc_type as DocType];
              const Icon = typeInfo?.icon ?? FileText;
              return (
                <div
                  key={doc.id}
                  onClick={() => router.push(`/documents/${doc.id}`)}
                  className={cn(
                    "group flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-0.5 px-4 py-2.5 border-b last:border-b-0 last:rounded-b-xl border-[#e8d4b8]/20 dark:border-[#6b5a4a]/20 cursor-pointer hover:bg-[#faf5ef] dark:hover:bg-[#1f1a14] transition-colors",
                    doc.is_archived && "opacity-60 border-l-2 border-l-[#e8d4b8] dark:border-l-[#6b5a4a]",
                    doc.is_template && !doc.is_archived && "border-l-2 border-l-purple-400 dark:border-l-purple-600 bg-purple-50/30 dark:bg-purple-950/10"
                  )}
                >
                  {/* Type badge — desktop only */}
                  <span className={cn("hidden sm:inline-flex items-center gap-1 w-24 shrink-0 px-2 py-0.5 rounded-full text-xs font-medium", typeInfo?.color)}>
                    <Icon className="w-3 h-3" />
                    {typeInfo?.label}
                  </span>
                  {/* Title row — full width on mobile */}
                  <span className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="sm:hidden shrink-0"><Icon className={cn("w-4 h-4", typeInfo?.iconColor)} /></span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{doc.title}</span>
                    {doc.is_template && (
                      <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 shrink-0">
                        <Stamp className="w-2.5 h-2.5" />
                        Template
                      </span>
                    )}
                    {doc.locked_by && (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 shrink-0" title={`Locked by ${doc.locked_by_name}`}>
                        <Lock className="w-3 h-3" />
                      </span>
                    )}
                    {doc.tags?.length > 0 && (
                      <span className="hidden lg:inline-flex items-center gap-1 shrink-0">
                        {doc.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium", getTagColor(tag))}>{tag}</span>
                        ))}
                        {doc.tags.length > 3 && <span className="text-[10px] text-gray-500 dark:text-gray-400">+{doc.tags.length - 3}</span>}
                      </span>
                    )}
                    {/* Mobile menu — at end of title row */}
                    <span className="sm:hidden shrink-0 ml-auto">
                      <DocContextMenu
                        doc={doc} menuOpenId={menuOpenId} setMenuOpenId={setMenuOpenId}
                        onDuplicate={handleDuplicate} onArchive={handleArchive} onUnarchive={handleUnarchive} onPermanentDelete={handlePermanentDelete}
                        onSaveAsTemplate={!isTemplatesTab ? handleSaveAsTemplate : undefined}
                        folders={folders} onMoveToFolder={(fId) => handleMoveToFolder(doc.id, fId)}
                        onEditTags={() => { setTagEditDocId(doc.id); setMenuOpenId(null); }}
                      />
                    </span>
                  </span>
                  {/* Mobile meta row — type badge + editor + timestamp below title */}
                  <span className="flex sm:hidden items-center gap-2 w-full pl-6 text-xs text-gray-500 dark:text-gray-400">
                    <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium", typeInfo?.color)}>{typeInfo?.label}</span>
                    {doc.is_template && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Template</span>
                    )}
                    <span>
                      {doc.updated_by_name && doc.updated_by !== doc.created_by
                        ? <>{doc.updated_by_name} &middot; {formatTimeAgo(doc.updated_at)}</>
                        : formatTimeAgo(doc.updated_at)
                      }
                    </span>
                  </span>
                  {/* Desktop: author + modified + menu */}
                  <span className="hidden sm:block w-28 shrink-0 text-xs text-gray-600 dark:text-gray-400 truncate">{doc.created_by_name}</span>
                  <span className="hidden sm:block w-36 shrink-0 text-xs text-gray-500 dark:text-gray-400 truncate">
                    {doc.updated_by_name && doc.updated_by !== doc.created_by
                      ? <>{doc.updated_by_name} &middot; {formatTimeAgo(doc.updated_at)}</>
                      : formatTimeAgo(doc.updated_at)
                    }
                  </span>
                  <span className="hidden sm:block shrink-0">
                    <DocContextMenu
                      doc={doc} menuOpenId={menuOpenId} setMenuOpenId={setMenuOpenId}
                      onDuplicate={handleDuplicate} onArchive={handleArchive} onUnarchive={handleUnarchive} onPermanentDelete={handlePermanentDelete}
                      onSaveAsTemplate={!isTemplatesTab ? handleSaveAsTemplate : undefined}
                      folders={folders} onMoveToFolder={(fId) => handleMoveToFolder(doc.id, fId)}
                      onEditTags={() => { setTagEditDocId(doc.id); setMenuOpenId(null); }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {!isLoading && documents && documents.length > 0 && hasMore && (
          <div className="flex justify-center mt-6">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-5 py-2 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-sm text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}

        {/* Showing count */}
        {!isLoading && documents && documents.length > 0 && (
          <p className="text-center text-xs text-gray-600 dark:text-gray-400 mt-3">
            <span className="bg-white/80 dark:bg-[#1a1a1a]/60 backdrop-blur-sm rounded-full px-3 py-1">
              Showing {documents.length} {isTemplatesTab ? "template" : "document"}{documents.length !== 1 ? "s" : ""}
            </span>
          </p>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <CreateDocumentModal
            createStep={createStep}
            setCreateStep={setCreateStep}
            onClose={() => { setShowCreateModal(false); setCreateStep({ step: "type" }); }}
            onCreate={handleCreate}
          />
        )}

        {/* Tag Popover */}
        {tagEditDocId !== null && documents?.find((d) => d.id === tagEditDocId) && (
          <TagPopover
            doc={documents.find((d) => d.id === tagEditDocId)!}
            allTags={allTags}
            onToggleTag={handleToggleTag}
            onCreateTag={handleCreateTag}
            onClose={() => setTagEditDocId(null)}
          />
        )}
        {/* Confirm Dialog */}
        <ConfirmDialog
          isOpen={confirmAction !== null}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            if (!confirmAction) return;
            if (confirmAction.type === "delete-doc") executePermanentDelete(confirmAction.id);
            else executeDeleteFolder(confirmAction.folder);
          }}
          title={confirmAction?.type === "delete-doc" ? "Delete Document" : "Delete Folder"}
          message={confirmAction?.type === "delete-doc"
            ? "Permanently delete this document? This cannot be undone."
            : confirmAction?.type === "delete-folder"
            ? `Delete folder "${confirmAction.folder.name}"?`
            : ""}
          consequences={confirmAction?.type === "delete-folder" ? ["Documents inside will become unfiled"] : undefined}
          confirmText="Delete"
          variant="danger"
        />
          </div>{/* end max-w-6xl */}
        </div>{/* end overflow-y-auto main content */}
      </PageTransition>
    </DeskSurface>
  );
}

/* Tag popover — checkbox-based, instant save */
function TagPopover({ doc, allTags, onToggleTag, onCreateTag, onClose }: {
  doc: Document;
  allTags: string[];
  onToggleTag: (docId: number, tag: string, checked: boolean) => void;
  onCreateTag: (docId: number, tag: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = doc.tags ?? [];

  const filtered = allTags.filter((t) => t.toLowerCase().includes(search.toLowerCase()));
  const showCreate = search.trim() && !allTags.some((t) => t.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl"
        style={{ width: "18rem", maxWidth: "calc(100vw - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 pt-3 pb-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">{doc.title}</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              ref={inputRef}
              autoFocus
              type="text"
              placeholder="Search or create tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && showCreate) {
                  e.preventDefault();
                  onCreateTag(doc.id, search.trim());
                  setSearch("");
                }
                if (e.key === "Escape") onClose();
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-white dark:bg-[#1a1a1a] text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/40"
            />
          </div>
        </div>

        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {filtered.map((tag) => {
            const checked = tags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => onToggleTag(doc.id, tag, !checked)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
              >
                <div className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                  checked
                    ? "bg-[#a0704b] border-[#a0704b] text-white"
                    : "border-gray-300 dark:border-gray-600"
                )}>
                  {checked && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={cn("px-1.5 py-0.5 rounded-full text-xs font-medium", getTagColor(tag))}>
                  {tag}
                </span>
              </button>
            );
          })}
          {showCreate && (
            <button
              onClick={() => {
                onCreateTag(doc.id, search.trim());
                setSearch("");
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-[#a0704b] dark:text-[#cd853f] hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create &ldquo;{search.trim()}&rdquo;
            </button>
          )}
          {filtered.length === 0 && !showCreate && (
            <p className="px-2 py-3 text-xs text-gray-400 text-center">No tags found</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* Context menu (3-dot) shared between grid and list views */
function DocContextMenu({ doc, menuOpenId, setMenuOpenId, onDuplicate, onArchive, onUnarchive, onPermanentDelete, onSaveAsTemplate, folders, onMoveToFolder, onEditTags }: {
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
}) {
  return (
    <div className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === doc.id ? null : doc.id); }}
        className="p-1 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
      >
        <MoreVertical className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </button>
      {menuOpenId === doc.id && (
        <>
        <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }} onKeyDown={(e) => { if (e.key === "Escape") setMenuOpenId(null); }} tabIndex={-1} />
        <div className="absolute right-0 top-7 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg py-1 min-w-[10rem] max-w-[calc(100vw-2rem)]">
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
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Archive
            </button>
          )}
        </div>
        </>
      )}
    </div>
  );
}

/* Create document modal with dynamic template picker */
function CreateDocumentModal({ createStep, setCreateStep, onClose, onCreate }: {
  createStep: { step: "type" } | { step: "template"; docType: DocType };
  setCreateStep: (step: { step: "type" } | { step: "template"; docType: DocType }) => void;
  onClose: () => void;
  onCreate: (docType: DocType, templateDoc?: Document) => void;
}) {
  const [creating, setCreating] = useState(false);
  const { data: templates, isLoading: loadingTemplates } = useSWR(
    createStep.step === "template" ? ["templates-for-picker"] : null,
    () => documentsAPI.list({ is_template: true, limit: 50 }),
    { revalidateOnFocus: false }
  );

  const handlePickTemplate = useCallback(async (docType: DocType, tplId: number) => {
    setCreating(true);
    try {
      const fullDoc = await documentsAPI.get(tplId);
      onCreate(docType, fullDoc);
    } catch {
      onCreate(docType);
    }
  }, [onCreate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl p-6"
        style={{ width: "24rem", maxWidth: "calc(100vw - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {createStep.step === "type" ? (
          <>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">New Document</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose a document type:</p>
            <div className="flex flex-col gap-3">
              {(Object.entries(DOC_TYPE_LABELS) as [DocType, typeof DOC_TYPE_LABELS[DocType]][]).map(([type, info]) => {
                const Icon = info.icon;
                return (
                  <button
                    key={type}
                    onClick={() => setCreateStep({ step: "template", docType: type })}
                    className="flex items-center gap-3 p-3 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-[#a0704b]/50 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-all text-left"
                  >
                    <div className={cn("p-2 rounded-lg", info.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{info.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {type === "worksheet" ? "Exercises, exams, practice sheets" : "Teaching guides and outlines"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Choose a Template</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Start with a blank page or pick a template:
            </p>
            <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
              <button
                onClick={() => onCreate(createStep.docType)}
                className="flex items-center gap-3 p-3 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-[#a0704b]/50 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-all text-left"
              >
                <div className="p-2 rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Blank</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Start from scratch</p>
                </div>
              </button>
              {loadingTemplates ? (
                <div className="flex items-center gap-3 p-3 text-sm text-gray-400">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                </div>
              ) : templates && templates.length > 0 ? (
                templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    disabled={creating}
                    onClick={() => handlePickTemplate(createStep.docType, tpl.id)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-[#a0704b]/50 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-all text-left disabled:opacity-50"
                  >
                    <div className="p-2 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                      <Stamp className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{tpl.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {tpl.created_by_name ? `by ${tpl.created_by_name}` : DOC_TYPE_LABELS[tpl.doc_type as DocType]?.label ?? tpl.doc_type}
                        {tpl.updated_at ? ` · ${formatTimeAgo(tpl.updated_at)}` : ""}
                      </p>
                    </div>
                  </button>
                ))
              ) : null}
            </div>
            <button
              onClick={() => setCreateStep({ step: "type" })}
              className="w-full mt-4 py-2 text-sm text-[#a0704b] dark:text-[#cd853f] hover:text-[#8b5e3c] dark:hover:text-[#daa06d] transition-colors"
            >
              Back
            </button>
          </>
        )}
        <button
          onClick={onClose}
          className="w-full mt-2 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* Folder submenu inside context menu */
function FolderSubmenu({ doc, folders, onMoveToFolder }: {
  doc: Document;
  folders: DocumentFolder[];
  onMoveToFolder: (folderId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
      >
        <FolderInput className="w-3.5 h-3.5" />
        Move to
        <ChevronRight className="w-3 h-3 ml-auto" />
      </button>
      {open && (
        <div className="sm:absolute sm:right-full sm:top-0 sm:mr-1 z-20 sm:bg-white sm:dark:bg-[#1a1a1a] sm:border sm:border-[#e8d4b8] sm:dark:border-[#6b5a4a] sm:rounded-lg sm:shadow-lg py-1 sm:min-w-[9rem] border-t border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 sm:border-t-0">
          <button
            onClick={(e) => { e.stopPropagation(); onMoveToFolder(null); }}
            className={cn(
              "w-full flex items-center gap-2 pl-6 pr-3 sm:px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]",
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
                "w-full flex items-center gap-2 pl-6 pr-3 sm:px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]",
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
