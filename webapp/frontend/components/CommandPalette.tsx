"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { AnimatePresence, useReducedMotion } from "framer-motion";
import { SearchSurface } from "./commandPalette/SearchSurface";
import styles from "./commandPalette/SearchSurface.module.css";
import { createMaterialWorkspace } from "./commandPalette/material-workspace";
import { MaterialSearch } from "./commandPalette/MaterialSearch";
import { SearchFilterControls } from "./commandPalette/SearchFilters";
import { defaultSearchFilters, hasSearchConstraint, readCalendarWords, requestFilters, searchDate, type SearchCategory, type SearchFilters } from "./commandPalette/search-filters";
import { usePaletteSearch } from "./commandPalette/usePaletteSearch";
import { useSearchReturn, type SearchPlace } from "./commandPalette/useSearchReturn";
import { restoreScroll } from "@/components/material/materialJourney";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import Fuse from "fuse.js";
import useSWR, { useSWRConfig } from "swr";
import { SearchRecordDetail, type SearchRecord } from "./commandPalette/SearchRecordDetail";
import { sessionLabel, enrollmentLabel } from "./commandPalette/search-result-labels";
import { createPortal } from "react-dom";
import { useBackToClose } from "@/hooks/useBackToClose";
import {
  Search,
  User,
  Calendar,
  BookOpen,
  X,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Clock,
  Zap,
  RefreshCw,
  Grid3x3,
  DollarSign,
  Star,
  AlertCircle,
  UserX,
  Shield,
  Sun,
  Moon,
  Building2,
  Eye,
  Sparkles,
  Calculator,
  MapPin,
  Filter,
  CheckCircle,
  ChevronRight,
  HelpCircle,
  MessageSquarePlus,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { studentsAPI, sessionsAPI, enrollmentsAPI } from "@/lib/api";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { useLocation } from "@/contexts/LocationContext";
import { useToast } from "@/contexts/ToastContext";
import { SearchNoResults } from "@/components/illustrations/EmptyStates";

// Import extracted modules
import {
  PAGES,
  ADMIN_PAGES,
  SUPER_ADMIN_PAGES,
  QUICK_ACTIONS,
  HELP_TOPICS,
  ResultItem,
  NestedCommand,
} from "./commandPalette/types";
import { parseQuery, evaluateMath } from "./commandPalette/utils";
import { useRecentSearches } from "./commandPalette/hooks";
import { ResultItemButton } from "./commandPalette/ResultItem";
import { PreviewSkeleton, HelpPreview, PreviewContent } from "./commandPalette/PreviewPanel";
import { useHaptic } from "@/lib/useHaptic";

export function CommandPalette() {
  const router = useRouter();
  const { isOpen, close, open, origin } = useCommandPalette();
  const reduced = useReducedMotion();
  const navigateRef = useRef<(href: string) => void>(() => {});
  const navigate = useCallback((href: string) => navigateRef.current(href), []);
  // On a phone, back closes the search before it leaves the page.
  useBackToClose(isOpen, close);
  const { isAdmin, isSuperAdmin, user, effectiveRole, isImpersonating, impersonatedTutor, isReadOnly } = useAuth();
  const scope = `${user?.id}:${effectiveRole}:${isImpersonating ? impersonatedTutor?.id : ""}`;
  const { theme, setTheme } = useTheme();
  const { viewMode, setViewMode } = useRole();
  const { selectedLocation, setSelectedLocation, locations } = useLocation();
  const materialWorkspace = useMemo(createMaterialWorkspace, [scope, selectedLocation]);
  const { showToast } = useToast();
  const haptic = useHaptic();

  // State for nested command navigation
  const [commandPath, setCommandPath] = useState<string[]>([]);

  // Build complete pages list based on user role
  const allPages = useMemo(() => {
    const pages = [...PAGES];
    if (isAdmin) {
      pages.push(...ADMIN_PAGES);
    }
    if (isSuperAdmin) {
      pages.push(...SUPER_ADMIN_PAGES);
    }
    return pages;
  }, [isAdmin, isSuperAdmin]);

  // Action commands (dynamic based on current theme/view state)
  const actionCommands = useMemo<ResultItem[]>(() => [
    {
      id: "action-theme",
      type: "action",
      title: theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode",
      icon: theme === 'dark' ? Sun : Moon,
      execute: () => { setTheme(theme === 'dark' ? 'light' : 'dark'); close(); },
    },
    {
      id: "action-view-center",
      type: "action",
      title: "Switch to Center View",
      subtitle: viewMode === 'center-view' ? "Currently active" : undefined,
      icon: Building2,
      execute: () => { setViewMode('center-view'); close(); },
    },
    {
      id: "action-view-my",
      type: "action",
      title: "Switch to My View",
      subtitle: viewMode === 'my-view' ? "Currently active" : undefined,
      icon: Eye,
      execute: () => { setViewMode('my-view'); close(); },
    },
    {
      id: "action-feedback",
      type: "action",
      title: "Send Feedback",
      icon: MessageSquarePlus,
      execute: () => { close(); window.dispatchEvent(new CustomEvent("open-feedback")); },
    },
  ], [theme, setTheme, viewMode, setViewMode, close]);

  // Nested commands with submenus
  const nestedCommands = useMemo<NestedCommand[]>(() => {
    const commands: NestedCommand[] = [];

    // Location switching (admin only)
    if (isAdmin && locations.length > 1) {
      commands.push({
        id: 'cmd-location',
        title: 'Switch Location',
        icon: MapPin,
        children: locations.map(loc => ({
          id: `loc-${loc}`,
          title: loc,
          icon: loc === selectedLocation ? CheckCircle : MapPin,
          execute: () => {
            setSelectedLocation(loc);
            close();
          },
        })),
      });
    }

    // Session filters (all users) - using actual status values from StatusFilterDropdown
    commands.push({
      id: 'cmd-filter-sessions',
      title: 'Filter Sessions',
      icon: Filter,
      children: [
        { id: 'filter-scheduled', title: 'Scheduled', icon: Calendar, execute: () => { navigate('/sessions?status=Scheduled'); close(); }},
        { id: 'filter-trial', title: 'Trial Class', icon: Star, execute: () => { navigate('/sessions?status=Trial Class'); close(); }},
        { id: 'filter-makeup-class', title: 'Make-up Class', icon: RefreshCw, execute: () => { navigate('/sessions?status=Make-up Class'); close(); }},
        { id: 'filter-attended', title: 'Attended', icon: CheckCircle, execute: () => { navigate('/sessions?status=Attended'); close(); }},
        { id: 'filter-noshow', title: 'No Show', icon: UserX, execute: () => { navigate('/sessions?status=No Show'); close(); }},
        { id: 'filter-cancelled', title: 'Cancelled', icon: X, execute: () => { navigate('/sessions?status=Cancelled'); close(); }},
        { id: 'filter-pending-makeups', title: 'All Pending Make-ups', icon: Clock, execute: () => { navigate('/sessions?filter=pending-makeups'); close(); }},
      ],
    });

    // Overdue payment filters (all users)
    commands.push({
      id: 'cmd-payments',
      title: 'Overdue Payments',
      icon: DollarSign,
      children: [
        { id: 'pay-all', title: 'All Overdue', icon: DollarSign, execute: () => { navigate('/overdue-payments'); close(); }},
        { id: 'pay-critical', title: 'Critical (30+ days)', icon: AlertCircle, execute: () => { navigate('/overdue-payments?urgency=critical'); close(); }},
        { id: 'pay-high', title: 'High (15-29 days)', icon: AlertCircle, execute: () => { navigate('/overdue-payments?urgency=high'); close(); }},
      ],
    });

    return commands;
  }, [isAdmin, locations, selectedLocation, setSelectedLocation, navigate, close]);

  // Fuse instance for fuzzy search on local items (pages + quick actions)
  const fuse = useMemo(() => {
    const allItems = [
      ...allPages.map(p => ({ ...p, itemType: 'page' as const })),
      ...QUICK_ACTIONS.map(a => ({ ...a, itemType: 'action' as const })),
    ];
    return new Fuse(allItems, {
      keys: ['title'],
      threshold: 0.4, // Allow fuzzy matching with typos
      includeScore: true,
    });
  }, [allPages]);

  const [query, setQuery] = useState("");
  const [searchArea, setSearchArea] = useState<"records" | "materials">("records");
  const [filters, setFilters] = useState<SearchFilters>(defaultSearchFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const drillReturn = useRef<{ query: string; filters: SearchFilters; includeHistory: boolean } | null>(null);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [activeRecord, setActiveRecord] = useState<SearchRecord | null>(null);
  const { mutate } = useSWRConfig();
  const openRecord = useCallback((type: SearchRecord["type"], id: number) => {
    const row = document.getElementById(`command-result-${type}-${id}`)
      ?? (selection.current?.id ? document.getElementById(`command-result-${selection.current.id}`) : null)
      ?? inputRef.current;
    const rect = row?.getBoundingClientRect();
    setActiveRecord({ type, id, source: row, position: { x: rect?.left ?? window.innerWidth / 2, y: rect?.bottom ?? 120 } });
    inputRef.current?.blur();
  }, []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [previewItem, setPreviewItem] = useState<{ type: string; id: number } | null>(null);
  const [debouncedPreviewItem, setDebouncedPreviewItem] = useState<{ type: string; id: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const readTop = useRef(0);
  const pendingReturn = useRef<SearchPlace | null>(null);
  const selection = useRef<{ key: string; index: number; id?: string; move?: boolean } | null>(null);

  // Recent searches hook (handles localStorage persistence)
  const { recentSearches, saveRecentSearch, clearRecentSearch, clearAllRecentSearches } = useRecentSearches();

  // Handle mounting for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Debounce preview item to prevent rapid fetches during keyboard navigation
  useEffect(() => {
    if (!isOpen) { setDebouncedPreviewItem(null); return; }
    const timer = setTimeout(() => {
      setDebouncedPreviewItem(previewItem);
    }, 150);
    return () => clearTimeout(timer);
  }, [previewItem, isOpen]);

  // Fetch preview data based on debounced type (prevents race conditions)
  const { data: previewData, isLoading: previewLoading, error: previewError, mutate: retryPreview } = useSWR(
    isOpen && searchArea === "records" && debouncedPreviewItem ? ["search-preview", scope, selectedLocation, debouncedPreviewItem.type, debouncedPreviewItem.id] : null,
    async () => {
      if (!debouncedPreviewItem) return null;
      if (debouncedPreviewItem.type === 'student') {
        return { type: 'student' as const, data: await studentsAPI.getById(debouncedPreviewItem.id) };
      }
      if (debouncedPreviewItem.type === 'session') {
        return { type: 'session' as const, data: await sessionsAPI.getById(debouncedPreviewItem.id) };
      }
      if (debouncedPreviewItem.type === 'enrollment') {
        return { type: 'enrollment' as const, data: await enrollmentsAPI.getById(debouncedPreviewItem.id) };
      }
      return null;
    },
    { revalidateOnFocus: false, keepPreviousData: false }
  );

  useLayoutEffect(() => {
    if (isOpen) {
      inputRef.current?.focus({ preventScroll: true });
      if (listRef.current) listRef.current.scrollTop = readTop.current;
    }
  }, [isOpen]);
  useEffect(() => {
    setSearchArea("records"); setQuery(""); setFilters(defaultSearchFilters()); setFiltersOpen(false); drillReturn.current = null; setIncludeHistory(false); setActiveRecord(null); setSelectedIndex(0); setCommandPath([]);
    setPreviewItem(null); setDebouncedPreviewItem(null); readTop.current = 0; pendingReturn.current = null; selection.current = null;
  }, [scope, selectedLocation]);

  useEffect(() => { if (!isOpen) setActiveRecord(null); }, [isOpen]);
  const parsed = useMemo(() => parseQuery(query), [query]);
  const calendar = useMemo(() => !parsed.type || parsed.type === 'session' ? readCalendarWords(parsed.term) : { term: parsed.term }, [parsed]);
  const filterType = parsed.type || (calendar.dates ? 'session' : filters.category ? ({ students: 'student', sessions: 'session', enrollments: 'enrollment', exams: 'exam' } as const)[filters.category] : null);
  const searchTerm = calendar.term.trim();
  const effectiveFilters = useMemo(() => ({ ...filters,
    ...(calendar.dates ? { category: 'sessions' as const, dates: calendar.dates } : {}),
    ...(parsed.type && ['student', 'session', 'enrollment', 'exam'].includes(parsed.type) ? { category: `${parsed.type}s` as SearchCategory } : {}),
    ...(parsed.type === 'exam' || (!parsed.type && !calendar.dates && filters.category === 'exams') ? { audience: 'centre' as const } : {}),
  }), [filters, calendar.dates, parsed.type]);
  const currentTutorId = isImpersonating ? impersonatedTutor?.id : user?.id;
  const calendarDay = searchDate();
  const options = useMemo(() => requestFilters(effectiveFilters, currentTutorId, new Date(`${calendarDay}T12:00:00+08:00`)), [effectiveFilters, currentTutorId, calendarDay]);
  const filterError = options.from_date && options.to_date && options.from_date > options.to_date ? 'The start date must be on or before the end date.' : undefined;
  const constrained = hasSearchConstraint(options);
  const browsing = !!query || !!effectiveFilters.category || constrained;
  const canSearch = searchTerm.length >= 2 || (!searchTerm && constrained);
  const searchEnabled = searchArea === "records" && isOpen && !commandPath.length && !filterError && canSearch && !query.startsWith("=") && !query.startsWith("?") && filterType !== "page" && !/^(?:date|d)\s+[+-]?\d+$/i.test(query);
  const { results, loading, error: searchError, retry, loadMore, more } = usePaletteSearch(searchTerm, selectedLocation, scope, searchEnabled, includeHistory, options);
  const changeFilters = useCallback((next: SearchFilters) => { setFilters(next); setQuery(searchTerm); }, [searchTerm]);
  const studentRecords = useCallback((category: SearchCategory, student: { id: number; name: string }) => {
    drillReturn.current = { query, filters, includeHistory };
    setFilters({ ...defaultSearchFilters(), category, audience: filters.audience, student,
      ...(category === 'sessions' ? { dates: 'custom', to: searchDate() } : {}) });
    setQuery(''); setIncludeHistory(category === 'sessions'); setActiveRecord(null);
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, [query, filters, includeHistory]);
  const backFromStudent = useCallback(() => {
    const previous = drillReturn.current;
    setFilters(previous?.filters ?? defaultSearchFilters()); setQuery(previous?.query ?? ''); setIncludeHistory(previous?.includeHistory ?? false);
    drillReturn.current = null;
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);
  const refreshSearch = useCallback(() => {
    retry();
    void mutate(key => Array.isArray(key) && key[0] === "search-preview" && key[1] === scope && key[2] === selectedLocation);
  }, [retry, mutate, scope, selectedLocation]);

  // Slash syntax: "filter/" or "loc/" etc. to enter submenu
  useEffect(() => {
    const slashMatch = query.match(/^(\w+)\/$/i);
    if (slashMatch && commandPath.length === 0) {
      const prefix = slashMatch[1].toLowerCase();
      const matchingCmd = nestedCommands.find(cmd =>
        cmd.title.toLowerCase().includes(prefix) ||
        cmd.id.toLowerCase().replace('cmd-', '').includes(prefix)
      );
      if (matchingCmd) {
        setCommandPath([matchingCmd.id]);
        setQuery('');
        setSelectedIndex(0);
      }
    }
  }, [query, commandPath.length, nestedCommands]);

  
  // Build flat list of all results for keyboard navigation
  const allItems = useMemo<ResultItem[]>(() => {
    const items: ResultItem[] = [];

    // Calculator utility: = expression
    if (query.startsWith('=')) {
      const expression = query.slice(1).trim();
      if (expression) {
        try {
          const result = evaluateMath(expression);
          return [{
            id: 'calc-result',
            type: 'utility' as const,
            title: `${expression} = ${result.toLocaleString()}`,
            subtitle: 'Press Enter to copy result',
            icon: Calculator,
            execute: () => {
              navigator.clipboard.writeText(String(result));
              showToast('Copied to clipboard', 'success');
              close();
            },
          }];
        } catch {
          return [{
            id: 'calc-error',
            type: 'utility' as const,
            title: 'Invalid expression',
            subtitle: 'Try: = 6 * 250 or = (10 + 5) * 2',
            icon: AlertCircle,
          }];
        }
      }
    }

    // Date utility: date +7 or d -30
    const dateMatch = query.match(/^(?:date|d)\s+([+-]?\d+)$/i);
    if (dateMatch) {
      const offset = parseInt(dateMatch[1], 10);
      const date = new Date();
      date.setDate(date.getDate() + offset);
      const formatted = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      const isoDate = date.toISOString().split('T')[0];
      return [{
        id: 'date-result',
        type: 'utility' as const,
        title: formatted,
        subtitle: `${offset >= 0 ? '+' : ''}${offset} days → ${isoDate}`,
        icon: Calendar,
        execute: () => {
          navigator.clipboard.writeText(isoDate);
          showToast('Copied to clipboard', 'success');
          close();
        },
      }];
    }

    // Help search: ? prefix
    if (query.startsWith('?')) {
      const helpTerm = query.slice(1).toLowerCase().trim();

      const matchingTopics = helpTerm
        ? HELP_TOPICS.filter(h =>
            h.title.toLowerCase().includes(helpTerm) ||
            h.keywords.some(k => k.includes(helpTerm)) ||
            h.content.some(c => c.label.toLowerCase().includes(helpTerm) || c.desc.toLowerCase().includes(helpTerm))
          )
        : HELP_TOPICS;

      return matchingTopics.map(topic => ({
        id: topic.id,
        type: 'help' as const,
        title: topic.title,
        subtitle: topic.keywords.slice(0, 3).join(', '),
        icon: HelpCircle,
      }));
    }

    // If in nested command submenu, show children
    if (commandPath.length > 0) {
      const currentParentId = commandPath[commandPath.length - 1];
      const parentCmd = nestedCommands.find(c => c.id === currentParentId);
      if (parentCmd?.children) {
        parentCmd.children.forEach((child) => {
          items.push({
            id: child.id,
            type: 'action' as const,
            title: child.title,
            icon: child.icon,
            execute: child.execute,
          });
        });
      }
      return items;
    }

    // When no query, show recent searches + action commands + nested commands + quick actions + pages
    if (!browsing) {
      // Recent searches
      recentSearches.forEach((search) => {
        items.push({
          id: `recent-${encodeURIComponent(search)}`,
          type: "recent",
          title: search,
          href: "", // Will set query instead of navigating
          icon: Clock,
        });
      });

      // Action commands
      actionCommands.forEach((action) => {
        items.push(action);
      });

      // Nested commands (show as parent items with > indicator)
      nestedCommands.forEach((cmd) => {
        items.push({
          id: cmd.id,
          type: 'action' as const,
          title: cmd.title,
          subtitle: `${cmd.children?.length || 0} options →`,
          icon: cmd.icon,
          execute: () => {
            setCommandPath([cmd.id]);
            setSelectedIndex(0);
          },
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

      // All pages (role-filtered)
      allPages.forEach((p) => {
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
          const phoneDisplay = s.contacts?.length
            ? s.contacts.map((c: { phone: string; label?: string }) => c.label ? `${c.phone} (${c.label})` : c.phone).join(", ")
            : s.phone;
          items.push({
            id: `student-${s.id}`,
            type: "student",
            title: s.student_name,
            subtitle: [s.school_student_id, phoneDisplay].filter(Boolean).join(" · "),
            identity: { grade: s.grade, school: s.school, langStream: s.lang_stream },
            href: `/students/${s.id}`,
            execute: () => openRecord("student", s.id),
            icon: User,
          });
        });
        if (results.has_more?.students) items.push({
          id: `more-students-${results.students.length}`, type: 'more', group: 'student',
          title: more?.category === 'students' && !more.error ? 'Loading more students...' : 'Show more students',
          subtitle: more?.category === 'students' && more.error ? 'Could not load more. Select to retry.' : undefined,
          icon: ChevronRight,
          execute: () => { void loadMore('students'); inputRef.current?.focus({ preventScroll: true }); },
        });

      }

      // Sessions (only if no filter or filter is "session")
      if (!filterType || filterType === "session") {
        results.sessions.forEach((s) => {
          items.push({
            id: `session-${s.id}`,
            type: "session",
            title: s.student_name || "Unknown Student",
            subtitle: sessionLabel(s),
            matchContext: s.match_context,
            identity: { grade: s.grade ?? null, school: s.school ?? null, langStream: s.lang_stream },
            href: `/sessions/${s.id}`,
            execute: () => openRecord("session", s.id),
            icon: Calendar,
          });
        });
        if (results.has_more?.sessions) items.push({
          id: `more-sessions-${results.sessions.length}`, type: 'more', group: 'session',
          title: more?.category === 'sessions' && !more.error ? 'Loading more sessions...' : 'Show more sessions',
          subtitle: more?.category === 'sessions' && more.error ? 'Could not load more. Select to retry.' : undefined,
          icon: ChevronRight,
          execute: () => { void loadMore('sessions'); inputRef.current?.focus({ preventScroll: true }); },
        });

      }

      // Enrolments (also available directly with enr:term)
      if (!filterType || filterType === "enrollment") {
        results.enrollments.forEach((e) => {
          items.push({
            id: `enrollment-${e.id}`,
            type: "enrollment",
            title: e.student_name || "Unknown Student",
            subtitle: enrollmentLabel(e),
            identity: { grade: e.grade ?? null, school: e.school ?? null, langStream: e.lang_stream },
            execute: () => openRecord("enrollment", e.id),
            href: `/enrollments/${e.id}`,
            icon: BookOpen,
          });
        });
        if (results.has_more?.enrollments) items.push({
          id: `more-enrollments-${results.enrollments.length}`, type: 'more', group: 'enrollment',
          title: more?.category === 'enrollments' && !more.error ? 'Loading more enrolments...' : 'Show more enrolments',
          subtitle: more?.category === 'enrollments' && more.error ? 'Could not load more. Select to retry.' : undefined,
          icon: ChevronRight,
          execute: () => { void loadMore('enrollments'); inputRef.current?.focus({ preventScroll: true }); },
        });

      }

      // Exams (only if no filter or filter is "exam")
      if (!filterType || filterType === "exam") {
        results.exams.forEach((exam) => {
          items.push({
            id: `exam-${exam.id}`,
            type: "exam",
            title: exam.title,
            subtitle: [
              exam.start_date ? new Date(exam.start_date).toLocaleDateString() : null,
              exam.event_type,
              exam.school,
              exam.grade,
            ].filter(Boolean).join(" · "),
            href: `/exams`,
            icon: GraduationCap,
          });
        });
        if (results.has_more?.exams) items.push({
          id: `more-exams-${results.exams.length}`, type: 'more', group: 'exam',
          title: more?.category === 'exams' && !more.error ? 'Loading more exams...' : 'Show more exams',
          subtitle: more?.category === 'exams' && more.error ? 'Could not load more. Select to retry.' : undefined,
          icon: ChevronRight,
          execute: () => { void loadMore('exams'); inputRef.current?.focus({ preventScroll: true }); },
        });

      }
    }

    // Add matching pages using fuzzy search (only if no filter or filter is "page")
    if ((!filterType || filterType === "page") && searchTerm.length >= 2 && !constrained) {
      const fuseResults = fuse.search(searchTerm);
      const matchedPages = fuseResults
        .filter(r => r.item.itemType === 'page' || r.item.itemType === 'action')
        .map(r => r.item);

      matchedPages.forEach((p) => {
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
  }, [results, query, searchTerm, filterType, recentSearches, allPages, fuse, actionCommands, showToast, commandPath, nestedCommands, close, openRecord, browsing, constrained, loadMore, more]);

  // Index map for O(1) lookup instead of O(n) indexOf
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    allItems.forEach((item, idx) => map.set(item.id, idx));
    return map;
  }, [allItems]);

  const searchJourney = useSearchReturn(scope + ":" + selectedLocation, open, origin,
    () => ({ area: searchArea, query, filters: effectiveFilters, includeHistory, selectedId: allItems[selectedIndex]?.id, index: selectedIndex, path: commandPath, top: listRef.current?.scrollTop ?? readTop.current }),
    place => { setSearchArea(place.area ?? "records"); pendingReturn.current = place; readTop.current = place.top; setQuery(place.query); setFilters(place.filters ?? defaultSearchFilters()); setIncludeHistory(place.includeHistory ?? false); setSelectedIndex(place.index); setCommandPath(place.path); });
  navigateRef.current = href => {
    if (new URL(href, window.location.href).href === window.location.href) { close(); return; }
    searchJourney.remember(); setActiveRecord(null); router.push(href); close();
  };
  useLayoutEffect(() => {
    if (isOpen) searchJourney.navigation.current = false;
  }, [isOpen, searchJourney.navigation]);
  const returnToSource = useCallback(() => {
    requestAnimationFrame(() => {
      const place = origin.current;
      if (!place || searchJourney.navigation.current || window.location.href !== place.url || document.querySelector('[role="dialog"]')) return;
      restoreScroll(place.scroll);
      const target = place.source?.isConnected && place.source.getClientRects().length ? place.source
        : [...document.querySelectorAll<HTMLElement>("[data-global-search-trigger]")].find(element => element.getClientRects().length) ?? document.getElementById("main-content");
      if (target?.id === "main-content" && !target.hasAttribute("tabindex")) target.tabIndex = -1;
      target?.focus({ preventScroll: true });
    });
  }, [origin, searchJourney.navigation]);
  useLayoutEffect(() => {
    const key = JSON.stringify([scope, selectedLocation, query, commandPath, effectiveFilters]);
    const previous = selection.current, returning = pendingReturn.current;
    if (returning && loading && !results) return;
    const explicit = !returning && previous?.key === key && selectedIndex !== previous.index;
    let index = Math.max(0, Math.min(selectedIndex, allItems.length - 1));
    if (returning) {
      const found = allItems.findIndex(item => item.id === returning.selectedId);
      index = found >= 0 ? found : Math.max(0, Math.min(returning.index, allItems.length - 1));
      if (listRef.current) listRef.current.scrollTop = returning.top;
      pendingReturn.current = null;
    } else if (previous?.key !== key) {
      index = 0; readTop.current = 0;
      if (listRef.current) listRef.current.scrollTop = 0;
    } else if (!explicit && previous?.id) {
      const found = allItems.findIndex(item => item.id === previous.id);
      if (found >= 0) index = found;
    }
    selection.current = { key, index, id: allItems[index]?.id, move: explicit };
    if (index !== selectedIndex) setSelectedIndex(index);
  }, [allItems, selectedIndex, scope, selectedLocation, query, includeHistory, commandPath, loading, results, effectiveFilters]);
  const helpPreview = useMemo(() => {
    const item = allItems[selectedIndex];
    return item?.type === "help" ? HELP_TOPICS.find(topic => topic.id === item.id) ?? null : null;
  }, [allItems, selectedIndex]);
  const previewMatches = !!debouncedPreviewItem && allItems[selectedIndex]?.id === `${debouncedPreviewItem.type}-${debouncedPreviewItem.id}`;
  const hasPreview = !!helpPreview || ["student", "session", "enrollment", "exam"].includes(allItems[selectedIndex]?.type);
  useEffect(() => {
    if (reduced || !previewRef.current || !hasPreview) return;
    const animation = previewRef.current.animate?.([{ opacity: .65 }, { opacity: 1 }], { duration: 120, easing: "ease-out" });
    return () => animation?.cancel();
  }, [selectedIndex, hasPreview, previewMatches, reduced]);

  // Derive exam preview from search results (no API fetch needed)
  const examPreview = useMemo(() => {
    const item = allItems[selectedIndex];
    if (item?.type !== 'exam' || !results?.exams) return null;
    const examId = parseInt(item.id.split('-')[1], 10);
    return results.exams.find(e => e.id === examId) ?? null;
  }, [selectedIndex, allItems, results]);

  // Update preview based on selected item
  useEffect(() => {
    const item = allItems[selectedIndex];

    // Handle API-fetched previews
    if (item && ['student', 'session', 'enrollment'].includes(item.type)) {
      const entityId = parseInt(item.id.split('-')[1], 10);
      if (!isNaN(entityId)) {
        setPreviewItem(previous => previous?.type === item.type && previous.id === entityId ? previous : { type: item.type, id: entityId });
      } else {
        setPreviewItem(null);
      }
    } else {
      setPreviewItem(null);
    }
  }, [selectedIndex, allItems]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, allItems.length - 1)));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (allItems[selectedIndex]) {
            haptic.trigger("light");
            const item = allItems[selectedIndex];
            // Save to recent only when selecting a data result
            if (query && ["student", "session", "enrollment", "exam"].includes(item.type)) {
              saveRecentSearch(query);
            }
            if (item.type === "recent") {
              // Set query instead of navigating for recent searches
              setQuery(item.title);
            } else if (item.execute) {
              // Execute action or utility command (execute handles closing if needed)
              item.execute();
            } else if (item.href) {
              navigate(item.href);
              close();
            }
          }
          break;
        case "Escape":
          e.preventDefault();
          if (commandPath.length > 0) {
            // Go back from submenu
            setCommandPath(prev => prev.slice(0, -1));
            setSelectedIndex(0);
          } else if (effectiveFilters.student) {
            backFromStudent();
          } else if (query) {
            // First escape clears query
            setQuery("");
          } else {
            // Second escape closes palette
            close();
          }
          break;
        case "Backspace":
          // Go back from submenu on Backspace when query is empty
          if (query === "" && commandPath.length > 0) {
            e.preventDefault();
            setCommandPath(prev => prev.slice(0, -1));
            setSelectedIndex(0);
          } else if (!query && effectiveFilters.student) {
            e.preventDefault(); backFromStudent();
          }
          break;
      }
    },
    [allItems, selectedIndex, navigate, close, query, commandPath, saveRecentSearch, haptic, effectiveFilters.student, backFromStudent]
  );

  // Arrow keys scroll only the results, preserving the page behind the search.
  useLayoutEffect(() => {
    if (!selection.current?.move || !listRef.current) return;
    selection.current.move = false;
    const list = listRef.current;
    const selected = list.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (!selected) return;
    const row = selected.getBoundingClientRect(), box = list.getBoundingClientRect();
    if (row.top < box.top) list.scrollTop += row.top - box.top;
    else if (row.bottom > box.bottom) list.scrollTop += row.bottom - box.bottom;
  }, [selectedIndex, allItems]);

  if (!mounted) return null;

  const modalContent = (
    <>
    <AnimatePresence initial={false}>
      {isOpen && <SearchSurface key="global-search" origin={origin.current} onClose={close} onUnmount={returnToSource} input={inputRef}>
        {/* Search Input */}
        <div className={cn(styles.header, "flex items-center gap-3 border-b border-line")}>
          <div className={styles.query}>
          {loading ? <RefreshCw role="status" aria-label="Searching" className="h-5 w-5 text-accent-ink flex-shrink-0 animate-spin" /> : <Search className="h-5 w-5 text-accent-ink flex-shrink-0" />}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={event => {
              if (searchArea === 'records') { handleKeyDown(event); return; }
              if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); const first = document.querySelector<HTMLButtonElement>('[data-material-result]'); if (event.key === 'Enter') first?.click(); else first?.focus(); }
              if (event.key === 'Escape') { event.preventDefault(); if (query) setQuery(''); else close(); }
            }}
            placeholder={searchArea === "materials" ? "Search courseware" : "Search"}
            enterKeyHint="search" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            role={searchArea === 'records' ? 'combobox' : 'searchbox'}
            aria-expanded={searchArea === 'records' ? allItems.length > 0 : undefined}
            aria-controls={searchArea === 'records' ? 'command-palette-listbox' : undefined}
            aria-activedescendant={searchArea === 'records' && allItems[selectedIndex] ? `command-result-${allItems[selectedIndex].id}` : undefined}
            aria-autocomplete={searchArea === 'records' ? 'list' : undefined}
            aria-label={searchArea === "materials" ? "Search courseware" : "Search commands and pages"}
            className={cn(
              "flex-1 min-w-0 bg-transparent text-gray-900 dark:text-gray-100",
              "placeholder:text-gray-500 dark:placeholder:text-gray-400",
              "focus:outline-none text-base max-sm:text-lg"
            )}
          />
          {/* Clear input button */}
          <button
              disabled={!query} aria-hidden={!query} style={{ visibility: query ? "visible" : "hidden" }}
              aria-label="Clear search"
              onClick={() => { setQuery(""); inputRef.current?.focus({ preventScroll: true }); }}
              className="p-2 hover:bg-wash rounded transition-colors"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <button
            aria-label="Close search"
            onClick={close}
            className="p-2 hover:bg-wash rounded transition-colors"
          >
            <span className="hidden sm:inline text-sm font-medium text-accent-ink">Close</span><span className="sm:hidden text-sm font-medium text-accent-ink">Cancel</span>
          </button>
        </div>

        {/* Breadcrumb when in nested command submenu */}
        {commandPath.length > 0 && (
          <div className="px-4 py-2 flex items-center gap-2 border-b border-line dark:border-tint bg-wash/50">
            <button
              onClick={() => {
                setCommandPath([]);
                setSelectedIndex(0);
              }}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Commands
            </button>
            {commandPath.map((id, idx) => {
              const cmd = nestedCommands.find(c => c.id === id);
              return (
                <Fragment key={id}>
                  <ChevronRight className="h-3 w-3 text-gray-500" />
                  <button
                    onClick={() => {
                      setCommandPath(prev => prev.slice(0, idx + 1));
                      setSelectedIndex(0);
                    }}
                    className="text-xs font-medium text-accent-ink"
                  >
                    {cmd?.title}
                  </button>
                </Fragment>
              );
            })}
          </div>
        )}

        <div className={styles.areas} aria-label="Search area">
          <button aria-pressed={searchArea === 'records'} onClick={() => setSearchArea('records')}>Records</button>
          <button aria-pressed={searchArea === 'materials'} onClick={() => { setSearchArea('materials'); setCommandPath([]); }}>Courseware</button>
        </div>
        <MaterialSearch key={`${scope}:${selectedLocation}`} workspace={materialWorkspace} onQueryChange={setQuery} query={query} scope={`${scope}:${selectedLocation}`} active={searchArea === 'materials'} canAssign={!isReadOnly} />
        {searchArea === 'records' && <>
        {!commandPath.length && !query.startsWith('=') && !query.startsWith('?') && filterType !== 'page' && <SearchFilterControls
          filters={effectiveFilters} onChange={changeFilters} expanded={filtersOpen} onToggle={() => setFiltersOpen(value => !value)}
          includeHistory={includeHistory} onHistory={() => setIncludeHistory(value => !value)} currentTutor={currentTutorId}
          error={filterError} onBack={backFromStudent} />}

        {/* Results with Preview Panel */}
        <div className={styles.body}>
          {/* Results panel */}
          <div
            ref={listRef}
            id="command-palette-listbox"
            role="listbox"
            aria-label="Search results"
            aria-busy={loading}
            onScroll={event => { readTop.current = event.currentTarget.scrollTop; }}
            className={styles.results}
          >
          {loading && allItems.length === 0 && <div role="status" className={styles.status}><RefreshCw className="h-3 w-3 animate-spin" />Searching...</div>}
          {searchError && <div role="status" className={styles.status}>Search could not load.<button onClick={() => retry()} className="font-medium text-accent-ink underline">Retry</button></div>}

          {/* Enhanced empty state with illustration */}
          {!loading && !searchError && allItems.length === 0 && browsing && !filterError && (
            <div className="flex flex-col items-center px-4 py-6 text-center">
              <SearchNoResults className="mb-2 opacity-90" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {canSearch ? query ? <>No results for &quot;{query}&quot;</> : "No records match these filters." : "Type a name or choose a session date."}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Try @student, #session, = calc, or ? for help
              </p>
            </div>
          )}

          {allItems.length > 0 && browsing && (
            <div className="py-2">
              {/* Group by type */}
              {["utility", "help", "student", "session", "enrollment", "exam", "page", "action"].map((type) => {
                const typeItems = allItems.filter((item) => item.type === type || (item.type === "more" && item.group === type));
                if (typeItems.length === 0) return null;

                const typeLabels: Record<string, string> = {
                  action: "Commands",
                  utility: "Result",
                  help: "Help",
                  student: "Students",
                  session: "Sessions",
                  enrollment: "Enrolments",
                  exam: "Exams",
                  page: "Pages",
                };

                return (
                  <div key={type}>
                    <div className={styles.group}>
                      <span className={cn(
                        "text-xs font-semibold",
                        "text-ink-subtle"
                      )}>
                        {typeLabels[type]}{results?.has_more?.[`${type}s` as keyof NonNullable<typeof results.has_more>] && <span className="ml-2 font-normal text-ink-subtle">More available</span>}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {typeItems.filter(item => item.type !== "more").length}
                      </span>
                    </div>
                    {typeItems.map((item) => {
                      const index = itemIndexMap.get(item.id) ?? 0;
                      const isSelected = index === selectedIndex;

                      return (
                        <ResultItemButton
                          onSelect={setSelectedIndex}
                          key={item.id}
                          item={item}
                          index={index}
                          isSelected={isSelected}
                          searchTerm={searchTerm}
                          showEnterIcon={item.type !== 'help'}
                          onClick={() => {
                            setSelectedIndex(index);
                            haptic.trigger("light");
                            if (query && ["student", "session", "enrollment", "exam"].includes(item.type)) {
                              saveRecentSearch(query);
                            }
                            if (item.execute) {
                              item.execute();
                            } else if (item.href) {
                              navigate(item.href);
                              close();
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Submenu items when in nested command */}
          {!query && commandPath.length > 0 && (
            <div className="py-2">
              {allItems.map((item, idx) => (
                <ResultItemButton
                          onSelect={setSelectedIndex}
                  key={item.id}
                  item={item}
                  index={idx}
                  isSelected={idx === selectedIndex}
                  onClick={() => { haptic.trigger("light"); item.execute?.(); }}
                />
              ))}
            </div>
          )}

          {/* Empty state with recent searches and pages when no query */}
          {!browsing && commandPath.length === 0 && (
            <div className="py-2">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <>
                  <div className="px-4 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Recent
                      </span>
                    </div>
                    <button
                      onClick={clearAllRecentSearches}
                      className="text-xs text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  {recentSearches.map((search, index) => (
                    <ResultItemButton
                          onSelect={setSelectedIndex}
                      key={`recent-${search}`}
                      item={{
                        id: `recent-${encodeURIComponent(search)}`,
                        type: "recent",
                        title: search,
                        icon: Clock,
                      }}
                      index={index}
                      isSelected={index === selectedIndex}
                      onClick={() => setQuery(search)}
                      onDelete={() => clearRecentSearch(search)}
                      isRecentSearch
                    />
                  ))}
                </>
              )}

              {/* Actions */}
              <div className={styles.group}>
                <Sparkles className="h-3 w-3 text-purple-600" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Actions
                </span>
              </div>
              {actionCommands.map((action, idx) => (
                <ResultItemButton
                          onSelect={setSelectedIndex}
                  key={action.id}
                  item={action}
                  index={recentSearches.length + idx}
                  isSelected={recentSearches.length + idx === selectedIndex}
                  iconColorClass="text-purple-600 dark:text-purple-400"
                  onClick={() => action.execute?.()}
                />
              ))}

              {/* Nested Commands */}
              {nestedCommands.length > 0 && (
                <>
                  <div className={styles.group}>
                    <Filter className="h-3 w-3 text-blue-600" />
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Commands
                    </span>
                  </div>
                  {nestedCommands.map((cmd, idx) => (
                    <ResultItemButton
                          onSelect={setSelectedIndex}
                      key={cmd.id}
                      item={{
                        id: cmd.id,
                        type: "action",
                        title: cmd.title,
                        subtitle: `${cmd.children?.length || 0} options`,
                        icon: cmd.icon,
                      }}
                      index={recentSearches.length + actionCommands.length + idx}
                      isSelected={recentSearches.length + actionCommands.length + idx === selectedIndex}
                      iconColorClass="text-blue-600 dark:text-blue-400"
                      showEnterIcon={false}
                      badge={<ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                      onClick={() => {
                        setCommandPath([cmd.id]);
                        setSelectedIndex(0);
                      }}
                    />
                  ))}
                </>
              )}

              {/* Quick Actions */}
              <div className={styles.group}>
                <Zap className="h-3 w-3 text-amber-700" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Quick Actions
                </span>
              </div>
              {QUICK_ACTIONS.map((action, idx) => (
                <ResultItemButton
                          onSelect={setSelectedIndex}
                  key={action.id}
                  item={{
                    id: action.id,
                    type: "page",
                    title: action.title,
                    href: action.href,
                    icon: action.icon,
                  }}
                  index={recentSearches.length + actionCommands.length + nestedCommands.length + idx}
                  isSelected={recentSearches.length + actionCommands.length + nestedCommands.length + idx === selectedIndex}
                  onClick={() => {
                    navigate(action.href);
                    close();
                  }}
                />
              ))}

              {/* Quick Navigation */}
              <div className={styles.group}>
                <Grid3x3 className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Pages
                </span>
              </div>
              {allPages.map((page, idx) => {
                const index = recentSearches.length + actionCommands.length + nestedCommands.length + QUICK_ACTIONS.length + idx;
                const isAdminPage = page.id.startsWith("page-renewals") ||
                                    page.id.startsWith("page-extensions") ||
                                    page.id.startsWith("page-debug");

                return (
                  <ResultItemButton
                          onSelect={setSelectedIndex}
                    key={page.id}
                    item={{
                      id: page.id,
                      type: "page",
                      title: page.title,
                      href: page.href,
                      icon: page.icon,
                    }}
                    index={index}
                    isSelected={index === selectedIndex}
                    iconColorClass={isAdminPage ? "text-amber-700 dark:text-amber-400" : undefined}
                    badge={isAdminPage ? <Shield className="h-3 w-3 text-amber-700 dark:text-amber-400" /> : undefined}
                    onClick={() => {
                      navigate(page.href);
                      close();
                    }}
                  />
                );
              })}
            </div>
          )}
          </div>

          {/* Preview panel - desktop only */}
          {hasPreview && !commandPath.length && (
            <aside ref={previewRef} aria-label="Result preview" className={styles.preview}>
              {helpPreview ? (
                <HelpPreview topic={helpPreview} />
              ) : examPreview ? (
                <PreviewContent data={{ type: 'exam', data: examPreview }} />
              ) : previewMatches && previewError ? (
                <div role="alert" className="text-xs text-ink-heading">Details could not load. <button onClick={() => void retryPreview()} className="text-accent-ink underline">Retry details</button></div>
              ) : !previewMatches || previewLoading ? (
                <PreviewSkeleton />
              ) : (
                <PreviewContent data={previewData ?? null} onChanged={refreshSearch} onNavigate={navigate} onStudentRecords={studentRecords} tutorId={options.tutor_id} onSession={id => openRecord("session", id)}
                  onOpenDetails={() => { if (debouncedPreviewItem?.type === "session" || debouncedPreviewItem?.type === "enrollment") openRecord(debouncedPreviewItem.type, debouncedPreviewItem.id); }} />
              )}
            </aside>
          )}
        </div>

        </>}

        {/* Footer hints - hidden on mobile */}
        <div className="px-4 py-2 border-t border-line dark:border-tint bg-wash/50 max-sm:hidden">
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
              <kbd className="px-1 py-0.5 bg-field-fill rounded border border-line dark:border-tint text-[11px]">
                Esc
              </kbd>
              {effectiveFilters.student ? "Back" : query ? "Clear" : "Close"}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-[11px]">?</span>
              Help
            </span>
          </div>
        </div>
      </SearchSurface>}
    </AnimatePresence>
    {isOpen && activeRecord && <SearchRecordDetail key={`${scope}:${selectedLocation}:${activeRecord.type}:${activeRecord.id}`} record={activeRecord} scope={scope} location={selectedLocation}
      onStudentRecords={studentRecords} tutorId={options.tutor_id} onSession={id => openRecord("session", id)} navigate={navigate}
      onClose={() => { setActiveRecord(null); refreshSearch(); requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true })); }} onChanged={refreshSearch}
      onNavigate={() => { searchJourney.remember(); setActiveRecord(null); close(); }} />}
    </>
  );

  return createPortal(modalContent, document.body);
}
