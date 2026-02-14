"use client";

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Send, Loader2, X, PenSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { isHtmlEmpty } from "@/lib/html-utils";
import { messagesAPI } from "@/lib/api";
import { saveReplyDraft, loadReplyDraft, clearReplyDraft, isReplyDraftEmpty } from "@/lib/inbox-drafts";
import InboxRichEditor from "@/components/inbox/InboxRichEditor";
import type { MentionUser } from "@/components/inbox/InboxRichEditor";

export interface ReplyComposerHandle {
  insertContent: (html: string) => void;
  restoreContent: (text: string, images: string[]) => void;
}

interface ReplyComposerProps {
  threadId: number;
  currentTutorId: number;
  mentionUsers: MentionUser[];
  isMobile: boolean;
  onSend: (text: string, images: string[]) => Promise<void>;
  onOpenFullEditor: () => void;
  onDraftChange?: () => void;
}

const ReplyComposer = forwardRef<ReplyComposerHandle, ReplyComposerProps>(function ReplyComposer(
  { threadId, currentTutorId, mentionUsers, isMobile, onSend, onOpenFullEditor, onDraftChange },
  ref
) {
  const initialDraft = useRef(loadReplyDraft(threadId));
  const [replyText, setReplyText] = useState(initialDraft.current?.message || "");
  const [replyImages, setReplyImages] = useState<string[]>(initialDraft.current?.images || []);
  const [isReplySending, setIsReplySending] = useState(false);
  const [isReplyUploading, setIsReplyUploading] = useState(false);
  const [replyEditorKey, setReplyEditorKey] = useState(0);
  const [isReplyDragging, setIsReplyDragging] = useState(false);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<{ focus: () => void; insertContent: (html: string) => void } | null>(null);

  const isReplyEmpty = isHtmlEmpty(replyText);

  // Expose imperative methods to parent
  useImperativeHandle(ref, () => ({
    insertContent: (html: string) => {
      editorRef.current?.insertContent(html);
    },
    restoreContent: (text: string, images: string[]) => {
      initialDraft.current = { message: text, images, savedAt: Date.now() };
      setReplyText(text);
      setReplyImages([...images]);
      setReplyEditorKey(prev => prev + 1);
    },
  }), []);

  // Load draft and reset editor when switching threads
  useEffect(() => {
    const draft = loadReplyDraft(threadId);
    initialDraft.current = draft;
    setReplyText(draft?.message || "");
    setReplyImages(draft?.images || []);
    setReplyEditorKey(prev => prev + 1);
  }, [threadId]);

  // Auto-save reply draft on content change
  useEffect(() => {
    if (isReplyDraftEmpty(replyText) && replyImages.length === 0) {
      clearReplyDraft(threadId);
      onDraftChange?.();
    } else if (!isReplyDraftEmpty(replyText) || replyImages.length > 0) {
      saveReplyDraft(threadId, { message: replyText, images: replyImages, savedAt: Date.now() });
      onDraftChange?.();
    }
  }, [replyText, replyImages, threadId, onDraftChange]);

  const handleReplyImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsReplyUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const result = await messagesAPI.uploadImage(file, currentTutorId);
        setReplyImages(prev => [...prev, result.url]);
      }
    } catch (error) {
      console.error('Image upload failed:', error);
    } finally {
      setIsReplyUploading(false);
      if (replyFileInputRef.current) replyFileInputRef.current.value = '';
    }
  };

  const handleSendReply = useCallback(async () => {
    if ((isReplyEmpty && replyImages.length === 0) || isReplySending) return;
    setIsReplySending(true);

    const text = replyText;
    const images = [...replyImages];

    // Clear editor immediately for snappy feel
    setReplyText("");
    setReplyImages([]);
    setReplyEditorKey(prev => prev + 1);
    clearReplyDraft(threadId);

    try {
      await onSend(text, images);
    } finally {
      setIsReplySending(false);
    }
  }, [isReplyEmpty, replyImages, isReplySending, replyText, threadId, onSend]);

  return (
    <div
      className={cn(
        "flex-shrink-0 p-3 relative",
        isReplyDragging && "ring-2 ring-inset ring-blue-400 bg-blue-50/30 dark:bg-blue-900/10"
      )}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          handleSendReply();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsReplyDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsReplyDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsReplyDragging(false);
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          handleReplyImageUpload(files);
        }
      }}
    >
      {isReplyDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50/60 dark:bg-blue-900/20 rounded-lg z-10 pointer-events-none">
          <span className="text-sm font-medium text-blue-500 dark:text-blue-400">Drop images here</span>
        </div>
      )}
      <InboxRichEditor
        key={replyEditorKey}
        onEditorReady={(editor) => {
          editorRef.current = {
            focus: () => editor.commands.focus(),
            insertContent: (html: string) => { editor.commands.focus(); editor.commands.insertContent(html); },
          };
        }}
        onUpdate={setReplyText}
        initialContent={initialDraft.current?.message || ""}
        onAttachImage={() => replyFileInputRef.current?.click()}
        onPasteFiles={(files) => {
          const dt = new DataTransfer();
          files.forEach(f => dt.items.add(f));
          handleReplyImageUpload(dt.files);
        }}
        placeholder="Type a reply..."
        minHeight="40px"
        mentionUsers={mentionUsers}
      />
      <input
        ref={replyFileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
        multiple
        onChange={(e) => handleReplyImageUpload(e.target.files)}
        className="hidden"
      />
      {/* Image previews + send row */}
      <div className="flex items-end justify-between mt-2">
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          {replyImages.map((url, idx) => (
            <div key={url} className="relative group">
              <img src={url} alt={`Attachment ${idx + 1}`} className="h-12 w-12 object-cover rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]" />
              <button
                type="button"
                onClick={() => setReplyImages(prev => prev.filter((_, i) => i !== idx))}
                className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {isReplyUploading && (
            <div className="h-12 w-12 flex items-center justify-center rounded-lg border border-dashed border-[#e8d4b8] dark:border-[#6b5a4a]">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={onOpenFullEditor}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="Open full editor"
          >
            <PenSquare className="h-4 w-4" />
          </button>
          <button
            onClick={handleSendReply}
            disabled={isReplySending || (isReplyEmpty && replyImages.length === 0)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#a0704b] hover:bg-[#8b5f3c] text-white text-sm rounded-full shadow-sm transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {isReplySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>
    </div>
  );
});

export default ReplyComposer;
