"use client";

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Send, Loader2, X, ChevronDown, Clock, Calendar, FileText, GripVertical } from "lucide-react";
import { Reorder } from "framer-motion";
import { cn } from "@/lib/utils";
import { isHtmlEmpty } from "@/lib/html-utils";
import { saveReplyDraft, loadReplyDraft, clearReplyDraft, isReplyDraftEmpty } from "@/lib/inbox-drafts";
import { useFileUpload } from "@/lib/useFileUpload";
import InboxRichEditor from "@/components/inbox/InboxRichEditor";
import AttachmentMenu from "@/components/inbox/AttachmentMenu";
import type { MentionUser } from "@/components/inbox/InboxRichEditor";
import VoiceRecorder from "@/components/inbox/VoiceRecorder";
import type { MessageTemplate } from "@/types";
import { useToast } from "@/contexts/ToastContext";

function getDefaultCustomDateTime() {
  const d = new Date(Date.now() + 60_000);
  const date = d.toLocaleDateString("en-CA");
  const time = d.toTimeString().slice(0, 5);
  return { date, time };
}

export interface ReplyComposerHandle {
  insertContent: (html: string) => void;
  restoreContent: (text: string, images: string[]) => void;
}

interface ReplyComposerProps {
  threadId: number;
  currentTutorId: number;
  mentionUsers: MentionUser[];
  isMobile: boolean;
  onSend: (text: string, images: string[], files: { url: string; filename: string; content_type: string }[]) => Promise<void>;
  onScheduleSend?: (text: string, images: string[], files: { url: string; filename: string; content_type: string }[], scheduledAt: string) => Promise<void>;
  onOpenFullEditor: () => void;
  onDraftChange?: (threadId: number) => void;
  onTyping?: () => void;
  templates?: MessageTemplate[];
  onCreateTemplate?: (title: string, content: string) => void;
  onDeleteTemplate?: (templateId: number) => void;
  onSendVoice?: (file: File, durationSec: number) => Promise<void>;
}

const ReplyComposer = forwardRef<ReplyComposerHandle, ReplyComposerProps>(function ReplyComposer(
  { threadId, currentTutorId, mentionUsers, isMobile, onSend, onScheduleSend, onOpenFullEditor, onDraftChange, onTyping, templates, onCreateTemplate, onDeleteTemplate, onSendVoice },
  ref
) {
  const { showToast } = useToast();
  const initialDraft = useRef(loadReplyDraft(threadId));
  const [replyText, setReplyText] = useState(initialDraft.current?.message || "");
  const [replyImages, setReplyImages] = useState<string[]>(initialDraft.current?.images || []);
  const [isReplySending, setIsReplySending] = useState(false);
  const [replyEditorKey, setReplyEditorKey] = useState(0);
  const [isReplyDragging, setIsReplyDragging] = useState(false);
  const editorRef = useRef<{ focus: () => void; insertContent: (html: string) => void } | null>(null);
  const [replyFiles, setReplyFiles] = useState<{ url: string; filename: string; content_type: string }[]>([]);
  const { uploadFiles: handleUpload, isUploading: isReplyUploading } = useFileUpload({ tutorId: currentTutorId, acceptFiles: true });

  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [showCustomSchedule, setShowCustomSchedule] = useState(false);
  const [customScheduleDate, setCustomScheduleDate] = useState("");
  const [customScheduleTime, setCustomScheduleTime] = useState("09:00");

  const isReplyEmpty = isHtmlEmpty(replyText);

  // Debounced typing indicator — fire at most once per 3s
  const lastTypingRef = useRef(0);
  const handleEditorUpdate = useCallback((html: string) => {
    setReplyText(html);
    if (onTyping && !isHtmlEmpty(html)) {
      const now = Date.now();
      if (now - lastTypingRef.current > 3000) {
        lastTypingRef.current = now;
        onTyping();
      }
    }
  }, [onTyping]);

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
    setReplyFiles([]);
    setReplyEditorKey(prev => prev + 1);
  }, [threadId]);

  // Auto-save reply draft on content change
  useEffect(() => {
    if (isReplyDraftEmpty(replyText) && replyImages.length === 0) {
      clearReplyDraft(threadId);
      onDraftChange?.(threadId);
    } else if (!isReplyDraftEmpty(replyText) || replyImages.length > 0) {
      saveReplyDraft(threadId, { message: replyText, images: replyImages, savedAt: Date.now() });
      onDraftChange?.(threadId);
    }
  }, [replyText, replyImages, threadId, onDraftChange]);

  const handleReplyFileUpload = (files: FileList | null) => {
    handleUpload(files, {
      onImage: (url) => setReplyImages(prev => [...prev, url]),
      onFile: (file) => setReplyFiles(prev => [...prev, file]),
    });
  };

  const hasContent = !isReplyEmpty || replyImages.length > 0 || replyFiles.length > 0;

  const handleSendReply = useCallback(async () => {
    if (!hasContent || isReplySending) return;
    setIsReplySending(true);

    const text = replyText;
    const images = [...replyImages];
    const files = [...replyFiles];

    // Clear editor immediately for snappy feel
    setReplyText("");
    setReplyImages([]);
    setReplyFiles([]);
    setReplyEditorKey(prev => prev + 1);
    clearReplyDraft(threadId);

    try {
      await onSend(text, images, files);
    } finally {
      setIsReplySending(false);
    }
  }, [hasContent, replyFiles, isReplySending, replyText, replyImages, threadId, onSend]);

  const getSchedulePresets = () => {
    const now = new Date();

    const in30min = new Date(now.getTime() + 30 * 60 * 1000);
    const in1hr = new Date(now.getTime() + 60 * 60 * 1000);
    const in2hr = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const tomorrow9am = new Date(now);
    tomorrow9am.setDate(tomorrow9am.getDate() + 1);
    tomorrow9am.setHours(9, 0, 0, 0);

    return [
      { label: "30 minutes later", time: in30min },
      { label: "1 hour later", time: in1hr },
      { label: "2 hours later", time: in2hr },
      { label: "Tomorrow 9:00 AM", time: tomorrow9am },
    ];
  };

  const handleScheduleReply = useCallback(async (scheduledAt: Date) => {
    if (!hasContent || isReplySending || !onScheduleSend) return;
    setShowScheduleMenu(false);
    setShowCustomSchedule(false);
    setIsReplySending(true);

    const text = replyText;
    const images = [...replyImages];
    const files = [...replyFiles];

    setReplyText("");
    setReplyImages([]);
    setReplyFiles([]);
    setReplyEditorKey(prev => prev + 1);
    clearReplyDraft(threadId);

    try {
      await onScheduleSend(text, images, files, scheduledAt.toISOString());
      showToast(`Reply scheduled for ${scheduledAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`, "success");
    } catch {
      showToast("Failed to schedule reply", "error");
    } finally {
      setIsReplySending(false);
    }
  }, [hasContent, replyFiles, isReplySending, replyText, replyImages, threadId, onScheduleSend, showToast]);

  const handleCustomScheduleReply = () => {
    if (!customScheduleDate) return;
    const dt = new Date(`${customScheduleDate}T${customScheduleTime}:00`);
    if (dt <= new Date()) return;
    handleScheduleReply(dt);
  };

  return (
    <div
      className={cn(
        "flex-shrink-0 p-3 relative transition-all border-t border-[#e8d4b8]/40 dark:border-[#6b5a4a]/60 shadow-[0_-2px_6px_0_rgba(0,0,0,0.06)] dark:shadow-[0_-2px_6px_0_rgba(0,0,0,0.25)]",
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
          handleReplyFileUpload(files);
        }
      }}
    >
      {isReplyDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50/60 dark:bg-blue-900/20 rounded-lg z-10 pointer-events-none">
          <span className="text-sm font-medium text-blue-500 dark:text-blue-400">Drop files here</span>
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
        onUpdate={handleEditorUpdate}
        initialContent={initialDraft.current?.message || ""}
        onPasteFiles={(files) => {
          const dt = new DataTransfer();
          files.forEach(f => dt.items.add(f));
          handleReplyFileUpload(dt.files);
        }}
        placeholder="Type a reply..."
        minHeight="40px"
        mentionUsers={mentionUsers}
        templates={templates}
        onCreateTemplate={onCreateTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onOpenFullEditor={onOpenFullEditor}
      />
      {/* Attachment previews + send row */}
      {replyFiles.length > 0 && (
        <Reorder.Group axis="y" values={replyFiles} onReorder={setReplyFiles} className="mt-2 space-y-1" as="div">
          {replyFiles.map((file) => (
            <Reorder.Item
              key={file.url}
              value={file}
              whileDrag={{ scale: 1.03, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
              className="flex items-center gap-2 px-2 py-1 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50"
              style={{ cursor: replyFiles.length > 1 ? "grab" : undefined }}
              as="div"
            >
              {replyFiles.length > 1 && <GripVertical className="h-3 w-3 text-gray-400 flex-shrink-0" />}
              <FileText className="h-3.5 w-3.5 text-[#a0704b] flex-shrink-0" />
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{file.filename}</span>
              <button
                type="button"
                onClick={() => setReplyFiles(prev => prev.filter((f) => f.url !== file.url))}
                className="p-0.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}
      <div className="flex items-end justify-between mt-2">
        <Reorder.Group axis="x" values={replyImages} onReorder={setReplyImages} className="flex flex-wrap gap-2 flex-1 min-w-0" as="div">
          {replyImages.map((url) => (
            <Reorder.Item
              key={url}
              value={url}
              whileDrag={{ scale: 1.05, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
              className="relative group hover:opacity-80 transition-opacity"
              style={{ cursor: replyImages.length > 1 ? "grab" : undefined }}
              as="div"
            >
              <img src={url} alt="Attachment" className="h-12 w-12 object-cover rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]" />
              <button
                type="button"
                onClick={() => setReplyImages(prev => prev.filter((u) => u !== url))}
                className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </Reorder.Item>
          ))}
          {isReplyUploading && (
            <div className="h-12 w-12 flex items-center justify-center rounded-lg border border-dashed border-[#e8d4b8] dark:border-[#6b5a4a]">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          )}
        </Reorder.Group>
        <div className="flex items-center gap-1 ml-2">
          {onSendVoice && (
            <VoiceRecorder onSend={onSendVoice} />
          )}
          <AttachmentMenu
            onFiles={(files) => handleReplyFileUpload(files)}
            isUploading={isReplyUploading}
          />
          <div className="relative flex">
            <button
              onClick={handleSendReply}
              disabled={isReplySending || !hasContent}
              title="Send (Ctrl+Enter)"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 bg-[#a0704b] hover:bg-[#8b5f3c] text-white text-sm shadow-sm transition-colors disabled:bg-[#c9b99a] dark:disabled:bg-[#5a4a3a] disabled:text-white/50 disabled:cursor-not-allowed",
                onScheduleSend ? "rounded-l-full" : "rounded-full"
              )}
            >
              {isReplySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="hidden sm:inline">Send</span>
            </button>
            {onScheduleSend && (
              <button
                type="button"
                disabled={isReplySending || !hasContent}
                onClick={() => setShowScheduleMenu(!showScheduleMenu)}
                className="px-1.5 py-1.5 bg-[#a0704b] hover:bg-[#8b5f3c] text-white rounded-r-full border-l border-white/20 transition-colors disabled:bg-[#c9b99a] dark:disabled:bg-[#5a4a3a] disabled:text-white/50 disabled:cursor-not-allowed"
                title="Schedule send"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
            {showScheduleMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => { setShowScheduleMenu(false); setShowCustomSchedule(false); }} />
                <div className="absolute bottom-full right-0 mb-1 z-20 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-[#e8d4b8] dark:border-[#6b5a4a] py-1 min-w-[220px]">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Schedule send</div>
                  {getSchedulePresets().map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleScheduleReply(preset.time)}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] flex items-center gap-2 text-gray-700 dark:text-gray-300"
                    >
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      {preset.label}
                    </button>
                  ))}
                  <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
                    {!showCustomSchedule ? (
                      <button
                        type="button"
                        onClick={() => {
                          const { date, time } = getDefaultCustomDateTime();
                          setCustomScheduleDate(date);
                          setCustomScheduleTime(time);
                          setShowCustomSchedule(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors text-left"
                      >
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-gray-700 dark:text-gray-300">Pick date & time</span>
                      </button>
                    ) : (
                      <div className="px-3 py-2 space-y-1.5">
                        <input
                          type="date"
                          value={customScheduleDate}
                          onChange={(e) => setCustomScheduleDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          className="w-full px-2 py-1 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-700 dark:text-gray-200"
                        />
                        <input
                          type="time"
                          value={customScheduleTime}
                          onChange={(e) => setCustomScheduleTime(e.target.value)}
                          min={customScheduleDate === new Date().toLocaleDateString("en-CA") ? new Date().toTimeString().slice(0, 5) : undefined}
                          className="w-full px-2 py-1 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-700 dark:text-gray-200"
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setShowCustomSchedule(false)}
                            className="flex-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleCustomScheduleReply}
                            disabled={!customScheduleDate}
                            className="flex-1 px-2 py-1 text-xs font-medium bg-[#a0704b] text-white rounded hover:bg-[#8b5f3c] disabled:opacity-40 transition-colors"
                          >
                            Set
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default ReplyComposer;
