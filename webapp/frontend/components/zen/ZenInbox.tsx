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
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { ZenSpinner } from "@/components/zen/ZenSpinner";
import "katex/dist/katex.min.css";
import type { MessageThread, MessageCategory, MakeupProposal } from "@/types";

function renderMessage(html: string): string {
  return highlightCodeBlocks(renderGeometryInHtml(renderMathInHtml(html)));
}

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
  const cursorRowRef = useRef<HTMLDivElement>(null);
  const gPressedRef = useRef(false);

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

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable) return;

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
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, focusPane, cursor, expandedId, categoryFilter, categoryList, currentList.length, threads, proposals, hasMore, loadMore, handleMarkRead, handleArchive]);

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
                    ref={focusPane === "list" && i === cursor ? cursorRowRef : undefined}
                    onClick={() => { setFocusPane("list"); setCursor(i); }}
                    onDoubleClick={() => { setCursor(i); setExpandedId(thread.root_message.id); }}
                    onMarkRead={() => handleMarkRead(thread.root_message.id)}
                    onArchive={() => handleArchive(thread.root_message.id)}
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
  onClick: () => void;
  onDoubleClick: () => void;
  onMarkRead: () => void;
  onArchive: () => void;
}

const MessageRow = forwardRef<HTMLDivElement, MessageRowProps>(function MessageRow(
  { thread, isAtCursor, isExpanded, onClick, onDoubleClick, onMarkRead, onArchive },
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
                </div>
              ))}
            </div>
          )}

          {/* Action hints */}
          <div style={{ color: "var(--zen-dim)", fontSize: "10px", marginTop: "6px", borderTop: "1px solid var(--zen-border)", paddingTop: "4px" }}>
            <span onClick={onMarkRead} style={{ cursor: "pointer" }}>
              <span style={{ color: "var(--zen-fg)" }}>m</span>=mark-read
            </span>
            {"  "}
            <span onClick={onArchive} style={{ cursor: "pointer" }}>
              <span style={{ color: "var(--zen-fg)" }}>x</span>=archive
            </span>
            {"  "}
            <span style={{ color: "var(--zen-fg)" }}>Esc</span>=close
          </div>
        </div>
      )}
    </div>
  );
});

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
