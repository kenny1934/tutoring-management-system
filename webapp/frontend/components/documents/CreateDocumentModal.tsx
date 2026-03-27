"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { FileText, Stamp } from "lucide-react";
import { documentsAPI } from "@/lib/document-api";
import { formatTimeAgo } from "@/lib/formatters";
import { DOC_TYPE_CONFIG } from "@/lib/doc-type-config";
import { cn } from "@/lib/utils";
import type { Document, DocType } from "@/types";

export interface CreateDocumentModalProps {
  createStep: { step: "type" } | { step: "template"; docType: DocType };
  setCreateStep: (step: { step: "type" } | { step: "template"; docType: DocType }) => void;
  onClose: () => void;
  onCreate: (docType: DocType, templateDoc?: Document) => void;
}

export default function CreateDocumentModal({ createStep, setCreateStep, onClose, onCreate }: CreateDocumentModalProps) {
  const [creating, setCreating] = useState(false);
  const { data: templates, isLoading: loadingTemplates } = useSWR(
    createStep.step === "template" ? ["templates-for-picker", createStep.docType] : null,
    () => documentsAPI.list({ is_template: true, doc_type: createStep.step === "template" ? createStep.docType : undefined, limit: 50 }),
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
              {(Object.entries(DOC_TYPE_CONFIG) as [DocType, typeof DOC_TYPE_CONFIG[DocType]][]).map(([type, info]) => {
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
                      <p className="text-xs text-gray-500 dark:text-gray-400">{info.desc}</p>
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
                        {tpl.created_by_name ? `by ${tpl.created_by_name}` : DOC_TYPE_CONFIG[tpl.doc_type as DocType]?.label ?? tpl.doc_type}
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
