"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useLocation } from "@/contexts/LocationContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useMessageThreads, useMessageThreadsPaginated, useSentMessages, useUnreadMessageCount, useDebouncedValue, useBrowserNotifications, useProposals, useClickOutside, useActiveTutors, useArchivedMessages, usePinnedMessages } from "@/lib/hooks";
import { useSwipeGesture } from "@/lib/hooks/useSwipeGesture";
import { useToast } from "@/contexts/ToastContext";
import { messagesAPI } from "@/lib/api";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/formatters";
import { mutate } from "swr";
import type { Message, MessageThread, MessageCreate, MessageCategory, MakeupProposal, Session } from "@/types";
import { ProposalCard } from "@/components/inbox/ProposalCard";
import { ProposalEmbed } from "@/components/inbox/ProposalEmbed";
import { ScheduleMakeupModal } from "@/components/sessions/ScheduleMakeupModal";
import SendToWecomModal from "@/components/wecom/SendToWecomModal";
import InboxRichEditor from "@/components/inbox/InboxRichEditor";
import {
  Inbox,
  Send,
  Bell,
  HelpCircle,
  Megaphone,
  Calendar,
  MessageCircle,
  BookOpen,
  PenSquare,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Reply,
  Loader2,
  AlertCircle,
  Clock,
  Pencil,
  Check,
  Search,
  Trash2,
  CalendarClock,
  Circle,
  CircleDot,
  Archive,
  ArchiveRestore,
  Image as ImageIcon,
  MessageSquareShare,
  Star,
  Users,
} from "lucide-react";

// Category definition
interface Category {
  id: string;
  label: string;
  icon: React.ReactNode;
  filter?: MessageCategory;
}

interface CategorySection {
  id: string;
  label?: string;
  items: Category[];
}

const CATEGORY_SECTIONS: CategorySection[] = [
  {
    id: "mailboxes",
    items: [
      { id: "inbox", label: "Inbox", icon: <Inbox className="h-4 w-4" /> },
      { id: "starred", label: "Starred", icon: <Star className="h-4 w-4" /> },
      { id: "sent", label: "Sent", icon: <Send className="h-4 w-4" /> },
      { id: "archived", label: "Archived", icon: <Archive className="h-4 w-4" /> },
    ],
  },
  {
    id: "categories",
    label: "Categories",
    items: [
      { id: "reminder", label: "Reminder", icon: <Bell className="h-4 w-4" />, filter: "Reminder" },
      { id: "question", label: "Question", icon: <HelpCircle className="h-4 w-4" />, filter: "Question" },
      { id: "announcement", label: "Announcement", icon: <Megaphone className="h-4 w-4" />, filter: "Announcement" },
      { id: "schedule", label: "Schedule", icon: <Calendar className="h-4 w-4" />, filter: "Schedule" },
      { id: "chat", label: "Chat", icon: <MessageCircle className="h-4 w-4" />, filter: "Chat" },
      { id: "courseware", label: "Courseware", icon: <BookOpen className="h-4 w-4" />, filter: "Courseware" },
      { id: "makeup-confirmation", label: "Make-up", icon: <CalendarClock className="h-4 w-4" />, filter: "MakeupConfirmation" },
    ],
  },
];

// Flat list for consumers (unread counts, category filter lookups, etc.)
const CATEGORIES: Category[] = CATEGORY_SECTIONS.flatMap(s => s.items);

// Priority configuration - single source of truth
type PriorityLevel = "Normal" | "High" | "Urgent";
const PRIORITIES: Record<PriorityLevel, { label: string; textClass: string; badgeClass: string; borderClass: string }> = {
  Normal: {
    label: "Normal",
    textClass: "text-gray-600 dark:text-gray-400",
    badgeClass: "text-gray-600 dark:text-gray-400",
    borderClass: "",
  },
  High: {
    label: "High",
    textClass: "text-orange-600 dark:text-orange-400",
    badgeClass: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30",
    borderClass: "border-l-4 border-l-orange-400",
  },
  Urgent: {
    label: "Urgent",
    textClass: "text-red-600 dark:text-red-400",
    badgeClass: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30",
    borderClass: "border-l-4 border-l-red-500",
  },
};

// Category options for dropdown
const CATEGORY_OPTIONS: Array<{ value: MessageCategory | ""; label: string; icon: React.ReactNode }> = [
  { value: "", label: "None", icon: null },
  { value: "Reminder", label: "Reminder", icon: <Bell className="h-4 w-4" /> },
  { value: "Question", label: "Question", icon: <HelpCircle className="h-4 w-4" /> },
  { value: "Announcement", label: "Announcement", icon: <Megaphone className="h-4 w-4" /> },
  { value: "Schedule", label: "Schedule", icon: <Calendar className="h-4 w-4" /> },
  { value: "Chat", label: "Chat", icon: <MessageCircle className="h-4 w-4" /> },
  { value: "Courseware", label: "Courseware", icon: <BookOpen className="h-4 w-4" /> },
];

// Priority options for dropdown (derived from PRIORITIES)
const PRIORITY_OPTIONS = (Object.entries(PRIORITIES) as [PriorityLevel, typeof PRIORITIES[PriorityLevel]][]).map(
  ([value, config]) => ({ value, label: config.label, colorClass: config.textClass })
);

// Empty state messages by category
const EMPTY_MESSAGES: Record<string, string> = {
  sent: "You haven't sent any messages yet",
  reminder: "No reminders",
  question: "No questions",
  announcement: "No announcements",
  schedule: "No schedule messages",
  chat: "No chat messages",
  courseware: "No courseware messages",
  "makeup-confirmation": "No pending make-up confirmations",
  starred: "No starred messages",
  archived: "No archived messages",
  inbox: "No messages in your inbox",
};

// Mutate filter functions
const isThreadsKey = (key: unknown) => Array.isArray(key) && (key[0] === "message-threads" || key[0] === "message-threads-paginated");
const isSentKey = (key: unknown) => Array.isArray(key) && key[0] === "sent-messages";
const isUnreadKey = (key: unknown) => Array.isArray(key) && key[0] === "unread-count";
const isAnyMessageKey = (key: unknown) => isThreadsKey(key) || isSentKey(key) || isUnreadKey(key);

// Draft auto-save helpers
interface DraftData {
  toTutorId?: number | "all"; // Legacy compat
  recipientMode: "all" | "select";
  selectedTutorIds: number[];
  subject: string;
  message: string;
  priority: "Normal" | "High" | "Urgent";
  category: string;
  uploadedImages: string[];
  savedAt: number;
}

const DRAFT_COMPOSE_KEY = "inbox-draft-compose";
const DRAFT_REPLY_PREFIX = "inbox-draft-reply-";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getDraftKey(replyToId?: number): string {
  return replyToId ? `${DRAFT_REPLY_PREFIX}${replyToId}` : DRAFT_COMPOSE_KEY;
}

function saveDraft(key: string, draft: DraftData): void {
  try { localStorage.setItem(key, JSON.stringify(draft)); } catch {}
}

function loadDraft(key: string): DraftData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftData;
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch { return null; }
}

function clearDraft(key: string): void {
  try { localStorage.removeItem(key); } catch {}
}

// Compose Modal Component
function ComposeModal({
  isOpen,
  onClose,
  tutors,
  fromTutorId,
  replyTo,
  onSend,
}: {
  isOpen: boolean;
  onClose: () => void;
  tutors: Array<{ id: number; tutor_name: string }>;
  fromTutorId: number;
  replyTo?: Message;
  onSend: (data: MessageCreate) => Promise<void>;
}) {
  const [recipientMode, setRecipientMode] = useState<"all" | "select">("all");
  const [selectedTutorIds, setSelectedTutorIds] = useState<number[]>([]);
  const [recipientDropdownOpen, setRecipientDropdownOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"Normal" | "High" | "Urgent">("Normal");
  const [category, setCategory] = useState<MessageCategory | "">("");
  const [isSending, setIsSending] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const recipientDropdownRef = useRef<HTMLDivElement>(null);

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const result = await messagesAPI.uploadImage(file, fromTutorId);
        newUrls.push(result.url);
      }
      setUploadedImages(prev => [...prev, ...newUrls]);
    } catch (error) {
      console.error('Image upload failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload image');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Reset form when opening — check for saved draft
  useEffect(() => {
    if (isOpen) {
      const draftKey = getDraftKey(replyTo?.id);
      const draft = loadDraft(draftKey);

      const setReplyRecipients = () => {
        if (!replyTo) return;
        if (replyTo.is_group_message && replyTo.to_tutor_ids) {
          // Reply to group: inherit recipients
          setRecipientMode("select");
          setSelectedTutorIds(replyTo.to_tutor_ids);
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
      } else {
        // Compose mode, no draft
        setRecipientMode("all");
        setSelectedTutorIds([]);
        setSubject("");
        setCategory("");
        setMessage("");
        setPriority("Normal");
        setUploadedImages([]);
      }
    }
  }, [isOpen, replyTo]);

  // Auto-save draft (debounced 1s)
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      const draftKey = getDraftKey(replyTo?.id);
      const hasContent = (message && message !== "<p></p>" && message.replace(/<[^>]*>/g, "").trim().length > 0)
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
  // Tiptap returns "<p></p>" for empty content
  const isMessageEmpty = !message || message === "<p></p>" || message.replace(/<[^>]*>/g, "").trim().length === 0;
  const hasUnsavedChanges = !isMessageEmpty || (subject.trim().length > 0 && !replyTo) || uploadedImages.length > 0;

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (confirm("You have unsaved changes. Discard draft?")) {
        clearDraft(getDraftKey(replyTo?.id));
        onClose();
      }
    } else {
      onClose();
    }
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
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 lg:pl-64">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-xl w-full min-w-[320px] max-w-xl sm:max-w-2xl md:max-w-4xl lg:max-w-5xl mx-4 border border-[#e8d4b8] dark:border-[#6b5a4a]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {replyTo ? "Reply" : "New Message"}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* To */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
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
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
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
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
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
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
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
                {replyTo.message.replace(/<[^>]*>/g, "")}
              </div>
            </div>
          )}

          {/* Message */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Message
            </label>
            <InboxRichEditor
              onUpdate={setMessage}
            />
          </div>

          {/* Image Attachments */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleImageUpload(e.target.files)}
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
                  <ImageIcon className="h-4 w-4" />
                )}
                {isUploading ? 'Uploading...' : 'Add Images'}
              </button>
              {uploadedImages.length > 0 && (
                <span className="text-xs text-gray-500">{uploadedImages.length} image(s) attached</span>
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
                      className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
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
              className="px-4 py-2 bg-[#a0704b] hover:bg-[#8b5f3c] text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Thread Item Component - memoized to prevent unnecessary re-renders
const ThreadItem = React.memo(function ThreadItem({
  thread,
  isSelected,
  onClick,
}: {
  thread: MessageThread;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { root_message: msg, replies, total_unread } = thread;
  const hasUnread = total_unread > 0;
  const replyCount = replies.length;
  const latestMessage = replies.length > 0 ? replies[replies.length - 1] : msg;

  const priorityConfig = PRIORITIES[msg.priority as PriorityLevel] || PRIORITIES.Normal;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors min-h-[64px] lg:min-h-0",
        isSelected
          ? "bg-[#f5ede3] dark:bg-[#3d3628]"
          : "hover:bg-[#faf6f1] dark:hover:bg-[#2d2820]",
        hasUnread && "bg-[#fefcf9] dark:bg-[#2a2518]",
        priorityConfig.borderClass
      )}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 88px' }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Sender & Time */}
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn(
              "text-sm truncate",
              hasUnread ? "font-semibold text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-300"
            )}>
              {msg.from_tutor_name || "Unknown"}
            </span>
            {msg.is_pinned && (
              <Star className="h-3 w-3 fill-amber-400 text-amber-400 flex-shrink-0" />
            )}
            {msg.to_tutor_id === null && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                Broadcast
              </span>
            )}
            {msg.is_group_message && (
              <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                Group ({msg.to_tutor_ids?.length || 0})
              </span>
            )}
            {msg.priority !== "Normal" && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                priorityConfig.badgeClass
              )}>
                {priorityConfig.label}
              </span>
            )}
          </div>

          {/* Subject */}
          <div className={cn(
            "text-sm truncate flex items-center gap-1",
            hasUnread ? "font-medium text-gray-800 dark:text-gray-200" : "text-gray-600 dark:text-gray-400"
          )}>
            {msg.category && (
              <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
                {CATEGORIES.find(c => c.filter === msg.category)?.icon}
              </span>
            )}
            <span className="truncate">{msg.subject || "(no subject)"}</span>
          </div>

          {/* Preview */}
          <div className="text-xs text-gray-500 dark:text-gray-500 truncate mt-0.5">
            {(() => {
              const plain = latestMessage.message.replace(/<[^>]*>/g, "").trim();
              return plain.slice(0, 80) + (plain.length > 80 ? "..." : "");
            })()}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimeAgo(latestMessage.created_at)}
            </span>
            {replyCount > 0 && (
              <span className="flex items-center gap-1">
                <Reply className="h-3 w-3" />
                {replyCount}
              </span>
            )}
            {msg.like_count > 0 && (
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {msg.like_count}
              </span>
            )}
          </div>
        </div>

        {/* Unread badge */}
        {hasUnread && (
          <span className="flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center text-[10px] font-bold text-white bg-[#a0704b] rounded-full px-1.5">
            {total_unread}
          </span>
        )}
      </div>
    </button>
  );
});

// Seen Badge Component - WhatsApp-style read receipts
const SeenBadge = React.memo(function SeenBadge({
  message,
  currentTutorId,
}: {
  message: Message;
  currentTutorId: number;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Only show for sender's own messages
  if (message.from_tutor_id !== currentTutorId) {
    return null;
  }

  const readReceipts = message.read_receipts || [];
  const readCount = readReceipts.length;
  const totalRecipients = message.total_recipients || 0;
  const readByAll = message.read_by_all || false;
  const hasBeenRead = readCount > 0;

  // Determine checkmark color and style
  // Gray single check = sent (no one read)
  // Gray double check = read by some (for broadcasts)
  // Blue double check = read by all / read by recipient
  const isBlue = readByAll;
  const checkColor = isBlue ? "text-blue-500" : "text-gray-400 dark:text-gray-500";

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setShowPopover(!showPopover)}
        className={cn(
          "flex items-center gap-0.5 text-xs transition-colors hover:opacity-80",
          checkColor
        )}
        title={readByAll ? "Seen by all" : hasBeenRead ? `Seen by ${readCount}` : "Sent"}
      >
        {/* Double checkmark SVG for read, single for sent */}
        {hasBeenRead ? (
          <svg
            viewBox="0 0 16 11"
            width="16"
            height="11"
            className={checkColor}
            fill="currentColor"
          >
            {/* Double checkmark */}
            <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.136.473.473 0 0 0-.323.137.473.473 0 0 0-.137.323c0 .126.046.236.137.327l2.727 2.591a.46.46 0 0 0 .327.136.476.476 0 0 0 .381-.178l6.5-8.045a.426.426 0 0 0 .102-.31.414.414 0 0 0-.098-.285z" />
            <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.005-.951a.457.457 0 0 0-.312-.123.469.469 0 0 0-.327.137.473.473 0 0 0-.137.323c0 .126.046.236.137.327l1.327 1.259a.46.46 0 0 0 .327.136.476.476 0 0 0 .381-.178l6.5-8.045a.426.426 0 0 0 .102-.31.414.414 0 0 0-.118-.287z" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 12 11"
            width="12"
            height="11"
            className={checkColor}
            fill="currentColor"
          >
            {/* Single checkmark */}
            <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.136.473.473 0 0 0-.323.137.473.473 0 0 0-.137.323c0 .126.046.236.137.327l2.727 2.591a.46.46 0 0 0 .327.136.476.476 0 0 0 .381-.178l6.5-8.045a.426.426 0 0 0 .102-.31.414.414 0 0 0-.098-.285z" />
          </svg>
        )}
      </button>

      {/* Popover showing who read the message */}
      {showPopover && hasBeenRead && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPopover(false)}
          />
          {/* Popover content */}
          <div
            ref={popoverRef}
            className="absolute top-full right-0 mt-2 z-50 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-[#e8d4b8] dark:border-[#6b5a4a] py-2 min-w-[180px] max-w-[250px]"
          >
            <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              Seen by {readCount}{totalRecipients > 1 ? ` of ${totalRecipients}` : ""}
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {readReceipts.map((receipt) => (
                <div
                  key={receipt.tutor_id}
                  className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Check className="h-3 w-3 text-blue-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {receipt.tutor_name}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {new Date(receipt.read_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// Likes Badge Component - shows who liked a message in a popover
const LikesBadge = React.memo(function LikesBadge({
  message,
}: {
  message: Message;
}) {
  const [showPopover, setShowPopover] = useState(false);

  const likeDetails = message.like_details || [];
  if (likeDetails.length === 0) return null;

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setShowPopover(!showPopover)}
        className="text-sm text-red-500 hover:opacity-80 transition-opacity"
        title={`Liked by ${likeDetails.length}`}
      >
        {likeDetails.length}
      </button>

      {showPopover && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPopover(false)}
          />
          <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-[#e8d4b8] dark:border-[#6b5a4a] py-2 min-w-[180px] max-w-[250px]">
            <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              Liked by {likeDetails.length}
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {likeDetails.map((detail) => (
                <div
                  key={detail.tutor_id}
                  className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Heart className="h-3 w-3 text-red-500 fill-current flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {detail.tutor_name}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {new Date(detail.liked_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// Thread Detail Panel Component - memoized to prevent unnecessary re-renders
const ThreadDetailPanel = React.memo(function ThreadDetailPanel({
  thread,
  currentTutorId,
  onClose,
  onReply,
  onLike,
  onMarkRead,
  onMarkUnread,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  onPin,
  onUnpin,
  isArchived = false,
  isMobile = false,
}: {
  thread: MessageThread;
  currentTutorId: number;
  onClose: () => void;
  onReply: (msg: Message) => void;
  onLike: (msgId: number) => void;
  onMarkRead: (msgId: number) => void;
  onMarkUnread: (msgId: number) => void;
  onEdit: (msgId: number, newText: string, imageAttachments?: string[]) => Promise<void>;
  onDelete: (msgId: number) => Promise<void>;
  onArchive: (msgId: number) => Promise<void>;
  onUnarchive: (msgId: number) => Promise<void>;
  onPin: (msgId: number) => Promise<void>;
  onUnpin: (msgId: number) => Promise<void>;
  isArchived?: boolean;
  isMobile?: boolean;
}) {
  const { root_message: msg, replies } = thread;
  const allMessages = [msg, ...replies];

  // Swipe gesture for mobile - swipe right to close
  const swipeHandlers = useSwipeGesture({
    onSwipeRight: isMobile ? onClose : undefined,
    threshold: 80,
  });

  // Edit state
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [isEditUploading, setIsEditUploading] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when thread opens
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, [thread]);

  // Mark messages as read when viewing
  useEffect(() => {
    allMessages.forEach((m) => {
      if (!m.is_read) {
        onMarkRead(m.id);
      }
    });
  }, [allMessages, onMarkRead]);

  const startEdit = (m: Message) => {
    setEditingMessageId(m.id);
    setEditText(m.message);
    setEditImages(m.image_attachments || []);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText("");
    setEditImages([]);
  };

  const saveEdit = async () => {
    if (!editingMessageId || !editText || editText === "<p></p>") return;
    setIsSaving(true);
    try {
      await onEdit(editingMessageId, editText, editImages);
      setEditingMessageId(null);
      setEditText("");
      setEditImages([]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsEditUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const result = await messagesAPI.uploadImage(file, currentTutorId);
        setEditImages(prev => [...prev, result.url]);
      }
    } catch (error) {
      console.error('Image upload failed:', error);
    } finally {
      setIsEditUploading(false);
      if (editFileInputRef.current) editFileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="h-full flex flex-col bg-white dark:bg-[#1a1a1a]"
      {...(isMobile ? swipeHandlers : {})}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {msg.category && (
              <span className="text-[#a0704b] flex-shrink-0">
                {CATEGORIES.find(c => c.filter === msg.category)?.icon}
              </span>
            )}
            <h2 className="font-semibold text-gray-900 dark:text-white truncate">
              {msg.subject || "(no subject)"}
            </h2>
            {msg.priority && msg.priority !== "Normal" && (
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0",
                PRIORITIES[msg.priority as PriorityLevel]?.badgeClass
              )}>
                {msg.priority}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500">
            {allMessages.length} message{allMessages.length !== 1 && "s"}
          </div>
        </div>
        <button
          onClick={() => msg.is_read ? onMarkUnread(msg.id) : onMarkRead(msg.id)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg transition-colors",
            msg.is_read
              ? "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              : "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          )}
          title={msg.is_read ? "Mark as unread" : "Mark as read"}
        >
          {msg.is_read ? <Circle className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
        </button>
        <button
          onClick={() => msg.is_pinned ? onUnpin(msg.id) : onPin(msg.id)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg transition-colors",
            msg.is_pinned
              ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
          title={msg.is_pinned ? "Unstar" : "Star"}
        >
          <Star className={cn("h-4 w-4", msg.is_pinned && "fill-amber-400")} />
        </button>
        {isArchived ? (
          <button
            onClick={() => onUnarchive(msg.id)}
            className="flex items-center gap-1.5 px-2 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm rounded-lg transition-colors"
            title="Unarchive"
          >
            <ArchiveRestore className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => onArchive(msg.id)}
            className="flex items-center gap-1.5 px-2 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm rounded-lg transition-colors"
            title="Archive"
          >
            <Archive className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => onReply(msg)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#a0704b] hover:bg-[#8b5f3c] text-white text-sm rounded-lg transition-colors"
        >
          <Reply className="h-4 w-4" />
          Reply
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {allMessages.map((m, idx) => {
          const isOwn = m.from_tutor_id === currentTutorId;
          const isEditing = editingMessageId === m.id;
          const isBroadcast = m.to_tutor_id === null;
          const isGroup = m.is_group_message;

          return (
            <div
              key={m.id}
              className={cn(
                "p-4 rounded-lg border",
                isOwn
                  ? "bg-[#f5ede3] dark:bg-[#3d3628] border-[#e8d4b8] dark:border-[#6b5a4a] ml-8"
                  : isBroadcast
                  ? "bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/30"
                  : isGroup
                  ? "bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30"
                  : "bg-white dark:bg-[#2a2a2a] border-[#e8d4b8] dark:border-[#6b5a4a]"
              )}
            >
              {/* Message header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <span className="font-medium text-gray-900 dark:text-white truncate">
                    {m.from_tutor_name || "Unknown"}
                  </span>
                  <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">→</span>
                  <span className="text-gray-600 dark:text-gray-400 truncate">
                    {m.to_tutor_id === null ? "All" : m.to_tutor_name || "Unknown"}
                  </span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0 whitespace-nowrap flex items-center gap-1">
                  {new Date(m.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                  {m.updated_at && (
                    <span className="text-gray-400 dark:text-gray-500 italic">(edited)</span>
                  )}
                  <SeenBadge message={m} currentTutorId={currentTutorId} />
                </span>
              </div>

              {/* Message body - editable for own messages */}
              {isEditing ? (
                <div className="space-y-2">
                  <InboxRichEditor
                    onUpdate={setEditText}
                    initialContent={editText}
                    minHeight="100px"
                  />
                  {/* Image attachments for edit mode */}
                  <div>
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleEditImageUpload(e.target.files)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => editFileInputRef.current?.click()}
                      disabled={isEditUploading}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isEditUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImageIcon className="h-4 w-4" />
                      )}
                      {isEditUploading ? 'Uploading...' : 'Add Images'}
                    </button>
                    {editImages.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {editImages.map((url, index) => (
                          <div key={url} className="relative group">
                            <img
                              src={url}
                              alt={`Attachment ${index + 1}`}
                              className="h-16 w-16 object-cover rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]"
                            />
                            <button
                              type="button"
                              onClick={() => setEditImages(prev => prev.filter((_, i) => i !== index))}
                              className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={isSaving || !editText || editText === "<p></p>" || editText.replace(/<[^>]*>/g, "").trim().length === 0}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#a0704b] hover:bg-[#8b5f3c] text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={isSaving}
                      className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : /<[a-z][\s\S]*>/i.test(m.message) ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
                  dangerouslySetInnerHTML={{ __html: m.message }}
                />
              ) : (
                <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {m.message}
                </div>
              )}

              {/* Image attachments */}
              {m.image_attachments && m.image_attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.image_attachments.map((url, idx) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={url}
                        alt={`Attachment ${idx + 1}`}
                        className="max-h-48 max-w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:opacity-90 transition-opacity cursor-pointer"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              )}

              {/* Proposal embed for MakeupConfirmation messages */}
              {m.category === "MakeupConfirmation" && (
                <ProposalEmbed messageText={m.message} currentTutorId={currentTutorId} />
              )}

              {/* Message footer */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onLike(m.id)}
                    className={cn(
                      "flex items-center text-sm transition-colors",
                      m.is_liked_by_me
                        ? "text-red-500"
                        : "text-gray-500 hover:text-red-500"
                    )}
                  >
                    <Heart className={cn("h-4 w-4", m.is_liked_by_me && "fill-current")} />
                  </button>
                  <LikesBadge message={m} />
                </div>
                {isOwn && !isEditing && (
                  <>
                    <button
                      onClick={() => startEdit(m)}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#a0704b] transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("Are you sure you want to delete this message?")) {
                          onDelete(m.id);
                        }
                      }}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </>
                )}
                {idx === allMessages.length - 1 && (
                  <button
                    onClick={() => onReply(msg)}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#a0704b] transition-colors"
                  >
                    <Reply className="h-4 w-4" />
                    Reply
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default function InboxPage() {
  usePageTitle("Inbox");

  const searchParams = useSearchParams();
  const { selectedLocation } = useLocation();
  const { user, isImpersonating, impersonatedTutor, effectiveRole, isAdmin, isSupervisor, isGuest } = useAuth();
  const { data: tutors = [] } = useActiveTutors();  // For ComposeModal recipient selection
  const { showToast } = useToast();

  // Get initial category from URL param
  const initialCategory = useMemo(() => {
    const categoryParam = searchParams.get("category");
    if (categoryParam) {
      // Find category by filter value (e.g., "MakeupConfirmation")
      const found = CATEGORIES.find(c => c.filter === categoryParam);
      if (found) return found.id;
    }
    return "inbox";
  }, [searchParams]);

  // Effective tutor ID: own ID, or impersonated tutor ID for Super Admin
  const effectiveTutorId = useMemo(() => {
    if (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id) {
      return impersonatedTutor.id;
    }
    return user?.id ?? null;
  }, [isImpersonating, effectiveRole, impersonatedTutor, user?.id]);

  // State
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showWecom, setShowWecom] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | undefined>();
  const [isMobile, setIsMobile] = useState(false);
  const [categoryCollapsed, setCategoryCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024
  );
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);  // Debounce search by 300ms

  // Derived value for tutor selection check
  const hasTutor = typeof effectiveTutorId === "number";
  const tutorId = hasTutor ? effectiveTutorId : null;

  // Get category filter
  const categoryFilter = useMemo(() => {
    const cat = CATEGORIES.find(c => c.id === selectedCategory);
    return cat?.filter;
  }, [selectedCategory]);

  // Fetch data with pagination and server-side search
  const {
    data: threads,
    isLoading: loadingThreads,
    isLoadingMore,
    error: threadsError,
    hasMore,
    totalCount,
    loadMore
  } = useMessageThreadsPaginated({
    tutorId: (selectedCategory === "sent" || selectedCategory === "archived" || selectedCategory === "starred") ? null : tutorId,
    category: categoryFilter,
    search: debouncedSearch || undefined,
    pageSize: 20,
  });

  // Fetch ALL threads (no category filter) for sidebar badge counts
  const { data: allThreads = [] } = useMessageThreads(tutorId, undefined);

  const { data: sentMessages = [], isLoading: loadingSent } = useSentMessages(
    selectedCategory === "sent" ? tutorId : null
  );

  const { data: archivedThreads = [], isLoading: loadingArchived } = useArchivedMessages(
    selectedCategory === "archived" ? tutorId : null
  );

  const { data: pinnedThreads = [], isLoading: loadingPinned } = usePinnedMessages(
    selectedCategory === "starred" ? tutorId : null
  );

  const { data: unreadCount } = useUnreadMessageCount(tutorId);

  // Fetch proposals for makeup-confirmation category
  const { data: proposals = [], isLoading: loadingProposals, error: proposalsError } = useProposals({
    tutorId: selectedCategory === "makeup-confirmation" && hasTutor ? effectiveTutorId : undefined,
    status: "pending",
    includeSession: true,
  });

  // State for ScheduleMakeupModal (for needs_input proposals)
  const [makeupModalSession, setMakeupModalSession] = useState<Session | null>(null);

  // Convert sent messages to thread format for display
  const sentAsThreads: MessageThread[] = useMemo(() => {
    return sentMessages.map(msg => ({
      root_message: msg,
      replies: [],
      total_unread: 0,
    }));
  }, [sentMessages]);

  // Determine which data to show
  // Search is now server-side for threads, but still client-side for sent/archived
  const displayThreads = useMemo(() => {
    if (selectedCategory === "sent") {
      // Client-side filtering for sent messages (not paginated)
      if (!debouncedSearch.trim()) return sentAsThreads;
      const query = debouncedSearch.toLowerCase();
      return sentAsThreads.filter(thread => {
        const msg = thread.root_message;
        return (
          msg.subject?.toLowerCase().includes(query) ||
          msg.message.toLowerCase().includes(query) ||
          msg.to_tutor_name?.toLowerCase().includes(query)
        );
      });
    }
    if (selectedCategory === "archived") {
      // Client-side filtering for archived messages
      if (!debouncedSearch.trim()) return archivedThreads;
      const query = debouncedSearch.toLowerCase();
      return archivedThreads.filter(thread => {
        const msg = thread.root_message;
        return (
          msg.subject?.toLowerCase().includes(query) ||
          msg.message.toLowerCase().includes(query) ||
          msg.from_tutor_name?.toLowerCase().includes(query)
        );
      });
    }
    if (selectedCategory === "starred") {
      // Client-side filtering for pinned/starred messages
      if (!debouncedSearch.trim()) return pinnedThreads;
      const query = debouncedSearch.toLowerCase();
      return pinnedThreads.filter(thread => {
        const msg = thread.root_message;
        return (
          msg.subject?.toLowerCase().includes(query) ||
          msg.message.toLowerCase().includes(query) ||
          msg.from_tutor_name?.toLowerCase().includes(query)
        );
      });
    }
    // For inbox/other categories, threads already filtered server-side
    return threads;
  }, [selectedCategory, sentAsThreads, archivedThreads, pinnedThreads, threads, debouncedSearch]);

  // Filter MakeupConfirmation threads for makeup-confirmation category
  const makeupThreads = useMemo(() => {
    if (selectedCategory !== "makeup-confirmation") return [];
    let filtered = threads.filter(t => t.root_message.category === "MakeupConfirmation");

    // Apply search filter if present
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter(thread => {
        const msg = thread.root_message;
        return (
          msg.subject?.toLowerCase().includes(query) ||
          msg.message.toLowerCase().includes(query) ||
          msg.from_tutor_name?.toLowerCase().includes(query)
        );
      });
    }
    return filtered;
  }, [threads, selectedCategory, debouncedSearch]);

  // Calculate per-category unread counts from all threads (not filtered by category)
  const categoryUnreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allThreads.forEach(thread => {
      if (thread.total_unread > 0) {
        const cat = thread.root_message.category;
        // Map to category id
        const catId = cat ? CATEGORIES.find(c => c.filter === cat)?.id : null;
        if (catId) {
          counts[catId] = (counts[catId] || 0) + thread.total_unread;
        }
        // Also count toward inbox (all messages)
        counts.inbox = (counts.inbox || 0) + thread.total_unread;
      }
    });
    return counts;
  }, [allThreads]);

  const isLoading = selectedCategory === "sent"
    ? loadingSent
    : selectedCategory === "makeup-confirmation"
    ? loadingProposals
    : selectedCategory === "archived"
    ? loadingArchived
    : selectedCategory === "starred"
    ? loadingPinned
    : loadingThreads;

  // Sync selectedThread with latest data from SWR
  // Use a ref to track the selected thread ID to avoid stale closure issues
  const selectedThreadId = selectedThread?.root_message.id;
  useEffect(() => {
    if (selectedThreadId) {
      const updatedThread = displayThreads.find(
        t => t.root_message.id === selectedThreadId
      );
      if (updatedThread) {
        setSelectedThread(updatedThread);
      }
    }
  }, [displayThreads, selectedThreadId]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Clear selection when category changes
  useEffect(() => {
    setSelectedThread(null);
  }, [selectedCategory]);

  // Browser notifications setup (toast is now handled app-wide in Sidebar)
  const { permission: notifPermission, requestPermission, sendNotification } = useBrowserNotifications();
  const prevUnreadRef = useRef<number | null>(null);

  // Request notification permission on first visit (only once)
  useEffect(() => {
    if (notifPermission === 'default') {
      requestPermission();
    }
  }, [notifPermission, requestPermission]);

  // Browser notification on new messages (toast handled in Sidebar)
  useEffect(() => {
    if (unreadCount?.count !== undefined) {
      if (prevUnreadRef.current !== null && unreadCount.count > prevUnreadRef.current) {
        const newCount = unreadCount.count - prevUnreadRef.current;
        // Browser notification (only if tab not visible)
        sendNotification('New Message', {
          body: `You have ${newCount} new message${newCount > 1 ? 's' : ''} in your inbox`,
          icon: '/favicon.ico'
        });
      }
      prevUnreadRef.current = unreadCount.count;
    }
  }, [unreadCount?.count, sendNotification]);

  // Page title badge with unread count
  useEffect(() => {
    const count = unreadCount?.count || 0;
    document.title = count > 0 ? `(${count}) Inbox` : 'Inbox';
    return () => { document.title = 'TMS'; };
  }, [unreadCount?.count]);

  // Handlers
  const handleSendMessage = useCallback(async (data: MessageCreate) => {
    if (tutorId === null) return;

    try {
      await messagesAPI.create(data, tutorId);
      showToast("Message sent!", "success");
      // Refresh data
      mutate(isAnyMessageKey);
    } catch (error) {
      showToast("Failed to send message", "error");
      throw error;
    }
  }, [tutorId, showToast]);

  const handleLike = useCallback(async (messageId: number) => {
    if (tutorId === null) return;

    try {
      await messagesAPI.toggleLike(messageId, tutorId);
      mutate(isThreadsKey);
    } catch (error) {
      showToast("Failed to toggle like", "error");
    }
  }, [tutorId, showToast]);

  // Shared helper for mark read/unread optimistic updates
  const createReadStatusUpdaters = useCallback((messageId: number, setReadTo: boolean) => {
    const updateMessage = (m: Message): Message =>
      m.id === messageId ? { ...m, is_read: setReadTo } : m;

    const updateThread = (t: MessageThread): MessageThread => {
      const rootUpdated = updateMessage(t.root_message);
      const repliesUpdated = t.replies.map(updateMessage);
      const wasOpposite = setReadTo
        ? (t.root_message.id === messageId ? !t.root_message.is_read : t.replies.some(r => r.id === messageId && !r.is_read))
        : (t.root_message.id === messageId ? t.root_message.is_read : t.replies.some(r => r.id === messageId && r.is_read));
      const countDelta = wasOpposite ? (setReadTo ? -1 : 1) : 0;
      return {
        ...t,
        root_message: rootUpdated,
        replies: repliesUpdated,
        total_unread: Math.max(0, t.total_unread + countDelta)
      };
    };

    return { updateThread };
  }, []);

  const handleMarkRead = useCallback(async (messageId: number) => {
    if (tutorId === null) return;

    const { updateThread } = createReadStatusUpdaters(messageId, true);

    // Optimistic updates
    mutate(isThreadsKey, (data: MessageThread[] | undefined) => Array.isArray(data) ? data.map(updateThread) : data, { revalidate: false });
    mutate(isUnreadKey, (data: { count: number } | undefined) => data ? { count: Math.max(0, data.count - 1) } : data, { revalidate: false });
    setSelectedThread(prev => prev ? updateThread(prev) : prev);

    try {
      await messagesAPI.markRead(messageId, tutorId);
      mutate((key) => isThreadsKey(key) || isUnreadKey(key));
    } catch {
      mutate((key) => isThreadsKey(key) || isUnreadKey(key));
    }
  }, [tutorId, createReadStatusUpdaters]);

  const handleMarkUnread = useCallback(async (messageId: number) => {
    if (tutorId === null) return;

    // Close the thread panel so auto-read effect doesn't immediately mark it read again
    setSelectedThread(null);

    const { updateThread } = createReadStatusUpdaters(messageId, false);

    // Optimistic updates
    mutate(isThreadsKey, (data: MessageThread[] | undefined) => Array.isArray(data) ? data.map(updateThread) : data, { revalidate: false });
    mutate(isUnreadKey, (data: { count: number } | undefined) => data ? { count: data.count + 1 } : data, { revalidate: false });
    setSelectedThread(prev => prev ? updateThread(prev) : prev);

    try {
      await messagesAPI.markUnread(messageId, tutorId);
      mutate((key) => isThreadsKey(key) || isUnreadKey(key));
    } catch {
      mutate((key) => isThreadsKey(key) || isUnreadKey(key));
    }
  }, [tutorId, createReadStatusUpdaters]);

  const handleReply = useCallback((msg: Message) => {
    setReplyTo(msg);
    setShowCompose(true);
  }, []);

  const handleCompose = useCallback(() => {
    setReplyTo(undefined);
    setShowCompose(true);
  }, []);

  const handleEdit = useCallback(async (messageId: number, newText: string, imageAttachments?: string[]) => {
    if (tutorId === null) return;

    try {
      await messagesAPI.update(messageId, newText, tutorId, imageAttachments);
      showToast("Message updated!", "success");
      mutate(isThreadsKey);
    } catch (error) {
      showToast("Failed to update message", "error");
      throw error;
    }
  }, [tutorId, showToast]);

  const handleDelete = useCallback(async (messageId: number) => {
    if (tutorId === null) return;

    // Optimistic update - remove thread from SWR cache immediately
    mutate(isThreadsKey, (data: MessageThread[] | undefined) => data?.filter(t => t.root_message.id !== messageId), { revalidate: false });
    mutate(isSentKey, (data: Message[] | undefined) => data?.filter(m => m.id !== messageId), { revalidate: false });
    setSelectedThread(null);

    try {
      await messagesAPI.delete(messageId, tutorId);
      showToast("Message deleted!", "success");
      mutate(isAnyMessageKey);
    } catch (error) {
      showToast("Failed to delete message", "error");
      mutate((key) => isThreadsKey(key) || isSentKey(key));
      throw error;
    }
  }, [tutorId, showToast]);

  const handleArchive = useCallback(async (messageId: number) => {
    if (tutorId === null) return;

    // Close thread panel first
    setSelectedThread(null);

    try {
      await messagesAPI.archive([messageId], tutorId);
      showToast("Message archived!", "success");
      // Revalidate both inbox and archived lists
      mutate(isAnyMessageKey);
      mutate(['archived-messages', tutorId]);
    } catch (error) {
      showToast("Failed to archive message", "error");
      throw error;
    }
  }, [tutorId, showToast]);

  const handleUnarchive = useCallback(async (messageId: number) => {
    if (tutorId === null) return;

    // Close thread panel first
    setSelectedThread(null);

    try {
      await messagesAPI.unarchive([messageId], tutorId);
      showToast("Message unarchived!", "success");
      // Revalidate both inbox and archived lists
      mutate(isAnyMessageKey);
      mutate(['archived-messages', tutorId]);
    } catch (error) {
      showToast("Failed to unarchive message", "error");
      throw error;
    }
  }, [tutorId, showToast]);

  const handlePin = useCallback(async (messageId: number) => {
    if (tutorId === null) return;

    try {
      await messagesAPI.pin([messageId], tutorId);
      showToast("Message starred!", "success");
      mutate(isAnyMessageKey);
      mutate(['pinned-messages', tutorId]);
    } catch (error) {
      showToast("Failed to star message", "error");
      throw error;
    }
  }, [tutorId, showToast]);

  const handleUnpin = useCallback(async (messageId: number) => {
    if (tutorId === null) return;

    // If in starred view, close thread panel (thread will disappear)
    if (selectedCategory === "starred") {
      setSelectedThread(null);
    }

    try {
      await messagesAPI.unpin([messageId], tutorId);
      showToast("Message unstarred!", "success");
      mutate(isAnyMessageKey);
      mutate(['pinned-messages', tutorId]);
    } catch (error) {
      showToast("Failed to unstar message", "error");
      throw error;
    }
  }, [tutorId, showToast, selectedCategory]);

  if (isSupervisor || isGuest) {
    return (
      <DeskSurface fullHeight>
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-foreground/60">
          <Inbox className="h-12 w-12 text-red-500/50" />
          <p>Access denied — {effectiveRole} role cannot access the Inbox</p>
        </div>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface fullHeight>
      <PageTransition className="h-full">
        <div className="h-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm border-b border-[#e8d4b8] dark:border-[#6b5a4a] px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Inbox className="h-6 w-6 text-[#a0704b]" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Inbox</h1>
                  {isImpersonating && impersonatedTutor && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Viewing as: {impersonatedTutor.name}
                    </p>
                  )}
                </div>
                {unreadCount && unreadCount.count > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold text-white bg-[#a0704b] rounded-full">
                    {unreadCount.count}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <button
                    onClick={() => setShowWecom(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-[#d4a574] dark:border-[#8b6f47] text-[#a0704b] dark:text-[#c4a77d] hover:bg-[#f5e6d3] dark:hover:bg-[#3d2e1e] rounded-lg transition-colors"
                    title="Send to WeCom group"
                  >
                    <MessageSquareShare className="h-4 w-4" />
                    <span className="hidden sm:inline">WeCom</span>
                  </button>
                )}
                <button
                  onClick={handleCompose}
                  disabled={!hasTutor}
                  className="flex items-center gap-2 px-4 py-2 bg-[#a0704b] hover:bg-[#8b5f3c] text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <PenSquare className="h-4 w-4" />
                  Compose
                </button>
              </div>
            </div>
          </div>

          {/* Main content - 3 panel layout */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left panel - Categories */}
            <div className={cn(
              "h-full flex-shrink-0 border-r border-[#e8d4b8] dark:border-[#6b5a4a] bg-white/50 dark:bg-[#1a1a1a]/50 transition-all duration-200 overflow-y-auto",
              categoryCollapsed ? "w-12" : "w-48",
              isMobile && selectedThread && "hidden"
            )}>
              <div className="p-2">
                <button
                  onClick={() => setCategoryCollapsed(!categoryCollapsed)}
                  className="w-full flex items-center justify-center p-2 rounded-lg text-gray-500 hover:bg-[#faf6f1] dark:hover:bg-[#2d2820] mb-1"
                  title={categoryCollapsed ? "Expand" : "Collapse"}
                >
                  {categoryCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </button>
                <nav>
                  {CATEGORY_SECTIONS.map((section, sectionIdx) => (
                    <div key={section.id}>
                      {sectionIdx > 0 && (
                        categoryCollapsed ? (
                          <div className="my-2 mx-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a]" />
                        ) : (
                          <div className="mt-3 mb-1 px-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                              {section.label}
                            </span>
                          </div>
                        )
                      )}
                      <div className="space-y-1">
                        {section.items.map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors min-h-[44px]",
                              categoryCollapsed && "justify-center px-2",
                              selectedCategory === cat.id
                                ? "bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b] font-medium"
                                : "text-gray-700 dark:text-gray-300 hover:bg-[#faf6f1] dark:hover:bg-[#2d2820]"
                            )}
                            title={categoryCollapsed ? cat.label : undefined}
                          >
                            <span className="relative">
                              {cat.icon}
                              {categoryCollapsed && categoryUnreadCounts[cat.id] > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center text-[9px] font-bold text-white bg-[#a0704b] rounded-full px-0.5">
                                  {categoryUnreadCounts[cat.id] > 99 ? "99+" : categoryUnreadCounts[cat.id]}
                                </span>
                              )}
                            </span>
                            {!categoryCollapsed && (
                              <>
                                <span className="flex-1">{cat.label}</span>
                                {categoryUnreadCounts[cat.id] > 0 && (
                                  <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-[#a0704b] rounded-full px-1">
                                    {categoryUnreadCounts[cat.id] > 99 ? "99+" : categoryUnreadCounts[cat.id]}
                                  </span>
                                )}
                              </>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>
              </div>
            </div>

            {/* Middle panel - Thread list */}
            <div className={cn(
              "flex-1 min-w-0 min-h-0 bg-white/90 dark:bg-[#1a1a1a]/30 flex flex-col",
              isMobile && selectedThread && "hidden"
            )}>
              {/* Search bar */}
              <div className="flex-shrink-0 p-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search messages..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white placeholder-gray-400"
                    />
                  </div>
                  {displayThreads.some(t => t.total_unread > 0) && selectedCategory !== "sent" && selectedCategory !== "archived" && selectedCategory !== "starred" && (
                    <button
                      onClick={async () => {
                        if (!hasTutor || tutorId === null) return;
                        try {
                          await messagesAPI.markAllRead(tutorId, categoryFilter || undefined);
                          mutate((key) => isThreadsKey(key) || isUnreadKey(key));
                        } catch {
                          showToast("Failed to mark all as read", "error");
                        }
                      }}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      title="Mark all as read"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Mark all read</span>
                    </button>
                  )}
                </div>
              </div>
              {isLoading ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="animate-pulse rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="h-4 w-1/3 bg-gray-300 dark:bg-gray-600 rounded" />
                          <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
                        </div>
                        <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (threadsError || proposalsError) ? (
                <div className="flex-1 flex items-center justify-center text-red-500">
                  <AlertCircle className="h-6 w-6 mr-2" />
                  Failed to load {selectedCategory === "makeup-confirmation" ? "proposals" : "messages"}
                </div>
              ) : (selectedCategory === "makeup-confirmation" ? (proposals.length === 0 && makeupThreads.length === 0) : displayThreads.length === 0) ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-500">
                  <div className="text-center">
                    {selectedCategory === "makeup-confirmation" ? (
                      <CalendarClock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    ) : (
                      <Inbox className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    )}
                    <p>
                      {searchQuery
                        ? "No messages match your search"
                        : EMPTY_MESSAGES[selectedCategory] || "No messages in your inbox"}
                    </p>
                  </div>
                </div>
              ) : selectedCategory === "makeup-confirmation" ? (
                // Make-up category: show proposals + message threads
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Pending proposals (actionable) */}
                  {proposals.length > 0 && (
                    <>
                      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Pending Confirmations
                      </h3>
                      {proposals.map((proposal) => (
                        <ProposalCard
                          key={proposal.id}
                          proposal={proposal}
                          currentTutorId={tutorId ?? 0}
                          onSelectSlot={() => {
                            // For needs_input proposals, open ScheduleMakeupModal
                            if (proposal.original_session) {
                              setMakeupModalSession(proposal.original_session);
                            }
                          }}
                        />
                      ))}
                    </>
                  )}
                  {/* Message threads (informational notifications) */}
                  {makeupThreads.length > 0 && (
                    <>
                      <h3 className={cn(
                        "text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide",
                        proposals.length > 0 && "mt-4"
                      )}>
                        Notifications
                      </h3>
                      {makeupThreads.map((thread) => (
                        <ThreadItem
                          key={thread.root_message.id}
                          thread={thread}
                          isSelected={selectedThread?.root_message.id === thread.root_message.id}
                          onClick={() => setSelectedThread(thread)}
                        />
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {displayThreads.map((thread) => (
                    <ThreadItem
                      key={thread.root_message.id}
                      thread={thread}
                      isSelected={selectedThread?.root_message.id === thread.root_message.id}
                      onClick={() => setSelectedThread(thread)}
                    />
                  ))}
                  {/* Load More button for paginated threads (not for sent or archived) */}
                  {selectedCategory !== "sent" && selectedCategory !== "archived" && selectedCategory !== "starred" && hasMore && displayThreads.length > 0 && (
                    <div className="p-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                      <button
                        onClick={loadMore}
                        disabled={isLoadingMore}
                        className="w-full py-2 px-4 text-sm text-[#a0704b] dark:text-[#c4a77d] hover:bg-[#f5ebe0] dark:hover:bg-[#3a3a3a] rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading more...
                          </>
                        ) : (
                          <>Load more ({totalCount - displayThreads.length} remaining)</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right panel - Thread detail */}
            {selectedThread && hasTutor && (
              <div className={cn(
                "h-full border-l border-[#e8d4b8] dark:border-[#6b5a4a]",
                isMobile ? "fixed inset-0 z-40" : "w-[450px] xl:w-[550px] flex-shrink-0"
              )}>
                <ThreadDetailPanel
                  thread={selectedThread}
                  currentTutorId={effectiveTutorId}
                  onClose={() => setSelectedThread(null)}
                  onReply={handleReply}
                  onLike={handleLike}
                  onMarkRead={handleMarkRead}
                  onMarkUnread={handleMarkUnread}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onArchive={handleArchive}
                  onUnarchive={handleUnarchive}
                  onPin={handlePin}
                  onUnpin={handleUnpin}
                  isArchived={selectedCategory === "archived"}
                  isMobile={isMobile}
                />
              </div>
            )}
          </div>
        </div>
      </PageTransition>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={showCompose}
        onClose={() => setShowCompose(false)}
        tutors={tutors}
        fromTutorId={tutorId ?? 0}
        replyTo={replyTo}
        onSend={handleSendMessage}
      />

      {/* WeCom Send Modal */}
      <SendToWecomModal
        isOpen={showWecom}
        onClose={() => setShowWecom(false)}
      />

      {/* Schedule Makeup Modal for needs_input proposals */}
      {makeupModalSession && (
        <ScheduleMakeupModal
          session={makeupModalSession}
          isOpen={!!makeupModalSession}
          onClose={() => setMakeupModalSession(null)}
        />
      )}
    </DeskSurface>
  );
}
