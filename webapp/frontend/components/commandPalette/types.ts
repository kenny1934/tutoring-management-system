import {
  Home,
  User,
  Calendar,
  BookOpen,
  Inbox,
  RefreshCw,
  Settings,
  GraduationCap,
  DollarSign,
  Star,
  Phone,
  AlertCircle,
  UserX,
  RefreshCcw,
  Clock,
  Database,
  Grid3x3,
  ClipboardCheck,
  Sparkles,
} from "lucide-react";

// localStorage keys
export const RECENT_SEARCHES_KEY = "command-palette-recent-searches";
export const MAX_RECENT_SEARCHES = 5;

// Icon type for reuse
export type IconType = typeof Home;

// Page/action item type
export interface PageItem {
  id: string;
  title: string;
  href: string;
  icon: IconType;
}

// Result item type for unified list
export interface ResultItem {
  id: string;
  type: "student" | "session" | "enrollment" | "page" | "recent" | "action" | "utility" | "help";
  title: string;
  subtitle?: string;
  href?: string;
  icon: IconType;
  execute?: () => void;
}

// Nested command interface
export interface NestedCommand {
  id: string;
  title: string;
  icon: IconType;
  children?: NestedCommand[];
  execute?: () => void;
}

// Help topic interface
export interface HelpTopic {
  id: string;
  title: string;
  keywords: string[];
  content: Array<{
    label: string;
    desc: string;
  }>;
}

// Quick navigation pages
export const PAGES: PageItem[] = [
  // Core pages
  { id: "page-dashboard", title: "Dashboard", href: "/", icon: Home },
  { id: "page-students", title: "Students", href: "/students", icon: User },
  { id: "page-sessions", title: "Sessions", href: "/sessions", icon: Calendar },
  { id: "page-courseware", title: "Courseware", href: "/courseware", icon: BookOpen },
  // High frequency
  { id: "page-inbox", title: "Inbox", href: "/inbox", icon: Inbox },
  { id: "page-proposals", title: "Make-up Proposals", href: "/proposals", icon: RefreshCw },
  { id: "page-settings", title: "Settings", href: "/settings", icon: Settings },
  { id: "page-whats-new", title: "What's New", href: "/whats-new", icon: Sparkles },
  // Business pages
  { id: "page-exams", title: "Exam Schedules", href: "/exams", icon: GraduationCap },
  { id: "page-revenue", title: "Revenue Reports", href: "/revenue", icon: DollarSign },
  { id: "page-trials", title: "Trial Sessions", href: "/trials", icon: Star },
  { id: "page-parent-contacts", title: "Parent Contacts", href: "/parent-contacts", icon: Phone },
  { id: "page-overdue", title: "Overdue Payments", href: "/overdue-payments", icon: AlertCircle },
  { id: "page-terminated", title: "Terminated Students", href: "/terminated-students", icon: UserX },
];

// Admin-only pages
export const ADMIN_PAGES: PageItem[] = [
  { id: "page-renewals", title: "Admin: Renewals", href: "/admin/renewals", icon: RefreshCcw },
  { id: "page-extensions", title: "Admin: Extensions", href: "/admin/extensions", icon: Clock },
];

// Super-admin only
export const SUPER_ADMIN_PAGES: PageItem[] = [
  { id: "page-debug", title: "Admin: Debug Panel", href: "/admin/debug", icon: Database },
];

// Quick actions (session-focused)
export const QUICK_ACTIONS: PageItem[] = [
  { id: "action-quick-attend", title: "Quick Attend", href: "/quick-attend", icon: ClipboardCheck },
  { id: "action-today", title: "Today's Sessions", href: "/sessions", icon: Calendar },
  { id: "action-week", title: "This Week's Sessions", href: "/sessions?view=week", icon: Grid3x3 },
  { id: "action-makeups", title: "Pending Make-ups", href: "/sessions?filter=pending-makeups", icon: RefreshCw },
];

// Type badge colors
export const typeBadgeColors: Record<string, string> = {
  student: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  session: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  enrollment: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  page: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  utility: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  help: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
};

// Help topics for ? prefix search
export const HELP_TOPICS: HelpTopic[] = [
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
