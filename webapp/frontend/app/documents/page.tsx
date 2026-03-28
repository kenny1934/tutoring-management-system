"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { FileText, Lock } from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { usePageTitle, useDebouncedValue } from "@/lib/hooks";
import { formatTimeAgo } from "@/lib/formatters";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { documentsAPI, foldersAPI } from "@/lib/document-api";
import { cn } from "@/lib/utils";
import { getTagColor } from "@/lib/tag-colors";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import FolderSidebar from "@/components/documents/FolderSidebar";
import { DocumentPreviewPane } from "@/components/documents/DocumentPreviewPane";
import { getRecentDocIds, trackDocView } from "@/lib/recent-docs";
import DocumentsToolbar, { SORT_OPTIONS } from "@/components/documents/DocumentsToolbar";
import { DOC_TYPE_CONFIG } from "@/lib/doc-type-config";
import DocumentsTable from "@/components/documents/DocumentsTable";
import DocContextMenu from "@/components/documents/DocContextMenu";
import TagPopover from "@/components/documents/TagPopover";
import CreateDocumentModal from "@/components/documents/CreateDocumentModal";
import ImportWorksheetModal from "@/components/documents/ImportWorksheetModal";
import type { Document, DocType, DocumentFolder } from "@/types";

const PAGE_SIZE = 24;

export default function DocumentsPage() {
  usePageTitle("Documents");
  const router = useRouter();
  const { showToast } = useToast();
  const { isReadOnly } = useAuth();

  // --- Filter / navigation state ---
  const [activeTab, setActiveTab] = useState<"all" | "mine" | "recent" | "templates">("all");
  const [filterType, setFilterType] = useState<DocType | "all">("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [showArchived, setShowArchived] = useState(false);
  const [sortIdx, setSortIdx] = useState(0);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);

  // --- View state ---
  const [viewMode, setViewMode] = useState<"table" | "grid">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("doc-view-mode");
      if (stored === "grid") return "grid";
    }
    return "table";
  });
  const [previewEnabled, setPreviewEnabled] = useState<boolean>(() =>
    typeof window !== "undefined" && localStorage.getItem("doc-preview-enabled") === "true"
  );
  const [previewDocId, setPreviewDocId] = useState<number | null>(null);

  // --- Selection + expansion ---
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // --- UI ephemeral state ---
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [tagEditDocId, setTagEditDocId] = useState<number | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [createStep, setCreateStep] = useState<{ step: "type" } | { step: "template"; docType: DocType }>({ step: "type" });
  const [confirmAction, setConfirmAction] = useState<{ type: "delete-doc"; id: number } | { type: "delete-bulk" } | { type: "delete-folder"; folder: DocumentFolder } | null>(null);

  const sort = SORT_OPTIONS[sortIdx];
  const isTemplatesTab = activeTab === "templates";
  const recentIds = useMemo(() => activeTab === "recent" ? getRecentDocIds() : [], [activeTab]);

  // --- Data fetching ---
  const { data: allTags = [], mutate: mutateTags } = useSWR("document-tags", () => documentsAPI.listTags(), { revalidateOnFocus: false });
  const { data: folders = [], mutate: mutateFolders } = useSWR("document-folders", () => foldersAPI.list(), { revalidateOnFocus: false });

  const { data: firstPage, isLoading, mutate } = useSWR(
    ["documents", filterType, debouncedSearch, showArchived, sort.sort_by, sort.sort_order, activeTag, activeFolderId, activeTab, activeTab === "recent" ? recentIds.join(",") : ""],
    () => {
      if (activeTab === "recent" && recentIds.length === 0) return Promise.resolve([] as Document[]);
      return documentsAPI.list({
        doc_type: filterType === "all" ? undefined : filterType,
        search: debouncedSearch || undefined,
        include_archived: showArchived || undefined,
        is_template: isTemplatesTab,
        sort_by: sort.sort_by,
        sort_order: sort.sort_order,
        limit: PAGE_SIZE,
        tag: isTemplatesTab ? undefined : (activeTag || undefined),
        folder_id: isTemplatesTab ? undefined : (activeFolderId ?? undefined),
        my_docs: activeTab === "mine" ? true : undefined,
        ids: activeTab === "recent" ? recentIds.join(",") : undefined,
      });
    },
    { revalidateOnFocus: false }
  );

  // --- Pagination ---
  const [extraDocs, setExtraDocs] = useState<Document[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreExhausted, setMoreExhausted] = useState(false);
  const documents = useMemo(() => firstPage ? [...firstPage, ...extraDocs] : undefined, [firstPage, extraDocs]);
  const hasMore = !moreExhausted && !!firstPage && firstPage.length === PAGE_SIZE;

  // Only show tag counts when all results are loaded (no more pages), otherwise counts are misleading
  const tagCounts = useMemo(() => {
    if (!documents || hasMore) return {};
    const counts: Record<string, number> = {};
    for (const doc of documents) {
      for (const tag of doc.tags || []) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  }, [documents, hasMore]);

  const filtersRef = useRef({ filterType, debouncedSearch, showArchived, sort, activeTag, activeFolderId, firstPage, extraDocs, isTemplatesTab, activeTab, recentIds });
  filtersRef.current = { filterType, debouncedSearch, showArchived, sort, activeTag, activeFolderId, firstPage, extraDocs, isTemplatesTab, activeTab, recentIds };

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
        my_docs: f.activeTab === "mine" ? true : undefined,
        ids: f.activeTab === "recent" ? f.recentIds.join(",") : undefined,
      });
      setExtraDocs((prev) => [...prev, ...next]);
      if (next.length < PAGE_SIZE) setMoreExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  // --- Effects ---
  useEffect(() => {
    if (sessionStorage.getItem("doc_auto_deleted")) {
      const t = setTimeout(() => { sessionStorage.removeItem("doc_auto_deleted"); mutate(); }, 300);
      return () => clearTimeout(t);
    }
  }, [mutate]);

  useEffect(() => {
    setExtraDocs([]);
    setMoreExhausted(false);
    setPreviewDocId(null);
    setSelectedIds(new Set());
  }, [filterType, debouncedSearch, showArchived, sortIdx, activeTag, activeFolderId, activeTab]);

  // Clear folder/tag filters when switching to templates tab (sidebar is hidden there)
  useEffect(() => {
    if (activeTab === "templates") {
      setActiveFolderId(null);
      setActiveTag(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [mobileDrawerOpen]);

  // Keyboard navigation: arrow keys to move between rows, Enter to open, Escape to deselect
  // Uses ref for previewDocId so the listener doesn't re-register on every arrow key press
  const previewDocIdRef = useRef(previewDocId);
  previewDocIdRef.current = previewDocId;

  useEffect(() => {
    if (viewMode !== "table") return;
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      const tag = document.activeElement?.tagName;
      if (tag && ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag)) return;

      const rowEls = document.querySelectorAll<HTMLTableRowElement>("tr[data-doc-id]");
      const visibleIds = Array.from(rowEls).map(el => Number(el.dataset.docId));
      if (!visibleIds.length) return;

      const currentId = previewDocIdRef.current;
      const currentIdx = currentId !== null ? visibleIds.indexOf(currentId) : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = currentIdx < visibleIds.length - 1 ? currentIdx + 1 : 0;
        setPreviewDocId(visibleIds[nextIdx]);
        rowEls[nextIdx]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : visibleIds.length - 1;
        setPreviewDocId(visibleIds[prevIdx]);
        rowEls[prevIdx]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && currentId !== null) {
        e.preventDefault();
        router.push(`/documents/${currentId}`);
      } else if (e.key === "Escape") {
        setPreviewDocId(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [viewMode, router]);

  // --- View callbacks ---
  const toggleViewMode = useCallback((mode: "table" | "grid") => {
    setViewMode(mode);
    localStorage.setItem("doc-view-mode", mode);
    if (mode === "grid") setSelectedIds(new Set());
  }, []);

  const togglePreview = useCallback(() => {
    setPreviewEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("doc-preview-enabled", String(next));
      if (!next) setPreviewDocId(null);
      return next;
    });
  }, []);

  const handleDocClick = useCallback((docId: number) => {
    trackDocView(docId);
    if (previewEnabled && window.matchMedia("(min-width: 1024px)").matches) {
      setPreviewDocId(docId);
    } else {
      router.push(`/documents/${docId}`);
    }
  }, [previewEnabled, router]);

  // --- Selection callbacks ---
  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback((visibleIds?: number[]) => {
    const allIds = visibleIds ?? documents?.map(d => d.id) ?? [];
    if (!allIds.length) return;
    setSelectedIds(prev => {
      const allSelected = allIds.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(allIds);
    });
  }, [documents]);

  const handleToggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // --- CRUD callbacks ---
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
    } catch (err) { showToast((err as Error).message, "error"); }
  }, [router, showToast, activeFolderId]);

  const handleCreateTemplate = useCallback(async () => {
    try {
      const doc = await documentsAPI.create({ title: "Untitled Template", doc_type: "worksheet", is_template: true });
      router.push(`/documents/${doc.id}`);
    } catch (err) { showToast((err as Error).message, "error"); }
  }, [router, showToast]);

  const handleSaveAsTemplate = useCallback(async (id: number) => {
    try {
      const source = await documentsAPI.get(id);
      await documentsAPI.create({
        title: `${source.title} (Template)`, doc_type: source.doc_type,
        ...(source.page_layout ? { page_layout: source.page_layout } : {}),
        ...(source.content ? { content: source.content } : {}),
        is_template: true,
      });
      showToast("Template created", "success");
      setActiveTab("templates");
      mutate();
    } catch (err) { showToast((err as Error).message, "error"); }
    setMenuOpenId(null);
  }, [showToast, mutate]);

  const handleArchive = useCallback(async (id: number) => {
    try { await documentsAPI.delete(id); mutate(); showToast("Document archived", "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
    setMenuOpenId(null);
  }, [mutate, showToast]);

  const handleDuplicate = useCallback(async (id: number) => {
    try { const copy = await documentsAPI.duplicate(id); router.push(`/documents/${copy.id}`); }
    catch (err) { showToast((err as Error).message, "error"); }
    setMenuOpenId(null);
  }, [router, showToast]);

  const handleUnarchive = useCallback(async (id: number) => {
    try { await documentsAPI.update(id, { is_archived: false }); mutate(); showToast("Document restored", "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
    setMenuOpenId(null);
  }, [mutate, showToast]);

  const handlePermanentDelete = useCallback((id: number) => { setMenuOpenId(null); setConfirmAction({ type: "delete-doc", id }); }, []);
  const executePermanentDelete = useCallback(async (id: number) => {
    try { await documentsAPI.permanentDelete(id); mutate(); showToast("Document permanently deleted", "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
    setConfirmAction(null);
  }, [mutate, showToast]);

  const handleMoveToFolder = useCallback(async (docId: number, folderId: number | null) => {
    try {
      await documentsAPI.update(docId, { folder_id: folderId === null ? 0 : folderId });
      mutate(); mutateFolders();
      showToast(folderId ? "Moved to folder" : "Removed from folder", "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setMenuOpenId(null);
  }, [mutate, mutateFolders, showToast]);

  const handleUpdateTags = useCallback(async (docId: number, tags: string[]) => {
    try { await documentsAPI.update(docId, { tags }); mutate(); mutateTags(); }
    catch (err) { showToast((err as Error).message, "error"); }
  }, [mutate, mutateTags, showToast]);

  const handleToggleTag = useCallback(async (docId: number, tag: string, checked: boolean) => {
    const doc = documents?.find((d) => d.id === docId);
    if (!doc) return;
    const currentTags = doc.tags ?? [];
    await handleUpdateTags(docId, checked ? [...currentTags, tag] : currentTags.filter((t) => t !== tag));
  }, [documents, handleUpdateTags]);

  const handleCreateTag = useCallback(async (docId: number, tag: string) => {
    const doc = documents?.find((d) => d.id === docId);
    if (!doc) return;
    const currentTags = doc.tags ?? [];
    if (!currentTags.includes(tag)) await handleUpdateTags(docId, [...currentTags, tag]);
  }, [documents, handleUpdateTags]);

  // --- Folder callbacks ---
  const handleCreateFolder = useCallback(async (name: string, parentId?: number | null) => {
    if (!name.trim()) return;
    try { await foldersAPI.create({ name: name.trim(), parent_id: parentId ?? undefined }); mutateFolders(); showToast("Folder created", "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
  }, [mutateFolders, showToast]);

  const handleRenameFolder = useCallback(async (folder: DocumentFolder, newName: string) => {
    try { await foldersAPI.update(folder.id, { name: newName }); mutateFolders(); showToast("Folder renamed", "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
  }, [mutateFolders, showToast]);

  const handleDeleteFolder = useCallback((folder: DocumentFolder) => { setConfirmAction({ type: "delete-folder", folder }); }, []);
  const executeDeleteFolder = useCallback(async (folder: DocumentFolder) => {
    try {
      await foldersAPI.delete(folder.id); mutateFolders();
      if (activeFolderId === folder.id) setActiveFolderId(null);
      mutate(); showToast("Folder deleted", "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setConfirmAction(null);
  }, [mutateFolders, mutate, showToast, activeFolderId]);

  // --- Bulk actions ---
  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => documentsAPI.delete(id)));
      mutate(); setSelectedIds(new Set());
      showToast(`${ids.length} document(s) archived`, "success");
    } catch (err) { showToast((err as Error).message, "error"); }
  }, [selectedIds, mutate, showToast]);

  const handleBulkDelete = useCallback(() => {
    setConfirmAction({ type: "delete-bulk" });
  }, []);

  const executeBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => documentsAPI.permanentDelete(id)));
      mutate(); setSelectedIds(new Set());
      showToast(`${ids.length} document(s) deleted`, "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setConfirmAction(null);
  }, [selectedIds, mutate, showToast]);

  const handleBulkMoveToFolder = useCallback(() => {
    showToast("Bulk move coming soon", "info");
  }, [showToast]);

  const handleBulkAddTag = useCallback(() => {
    showToast("Bulk tag coming soon", "info");
  }, [showToast]);

  const activeFolder = folders.find((f) => f.id === activeFolderId);

  // Empty state text
  const emptyTitle = !documents?.length
    ? activeTab === "recent" ? "No recently viewed documents"
    : activeTab === "mine" ? "No documents found"
    : isTemplatesTab ? (debouncedSearch || filterType !== "all" ? "No matching templates" : "No templates yet")
    : (debouncedSearch || filterType !== "all" || activeTag || activeFolderId ? "No matching documents" : "No documents yet")
    : "";
  const emptyMessage = !documents?.length
    ? activeTab === "recent" ? "Documents you open will appear here"
    : activeTab === "mine" ? "Documents you create or edit will appear here"
    : isTemplatesTab ? (debouncedSearch || filterType !== "all" ? "Try adjusting your search or filters" : "Create your first template to get started")
    : (debouncedSearch || filterType !== "all" || activeTag || activeFolderId ? "Try adjusting your search or filters" : "Create your first document to get started")
    : "";

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
        <div className="flex flex-1 min-h-0 bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm overflow-hidden">
        {/* Sidebar — desktop */}
        <FolderSidebar
          hidden={isTemplatesTab}
          folders={folders}
          allTags={allTags}
          tagCounts={tagCounts}
          activeFolderId={activeFolderId}
          activeTag={activeTag}
          onSelectFolder={setActiveFolderId}
          onSelectTag={setActiveTag}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          isReadOnly={isReadOnly}
        />

        {/* Mobile sidebar drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30 animate-backdrop-in" onClick={() => setMobileDrawerOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-[#1a1a1a] shadow-xl overflow-y-auto">
              <FolderSidebar
                mobile
                folders={folders}
                allTags={allTags}
                tagCounts={tagCounts}
                activeFolderId={activeFolderId}
                activeTag={activeTag}
                onSelectFolder={(id) => { setActiveFolderId(id); setMobileDrawerOpen(false); }}
                onSelectTag={(tag) => { setActiveTag(tag); setMobileDrawerOpen(false); }}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                isReadOnly={isReadOnly}
              />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <DocumentsToolbar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            search={search}
            onSearchChange={setSearch}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived((p) => !p)}
            sortIdx={sortIdx}
            onSortChange={setSortIdx}
            viewMode={viewMode}
            onViewModeChange={toggleViewMode}
            previewEnabled={previewEnabled}
            onTogglePreview={togglePreview}
            activeTag={activeTag}
            onClearTag={() => setActiveTag(null)}
            activeFolderId={activeFolderId}
            activeFolder={activeFolder}
            onClearFolder={() => setActiveFolderId(null)}
            onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
            onCreateDocument={() => setShowCreateModal(true)}
            onImportWorksheet={() => setShowImportModal(true)}
            onCreateTemplate={handleCreateTemplate}
            isReadOnly={isReadOnly}
            selectedCount={selectedIds.size}
            onClearSelection={() => setSelectedIds(new Set())}
            onBulkArchive={handleBulkArchive}
            onBulkDelete={handleBulkDelete}
            onBulkMoveToFolder={handleBulkMoveToFolder}
            onBulkAddTag={handleBulkAddTag}
          />

          <div className="flex-1 overflow-y-auto">
            {viewMode === "table" ? (
              <DocumentsTable
                documents={documents ?? []}
                isLoading={isLoading}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                expandedIds={expandedIds}
                onToggleExpand={handleToggleExpand}
                onDocClick={handleDocClick}
                previewDocId={previewDocId}
                menuOpenId={menuOpenId}
                onMenuOpen={setMenuOpenId}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
                onPermanentDelete={handlePermanentDelete}
                onSaveAsTemplate={handleSaveAsTemplate}
                onEditTags={setTagEditDocId}
                folders={folders}
                onMoveToFolder={handleMoveToFolder}
                isReadOnly={isReadOnly}
                isTemplatesTab={isTemplatesTab}
                activeFolderId={activeFolderId}
                emptyTitle={emptyTitle}
                emptyMessage={emptyMessage}
              />
            ) : (
              <div className="p-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-32 rounded-xl bg-[#f5ede3] dark:bg-[#2d2618] shimmer-sepia" />
                  ))
                ) : documents?.length ? (
                  documents.map((doc, i) => {
                    const meta = DOC_TYPE_CONFIG[doc.doc_type as DocType] || DOC_TYPE_CONFIG.worksheet;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={doc.id}
                        onClick={() => handleDocClick(doc.id)}
                        className={cn(
                          "group relative rounded-xl border border-l-[3px] p-4 cursor-pointer card-hover active:scale-[0.98] active:shadow-none",
                          doc.doc_type === "worksheet" ? "border-l-[#7ba7c7]" : "border-l-[#6aa87a]",
                          doc.is_archived
                            ? "border-dashed border-gray-300 dark:border-gray-600 opacity-60"
                            : doc.is_template
                            ? "border-purple-200 dark:border-purple-700 bg-purple-50/60 dark:bg-purple-950/20 border-l-purple-400"
                            : "border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#fef9f3] dark:bg-[#1a1a1a] shadow-[var(--shadow-paper-sm)] dark:shadow-none paper-texture"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", meta.color)}>{meta.label}</span>
                          {doc.locked_by && <Lock className="w-3 h-3 text-amber-500" />}
                          <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
                            {!isReadOnly && (
                              <DocContextMenu
                                doc={doc}
                                menuOpenId={menuOpenId}
                                setMenuOpenId={setMenuOpenId}
                                onDuplicate={handleDuplicate}
                                onArchive={handleArchive}
                                onUnarchive={handleUnarchive}
                                onPermanentDelete={handlePermanentDelete}
                                onSaveAsTemplate={isTemplatesTab ? undefined : handleSaveAsTemplate}
                                folders={folders}
                                onMoveToFolder={(folderId) => handleMoveToFolder(doc.id, folderId)}
                                onEditTags={() => setTagEditDocId(doc.id)}
                              />
                            )}
                          </div>
                        </div>
                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{doc.title}</h3>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                          {doc.created_by_name}
                          {doc.updated_at && <> · {formatTimeAgo(doc.updated_at)}</>}
                        </p>
                        {doc.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {doc.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-medium", getTagColor(tag))}>{tag}</span>
                            ))}
                            {doc.tags.length > 3 && <span className="text-[9px] text-gray-400">+{doc.tags.length - 3}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full flex flex-col items-center py-20 text-center">
                    <div className="animate-empty-float w-16 h-16 rounded-2xl bg-[#f5ede3] dark:bg-[#2d2618] flex items-center justify-center mb-4">
                      <FileText className="w-8 h-8 text-[#a0704b]/40 dark:text-[#cd853f]/30" />
                    </div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{emptyTitle}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-[20rem]">{emptyMessage}</p>
                  </div>
                )}
              </div>
            )}

            {/* Load more */}
            {hasMore && !isLoading && (
              <div className="flex justify-center py-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-[#a0704b] animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1 h-1 rounded-full bg-[#a0704b] animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1 h-1 rounded-full bg-[#a0704b] animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  ) : "Load more"}
                </button>
              </div>
            )}
            {documents && (
              <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 pb-4">
                Showing {documents.length} document{documents.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>

        {/* Preview pane — desktop, inside the card (always mounted for slide animation) */}
        <DocumentPreviewPane
          docId={previewEnabled ? previewDocId : null}
          collapsed={!previewEnabled}
          onClose={() => setPreviewDocId(null)}
          onOpenEditor={(id) => router.push(`/documents/${id}`)}
          onPrint={(id, mode) => window.open(`/documents/${id}?print=${mode}`, "_blank")}
        />
        </div>{/* end white card */}
      </PageTransition>

      {/* Modals */}
      {showCreateModal && (
        <CreateDocumentModal
          createStep={createStep}
          setCreateStep={setCreateStep}
          onClose={() => { setShowCreateModal(false); setCreateStep({ step: "type" }); }}
          onCreate={handleCreate}
        />
      )}
      {showImportModal && (
        <ImportWorksheetModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { setShowImportModal(false); mutate(); }}
          defaultFolderId={activeFolderId}
        />
      )}
      {(() => {
        const tagEditDoc = tagEditDocId !== null ? documents?.find((d) => d.id === tagEditDocId) : undefined;
        return tagEditDoc ? (
          <TagPopover
            doc={tagEditDoc}
            allTags={allTags}
            onToggleTag={handleToggleTag}
            onCreateTag={handleCreateTag}
            onClose={() => setTagEditDocId(null)}
          />
        ) : null;
      })()}
      <ConfirmDialog
        isOpen={confirmAction !== null}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === "delete-bulk") executeBulkDelete();
          else if (confirmAction.type === "delete-doc") executePermanentDelete(confirmAction.id);
          else executeDeleteFolder(confirmAction.folder);
        }}
        title={confirmAction?.type === "delete-bulk"
          ? `Delete ${selectedIds.size} Document(s)`
          : confirmAction?.type === "delete-doc" ? "Delete Document"
          : "Delete Folder"}
        message={confirmAction?.type === "delete-bulk"
          ? `Permanently delete ${selectedIds.size} document(s)? This cannot be undone.`
          : confirmAction?.type === "delete-doc"
          ? "Permanently delete this document? This cannot be undone."
          : confirmAction?.type === "delete-folder"
          ? `Delete folder "${confirmAction.folder.name}"?`
          : ""}
        consequences={confirmAction?.type === "delete-folder" ? ["Documents inside will become unfiled"] : undefined}
        confirmText="Delete"
        variant="danger"
      />
    </DeskSurface>
  );
}
