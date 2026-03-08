"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { mutate } from "swr";
import {
  useMessageThreadsPaginated,
  useUnreadCategoryCounts,
  useProposals,
} from "@/lib/hooks";
import { messagesAPI } from "@/lib/api";
import { formatTimeAgo } from "@/lib/formatters";
import { stripHtml, renderMathInHtml, renderGeometryInHtml } from "@/lib/html-utils";
import { highlightCodeBlocks } from "@/lib/code-highlight";
import { computeReplyRecipients } from "@/lib/inbox-constants";
import { useFileUpload } from "@/lib/useFileUpload";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenSpinner } from "@/components/zen/ZenSpinner";
import "katex/dist/katex.min.css";
import type { MessageThread, MessageCategory, MakeupProposal, Message } from "@/types";

function renderMessage(html: string): string {
  return highlightCodeBlocks(renderGeometryInHtml(renderMathInHtml(html)));
}

function Attachments({ msg }: { msg: Pick<Message, "image_attachments" | "file_attachments"> }) {
  const hasImages = msg.image_attachments && msg.image_attachments.length > 0;
  const hasFiles = msg.file_attachments && msg.file_attachments.length > 0;
  if (!hasImages && !hasFiles) return null;

  return (
    <div style={{ marginTop: "6px" }}>
      {msg.image_attachments?.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={`Attachment ${i + 1}`}
            style={{ maxHeight: "200px", maxWidth: "100%", border: "1px solid var(--zen-border)", marginTop: "4px", display: "block" }}
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </a>
      ))}
      {msg.file_attachments?.map((file) =>
        file.content_type?.startsWith("video/") ? (
          <video
            key={file.url}
            src={file.url}
            controls
            preload="metadata"
            style={{ maxHeight: "240px", maxWidth: "100%", border: "1px solid var(--zen-border)", marginTop: "4px", display: "block" }}
          />
        ) : file.content_type?.startsWith("audio/") ? (
          <audio key={file.url} src={file.url} controls preload="metadata" style={{ marginTop: "4px", width: "100%", maxWidth: "300px" }} />
        ) : file.content_type === "image/gif" ? (
          <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer">
            <img
              src={file.url}
              alt={file.filename}
              style={{ maxHeight: "200px", maxWidth: "100%", border: "1px solid var(--zen-border)", marginTop: "4px", display: "block" }}
              loading="lazy"
            />
          </a>
        ) : (
          <a
            key={file.url}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              border: "1px solid var(--zen-border)",
              color: "var(--zen-accent)",
              fontSize: "10px",
              marginTop: "4px",
              textDecoration: "none",
            }}
          >
            [{file.content_type?.split("/").pop()?.toUpperCase() || "FILE"}] {file.filename}
          </a>
        )
      )}
    </div>
  );
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const CATEGORIES: { key: MessageCategory; label: string; abbr: string }[] = [
  { key: "Reminder", label: "Reminder", abbr: "Remind" },
  { key: "Question", label: "Question", abbr: "Quest" },
  { key: "Announcement", label: "Announcement", abbr: "Annce" },
  { key: "Schedule", label: "Schedule", abbr: "Sched" },
  { key: "Chat", label: "Chat", abbr: "Chat" },
  { key: "Courseware", label: "Courseware", abbr: "CWare" },
  { key: "MakeupConfirmation", label: "Makeup Confirm", abbr: "Makup" },
  { key: "Feedback", label: "Feedback", abbr: "Fdbck" },
];

const CATEGORY_ABBR: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.key, c.abbr])
);

interface ZenInboxProps {
  tutorId: number | null;
}

export function ZenInbox({ tutorId }: ZenInboxProps) {
  const [activeTab, setActiveTab] = useState<"messages" | "proposals">("messages");
  const [categoryFilter, setCategoryFilter] = useState<MessageCategory | undefined>(undefined);
  const [cursor, setCursor] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [focusPane, setFocusPane] = useState<"categories" | "list">("list");
  const [categoryCursor, setCategoryCursor] = useState(0); // 0 = All, 1+ = categories
  const [reactionPickerForId, setReactionPickerForId] = useState<number | null>(null);
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const cursorRowRef = useRef<HTMLDivElement>(null);
  const gPressedRef = useRef(false);
  const { setFocusedSection } = useZenKeyboardFocus();

  // Signal to ZenLayout: skip nav keys (c→courseware, r→revenue) when message is expanded
  useEffect(() => {
    setFocusedSection(expandedId ? "detail" : "sessions");
  }, [expandedId, setFocusedSection]);

  // Data hooks
  const { data: categoryCounts } = useUnreadCategoryCounts(tutorId);
  const counts = categoryCounts?.counts || {};
  const totalUnread = Object.values(counts).reduce((a, b) => a + b, 0);

  const {
    data: threads,
    isLoading: threadsLoading,
    hasMore,
    loadMore,
    refresh: refreshThreads,
  } = useMessageThreadsPaginated({
    tutorId,
    category: categoryFilter,
    pageSize: 30,
  });

  const { data: proposals = [], isLoading: proposalsLoading } = useProposals(
    tutorId ? { tutorId, status: "pending" as const } : null
  );

  // Current list for the active tab
  const currentList = activeTab === "messages" ? threads : proposals;

  // Reset cursor on tab/filter change
  useEffect(() => {
    setCursor(0);
    setExpandedId(null);
    setReplyingToId(null);
  }, [activeTab, categoryFilter]);

  // Auto-scroll cursor into view
  useEffect(() => {
    cursorRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursor]);

  // Category list including "All"
  const categoryList = useMemo(() => {
    const items: { key: MessageCategory | undefined; label: string; count: number }[] = [
      { key: undefined, label: "All", count: totalUnread },
    ];
    for (const cat of CATEGORIES) {
      const c = counts[cat.key] || 0;
      items.push({ key: cat.key, label: cat.label, count: c });
    }
    return items;
  }, [counts, totalUnread, categoryFilter]);

  // Actions
  const handleMarkRead = useCallback(async (messageId: number) => {
    if (!tutorId) return;
    try {
      await messagesAPI.markRead(messageId, tutorId);
      setZenStatus("Marked as read", "success");
      mutate((key: unknown) => Array.isArray(key) && (key[0] === "message-threads-paginated" || key[0] === "unread-count" || key[0] === "unread-category-counts"), undefined, { revalidate: true });
      refreshThreads();
    } catch {
      setZenStatus("Failed to mark as read", "error");
    }
  }, [tutorId, refreshThreads]);

  const handleArchive = useCallback(async (messageId: number) => {
    if (!tutorId) return;
    try {
      await messagesAPI.archive([messageId], tutorId);
      setZenStatus("Archived", "success");
      setExpandedId(null);
      mutate((key: unknown) => Array.isArray(key) && (key[0] === "message-threads-paginated" || key[0] === "unread-count" || key[0] === "unread-category-counts"), undefined, { revalidate: true });
      refreshThreads();
    } catch {
      setZenStatus("Archive failed", "error");
    }
  }, [tutorId, refreshThreads]);

  const handleReact = useCallback(async (messageId: number, emoji: string) => {
    if (!tutorId) return;
    try {
      const res = await messagesAPI.toggleLike(messageId, tutorId, emoji);
      setZenStatus(res.is_liked ? `Reacted ${emoji}` : `Removed ${emoji}`, "info");
      mutate((key: unknown) => Array.isArray(key) && key[0] === "message-threads-paginated", undefined, { revalidate: true });
      refreshThreads();
    } catch {
      setZenStatus("Reaction failed", "error");
    }
    setReactionPickerForId(null);
  }, [tutorId, refreshThreads]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable) return;

      // Composing reply — block all keyboard shortcuts (textarea handles its own input)
      if (replyingToId !== null) return;

      // Reaction picker mode — intercept before everything else
      if (reactionPickerForId !== null) {
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < REACTION_EMOJIS.length) {
          e.preventDefault();
          handleReact(reactionPickerForId, REACTION_EMOJIS[idx]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setReactionPickerForId(null);
          return;
        }
        return; // Block all other keys while picker is open
      }

      // Tab switching
      if (e.key === "1" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setActiveTab("messages");
        setFocusPane("list");
        return;
      }
      if (e.key === "2" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setActiveTab("proposals");
        setFocusPane("list");
        return;
      }

      // Pane switching
      if ((e.key === "h" || e.key === "ArrowLeft") && activeTab === "messages" && !expandedId) {
        e.preventDefault();
        setFocusPane("categories");
        return;
      }
      if ((e.key === "l" || e.key === "ArrowRight") && activeTab === "messages" && focusPane === "categories") {
        e.preventDefault();
        setFocusPane("list");
        return;
      }

      // Category pane navigation
      if (focusPane === "categories") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setCategoryCursor(prev => Math.min(prev + 1, categoryList.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setCategoryCursor(prev => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const selected = categoryList[categoryCursor];
          setCategoryFilter(selected?.key);
          setFocusPane("list");
          return;
        }
        return;
      }

      // List navigation
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        if (cursor < currentList.length - 1) {
          setCursor(prev => prev + 1);
          setExpandedId(null);
        } else if (activeTab === "messages" && hasMore) {
          loadMore();
        }
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (cursor > 0) {
          setCursor(prev => prev - 1);
          setExpandedId(null);
        }
        return;
      }

      // gg / G
      if (e.key === "g" && !e.shiftKey) {
        if (gPressedRef.current) {
          e.preventDefault();
          setCursor(0);
          setExpandedId(null);
          gPressedRef.current = false;
        } else {
          gPressedRef.current = true;
          setTimeout(() => { gPressedRef.current = false; }, 500);
        }
        return;
      }
      if (e.key === "G" && e.shiftKey) {
        e.preventDefault();
        setCursor(Math.max(0, currentList.length - 1));
        setExpandedId(null);
        gPressedRef.current = false;
        return;
      }

      // Enter to expand/collapse
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeTab === "messages" && threads[cursor]) {
          const id = threads[cursor].root_message.id;
          setExpandedId(expandedId === id ? null : id);
        } else if (activeTab === "proposals" && proposals[cursor]) {
          const id = proposals[cursor].id;
          setExpandedId(expandedId === id ? null : id);
        }
        return;
      }

      // Escape
      if (e.key === "Escape") {
        if (expandedId) {
          e.preventDefault();
          setExpandedId(null);
        } else if (categoryFilter) {
          e.preventDefault();
          setCategoryFilter(undefined);
          setCategoryCursor(0);
        }
        return;
      }

      // Mark read
      if (e.key === "m" && !e.shiftKey && activeTab === "messages") {
        e.preventDefault();
        const thread = threads[cursor];
        if (thread && !thread.root_message.is_read) {
          handleMarkRead(thread.root_message.id);
        }
        return;
      }

      // Archive
      if (e.key === "x" && activeTab === "messages") {
        e.preventDefault();
        const thread = threads[cursor];
        if (thread) {
          handleArchive(thread.root_message.id);
        }
        return;
      }

      // React
      if (e.key === "r" && !e.shiftKey && activeTab === "messages" && expandedId) {
        e.preventDefault();
        setReactionPickerForId(expandedId);
        return;
      }

      // Compose reply
      if (e.key === "c" && !e.shiftKey && activeTab === "messages" && expandedId && !replyingToId) {
        e.preventDefault();
        setReplyingToId(expandedId);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, focusPane, cursor, expandedId, categoryFilter, categoryList, currentList.length, threads, proposals, hasMore, loadMore, handleMarkRead, handleArchive, handleReact, reactionPickerForId, replyingToId]);

  return (
    <div style={{ padding: "8px 12px", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Title */}
      <div style={{ color: "var(--zen-accent)", fontWeight: "bold", fontSize: "12px", textShadow: "var(--zen-glow)", marginBottom: "4px" }}>
        INBOX
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "8px", borderBottom: "1px solid var(--zen-border)", paddingBottom: "4px" }}>
        <button
          onClick={() => { setActiveTab("messages"); setFocusPane("list"); }}
          style={{
            background: "none",
            border: "none",
            color: activeTab === "messages" ? "var(--zen-accent)" : "var(--zen-dim)",
            fontFamily: "inherit",
            fontSize: "11px",
            cursor: "pointer",
            fontWeight: activeTab === "messages" ? "bold" : "normal",
            textShadow: activeTab === "messages" ? "var(--zen-glow)" : "none",
            padding: "0",
          }}
        >
          [1] Messages{totalUnread > 0 ? ` (${totalUnread})` : ""}
        </button>
        <button
          onClick={() => { setActiveTab("proposals"); setFocusPane("list"); }}
          style={{
            background: "none",
            border: "none",
            color: activeTab === "proposals" ? "var(--zen-accent)" : "var(--zen-dim)",
            fontFamily: "inherit",
            fontSize: "11px",
            cursor: "pointer",
            fontWeight: activeTab === "proposals" ? "bold" : "normal",
            textShadow: activeTab === "proposals" ? "var(--zen-glow)" : "none",
            padding: "0",
          }}
        >
          [2] Proposals{proposals.length > 0 ? ` (${proposals.length})` : ""}
        </button>
      </div>

      {/* Content */}
      {activeTab === "messages" ? (
        <div style={{ flex: 1, display: "flex", overflow: "hidden", gap: "0" }}>
          {/* Category sidebar */}
          <div
            onClick={() => setFocusPane("categories")}
            style={{
              width: "140px",
              minWidth: "140px",
              borderRight: "1px solid var(--zen-border)",
              paddingRight: "8px",
              overflow: "auto",
              outline: focusPane === "categories" ? "1px solid var(--zen-accent)" : "1px solid transparent",
            }}
          >
            <div style={{ color: "var(--zen-dim)", fontSize: "10px", marginBottom: "4px" }}>CATEGORY</div>
            {categoryList.map((cat, i) => {
              const isAtCursor = focusPane === "categories" && i === categoryCursor;
              const isActive = categoryFilter === cat.key;
              return (
                <div
                  key={cat.label}
                  onClick={() => { setCategoryFilter(cat.key); setCategoryCursor(i); setFocusPane("list"); }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "2px 4px",
                    fontSize: "11px",
                    cursor: "pointer",
                    backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
                    borderLeft: isAtCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
                  }}
                >
                  <span style={{ color: isActive ? "var(--zen-accent)" : "var(--zen-fg)" }}>
                    {isAtCursor ? "> " : "  "}{cat.label}
                  </span>
                  <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
                    {cat.count > 0 ? cat.count : ""}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Message list */}
          <div
            onClick={() => setFocusPane("list")}
            style={{ flex: 1, overflow: "auto", paddingLeft: "8px" }}
          >
            {threadsLoading && threads.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center" }}>
                <ZenSpinner /> <span style={{ color: "var(--zen-dim)", fontSize: "11px", marginLeft: "8px" }}>Loading messages...</span>
              </div>
            ) : threads.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "11px" }}>
                {categoryFilter ? "No messages in this category" : "Inbox zero"}
              </div>
            ) : (
              <>
                {threads.map((thread, i) => (
                  <MessageRow
                    key={thread.root_message.id}
                    thread={thread}
                    isAtCursor={focusPane === "list" && i === cursor}
                    isExpanded={expandedId === thread.root_message.id}
                    showReactionPicker={reactionPickerForId === thread.root_message.id}
                    isReplying={replyingToId === thread.root_message.id}
                    currentTutorId={tutorId}
                    ref={focusPane === "list" && i === cursor ? cursorRowRef : undefined}
                    onClick={() => { setFocusPane("list"); setCursor(i); }}
                    onDoubleClick={() => { setCursor(i); setExpandedId(thread.root_message.id); }}
                    onMarkRead={() => handleMarkRead(thread.root_message.id)}
                    onArchive={() => handleArchive(thread.root_message.id)}
                    onReact={(emoji) => handleReact(thread.root_message.id, emoji)}
                    onStartReply={() => setReplyingToId(thread.root_message.id)}
                    onReplySent={() => { setReplyingToId(null); refreshThreads(); }}
                    onCancelReply={() => setReplyingToId(null)}
                  />
                ))}
                {hasMore && (
                  <div
                    onClick={loadMore}
                    style={{ padding: "6px 4px", color: "var(--zen-dim)", fontSize: "10px", cursor: "pointer", textAlign: "center" }}
                  >
                    Load more...
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        /* Proposals tab */
        <div style={{ flex: 1, overflow: "auto" }}>
          {proposalsLoading ? (
            <div style={{ padding: "16px", textAlign: "center" }}>
              <ZenSpinner /> <span style={{ color: "var(--zen-dim)", fontSize: "11px", marginLeft: "8px" }}>Loading proposals...</span>
            </div>
          ) : proposals.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "11px" }}>
              No pending proposals
            </div>
          ) : (
            proposals.map((proposal, i) => (
              <ProposalRow
                key={proposal.id}
                proposal={proposal}
                isAtCursor={i === cursor}
                isExpanded={expandedId === proposal.id}
                ref={i === cursor ? cursorRowRef : undefined}
                onClick={() => setCursor(i)}
                onDoubleClick={() => { setCursor(i); setExpandedId(proposal.id); }}
              />
            ))
          )}
        </div>
      )}

      {/* Footer hints */}
      <div style={{
        borderTop: "1px solid var(--zen-border)",
        paddingTop: "4px",
        marginTop: "4px",
        fontSize: "10px",
        color: "var(--zen-dim)",
        flexShrink: 0,
      }}>
        <span style={{ color: "var(--zen-fg)" }}>j/k</span> navigate{" "}
        {activeTab === "messages" && <><span style={{ color: "var(--zen-fg)" }}>h/l</span> pane{" "}</>}
        <span style={{ color: "var(--zen-fg)" }}>Enter</span> expand{" "}
        <span style={{ color: "var(--zen-fg)" }}>Esc</span> collapse{" "}
        {activeTab === "messages" && (
          <>
            <span style={{ color: "var(--zen-fg)" }}>m</span>=read{" "}
            <span style={{ color: "var(--zen-fg)" }}>x</span>=archive{" "}
            <span style={{ color: "var(--zen-fg)" }}>r</span>=react{" "}
            <span style={{ color: "var(--zen-fg)" }}>c</span>=reply{" "}
          </>
        )}
        <span style={{ color: "var(--zen-fg)" }}>1/2</span> tabs
      </div>
    </div>
  );
}

// ── Message Row ──

import { forwardRef } from "react";

function getCategoryAbbr(category?: MessageCategory): string {
  if (!category) return "     ";
  return CATEGORY_ABBR[category] ?? category.slice(0, 5);
}

interface MessageRowProps {
  thread: MessageThread;
  isAtCursor: boolean;
  isExpanded: boolean;
  showReactionPicker: boolean;
  isReplying: boolean;
  currentTutorId: number | null;
  onClick: () => void;
  onDoubleClick: () => void;
  onMarkRead: () => void;
  onArchive: () => void;
  onReact: (emoji: string) => void;
  onStartReply: () => void;
  onReplySent: () => void;
  onCancelReply: () => void;
}

const MessageRow = forwardRef<HTMLDivElement, MessageRowProps>(function MessageRow(
  { thread, isAtCursor, isExpanded, showReactionPicker, isReplying, currentTutorId, onClick, onDoubleClick, onMarkRead, onArchive, onReact, onStartReply, onReplySent, onCancelReply },
  ref,
) {
  const msg = thread.root_message;
  const unread = !msg.is_read;
  const senderName = msg.from_tutor_name || "Unknown";
  const senderShort = senderName.length > 10 ? senderName.slice(0, 10) : senderName;
  const renderedBody = useMemo(() => renderMessage(msg.message), [msg.message]);

  return (
    <div ref={ref}>
      <div
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "3px 4px",
          fontSize: "11px",
          backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
          borderLeft: isAtCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
          cursor: "pointer",
        }}
      >
        {/* Cursor */}
        <span style={{ width: "10px", color: isAtCursor ? "var(--zen-accent)" : "transparent", flexShrink: 0 }}>
          {isAtCursor ? ">" : " "}
        </span>

        {/* Unread indicator */}
        <span style={{ width: "20px", color: unread ? "var(--zen-accent)" : "var(--zen-dim)", flexShrink: 0, fontSize: "10px" }}>
          {unread ? "[*]" : "[ ]"}
        </span>

        {/* Category */}
        <span style={{ width: "42px", color: "var(--zen-dim)", fontSize: "10px", flexShrink: 0 }}>
          {getCategoryAbbr(msg.category)}
        </span>

        {/* Subject / message preview */}
        <span style={{
          flex: 1,
          color: unread ? "var(--zen-fg)" : "var(--zen-dim)",
          fontWeight: unread ? "bold" : "normal",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {msg.subject || stripHtml(msg.message).slice(0, 60).replace(/\n/g, " ")}
        </span>

        {/* Reply count */}
        {msg.reply_count > 0 && (
          <span style={{ color: "var(--zen-dim)", fontSize: "10px", flexShrink: 0 }}>
            [{msg.reply_count}]
          </span>
        )}

        {/* Sender */}
        <span style={{ width: "80px", color: "var(--zen-dim)", fontSize: "10px", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {senderShort}
        </span>

        {/* Time */}
        <span style={{ width: "55px", color: "var(--zen-dim)", fontSize: "10px", textAlign: "right", flexShrink: 0 }}>
          {formatTimeAgo(msg.created_at)}
        </span>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{
          marginLeft: "36px",
          padding: "6px 8px",
          borderLeft: "1px solid var(--zen-border)",
          marginBottom: "4px",
        }}>
          {msg.subject && (
            <div style={{ color: "var(--zen-fg)", fontSize: "11px", fontWeight: "bold", marginBottom: "4px" }}>
              {msg.subject}
            </div>
          )}
          <div
            style={{ color: "var(--zen-fg)", fontSize: "11px", lineHeight: "1.4" }}
            dangerouslySetInnerHTML={{ __html: renderedBody }}
          />
          <Attachments msg={msg} />
          {/* Reactions */}
          {msg.like_count > 0 && (
            <div style={{ marginTop: "4px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(() => {
                const groups = new Map<string, { count: number; isMine: boolean }>();
                for (const d of msg.like_details || []) {
                  const g = groups.get(d.emoji) || { count: 0, isMine: false };
                  g.count++;
                  if (d.tutor_id === currentTutorId) g.isMine = true;
                  groups.set(d.emoji, g);
                }
                return Array.from(groups.entries()).map(([emoji, { count, isMine }]) => (
                  <span
                    key={emoji}
                    onClick={(e) => { e.stopPropagation(); onReact(emoji); }}
                    style={{
                      color: isMine ? "var(--zen-accent)" : "var(--zen-dim)",
                      cursor: "pointer",
                      border: isMine ? "1px solid var(--zen-accent)" : "1px solid var(--zen-border)",
                      padding: "0 4px",
                      fontSize: "11px",
                    }}
                  >
                    {emoji}×{count}
                  </span>
                ));
              })()}
            </div>
          )}
          {/* Reaction picker */}
          {showReactionPicker && (
            <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--zen-dim)" }}>
              React:{" "}
              {REACTION_EMOJIS.map((emoji, i) => (
                <span
                  key={emoji}
                  onClick={(e) => { e.stopPropagation(); onReact(emoji); }}
                  style={{ cursor: "pointer", marginRight: "6px" }}
                >
                  <span style={{ color: "var(--zen-fg)" }}>[{i + 1}]</span>{emoji}
                </span>
              ))}
              <span style={{ color: "var(--zen-fg)" }}>Esc</span>=cancel
            </div>
          )}
          {msg.priority !== "Normal" && (
            <div style={{ color: msg.priority === "Urgent" ? "var(--zen-error)" : "var(--zen-warning)", fontSize: "10px", marginTop: "4px" }}>
              Priority: {msg.priority}
            </div>
          )}

          {/* Replies */}
          {thread.replies.length > 0 && (
            <div style={{ marginTop: "8px", borderTop: "1px solid var(--zen-border)", paddingTop: "4px" }}>
              <div style={{ color: "var(--zen-dim)", fontSize: "10px", marginBottom: "4px" }}>
                {thread.replies.length} {thread.replies.length === 1 ? "reply" : "replies"}
              </div>
              {thread.replies.map(reply => (
                <div key={reply.id} style={{ marginBottom: "6px", paddingLeft: "8px", borderLeft: "1px solid var(--zen-border)" }}>
                  <div style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
                    {reply.from_tutor_name} · {formatTimeAgo(reply.created_at)}
                  </div>
                  <div
                    style={{ color: "var(--zen-fg)", fontSize: "11px" }}
                    dangerouslySetInnerHTML={{ __html: renderMessage(reply.message) }}
                  />
                  <Attachments msg={reply} />
                </div>
              ))}
            </div>
          )}

          {/* Reply composer */}
          {isReplying && currentTutorId && (
            <ZenReplyComposer
              threadRootMessage={msg}
              tutorId={currentTutorId}
              onSent={onReplySent}
              onCancel={onCancelReply}
            />
          )}

          {/* Action hints */}
          {!isReplying && (
            <div style={{ color: "var(--zen-dim)", fontSize: "10px", marginTop: "6px", borderTop: "1px solid var(--zen-border)", paddingTop: "4px" }}>
              <span onClick={onMarkRead} style={{ cursor: "pointer" }}>
                <span style={{ color: "var(--zen-fg)" }}>m</span>=mark-read
              </span>
              {"  "}
              <span onClick={onArchive} style={{ cursor: "pointer" }}>
                <span style={{ color: "var(--zen-fg)" }}>x</span>=archive
              </span>
              {"  "}
              <span style={{ color: "var(--zen-fg)" }}>r</span>=react
              {"  "}
              <span onClick={onStartReply} style={{ cursor: "pointer" }}>
                <span style={{ color: "var(--zen-fg)" }}>c</span>=reply
              </span>
              {"  "}
              <span style={{ color: "var(--zen-fg)" }}>Esc</span>=close
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── Reply Composer ──

interface ZenReplyComposerProps {
  threadRootMessage: Message;
  tutorId: number;
  onSent: () => void;
  onCancel: () => void;
}

function ZenReplyComposer({ threadRootMessage, tutorId, onSent, onCancel }: ZenReplyComposerProps) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [files, setFiles] = useState<{ url: string; filename: string; content_type: string }[]>([]);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { uploadFiles, isUploading, fileInputRef } = useFileUpload({
    tutorId,
    acceptFiles: true,
    onError: () => setZenStatus("Upload failed", "error"),
  });

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0 && files.length === 0) return;

    setSending(true);
    try {
      const recipients = computeReplyRecipients(threadRootMessage, tutorId);
      await messagesAPI.create({
        ...recipients,
        reply_to_id: threadRootMessage.id,
        message: `<p>${trimmed.replace(/\n/g, "<br>")}</p>`,
        image_attachments: images.length > 0 ? images : undefined,
        file_attachments: files.length > 0 ? files : undefined,
      }, tutorId);
      setZenStatus("Reply sent", "success");
      mutate((key: unknown) => Array.isArray(key) && (key[0] === "message-threads-paginated" || key[0] === "unread-count" || key[0] === "unread-category-counts"), undefined, { revalidate: true });
      onSent();
    } catch {
      setZenStatus("Failed to send reply", "error");
    } finally {
      setSending(false);
    }
  }, [text, images, files, threadRootMessage, tutorId, onSent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter to send
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
      return;
    }
    // Escape to cancel
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
  }, [handleSend, onCancel]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipFiles = e.clipboardData?.files;
    if (clipFiles && clipFiles.length > 0) {
      e.preventDefault();
      uploadFiles(clipFiles, {
        onImage: (url) => setImages(prev => [...prev, url]),
        onFile: (f) => setFiles(prev => [...prev, f]),
      });
    }
  }, [uploadFiles]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    uploadFiles(e.target.files, {
      onImage: (url) => setImages(prev => [...prev, url]),
      onFile: (f) => setFiles(prev => [...prev, f]),
    });
  }, [uploadFiles]);

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));
  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  return (
    <div style={{ marginTop: "8px", borderTop: "1px solid var(--zen-border)", paddingTop: "6px" }}>
      <div style={{ color: "var(--zen-dim)", fontSize: "10px", marginBottom: "4px" }}>
        ── Reply ──
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="Type your reply..."
        rows={3}
        style={{
          width: "100%",
          backgroundColor: "var(--zen-bg)",
          color: "var(--zen-fg)",
          border: "1px solid var(--zen-border)",
          fontFamily: "inherit",
          fontSize: "11px",
          padding: "6px 8px",
          resize: "vertical",
          outline: "none",
          lineHeight: "1.4",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--zen-accent)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--zen-border)"; }}
      />

      {/* Uploaded files */}
      {(images.length > 0 || files.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
          {images.map((url, i) => (
            <span
              key={url}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 6px",
                border: "1px solid var(--zen-border)",
                fontSize: "10px",
                color: "var(--zen-fg)",
              }}
            >
              [IMG] {url.split("/").pop()?.slice(0, 20)}
              <span onClick={() => removeImage(i)} style={{ cursor: "pointer", color: "var(--zen-error)" }}>×</span>
            </span>
          ))}
          {files.map((f, i) => (
            <span
              key={f.url}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 6px",
                border: "1px solid var(--zen-border)",
                fontSize: "10px",
                color: "var(--zen-fg)",
              }}
            >
              [{f.content_type?.split("/").pop()?.toUpperCase() || "FILE"}] {f.filename.slice(0, 20)}
              <span onClick={() => removeFile(i)} style={{ cursor: "pointer", color: "var(--zen-error)" }}>×</span>
            </span>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {/* Action bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", fontSize: "10px", color: "var(--zen-dim)" }}>
        <span style={{ color: "var(--zen-fg)" }}>Ctrl+Enter</span>=send
        {"  "}
        <span
          onClick={() => fileInputRef.current?.click()}
          style={{ cursor: "pointer" }}
        >
          <span style={{ color: "var(--zen-fg)" }}>attach</span>
        </span>
        {"  "}
        <span style={{ color: "var(--zen-fg)" }}>Esc</span>=cancel
        {isUploading && <span style={{ color: "var(--zen-accent)" }}>uploading...</span>}
        {sending && <span style={{ color: "var(--zen-accent)" }}>sending...</span>}
      </div>
    </div>
  );
}

// ── Proposal Row ──

interface ProposalRowProps {
  proposal: MakeupProposal;
  isAtCursor: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

const ProposalRow = forwardRef<HTMLDivElement, ProposalRowProps>(function ProposalRow(
  { proposal, isAtCursor, isExpanded, onClick, onDoubleClick },
  ref,
) {
  const session = proposal.original_session;
  const studentName = session?.student_name || "Unknown";
  const sessionInfo = session
    ? `${session.session_date} ${session.time_slot || ""}`
    : `Session #${proposal.original_session_id}`;

  return (
    <div ref={ref}>
      <div
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "3px 4px",
          fontSize: "11px",
          backgroundColor: isAtCursor ? "var(--zen-selection)" : "transparent",
          borderLeft: isAtCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
          cursor: "pointer",
        }}
      >
        <span style={{ width: "10px", color: isAtCursor ? "var(--zen-accent)" : "transparent", flexShrink: 0 }}>
          {isAtCursor ? ">" : " "}
        </span>
        <span style={{ width: "40px", color: "var(--zen-dim)", fontSize: "10px", flexShrink: 0 }}>
          #{proposal.id}
        </span>
        <span style={{ flex: 1, color: "var(--zen-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {studentName}
        </span>
        <span style={{ color: "var(--zen-dim)", fontSize: "10px", flexShrink: 0 }}>
          {sessionInfo}
        </span>
        <span style={{ width: "80px", color: "var(--zen-dim)", fontSize: "10px", textAlign: "right", flexShrink: 0 }}>
          {proposal.proposed_by_tutor_name || ""}
        </span>
        <span style={{ width: "55px", color: "var(--zen-warning)", fontSize: "10px", textAlign: "right", flexShrink: 0 }}>
          {proposal.status}
        </span>
        <span style={{ width: "55px", color: "var(--zen-dim)", fontSize: "10px", textAlign: "right", flexShrink: 0 }}>
          {formatTimeAgo(proposal.created_at)}
        </span>
      </div>

      {isExpanded && (
        <div style={{
          marginLeft: "36px",
          padding: "6px 8px",
          borderLeft: "1px solid var(--zen-border)",
          marginBottom: "4px",
        }}>
          <div style={{ color: "var(--zen-fg)", fontSize: "11px", marginBottom: "4px" }}>
            <span style={{ color: "var(--zen-dim)" }}>Student:</span> {studentName}
          </div>
          <div style={{ color: "var(--zen-fg)", fontSize: "11px", marginBottom: "4px" }}>
            <span style={{ color: "var(--zen-dim)" }}>Original Session:</span> {sessionInfo}
          </div>
          <div style={{ color: "var(--zen-fg)", fontSize: "11px", marginBottom: "4px" }}>
            <span style={{ color: "var(--zen-dim)" }}>Type:</span> {proposal.proposal_type === "specific_slots" ? "Specific Slots" : "Needs Input"}
          </div>
          {proposal.proposed_by_tutor_name && (
            <div style={{ color: "var(--zen-fg)", fontSize: "11px", marginBottom: "4px" }}>
              <span style={{ color: "var(--zen-dim)" }}>Proposed by:</span> {proposal.proposed_by_tutor_name}
            </div>
          )}
          {proposal.notes && (
            <div style={{ color: "var(--zen-fg)", fontSize: "11px", marginBottom: "4px" }}>
              <span style={{ color: "var(--zen-dim)" }}>Notes:</span> {proposal.notes}
            </div>
          )}

          {/* Slots */}
          {proposal.slots.length > 0 && (
            <div style={{ marginTop: "4px" }}>
              <div style={{ color: "var(--zen-dim)", fontSize: "10px", marginBottom: "2px" }}>
                Proposed Slots:
              </div>
              {proposal.slots.map((slot, i) => (
                <div key={slot.id} style={{ paddingLeft: "8px", fontSize: "11px", color: "var(--zen-fg)", marginBottom: "2px" }}>
                  {i + 1}. {slot.proposed_date} {slot.proposed_time_slot} @ {slot.proposed_location}
                  {slot.proposed_tutor_name && <span style={{ color: "var(--zen-dim)" }}> ({slot.proposed_tutor_name})</span>}
                  <span style={{
                    color: slot.slot_status === "approved" ? "var(--zen-success)" : slot.slot_status === "rejected" ? "var(--zen-error)" : "var(--zen-warning)",
                    marginLeft: "6px",
                    fontSize: "10px",
                  }}>
                    [{slot.slot_status}]
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
