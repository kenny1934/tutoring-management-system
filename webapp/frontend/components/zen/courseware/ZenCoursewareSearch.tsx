"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { paperlessAPI, type PaperlessDocument, type PaperlessTag } from "@/lib/api";
import { getDocumentPath } from "@/lib/courseware-utils";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import type { PreviewFile } from "./ZenCoursewarePreview";

type SearchMode = "all" | "title" | "content" | "advanced";

interface ZenCoursewareSearchProps {
  isActive: boolean;
  onSelectFile: (file: PreviewFile) => void;
  onAssignFile: (path: string, title: string) => void;
}

export function ZenCoursewareSearch({
  isActive,
  onSelectFile,
  onAssignFile,
}: ZenCoursewareSearchProps) {
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("all");
  const [results, setResults] = useState<PaperlessDocument[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Tags
  const [tags, setTags] = useState<PaperlessTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch tags on mount
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await paperlessAPI.getTags();
        setTags(response.tags || []);
      } catch { /* ignore */ }
    };
    fetchTags();
  }, []);

  // Auto-scroll cursor
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursor]);

  // Build search query
  const buildSearchQuery = useCallback(
    (q: string) => {
      let searchQuery = q;
      if (searchMode === "title") searchQuery = `title:${q}`;
      else if (searchMode === "content") searchQuery = `content:${q}`;

      if (searchMode !== "advanced" && selectedTagIds.length > 0) {
        const tagQueries = selectedTagIds.map((id) => `tag:${id}`);
        searchQuery = `${searchQuery} ${tagQueries.join(" ")}`;
      }
      return searchQuery;
    },
    [searchMode, selectedTagIds]
  );

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setCursor(0);
      setHasMore(false);
      setSearchOffset(0);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const searchQuery = buildSearchQuery(query);
        const response = await paperlessAPI.search(searchQuery, 30);
        setResults(response.results);
        setHasMore(response.has_more);
        setSearchOffset(30);
        setCursor(0);
      } catch {
        setResults([]);
        setZenStatus("Search failed", "error");
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, buildSearchQuery]);

  // Load more
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || !query.trim()) return;
    setIsLoadingMore(true);
    try {
      const searchQuery = buildSearchQuery(query);
      const response = await paperlessAPI.search(searchQuery, 30, "all", undefined, "all", searchOffset);
      setResults((prev) => [...prev, ...response.results]);
      setHasMore(response.has_more);
      setSearchOffset((prev) => prev + 30);
    } catch {
      setZenStatus("Failed to load more", "error");
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, query, buildSearchQuery, searchOffset]);

  // Keyboard handler
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInInput = target === searchInputRef.current;

      // / to focus search
      if (e.key === "/" && !isInInput) {
        e.preventDefault();
        e.stopImmediatePropagation();
        searchInputRef.current?.focus();
        return;
      }

      // Escape to blur search input
      if (e.key === "Escape" && isInInput) {
        e.preventDefault();
        e.stopImmediatePropagation();
        searchInputRef.current?.blur();
        return;
      }

      // Skip list navigation when in input
      if (isInInput) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          e.stopImmediatePropagation();
          const doc = results[cursor];
          if (doc) {
            onSelectFile({
              documentId: doc.id,
              path: doc.original_path || doc.converted_path || "",
              title: doc.title,
            });
          }
          break;
        }
        case "a": {
          e.preventDefault();
          e.stopImmediatePropagation();
          const doc = results[cursor];
          if (doc) {
            const path = getDocumentPath(doc);
            onAssignFile(path, doc.title);
          }
          break;
        }
        case "l":
          if (hasMore) {
            e.preventDefault();
            e.stopImmediatePropagation();
            loadMore();
          }
          break;
        case "g":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor(0);
          break;
        case "G":
          e.preventDefault();
          e.stopImmediatePropagation();
          setCursor(Math.max(0, results.length - 1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isActive, results, cursor, hasMore, loadMore, onSelectFile, onAssignFile]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Search bar */}
      <div
        style={{
          padding: "6px 8px",
          borderBottom: "1px solid var(--zen-border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "11px",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "var(--zen-accent)", fontWeight: "bold" }}>SEARCH</span>
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          placeholder="Type to search... (/ to focus)"
          style={{
            flex: 1,
            backgroundColor: "var(--zen-bg)",
            border: `1px solid ${isInputFocused ? "var(--zen-accent)" : "var(--zen-border)"}`,
            color: "var(--zen-fg)",
            padding: "2px 6px",
            fontFamily: "inherit",
            fontSize: "11px",
            outline: "none",
          }}
        />
        {isSearching && (
          <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>searching...</span>
        )}
      </div>

      {/* Mode toggles */}
      <div
        style={{
          padding: "4px 8px",
          borderBottom: "1px solid var(--zen-border)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "10px",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "var(--zen-dim)" }}>Mode:</span>
        {(["all", "title", "content", "advanced"] as SearchMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setSearchMode(mode)}
            style={{
              padding: "1px 6px",
              backgroundColor: searchMode === mode ? "var(--zen-accent)" : "transparent",
              color: searchMode === mode ? "var(--zen-bg)" : "var(--zen-fg)",
              border: "1px solid var(--zen-border)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "10px",
              textTransform: "capitalize",
            }}
          >
            {mode === "all" ? "All" : mode === "title" ? "Title" : mode === "content" ? "Content" : "Adv"}
          </button>
        ))}

        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--zen-dim)" }}>
          {results.length} result{results.length !== 1 ? "s" : ""}
          {hasMore && " (more available)"}
        </span>
      </div>

      {/* Results list */}
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {!query.trim() && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            Type a search query to find courseware
          </div>
        )}

        {query.trim() && !isSearching && results.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--zen-dim)", fontSize: "12px" }}>
            No results found
          </div>
        )}

        {results.map((doc, index) => {
          const isSelected = index === cursor;
          const path = getDocumentPath(doc);

          return (
            <div
              key={doc.id}
              data-selected={isSelected}
              onClick={() => {
                setCursor(index);
                onSelectFile({
                  documentId: doc.id,
                  path: doc.original_path || doc.converted_path || "",
                  title: doc.title,
                });
              }}
              style={{
                display: "flex",
                padding: "3px 8px",
                fontSize: "11px",
                gap: "8px",
                cursor: "pointer",
                backgroundColor: isSelected ? "var(--zen-accent)" : "transparent",
                color: isSelected ? "var(--zen-bg)" : "var(--zen-fg)",
                borderLeft: isSelected ? "2px solid var(--zen-accent)" : "2px solid transparent",
              }}
            >
              <span style={{ width: "24px", textAlign: "right", color: isSelected ? "var(--zen-bg)" : "var(--zen-dim)" }}>
                {index + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={path}
              >
                {doc.title}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  color: isSelected ? "var(--zen-bg)" : "var(--zen-dim)",
                  maxWidth: "120px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {path.split("\\").slice(-2, -1)[0] || ""}
              </span>
            </div>
          );
        })}

        {/* Load more */}
        {hasMore && (
          <div
            style={{
              padding: "6px 8px",
              textAlign: "center",
              fontSize: "11px",
            }}
          >
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              style={{
                padding: "2px 12px",
                backgroundColor: "transparent",
                border: "1px solid var(--zen-border)",
                color: "var(--zen-accent)",
                cursor: isLoadingMore ? "wait" : "pointer",
                fontFamily: "inherit",
                fontSize: "11px",
              }}
            >
              {isLoadingMore ? "Loading..." : "[l]oad more"}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "4px 8px",
          borderTop: "1px solid var(--zen-border)",
          fontSize: "10px",
          color: "var(--zen-dim)",
          flexShrink: 0,
        }}
      >
        / search • j/k nav • Enter preview • [a]ssign • [l]oad more • Esc blur
      </div>
    </div>
  );
}
