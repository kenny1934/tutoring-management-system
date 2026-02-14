"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  X, Send, Loader2, Megaphone, Users, ChevronDown, Check,
  FileText, Paperclip, Bell, HelpCircle, Calendar,
  MessageCircle, BookOpen, MessageSquarePlus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { messagesAPI } from "@/lib/api";
import { useFileUpload } from "@/lib/useFileUpload";
import { useClickOutside } from "@/lib/hooks";
import InboxRichEditor from "@/components/inbox/InboxRichEditor";
import type { MentionUser } from "@/components/inbox/InboxRichEditor";
import type { Message, MessageCreate, MessageCategory } from "@/types";
import { getDraftKey, loadDraft, saveDraft, clearDraft } from "@/lib/inbox-drafts";
import { stripHtml, isHtmlEmpty } from "@/lib/html-utils";
import { useToast } from "@/contexts/ToastContext";

// Category options for compose dropdown
const CATEGORY_OPTIONS: Array<{ value: MessageCategory | ""; label: string; icon: React.ReactNode }> = [
  { value: "", label: "None", icon: null },
  { value: "Reminder", label: "Reminder", icon: <Bell className="h-4 w-4" /> },
  { value: "Question", label: "Question", icon: <HelpCircle className="h-4 w-4" /> },
  { value: "Announcement", label: "Announcement", icon: <Megaphone className="h-4 w-4" /> },
  { value: "Schedule", label: "Schedule", icon: <Calendar className="h-4 w-4" /> },
  { value: "Chat", label: "Chat", icon: <MessageCircle className="h-4 w-4" /> },
  { value: "Courseware", label: "Courseware", icon: <BookOpen className="h-4 w-4" /> },
  { value: "Feedback", label: "Feedback", icon: <MessageSquarePlus className="h-4 w-4" /> },
];

// Priority options for compose dropdown
const PRIORITY_OPTIONS = [
  { value: "Normal" as const, label: "Normal", colorClass: "text-gray-600 dark:text-gray-400" },
  { value: "High" as const, label: "High", colorClass: "text-orange-600 dark:text-orange-400" },
  { value: "Urgent" as const, label: "Urgent", colorClass: "text-red-600 dark:text-red-400" },
];

export interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tutors: Array<{ id: number; tutor_name: string }>;
  fromTutorId: number;
  replyTo?: Message;
  onSend: (data: MessageCreate) => Promise<void>;
  forwardFrom?: { subject: string; body: string; category?: string };
  pictureMap?: Map<number, string>;
}

export default function ComposeModal({
  isOpen,
  onClose,
  tutors,
  fromTutorId,
  replyTo,
  onSend,
  forwardFrom,
  pictureMap,
}: ComposeModalProps) {
  const { showToast } = useToast();
  const [recipientMode, setRecipientMode] = useState<"all" | "select">("all");
  const [selectedTutorIds, setSelectedTutorIds] = useState<number[]>([]);
  const [recipientDropdownOpen, setRecipientDropdownOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"Normal" | "High" | "Urgent">("Normal");
  const [category, setCategory] = useState<MessageCategory | "">("");
  const [isSending, setIsSending] = useState(false);
  const [composeEditorKey, setComposeEditorKey] = useState(0);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; filename: string; content_type: string }[]>([]);
  const [isComposeDragging, setIsComposeDragging] = useState(false);
  const { uploadFiles: handleUploadFiles, isUploading, fileInputRef } = useFileUpload({
    tutorId: fromTutorId,
    acceptFiles: true,
    onError: (error) => showToast(error instanceof Error ? error.message : 'Failed to upload file', "error"),
  });
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const recipientDropdownRef = useRef<HTMLDivElement>(null);

  const mentionUsers: MentionUser[] = useMemo(() => {
    const allUsers = tutors.map(t => ({ id: t.id, label: t.tutor_name, pictureUrl: pictureMap?.get(t.id) || (t as any).profile_picture }));
    if (recipientMode === "all") return allUsers;
    const recipientSet = new Set([...selectedTutorIds, fromTutorId]);
    return allUsers.filter(u => recipientSet.has(u.id));
  }, [tutors, recipientMode, selectedTutorIds, fromTutorId, pictureMap]);

  const handleFileUpload = (files: FileList | null) => {
    handleUploadFiles(files, {
      onImage: (url) => setUploadedImages(prev => [...prev, url]),
      onFile: (file) => setUploadedFiles(prev => [...prev, file]),
    });
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Reset form when opening — check for saved draft
  useEffect(() => {
    if (isOpen) {
      const draftKey = getDraftKey(replyTo?.id);
      const draft = loadDraft(draftKey);

      const setReplyRecipients = () => {
        if (!replyTo) return;
        if (replyTo.is_group_message && replyTo.to_tutor_ids) {
          // Reply-all: remove self, add original sender (only if not self)
          const replyRecipients = replyTo.to_tutor_ids.filter(id => id !== fromTutorId);
          if (replyTo.from_tutor_id !== fromTutorId && !replyRecipients.includes(replyTo.from_tutor_id)) {
            replyRecipients.push(replyTo.from_tutor_id);
          }
          setRecipientMode("select");
          setSelectedTutorIds(replyRecipients);
        } else if (replyTo.from_tutor_id === fromTutorId) {
          // Replying to own message: send to original recipient(s)
          if (replyTo.to_tutor_id == null) {
            setRecipientMode("all");
            setSelectedTutorIds([]);
          } else {
            setRecipientMode("select");
            setSelectedTutorIds([replyTo.to_tutor_id]);
          }
        } else {
          // Replying to someone else: send to them
          setRecipientMode("select");
          setSelectedTutorIds([replyTo.from_tutor_id]);
        }
      };

      if (draft && !replyTo) {
        // Compose mode: restore full draft
        setRecipientMode(draft.recipientMode || "all");
        setSelectedTutorIds(draft.selectedTutorIds || []);
        setSubject(draft.subject);
        setMessage(draft.message);
        setPriority(draft.priority);
        setCategory(draft.category as MessageCategory | "");
        setUploadedImages(draft.uploadedImages);
      } else if (draft && replyTo) {
        // Reply mode: keep auto-filled to/subject/category, restore message content
        setReplyRecipients();
        setSubject(`Re: ${replyTo.subject || "(no subject)"}`);
        setCategory(replyTo.category || "");
        setMessage(draft.message);
        setPriority(draft.priority);
        setUploadedImages(draft.uploadedImages);
      } else if (replyTo) {
        // Reply mode, no draft
        setReplyRecipients();
        setSubject(`Re: ${replyTo.subject || "(no subject)"}`);
        setCategory(replyTo.category || "");
        setMessage("");
        setPriority("Normal");
        setUploadedImages([]);
        setUploadedFiles([]);
      } else if (forwardFrom) {
        // Forward mode: pre-fill subject and body
        setRecipientMode("all");
        setSelectedTutorIds([]);
        setSubject(forwardFrom.subject);
        setCategory(forwardFrom.category as MessageCategory | "" || "");
        setMessage(forwardFrom.body);
        setPriority("Normal");
        setUploadedImages([]);
        setUploadedFiles([]);
      } else {
        // Compose mode, no draft
        setRecipientMode("all");
        setSelectedTutorIds([]);
        setSubject("");
        setCategory("");
        setMessage("");
        setPriority("Normal");
        setUploadedImages([]);
        setUploadedFiles([]);
      }
      // Increment editor key so InboxRichEditor remounts with fresh initialContent
      setComposeEditorKey(prev => prev + 1);
    }
  }, [isOpen, replyTo, forwardFrom]);

  // Auto-save draft (debounced 1s)
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      const draftKey = getDraftKey(replyTo?.id);
      const hasContent = !isHtmlEmpty(message)
        || (subject.trim().length > 0 && !replyTo)
        || uploadedImages.length > 0;
      if (hasContent) {
        saveDraft(draftKey, { recipientMode, selectedTutorIds, subject, message, priority, category, uploadedImages, savedAt: Date.now() });
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [isOpen, recipientMode, selectedTutorIds, subject, message, priority, category, uploadedImages, replyTo?.id]);

  // Close dropdowns on click outside
  useClickOutside(categoryDropdownRef, () => setCategoryDropdownOpen(false), categoryDropdownOpen);
  useClickOutside(priorityDropdownRef, () => setPriorityDropdownOpen(false), priorityDropdownOpen);
  useClickOutside(recipientDropdownRef, () => setRecipientDropdownOpen(false), recipientDropdownOpen);

  // Check for unsaved changes
  const isMessageEmpty = isHtmlEmpty(message);
  const hasUnsavedChanges = !isMessageEmpty || (subject.trim().length > 0 && !replyTo) || uploadedImages.length > 0;
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handleDiscard = () => {
    clearDraft(getDraftKey(replyTo?.id));
    setShowDiscardConfirm(false);
    onClose();
  };

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, hasUnsavedChanges]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMessageEmpty) return;

    setIsSending(true);
    try {
      const sendData: MessageCreate = {
        subject: subject || undefined,
        message,
        priority,
        category: category || undefined,
        reply_to_id: replyTo?.id,
        image_attachments: uploadedImages.length > 0 ? uploadedImages : undefined,
        file_attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
      };
      if (recipientMode === "select") {
        if (selectedTutorIds.length === 1) {
          sendData.to_tutor_id = selectedTutorIds[0];
        } else if (selectedTutorIds.length >= 2) {
          sendData.to_tutor_ids = selectedTutorIds;
        }
        // 0 selected = broadcast (no to_tutor_id or to_tutor_ids)
      }
      await onSend(sendData);
      clearDraft(getDraftKey(replyTo?.id));
      onClose();
    } catch {
      showToast("Failed to send message", "error");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center lg:pl-64">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-black/50"
          onClick={handleClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative bg-white dark:bg-[#1a1a1a] rounded-lg shadow-xl w-full min-w-[320px] max-w-xl sm:max-w-2xl md:max-w-4xl lg:max-w-5xl mx-4 border border-[#e8d4b8] dark:border-[#6b5a4a]"
        >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {replyTo ? "Reply" : forwardFrom ? "Forward" : "New Message"}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {showDiscardConfirm && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/40">
            <span className="text-sm text-amber-800 dark:text-amber-200">Discard unsaved changes?</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowDiscardConfirm(false)} className="px-3 py-1 text-xs font-medium rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                Keep editing
              </button>
              <button type="button" onClick={handleDiscard} className="px-3 py-1 text-xs font-medium rounded bg-red-500 text-white hover:bg-red-600 transition-colors">
                Discard
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* To */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-200">
              To
            </label>
            {replyTo ? (
              /* Reply mode: read-only display */
              <div className={cn(
                "w-full px-3 py-2 border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white opacity-60 cursor-not-allowed"
              )}>
                {recipientMode === "all"
                  ? "All Tutors (Broadcast)"
                  : selectedTutorIds.map(id => tutors.find(t => t.id === id)?.tutor_name || "Unknown").join(", ")
                }
              </div>
            ) : (
              /* Compose mode: interactive recipient picker */
              <div ref={recipientDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setRecipientDropdownOpen(!recipientDropdownOpen)}
                  className={cn(
                    "w-full px-3 py-2 border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white text-left flex items-center gap-2"
                  )}
                >
                  {recipientMode === "all" ? (
                    <span className="flex items-center gap-2 flex-1">
                      <Megaphone className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      All Tutors (Broadcast)
                    </span>
                  ) : selectedTutorIds.length === 0 ? (
                    <span className="text-gray-400 flex-1">Select recipients...</span>
                  ) : (
                    <span className="flex items-center gap-1 flex-1 flex-wrap">
                      <Users className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                      {selectedTutorIds.length === 1
                        ? tutors.find(t => t.id === selectedTutorIds[0])?.tutor_name || "Unknown"
                        : `${selectedTutorIds.length} recipients`
                      }
                    </span>
                  )}
                  <ChevronDown className={cn("h-4 w-4 transition-transform flex-shrink-0", recipientDropdownOpen && "rotate-180")} />
                </button>

                {/* Selected tutor chips (shown above dropdown when 2+ selected) */}
                {recipientMode === "select" && selectedTutorIds.length >= 2 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {selectedTutorIds.map(id => {
                      const tutor = tutors.find(t => t.id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[#f5ede3] dark:bg-[#3d3628] text-gray-700 dark:text-gray-300 border border-[#e8d4b8] dark:border-[#6b5a4a]"
                        >
                          {tutor?.tutor_name || "Unknown"}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTutorIds(prev => prev.filter(tid => tid !== id));
                            }}
                            className="hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Dropdown */}
                {recipientDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-[#2a2a2a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {/* Broadcast option */}
                    <button
                      type="button"
                      onClick={() => {
                        setRecipientMode("all");
                        setSelectedTutorIds([]);
                        setRecipientDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50",
                        recipientMode === "all" && "bg-blue-50 dark:bg-blue-900/20"
                      )}
                    >
                      <Megaphone className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span>All Tutors (Broadcast)</span>
                      {recipientMode === "all" && <Check className="h-4 w-4 text-blue-500 ml-auto" />}
                    </button>

                    {/* Individual tutors */}
                    {tutors
                      .filter(t => t.id !== fromTutorId)
                      .sort((a, b) => {
                        const getFirstName = (name: string) => {
                          const parts = name.split(' ');
                          return parts.length > 1 ? parts[1] : parts[0];
                        };
                        return getFirstName(a.tutor_name).localeCompare(getFirstName(b.tutor_name));
                      })
                      .map((tutor) => {
                        const isSelected = selectedTutorIds.includes(tutor.id);
                        return (
                          <button
                            key={tutor.id}
                            type="button"
                            onClick={() => {
                              setRecipientMode("select");
                              setSelectedTutorIds(prev =>
                                isSelected
                                  ? prev.filter(id => id !== tutor.id)
                                  : [...prev, tutor.id]
                              );
                            }}
                            className={cn(
                              "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800",
                              isSelected && "bg-[#f5ede3] dark:bg-[#3d3628]"
                            )}
                          >
                            <div className={cn(
                              "h-4 w-4 rounded border flex items-center justify-center flex-shrink-0",
                              isSelected
                                ? "bg-[#c9a96e] border-[#c9a96e] text-white"
                                : "border-gray-300 dark:border-gray-600"
                            )}>
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>
                            <span>{tutor.tutor_name}</span>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-200">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Optional subject..."
              className="w-full px-3 py-2 border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white"
            />
          </div>

          {/* Category & Priority row */}
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-3">
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-200">
                Category
              </label>
              <div ref={categoryDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                  className="w-full px-3 py-2 border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    {CATEGORY_OPTIONS.find(c => c.value === category)?.icon}
                    {CATEGORY_OPTIONS.find(c => c.value === category)?.label || "None"}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", categoryDropdownOpen && "rotate-180")} />
                </button>
                {categoryDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-[#2a2a2a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg overflow-hidden">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setCategory(opt.value); setCategoryDropdownOpen(false); }}
                        className={cn(
                          "w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors",
                          category === opt.value && "bg-[#f5ede3] dark:bg-[#3d3628]"
                        )}
                      >
                        {opt.icon}
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-200">
                Priority
              </label>
              <div ref={priorityDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setPriorityDropdownOpen(!priorityDropdownOpen)}
                  className="w-full px-3 py-2 border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#2a2a2a] flex items-center justify-between"
                >
                  <span className={PRIORITY_OPTIONS.find(p => p.value === priority)?.colorClass}>
                    {priority}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", priorityDropdownOpen && "rotate-180")} />
                </button>
                {priorityDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-[#2a2a2a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg overflow-hidden">
                    {PRIORITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setPriority(opt.value); setPriorityDropdownOpen(false); }}
                        className={cn(
                          "w-full px-3 py-2 text-left hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors",
                          opt.colorClass,
                          priority === opt.value && "bg-[#f5ede3] dark:bg-[#3d3628]"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reply context */}
          {replyTo && (
            <div className="p-3 bg-gray-50 dark:bg-[#2a2a2a] rounded-lg border-l-4 border-[#a0704b] text-sm">
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                {replyTo.from_tutor_name} wrote:
              </div>
              <div className="text-gray-600 dark:text-gray-400 line-clamp-3">
                {stripHtml(replyTo.message)}
              </div>
            </div>
          )}

          {/* Message */}
          <div
            className={cn(
              "relative",
              isComposeDragging && "ring-2 ring-inset ring-blue-400 rounded-lg"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsComposeDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsComposeDragging(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsComposeDragging(false);
              const files = e.dataTransfer?.files;
              if (files && files.length > 0) {
                handleFileUpload(files);
              }
            }}
          >
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-200">
              Message
            </label>
            <InboxRichEditor
              key={composeEditorKey}
              initialContent={message}
              onUpdate={setMessage}
              onPasteFiles={(files) => {
                const dt = new DataTransfer();
                files.forEach(f => dt.items.add(f));
                handleFileUpload(dt.files);
              }}
              mentionUsers={mentionUsers}
            />
            {isComposeDragging && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-50/60 dark:bg-blue-900/20 rounded-lg z-10 pointer-events-none">
                <span className="text-sm font-medium text-blue-500 dark:text-blue-400">Drop images here</span>
              </div>
            )}
          </div>

          {/* Image Attachments */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
                {isUploading ? 'Uploading...' : 'Attach'}
              </button>
              {(uploadedImages.length > 0 || uploadedFiles.length > 0) && (
                <span className="text-xs text-gray-500">{uploadedImages.length + uploadedFiles.length} file(s)</span>
              )}
            </div>
            {/* Image Previews */}
            {uploadedImages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {uploadedImages.map((url, index) => (
                  <div key={url} className="relative group">
                    <img
                      src={url}
                      alt={`Attachment ${index + 1}`}
                      className="h-16 w-16 object-cover rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-60 hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* File Previews */}
            {uploadedFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {uploadedFiles.map((file, index) => (
                  <div key={file.url} className="flex items-center gap-2 p-2 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50">
                    <FileText className="h-4 w-4 text-[#a0704b] flex-shrink-0" />
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{file.filename}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="p-0.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending || isUploading || isMessageEmpty}
              className="px-4 py-2 bg-[#a0704b] hover:bg-[#8b5f3c] text-white rounded-lg transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
        </form>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
