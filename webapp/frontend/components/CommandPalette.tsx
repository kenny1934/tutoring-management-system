"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Search,
  User,
  Calendar,
  BookOpen,
  Home,
  BarChart3,
  X,
  Command,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Clock,
  Zap,
  CalendarDays,
  RefreshCw,
  Grid3x3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, SearchResults } from "@/lib/api";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { SearchNoResults } from "@/components/illustrations/EmptyStates";

// localStorage key for recent searches
const RECENT_SEARCHES_KEY = "command-palette-recent-searches";
const MAX_RECENT_SEARCHES = 5;

// Quick navigation pages
const PAGES = [
  { id: "page-dashboard", title: "Dashboard", href: "/", icon: Home },
  { id: "page-students", title: "Students", href: "/students", icon: User },
  { id: "page-sessions", title: "Sessions", href: "/sessions", icon: Calendar },
  { id: "page-reports", title: "Reports", href: "/reports", icon: BarChart3 },
];

// Quick actions (session-focused)
const QUICK_ACTIONS = [
  { id: "action-today", title: "Today's Sessions", href: "/sessions", icon: Calendar },
  { id: "action-week", title: "This Week's Sessions", href: "/sessions?view=week", icon: Grid3x3 },
  { id: "action-makeups", title: "Pending Make-ups", href: "/sessions?filter=makeup", icon: RefreshCw },
];

// Type badge colors
const typeBadgeColors: Record<string, string> = {
  student: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  session: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  enrollment: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  page: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

// Parse query for type filters
function parseQuery(q: string): { type: string | null; term: string } {
  // @john or s:john → students
  const studentMatch = q.match(/^[@](.+)/i) || q.match(/^s:(.+)/i);
  if (studentMatch) return { type: "student", term: studentMatch[1] };

  // #session or sess:term → sessions
  const sessionMatch = q.match(/^[#](.+)/i) || q.match(/^sess:(.+)/i);
  if (sessionMatch) return { type: "session", term: sessionMatch[1] };

  // /page or p:page → pages
  const pageMatch = q.match(/^[\/](.+)/i) || q.match(/^p:(.+)/i);
  if (pageMatch) return { type: "page", term: pageMatch[1] };

  return { type: null, term: q };
}

// Result item type for unified list
interface ResultItem {
  id: string;
  type: "student" | "session" | "enrollment" | "page" | "recent";
  title: string;
  subtitle?: string;
  href: string;
  icon: typeof User;
}

// Highlight matching text in search results
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-[#d4a574]/30 dark:bg-[#cd853f]/30 text-inherit rounded px-0.5">
        {part}
      </mark>
    ) : part
  );
}

export function CommandPalette() {
  const router = useRouter();
  const { isOpen, close } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Handle mounting for portal and load recent searches
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save a search to recent searches
  const saveRecentSearch = useCallback((searchQuery: string) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== searchQuery.toLowerCase());
      const updated = [searchQuery, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {
        // Ignore localStorage errors
      }
      return updated;
    });
  }, []);

  // Clear a single recent search
  const clearRecentSearch = useCallback((searchToRemove: string) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => s !== searchToRemove);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {
        // Ignore localStorage errors
      }
      return updated;
    });
  }, []);

  // Clear all recent searches
  const clearAllRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Parse query for type filters
  const { type: filterType, term: searchTerm } = useMemo(() => parseQuery(query), [query]);

  // Debounced search
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setResults(null);
      setSelectedIndex(0);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.stats.search(searchTerm);
        setResults(data);
        setSelectedIndex(0);
        // Save to recent if we got results (save original query with filter prefix)
        const hasResults = data.students.length > 0 || data.sessions.length > 0 || data.enrollments.length > 0;
        if (hasResults) {
          saveRecentSearch(query);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, searchTerm, saveRecentSearch]);

  // Build flat list of all results for keyboard navigation
  const allItems = useMemo<ResultItem[]>(() => {
    const items: ResultItem[] = [];

    // When no query, show recent searches + quick actions + pages
    if (!query) {
      // Recent searches
      recentSearches.forEach((search) => {
        items.push({
          id: `recent-${search}`,
          type: "recent",
          title: search,
          href: "", // Will set query instead of navigating
          icon: Clock,
        });
      });

      // Quick actions
      QUICK_ACTIONS.forEach((action) => {
        items.push({
          id: action.id,
          type: "page", // Treat as page for navigation purposes
          title: action.title,
          href: action.href,
          icon: action.icon,
        });
      });

      // All pages
      PAGES.forEach((p) => {
        items.push({
          id: p.id,
          type: "page",
          title: p.title,
          href: p.href,
          icon: p.icon,
        });
      });

      return items;
    }

    // Add search results (filtered by type if prefix used)
    if (results) {
      // Students (only if no filter or filter is "student")
      if (!filterType || filterType === "student") {
        results.students.forEach((s) => {
          items.push({
            id: `student-${s.id}`,
            type: "student",
            title: s.student_name,
            subtitle: [s.school_student_id, s.school, s.grade].filter(Boolean).join(" · "),
            href: `/students/${s.id}`,
            icon: User,
          });
        });
      }

      // Sessions (only if no filter or filter is "session")
      if (!filterType || filterType === "session") {
        results.sessions.forEach((s) => {
          items.push({
            id: `session-${s.id}`,
            type: "session",
            title: s.student_name || "Unknown Student",
            subtitle: [
              s.session_date ? new Date(s.session_date).toLocaleDateString() : null,
              s.tutor_name,
              s.session_status,
            ]
              .filter(Boolean)
              .join(" · "),
            href: `/sessions?date=${s.session_date}`,
            icon: Calendar,
          });
        });
      }

      // Enrollments (only if no filter - enrollments don't have a prefix)
      if (!filterType) {
        results.enrollments.forEach((e) => {
          items.push({
            id: `enrollment-${e.id}`,
            type: "enrollment",
            title: e.student_name || "Unknown Student",
            subtitle: [e.tutor_name, e.location, e.payment_status].filter(Boolean).join(" · "),
            href: `/students/${e.student_id}`,
            icon: BookOpen,
          });
        });
      }
    }

    // Add matching pages (only if no filter or filter is "page")
    if (!filterType || filterType === "page") {
      const filteredPages = PAGES.filter(
        (p) => p.title.toLowerCase().includes(searchTerm.toLowerCase())
      );

      filteredPages.forEach((p) => {
        items.push({
          id: p.id,
          type: "page",
          title: p.title,
          href: p.href,
          icon: p.icon,
        });
      });
    }

    return items;
  }, [results, query, searchTerm, filterType, recentSearches]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, allItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (allItems[selectedIndex]) {
            const item = allItems[selectedIndex];
            if (item.type === "recent") {
              // Set query instead of navigating for recent searches
              setQuery(item.title);
            } else {
              router.push(item.href);
              close();
            }
          }
          break;
        case "Escape":
          e.preventDefault();
          if (query) {
            // First escape clears query
            setQuery("");
          } else {
            // Second escape closes palette
            close();
          }
          break;
      }
    },
    [allItems, selectedIndex, router, close, query]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      selectedElement?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Handle click outside
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        close();
      }
    },
    [close]
  );

  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div
      className={cn(
        "fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm",
        "flex items-start justify-center pt-[15vh]",
        "max-sm:pt-0 max-sm:items-stretch"
      )}
      onClick={handleBackdropClick}
    >
      <div
        className={cn(
          "w-[min(90vw,36rem)] bg-[#fef9f3] dark:bg-[#1a1a1a] rounded-xl shadow-2xl",
          "border border-[#e8d4b8] dark:border-[#3d3628]",
          "overflow-hidden flex flex-col",
          // Mobile full-screen mode
          "max-sm:w-full max-sm:h-full max-sm:rounded-none max-sm:border-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 max-sm:py-4 border-b border-[#e8d4b8] dark:border-[#3d3628]">
          <Search className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search... (@student, #session, /page)"
            className={cn(
              "flex-1 bg-transparent text-gray-900 dark:text-gray-100",
              "placeholder:text-gray-500 dark:placeholder:text-gray-400",
              "focus:outline-none text-base max-sm:text-lg"
            )}
          />
          {/* Clear input button */}
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] rounded transition-colors"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 max-sm:hidden">
            <kbd className="px-1.5 py-0.5 bg-[#f5ede3] dark:bg-[#2d2618] rounded border border-[#e8d4b8] dark:border-[#3d3628]">
              <Command className="h-3 w-3 inline" />K
            </kbd>
          </div>
          <button
            onClick={close}
            className="p-1 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] rounded transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] max-sm:max-h-none max-sm:flex-1 overflow-y-auto">
          {loading && (
            <div className="py-2">
              <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Searching...
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
                  <div className="h-4 w-4 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 bg-[#e8d4b8] dark:bg-[#3d3628] rounded w-3/4" />
                    <div className="h-3 bg-[#e8d4b8] dark:bg-[#3d3628] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Enhanced empty state with illustration */}
          {!loading && allItems.length === 0 && searchTerm.length >= 2 && (
            <div className="flex flex-col items-center px-4 py-6 text-center">
              <SearchNoResults className="mb-2 opacity-90" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                No results for &quot;{query}&quot;
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Try a different search or use @student, #session
              </p>
            </div>
          )}

          {!loading && allItems.length > 0 && query && (
            <div className="py-2">
              {/* Group by type */}
              {["student", "session", "enrollment", "page"].map((type) => {
                const typeItems = allItems.filter((item) => item.type === type);
                if (typeItems.length === 0) return null;

                const typeLabels: Record<string, string> = {
                  student: "Students",
                  session: "Sessions",
                  enrollment: "Enrollments",
                  page: "Pages",
                };

                return (
                  <div key={type}>
                    <div className="px-4 py-1.5 flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                        typeBadgeColors[type]
                      )}>
                        {typeLabels[type]}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {typeItems.length}
                      </span>
                    </div>
                    {typeItems.map((item) => {
                      const Icon = item.icon;
                      const index = allItems.indexOf(item);
                      const isSelected = index === selectedIndex;

                      return (
                        <button
                          key={item.id}
                          data-index={index}
                          onClick={() => {
                            router.push(item.href);
                            close();
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 max-sm:py-3 text-left transition-colors",
                            isSelected
                              ? "bg-[#d4a574]/20 dark:bg-[#cd853f]/20"
                              : "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 flex-shrink-0",
                              isSelected
                                ? "text-[#a0704b] dark:text-[#cd853f]"
                                : "text-gray-400 dark:text-gray-500"
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {highlightMatch(item.title, searchTerm)}
                            </div>
                            {item.subtitle && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {highlightMatch(item.subtitle, searchTerm)}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <CornerDownLeft className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state with recent searches and pages when no query */}
          {!loading && !query && (
            <div className="py-2">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <>
                  <div className="px-4 py-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Recent
                    </span>
                    <button
                      onClick={clearAllRecentSearches}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  {recentSearches.map((search, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <div
                        key={`recent-${search}`}
                        className={cn(
                          "group flex items-center gap-3 px-4 py-2.5 max-sm:py-3 transition-colors",
                          isSelected
                            ? "bg-[#d4a574]/20 dark:bg-[#cd853f]/20"
                            : "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                        )}
                      >
                        <button
                          data-index={index}
                          onClick={() => setQuery(search)}
                          className="flex-1 flex items-center gap-3 text-left"
                        >
                          <Clock
                            className={cn(
                              "h-4 w-4 flex-shrink-0",
                              isSelected
                                ? "text-[#a0704b] dark:text-[#cd853f]"
                                : "text-gray-400 dark:text-gray-500"
                            )}
                          />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {search}
                          </span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            clearRecentSearch(search);
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#e8d4b8] dark:hover:bg-[#3d3628] rounded transition-all"
                        >
                          <X className="h-3 w-3 text-gray-400" />
                        </button>
                        {isSelected && (
                          <CornerDownLeft className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Quick Actions */}
              <div className="px-4 py-1.5 flex items-center gap-2">
                <Zap className="h-3 w-3 text-amber-500" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Quick Actions
                </span>
              </div>
              {QUICK_ACTIONS.map((action, idx) => {
                const Icon = action.icon;
                const index = recentSearches.length + idx;
                const isSelected = index === selectedIndex;

                return (
                  <button
                    key={action.id}
                    data-index={index}
                    onClick={() => {
                      router.push(action.href);
                      close();
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 max-sm:py-3 text-left transition-colors",
                      isSelected
                        ? "bg-[#d4a574]/20 dark:bg-[#cd853f]/20"
                        : "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        isSelected
                          ? "text-[#a0704b] dark:text-[#cd853f]"
                          : "text-gray-400 dark:text-gray-500"
                      )}
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {action.title}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="h-4 w-4 text-gray-400 dark:text-gray-500 ml-auto" />
                    )}
                  </button>
                );
              })}

              {/* Quick Navigation */}
              <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Pages
              </div>
              {PAGES.map((page, idx) => {
                const Icon = page.icon;
                const index = recentSearches.length + QUICK_ACTIONS.length + idx;
                const isSelected = index === selectedIndex;

                return (
                  <button
                    key={page.id}
                    data-index={index}
                    onClick={() => {
                      router.push(page.href);
                      close();
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 max-sm:py-3 text-left transition-colors",
                      isSelected
                        ? "bg-[#d4a574]/20 dark:bg-[#cd853f]/20"
                        : "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        isSelected
                          ? "text-[#a0704b] dark:text-[#cd853f]"
                          : "text-gray-400 dark:text-gray-500"
                      )}
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {page.title}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="h-4 w-4 text-gray-400 dark:text-gray-500 ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hints - hidden on mobile */}
        <div className="px-4 py-2 border-t border-[#e8d4b8] dark:border-[#3d3628] bg-[#f5ede3]/50 dark:bg-[#2d2618]/50 max-sm:hidden">
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <ArrowUp className="h-3 w-3" />
              <ArrowDown className="h-3 w-3" />
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" />
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white dark:bg-[#1a1a1a] rounded border border-[#e8d4b8] dark:border-[#3d3628] text-[10px]">
                Esc
              </kbd>
              {query ? "Clear" : "Close"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
