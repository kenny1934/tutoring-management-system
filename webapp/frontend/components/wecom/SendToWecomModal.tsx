"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import WecomRichEditor from "./WecomRichEditor";
import { htmlToWecomMarkdown } from "./htmlToWecomMarkdown";
import type { WecomWebhook, WecomSendResponse } from "@/types";
import type { Editor } from "@tiptap/react";
import {
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";

// Message templates for quick insertion
const MESSAGE_TEMPLATES = [
  {
    label: "Fee Reminder",
    content:
      "Reminder: Please check the latest fee messages and follow up with parents for outstanding payments.",
  },
  {
    label: "Attendance Alert",
    content:
      "Reminder: Please mark attendance for all completed sessions today.",
  },
  {
    label: "Custom Message",
    content: "",
  },
];

interface SendToWecomModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill the message content */
  initialContent?: string;
  /** Pre-select the webhook target */
  initialWebhook?: string;
}

export default function SendToWecomModal({
  isOpen,
  onClose,
  initialContent = "",
  initialWebhook,
}: SendToWecomModalProps) {
  const [webhooks, setWebhooks] = useState<WecomWebhook[]>([]);
  const [selectedWebhook, setSelectedWebhook] = useState<string>("");
  const [editorHtml, setEditorHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<WecomSendResponse | null>(null);
  const [loadingWebhooks, setLoadingWebhooks] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Image attachment state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tiptap editor instance ref
  const editorRef = useRef<Editor | null>(null);

  // Convert HTML to WeCom markdown for character count and sending
  const markdownContent = useMemo(() => htmlToWecomMarkdown(editorHtml), [editorHtml]);

  // Load webhooks on open
  useEffect(() => {
    if (!isOpen) return;

    setLoadingWebhooks(true);
    setError(null);
    setResult(null);
    api.wecom
      .getWebhooks()
      .then((data) => {
        const active = data.filter(
          (w) => w.is_active && w.webhook_url_configured
        );
        setWebhooks(active);
        if (initialWebhook) {
          setSelectedWebhook(initialWebhook);
        } else if (active.length > 0) {
          setSelectedWebhook(active[0].webhook_name);
        }
      })
      .catch(() => {
        setError("Failed to load webhooks");
      })
      .finally(() => setLoadingWebhooks(false));
  }, [isOpen, initialWebhook]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setImageFile(null);
      setImagePreview(null);
      setEditorHtml("");
      // Reset editor content (editor handles initial content via its own prop)
      if (editorRef.current) {
        const html = initialContent
          ? (initialContent.trim().startsWith("<") ? initialContent : `<p>${initialContent}</p>`)
          : "";
        editorRef.current.commands.setContent(html);
      }
    }
  }, [isOpen, initialContent]);

  // Clean up image preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
    },
    []
  );

  const handleImageSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];

      if (!file.type.startsWith("image/")) {
        setError("Please select an image file (JPG, PNG)");
        return;
      }

      // Clean up previous preview
      if (imagePreview) URL.revokeObjectURL(imagePreview);

      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setError(null);

      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [imagePreview]
  );

  const handleRemoveImage = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  }, [imagePreview]);

  const handleSend = useCallback(async () => {
    if (!selectedWebhook) return;
    if (!markdownContent && !imageFile) return;

    setSending(true);
    setResult(null);
    setError(null);

    try {
      let lastResponse: WecomSendResponse | null = null;

      // Send text message first (if any)
      if (markdownContent) {
        lastResponse = await api.wecom.sendMessage({
          webhook_name: selectedWebhook,
          msg_type: "markdown",
          content: markdownContent,
        });
        if (!lastResponse.success) {
          setResult(lastResponse);
          return;
        }
      }

      // Send image (if any)
      if (imageFile) {
        lastResponse = await api.wecom.sendImage(selectedWebhook, imageFile);
      }

      if (lastResponse) {
        setResult(lastResponse);
        if (lastResponse.success) {
          setTimeout(() => {
            onClose();
          }, 2000);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [selectedWebhook, markdownContent, imageFile, onClose]);

  const handleTemplateSelect = (
    template: (typeof MESSAGE_TEMPLATES)[number]
  ) => {
    if (editorRef.current) {
      if (template.content) {
        editorRef.current.commands.setContent(`<p>${template.content}</p>`);
      } else {
        // "Custom Message" template clears the editor
        editorRef.current.commands.clearContent();
      }
      editorRef.current.commands.focus();
    }
  };

  const selectedWebhookInfo = webhooks.find(
    (w) => w.webhook_name === selectedWebhook
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send to WeCom" size="lg">
      <div className="space-y-4">
        {/* Webhook selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Target Group
          </label>
          {loadingWebhooks ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading webhooks...
            </div>
          ) : webhooks.length === 0 ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              No configured webhooks available. Ask an admin to set up WeCom
              webhook URLs.
            </p>
          ) : (
            <select
              value={selectedWebhook}
              onChange={(e) => setSelectedWebhook(e.target.value)}
              className="w-full px-3 py-2 border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white"
            >
              {webhooks.map((wh) => (
                <option key={wh.webhook_name} value={wh.webhook_name}>
                  {wh.target_description || wh.webhook_name}
                </option>
              ))}
            </select>
          )}
          {selectedWebhookInfo && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {selectedWebhookInfo.total_messages_sent} messages sent
              {selectedWebhookInfo.last_used_at &&
                ` | Last used: ${new Date(selectedWebhookInfo.last_used_at).toLocaleDateString()}`}
            </p>
          )}
        </div>

        {/* Templates */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Templates
          </label>
          <div className="flex flex-wrap gap-2">
            {MESSAGE_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.label}
                onClick={() => handleTemplateSelect(tmpl)}
                className="px-3 py-1 text-xs rounded-full border border-[#d4a574] dark:border-[#8b6f47] text-[#a0704b] dark:text-[#c49a6c] hover:bg-[#f5e6d3] dark:hover:bg-[#3d2e1e] transition-colors"
              >
                {tmpl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rich text editor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Message
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleImageSelect(e.target.files)}
            className="hidden"
          />
          <WecomRichEditor
            onEditorReady={handleEditorReady}
            onUpdate={setEditorHtml}
            onAttachImage={() => fileInputRef.current?.click()}
            initialContent={initialContent ? `<p>${initialContent}</p>` : ""}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {markdownContent.length} / 5000 characters
          </p>
        </div>

        {/* Image preview */}
        {imagePreview && imageFile && (
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Attachment preview"
              className="max-h-32 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]"
            />
            <button
              onClick={handleRemoveImage}
              className="absolute -top-2 -right-2 p-0.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
              title="Remove image"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {imageFile.name} ({(imageFile.size / 1024).toFixed(0)}KB)
            </p>
          </div>
        )}

        {/* Result feedback */}
        {result && (
          <div
            className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              result.success
                ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
            }`}
          >
            {result.success ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{result.message}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
        <Button variant="outline" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button
          onClick={handleSend}
          disabled={
            sending ||
            !selectedWebhook ||
            (!markdownContent && !imageFile) ||
            webhooks.length === 0
          }
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send to WeCom
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
}
