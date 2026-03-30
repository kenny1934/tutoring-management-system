"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { FileText, Stamp } from "lucide-react";
import { documentsAPI } from "@/lib/document-api";
import { formatTimeAgo } from "@/lib/formatters";
import type { Document } from "@/types";

export interface CreateDocumentModalProps {
  onClose: () => void;
  onCreate: (templateDoc?: Document) => void;
}

export default function CreateDocumentModal({ onClose, onCreate }: CreateDocumentModalProps) {
  const [creating, setCreating] = useState(false);
  const { data: templates, isLoading: loadingTemplates } = useSWR(
    "templates-for-picker",
    () => documentsAPI.list({ is_template: true, limit: 50 }),
    { revalidateOnFocus: false }
  );

  const handlePickTemplate = useCallback(async (tplId: number) => {
    setCreating(true);
    try {
      const fullDoc = await documentsAPI.get(tplId);
      onCreate(fullDoc);
    } catch {
      onCreate();
    } finally {
      setCreating(false);
    }
  }, [onCreate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl p-6"
        style={{ width: "24rem", maxWidth: "calc(100vw - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">New Document</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Start with a blank page or pick a template:
        </p>
        <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
          <button
            disabled={creating}
            onClick={() => onCreate()}
            className="flex items-center gap-3 p-3 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-[#a0704b]/50 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-all text-left disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Blank Document</p>
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
                onClick={() => handlePickTemplate(tpl.id)}
                className="flex items-center gap-3 p-3 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-[#a0704b]/50 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-all text-left disabled:opacity-50"
              >
                <div className="p-2 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                  <Stamp className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{tpl.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {tpl.created_by_name ? `by ${tpl.created_by_name}` : "Template"}
                    {tpl.updated_at ? ` · ${formatTimeAgo(tpl.updated_at)}` : ""}
                  </p>
                </div>
              </button>
            ))
          ) : null}
        </div>
        <button
          onClick={onClose}
          className="w-full mt-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
