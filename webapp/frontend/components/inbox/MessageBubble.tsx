"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X, Pencil, Check, Trash2, Loader2, Reply, Forward,
  Smile, FileText, Download, Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TutorAvatar } from "@/lib/avatar-utils";
import { isHtmlEmpty, renderMathInHtml, renderGeometryInHtml, highlightTextNodes } from "@/lib/html-utils";
import { highlightCodeBlocks } from "@/lib/code-highlight";
import GeometryViewerModal from "@/components/inbox/GeometryViewerModal";
import { messagesAPI } from "@/lib/api";
import { useFileUpload } from "@/lib/useFileUpload";
import InboxRichEditor from "@/components/inbox/InboxRichEditor";
import type { MentionUser } from "@/components/inbox/InboxRichEditor";
import { LinkPreview } from "@/components/inbox/LinkPreview";
import { ProposalEmbed } from "@/components/inbox/ProposalEmbed";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import AudioPlayer from "@/components/inbox/AudioPlayer";
import AttachmentMenu from "@/components/inbox/AttachmentMenu";
import type { Message } from "@/types";
import "katex/dist/katex.min.css";

// Module-level constants
const HAS_HTML_RE = /<[a-z][\s\S]*>/i;

// --- Utility functions ---

export function formatMessageTime(dateStr: string): string {
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

export function highlightMatch(text: string, query: string): React.ReactNode {
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
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );
  } catch {
    return text;
  }
}

// --- SeenBadge ---

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

  if (message.from_tutor_id !== currentTutorId) return null;

  const readReceipts = message.read_receipts || [];
  const readCount = readReceipts.length;
  const totalRecipients = message.total_recipients || 0;
  const readByAll = message.read_by_all || false;
  const hasBeenRead = readCount > 0;
  const isBlue = readByAll;
  const checkColor = isBlue ? "text-blue-500" : "text-gray-400 dark:text-gray-400";

  const showProgressBar = totalRecipients >= 3;
  const readPercent = totalRecipients > 0 ? Math.round((readCount / totalRecipients) * 100) : 0;

  return (
    <div className="relative inline-flex flex-col items-end gap-0.5">
      <div className="inline-flex items-center">
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
          className={cn("flex items-center gap-0.5 text-xs transition-colors hover:opacity-80", checkColor)}
          title={readByAll ? "Seen by all" : hasBeenRead ? `Seen by ${readCount}` : "Sent"}
        >
          {hasBeenRead ? (
            <svg viewBox="0 0 16 11" width="16" height="11" className={checkColor} fill="currentColor">
              <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.136.473.473 0 0 0-.323.137.473.473 0 0 0-.137.323c0 .126.046.236.137.327l2.727 2.591a.46.46 0 0 0 .327.136.476.476 0 0 0 .381-.178l6.5-8.045a.426.426 0 0 0 .102-.31.414.414 0 0 0-.098-.285z" />
              <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.005-.951a.457.457 0 0 0-.312-.123.469.469 0 0 0-.327.137.473.473 0 0 0-.137.323c0 .126.046.236.137.327l1.327 1.259a.46.46 0 0 0 .327.136.476.476 0 0 0 .381-.178l6.5-8.045a.426.426 0 0 0 .102-.31.414.414 0 0 0-.118-.287z" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 11" width="12" height="11" className={checkColor} fill="currentColor">
              <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.136.473.473 0 0 0-.323.137.473.473 0 0 0-.137.323c0 .126.046.236.137.327l2.727 2.591a.46.46 0 0 0 .327.136.476.476 0 0 0 .381-.178l6.5-8.045a.426.426 0 0 0 .102-.31.414.414 0 0 0-.098-.285z" />
            </svg>
          )}
          {showProgressBar && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-0.5">
              {readCount}/{totalRecipients}
            </span>
          )}
        </button>
      </div>
      {showProgressBar && (
        <div className="w-20 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 bg-[#a0704b]"
            style={{ width: `${readPercent}%` }}
          />
        </div>
      )}
      {showPopover && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setShowPopover(false)} />
          <div
            ref={popoverRef}
            className="fixed z-[61] bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-[#d4a574] dark:border-[#8b6f47] py-2 min-w-[200px] max-w-[260px]"
            style={{ top: popoverPos?.top ?? 0, left: popoverPos?.left ?? 0 }}
          >
            <div className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              Read by {readCount} of {totalRecipients}
            </div>
            {showProgressBar && (
              <div className="px-3 py-1.5">
                <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-[#a0704b]"
                    style={{ width: `${readPercent}%` }}
                  />
                </div>
              </div>
            )}
            <div className="max-h-[200px] overflow-y-auto">
              {readReceipts.length > 0 && (
                <div className="px-3 pt-1 pb-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Read</div>
              )}
              {readReceipts.map((receipt) => (
                <div key={receipt.tutor_id} className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Check className="h-3 w-3 text-blue-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{receipt.tutor_name}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {new Date(receipt.read_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
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

// --- ReactionPicker ---

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const EMOJI_LABELS: Record<string, string> = { "👍": "thumbs up", "❤️": "heart", "😂": "laugh", "😮": "surprised", "😢": "sad", "🙏": "pray" };

// Frequently used emoji tracking in localStorage
const FREQ_EMOJI_KEY = "inbox_frequent_emoji";

function getFrequentEmojis(max = 6): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(FREQ_EMOJI_KEY) || "[]") as { emoji: string; count: number }[];
    return data.sort((a, b) => b.count - a.count).slice(0, max).map(d => d.emoji);
  } catch {
    return [];
  }
}

function trackEmojiUse(emoji: string) {
  try {
    const data = JSON.parse(localStorage.getItem(FREQ_EMOJI_KEY) || "[]") as { emoji: string; count: number }[];
    const existing = data.find(d => d.emoji === emoji);
    if (existing) {
      existing.count++;
    } else {
      data.push({ emoji, count: 1 });
    }
    // Keep only top 20
    data.sort((a, b) => b.count - a.count);
    localStorage.setItem(FREQ_EMOJI_KEY, JSON.stringify(data.slice(0, 20)));
  } catch {
    // Ignore localStorage errors
  }
}

const ReactionPicker = React.memo(function ReactionPicker({ messageId, onReact, isMobile }: { messageId: number; onReact: (emoji: string) => void; isMobile?: boolean }) {
  const [showPicker, setShowPicker] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const emojiRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!showPicker || showFullPicker) return; // FloatingDropdown handles its own dismiss
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
        setShowFullPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPicker, showFullPicker]);

  useEffect(() => {
    if (showPicker) {
      setFocusIdx(0);
      requestAnimationFrame(() => emojiRefs.current[0]?.focus());
    }
  }, [showPicker]);

  const handlePickerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setShowPicker(false); setShowFullPicker(false); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (focusIdx + 1) % REACTION_EMOJIS.length;
      setFocusIdx(next);
      emojiRefs.current[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (focusIdx - 1 + REACTION_EMOJIS.length) % REACTION_EMOJIS.length;
      setFocusIdx(prev);
      emojiRefs.current[prev]?.focus();
    }
  }, [focusIdx]);

  const handleReact = useCallback((emoji: string) => {
    trackEmojiUse(emoji);
    onReact(emoji);
    setShowPicker(false);
    setShowFullPicker(false);
  }, [onReact]);

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => { setShowPicker(!showPicker); setShowFullPicker(false); }}
        className="p-1 rounded-full text-gray-400 hover:text-red-500 transition-colors"
        title="React"
        aria-haspopup="true"
        aria-expanded={showPicker}
      >
        <Smile className="h-3.5 w-3.5" />
      </button>
      {showPicker && (
        <div
          className={cn("absolute bottom-full mb-1 z-50 flex gap-0.5 bg-white dark:bg-[#2a2a2a] rounded-full shadow-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 px-1 py-0.5", isMobile ? "left-0" : "right-0")}
          role="menu"
          aria-label="Emoji reactions"
          onKeyDown={handlePickerKeyDown}
        >
          {REACTION_EMOJIS.map((emoji, i) => (
            <button
              key={emoji}
              ref={(el) => { emojiRefs.current[i] = el; }}
              role="menuitem"
              aria-label={`React with ${EMOJI_LABELS[emoji] || emoji}`}
              onClick={() => handleReact(emoji)}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors text-base"
              tabIndex={i === focusIdx ? 0 : -1}
            >
              {emoji}
            </button>
          ))}
          <button
            ref={plusButtonRef}
            onClick={() => setShowFullPicker(true)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors text-sm text-gray-400"
            title="More emojis"
          >
            +
          </button>
        </div>
      )}
      {showFullPicker && (
        <EmojiPicker
          triggerRef={plusButtonRef}
          isOpen={true}
          onSelect={handleReact}
          onClose={() => { setShowFullPicker(false); setShowPicker(false); }}
        />
      )}
    </div>
  );
});

// --- LikesBadge ---

const LikesBadge = React.memo(function LikesBadge({ message, currentTutorId, onToggleReaction }: { message: Message; currentTutorId: number; onToggleReaction: (emoji: string) => void }) {
  const [popover, setPopover] = useState<{ emoji: string; pos: { top: number; left: number } } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const likeDetails = message.like_details || [];

  const grouped = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; tutors: string[]; tutorIds: number[] }>();
    for (const d of likeDetails) {
      const emoji = d.emoji || "❤️";
      const existing = map.get(emoji);
      if (existing) {
        existing.count++;
        existing.tutors.push(d.tutor_name);
        existing.tutorIds.push(d.tutor_id);
      } else {
        map.set(emoji, { emoji, count: 1, tutors: [d.tutor_name], tutorIds: [d.tutor_id] });
      }
    }
    return Array.from(map.values());
  }, [likeDetails]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  if (likeDetails.length === 0) return null;

  const popoverDetails = popover
    ? likeDetails.filter(d => (d.emoji || "❤️") === popover.emoji)
    : [];

  return (
    <div className="inline-flex items-center gap-0.5">
      {grouped.map((g) => {
        const isMine = g.tutorIds.includes(currentTutorId);
        return (
          <button
            key={g.emoji}
            onClick={() => {
              if (longPressFired.current) { longPressFired.current = false; return; }
              onToggleReaction(g.emoji);
            }}
            onTouchStart={(e) => {
              longPressFired.current = false;
              const rect = e.currentTarget.getBoundingClientRect();
              longPressTimer.current = setTimeout(() => {
                longPressFired.current = true;
                const spaceBelow = window.innerHeight - rect.bottom;
                setPopover({
                  emoji: g.emoji,
                  pos: {
                    top: spaceBelow > 180 ? rect.bottom + 6 : rect.top - 180,
                    left: Math.max(8, Math.min(rect.left, window.innerWidth - 200)),
                  },
                });
              }, 500);
            }}
            onTouchEnd={clearLongPress}
            onTouchMove={clearLongPress}
            className={cn(
              "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full shadow-sm text-xs transition-all duration-150",
              "hover:scale-110 hover:shadow-md active:scale-95",
              isMine
                ? "bg-[#a0704b]/10 border border-[#a0704b]/60 dark:border-[#a0704b]/60"
                : "bg-white dark:bg-[#2a2a2a] border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60"
            )}
            title={g.tutors.join(", ")}
          >
            <span className="text-sm leading-none">{g.emoji}</span>
            {g.count > 1 && <span className="text-gray-600 dark:text-gray-400">{g.count}</span>}
          </button>
        );
      })}
      {popover && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setPopover(null)} onTouchEnd={() => setPopover(null)} />
          <div
            className="fixed z-[61] bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-[#e8d4b8] dark:border-[#6b5a4a] py-2 min-w-[160px] max-w-[220px]"
            style={{ top: popover.pos.top, left: popover.pos.left }}
          >
            <div className="max-h-[150px] overflow-y-auto">
              {popoverDetails.map((detail, i) => (
                <div key={`${detail.tutor_id}-${i}`} className="px-3 py-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm flex-shrink-0">{detail.emoji || "❤️"}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{detail.tutor_name}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {new Date(detail.liked_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
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

// --- MessageBubble ---

export interface MessageBubbleProps {
  message: Message;
  idx: number;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isMobile: boolean;
  isEditing: boolean;
  currentTutorId: number;
  pictureUrl?: string;
  threadSearch: string;
  mentionUsers: MentionUser[];
  isOnline?: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (msgId: number, text: string, images?: string[]) => Promise<void>;
  onReact: (emoji: string) => void;
  onQuote: () => void;
  onForward: () => void;
  onDelete: (msgId: number) => Promise<void>;
}

const MessageBubble = React.memo(function MessageBubble({
  message: m,
  idx,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  isMobile,
  isEditing,
  currentTutorId,
  pictureUrl,
  threadSearch,
  mentionUsers,
  isOnline,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onReact,
  onQuote,
  onForward,
  onDelete,
}: MessageBubbleProps) {
  const isBroadcast = m.to_tutor_id === null;
  const isGroup = m.is_group_message;

  // Pre-render KaTeX math, geometry thumbnails, and syntax highlighting into the HTML string
  const renderedMessage = useMemo(() => highlightCodeBlocks(renderGeometryInHtml(renderMathInHtml(m.message))), [m.message]);

  // Apply search highlighting on visible text nodes only (skips KaTeX/code/geometry internals)
  const highlightedMessage = useMemo(
    () => threadSearch ? highlightTextNodes(renderedMessage, threadSearch) : renderedMessage,
    [renderedMessage, threadSearch]
  );

  // Geometry viewer state
  const [geoViewerOpen, setGeoViewerOpen] = useState(false);
  const [geoViewerJson, setGeoViewerJson] = useState("");

  // Internal edit state
  const [editText, setEditText] = useState(m.message);
  const [editImages, setEditImages] = useState<string[]>(m.image_attachments || []);
  const [isSaving, setIsSaving] = useState(false);
  const { uploadFiles: handleEditUpload, isUploading: isEditUploading } = useFileUpload({ tutorId: currentTutorId });

  // Internal delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset edit state when editing starts
  useEffect(() => {
    if (isEditing) {
      setEditText(m.message);
      setEditImages(m.image_attachments || []);
    }
  }, [isEditing, m.message, m.image_attachments]);

  const handleEditImageUpload = (files: FileList | null) => {
    handleEditUpload(files, { onImage: (url) => setEditImages(prev => [...prev, url]) });
  };

  const handleSaveEdit = async () => {
    if (!editText || editText === "<p></p>") return;
    setIsSaving(true);
    try {
      await onSaveEdit(m.id, editText, editImages);
      onCancelEdit();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div data-msg-idx={idx} className={cn(
      !isOwn && "flex gap-2 mr-12 sm:mr-20",
      isFirstInGroup ? "mt-3" : "mt-1",
      idx === 0 && "mt-0"
    )}>
      {!isOwn && (
        <div className="mt-1" style={{ visibility: isFirstInGroup ? 'visible' : 'hidden', width: 32, flexShrink: 0 }}>
          {isFirstInGroup && <TutorAvatar name={m.from_tutor_name || "?"} id={m.from_tutor_id} pictureUrl={pictureUrl} isOnline={isOnline} />}
        </div>
      )}
      <div
        id={`msg-${m.id}`}
        style={{ animation: 'message-in 0.2s ease-out both' }}
        className={cn(
          "group/msg relative p-3 rounded-2xl transition-shadow",
          m.like_count > 0 && "mb-4",
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
                !isMobile && "opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100"
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
              mentionUsers={mentionUsers}
            />
            <div>
              <AttachmentMenu
                onFiles={(files) => handleEditImageUpload(files)}
                isUploading={isEditUploading}
              />
              {editImages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {editImages.map((url, index) => (
                    <div key={url} className="relative group">
                      <img src={url} alt={`Attachment ${index + 1}`} className="h-16 w-16 object-cover rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]" />
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
                onClick={handleSaveEdit}
                disabled={isSaving || isHtmlEmpty(editText)}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#a0704b] hover:bg-[#8b5f3c] text-white text-sm rounded-lg transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save
              </button>
              <button
                onClick={onCancelEdit}
                disabled={isSaving}
                className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : m.message.includes("Voice message") && m.file_attachments?.some(f => f.content_type?.startsWith("audio/")) ? (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
            <Mic className="h-3.5 w-3.5" />
            <span>Voice message</span>
          </div>
        ) : HAS_HTML_RE.test(m.message) ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 break-words"
            onClick={(e) => {
              // Handle clicks on geometry diagram thumbnails
              const target = e.target as HTMLElement;
              const geoDiagram = target.closest('[data-type="geometry-diagram"]') as HTMLElement | null;
              if (geoDiagram) {
                const json = geoDiagram.getAttribute("data-graph-json") || "";
                if (json) {
                  setGeoViewerJson(json);
                  setGeoViewerOpen(true);
                }
              }
            }}
            dangerouslySetInnerHTML={{ __html: highlightedMessage }}
          />
        ) : (
          <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
            {threadSearch ? highlightMatch(m.message, threadSearch) : m.message}
          </div>
        )}

        {/* Link previews */}
        {!isEditing && m.message && <LinkPreview messageHtml={m.message} />}

        {/* Image attachments */}
        {m.image_attachments && m.image_attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            {m.image_attachments.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  className="max-h-48 max-w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:opacity-90 transition-opacity cursor-pointer"
                  loading="lazy"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              </a>
            ))}
          </div>
        )}

        {/* File/document attachments */}
        {m.file_attachments && m.file_attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            {m.file_attachments.map((file) =>
              file.content_type?.startsWith("audio/") ? (
                <AudioPlayer key={file.url} src={file.url} filename={file.filename} duration={file.duration} />
              ) : file.content_type?.startsWith("video/") ? (
                <video
                  key={file.url}
                  src={file.url}
                  controls
                  preload="metadata"
                  className="max-h-64 max-w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]"
                />
              ) : file.content_type === "image/gif" ? (
                <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={file.url}
                    alt={file.filename}
                    className="max-h-48 max-w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] hover:opacity-90 transition-opacity cursor-pointer"
                    loading="lazy"
                  />
                </a>
              ) : (
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
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{file.filename}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{file.content_type.split('/').pop()?.toUpperCase()}</div>
                  </div>
                  <Download className="h-4 w-4 text-gray-400 group-hover:text-[#a0704b] transition-colors flex-shrink-0" />
                </a>
              )
            )}
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
              : "absolute -top-3 right-2 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity bg-white dark:bg-[#2a2a2a] rounded-full shadow-md border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 px-1.5 py-0.5"
          )}>
            <ReactionPicker messageId={m.id} onReact={onReact} isMobile={isMobile} />
            <button onClick={onQuote} className="p-1 rounded-full text-gray-400 hover:text-[#a0704b] focus-visible:ring-2 focus-visible:ring-[#a0704b]/40 focus-visible:ring-offset-1 transition-colors" title="Quote">
              <Reply className="h-3.5 w-3.5" />
            </button>
            <button onClick={onForward} className="p-1 rounded-full text-gray-400 hover:text-[#a0704b] focus-visible:ring-2 focus-visible:ring-[#a0704b]/40 focus-visible:ring-offset-1 transition-colors" title="Forward">
              <Forward className="h-3.5 w-3.5" />
            </button>
            {isOwn && (
              <>
                <button onClick={onStartEdit} className="p-1 rounded-full text-gray-400 hover:text-[#a0704b] focus-visible:ring-2 focus-visible:ring-[#a0704b]/40 focus-visible:ring-offset-1 transition-colors" title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { onDelete(m.id); setShowDeleteConfirm(false); }}
                      className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-500 text-white hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-[#a0704b]/40 focus-visible:ring-offset-1 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowDeleteConfirm(true)} className="p-1 rounded-full text-gray-400 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 transition-colors" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Like count badge */}
        {m.like_count > 0 && (
          <div className="absolute -bottom-2.5 left-3">
            <LikesBadge message={m} currentTutorId={currentTutorId} onToggleReaction={onReact} />
          </div>
        )}

        {/* Own message: timestamp + seen badge */}
        {isOwn && (
          <div className={cn(
            "flex items-center justify-end gap-1 mt-1 transition-opacity",
            !isMobile && "opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100"
          )}>
            <span className="text-[11px] text-gray-400 dark:text-gray-400" title={new Date(m.created_at).toLocaleString()}>
              {formatMessageTime(m.created_at)}
              {m.updated_at && <span className="italic ml-1">(edited)</span>}
            </span>
            <SeenBadge message={m} currentTutorId={currentTutorId} />
          </div>
        )}
      </div>

      {/* Geometry interactive viewer */}
      <GeometryViewerModal
        isOpen={geoViewerOpen}
        onClose={() => setGeoViewerOpen(false)}
        graphJson={geoViewerJson}
      />
    </div>
  );
});

export default MessageBubble;
