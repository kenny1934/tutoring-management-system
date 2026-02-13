"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Bug, Lightbulb, MessageSquare, Send, Loader2, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { messagesAPI, tutorsAPI } from "@/lib/api";
import type { MessageCreate } from "@/types";
import InboxRichEditor from "@/components/inbox/InboxRichEditor";

type FeedbackType = "Bug Report" | "Feature Request" | "Suggestion";

const FEEDBACK_TYPES: { type: FeedbackType; icon: typeof Bug; color: string }[] = [
  { type: "Bug Report", icon: Bug, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 ring-red-300 dark:ring-red-700" },
  { type: "Feature Request", icon: Lightbulb, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 ring-amber-300 dark:ring-amber-700" },
  { type: "Suggestion", icon: MessageSquare, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-blue-300 dark:ring-blue-700" },
];

export function FeedbackPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("Bug Report");
  const [messageHtml, setMessageHtml] = useState("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<{ clearContent: () => void } | null>(null);

  const { user } = useAuth();
  const { showToast } = useToast();

  // Listen for custom event to open the panel
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener("open-feedback", handler);
    return () => window.removeEventListener("open-feedback", handler);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // Reset form after close animation
    setTimeout(() => {
      setFeedbackType("Bug Report");
      setMessageHtml("");
      setUploadedImages([]);
      editorRef.current?.clearContent();
    }, 200);
  }, []);

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user?.id) return;

    setIsUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const result = await messagesAPI.uploadImage(file, user.id);
        newUrls.push(result.url);
      }
      setUploadedImages((prev) => [...prev, ...newUrls]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to upload image", "error");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!user?.id) return;

    // Check if there's actual content (not just empty tags)
    const textContent = messageHtml.replace(/<[^>]*>/g, "").trim();
    if (!textContent && uploadedImages.length === 0) {
      showToast("Please describe your feedback", "error");
      return;
    }

    setIsSending(true);
    try {
      // Send feedback to Super Admin(s) only
      const allTutors = await tutorsAPI.getAll();
      const superAdmins = allTutors.filter(t => t.role === "Super Admin");

      const sendData: MessageCreate = {
        subject: `[${feedbackType}]`,
        message: messageHtml,
        category: "Feedback",
        image_attachments: uploadedImages.length > 0 ? uploadedImages : undefined,
      };

      if (superAdmins.length === 1) {
        sendData.to_tutor_id = superAdmins[0].id;
      } else if (superAdmins.length >= 2) {
        sendData.to_tutor_ids = superAdmins.map(t => t.id);
      }

      await messagesAPI.create(sendData, user.id);
      showToast("Feedback sent! Thank you.", "success");
      handleClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to send feedback", "error");
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[9998] animate-in fade-in duration-200"
        onClick={handleClose}
      />
      {/* Panel */}
      <div
        className={cn(
          "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-[calc(100vw-2rem)] max-w-[520px] rounded-2xl shadow-2xl z-[9999]",
          "bg-[rgba(254,249,243,0.98)] dark:bg-[rgba(45,38,24,0.98)]",
          "border border-white/20 dark:border-white/10",
          "animate-in zoom-in-95 fade-in duration-200",
          "flex flex-col max-h-[85vh]"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-foreground">Send Feedback</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-foreground/50" />
          </button>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-5 pt-1 pb-5 space-y-4">
          {/* Type chips */}
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_TYPES.map(({ type, icon: Icon, color }) => (
              <button
                key={type}
                onClick={() => setFeedbackType(type)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                  feedbackType === type
                    ? cn(color, "ring-2")
                    : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {type}
              </button>
            ))}
          </div>

          {/* Rich text editor */}
          <InboxRichEditor
            onEditorReady={(editor) => {
              editorRef.current = {
                clearContent: () => editor.commands.clearContent(),
              };
            }}
            onUpdate={setMessageHtml}
            onAttachImage={() => fileInputRef.current?.click()}
            placeholder="Describe your feedback..."
            minHeight="120px"
          />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleImageUpload(e.target.files)}
            className="hidden"
          />

          {/* Uploaded images preview */}
          {uploadedImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {uploadedImages.map((url, idx) => (
                <div key={url} className="relative group">
                  <img
                    src={url}
                    alt={`Attachment ${idx + 1}`}
                    className="h-16 w-16 object-cover rounded-lg border border-foreground/10"
                  />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {isUploading && (
                <div className="h-16 w-16 rounded-lg border border-dashed border-foreground/20 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end pt-1">
            <button
              onClick={handleSubmit}
              disabled={isSending}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Feedback
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
