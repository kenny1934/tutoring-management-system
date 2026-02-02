"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import Fuse from "fuse.js";
import useSWR from "swr";
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
  Inbox,
  Settings,
  GraduationCap,
  DollarSign,
  Star,
  Phone,
  AlertCircle,
  UserX,
  RefreshCcw,
  Database,
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
  HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, SearchResults, studentsAPI, sessionsAPI, enrollmentsAPI } from "@/lib/api";
import { getGradeColor } from "@/lib/constants";
import { getSessionStatusConfig } from "@/lib/session-status";
import { getPaymentStatusConfig } from "@/lib/enrollment-utils";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { useLocation } from "@/contexts/LocationContext";
import { useToast } from "@/contexts/ToastContext";
import { SearchNoResults } from "@/components/illustrations/EmptyStates";

// localStorage key for recent searches
const RECENT_SEARCHES_KEY = "command-palette-recent-searches";
const MAX_RECENT_SEARCHES = 5;

// Page/action item type
interface PageItem {
  id: string;
  title: string;
  href: string;
  icon: typeof Home;
}

// Quick navigation pages
const PAGES: PageItem[] = [
  // Core pages
  { id: "page-dashboard", title: "Dashboard", href: "/", icon: Home },
  { id: "page-students", title: "Students", href: "/students", icon: User },
  { id: "page-sessions", title: "Sessions", href: "/sessions", icon: Calendar },
  { id: "page-courseware", title: "Courseware", href: "/courseware", icon: BookOpen },
  // High frequency
  { id: "page-inbox", title: "Inbox", href: "/inbox", icon: Inbox },
  { id: "page-proposals", title: "Make-up Proposals", href: "/proposals", icon: RefreshCw },
  { id: "page-settings", title: "Settings", href: "/settings", icon: Settings },
  // Business pages
  { id: "page-exams", title: "Exam Schedules", href: "/exams", icon: GraduationCap },
  { id: "page-revenue", title: "Revenue Reports", href: "/revenue", icon: DollarSign },
  { id: "page-trials", title: "Trial Sessions", href: "/trials", icon: Star },
  { id: "page-parent-contacts", title: "Parent Contacts", href: "/parent-contacts", icon: Phone },
  { id: "page-overdue", title: "Overdue Payments", href: "/overdue-payments", icon: AlertCircle },
  { id: "page-terminated", title: "Terminated Students", href: "/terminated-students", icon: UserX },
];

// Admin-only pages
const ADMIN_PAGES: PageItem[] = [
  { id: "page-renewals", title: "Admin: Renewals", href: "/admin/renewals", icon: RefreshCcw },
  { id: "page-extensions", title: "Admin: Extensions", href: "/admin/extensions", icon: Clock },
];

// Super-admin only
const SUPER_ADMIN_PAGES: PageItem[] = [
  { id: "page-debug", title: "Admin: Debug Panel", href: "/admin/debug", icon: Database },
];

// Quick actions (session-focused)
const QUICK_ACTIONS: PageItem[] = [
  { id: "action-today", title: "Today's Sessions", href: "/sessions", icon: Calendar },
  { id: "action-week", title: "This Week's Sessions", href: "/sessions?view=week", icon: Grid3x3 },
  { id: "action-makeups", title: "Pending Make-ups", href: "/sessions?filter=pending-makeups", icon: RefreshCw },
];

// Type badge colors
const typeBadgeColors: Record<string, string> = {
  student: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  session: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  enrollment: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  page: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  utility: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  help: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
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
  type: "student" | "session" | "enrollment" | "page" | "recent" | "action" | "utility" | "help";
  title: string;
  subtitle?: string;
  href?: string;  // Optional for actions
  icon: typeof User;
  execute?: () => void;  // For action commands
}

// Safe math evaluator (no eval) - supports +, -, *, /, parentheses
function evaluateMath(expr: string): number {
  // Tokenize: numbers (including decimals), operators, parentheses
  const tokens = expr.match(/(\d+\.?\d*|[+\-*/()])/g);
  if (!tokens) throw new Error('Invalid expression');

  let pos = 0;

  function parseExpr(): number {
    let left = parseTerm();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++];
      const right = parseFactor();
      if (op === '/' && right === 0) throw new Error('Division by zero');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number {
    if (tokens[pos] === '(') {
      pos++; // skip (
      const result = parseExpr();
      if (tokens[pos] !== ')') throw new Error('Unmatched parenthesis');
      pos++; // skip )
      return result;
    }
    if (tokens[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    return parseFloat(tokens[pos++]);
  }

  const result = parseExpr();
  if (isNaN(result) || !isFinite(result)) throw new Error('Invalid result');
  return result;
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

// Nested command interface
interface NestedCommand {
  id: string;
  title: string;
  icon: typeof User;
  children?: NestedCommand[];
  execute?: () => void;
}

// Help topics for ? prefix search
const HELP_TOPICS = [
  {
    id: 'help-search',
    title: 'Search Shortcuts',
    keywords: ['search', 'find', 'filter', 'prefix'],
    content: [
      { label: '@name', desc: 'Filter to students only' },
      { label: '#term', desc: 'Filter to sessions only' },
      { label: '/page', desc: 'Filter to pages only' },
      { label: '= expr', desc: 'Calculator (e.g. = 6 * 250)' },
      { label: 'date +7', desc: 'Date offset (or d -30)' },
      { label: 'filter/', desc: 'Open filter submenu' },
    ],
  },
  {
    id: 'help-keyboard',
    title: 'Keyboard Shortcuts',
    keywords: ['keyboard', 'shortcut', 'key', 'hotkey'],
    content: [
      { label: 'Ctrl+K', desc: 'Open command palette' },
      { label: '↑ / ↓', desc: 'Navigate results' },
      { label: 'Enter', desc: 'Select item' },
      { label: 'Esc', desc: 'Clear input or close' },
      { label: 'Backspace', desc: 'Exit submenu (when empty)' },
    ],
  },
  {
    id: 'help-calculator',
    title: 'Calculator & Date Tools',
    keywords: ['calculator', 'math', 'date', 'calculate'],
    content: [
      { label: '= 6 * 250', desc: 'Basic math' },
      { label: '= (10 + 5) * 2', desc: 'With parentheses' },
      { label: 'date +7', desc: '7 days from today' },
      { label: 'd -30', desc: '30 days ago' },
    ],
  },
];

// Preview panel skeleton
function PreviewSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 w-24 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
      <div className="h-5 w-32 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
      <div className="flex gap-2">
        <div className="h-5 w-12 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
        <div className="h-5 w-16 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
      </div>
      <div className="h-4 w-28 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
    </div>
  );
}

// Help preview component
function HelpPreview({ topic }: { topic: typeof HELP_TOPICS[0] }) {
  return (
    <div className="space-y-3">
      <div className="font-semibold text-[#5d4a3a] dark:text-[#d4c4b0]">
        {topic.title}
      </div>
      <div className="space-y-2">
        {topic.content.map((item, idx) => (
          <div key={idx} className="flex gap-3 text-xs">
            <span className="font-mono text-[#a0704b] dark:text-[#cd853f] shrink-0 w-20">
              {item.label}
            </span>
            <span className="text-[#5d4a3a] dark:text-[#d4c4b0]">
              {item.desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Preview content component following app-wide display patterns
function PreviewContent({ data }: { data: { type: string; data: any } | null }) {
  if (!data) return null;

  // Help topic preview
  if (data.type === 'help') {
    return <HelpPreview topic={data.data} />;
  }

  // Student preview - follows StudentDetailPopover pattern
  if (data.type === 'student') {
    const s = data.data;
    return (
      <div className="space-y-3">
        {/* ID - monospace, small, gray (consistent with StudentInfoBadges) */}
        {s.school_student_id && (
          <div className="text-[10px] font-mono text-[#8b7355] dark:text-[#a89880]">
            {s.school_student_id}
          </div>
        )}
        {/* Name - semibold, main text */}
        <div className="font-semibold text-[#5d4a3a] dark:text-[#d4c4b0]">
          {s.student_name}
        </div>
        {/* Badges - grade with color, school with amber */}
        <div className="flex flex-wrap gap-1.5">
          {s.grade && (
            <span
              className="px-1.5 py-0.5 text-[11px] rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(s.grade, s.lang_stream) }}
            >
              {s.grade}{s.lang_stream || ''}
            </span>
          )}
          {s.school && (
            <span className="px-1.5 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
              {s.school}
            </span>
          )}
        </div>
        {/* Contact info with icons */}
        <div className="text-xs space-y-1.5 text-[#5d4a3a] dark:text-[#d4c4b0]">
          {s.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3 text-[#8b7355]" />
              <span>{s.phone}</span>
            </div>
          )}
          {s.home_location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 text-[#8b7355]" />
              <span>{s.home_location}</span>
            </div>
          )}
          {s.enrollment_count !== undefined && (
            <div className="flex items-center gap-2">
              <BookOpen className="h-3 w-3 text-[#8b7355]" />
              <span>{s.enrollment_count} enrollment{s.enrollment_count !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Session preview - follows SessionDetailPopover pattern
  if (data.type === 'session') {
    const s = data.data;
    const statusConfig = getSessionStatusConfig(s.session_status);
    return (
      <div className="space-y-3">
        {/* Date/time header */}
        <div className="flex items-center gap-2 text-xs text-[#8b7355] dark:text-[#a89880]">
          <Calendar className="h-3 w-3" />
          <span>{s.session_date}</span>
          {s.time_slot && (
            <>
              <Clock className="h-3 w-3 ml-1" />
              <span>{s.time_slot}</span>
            </>
          )}
        </div>
        {/* Student info */}
        <div>
          {s.school_student_id && (
            <div className="text-[10px] font-mono text-[#8b7355] dark:text-[#a89880]">
              {s.school_student_id}
            </div>
          )}
          <div className="font-semibold text-[#5d4a3a] dark:text-[#d4c4b0]">
            {s.student_name}
          </div>
        </div>
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {s.grade && (
            <span
              className="px-1.5 py-0.5 text-[11px] rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(s.grade, s.lang_stream) }}
            >
              {s.grade}{s.lang_stream || ''}
            </span>
          )}
          {s.school && (
            <span className="px-1.5 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
              {s.school}
            </span>
          )}
          {/* Status badge with color coding */}
          {s.session_status && (
            <span className={cn(
              "px-1.5 py-0.5 text-[11px] rounded",
              statusConfig.bgTint,
              statusConfig.textClass
            )}>
              {s.session_status}
            </span>
          )}
        </div>
        {/* Tutor info */}
        {s.tutor_name && (
          <div className="flex items-center gap-2 text-xs text-[#5d4a3a] dark:text-[#d4c4b0]">
            <User className="h-3 w-3 text-[#8b7355]" />
            <span>{s.tutor_name}</span>
          </div>
        )}
      </div>
    );
  }

  // Enrollment preview - follows EnrollmentDetailPopover pattern
  if (data.type === 'enrollment') {
    const e = data.data;
    const paymentConfig = getPaymentStatusConfig(e.payment_status);
    return (
      <div className="space-y-3">
        {/* Student ID and name */}
        {e.school_student_id && (
          <div className="text-[10px] font-mono text-[#8b7355] dark:text-[#a89880]">
            {e.school_student_id}
          </div>
        )}
        <div className="font-semibold text-[#5d4a3a] dark:text-[#d4c4b0]">
          {e.student_name}
        </div>
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {e.grade && (
            <span
              className="px-1.5 py-0.5 text-[11px] rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(e.grade, e.lang_stream) }}
            >
              {e.grade}{e.lang_stream || ''}
            </span>
          )}
          {e.school && (
            <span className="px-1.5 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
              {e.school}
            </span>
          )}
          {/* Payment status with color coding */}
          {e.payment_status && (
            <span className={cn(
              "px-1.5 py-0.5 text-[11px] rounded",
              paymentConfig.bgTint
            )}>
              {e.payment_status}
            </span>
          )}
        </div>
        {/* Details */}
        <div className="text-xs space-y-1.5 text-[#5d4a3a] dark:text-[#d4c4b0]">
          {(e.assigned_day || e.assigned_time) && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-[#8b7355]" />
              <span>{e.assigned_day} {e.assigned_time}</span>
            </div>
          )}
          {e.tutor_name && (
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-[#8b7355]" />
              <span>{e.tutor_name}</span>
            </div>
          )}
          {e.lessons_paid !== undefined && (
            <div className="flex items-center gap-2">
              <HandCoins className="h-3 w-3 text-[#8b7355]" />
              <span>{e.lessons_paid} lessons paid</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export function CommandPalette() {
  const router = useRouter();
  const { isOpen, close } = useCommandPalette();
  const { isAdmin, isSuperAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const { viewMode, setViewMode } = useRole();
  const { selectedLocation, setSelectedLocation, locations } = useLocation();
  const { showToast } = useToast();

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
        { id: 'filter-scheduled', title: 'Scheduled', icon: Calendar, execute: () => { router.push('/sessions?status=Scheduled'); close(); }},
        { id: 'filter-trial', title: 'Trial Class', icon: Star, execute: () => { router.push('/sessions?status=Trial Class'); close(); }},
        { id: 'filter-makeup-class', title: 'Make-up Class', icon: RefreshCw, execute: () => { router.push('/sessions?status=Make-up Class'); close(); }},
        { id: 'filter-attended', title: 'Attended', icon: CheckCircle, execute: () => { router.push('/sessions?status=Attended'); close(); }},
        { id: 'filter-noshow', title: 'No Show', icon: UserX, execute: () => { router.push('/sessions?status=No Show'); close(); }},
        { id: 'filter-cancelled', title: 'Cancelled', icon: X, execute: () => { router.push('/sessions?status=Cancelled'); close(); }},
        { id: 'filter-pending-makeups', title: 'All Pending Make-ups', icon: Clock, execute: () => { router.push('/sessions?filter=pending-makeups'); close(); }},
      ],
    });

    // Overdue payment filters (all users)
    commands.push({
      id: 'cmd-payments',
      title: 'Overdue Payments',
      icon: DollarSign,
      children: [
        { id: 'pay-all', title: 'All Overdue', icon: DollarSign, execute: () => { router.push('/overdue-payments'); close(); }},
        { id: 'pay-critical', title: 'Critical (30+ days)', icon: AlertCircle, execute: () => { router.push('/overdue-payments?urgency=critical'); close(); }},
        { id: 'pay-high', title: 'High (15-29 days)', icon: AlertCircle, execute: () => { router.push('/overdue-payments?urgency=high'); close(); }},
      ],
    });

    return commands;
  }, [isAdmin, locations, selectedLocation, setSelectedLocation, router, close]);

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
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [previewItem, setPreviewItem] = useState<{ type: string; id: number } | null>(null);
  const [debouncedPreviewItem, setDebouncedPreviewItem] = useState<{ type: string; id: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce preview item to prevent rapid fetches during keyboard navigation
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPreviewItem(previewItem);
    }, 150);
    return () => clearTimeout(timer);
  }, [previewItem]);

  // Fetch preview data based on debounced type (prevents race conditions)
  const { data: previewData, isLoading: previewLoading } = useSWR(
    debouncedPreviewItem ? `preview-${debouncedPreviewItem.type}-${debouncedPreviewItem.id}` : null,
    async () => {
      if (!debouncedPreviewItem) return null;
      if (debouncedPreviewItem.type === 'student') {
        return { type: 'student', data: await studentsAPI.getById(debouncedPreviewItem.id) };
      }
      if (debouncedPreviewItem.type === 'session') {
        return { type: 'session', data: await sessionsAPI.getById(debouncedPreviewItem.id) };
      }
      if (debouncedPreviewItem.type === 'enrollment') {
        return { type: 'enrollment', data: await enrollmentsAPI.getById(debouncedPreviewItem.id) };
      }
      return null;
    },
    { revalidateOnFocus: false }
  );

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
      setCommandPath([]);
      setPreviewItem(null);
      setDebouncedPreviewItem(null);
      setHelpPreview(null);
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
        const data = await api.stats.search(searchTerm, selectedLocation);
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
          items.push({
            id: `student-${s.id}`,
            type: "student",
            title: s.student_name,
            subtitle: [s.school_student_id, s.phone, s.school, s.grade].filter(Boolean).join(" · "),
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

    // Add matching pages using fuzzy search (only if no filter or filter is "page")
    if (!filterType || filterType === "page") {
      const fuseResults = fuse.search(searchTerm);
      const matchedPages = fuseResults
        .filter(r => r.item.itemType === 'page')
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
  }, [results, query, searchTerm, filterType, recentSearches, allPages, fuse, actionCommands, showToast, commandPath, nestedCommands, close]);

  // Index map for O(1) lookup instead of O(n) indexOf
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    allItems.forEach((item, idx) => map.set(item.id, idx));
    return map;
  }, [allItems]);

  // State for help preview (separate from API-fetched preview)
  const [helpPreview, setHelpPreview] = useState<typeof HELP_TOPICS[0] | null>(null);

  // Update preview based on selected item
  useEffect(() => {
    const item = allItems[selectedIndex];

    // Handle help topics (no API fetch needed)
    if (item?.type === 'help') {
      const topic = HELP_TOPICS.find(t => t.id === item.id);
      setHelpPreview(topic || null);
      setPreviewItem(null);
      return;
    }

    setHelpPreview(null);

    // Handle API-fetched previews
    if (item && ['student', 'session', 'enrollment'].includes(item.type)) {
      const entityId = parseInt(item.id.split('-')[1], 10);
      if (!isNaN(entityId)) {
        setPreviewItem({ type: item.type, id: entityId });
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
            } else if ((item.type === "action" || item.type === "utility") && item.execute) {
              // Execute action or utility command (execute handles closing if needed)
              item.execute();
            } else if (item.href) {
              router.push(item.href);
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
          }
          break;
      }
    },
    [allItems, selectedIndex, router, close, query, commandPath]
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
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
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
            placeholder="Search or type ? for help"
            role="combobox"
            aria-expanded={allItems.length > 0}
            aria-controls="command-palette-listbox"
            aria-activedescendant={allItems[selectedIndex]?.id || undefined}
            aria-autocomplete="list"
            aria-label="Search commands and pages"
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
              Ctrl+K
            </kbd>
          </div>
          <button
            onClick={close}
            className="p-1 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] rounded transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Breadcrumb when in nested command submenu */}
        {commandPath.length > 0 && (
          <div className="px-4 py-2 flex items-center gap-2 border-b border-[#e8d4b8] dark:border-[#3d3628] bg-[#f5ede3]/50 dark:bg-[#2d2618]/50">
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
                  <ChevronRight className="h-3 w-3 text-gray-400" />
                  <button
                    onClick={() => {
                      setCommandPath(prev => prev.slice(0, idx + 1));
                      setSelectedIndex(0);
                    }}
                    className="text-xs font-medium text-[#a0704b] dark:text-[#cd853f]"
                  >
                    {cmd?.title}
                  </button>
                </Fragment>
              );
            })}
          </div>
        )}

        {/* Results with Preview Panel */}
        <div className="flex max-h-[50vh] max-sm:max-h-none max-sm:flex-1">
          {/* Results panel */}
          <div
            ref={listRef}
            id="command-palette-listbox"
            role="listbox"
            aria-label="Search results"
            className={cn(
              "overflow-y-auto",
              (debouncedPreviewItem || helpPreview) && !commandPath.length ? "w-[55%] border-r border-[#e8d4b8] dark:border-[#3d3628]" : "w-full"
            )}
          >
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
                Try @student, #session, = calc, or ? for help
              </p>
            </div>
          )}

          {!loading && allItems.length > 0 && query && (
            <div className="py-2">
              {/* Group by type */}
              {["utility", "help", "student", "session", "enrollment", "page"].map((type) => {
                const typeItems = allItems.filter((item) => item.type === type);
                if (typeItems.length === 0) return null;

                const typeLabels: Record<string, string> = {
                  utility: "Result",
                  help: "Help",
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
                      const index = itemIndexMap.get(item.id) ?? 0;
                      const isSelected = index === selectedIndex;

                      return (
                        <button
                          key={item.id}
                          id={item.id}
                          data-index={index}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            if (item.execute) {
                              item.execute();
                              // Note: execute() handles closing if needed
                            } else if (item.href) {
                              router.push(item.href);
                              close();
                            }
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
                          {isSelected && item.type !== 'help' && (
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

          {/* Submenu items when in nested command */}
          {!loading && !query && commandPath.length > 0 && (
            <div className="py-2">
              {allItems.map((item, idx) => {
                const Icon = item.icon;
                const isSelected = idx === selectedIndex;

                return (
                  <button
                    key={item.id}
                    id={item.id}
                    data-index={idx}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      if (item.execute) {
                        item.execute();
                      }
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
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1">
                      {item.title}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state with recent searches and pages when no query */}
          {!loading && !query && commandPath.length === 0 && (
            <div className="py-2">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <>
                  <div className="px-4 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Recent
                      </span>
                    </div>
                    <button
                      onClick={clearAllRecentSearches}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  {recentSearches.map((search, index) => {
                    const isSelected = index === selectedIndex;
                    const recentId = `recent-${search.replace(/\s+/g, '-')}`;
                    return (
                      <div
                        key={`recent-${search}`}
                        id={recentId}
                        role="option"
                        aria-selected={isSelected}
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

              {/* Actions */}
              <div className="px-4 py-1.5 flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-purple-500" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Actions
                </span>
              </div>
              {actionCommands.map((action, idx) => {
                const Icon = action.icon;
                const index = recentSearches.length + idx;
                const isSelected = index === selectedIndex;

                return (
                  <button
                    key={action.id}
                    id={action.id}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      if (action.execute) {
                        action.execute();
                        // Note: execute() handles closing
                      }
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
                          : "text-purple-500 dark:text-purple-400"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {action.title}
                      </span>
                      {action.subtitle && (
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                          {action.subtitle}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <CornerDownLeft className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                );
              })}

              {/* Nested Commands */}
              {nestedCommands.length > 0 && (
                <>
                  <div className="px-4 py-1.5 flex items-center gap-2">
                    <Filter className="h-3 w-3 text-blue-500" />
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Commands
                    </span>
                  </div>
                  {nestedCommands.map((cmd, idx) => {
                    const Icon = cmd.icon;
                    const index = recentSearches.length + actionCommands.length + idx;
                    const isSelected = index === selectedIndex;

                    return (
                      <button
                        key={cmd.id}
                        id={cmd.id}
                        data-index={index}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setCommandPath([cmd.id]);
                          setSelectedIndex(0);
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
                              : "text-blue-500 dark:text-blue-400"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {cmd.title}
                          </span>
                          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                            {cmd.children?.length || 0} options
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      </button>
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
                const index = recentSearches.length + actionCommands.length + nestedCommands.length + idx;
                const isSelected = index === selectedIndex;

                return (
                  <button
                    key={action.id}
                    id={action.id}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
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
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1">
                      {action.title}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                );
              })}

              {/* Quick Navigation */}
              <div className="px-4 py-1.5 flex items-center gap-2">
                <Grid3x3 className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Pages
                </span>
              </div>
              {allPages.map((page, idx) => {
                const Icon = page.icon;
                const index = recentSearches.length + actionCommands.length + nestedCommands.length + QUICK_ACTIONS.length + idx;
                const isSelected = index === selectedIndex;
                // Check if this is an admin page for special styling
                const isAdminPage = page.id.startsWith("page-renewals") ||
                                    page.id.startsWith("page-extensions") ||
                                    page.id.startsWith("page-debug");

                return (
                  <button
                    key={page.id}
                    id={page.id}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
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
                          : isAdminPage
                          ? "text-amber-500 dark:text-amber-400"
                          : "text-gray-400 dark:text-gray-500"
                      )}
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1">
                      {page.title}
                    </span>
                    {isAdminPage && (
                      <Shield className="h-3 w-3 text-amber-500 dark:text-amber-400" />
                    )}
                    {isSelected && (
                      <CornerDownLeft className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          </div>

          {/* Preview panel - desktop only */}
          {(debouncedPreviewItem || helpPreview) && !commandPath.length && (
            <div className="hidden sm:block w-[45%] p-4 overflow-y-auto bg-[#fef9f3]/50 dark:bg-[#1a1a1a]/50">
              {helpPreview ? (
                <HelpPreview topic={helpPreview} />
              ) : previewLoading ? (
                <PreviewSkeleton />
              ) : (
                <PreviewContent data={previewData ?? null} />
              )}
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
            <span className="flex items-center gap-1">
              <span className="text-[10px]">?</span>
              Help
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
