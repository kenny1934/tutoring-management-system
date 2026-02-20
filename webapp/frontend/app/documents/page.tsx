"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, FileText, BookOpen, Search, Loader2, MoreVertical, Trash2, ArchiveRestore, Archive, Copy, Lock } from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { usePageTitle } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { documentsAPI } from "@/lib/document-api";
import { cn } from "@/lib/utils";
import type { Document, DocType } from "@/types";

const DOC_TYPE_LABELS: Record<DocType, { label: string; icon: typeof FileText; color: string }> = {
  worksheet: { label: "Worksheet", icon: FileText, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  lesson_plan: { label: "Lesson Plan", icon: BookOpen, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
};

export default function DocumentsPage() {
  usePageTitle("Documents");
  const router = useRouter();
  const { showToast } = useToast();
  const [filterType, setFilterType] = useState<DocType | "all">("all");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: documents, isLoading, mutate } = useSWR(
    ["documents", filterType, search, showArchived],
    () => documentsAPI.list({
      doc_type: filterType === "all" ? undefined : filterType,
      search: search || undefined,
      include_archived: showArchived || undefined,
    }),
    { revalidateOnFocus: false }
  );

  const handleCreate = useCallback(async (docType: DocType) => {
    try {
      const doc = await documentsAPI.create({ title: "Untitled Document", doc_type: docType });
      setShowCreateModal(false);
      router.push(`/documents/${doc.id}`);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }, [router, showToast]);

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

  const handlePermanentDelete = useCallback(async (id: number) => {
    if (!window.confirm("Permanently delete this document? This cannot be undone.")) return;
    try {
      await documentsAPI.permanentDelete(id);
      mutate();
      showToast("Document permanently deleted", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
    setMenuOpenId(null);
  }, [mutate, showToast]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <DeskSurface>
      <PageTransition className="p-4 sm:p-6 max-w-6xl mx-auto">
        {/* Header + Filters card */}
        <div className="bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm rounded-lg px-4 sm:px-5 py-4 mb-4 border border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="w-7 h-7 text-[#a0704b] dark:text-[#cd853f]" />
                Documents
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Beta
                </span>
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Create and edit worksheets, exams, and lesson plans
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover transition-colors text-sm font-medium shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Document
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
          <div className="relative" style={{ flex: "1 1 0", maxWidth: "20rem" }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-white dark:bg-[#1a1a1a] text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/40"
            />
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
          </div>
        </div>

        {/* Document Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#a0704b]" />
          </div>
        ) : !documents?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
            <FileText className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">No documents yet</p>
            <p className="text-sm mt-1">Create your first document to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => {
              const typeInfo = DOC_TYPE_LABELS[doc.doc_type as DocType];
              const Icon = typeInfo?.icon ?? FileText;
              return (
                <div
                  key={doc.id}
                  onClick={() => router.push(`/documents/${doc.id}`)}
                  className={cn(
                    "relative group bg-white dark:bg-[#1a1a1a] border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all",
                    doc.is_archived
                      ? "border-dashed border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 opacity-60"
                      : "border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-[#a0704b]/50"
                  )}
                >
                  {/* Type badge */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", typeInfo?.color)}>
                      <Icon className="w-3 h-3" />
                      {typeInfo?.label}
                    </span>
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === doc.id ? null : doc.id); }}
                        className="p-1 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      </button>
                      {menuOpenId === doc.id && (
                        <div className="absolute right-0 top-7 z-10 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg py-1" style={{ width: "9rem" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDuplicate(doc.id); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Duplicate
                          </button>
                          {doc.is_archived ? (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleUnarchive(doc.id); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[#a0704b] hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                              >
                                <ArchiveRestore className="w-3.5 h-3.5" />
                                Restore
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handlePermanentDelete(doc.id); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete Permanently
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleArchive(doc.id); }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Archive
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
                    {doc.title}
                  </h3>

                  {/* Meta */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{doc.created_by_name} &middot; {formatDate(doc.updated_at)}</span>
                    {doc.locked_by && (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400" title={`Locked by ${doc.locked_by_name}`}>
                        <Lock className="w-3 h-3" />
                        <span className="truncate max-w-[5rem]">{doc.locked_by_name}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreateModal(false)}>
            <div
              className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl p-6"
              style={{ width: "24rem", maxWidth: "calc(100vw - 2rem)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">New Document</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose a document type:</p>
              <div className="flex flex-col gap-3">
                {(Object.entries(DOC_TYPE_LABELS) as [DocType, typeof DOC_TYPE_LABELS[DocType]][]).map(([type, info]) => {
                  const Icon = info.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => handleCreate(type)}
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
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-full mt-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </PageTransition>
    </DeskSurface>
  );
}
