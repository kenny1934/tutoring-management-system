"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useClickOutside } from "@/lib/hooks";
import { usePanelSwipe } from "@/lib/usePanelSwipe";
import { useSwipeable } from "@/lib/useSwipeable";
import { messagesAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { stripHtml, renderMathInHtml } from "@/lib/html-utils";
import { shatterElement } from "@/lib/shatter-animation";
import { getTutorFirstName } from "@/components/zen/utils/sessionSorting";
import MessageBubble from "@/components/inbox/MessageBubble";
import ReplyComposer from "@/components/inbox/ReplyComposer";
import type { ReplyComposerHandle } from "@/components/inbox/ReplyComposer";
import SnoozePicker from "@/components/inbox/SnoozePicker";
import ThreadSearchBar from "@/components/inbox/ThreadSearchBar";
import TypingIndicator from "@/components/inbox/TypingIndicator";
import type { MentionUser } from "@/components/inbox/InboxRichEditor";
import type { Message, MessageThread, MessageCreate, MessageTemplate } from "@/types";
import type { TypingUser } from "@/lib/useSSE";
import { CATEGORIES, PRIORITIES, type PriorityLevel, formatSnoozeUntil, formatScheduledAt, formatDateLabel, computeReplyRecipients } from "@/lib/inbox-constants";
import {
  ChevronLeft,
  Users,
  Circle,
  CircleDot,
  Search,
  MoreVertical,
  Pin,
  Star,
  AlarmClock,
  Bell,
  BellOff,
  Archive,
  ArchiveRestore,
  Clock,
  ChevronDown,
  AlertCircle,
  RotateCcw,
  Trash2,
  FileText,
  Mic,
  Reply,
} from "lucide-react";

// Swipeable message wrapper — swipe right to quote (mobile only)
function SwipeableMessage({ children, onQuote }: { children: React.ReactNode; onQuote: () => void }) {
  const { containerRef, rightIconRef, touchHandlers } = useSwipeable({
    onSwipeRight: onQuote,
    maxDistance: 60,
    threshold: 50,
    fadeDistance: 50,
    springTransition: "transform 0.2s ease-out",
  });

  return (
    <div className="relative overflow-hidden">
      <div ref={rightIconRef} className="absolute inset-y-0 left-0 w-14 flex items-center justify-center text-[#a0704b]" style={{ opacity: 0 }}>
        <Reply className="h-4 w-4" />
      </div>
      <div ref={containerRef} {...touchHandlers}>
        {children}
      </div>
    </div>
  );
}

// --- Props ---

export interface ThreadDetailPanelProps {
  thread: MessageThread;
  currentTutorId: number;
  onClose: () => void;
  onReply: (msg: Message) => void;
  onSendMessage: (data: MessageCreate) => Promise<void>;
  onLike: (msgId: number, emoji?: string) => void;
  onMarkRead: (msgId: number) => void;
  onMarkUnread: (msgId: number) => void;
  onEdit: (msgId: number, newText: string, imageAttachments?: string[]) => Promise<void>;
  onDelete: (msgId: number, isRoot: boolean) => Promise<void>;
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
  onDraftChange?: (threadId: number) => void;
  mentionUsers?: MentionUser[];
  typingUsers?: TypingUser[];
  onlineTutorIds?: Set<number>;
  templates?: MessageTemplate[];
  onCreateTemplate?: (title: string, content: string) => void;
  onDeleteTemplate?: (templateId: number) => void;
  onThreadMute?: (msgId: number) => Promise<void>;
  onThreadUnmute?: (msgId: number) => Promise<void>;
  onSnooze?: (msgId: number, snoozeUntil: string) => Promise<void>;
  onUnsnooze?: (msgId: number) => Promise<void>;
  onSendVoice?: (file: File, durationSec: number) => Promise<void>;
  onCancelScheduled?: (msgId: number) => Promise<void>;
  onRegisterUndo?: (callback: () => void) => void;
  onOptimisticReply?: (info: { threadId: number; message: string; createdAt: string } | null) => void;
}

// --- Component ---

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
  typingUsers,
  onlineTutorIds,
  templates,
  onCreateTemplate,
  onDeleteTemplate,
  onThreadMute,
  onThreadUnmute,
  onSnooze,
  onUnsnooze,
  onSendVoice,
  onCancelScheduled,
  onRegisterUndo,
  onOptimisticReply,
}: ThreadDetailPanelProps) {
  const { root_message: msg, replies } = thread;
  const allMessages = [msg, ...replies.filter(r => r.id > 0)];

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
  const { panelRef, touchHandlers } = usePanelSwipe(isMobile, onClose);

  // Thread search state
  const [threadSearch, setThreadSearch] = useState("");
  const [showThreadSearch, setShowThreadSearch] = useState(false);

  // Pre-compute date separators and message grouping to avoid recalculating per render
  const processedMessages = useMemo(() =>
    allMessages.map((m, idx) => {
      const msgDate = new Date(m.created_at);
      const dateStr = msgDate.toDateString();
      const prevDateStr = idx > 0 ? new Date(allMessages[idx - 1].created_at).toDateString() : null;
      const isNewDay = idx === 0 || dateStr !== prevDateStr;
      const prevMsg = idx > 0 ? allMessages[idx - 1] : null;
      const isFirstInGroup = !prevMsg || prevMsg.from_tutor_id !== m.from_tutor_id || isNewDay;
      const isLastInGroup = !allMessages[idx + 1] || allMessages[idx + 1].from_tutor_id !== m.from_tutor_id;
      return { message: m, isNewDay, msgDate, isFirstInGroup, isLastInGroup };
    }),
    [allMessages]
  );

  // Snooze picker state
  const [showSnoozePicker, setShowSnoozePicker] = useState(false);

  // Typing indicator callback
  const handleTyping = useCallback(() => {
    messagesAPI.sendTyping(currentTutorId, msg.id).catch(() => {});
  }, [currentTutorId, msg.id]);

  // More actions dropdown state
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(moreMenuRef, () => setShowMoreMenu(false));

  // Edit state — only editingMessageId is tracked here; actual edit state is in MessageBubble
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);

  // "Edit as New" geometry state — set when user clicks "Edit as New" in a diagram viewer
  const [externalGeoState, setExternalGeoState] = useState<string | null>(null);
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
  const [optimisticMessage, setOptimisticMessage] = useState<{
    text: string;
    images: string[];
    files: { url: string; filename: string; content_type: string; duration?: number }[];
    status: 'sending' | 'failed';
  } | null>(null);
  const optimisticCreatedRef = useRef<Date | null>(null);

  // Clear optimistic bubble when SWR data arrives with the real message (no flash)
  useEffect(() => {
    if (!optimisticMessage || optimisticMessage.status === 'failed') return;
    const created = optimisticCreatedRef.current;
    if (!created) return;
    const allMsgs = [thread.root_message, ...thread.replies];
    const hasNewerOwn = allMsgs.some(
      m => m.id > 0 && m.from_tutor_id === currentTutorId && new Date(m.created_at) >= created
    );
    if (hasNewerOwn) {
      setOptimisticMessage(null);
      optimisticCreatedRef.current = null;
      onOptimisticReply?.(null);
    }
  }, [thread, currentTutorId, optimisticMessage, onOptimisticReply]);

  // Auto-scroll to bottom when thread opens
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, [thread]);

  // Mark messages as read when viewing (skip scheduled — not sent yet)
  useEffect(() => {
    if (msg.scheduled_at) return;
    allMessages.forEach((m) => {
      if (!m.is_read) {
        onMarkRead(m.id);
      }
    });
  }, [allMessages, onMarkRead, msg.scheduled_at]);

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
  const handleSendReply = useCallback(async (text: string, images: string[], files: { url: string; filename: string; content_type: string }[] = []) => {
    // Build MessageCreate with auto-computed recipients
    const data: MessageCreate = {
      subject: `Re: ${msg.subject || "(no subject)"}`,
      message: text || "<p></p>",
      priority: "Normal",
      category: msg.category || undefined,
      reply_to_id: msg.id,
      image_attachments: images.length > 0 ? images : undefined,
      file_attachments: files.length > 0 ? files : undefined,
    };

    // Compute recipients
    Object.assign(data, computeReplyRecipients(msg, currentTutorId));

    // Show optimistic bubble (looks fully sent with clock indicator)
    optimisticCreatedRef.current = new Date();
    setOptimisticMessage({ text: text || "<p></p>", images: [...images], files: [...files], status: 'sending' });

    // Update thread list preview optimistically
    onOptimisticReply?.({ threadId: msg.id, message: text || "<p></p>", createdAt: new Date().toISOString() });

    // Register undo callback so Undo restores editor content
    const savedText = text;
    const savedImages = [...images];
    onRegisterUndo?.(() => {
      setOptimisticMessage(null);
      optimisticCreatedRef.current = null;
      onOptimisticReply?.(null);
      replyComposerRef.current?.restoreContent(savedText, savedImages);
    });

    // Scroll to bottom
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);

    try {
      await onSendMessage(data);
      // Don't clear optimistic here — useEffect below clears it when SWR data arrives
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 500);
    } catch (err) {
      setOptimisticMessage(prev => prev ? { ...prev, status: 'failed' } : null);
      throw err; // Re-throw so ReplyComposer knows it failed
    }
  }, [msg, currentTutorId, onSendMessage, onRegisterUndo, onOptimisticReply]);

  // Called by ReplyComposer when user schedules a reply
  const handleScheduleReply = useCallback(async (text: string, images: string[], files: { url: string; filename: string; content_type: string }[] = [], scheduledAt: string) => {
    const data: MessageCreate = {
      subject: `Re: ${msg.subject || "(no subject)"}`,
      message: text || "<p></p>",
      priority: "Normal",
      category: msg.category || undefined,
      reply_to_id: msg.id,
      image_attachments: images.length > 0 ? images : undefined,
      file_attachments: files.length > 0 ? files : undefined,
      scheduled_at: scheduledAt,
    };
    Object.assign(data, computeReplyRecipients(msg, currentTutorId));
    await onSendMessage(data);
  }, [msg, currentTutorId, onSendMessage]);

  return (
    <div
      ref={panelRef}
      className={cn("h-full flex flex-col", isMobile ? "bg-white dark:bg-[#1a1a1a]" : "bg-white/90 dark:bg-[#1a1a1a]/90")}
      {...touchHandlers}
    >
      {/* Header */}
      <div className="flex items-center gap-1 sm:gap-3 px-4 py-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] z-[1] relative">
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center"
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
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-500 flex-wrap">
            <span>{allMessages.length} message{allMessages.length !== 1 && "s"}</span>
            <span className="opacity-40">·</span>
            {msg.to_tutor_id === null ? (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                Broadcast
              </span>
            ) : (() => {
              const others = threadMentionUsers.filter(u => u.id !== currentTutorId);
              if (others.length === 0) return <span>you</span>;
              if (msg.is_group_message) {
                const shown = others.slice(0, 3).map(u => getTutorFirstName(u.label));
                const remaining = others.length - 3;
                const text = remaining > 0
                  ? `${shown.join(", ")} +${remaining} more & you`
                  : `${shown.join(", ")} & you`;
                return (
                  <span className="flex items-center gap-1 truncate" title={others.map(u => u.label).join(", ") + " & you"}>
                    <Users className="h-3 w-3 flex-shrink-0" />
                    {text}
                  </span>
                );
              }
              return <span className="truncate">{others[0].label} & you</span>;
            })()}
            {msg.is_snoozed && msg.snoozed_until && (
              <>
                <span className="opacity-40">·</span>
                <span className="flex items-center gap-1 text-[#a0704b]">
                  <AlarmClock className="h-3 w-3" />
                  {formatSnoozeUntil(msg.snoozed_until)}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => msg.is_read ? onMarkUnread(msg.id) : onMarkRead(msg.id)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg transition-colors",
            msg.is_read
              ? "text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50"
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
              : "text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50"
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
                : "text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50"
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors text-left"
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors text-left"
              >
                <Star className={cn("h-4 w-4", msg.is_pinned && "fill-amber-400 text-amber-400")} />
                <span>{msg.is_pinned ? "Unstar" : "Star"}</span>
              </button>
              {onThreadMute && onThreadUnmute && (
                <button
                  onClick={() => {
                    if (msg.is_thread_muted) onThreadUnmute(msg.id);
                    else onThreadMute(msg.id);
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors text-left"
                >
                  {msg.is_thread_muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  <span>{msg.is_thread_muted ? "Unmute" : "Mute"}</span>
                </button>
              )}
              {onSnooze && (
                <div className="relative">
                  <button
                    onClick={() => {
                      if (msg.is_snoozed && onUnsnooze) {
                        onUnsnooze(msg.id);
                        setShowMoreMenu(false);
                      } else {
                        setShowSnoozePicker(!showSnoozePicker);
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors text-left"
                  >
                    <AlarmClock className="h-4 w-4" />
                    <span>{msg.is_snoozed ? "Remove reminder" : "Remind me"}</span>
                  </button>
                  {showSnoozePicker && (
                    <SnoozePicker
                      onSnooze={(until) => {
                        onSnooze(msg.id, until);
                        setShowSnoozePicker(false);
                        setShowMoreMenu(false);
                      }}
                      onClose={() => setShowSnoozePicker(false)}
                    />
                  )}
                </div>
              )}
              <button
                onClick={() => {
                  if (isArchived) onUnarchive(msg.id);
                  else onArchive(msg.id);
                  setShowMoreMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors text-left"
              >
                {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                <span>{isArchived ? "Unarchive" : "Archive"}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scheduled message banner */}
      {msg.scheduled_at && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/40">
          <span className="flex items-center gap-1.5 text-sm text-amber-800 dark:text-amber-200">
            <Clock className="h-4 w-4" />
            Scheduled for {formatScheduledAt(msg.scheduled_at)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditingMessageId(msg.id)}
              className="px-3 py-1 text-xs font-medium rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Edit
            </button>
            {onCancelScheduled && (
              <button
                type="button"
                onClick={() => onCancelScheduled(msg.id)}
                className="px-3 py-1 text-xs font-medium rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Cancel send
              </button>
            )}
          </div>
        </div>
      )}

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
        {processedMessages.map(({ message: m, isNewDay, msgDate, isFirstInGroup, isLastInGroup }, idx) => {
          const isOwn = m.from_tutor_id === currentTutorId;

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
              threadSearch={threadSearch}
              mentionUsers={threadMentionUsers}
              isOnline={onlineTutorIds?.has(m.from_tutor_id)}
              onStartEdit={() => setEditingMessageId(m.id)}
              onCancelEdit={() => setEditingMessageId(null)}
              onSaveEdit={onEdit}
              onReact={(emoji) => onLike(m.id, emoji)}
              onQuote={() => handleQuote(m)}
              onForward={() => onForward(m)}
              onDelete={async (msgId) => {
                const el = document.getElementById(`msg-${msgId}`);
                if (el) {
                  await new Promise<void>(resolve => shatterElement(el, resolve));
                }
                onDelete(msgId, msgId === msg.id);
              }}
              onEditGeoAsNew={setExternalGeoState}
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

        {/* Optimistic send bubble — looks fully sent, like a real message */}
        {optimisticMessage && (
          <div className={cn(
            "ml-12 sm:ml-20 p-3 rounded-2xl mt-1",
            optimisticMessage.status === 'failed'
              ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40"
              : "bg-[#ede0cf] dark:bg-[#3d3628]"
          )} style={{ animation: 'message-in 0.2s ease-out both' }}>
            {optimisticMessage.text && optimisticMessage.text !== "<p></p>" && (
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 break-words"
                dangerouslySetInnerHTML={{ __html: renderMathInHtml(optimisticMessage.text) }}
              />
            )}
            {optimisticMessage.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {optimisticMessage.images.map((url, idx) => (
                  <img key={url} src={url} alt={`Attachment ${idx + 1}`}
                    className="max-h-48 max-w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]" />
                ))}
              </div>
            )}
            {optimisticMessage.files.length > 0 && (
              <div className="mt-2 space-y-2">
                {optimisticMessage.files.map((file) =>
                  file.content_type?.startsWith("video/") ? (
                    <video key={file.url} src={file.url} controls preload="metadata"
                      className="max-h-64 max-w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]" />
                  ) : file.content_type === "image/gif" ? (
                    <img key={file.url} src={file.url} alt={file.filename}
                      className="max-h-48 max-w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]" />
                  ) : (
                    <div key={file.url}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50">
                      <div className="p-2 rounded-lg bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b] flex-shrink-0">
                        {file.content_type?.startsWith("audio/")
                          ? <Mic className="h-5 w-5" />
                          : <FileText className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{file.filename}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{file.content_type?.split('/').pop()?.toUpperCase()}</div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
            {optimisticMessage.status === 'failed' ? (
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
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 rounded transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Discard
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-1 mt-1">
                <span className="text-[11px] text-gray-400">Just now</span>
                <Clock className="h-3 w-3 text-gray-400" />
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

      {/* Typing indicator */}
      {typingUsers && typingUsers.length > 0 && (
        <TypingIndicator typingUsers={typingUsers} />
      )}

      {/* Inline reply bar (hidden for scheduled messages) */}
      {!msg.scheduled_at && (
        <ReplyComposer
          ref={replyComposerRef}
          threadId={threadId}
          currentTutorId={currentTutorId}
          mentionUsers={threadMentionUsers}
          isMobile={isMobile}
          onSend={handleSendReply}
          onScheduleSend={handleScheduleReply}
          onOpenFullEditor={() => onReply(msg)}
          onDraftChange={onDraftChange}
          onTyping={handleTyping}
          templates={templates}
          onCreateTemplate={onCreateTemplate}
          onDeleteTemplate={onDeleteTemplate}
          onSendVoice={onSendVoice}
          externalGeoState={externalGeoState}
          onExternalGeoStateConsumed={() => setExternalGeoState(null)}
        />
      )}
    </div>
  );
});

export default ThreadDetailPanel;
