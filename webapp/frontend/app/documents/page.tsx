"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { FileText, Lock, FolderOpen, Trash2, X as XIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DndContext, closestCenter, DragOverlay } from "@dnd-kit/core";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { usePageTitle, useDebouncedValue, useFocusTrap } from "@/lib/hooks";
import { formatTimeAgo } from "@/lib/formatters";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { documentsAPI, foldersAPI } from "@/lib/document-api";
import { flattenFolderTree } from "@/lib/folder-utils";
import { cn } from "@/lib/utils";
import { getTagColor } from "@/lib/tag-colors";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import FolderSidebar from "@/components/documents/FolderSidebar";
import { DocumentPreviewPane } from "@/components/documents/DocumentPreviewPane";
import { getRecentDocIds, trackDocView, removeFromRecent } from "@/lib/recent-docs";
import DocumentsToolbar, { SORT_OPTIONS } from "@/components/documents/DocumentsToolbar";
import DocumentsTable from "@/components/documents/DocumentsTable";
import DocContextMenu from "@/components/documents/DocContextMenu";
import TagPopover from "@/components/documents/TagPopover";
import CreateDocumentModal from "@/components/documents/CreateDocumentModal";
import ImportWorksheetModal from "@/components/documents/ImportWorksheetModal";
import { useDndDocuments, useDraggableDoc } from "@/lib/hooks/useDndDocuments";
import type { Document, DocumentFolder } from "@/types";

function DraggableCard({ doc, selectedIds, disabled, children, className, onClick }: {
  doc: Document; selectedIds: Set<number>; disabled: boolean;
  children: React.ReactNode; className?: string; onClick: () => void;
}) {
  const { setNodeRef, dragProps, isDragging } = useDraggableDoc({
    docId: doc.id, docTitle: doc.title, selectedIds, disabled, idPrefix: "doc-card",
  });
  return (
    <div ref={setNodeRef} {...dragProps} onClick={onClick} className={className} style={isDragging ? { opacity: 0.4 } : undefined}>
      {children}
    </div>
  );
}

const PAGE_SIZE = 24;

type ListFilters = {
  debouncedSearch: string; isTrashTab: boolean; sort: { sort_by: string; sort_order: string };
  activeTags: string[]; activeFolderId: number | null; isTemplatesTab: boolean;
  activeTab: string; recentIds: number[];
};

function buildDocListParams(f: ListFilters, offset?: number) {
  return {
    search: f.debouncedSearch || undefined,
    archived_only: f.isTrashTab || undefined,
    is_template: f.isTemplatesTab,
    sort_by: f.sort.sort_by,
    sort_order: f.sort.sort_order,
    limit: PAGE_SIZE,
    offset,
    tag: (f.isTemplatesTab || f.isTrashTab) ? undefined : (f.activeTags.length > 0 ? f.activeTags.join(",") : undefined),
    folder_id: (f.isTemplatesTab || f.isTrashTab) ? undefined : (f.activeFolderId ?? undefined),
    my_docs: f.activeTab === "mine" ? true : undefined,
    ids: f.activeTab === "recent" ? f.recentIds.join(",") : undefined,
  };
}

export default function DocumentsPage() {
  usePageTitle("Documents");
  const router = useRouter();
  const { showToast } = useToast();
  const { isReadOnly } = useAuth();

  // --- Filter / navigation state ---
  const [activeTab, setActiveTab] = useState<"all" | "mine" | "recent" | "templates" | "trash">("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [sortIdx, setSortIdx] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("doc-sort-idx");
      if (stored) { const n = parseInt(stored, 10); if (n >= 0 && n < SORT_OPTIONS.length) return n; }
    }
    return 0;
  });
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [showStarred, setShowStarred] = useState(false);

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
  const [confirmAction, setConfirmAction] = useState<{ type: "delete-doc"; id: number; title?: string } | { type: "delete-bulk" } | { type: "empty-trash" } | { type: "delete-folder"; folder: DocumentFolder } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const sort = SORT_OPTIONS[sortIdx];
  const isTemplatesTab = activeTab === "templates";
  const recentIds = useMemo(() => activeTab === "recent" ? getRecentDocIds() : [], [activeTab]);

  // --- Data fetching ---
  const { data: allTags = [], mutate: mutateTags } = useSWR("document-tags", () => documentsAPI.listTags(), { revalidateOnFocus: false });
  const { data: folders = [], mutate: mutateFolders } = useSWR("document-folders", () => foldersAPI.list(), { revalidateOnFocus: false });
  // Show trash count in sidebar (quick check — just fetch first page)
  const { data: trashDocs, mutate: mutateTrashCount } = useSWR("document-trash-count", () => documentsAPI.list({ archived_only: true, limit: 200 }));
  const trashCount = trashDocs?.length ?? 0;

  const isTrashTab = activeTab === "trash";
  const { data: firstPage, isLoading, mutate } = useSWR(
    ["documents", debouncedSearch, sort.sort_by, sort.sort_order, activeTags, activeFolderId, activeTab, showStarred, activeTab === "recent" ? recentIds.join(",") : ""],
    () => {
      if (activeTab === "recent" && recentIds.length === 0) return Promise.resolve([] as Document[]);
      const params = buildDocListParams({ debouncedSearch, isTrashTab, sort, activeTags, activeFolderId, isTemplatesTab, activeTab, recentIds });
      return documentsAPI.list({ ...params, starred_only: showStarred || undefined });
    },
    { revalidateOnFocus: false }
  );

  // --- Pagination ---
  const [extraDocs, setExtraDocs] = useState<Document[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreExhausted, setMoreExhausted] = useState(false);
  const documents = useMemo(() => {
    if (!firstPage) return undefined;
    return [...firstPage, ...extraDocs];
  }, [firstPage, extraDocs]);
  const hasMore = !moreExhausted && !!firstPage && firstPage.length === PAGE_SIZE;

  // Tag names and counts from server-side endpoint
  const tagNames = useMemo(() => allTags.map(t => t.name).filter(Boolean), [allTags]);
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of allTags) counts[t.name] = t.count;
    return counts;
  }, [allTags]);

  const flatFolders = useMemo(() => flattenFolderTree(folders), [folders]);

  const filtersRef = useRef({ debouncedSearch, isTrashTab, sort, activeTags, activeFolderId, firstPage, extraDocs, isTemplatesTab, activeTab, recentIds });
  filtersRef.current = { debouncedSearch, isTrashTab, sort, activeTags, activeFolderId, firstPage, extraDocs, isTemplatesTab, activeTab, recentIds };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const f = filtersRef.current;
    setLoadingMore(true);
    try {
      const offset = (f.firstPage?.length ?? 0) + f.extraDocs.length;
      const next = await documentsAPI.list(buildDocListParams(f, offset));
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
  }, [debouncedSearch, isTrashTab, sortIdx, activeTags, activeFolderId, activeTab, showStarred]);

  // Clear folder/tag filters when switching to templates or trash tab (sidebar is hidden)
  useEffect(() => {
    if (activeTab === "templates" || activeTab === "trash") {
      setActiveFolderId(null);
      setActiveTags([]);
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

  const [showShortcutHints, setShowShortcutHints] = useState(false);
  const showShortcutHintsRef = useRef(showShortcutHints);
  showShortcutHintsRef.current = showShortcutHints;
  const handleBulkArchiveRef = useRef<() => void>(undefined);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      const tag = document.activeElement?.tagName;
      const onInput = tag && ["INPUT", "TEXTAREA", "SELECT"].includes(tag);

      // Global shortcuts (work even when not on an input)
      if (!onInput) {
        if (e.key === "?") { e.preventDefault(); setShowShortcutHints(prev => !prev); return; }
        if (e.key === "Escape" && showShortcutHintsRef.current) { setShowShortcutHints(false); return; }
        if (e.key === "/") { e.preventDefault(); document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus(); return; }
        if (e.key === "n" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setShowCreateModal(true); return; }
        if ((e.key === "Delete" || e.key === "Backspace") && selectedIdsRef.current.size > 0) {
          e.preventDefault(); handleBulkArchiveRef.current?.(); return;
        }
      }

      // Table-only navigation
      if (viewModeRef.current !== "table" || onInput) return;
      if (tag && ["BUTTON", "A"].includes(tag)) return;

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
  }, [router]);

  // --- View callbacks ---
  const toggleViewMode = useCallback((mode: "table" | "grid") => {
    setViewMode(mode);
    localStorage.setItem("doc-view-mode", mode);
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
  const handleCreate = useCallback(async (templateDoc?: Document) => {
    try {
      const doc = await documentsAPI.create({
        title: "Untitled Document",
        doc_type: "worksheet",
        ...(templateDoc?.page_layout ? { page_layout: templateDoc.page_layout } : {}),
        ...(templateDoc?.content ? { content: templateDoc.content } : {}),
        ...(activeFolderId ? { folder_id: activeFolderId } : {}),
      });
      setShowCreateModal(false);
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
    try { await documentsAPI.delete(id); removeFromRecent(id); mutate(); mutateTrashCount(); showToast("Moved to trash", "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
    setMenuOpenId(null);
  }, [mutate, mutateTrashCount, showToast]);

  const handleDuplicate = useCallback(async (id: number) => {
    try { await documentsAPI.duplicate(id); mutate(); showToast("Document duplicated", "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
    setMenuOpenId(null);
  }, [mutate, showToast]);

  const handleUnarchive = useCallback(async (id: number) => {
    try { await documentsAPI.update(id, { is_archived: false }); mutate(); mutateTrashCount(); showToast("Document restored", "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
    setMenuOpenId(null);
  }, [mutate, mutateTrashCount, showToast]);

  const handlePermanentDelete = useCallback((id: number) => {
    const doc = documents?.find(d => d.id === id);
    setMenuOpenId(null);
    setConfirmAction({ type: "delete-doc", id, title: doc?.title });
  }, [documents]);
  const executePermanentDelete = useCallback(async (id: number) => {
    setConfirmLoading(true);
    try { await documentsAPI.permanentDelete(id); removeFromRecent(id); mutate(); mutateTrashCount(); showToast("Document permanently deleted", "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
    setConfirmLoading(false);
    setConfirmAction(null);
  }, [mutate, mutateTrashCount, showToast]);

  const handleMoveToFolder = useCallback(async (docId: number, folderId: number | null) => {
    const doc = documents?.find(d => d.id === docId);
    const currentFolderId = doc?.folder_id ?? null;
    if (currentFolderId === folderId) return;
    try {
      await documentsAPI.update(docId, { folder_id: folderId === null ? 0 : folderId });
      mutate(); mutateFolders();
      showToast(folderId ? "Moved to folder" : "Removed from folder", "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setMenuOpenId(null);
  }, [documents, mutate, mutateFolders, showToast]);

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

  const handleToggleStar = useCallback(async (id: number) => {
    try { await documentsAPI.toggleStar(id); mutate(); }
    catch (err) { showToast((err as Error).message, "error"); }
  }, [mutate, showToast]);

  const handleRename = useCallback(async (id: number, title: string) => {
    try { await documentsAPI.update(id, { title }); mutate(); globalMutate(["document-preview", id]); }
    catch (err) { showToast((err as Error).message, "error"); }
  }, [mutate, showToast]);

  const [movingFolderId, setMovingFolderId] = useState<number | null>(null);
  const handleMoveFolder = useCallback((folderId: number) => { setMovingFolderId(folderId); }, []);
  const executeMoveFolder = useCallback(async (newParentId: number | null) => {
    if (movingFolderId === null) return;
    try {
      await foldersAPI.update(movingFolderId, { parent_id: newParentId });
      mutateFolders(); showToast("Folder moved", "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setMovingFolderId(null);
  }, [movingFolderId, mutateFolders, showToast]);

  const handleRenameTag = useCallback(async (oldName: string, newName: string) => {
    try { await documentsAPI.renameTag(oldName, newName); mutate(); mutateTags(); showToast(`Tag renamed to "${newName}"`, "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
  }, [mutate, mutateTags, showToast]);

  const handleDeleteTag = useCallback(async (tag: string) => {
    try { await documentsAPI.deleteTag(tag); mutate(); mutateTags(); setActiveTags(prev => prev.filter(t => t !== tag)); showToast(`Tag "${tag}" removed`, "success"); }
    catch (err) { showToast((err as Error).message, "error"); }
  }, [mutate, mutateTags, showToast]);
  const executeDeleteFolder = useCallback(async (folder: DocumentFolder) => {
    setConfirmLoading(true);
    try {
      await foldersAPI.delete(folder.id); mutateFolders();
      if (activeFolderId === folder.id) setActiveFolderId(null);
      mutate(); showToast("Folder deleted", "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setConfirmLoading(false);
    setConfirmAction(null);
  }, [mutateFolders, mutate, showToast, activeFolderId]);

  // --- Bulk actions ---
  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const restoring = isTrashTab;
    try {
      await documentsAPI.bulkUpdate({ ids, is_archived: !restoring });
      if (!restoring) ids.forEach(removeFromRecent);
      mutate(); mutateTrashCount(); setSelectedIds(new Set());
      showToast(restoring ? `${ids.length} document(s) restored` : `${ids.length} document(s) moved to trash`, "success");
    } catch (err) { showToast((err as Error).message, "error"); }
  }, [selectedIds, isTrashTab, mutate, mutateTrashCount, showToast]);
  handleBulkArchiveRef.current = handleBulkArchive;

  const handleBulkDelete = useCallback(() => {
    setConfirmAction({ type: "delete-bulk" });
  }, []);

  const executeBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setConfirmLoading(true);
    try {
      await Promise.all(ids.map((id) => documentsAPI.permanentDelete(id)));
      ids.forEach(removeFromRecent);
      mutate(); mutateTrashCount(); setSelectedIds(new Set());
      showToast(`${ids.length} document(s) deleted`, "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setConfirmLoading(false);
    setConfirmAction(null);
  }, [selectedIds, mutate, mutateTrashCount, showToast]);

  const handleEmptyTrash = useCallback(() => {
    if (!documents?.length) return;
    setConfirmAction({ type: "empty-trash" });
  }, [documents]);

  const executeEmptyTrash = useCallback(async () => {
    setConfirmLoading(true);
    try {
      const result = await documentsAPI.emptyTrash();
      mutate(); mutateTrashCount();
      showToast(`${result.deleted} document(s) permanently deleted`, "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setConfirmLoading(false);
    setConfirmAction(null);
  }, [mutate, mutateTrashCount, showToast]);

  const [bulkFolderPickerOpen, setBulkFolderPickerOpen] = useState(false);
  const handleBulkMoveToFolder = useCallback(() => {
    setBulkFolderPickerOpen(true);
  }, []);

  const executeBulkMove = useCallback(async (folderId: number | null) => {
    const ids = Array.from(selectedIds);
    try {
      // Backend treats folder_id=0 as "unset folder" (NULL), distinct from folder_id=null which means "no change"
      await documentsAPI.bulkUpdate({ ids, folder_id: folderId === null ? 0 : folderId });
      mutate(); setSelectedIds(new Set());
      showToast(`${ids.length} document(s) moved`, "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setBulkFolderPickerOpen(false);
  }, [selectedIds, mutate, showToast]);

  const [bulkTagPickerOpen, setBulkTagPickerOpen] = useState(false);
  const [bulkTagValue, setBulkTagValue] = useState("");
  const [bulkTagMode, setBulkTagMode] = useState<"add" | "remove">("add");
  const bulkFolderRef = useRef<HTMLDivElement>(null);
  const bulkTagRef = useRef<HTMLDivElement>(null);
  const moveFolderRef = useRef<HTMLDivElement>(null);
  useFocusTrap(bulkFolderPickerOpen, bulkFolderRef);
  useFocusTrap(bulkTagPickerOpen, bulkTagRef);
  useFocusTrap(movingFolderId !== null, moveFolderRef);
  const handleBulkAddTag = useCallback(() => {
    setBulkTagPickerOpen(true);
  }, []);

  const executeBulkAddTag = useCallback(async (tag: string) => {
    const ids = Array.from(selectedIds);
    try {
      const result = await documentsAPI.bulkUpdate({ ids, tags_add: [tag] });
      mutate(); mutateTags(); setSelectedIds(new Set());
      showToast(`Tag "${tag}" added to ${result.updated} document(s)`, "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setBulkTagPickerOpen(false);
    setBulkTagValue("");
  }, [selectedIds, mutate, mutateTags, showToast]);

  const executeBulkRemoveTag = useCallback(async (tag: string) => {
    const ids = Array.from(selectedIds);
    try {
      const result = await documentsAPI.bulkUpdate({ ids, tags_remove: [tag] });
      mutate(); mutateTags(); setSelectedIds(new Set());
      showToast(`Tag "${tag}" removed from ${result.updated} document(s)`, "success");
    } catch (err) { showToast((err as Error).message, "error"); }
    setBulkTagPickerOpen(false);
    setBulkTagValue("");
  }, [selectedIds, mutate, mutateTags, showToast]);

  const folderPath = useMemo(() => {
    if (!activeFolderId) return [];
    const path: typeof folders = [];
    let f = folders.find(x => x.id === activeFolderId);
    while (f) { path.unshift(f); f = f.parent_id ? folders.find(x => x.id === f!.parent_id) : undefined; }
    return path;
  }, [activeFolderId, folders]);

  // --- Drag-and-drop ---
  const dndEnabled = !isReadOnly && !isTrashTab && !isTemplatesTab;
  const { sensors, activeDragData, handleDragStart, handleDragEnd, handleDragCancel } = useDndDocuments({
    selectedIds,
    onMoveToFolder: handleMoveToFolder,
    onBulkMove: (folderId) => executeBulkMove(folderId),
    enabled: dndEnabled,
  });

  // Empty state text
  const emptyTitle = !documents?.length
    ? isTrashTab ? "Trash is empty"
    : activeTab === "recent" ? "No recently viewed documents"
    : activeTab === "mine" ? "No documents found"
    : isTemplatesTab ? (debouncedSearch ? "No matching templates" : "No templates yet")
    : (debouncedSearch || activeTags.length > 0 || activeFolderId ? "No matching documents" : "No documents yet")
    : "";
  const emptyMessage = !documents?.length
    ? isTrashTab ? "Documents you delete will appear here for recovery"
    : activeTab === "recent" ? "Documents you open will appear here"
    : activeTab === "mine" ? "Documents you create will appear here"
    : isTemplatesTab ? (debouncedSearch ? "Try adjusting your search or filters" : "Create your first template to get started")
    : (debouncedSearch || activeTags.length > 0 || activeFolderId ? "Try adjusting your search or filters" : "Create your first document to get started")
    : "";

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
        <div className="flex flex-1 min-h-0 bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm overflow-hidden">
        {/* Sidebar — desktop */}
        <FolderSidebar
          hidden={isTemplatesTab}
          folders={folders}
          allTags={tagNames}
          tagCounts={tagCounts}
          activeFolderId={activeFolderId}
          activeTags={activeTags}
          onSelectFolder={(id) => { if (isTrashTab) setActiveTab("all"); setActiveFolderId(id); }}
          onSelectTag={(tag) => { if (isTrashTab) setActiveTab("all"); setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]); }}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveFolder={handleMoveFolder}
          onRenameTag={handleRenameTag}
          onDeleteTag={handleDeleteTag}
          isReadOnly={isReadOnly}
          activeTab={activeTab}
          onStarredClick={() => setShowStarred(prev => !prev)}
          isStarredActive={showStarred}
          onTrashClick={() => setActiveTab("trash")}
          trashCount={trashCount}
        />

        {/* Mobile sidebar drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30 animate-backdrop-in" onClick={() => setMobileDrawerOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-[#1a1a1a] shadow-xl overflow-y-auto">
              <FolderSidebar
                mobile
                folders={folders}
                allTags={tagNames}
                tagCounts={tagCounts}
                activeFolderId={activeFolderId}
                activeTags={activeTags}
                onSelectFolder={(id) => { if (isTrashTab) setActiveTab("all"); setActiveFolderId(id); setMobileDrawerOpen(false); }}
                onSelectTag={(tag) => { if (isTrashTab) setActiveTab("all"); setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]); setMobileDrawerOpen(false); }}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
          onMoveFolder={handleMoveFolder}
                onRenameTag={handleRenameTag}
                onDeleteTag={handleDeleteTag}
                isReadOnly={isReadOnly}
                activeTab={activeTab}
                onStarredClick={() => setShowStarred(prev => !prev)}
          isStarredActive={showStarred}
          onTrashClick={() => { setActiveTab("trash"); setMobileDrawerOpen(false); }}
                trashCount={trashCount}
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
            sortIdx={sortIdx}
            onSortChange={(i) => { setSortIdx(i); localStorage.setItem("doc-sort-idx", String(i)); }}
            viewMode={viewMode}
            onViewModeChange={toggleViewMode}
            previewEnabled={previewEnabled}
            onTogglePreview={togglePreview}
            activeTags={activeTags}
            onClearTag={(tag) => tag ? setActiveTags(prev => prev.filter(t => t !== tag)) : setActiveTags([])}
            activeFolderId={activeFolderId}
            folderPath={folderPath}
            onClearFolder={(folderId) => setActiveFolderId(folderId ?? null)}
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

          {/* Trash banner */}
          {isTrashTab && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50/60 dark:bg-red-950/10 border-b border-red-200/50 dark:border-red-900/30 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Trash</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Items here can be restored or permanently deleted</p>
              </div>
              <div className="flex-1" />
              {(documents?.length ?? 0) > 0 && (
                <button onClick={handleEmptyTrash} className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors">
                  Empty Trash
                </button>
              )}
            </div>
          )}

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
                onRename={handleRename}
                onToggleStar={handleToggleStar}
                isTemplatesTab={isTemplatesTab}
                isTrashTab={isTrashTab}
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
                    return (
                      <DraggableCard
                        key={doc.id}
                        doc={doc}
                        selectedIds={selectedIds}
                        disabled={!dndEnabled}
                        onClick={() => handleDocClick(doc.id)}
                        className={cn(
                          "group relative rounded-xl border border-l-[3px] p-4 cursor-pointer card-hover active:scale-[0.98] active:shadow-none transition-shadow",
                          selectedIds.has(doc.id) && "ring-2 ring-[#a0704b]/50 ring-offset-1",
                          "border-l-[#a0704b]/40",
                          doc.is_archived && !isTrashTab
                            ? "border-dashed border-gray-300 dark:border-gray-600 opacity-60"
                            : doc.is_template
                            ? "border-purple-200 dark:border-purple-700 bg-purple-50/60 dark:bg-purple-950/20 border-l-purple-400"
                            : "border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#fef9f3] dark:bg-[#1a1a1a] shadow-[var(--shadow-paper-sm)] dark:shadow-none paper-texture"
                        )}
                      >
                        {/* Grid card checkbox */}
                        <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(doc.id)}
                            onChange={() => handleToggleSelect(doc.id)}
                            className={cn(
                              "w-3.5 h-3.5 rounded border-[#e8d4b8] dark:border-[#6b5a4a] accent-[#a0704b] transition-opacity",
                              selectedIds.has(doc.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}
                          />
                        </div>
                        <div className="flex items-center gap-2 mb-2">
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
                        <h3 title={doc.title} className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{doc.title}</h3>
                        {doc.content_preview && (
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 line-clamp-2 mt-0.5">{doc.content_preview}</p>
                        )}
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                          {doc.created_by_name}
                          {(isTrashTab ? doc.archived_at : doc.updated_at) && <> · {formatTimeAgo((isTrashTab ? doc.archived_at : doc.updated_at)!)}</>}
                        </p>
                        {doc.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {doc.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-medium", getTagColor(tag))}>{tag}</span>
                            ))}
                            {doc.tags.length > 3 && <span className="text-[9px] text-gray-400">+{doc.tags.length - 3}</span>}
                          </div>
                        )}
                      </DraggableCard>
                    );
                  })
                ) : (
                  <div className="col-span-full flex flex-col items-center py-20 text-center">
                    <div className={cn("animate-empty-float w-16 h-16 rounded-2xl flex items-center justify-center mb-4", isTrashTab ? "bg-red-50 dark:bg-red-950/20" : "bg-[#f5ede3] dark:bg-[#2d2618]")}>
                      {isTrashTab ? <Trash2 className="w-8 h-8 text-red-300 dark:text-red-800" /> : <FileText className="w-8 h-8 text-[#a0704b]/40 dark:text-[#cd853f]/30" />}
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
          onRename={handleRename}
          onToggleStar={handleToggleStar}
          onEditTags={setTagEditDocId}
        />
        </div>{/* end white card */}
        <DragOverlay dropAnimation={null}>
          {activeDragData && (
            <div className="px-3 py-2 bg-white dark:bg-[#1a1a1a] rounded-lg shadow-lg border border-[#a0704b]/40 text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2 pointer-events-none">
              <FileText className="w-4 h-4 text-[#a0704b]" />
              <span className="truncate max-w-[200px]">{activeDragData.docTitle}</span>
              {activeDragData.selectedIds.length > 1 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#a0704b] text-white text-[10px] font-bold">
                  {activeDragData.selectedIds.length}
                </span>
              )}
            </div>
          )}
        </DragOverlay>
        </DndContext>
      </PageTransition>

      {/* Modals */}
      {showCreateModal && (
        <CreateDocumentModal
          onClose={() => setShowCreateModal(false)}
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
            allTags={tagNames}
            onToggleTag={handleToggleTag}
            onCreateTag={handleCreateTag}
            onClose={() => setTagEditDocId(null)}
          />
        ) : null;
      })()}
      <ConfirmDialog
        isOpen={confirmAction !== null}
        onCancel={() => { setConfirmAction(null); setConfirmLoading(false); }}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === "empty-trash") executeEmptyTrash();
          else if (confirmAction.type === "delete-bulk") executeBulkDelete();
          else if (confirmAction.type === "delete-doc") executePermanentDelete(confirmAction.id);
          else executeDeleteFolder(confirmAction.folder);
        }}
        title={confirmAction?.type === "empty-trash"
          ? "Empty Trash"
          : confirmAction?.type === "delete-bulk"
          ? `Delete ${selectedIds.size} Document(s) Permanently`
          : confirmAction?.type === "delete-doc"
          ? `Delete "${confirmAction.title || "Untitled"}" Permanently`
          : "Delete Folder"}
        message={confirmAction?.type === "empty-trash"
          ? "Permanently delete all items in Trash? This cannot be undone."
          : confirmAction?.type === "delete-bulk"
          ? `Permanently delete ${selectedIds.size} document(s)? This cannot be undone.`
          : confirmAction?.type === "delete-doc"
          ? "This document and all its version history will be permanently deleted."
          : confirmAction?.type === "delete-folder"
          ? `Delete folder "${confirmAction.folder.name}"?`
          : ""}
        consequences={
          confirmAction?.type === "delete-folder" ? ["Documents inside will become unfiled"]
          : confirmAction?.type === "delete-doc" ? ["All version history will be lost", "Variant links to this document will be removed"]
          : (confirmAction?.type === "delete-bulk" || confirmAction?.type === "empty-trash") ? ["All version history will be lost", "This cannot be undone"]
          : undefined
        }
        confirmText="Delete Forever"
        variant="danger"
        loading={confirmLoading}
      />

      {/* Bulk move to folder picker */}
      {bulkFolderPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setBulkFolderPickerOpen(false)}>
          <div ref={bulkFolderRef} className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl p-5 w-72 max-h-80 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Move {selectedIds.size} document(s) to</h3>
            <div className="space-y-0.5">
              <button onClick={() => executeBulkMove(null)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors">
                <FolderOpen className="w-4 h-4 text-gray-400" /> No folder
              </button>
              {flatFolders.map(({ folder: f, depth }) => (
                <button key={f.id} onClick={() => executeBulkMove(f.id)} className="w-full flex items-center gap-2 pr-3 py-2 rounded-lg text-sm hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors" style={{ paddingLeft: `${12 + depth * 16}px` }}>
                  <FolderOpen className="w-4 h-4 text-[#a0704b]" /> {f.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk tag picker (add/remove) */}
      {bulkTagPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setBulkTagPickerOpen(false); setBulkTagValue(""); setBulkTagMode("add"); }}>
          <div ref={bulkTagRef} className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl p-5 w-72" onClick={(e) => e.stopPropagation()}>
            {/* Add / Remove tabs */}
            <div className="flex gap-1 mb-3 p-0.5 rounded-md bg-[#f5ede3]/80 dark:bg-[#2d2618]/60">
              {(["add", "remove"] as const).map((mode) => (
                <button key={mode} onClick={() => { setBulkTagMode(mode); setBulkTagValue(""); }}
                  className={cn("flex-1 px-2 py-1 text-[11px] font-medium rounded transition-all capitalize",
                    bulkTagMode === mode ? "bg-white dark:bg-[#1a1a1a] shadow-sm text-[#a0704b] dark:text-[#cd853f]" : "text-gray-500 dark:text-gray-400"
                  )}>{mode} tag</button>
              ))}
            </div>

            {bulkTagMode === "add" ? (
              <>
                <input autoFocus type="text" placeholder="Type a tag name..."
                  value={bulkTagValue} onChange={(e) => setBulkTagValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && bulkTagValue.trim()) executeBulkAddTag(bulkTagValue.trim()); if (e.key === "Escape") { setBulkTagPickerOpen(false); setBulkTagValue(""); } }}
                  className="w-full px-3 py-2 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#fef9f3] dark:bg-[#1a1a1a] text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/40"
                />
                {tagNames.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tagNames.filter(t => !bulkTagValue || t.toLowerCase().includes(bulkTagValue.toLowerCase())).slice(0, 20).map((tag) => (
                      <button key={tag} onClick={() => executeBulkAddTag(tag)} className={cn("px-2 py-0.5 rounded-full text-xs font-medium transition-colors hover:opacity-80", getTagColor(tag))}>{tag}</button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-2">Click a tag to remove it from {selectedIds.size} document(s)</p>
                {(() => {
                  // Collect tags from selected docs
                  const selectedDocs = (documents ?? []).filter(d => selectedIds.has(d.id));
                  const tagSet = new Set(selectedDocs.flatMap(d => d.tags || []));
                  const tags = [...tagSet].sort();
                  return tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <button key={tag} onClick={() => executeBulkRemoveTag(tag)} className={cn("px-2 py-0.5 rounded-full text-xs font-medium transition-colors hover:opacity-80 hover:line-through", getTagColor(tag))}>{tag}</button>
                      ))}
                    </div>
                  ) : <p className="text-xs text-gray-400 italic">Selected documents have no tags</p>;
                })()}
              </>
            )}
          </div>
        </div>
      )}
      {/* Keyboard shortcut hints */}
      {!showShortcutHints && (
        <button onClick={() => setShowShortcutHints(true)}
          className="hidden md:flex fixed right-4 bottom-4 z-40 w-8 h-8 rounded-full bg-[#fef9f3] dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#8b6f47] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shadow-md items-center justify-center"
          title="Keyboard shortcuts (?)" aria-label="Show keyboard shortcuts"
        >
          <span className="text-sm font-mono">?</span>
        </button>
      )}
      <AnimatePresence>
        {showShortcutHints && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg border bg-[#fef9f3] dark:bg-[#2d2618] border-[#d4a574] dark:border-[#8b6f47] text-sm w-64"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="font-semibold text-[#5c4033] dark:text-[#d4a574]">Keyboard Shortcuts</span>
              <button onClick={() => setShowShortcutHints(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-gray-600 dark:text-gray-300">
              {[
                ["↑ ↓", "Navigate documents"],
                ["Enter", "Open document"],
                ["Esc", "Clear selection"],
                ["/", "Focus search"],
                ["N", "New document"],
                ["Del", "Trash selected"],
                ["?", "Toggle this panel"],
              ].map(([key, desc]) => (
                <div key={key} className="flex justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border text-xs font-mono">{key}</kbd>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Folder move picker */}
      {movingFolderId !== null && (() => {
        // Precompute descendants to exclude (self + children)
        const excludeIds = new Set<number>();
        const collectDesc = (id: number) => { excludeIds.add(id); folders.filter(x => x.parent_id === id).forEach(x => collectDesc(x.id)); };
        collectDesc(movingFolderId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMovingFolderId(null)}>
            <div ref={moveFolderRef} className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl p-5 w-72 max-h-80 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Move folder to</h3>
              <div className="space-y-0.5">
                <button onClick={() => executeMoveFolder(null)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors">
                  <FolderOpen className="w-4 h-4 text-gray-400" /> Root (no parent)
                </button>
                {flatFolders.filter(({ folder: f }) => !excludeIds.has(f.id)).map(({ folder: f, depth }) => (
                  <button key={f.id} onClick={() => executeMoveFolder(f.id)} className="w-full flex items-center gap-2 pr-3 py-2 rounded-lg text-sm hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors" style={{ paddingLeft: `${12 + depth * 16}px` }}>
                    <FolderOpen className="w-4 h-4 text-[#a0704b]" /> {f.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </DeskSurface>
  );
}
