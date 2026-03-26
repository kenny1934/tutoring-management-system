"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2, ScanLine, CheckCircle2, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { documentsAPI } from "@/lib/document-api";
import { useToast } from "@/contexts/ToastContext";
import { Modal } from "@/components/ui/modal";
import { FolderTreeModal } from "@/components/ui/folder-tree-modal";

interface ImportWorksheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful import (to revalidate lists, etc.) */
  onSuccess?: () => void;
  /** Pre-loaded PDF from courseware browse (skips upload step) */
  preloadedPdf?: { blob: Blob; filename: string; path?: string } | null;
  /** Default folder to import into */
  defaultFolderId?: number | null;
}

type Step = "upload" | "options" | "processing" | "done";

export default function ImportWorksheetModal({
  isOpen,
  onClose,
  onSuccess,
  preloadedPdf,
  defaultFolderId,
}: ImportWorksheetModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [removeHandwriting, setRemoveHandwriting] = useState(true);
  const [error, setError] = useState("");
  const [createdDocId, setCreatedDocId] = useState<number | null>(null);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [sourcePath, setSourcePath] = useState("");
  const [usage, setUsage] = useState<{ input_tokens: number; output_tokens: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError("");
      setCreatedDocId(null);
      setRemoveHandwriting(true);
      setUsage(null);
      if (preloadedPdf) {
        const f = new File([preloadedPdf.blob], preloadedPdf.filename, { type: "application/pdf" });
        setFile(f);
        setTitle(preloadedPdf.filename.replace(/\.pdf$/i, ""));
        setSourcePath(preloadedPdf.path || "");
        setStep("options");
      } else {
        setFile(null);
        setTitle("");
        setSourcePath("");
        setStep("upload");
      }
    }
  }, [isOpen, preloadedPdf]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported");
      return;
    }
    if (selectedFile.size > 25 * 1024 * 1024) {
      setError("PDF too large (max 25MB)");
      return;
    }
    setFile(selectedFile);
    setTitle(selectedFile.name.replace(/\.pdf$/i, ""));
    setError("");
    setStep("options");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleImport = useCallback(async () => {
    if (!file) return;
    setStep("processing");
    setError("");

    try {
      const doc = await documentsAPI.importWorksheet(file, {
        removeHandwriting,
        title: title.trim() || undefined,
        folderId: defaultFolderId ?? undefined,
        sourcePath: sourcePath || undefined,
      });
      setCreatedDocId(doc.id);
      setUsage(doc.usage ?? null);
      setStep("done");
      showToast("Worksheet imported successfully", "success");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("options");
    }
  }, [file, removeHandwriting, title, defaultFolderId, sourcePath, showToast, onSuccess]);

  const handleOpenEditor = useCallback(() => {
    if (createdDocId) {
      router.push(`/documents/${createdDocId}`);
      onClose();
    }
  }, [createdDocId, router, onClose]);

  const isProcessing = step === "processing";

  const modalTitle = (
    <span className="flex items-center gap-2">
      <ScanLine className="w-5 h-5 text-blue-600 dark:text-blue-400" />
      Import Worksheet
    </span>
  );

  const footer = step === "options" && file ? (
    <div className="flex gap-3 w-full">
      <button
        onClick={() => {
          if (preloadedPdf) { onClose(); } else { setStep("upload"); setFile(null); }
        }}
        className="flex-1 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors rounded-lg border border-gray-200 dark:border-gray-700/30"
      >
        {preloadedPdf ? "Cancel" : "Back"}
      </button>
      <button
        onClick={handleImport}
        className="flex-1 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors shadow-sm"
      >
        Import
      </button>
    </div>
  ) : step === "done" ? (
    <div className="flex flex-col gap-2 w-full">
      <button
        onClick={handleOpenEditor}
        className="w-full py-2.5 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors shadow-sm"
      >
        Open in Editor
      </button>
      <button
        onClick={onClose}
        className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        Close
      </button>
    </div>
  ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      size="sm"
      persistent={isProcessing}
      footer={footer}
    >
      {/* Upload step */}
      {step === "upload" && (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Select a scanned math worksheet PDF. It will be processed with AI to extract text and equations.
          </p>

          {/* Primary: Browse courseware files */}
          <button
            onClick={() => setShowFileBrowser(true)}
            className={cn(
              "w-full flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors text-left",
              "border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-[#a0704b] dark:hover:border-[#cd853f]",
              "hover:bg-[#f5ede3]/50 dark:hover:bg-[#2d2618]/50"
            )}
          >
            <FolderOpen className="w-8 h-8 text-[#a0704b] dark:text-[#cd853f] shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Browse courseware files</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Select from your worksheet folders</p>
            </div>
          </button>

          {/* Secondary: Drag-and-drop / file picker */}
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700/30" /></div>
            <div className="relative flex justify-center"><span className="px-2 text-xs text-gray-400 dark:text-gray-500 bg-[#fef9f3] dark:bg-[#2d2618]">or</span></div>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-2 p-5 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
              "border-gray-200 dark:border-gray-700/30 hover:border-[#a0704b] dark:hover:border-[#cd853f]",
              "hover:bg-[#f5ede3]/50 dark:hover:bg-[#2d2618]/50"
            )}
          >
            <Upload className="w-6 h-6 text-gray-400 dark:text-gray-500" />
            <div className="text-center">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Drop a PDF here or click to upload</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Max 25MB</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
              e.target.value = "";
            }}
          />
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

          <FolderTreeModal
            isOpen={showFileBrowser}
            onClose={() => setShowFileBrowser(false)}
            onFileSelected={(path) => setSourcePath(path)}
            onFileBlobSelected={(blob, filename) => {
              setShowFileBrowser(false);
              handleFileSelect(new File([blob], filename, { type: "application/pdf" }));
            }}
          />
        </>
      )}

      {/* Options step */}
      {step === "options" && file && (
        <>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700/30 mb-4">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document title"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/30"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer" onClick={() => setRemoveHandwriting(v => !v)}>
              <div className={cn(
                "relative w-10 h-5 rounded-full transition-colors",
                removeHandwriting ? "bg-[#a0704b]" : "bg-gray-300 dark:bg-gray-600"
              )}>
                <div className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                  removeHandwriting ? "translate-x-5" : "translate-x-0.5"
                )} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Remove handwriting</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Clean colored ink and pencil marks before OCR</p>
              </div>
            </label>
          </div>

          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        </>
      )}

      {/* Processing step */}
      {step === "processing" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="w-10 h-10 text-[#a0704b] dark:text-[#cd853f] animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Processing worksheet...</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              AI is extracting text and equations. This may take 15-30 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Done step */}
      {step === "done" && (
        <div className="flex flex-col items-center gap-4 py-6">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Worksheet imported!</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Open in the editor to review and refine the OCR result.
            </p>
          </div>
          {usage && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-white/5 rounded px-3 py-1.5">
              AI usage: {usage.input_tokens.toLocaleString()} input + {usage.output_tokens.toLocaleString()} output tokens
              {" "}(~${((usage.input_tokens * 0.25 + usage.output_tokens * 1.5) / 1_000_000).toFixed(4)})
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
