"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
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
import { TutorAvatar } from "@/lib/avatar-utils";
import { stripHtml } from "@/lib/html-utils";
import { formatTimeAgo } from "@/lib/formatters";
import { mutate } from "swr";
import type { Message, MessageThread, MessageCreate, MessageCategory, MakeupProposal, Session, PaginatedThreadsResponse } from "@/types";
import { ProposalCard } from "@/components/inbox/ProposalCard";
const ScheduleMakeupModal = lazy(() => import("@/components/sessions/ScheduleMakeupModal").then(m => ({ default: m.ScheduleMakeupModal })));
const SendToWecomModal = lazy(() => import("@/components/wecom/SendToWecomModal"));
import type { MentionUser } from "@/components/inbox/InboxRichEditor";
import ComposeModal from "@/components/inbox/ComposeModal";
import { DRAFT_REPLY_PREFIX, loadReplyDraft, isReplyDraftEmpty } from "@/lib/inbox-drafts";
import ThreadSearchBar from "@/components/inbox/ThreadSearchBar";
import MessageBubble from "@/components/inbox/MessageBubble";
import { formatMessageTime, highlightMatch } from "@/components/inbox/MessageBubble";
import ReplyComposer from "@/components/inbox/ReplyComposer";
import type { ReplyComposerHandle } from "@/components/inbox/ReplyComposer";
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
  RotateCcw,
  Heart,
  Reply,
  Loader2,
  AlertCircle,
  Clock,
  Check,
  Search,
  Trash2,
  CalendarClock,
  Circle,
  CircleDot,
  Archive,
  ArchiveRestore,
  MessageSquareShare,
  Star,
  MessageSquarePlus,
  Volume2,
  VolumeX,
  CheckSquare,
  Square,
  ListChecks,
  Pin,
  MoreVertical,
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
            {msg.is_thread_pinned && (
              <Pin className="h-3 w-3 text-blue-500 flex-shrink-0" />
            )}
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
                <span>{stripHtml(draftPreview).slice(0, 60)}</span>
              </>
            ) : (() => {
              const plain = stripHtml(latestMessage.message);
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
            total_unread > 5 && "animate-[badge-pulse_2s_ease-in-out_infinite] motion-reduce:animate-none"
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

  const leftIconRef = useRef<HTMLDivElement>(null);
  const rightIconRef = useRef<HTMLDivElement>(null);

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
    // Fade action icons based on swipe distance
    const opacity = Math.min(1, Math.abs(currentX.current) / 60);
    if (currentX.current < 0 && leftIconRef.current) leftIconRef.current.style.opacity = String(opacity);
    if (currentX.current > 0 && rightIconRef.current) rightIconRef.current.style.opacity = String(opacity);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    containerRef.current.style.transform = 'translateX(0)';
    if (leftIconRef.current) leftIconRef.current.style.opacity = '0';
    if (rightIconRef.current) rightIconRef.current.style.opacity = '0';

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
        <div ref={leftIconRef} className="absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-red-500 text-white text-xs font-medium" style={{ opacity: 0 }}>
          <Archive className="h-4 w-4 mr-1" />
          {leftLabel || "Archive"}
        </div>
      )}
      {/* Right action bg (pin) — revealed on swipe right */}
      {onSwipeRightAction && (
        <div ref={rightIconRef} className="absolute inset-y-0 left-0 w-20 flex items-center justify-center bg-blue-500 text-white text-xs font-medium" style={{ opacity: 0 }}>
          <Pin className="h-4 w-4 mr-1" />
          {rightLabel || "Pin"}
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
  onThreadPin,
  onThreadUnpin,
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
  onThreadPin: (msgId: number) => Promise<void>;
  onThreadUnpin: (msgId: number) => Promise<void>;
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

  // More actions dropdown state
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(moreMenuRef, () => setShowMoreMenu(false));

  // Memoize search highlight regex to avoid recompiling per message per render
  const highlightRegex = useMemo(() => {
    if (!threadSearch) return null;
    const escaped = threadSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(<[^>]+>)|(${escaped})`, "gi");
  }, [threadSearch]);

  // Edit state — only editingMessageId is tracked here; actual edit state is in MessageBubble
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Capture first unread message ID before auto-mark-read (runs during render, before effects)
  const firstUnreadIdRef = useRef<number | null>(null);
  const prevThreadIdRef = useRef<number | null>(null);
  if (thread.root_message.id !== prevThreadIdRef.current) {
    prevThreadIdRef.current = thread.root_message.id;
    const firstUnread = allMessages.find(m => !m.is_read && m.from_tutor_id !== currentTutorId);
    firstUnreadIdRef.current = firstUnread?.id ?? null;
  }

  // Reply composer ref for imperative actions (quoting, retry)
  const threadId = thread.root_message.id;
  const replyComposerRef = useRef<ReplyComposerHandle>(null);
  const [optimisticMessage, setOptimisticMessage] = useState<{ text: string; images: string[]; failed?: boolean } | null>(null);

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

  // Quote a message into the reply editor
  const handleQuote = useCallback((m: Message) => {
    const senderName = m.from_tutor_name || "Unknown";
    const plainText = stripHtml(m.message);
    const truncated = plainText.length > 150 ? plainText.slice(0, 150) + "..." : plainText;
    const quoteHtml = `<blockquote data-msg-id="${m.id}"><strong>${senderName}</strong><br>${truncated}</blockquote><p></p>`;
    replyComposerRef.current?.insertContent(quoteHtml);
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

  // Called by ReplyComposer when user sends a reply
  const handleSendReply = useCallback(async (text: string, images: string[]) => {
    // Build MessageCreate with auto-computed recipients
    const data: MessageCreate = {
      subject: `Re: ${msg.subject || "(no subject)"}`,
      message: text,
      priority: "Normal",
      category: msg.category || undefined,
      reply_to_id: msg.id,
      image_attachments: images.length > 0 ? images : undefined,
    };

    // Compute recipients
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
      if (msg.to_tutor_id != null) {
        data.to_tutor_id = msg.to_tutor_id;
      }
    } else {
      data.to_tutor_id = msg.from_tutor_id;
    }

    // Show optimistic bubble
    setOptimisticMessage({ text, images: [...images] });

    // Scroll to bottom
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);

    try {
      await onSendMessage(data);
      setOptimisticMessage(null);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 500);
    } catch (err) {
      setOptimisticMessage(prev => prev ? { ...prev, failed: true } : null);
      throw err; // Re-throw so ReplyComposer knows it failed
    }
  }, [msg, currentTutorId, onSendMessage]);

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
          onClick={() => {
            if (showThreadSearch) setThreadSearch("");
            setShowThreadSearch(!showThreadSearch);
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
        {/* More actions dropdown */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg transition-colors",
              showMoreMenu
                ? "text-[#a0704b] bg-[#f5ede3] dark:bg-[#3d2e1e]"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
            title="More actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {showMoreMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
              <button
                onClick={() => {
                  if (msg.is_thread_pinned) onThreadUnpin(msg.id);
                  else onThreadPin(msg.id);
                  setShowMoreMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <Pin className={cn("h-4 w-4", msg.is_thread_pinned && "text-blue-500")} />
                <span>{msg.is_thread_pinned ? "Unpin from top" : "Pin to top"}</span>
              </button>
              <button
                onClick={() => {
                  if (msg.is_pinned) onUnpin(msg.id);
                  else onPin(msg.id);
                  setShowMoreMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <Star className={cn("h-4 w-4", msg.is_pinned && "fill-amber-400 text-amber-400")} />
                <span>{msg.is_pinned ? "Unstar" : "Star"}</span>
              </button>
              <button
                onClick={() => {
                  if (isArchived) onUnarchive(msg.id);
                  else onArchive(msg.id);
                  setShowMoreMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                <span>{isArchived ? "Unarchive" : "Archive"}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Thread search bar */}
      {showThreadSearch && (
        <ThreadSearchBar
          allMessages={allMessages}
          threadSearch={threadSearch}
          onSearchChange={setThreadSearch}
          scrollRef={scrollRef}
          onClose={() => { setShowThreadSearch(false); setThreadSearch(""); }}
        />
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" onClick={handleQuoteClick}>
        {allMessages.map((m, idx) => {
          const isOwn = m.from_tutor_id === currentTutorId;

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

          const messageBubble = (
            <MessageBubble
              message={m}
              idx={idx}
              isOwn={isOwn}
              isFirstInGroup={isFirstInGroup}
              isLastInGroup={isLastInGroup}
              isMobile={isMobile}
              isEditing={editingMessageId === m.id}
              currentTutorId={currentTutorId}
              pictureUrl={pictureMap?.get(m.from_tutor_id)}
              highlightRegex={highlightRegex}
              threadSearch={threadSearch}
              mentionUsers={threadMentionUsers}
              onStartEdit={() => setEditingMessageId(m.id)}
              onCancelEdit={() => setEditingMessageId(null)}
              onSaveEdit={onEdit}
              onReact={(emoji) => onLike(m.id, emoji)}
              onQuote={() => handleQuote(m)}
              onForward={() => onForward(m)}
              onDelete={onDelete}
            />
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
                    replyComposerRef.current?.restoreContent(optimisticMessage.text, [...optimisticMessage.images]);
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
      <ReplyComposer
        ref={replyComposerRef}
        threadId={threadId}
        currentTutorId={currentTutorId}
        mentionUsers={threadMentionUsers}
        isMobile={isMobile}
        onSend={handleSendReply}
        onOpenFullEditor={() => onReply(msg)}
        onDraftChange={onDraftChange}
      />
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    localStorage.setItem("inbox_sound_muted", soundEnabled ? "0" : "1");
  }, [soundEnabled]);
  const playNotifSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!notifAudioRef.current) {
        // Short, subtle notification chime (Web Audio API — reuse context)
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") ctx.resume();
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

  // Track button position when popover is open — compute once on open + on scroll/resize
  useEffect(() => {
    if (!showShortcuts || !shortcutsButtonRef.current) {
      setShortcutsPos(null);
      return;
    }
    const updatePos = () => {
      if (shortcutsButtonRef.current) {
        const rect = shortcutsButtonRef.current.getBoundingClientRect();
        setShortcutsPos({ top: rect.bottom + 8, left: rect.left });
      }
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
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

  const handleThreadPin = useCallback(async (messageId: number) => {
    if (tutorId === null) return;
    try {
      await messagesAPI.threadPin([messageId], tutorId);
      showToast("Thread pinned!", "success");
      mutate(isAnyMessageKey);
    } catch {
      showToast("Failed to pin thread", "error");
    }
  }, [tutorId, showToast]);

  const handleThreadUnpin = useCallback(async (messageId: number) => {
    if (tutorId === null) return;
    try {
      await messagesAPI.threadUnpin([messageId], tutorId);
      showToast("Thread unpinned!", "success");
      mutate(isAnyMessageKey);
    } catch {
      showToast("Failed to unpin thread", "error");
    }
  }, [tutorId, showToast]);

  // Keyboard shortcuts — use refs to avoid re-registering on every state change
  const selectedThreadRef = useRef(selectedThread);
  const displayThreadsRef = useRef(displayThreads);
  const showShortcutsRef = useRef(showShortcuts);
  const searchQueryRef = useRef(searchQuery);
  const handleComposeRef = useRef(handleCompose);
  useEffect(() => { selectedThreadRef.current = selectedThread; }, [selectedThread]);
  useEffect(() => { displayThreadsRef.current = displayThreads; }, [displayThreads]);
  useEffect(() => { showShortcutsRef.current = showShortcuts; }, [showShortcuts]);
  useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);
  useEffect(() => { handleComposeRef.current = handleCompose; }, [handleCompose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input/editor
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).closest(".tiptap")) return;

      const threads = displayThreadsRef.current;
      const selected = selectedThreadRef.current;

      switch (e.key) {
        case "?":
          e.preventDefault();
          setShowShortcuts(prev => !prev);
          break;
        case "j":
        case "ArrowDown": {
          if (!threads.length) break;
          e.preventDefault();
          const currentIdx = selected
            ? threads.findIndex(t => t.root_message.id === selected.root_message.id)
            : -1;
          const nextIdx = Math.min(currentIdx + 1, threads.length - 1);
          setSelectedThread(threads[nextIdx]);
          break;
        }
        case "k":
        case "ArrowUp": {
          if (!threads.length || !selected) break;
          e.preventDefault();
          const curIdx = threads.findIndex(t => t.root_message.id === selected.root_message.id);
          const prevIdx = Math.max(curIdx - 1, 0);
          setSelectedThread(threads[prevIdx]);
          break;
        }
        case "Enter":
          if (!selected && threads.length > 0) {
            e.preventDefault();
            setSelectedThread(threads[0]);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (showShortcutsRef.current) {
            setShowShortcuts(false);
          } else if (selected) {
            setSelectedThread(null);
          } else if (searchQueryRef.current) {
            setSearchQuery("");
          }
          break;
        case "c":
          e.preventDefault();
          handleComposeRef.current();
          break;
        case "/":
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
              "h-full flex-shrink-0 bg-white/90 dark:bg-[#1a1a1a]/90 rounded-lg transition-all duration-200 overflow-hidden",
              categoryCollapsed ? "w-12" : "w-48"
            )}>
              <div className="h-full overflow-y-auto p-2">
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
                        <div className="my-2 mx-2 border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 relative">
                          <span className={cn(
                            "absolute -top-2.5 left-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-white dark:bg-[#1a1a1a] px-1 whitespace-nowrap transition-opacity duration-200",
                            categoryCollapsed ? "opacity-0" : "opacity-100"
                          )}>
                            {section.label}
                          </span>
                        </div>
                      )}
                      <div className="space-y-1">
                        {section.items.map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={cn(
                              "w-full flex items-center gap-2 py-2 rounded-lg text-sm transition-all duration-200 min-h-[44px] overflow-hidden whitespace-nowrap",
                              categoryCollapsed ? "px-2" : "px-3",
                              selectedCategory === cat.id
                                ? "bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b] font-medium"
                                : "text-gray-800 dark:text-gray-300 hover:bg-[#faf6f1] dark:hover:bg-[#2d2820]"
                            )}
                            title={cat.label}
                          >
                            <span className="relative flex-shrink-0">
                              {cat.icon}
                            </span>
                            <span className="flex-1 truncate">{cat.label}</span>
                            {categoryUnreadCounts[cat.id] > 0 && (
                              <span className={cn(
                                "flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-[#a0704b] rounded-full px-1",
                                categoryUnreadCounts[cat.id] > 5 && "animate-[badge-pulse_2s_ease-in-out_infinite] motion-reduce:animate-none"
                              )}>
                                {categoryUnreadCounts[cat.id] > 99 ? "99+" : categoryUnreadCounts[cat.id]}
                              </span>
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
                <div className="flex-1 flex flex-col items-center justify-center text-red-500 gap-3">
                  <div className="flex items-center">
                    <AlertCircle className="h-6 w-6 mr-2" />
                    Failed to load {selectedCategory === "makeup-confirmation" ? "proposals" : "messages"}
                  </div>
                  <button
                    onClick={() => mutate(isAnyMessageKey)}
                    className="px-4 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Retry
                  </button>
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
                          onSwipeRightAction={() => thread.root_message.is_thread_pinned ? handleThreadUnpin(thread.root_message.id) : handleThreadPin(thread.root_message.id)}
                          rightLabel={thread.root_message.is_thread_pinned ? "Unpin" : "Pin"}
                        >
                          {item}
                        </SwipeableThreadItem>
                      );
                    };

                    // Split thread-pinned from the rest (skip in "starred" view — irrelevant there)
                    const pinnedInList = selectedCategory !== "starred" ? displayThreads.filter(t => t.root_message.is_thread_pinned) : [];
                    const unpinned = selectedCategory !== "starred" ? displayThreads.filter(t => !t.root_message.is_thread_pinned) : displayThreads;

                    return debouncedSearch.trim() ? (
                      // Flat list when searching — pinned threads first
                      <>
                        {pinnedInList.map((thread) => renderThread(thread, true))}
                        {unpinned.map((thread) => renderThread(thread, true))}
                      </>
                    ) : (
                      // Pinned group first, then grouped by date
                      <>
                        {pinnedInList.length > 0 && (
                          <div>
                            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-[#faf6f1]/80 dark:bg-[#1a1a1a]/80 sticky top-0 z-[5] border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 flex items-center gap-1.5">
                              <Pin className="h-3 w-3" />
                              Pinned
                            </div>
                            {pinnedInList.map((thread) => renderThread(thread))}
                          </div>
                        )}
                        {groupThreadsByDate(unpinned).map((group) => (
                          <div key={group.label}>
                            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-[#faf6f1]/80 dark:bg-[#1a1a1a]/80 sticky top-0 z-[5] border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30">
                              {group.label}
                            </div>
                            {group.threads.map((thread) => renderThread(thread))}
                          </div>
                        ))}
                      </>
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
              <div
                key={selectedThread.root_message.id}
                className={cn(
                "h-full rounded-lg overflow-hidden animate-in fade-in duration-150",
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
                  onThreadPin={handleThreadPin}
                  onThreadUnpin={handleThreadUnpin}
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

      {/* WeCom Send Modal (lazy-loaded) */}
      {showWecom && (
        <Suspense fallback={null}>
          <SendToWecomModal
            isOpen={showWecom}
            onClose={() => setShowWecom(false)}
          />
        </Suspense>
      )}

      {/* Schedule Makeup Modal for needs_input proposals (lazy-loaded) */}
      {makeupModalSession && (
        <Suspense fallback={null}>
          <ScheduleMakeupModal
            session={makeupModalSession}
            isOpen={!!makeupModalSession}
            onClose={() => setMakeupModalSession(null)}
          />
        </Suspense>
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
