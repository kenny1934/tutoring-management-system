"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useLocation } from "@/contexts/LocationContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useMessageThreads, useMessageThreadsPaginated, useSentMessages, useUnreadMessageCount, useDebouncedValue, useBrowserNotifications, useProposals, useClickOutside, useActiveTutors, useArchivedMessages, usePinnedMessages } from "@/lib/hooks";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { useToast } from "@/contexts/ToastContext";
import { messagesAPI } from "@/lib/api";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/formatters";
import { mutate } from "swr";
import type { Message, MessageThread, MessageCreate, MessageCategory, MakeupProposal, Session, PaginatedThreadsResponse } from "@/types";
import { ProposalCard } from "@/components/inbox/ProposalCard";
import { ProposalEmbed } from "@/components/inbox/ProposalEmbed";
import { LinkPreview } from "@/components/inbox/LinkPreview";
import { ScheduleMakeupModal } from "@/components/sessions/ScheduleMakeupModal";
import SendToWecomModal from "@/components/wecom/SendToWecomModal";
import InboxRichEditor from "@/components/inbox/InboxRichEditor";
import type { MentionUser } from "@/components/inbox/InboxRichEditor";
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
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
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
  Paperclip,
  MessageSquareShare,
  Star,
  Users,
  MessageSquarePlus,
  FileText,
  Download,
  Volume2,
  VolumeX,
  Forward,
  CheckSquare,
  Square,
  ListChecks,
  Smile,
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
      { id: "feedback", label: "Feedback", icon: <MessageSquarePlus className="h-4 w-4" />, filter: "Feedback" },
    ],
  },
];

// Flat list for consumers (unread counts, category filter lookups, etc.)
const CATEGORIES: Category[] = CATEGORY_SECTIONS.flatMap(s => s.items);

// Format message timestamp: time-only for today, short date for this year, full for older
function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } else if (isThisYear) {
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

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
  { value: "Feedback", label: "Feedback", icon: <MessageSquarePlus className="h-4 w-4" /> },
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
const isArchivedKey = (key: unknown) => Array.isArray(key) && key[0] === "archived-messages";
const isPinnedKey = (key: unknown) => Array.isArray(key) && key[0] === "pinned-messages";
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

// Reply draft helpers (separate from compose drafts)
interface ReplyDraftData {
  message: string;
  images: string[];
  savedAt: number;
}

function saveReplyDraft(threadId: number, data: ReplyDraftData): void {
  try { localStorage.setItem(`${DRAFT_REPLY_PREFIX}${threadId}`, JSON.stringify(data)); } catch {}
}

function loadReplyDraft(threadId: number): ReplyDraftData | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_REPLY_PREFIX}${threadId}`);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ReplyDraftData;
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(`${DRAFT_REPLY_PREFIX}${threadId}`);
      return null;
    }
    return draft;
  } catch { return null; }
}

function clearReplyDraft(threadId: number): void {
  try { localStorage.removeItem(`${DRAFT_REPLY_PREFIX}${threadId}`); } catch {}
}

function isReplyDraftEmpty(html: string): boolean {
  return !html || html === "<p></p>" || html.replace(/<[^>]*>/g, "").trim().length === 0;
}

// Compose Modal Component
function ComposeModal({
  isOpen,
  onClose,
  tutors,
  fromTutorId,
  replyTo,
  onSend,
  forwardFrom,
  pictureMap,
}: {
  isOpen: boolean;
  onClose: () => void;
  tutors: Array<{ id: number; tutor_name: string }>;
  fromTutorId: number;
  replyTo?: Message;
  onSend: (data: MessageCreate) => Promise<void>;
  forwardFrom?: { subject: string; body: string; category?: string };
  pictureMap?: Map<number, string>;
}) {
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
  const [isUploading, setIsUploading] = useState(false);
  const [isComposeDragging, setIsComposeDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const recipientDropdownRef = useRef<HTMLDivElement>(null);

  const mentionUsers: MentionUser[] = useMemo(() => {
    const allUsers = tutors.map(t => ({ id: t.id, label: t.tutor_name, pictureUrl: pictureMap?.get(t.id) || (t as any).profile_picture }));
    if (recipientMode === "all") return allUsers;
    const recipientSet = new Set([...selectedTutorIds, fromTutorId]);
    return allUsers.filter(u => recipientSet.has(u.id));
  }, [tutors, recipientMode, selectedTutorIds, fromTutorId, pictureMap]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          const result = await messagesAPI.uploadImage(file, fromTutorId);
          setUploadedImages(prev => [...prev, result.url]);
        } else {
          const result = await messagesAPI.uploadFile(file, fromTutorId);
          setUploadedFiles(prev => [...prev, result]);
        }
      }
    } catch (error) {
      console.error('File upload failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
            {replyTo ? "Reply" : forwardFrom ? "Forward" : "New Message"}
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
                {replyTo.message.replace(/<[^>]*>/g, "")}
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
      </div>
    </div>
  );
}

// Highlight search matches in text
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 text-inherit rounded-sm px-0.5">{part}</mark>
      ) : (
        part
      )
    );
  } catch {
    return text;
  }
}

// Avatar helpers — Google profile picture with initials fallback
const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
  "bg-purple-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500",
];

function getInitials(name: string): string {
  // Strip Mr/Ms/Mrs prefix before computing initials
  const cleaned = name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (cleaned[0] || "?").toUpperCase();
}

function getAvatarColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

function TutorAvatar({ name, id, pictureUrl, size = "md" }: {
  name: string;
  id: number;
  pictureUrl?: string;
  size?: "sm" | "md";
}) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
  if (pictureUrl && !imgError) {
    return (
      <img
        src={pictureUrl}
        alt={name}
        className={cn(sizeClass, "rounded-full object-cover flex-shrink-0")}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className={cn(sizeClass, "rounded-full flex items-center justify-center text-white font-bold flex-shrink-0", getAvatarColor(id))}>
      {getInitials(name)}
    </div>
  );
}

// Date separator helpers — "Today", "Yesterday", or formatted date
function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDay.getTime() === today.getTime()) return "Today";
  if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";

  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Thread grouping helper — group threads into temporal buckets
function groupThreadsByDate(threads: MessageThread[]): { label: string; threads: MessageThread[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const groups: { label: string; threads: MessageThread[] }[] = [
    { label: "Today", threads: [] },
    { label: "Yesterday", threads: [] },
    { label: "This Week", threads: [] },
    { label: "Earlier", threads: [] },
  ];

  for (const t of threads) {
    const latest = t.replies.length > 0 ? t.replies[t.replies.length - 1] : t.root_message;
    const d = new Date(latest.created_at);
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (dDay.getTime() >= today.getTime()) groups[0].threads.push(t);
    else if (dDay.getTime() >= yesterday.getTime()) groups[1].threads.push(t);
    else if (dDay.getTime() >= weekAgo.getTime()) groups[2].threads.push(t);
    else groups[3].threads.push(t);
  }

  return groups.filter(g => g.threads.length > 0);
}

// Thread Item Component - memoized to prevent unnecessary re-renders
const ThreadItem = React.memo(function ThreadItem({
  thread,
  isSelected,
  onClick,
  isSentView = false,
  searchQuery,
  pictureMap,
  draftPreview,
  bulkMode = false,
  bulkSelected = false,
  onBulkToggle,
}: {
  thread: MessageThread;
  isSelected: boolean;
  onClick: () => void;
  isSentView?: boolean;
  searchQuery?: string;
  pictureMap?: Map<number, string>;
  draftPreview?: string | null;
  bulkMode?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: () => void;
}) {
  const { root_message: msg, replies, total_unread } = thread;
  const hasUnread = total_unread > 0;
  const replyCount = replies.length;
  const latestMessage = replies.length > 0 ? replies[replies.length - 1] : msg;

  const priorityConfig = PRIORITIES[msg.priority as PriorityLevel] || PRIORITIES.Normal;

  return (
    <button
      onClick={bulkMode ? (onBulkToggle || onClick) : onClick}
      className={cn(
        "w-full text-left p-3 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 transition-all duration-150 min-h-[64px] lg:min-h-0",
        isSelected && !bulkMode
          ? "bg-[#f5ede3] dark:bg-[#3d3628]"
          : "hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50",
        hasUnread && "bg-[#fefcf9] dark:bg-[#2a2518]",
        bulkSelected && "bg-[#f5ede3]/80 dark:bg-[#3d3628]/60",
        priorityConfig.borderClass
      )}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 88px' }}
    >
      <div className="flex items-start gap-2.5">
        {/* Bulk selection checkbox */}
        {bulkMode && (
          <div className="mt-1 flex-shrink-0">
            {bulkSelected
              ? <CheckSquare className="h-4 w-4 text-[#a0704b]" />
              : <Square className="h-4 w-4 text-gray-400" />}
          </div>
        )}
        {/* Avatar */}
        {!isSentView && !bulkMode && (
          <div className="mt-0.5">
            <TutorAvatar name={msg.from_tutor_name || "?"} id={msg.from_tutor_id} pictureUrl={pictureMap?.get(msg.from_tutor_id)} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {/* Sender & Time */}
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={cn(
                "text-sm truncate",
                hasUnread ? "font-semibold text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-300"
              )}
              title={isSentView && msg.is_group_message && msg.to_tutor_names?.length ? msg.to_tutor_names.join(", ") : undefined}
            >
              {isSentView
                ? msg.to_tutor_id === null
                  ? "To: All Tutors"
                  : msg.is_group_message && msg.to_tutor_names?.length
                  ? msg.to_tutor_names.length <= 2
                    ? `To: ${msg.to_tutor_names.join(", ")}`
                    : `To: ${msg.to_tutor_names.slice(0, 2).join(", ")} +${msg.to_tutor_names.length - 2} more`
                  : msg.to_tutor_name
                  ? `To: ${msg.to_tutor_name}`
                  : "To: Unknown"
                : msg.from_tutor_name || "Unknown"
              }
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
            hasUnread ? "font-medium text-gray-800 dark:text-gray-200" : "text-gray-700 dark:text-gray-400"
          )}>
            {msg.category && (
              <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                {CATEGORIES.find(c => c.filter === msg.category)?.icon}
              </span>
            )}
            <span className="truncate">{searchQuery ? highlightMatch(msg.subject || "(no subject)", searchQuery) : (msg.subject || "(no subject)")}</span>
          </div>

          {/* Preview — show draft if exists, otherwise latest message */}
          <div className="text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">
            {draftPreview ? (
              <>
                <span className="text-[#a0704b] dark:text-[#c49a6c] font-medium">Draft: </span>
                <span>{draftPreview.replace(/<[^>]*>/g, "").trim().slice(0, 60)}</span>
              </>
            ) : (() => {
              const plain = latestMessage.message.replace(/<[^>]*>/g, "").trim();
              const preview = plain.slice(0, 80) + (plain.length > 80 ? "..." : "");
              return searchQuery ? highlightMatch(preview, searchQuery) : preview;
            })()}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatTimeAgo(latestMessage.created_at)}
            </span>
            {replyCount > 0 && (
              <span className="flex items-center gap-1">
                <Reply className="h-3.5 w-3.5" />
                {replyCount}
              </span>
            )}
            {msg.like_count > 0 && (
              <span className="flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" />
                {msg.like_count}
              </span>
            )}
          </div>
        </div>

        {/* Unread badge */}
        {hasUnread && (
          <span className={cn(
            "flex-shrink-0 min-w-[22px] h-[22px] flex items-center justify-center text-[11px] font-bold text-white bg-[#a0704b] rounded-full px-1.5",
            total_unread > 5 && "animate-[badge-pulse_2s_ease-in-out_infinite]"
          )}>
            {total_unread}
          </span>
        )}
      </div>
    </button>
  );
});

// Swipeable wrapper for ThreadItem — reveals archive (left) / star (right) on mobile
function SwipeableThreadItem({
  children,
  onSwipeLeftAction,
  onSwipeRightAction,
  leftLabel,
  rightLabel,
}: {
  children: React.ReactNode;
  onSwipeLeftAction?: () => void;
  onSwipeRightAction?: () => void;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isSwiping = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = 0;
    isSwiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!isSwiping.current && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      isSwiping.current = true;
    }
    if (!isSwiping.current) return;
    // Clamp between -80 and 80
    currentX.current = Math.max(-80, Math.min(80, dx));
    if (containerRef.current) {
      containerRef.current.style.transform = `translateX(${currentX.current}px)`;
      containerRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.style.transition = 'transform 0.2s ease-out';
    containerRef.current.style.transform = 'translateX(0)';

    if (isSwiping.current) {
      if (currentX.current < -60 && onSwipeLeftAction) {
        onSwipeLeftAction();
      } else if (currentX.current > 60 && onSwipeRightAction) {
        onSwipeRightAction();
      }
    }
    isSwiping.current = false;
    currentX.current = 0;
  }, [onSwipeLeftAction, onSwipeRightAction]);

  return (
    <div className="relative overflow-hidden">
      {/* Left action bg (archive) — revealed on swipe left */}
      {onSwipeLeftAction && (
        <div className="absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-red-500 text-white text-xs font-medium">
          <Archive className="h-4 w-4 mr-1" />
          {leftLabel || "Archive"}
        </div>
      )}
      {/* Right action bg (star) — revealed on swipe right */}
      {onSwipeRightAction && (
        <div className="absolute inset-y-0 left-0 w-20 flex items-center justify-center bg-amber-500 text-white text-xs font-medium">
          <Star className="h-4 w-4 mr-1" />
          {rightLabel || "Star"}
        </div>
      )}
      <div
        ref={containerRef}
        className="relative bg-white dark:bg-[#1a1a1a]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

// Swipeable message wrapper — swipe right to quote (mobile only)
function SwipeableMessage({ children, onQuote }: { children: React.ReactNode; onQuote: () => void }) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isSwiping = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = 0;
    isSwiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!isSwiping.current && Math.abs(dx) > Math.abs(dy) && dx > 10) {
      isSwiping.current = true;
    }
    if (!isSwiping.current) return;
    // Only rightward, clamped to 0..60
    currentX.current = Math.max(0, Math.min(60, dx));
    if (containerRef.current) {
      containerRef.current.style.transform = `translateX(${currentX.current}px)`;
      containerRef.current.style.transition = 'none';
    }
    if (iconRef.current) {
      iconRef.current.style.opacity = String(Math.min(1, currentX.current / 50));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.style.transition = 'transform 0.2s ease-out';
    containerRef.current.style.transform = 'translateX(0)';
    if (iconRef.current) {
      iconRef.current.style.opacity = '0';
    }

    if (isSwiping.current && currentX.current >= 50) {
      onQuote();
    }
    isSwiping.current = false;
    currentX.current = 0;
  }, [onQuote]);

  return (
    <div className="relative overflow-hidden">
      {/* Reply icon revealed on swipe right */}
      <div ref={iconRef} className="absolute inset-y-0 left-0 w-14 flex items-center justify-center text-[#a0704b]" style={{ opacity: 0 }}>
        <Reply className="h-4 w-4" />
      </div>
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

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
        ref={buttonRef}
        onClick={() => {
          if (!showPopover && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            setPopoverPos({
              top: spaceBelow > 220 ? rect.bottom + 8 : rect.top - 220,
              left: Math.max(8, Math.min(rect.right - 250, window.innerWidth - 260)),
            });
          }
          setShowPopover(!showPopover);
        }}
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

      {/* Popover showing who read the message — portaled to body to escape transform/overflow */}
      {showPopover && hasBeenRead && createPortal(
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setShowPopover(false)}
          />
          <div
            ref={popoverRef}
            className="fixed z-[61] bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-[#d4a574] dark:border-[#8b6f47] py-2 min-w-[180px] max-w-[250px]"
            style={{ top: popoverPos?.top ?? 0, left: popoverPos?.left ?? 0 }}
          >
            <div className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
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
        </>,
        document.body
      )}
    </div>
  );
});

// Likes Badge Component - shows who liked a message in a popover
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function ReactionPicker({ messageId, onReact, isMobile }: { messageId: number; onReact: (emoji: string) => void; isMobile?: boolean }) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPicker]);

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="p-1 rounded-full text-gray-400 hover:text-red-500 transition-colors"
        title="React"
      >
        <Smile className="h-3.5 w-3.5" />
      </button>
      {showPicker && (
        <div className={cn("absolute bottom-full mb-1 z-50 flex gap-0.5 bg-white dark:bg-[#2a2a2a] rounded-full shadow-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 px-1 py-0.5", isMobile ? "left-0" : "right-0")}>
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => { onReact(emoji); setShowPicker(false); }}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors text-base"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LikesBadge = React.memo(function LikesBadge({
  message,
}: {
  message: Message;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  const likeDetails = message.like_details || [];
  if (likeDetails.length === 0) return null;

  // Group reactions by emoji
  const grouped = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; tutors: string[] }>();
    for (const d of likeDetails) {
      const emoji = d.emoji || "❤️";
      const existing = map.get(emoji);
      if (existing) {
        existing.count++;
        existing.tutors.push(d.tutor_name);
      } else {
        map.set(emoji, { emoji, count: 1, tutors: [d.tutor_name] });
      }
    }
    return Array.from(map.values());
  }, [likeDetails]);

  return (
    <div ref={buttonRef} className="inline-flex items-center gap-0.5">
      {grouped.map((g) => (
        <button
          key={g.emoji}
          onClick={() => {
            if (!showPopover && buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              setPopoverPos({
                top: spaceBelow > 220 ? rect.bottom + 8 : rect.top - 220,
                left: Math.max(8, Math.min(rect.left, window.innerWidth - 260)),
              });
            }
            setShowPopover(!showPopover);
          }}
          className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white dark:bg-[#2a2a2a] rounded-full shadow-sm border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 text-xs hover:shadow-md transition-shadow"
          title={g.tutors.join(", ")}
        >
          <span className="text-sm leading-none">{g.emoji}</span>
          {g.count > 1 && <span className="text-gray-600 dark:text-gray-400">{g.count}</span>}
        </button>
      ))}

      {/* Popover — portaled to body to escape transform/overflow */}
      {showPopover && createPortal(
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setShowPopover(false)}
          />
          <div
            className="fixed z-[61] bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-[#e8d4b8] dark:border-[#6b5a4a] py-2 min-w-[180px] max-w-[250px]"
            style={{ top: popoverPos?.top ?? 0, left: popoverPos?.left ?? 0 }}
          >
            <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              Reactions ({likeDetails.length})
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {likeDetails.map((detail, i) => (
                <div
                  key={`${detail.tutor_id}-${detail.emoji}-${i}`}
                  className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm flex-shrink-0">{detail.emoji || "❤️"}</span>
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
        </>,
        document.body
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
  onSendMessage,
  onLike,
  onMarkRead,
  onMarkUnread,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  onPin,
  onUnpin,
  onForward,
  isArchived = false,
  isMobile = false,
  pictureMap,
  onDraftChange,
  mentionUsers,
}: {
  thread: MessageThread;
  currentTutorId: number;
  onClose: () => void;
  onReply: (msg: Message) => void;
  onSendMessage: (data: MessageCreate) => Promise<void>;
  onLike: (msgId: number, emoji?: string) => void;
  onMarkRead: (msgId: number) => void;
  onMarkUnread: (msgId: number) => void;
  onEdit: (msgId: number, newText: string, imageAttachments?: string[]) => Promise<void>;
  onDelete: (msgId: number) => Promise<void>;
  onArchive: (msgId: number) => Promise<void>;
  onUnarchive: (msgId: number) => Promise<void>;
  onPin: (msgId: number) => Promise<void>;
  onUnpin: (msgId: number) => Promise<void>;
  onForward: (msg: Message) => void;
  isArchived?: boolean;
  isMobile?: boolean;
  pictureMap?: Map<number, string>;
  onDraftChange?: () => void;
  mentionUsers?: MentionUser[];
}) {
  const { root_message: msg, replies } = thread;
  const allMessages = [msg, ...replies];

  // Scope @mentions to thread participants (senders + recipients)
  const threadMentionUsers = useMemo(() => {
    if (!mentionUsers) return [];
    const participantIds = new Set<number>();
    for (const m of allMessages) {
      participantIds.add(m.from_tutor_id);
      if (m.to_tutor_ids) m.to_tutor_ids.forEach(id => participantIds.add(id));
      else if (m.to_tutor_id) participantIds.add(m.to_tutor_id);
    }
    return mentionUsers.filter(u => participantIds.has(u.id));
  }, [allMessages, mentionUsers]);

  // Edge-only swipe right to close with peeking animation (mobile)
  const panelRef = useRef<HTMLDivElement>(null);
  const panelSwipe = useRef({ x: 0, y: 0, active: false });

  // Thread search state
  const [threadSearch, setThreadSearch] = useState("");
  const [showThreadSearch, setShowThreadSearch] = useState(false);
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const threadSearchRef = useRef<HTMLInputElement>(null);
  const allMessagesRef = useRef(allMessages);
  useEffect(() => { allMessagesRef.current = allMessages; }, [allMessages]);

  // Auto-scroll to first search match when search term changes
  useEffect(() => {
    if (!threadSearch || !scrollRef.current) return;
    const timer = setTimeout(() => {
      const lc = threadSearch.toLowerCase();
      const msgs = allMessagesRef.current;
      const firstIdx = msgs.findIndex(m =>
        m.message.replace(/<[^>]*>/g, "").toLowerCase().includes(lc)
      );
      if (firstIdx !== -1) {
        const el = scrollRef.current?.querySelector(`[data-msg-idx="${firstIdx}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [threadSearch]);

  // Edit state
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [isEditUploading, setIsEditUploading] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Capture first unread message ID before auto-mark-read (runs during render, before effects)
  const firstUnreadIdRef = useRef<number | null>(null);
  const prevThreadIdRef = useRef<number | null>(null);
  if (thread.root_message.id !== prevThreadIdRef.current) {
    prevThreadIdRef.current = thread.root_message.id;
    const firstUnread = allMessages.find(m => !m.is_read && m.from_tutor_id !== currentTutorId);
    firstUnreadIdRef.current = firstUnread?.id ?? null;
  }

  // Reply bar state — initialize from draft if available
  const threadId = thread.root_message.id;
  const initialDraft = useRef(loadReplyDraft(threadId));
  const [replyText, setReplyText] = useState(initialDraft.current?.message || "");
  const [replyImages, setReplyImages] = useState<string[]>(initialDraft.current?.images || []);
  const [isReplySending, setIsReplySending] = useState(false);
  const [isReplyUploading, setIsReplyUploading] = useState(false);
  const [replyEditorKey, setReplyEditorKey] = useState(0);
  const [isReplyDragging, setIsReplyDragging] = useState(false);
  const [optimisticMessage, setOptimisticMessage] = useState<{ text: string; images: string[]; failed?: boolean } | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const replyEditorRef = useRef<{ focus: () => void; insertContent: (html: string) => void } | null>(null);

  // Auto-scroll to bottom when thread opens
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, [thread]);

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

  // Reply bar handlers
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

  const isReplyEmpty = !replyText || replyText === "<p></p>" || replyText.replace(/<[^>]*>/g, "").trim().length === 0;

  // Quote a message into the reply editor
  const handleQuote = useCallback((m: Message) => {
    const senderName = m.from_tutor_name || "Unknown";
    const plainText = m.message.replace(/<[^>]*>/g, "").trim();
    const truncated = plainText.length > 150 ? plainText.slice(0, 150) + "..." : plainText;
    const quoteHtml = `<blockquote data-msg-id="${m.id}"><strong>${senderName}</strong><br>${truncated}</blockquote><p></p>`;
    replyEditorRef.current?.insertContent(quoteHtml);
  }, []);

  // Scroll-to-bottom button
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBottom(distanceFromBottom > 150);
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [thread]);

  // Click-to-scroll for embedded quotes
  const handleQuoteClick = useCallback((e: React.MouseEvent) => {
    const blockquote = (e.target as HTMLElement).closest('blockquote[data-msg-id]');
    if (!blockquote) return;
    const msgId = blockquote.getAttribute('data-msg-id');
    const target = document.getElementById(`msg-${msgId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('ring-2', 'ring-blue-400');
      setTimeout(() => target.classList.remove('ring-2', 'ring-blue-400'), 1500);
    }
  }, []);

  const handleSendReply = async () => {
    if (isReplyEmpty && replyImages.length === 0) return;

    setIsReplySending(true);
    try {
      // Build MessageCreate with auto-computed recipients
      const data: MessageCreate = {
        subject: `Re: ${msg.subject || "(no subject)"}`,
        message: replyText,
        priority: "Normal",
        category: msg.category || undefined,
        reply_to_id: msg.id,
        image_attachments: replyImages.length > 0 ? replyImages : undefined,
      };

      // Compute recipients (same logic as ComposeModal)
      if (msg.is_group_message && msg.to_tutor_ids) {
        const replyRecipients = msg.to_tutor_ids.filter(id => id !== currentTutorId);
        if (msg.from_tutor_id !== currentTutorId && !replyRecipients.includes(msg.from_tutor_id)) {
          replyRecipients.push(msg.from_tutor_id);
        }
        if (replyRecipients.length === 1) {
          data.to_tutor_id = replyRecipients[0];
        } else if (replyRecipients.length >= 2) {
          data.to_tutor_ids = replyRecipients;
        }
      } else if (msg.from_tutor_id === currentTutorId) {
        // Replying to own message: send to original recipient(s)
        if (msg.to_tutor_id != null) {
          data.to_tutor_id = msg.to_tutor_id;
        }
        // else broadcast — no to_tutor_id
      } else {
        // Replying to someone else: send to them
        data.to_tutor_id = msg.from_tutor_id;
      }

      // Show optimistic bubble immediately
      setOptimisticMessage({ text: replyText, images: [...replyImages] });

      // Clear editor and draft immediately for snappy feel
      setReplyText("");
      setReplyImages([]);
      setReplyEditorKey(prev => prev + 1);
      clearReplyDraft(threadId);

      // Scroll to bottom to show optimistic message
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);

      await onSendMessage(data);

      // Clear optimistic bubble (real message will appear from SWR refresh)
      setOptimisticMessage(null);

      // Scroll to bottom after data refreshes
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 500);
    } catch {
      // Mark optimistic message as failed — show retry button
      setOptimisticMessage(prev => prev ? { ...prev, failed: true } : null);
    } finally {
      setIsReplySending(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className={cn("h-full flex flex-col", isMobile ? "bg-white dark:bg-[#1a1a1a]" : "bg-white/90 dark:bg-[#1a1a1a]/90")}
      onTouchStart={isMobile ? (e) => {
        const x = e.touches[0].clientX;
        if (x > 30) return; // Edge-only: must start within 30px of left edge
        panelSwipe.current = { x, y: e.touches[0].clientY, active: false };
      } : undefined}
      onTouchMove={isMobile ? (e) => {
        if (panelSwipe.current.x === 0) return; // Not started from edge
        const dx = e.touches[0].clientX - panelSwipe.current.x;
        const dy = e.touches[0].clientY - panelSwipe.current.y;
        if (!panelSwipe.current.active && Math.abs(dx) > Math.abs(dy) && dx > 10) {
          panelSwipe.current.active = true;
        }
        if (!panelSwipe.current.active || !panelRef.current) return;
        const clamped = Math.max(0, dx);
        panelRef.current.style.transform = `translateX(${clamped}px)`;
        panelRef.current.style.transition = 'none';
      } : undefined}
      onTouchEnd={isMobile ? (e) => {
        if (!panelSwipe.current.active || !panelRef.current) {
          panelSwipe.current = { x: 0, y: 0, active: false };
          return;
        }
        const dx = e.changedTouches[0].clientX - panelSwipe.current.x;
        if (dx > 120) {
          panelRef.current.style.transition = 'transform 0.25s ease-out';
          panelRef.current.style.transform = 'translateX(100%)';
          setTimeout(onClose, 250);
        } else {
          panelRef.current.style.transition = 'transform 0.2s ease-out';
          panelRef.current.style.transform = 'translateX(0)';
        }
        panelSwipe.current = { x: 0, y: 0, active: false };
      } : undefined}
    >
      {/* Header */}
      <div className="flex items-center gap-1 sm:gap-3 px-4 py-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] z-[1] relative">
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
        <button
          onClick={() => {
            setShowThreadSearch(!showThreadSearch);
            if (!showThreadSearch) setTimeout(() => threadSearchRef.current?.focus(), 50);
            else setThreadSearch("");
          }}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg transition-colors",
            showThreadSearch
              ? "text-[#a0704b] bg-[#f5ede3] dark:bg-[#3d2e1e]"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
          title="Search in thread"
        >
          <Search className="h-4 w-4" />
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
      </div>

      {/* Thread search bar */}
      {showThreadSearch && (() => {
        const matchedIds = threadSearch
          ? allMessages
              .map((m, i) => m.message.replace(/<[^>]*>/g, "").toLowerCase().includes(threadSearch.toLowerCase()) ? i : -1)
              .filter(i => i !== -1)
          : [];
        const matchCount = matchedIds.length;
        const clampedIdx = matchCount > 0 ? Math.min(searchMatchIdx, matchCount - 1) : 0;

        const scrollToMatch = (idx: number) => {
          const msgIdx = matchedIds[idx];
          if (msgIdx == null || !scrollRef.current) return;
          const msgEl = scrollRef.current.querySelector(`[data-msg-idx="${msgIdx}"]`);
          if (msgEl) msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
        };

        return (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50">
            <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <input
              ref={threadSearchRef}
              type="text"
              value={threadSearch}
              onChange={(e) => { setThreadSearch(e.target.value); setSearchMatchIdx(0); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setShowThreadSearch(false); setThreadSearch(""); }
                if (e.key === "Enter" && matchCount > 0) {
                  e.preventDefault();
                  const next = e.shiftKey
                    ? (clampedIdx - 1 + matchCount) % matchCount
                    : (clampedIdx + 1) % matchCount;
                  setSearchMatchIdx(next);
                  scrollToMatch(next);
                }
              }}
              placeholder="Search messages..."
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
            />
            {threadSearch && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {matchCount > 0 ? `${clampedIdx + 1}/${matchCount}` : "0 found"}
              </span>
            )}
            {matchCount > 1 && (
              <div className="flex items-center">
                <button
                  onClick={() => { const prev = (clampedIdx - 1 + matchCount) % matchCount; setSearchMatchIdx(prev); scrollToMatch(prev); }}
                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  title="Previous match (Shift+Enter)"
                >
                  <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                </button>
                <button
                  onClick={() => { const next = (clampedIdx + 1) % matchCount; setSearchMatchIdx(next); scrollToMatch(next); }}
                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  title="Next match (Enter)"
                >
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </div>
            )}
            <button
              onClick={() => { setShowThreadSearch(false); setThreadSearch(""); }}
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>
        );
      })()}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" onClick={handleQuoteClick}>
        {allMessages.map((m, idx) => {
          const isOwn = m.from_tutor_id === currentTutorId;
          const isEditing = editingMessageId === m.id;
          const isBroadcast = m.to_tutor_id === null;
          const isGroup = m.is_group_message;

          // Date separator logic
          const msgDate = new Date(m.created_at);
          const dateStr = msgDate.toDateString();
          const prevDateStr = idx > 0 ? new Date(allMessages[idx - 1].created_at).toDateString() : null;
          const isNewDay = idx === 0 || dateStr !== prevDateStr;

          // Message grouping: consecutive messages from same sender
          const prevMsg = idx > 0 ? allMessages[idx - 1] : null;
          const nextMsg = allMessages[idx + 1];
          const isFirstInGroup = !prevMsg || prevMsg.from_tutor_id !== m.from_tutor_id || isNewDay;
          const isLastInGroup = !nextMsg || nextMsg.from_tutor_id !== m.from_tutor_id;

          // Message bubble content (extracted for optional SwipeableMessage wrapping)
          const messageBubble = (
            <div data-msg-idx={idx} className={cn(
              !isOwn && "flex gap-2 mr-12 sm:mr-20",
              isFirstInGroup ? "mt-3" : "mt-1",
              idx === 0 && "mt-0"
            )}>
              {!isOwn && (
                <div className="mt-1" style={{ visibility: isFirstInGroup ? 'visible' : 'hidden', width: 32, flexShrink: 0 }}>
                  {isFirstInGroup && <TutorAvatar name={m.from_tutor_name || "?"} id={m.from_tutor_id} pictureUrl={pictureMap?.get(m.from_tutor_id)} />}
                </div>
              )}
            <div
              id={`msg-${m.id}`}
              style={{ animation: 'message-in 0.2s ease-out both' }}
              className={cn(
                "group/msg relative p-3 rounded-2xl transition-shadow",
                m.like_count > 0 && "mb-2",
                isOwn
                  ? cn("bg-[#ede0cf] dark:bg-[#3d3628] ml-12 sm:ml-20", isLastInGroup && "bubble-tail-right")
                  : "flex-1 min-w-0",
                !isOwn && isBroadcast && "bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30",
                !isOwn && isGroup && !isBroadcast && "bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30",
                !isOwn && !isBroadcast && !isGroup && "bg-[#faf6f1] dark:bg-[#2a2a2a] border border-[#e8d4b8]/50 dark:border-[#6b5a4a]"
              )}
            >
              {/* Sender name + time (others only, first in group) */}
              {!isOwn && isFirstInGroup && (
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {m.from_tutor_name || "Unknown"}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] text-gray-400 dark:text-gray-400 flex items-center gap-1 transition-opacity",
                      !isMobile && "opacity-0 group-hover/msg:opacity-100"
                    )}
                    title={new Date(m.created_at).toLocaleString()}
                  >
                    {formatMessageTime(m.created_at)}
                    {m.updated_at && <span className="italic">(edited)</span>}
                    <SeenBadge message={m} currentTutorId={currentTutorId} />
                  </span>
                </div>
              )}

              {/* Message body - editable for own messages */}
              {isEditing ? (
                <div className="space-y-2">
                  <InboxRichEditor
                    onUpdate={setEditText}
                    initialContent={editText}
                    minHeight="100px"
                    onPasteFiles={(files) => {
                      const dt = new DataTransfer();
                      files.forEach(f => dt.items.add(f));
                      handleEditImageUpload(dt.files);
                    }}
                    mentionUsers={threadMentionUsers}
                  />
                  {/* Image attachments for edit mode */}
                  <div>
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
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
                        <Paperclip className="h-4 w-4" />
                      )}
                      {isEditUploading ? 'Uploading...' : 'Attach'}
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
                              className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-60 hover:opacity-100 transition-opacity"
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
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#a0704b] hover:bg-[#8b5f3c] text-white text-sm rounded-lg transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
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
                  className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 break-words"
                  dangerouslySetInnerHTML={{ __html: threadSearch
                    ? m.message.replace(
                        new RegExp(`(<[^>]+>)|(${threadSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
                        (_match: string, tag: string | undefined, text: string | undefined) => tag ? tag : `<mark class="bg-yellow-200 dark:bg-yellow-700/50 rounded-sm px-0.5">${text}</mark>`
                      )
                    : m.message
                  }}
                />
              ) : (
                <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                  {threadSearch ? highlightMatch(m.message, threadSearch) : m.message}
                </div>
              )}

              {/* Link previews */}
              {!editingMessageId && m.message && <LinkPreview messageHtml={m.message} />}

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

              {/* File/document attachments */}
              {m.file_attachments && m.file_attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {m.file_attachments.map((file, idx) => (
                    <a
                      key={file.url}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50 hover:bg-[#f5ede3] dark:hover:bg-[#2d2820] transition-colors group"
                    >
                      <div className="p-2 rounded-lg bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b] flex-shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {file.filename}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {file.content_type.split('/').pop()?.toUpperCase()}
                        </div>
                      </div>
                      <Download className="h-4 w-4 text-gray-400 group-hover:text-[#a0704b] transition-colors flex-shrink-0" />
                    </a>
                  ))}
                </div>
              )}

              {/* Proposal embed for MakeupConfirmation messages */}
              {m.category === "MakeupConfirmation" && (
                <ProposalEmbed messageText={m.message} currentTutorId={currentTutorId} />
              )}

              {/* Message actions — floating pill on hover (desktop), inline on mobile */}
              {!isEditing && (
                <div className={cn(
                  "flex items-center gap-0.5",
                  isMobile
                    ? "mt-2 gap-2"
                    : "absolute -top-3 right-2 opacity-0 group-hover/msg:opacity-100 transition-opacity bg-white dark:bg-[#2a2a2a] rounded-full shadow-md border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 px-1.5 py-0.5"
                )}>
                  <ReactionPicker messageId={m.id} onReact={(emoji) => onLike(m.id, emoji)} isMobile={isMobile} />
                  <button
                    onClick={() => handleQuote(m)}
                    className="p-1 rounded-full text-gray-400 hover:text-[#a0704b] transition-colors"
                    title="Quote"
                  >
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onForward(m)}
                    className="p-1 rounded-full text-gray-400 hover:text-[#a0704b] transition-colors"
                    title="Forward"
                  >
                    <Forward className="h-3.5 w-3.5" />
                  </button>
                  {isOwn && (
                    <>
                      <button
                        onClick={() => startEdit(m)}
                        className="p-1 rounded-full text-gray-400 hover:text-[#a0704b] transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm("Are you sure you want to delete this message?")) {
                            onDelete(m.id);
                          }
                        }}
                        className="p-1 rounded-full text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
              {/* Like count badge — floating reaction pill */}
              {m.like_count > 0 && (
                <div className="absolute -bottom-2.5 left-3">
                  <LikesBadge message={m} />
                </div>
              )}

              {/* Own message: timestamp + seen badge at bottom-right */}
              {isOwn && (
                <div className={cn(
                  "flex items-center justify-end gap-1 mt-1 transition-opacity",
                  !isMobile && "opacity-0 group-hover/msg:opacity-100"
                )}>
                  <span className="text-[11px] text-gray-400 dark:text-gray-400" title={new Date(m.created_at).toLocaleString()}>
                    {formatMessageTime(m.created_at)}
                    {m.updated_at && <span className="italic ml-1">(edited)</span>}
                  </span>
                  <SeenBadge message={m} currentTutorId={currentTutorId} />
                </div>
              )}
            </div>
            </div>
          );

          return (
            <React.Fragment key={m.id}>
              {/* Date separator */}
              {isNewDay && (
                <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 my-2">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" style={{ animation: 'line-grow 0.4s ease-out both', transformOrigin: 'right' }} />
                  <span className="font-medium px-2">{formatDateLabel(msgDate)}</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" style={{ animation: 'line-grow 0.4s ease-out both', transformOrigin: 'left' }} />
                </div>
              )}
              {/* "New messages" divider */}
              {m.id === firstUnreadIdRef.current && (
                <div className="flex items-center gap-3 text-xs text-blue-500 dark:text-blue-400">
                  <div className="flex-1 h-px bg-blue-300 dark:bg-blue-700" style={{ animation: 'line-grow 0.4s ease-out both', transformOrigin: 'right' }} />
                  <span className="font-medium">New messages</span>
                  <div className="flex-1 h-px bg-blue-300 dark:bg-blue-700" style={{ animation: 'line-grow 0.4s ease-out both', transformOrigin: 'left' }} />
                </div>
              )}
              {/* Wrap with SwipeableMessage on mobile for swipe-to-quote */}
              {isMobile ? (
                <SwipeableMessage onQuote={() => handleQuote(m)}>
                  {messageBubble}
                </SwipeableMessage>
              ) : messageBubble}
            </React.Fragment>
          );
        })}

        {/* Optimistic send bubble */}
        {optimisticMessage && (
          <div className={cn(
            "ml-12 sm:ml-20 p-3 rounded-2xl mt-1",
            optimisticMessage.failed
              ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40"
              : "bg-[#ede0cf]/60 dark:bg-[#3d3628]/60 opacity-70"
          )} style={{ animation: 'message-in 0.2s ease-out both' }}>
            {!optimisticMessage.failed && (
              <div className="flex items-center gap-1.5 mb-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#a0704b]"
                    style={{ animation: `typing-dot 1.2s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </div>
            )}
            {optimisticMessage.text && optimisticMessage.text !== "<p></p>" && (
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 break-words"
                dangerouslySetInnerHTML={{ __html: optimisticMessage.text }}
              />
            )}
            {optimisticMessage.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {optimisticMessage.images.map((url, idx) => (
                  <img
                    key={url}
                    src={url}
                    alt={`Attachment ${idx + 1}`}
                    className="max-h-48 max-w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]"
                  />
                ))}
              </div>
            )}
            {optimisticMessage.failed && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-red-200 dark:border-red-800/40">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                <span className="text-xs text-red-600 dark:text-red-400">Failed to send</span>
                <div className="flex-1" />
                <button
                  onClick={() => {
                    // Restore content to editor for retry
                    initialDraft.current = { message: optimisticMessage.text, images: optimisticMessage.images, savedAt: Date.now() };
                    setReplyText(optimisticMessage.text);
                    setReplyImages([...optimisticMessage.images]);
                    setReplyEditorKey(prev => prev + 1);
                    setOptimisticMessage(null);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
                <button
                  onClick={() => setOptimisticMessage(null)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Discard
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scroll to bottom button — sticky stays pinned to bottom of scroll viewport */}
        {showScrollBottom && (
          <div className="sticky bottom-2 h-0 flex justify-end pr-2 z-10 overflow-visible">
            <button
              onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-[#2a2a2a] shadow-lg border border-[#e8d4b8] dark:border-[#6b5a4a] text-gray-500 hover:text-[#a0704b] transition-all -translate-y-full"
              title="Scroll to bottom"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Inline reply bar */}
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
            replyEditorRef.current = {
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
          mentionUsers={threadMentionUsers}
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
                <img
                  src={url}
                  alt={`Attachment ${idx + 1}`}
                  className="h-12 w-12 object-cover rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]"
                />
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
              onClick={() => onReply(msg)}
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
    </div>
  );
});

export default function InboxPage() {
  usePageTitle("Inbox");

  const searchParams = useSearchParams();
  const { selectedLocation } = useLocation();
  const { user, isImpersonating, impersonatedTutor, effectiveRole, isAdmin, isSupervisor, isGuest } = useAuth();
  const { data: tutors = [] } = useActiveTutors();  // For ComposeModal recipient selection

  // Build tutor profile picture lookup map (id → picture URL)
  const tutorPictureMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of tutors) {
      if (t.profile_picture) map.set(t.id, t.profile_picture);
    }
    // Also include the current user's picture from auth context
    if (user?.id && user.picture) map.set(user.id, user.picture);
    return map;
  }, [tutors, user?.id, user?.picture]);
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
  const [forwardFrom, setForwardFrom] = useState<{ subject: string; body: string; category?: string } | undefined>();
  const [isMobile, setIsMobile] = useState(false);
  const [categoryCollapsed, setCategoryCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024
  );
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);  // Debounce search by 300ms
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcutsPos, setShortcutsPos] = useState<{ top: number; left: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shortcutsButtonRef = useRef<HTMLButtonElement>(null);

  // Notification sound preference (persisted in localStorage)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("inbox_sound_muted") !== "1";
  });
  const notifAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    localStorage.setItem("inbox_sound_muted", soundEnabled ? "0" : "1");
  }, [soundEnabled]);
  const playNotifSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!notifAudioRef.current) {
        // Short, subtle notification chime (Web Audio API fallback)
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        return;
      }
      notifAudioRef.current.currentTime = 0;
      notifAudioRef.current.play().catch(() => {});
    } catch {}
  }, [soundEnabled]);

  // Track button position with rAF loop when popover is open (handles sidebar toggle animation, resize)
  useEffect(() => {
    if (!showShortcuts || !shortcutsButtonRef.current) {
      setShortcutsPos(null);
      return;
    }
    let rafId: number;
    const track = () => {
      if (shortcutsButtonRef.current) {
        const rect = shortcutsButtonRef.current.getBoundingClientRect();
        setShortcutsPos(prev =>
          prev && Math.abs(prev.top - (rect.bottom + 8)) < 0.5 && Math.abs(prev.left - rect.left) < 0.5
            ? prev
            : { top: rect.bottom + 8, left: rect.left }
        );
      }
      rafId = requestAnimationFrame(track);
    };
    rafId = requestAnimationFrame(track);
    return () => cancelAnimationFrame(rafId);
  }, [showShortcuts]);

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

  // Bulk selection mode
  const [bulkMode, setBulkMode] = useState(false);
  const allThreadIds = useMemo(() => displayThreads.map(t => t.root_message.id), [displayThreads]);
  const { selectedIds: bulkSelectedIds, toggleSelect: bulkToggle, toggleSelectAll: bulkToggleAll, clearSelection: bulkClear, hasSelection: bulkHasSelection, isAllSelected: bulkAllSelected } = useBulkSelection(allThreadIds);

  // Exit bulk mode when category changes
  useEffect(() => { setBulkMode(false); bulkClear(); }, [selectedCategory, bulkClear]);

  // Draft tracking for thread list preview
  const [draftVersion, setDraftVersion] = useState(0);
  const handleDraftChange = useCallback(() => setDraftVersion(v => v + 1), []);
  const draftsMap = useMemo(() => {
    // draftVersion used for invalidation
    void draftVersion;
    const map = new Map<number, string>();
    for (const t of displayThreads) {
      const draft = loadReplyDraft(t.root_message.id);
      if (draft && !isReplyDraftEmpty(draft.message)) {
        map.set(t.root_message.id, draft.message);
      }
    }
    return map;
  }, [displayThreads, draftVersion]);

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
        // Play notification sound
        playNotifSound();
      }
      prevUnreadRef.current = unreadCount.count;
    }
  }, [unreadCount?.count, sendNotification, playNotifSound]);

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

  const handleLike = useCallback(async (messageId: number, emoji: string = "❤️") => {
    if (tutorId === null) return;

    try {
      await messagesAPI.toggleLike(messageId, tutorId, emoji);
      mutate(isThreadsKey);
    } catch {
      showToast("Failed to toggle reaction", "error");
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
    mutate(isThreadsKey, (data: MessageThread[] | PaginatedThreadsResponse | undefined) => {
      if (Array.isArray(data)) return data.filter(t => t.root_message.id !== messageId);
      if (data && 'threads' in data) return { ...data, threads: data.threads.filter(t => t.root_message.id !== messageId), total_count: data.total_count - 1 };
      return data;
    }, { revalidate: false });
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input/editor
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).closest(".tiptap")) return;

      switch (e.key) {
        case "?":
          e.preventDefault();
          setShowShortcuts(prev => !prev);
          break;
        case "j":
        case "ArrowDown": {
          if (!displayThreads.length) break;
          e.preventDefault();
          const currentIdx = selectedThread
            ? displayThreads.findIndex(t => t.root_message.id === selectedThread.root_message.id)
            : -1;
          const nextIdx = Math.min(currentIdx + 1, displayThreads.length - 1);
          setSelectedThread(displayThreads[nextIdx]);
          break;
        }
        case "k":
        case "ArrowUp": {
          if (!displayThreads.length || !selectedThread) break;
          e.preventDefault();
          const curIdx = displayThreads.findIndex(t => t.root_message.id === selectedThread.root_message.id);
          const prevIdx = Math.max(curIdx - 1, 0);
          setSelectedThread(displayThreads[prevIdx]);
          break;
        }
        case "Enter":
          if (!selectedThread && displayThreads.length > 0) {
            e.preventDefault();
            setSelectedThread(displayThreads[0]);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (showShortcuts) {
            setShowShortcuts(false);
          } else if (selectedThread) {
            setSelectedThread(null);
          } else if (searchQuery) {
            setSearchQuery("");
          }
          break;
        case "c":
          e.preventDefault();
          handleCompose();
          break;
        case "/":
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedThread, displayThreads, showShortcuts, searchQuery, handleCompose]);

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
        <div className="h-full flex flex-col overflow-hidden gap-1">
          {/* Header */}
          <div className="flex-shrink-0 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm rounded-b-lg mx-1 px-4 py-3">
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
                <button
                  onClick={() => setSoundEnabled(prev => !prev)}
                  className={cn(
                    "w-6 h-6 inline-flex items-center justify-center rounded-full transition-colors border",
                    soundEnabled
                      ? "text-gray-400 hover:text-[#a0704b] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] border-gray-300 dark:border-gray-600"
                      : "text-gray-300 dark:text-gray-600 hover:text-[#a0704b] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] border-gray-200 dark:border-gray-700"
                  )}
                  title={soundEnabled ? "Mute notification sound" : "Unmute notification sound"}
                >
                  {soundEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                </button>
                <button
                  ref={shortcutsButtonRef}
                  onClick={() => setShowShortcuts(prev => !prev)}
                  className="hidden lg:inline-flex w-6 h-6 items-center justify-center rounded-full text-xs text-gray-400 hover:text-[#a0704b] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] border border-gray-300 dark:border-gray-600 transition-colors"
                  title="Keyboard shortcuts (?)"
                >
                  ?
                </button>
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
                  className="flex items-center gap-2 px-4 py-2 bg-[#a0704b] hover:bg-[#8b5f3c] text-white rounded-lg transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  <PenSquare className="h-4 w-4" />
                  Compose
                </button>
              </div>
            </div>
          </div>

          {/* Main content - 3 panel layout */}
          <div className="flex-1 flex overflow-hidden min-h-0 gap-1 p-1 pt-0">
            {/* Left panel - Categories */}
            <div className={cn(
              "h-full flex-shrink-0 bg-white/90 dark:bg-[#1a1a1a]/90 rounded-lg transition-all duration-200 overflow-y-auto",
              categoryCollapsed ? "w-12" : "w-48"
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
                          <div className="my-2 mx-2 border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50" />
                        ) : (
                          <div className="mt-3 mb-1 px-3">
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
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
                                : "text-gray-800 dark:text-gray-300 hover:bg-[#faf6f1] dark:hover:bg-[#2d2820]"
                            )}
                            title={categoryCollapsed ? cat.label : undefined}
                          >
                            <span className="relative">
                              {cat.icon}
                              {categoryCollapsed && categoryUnreadCounts[cat.id] > 0 && (
                                <span className={cn(
                                  "absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center text-[10px] font-bold text-white bg-[#a0704b] rounded-full px-0.5",
                                  categoryUnreadCounts[cat.id] > 5 && "animate-[badge-pulse_2s_ease-in-out_infinite]"
                                )}>
                                  {categoryUnreadCounts[cat.id] > 99 ? "99+" : categoryUnreadCounts[cat.id]}
                                </span>
                              )}
                            </span>
                            {!categoryCollapsed && (
                              <>
                                <span className="flex-1">{cat.label}</span>
                                {categoryUnreadCounts[cat.id] > 0 && (
                                  <span className={cn(
                                    "min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-[#a0704b] rounded-full px-1",
                                    categoryUnreadCounts[cat.id] > 5 && "animate-[badge-pulse_2s_ease-in-out_infinite]"
                                  )}>
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
              "flex-1 min-w-0 min-h-0 bg-white/90 dark:bg-[#1a1a1a]/90 rounded-lg overflow-hidden flex flex-col"
            )}>
              {/* Search bar */}
              <div className="flex-shrink-0 p-2 border-b border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search messages..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-[#a0704b]/20 focus:border-[#a0704b] transition-shadow outline-none"
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
                  {displayThreads.length > 0 && selectedCategory !== "sent" && (
                    <button
                      onClick={() => { setBulkMode(prev => !prev); bulkClear(); }}
                      className={cn(
                        "flex-shrink-0 p-2 rounded-lg transition-colors",
                        bulkMode
                          ? "text-[#a0704b] bg-[#f5ede3] dark:bg-[#3d2e1e]"
                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      )}
                      title={bulkMode ? "Exit select mode" : "Select threads"}
                    >
                      <ListChecks className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {/* Bulk action bar */}
                {bulkMode && (
                  <div className="flex items-center gap-1 px-2 py-1.5 border-t border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
                    <button
                      onClick={bulkToggleAll}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                    >
                      {bulkAllSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                      {bulkAllSelected ? "Deselect all" : "Select all"}
                    </button>
                    {bulkHasSelection && (
                      <>
                        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">{bulkSelectedIds.size} selected</span>
                        <div className="flex-1" />
                        {selectedCategory !== "archived" && (
                          <button
                            onClick={async () => {
                              if (!hasTutor || tutorId === null) return;
                              try {
                                await messagesAPI.archive(Array.from(bulkSelectedIds), tutorId);
                                mutate((key) => isThreadsKey(key) || isUnreadKey(key) || isArchivedKey(key));
                                bulkClear();
                                showToast(`Archived ${bulkSelectedIds.size} thread(s)`, "success");
                              } catch { showToast("Failed to archive", "error"); }
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Archive
                          </button>
                        )}
                        {selectedCategory === "archived" && (
                          <button
                            onClick={async () => {
                              if (!hasTutor || tutorId === null) return;
                              try {
                                await messagesAPI.unarchive(Array.from(bulkSelectedIds), tutorId);
                                mutate((key) => isThreadsKey(key) || isUnreadKey(key) || isArchivedKey(key));
                                bulkClear();
                                showToast(`Unarchived ${bulkSelectedIds.size} thread(s)`, "success");
                              } catch { showToast("Failed to unarchive", "error"); }
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            Unarchive
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!hasTutor || tutorId === null) return;
                            try {
                              await messagesAPI.pin(Array.from(bulkSelectedIds), tutorId);
                              mutate((key) => isThreadsKey(key) || isPinnedKey(key));
                              bulkClear();
                              showToast(`Starred ${bulkSelectedIds.size} thread(s)`, "success");
                            } catch { showToast("Failed to star", "error"); }
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                        >
                          <Star className="h-3.5 w-3.5" />
                          Star
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {isLoading ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="relative rounded-lg border border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 bg-white dark:bg-[#1a1a1a] p-4 overflow-hidden"
                      style={{ animationDelay: `${i * 0.1}s` }}>
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2.5 min-w-0">
                          <div className="h-4 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
                          <div className="h-3 w-2/3 bg-gray-100 dark:bg-gray-800 rounded" />
                        </div>
                        <div className="h-3 w-12 bg-gray-100 dark:bg-gray-800 rounded flex-shrink-0" />
                      </div>
                      <div className="absolute inset-0 skeleton-shimmer" style={{ animationDelay: `${i * 0.15}s` }} />
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
                    {!searchQuery && ["inbox", "sent", "starred", "archived"].includes(selectedCategory) && (
                      <button
                        onClick={handleCompose}
                        disabled={!hasTutor}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#a0704b] hover:bg-[#8b5f3c] text-white text-sm rounded-lg transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                      >
                        <PenSquare className="h-4 w-4" />
                        Compose
                      </button>
                    )}
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
                          pictureMap={tutorPictureMap}
                          draftPreview={draftsMap.get(thread.root_message.id)}
                        />
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {(() => {
                    const renderThread = (thread: MessageThread, showSearch?: boolean) => {
                      const item = (
                        <ThreadItem
                          key={thread.root_message.id}
                          thread={thread}
                          isSelected={selectedThread?.root_message.id === thread.root_message.id}
                          onClick={() => setSelectedThread(thread)}
                          isSentView={selectedCategory === "sent"}
                          searchQuery={showSearch ? debouncedSearch : undefined}
                          pictureMap={tutorPictureMap}
                          draftPreview={draftsMap.get(thread.root_message.id)}
                          bulkMode={bulkMode}
                          bulkSelected={bulkSelectedIds.has(thread.root_message.id)}
                          onBulkToggle={() => bulkToggle(thread.root_message.id)}
                        />
                      );
                      if (!isMobile || selectedCategory === "sent") return item;
                      return (
                        <SwipeableThreadItem
                          key={thread.root_message.id}
                          onSwipeLeftAction={selectedCategory !== "archived" ? () => handleArchive(thread.root_message.id) : undefined}
                          onSwipeRightAction={() => thread.root_message.is_pinned ? handleUnpin(thread.root_message.id) : handlePin(thread.root_message.id)}
                          rightLabel={thread.root_message.is_pinned ? "Unstar" : "Star"}
                        >
                          {item}
                        </SwipeableThreadItem>
                      );
                    };

                    return debouncedSearch.trim() ? (
                      // Flat list when searching
                      displayThreads.map((thread) => renderThread(thread, true))
                    ) : (
                      // Grouped by date when not searching
                      groupThreadsByDate(displayThreads).map((group) => (
                        <div key={group.label}>
                          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-[#faf6f1]/80 dark:bg-[#1a1a1a]/80 sticky top-0 z-[5] border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30">
                            {group.label}
                          </div>
                          {group.threads.map((thread) => renderThread(thread))}
                        </div>
                      ))
                    );
                  })()}
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
            {selectedThread && hasTutor ? (
              <div className={cn(
                "h-full rounded-lg overflow-hidden",
                isMobile ? "fixed inset-0 z-40" : "w-[450px] xl:w-[550px] flex-shrink-0"
              )}>
                <ThreadDetailPanel
                  thread={selectedThread}
                  currentTutorId={effectiveTutorId}
                  onClose={() => setSelectedThread(null)}
                  onReply={handleReply}
                  onSendMessage={handleSendMessage}
                  onLike={handleLike}
                  onMarkRead={handleMarkRead}
                  onMarkUnread={handleMarkUnread}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onArchive={handleArchive}
                  onUnarchive={handleUnarchive}
                  onPin={handlePin}
                  onUnpin={handleUnpin}
                  onForward={(m: Message) => {
                    const senderName = m.from_tutor_name || "Unknown";
                    const date = new Date(m.created_at).toLocaleString();
                    const fwdBody = `<blockquote><p><strong>Forwarded from ${senderName}</strong> <em>(${date})</em></p>${m.message}</blockquote><p></p>`;
                    setForwardFrom({
                      subject: `Fwd: ${m.subject || "(no subject)"}`,
                      body: fwdBody,
                      category: m.category || undefined,
                    });
                    setReplyTo(undefined);
                    setShowCompose(true);
                  }}
                  isArchived={selectedCategory === "archived"}
                  isMobile={isMobile}
                  pictureMap={tutorPictureMap}
                  onDraftChange={handleDraftChange}
                  mentionUsers={tutors.map(t => ({ id: t.id, label: t.tutor_name, pictureUrl: tutorPictureMap.get(t.id) || t.profile_picture }))}
                />
              </div>
            ) : !isMobile && (
              <div className="w-[450px] xl:w-[550px] flex-shrink-0 flex items-center justify-center bg-white/90 dark:bg-[#1a1a1a]/90 rounded-lg">
                <div className="text-center text-gray-400 dark:text-gray-500">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a conversation</p>
                  <p className="text-xs mt-1 opacity-60">or press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px] font-mono">c</kbd> to compose</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </PageTransition>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={showCompose}
        onClose={() => { setShowCompose(false); setForwardFrom(undefined); }}
        tutors={tutors}
        fromTutorId={tutorId ?? 0}
        replyTo={replyTo}
        onSend={handleSendMessage}
        forwardFrom={forwardFrom}
        pictureMap={tutorPictureMap}
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

      {/* Keyboard Shortcuts Help Panel — subtle dropdown anchored to ? button */}
      {showShortcuts && shortcutsPos && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setShowShortcuts(false)} />
            <div
              className="fixed z-[61] bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl border border-[#e8d4b8] dark:border-[#6b5a4a] px-4 py-3 w-56"
              style={{ top: shortcutsPos.top, left: shortcutsPos.left }}
            >
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Keyboard Shortcuts</h4>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                {[
                  ["j / k", "Navigate threads"],
                  ["Enter", "Open first thread"],
                  ["Esc", "Close / clear"],
                  ["c", "Compose message"],
                  ["/", "Focus search"],
                  ["?", "This help"],
                ].map(([key, desc]) => (
                  <div key={key} className="contents">
                    <kbd className="text-gray-700 dark:text-gray-300 font-mono bg-gray-100 dark:bg-[#1a1a1a] px-1.5 py-0.5 rounded text-[10px] text-center">{key}</kbd>
                    <span className="text-gray-500 dark:text-gray-400 py-0.5">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
      )}
    </DeskSurface>
  );
}
