"use client";

import { cn } from "@/lib/utils";
import {
  Phone,
  MessageCircle,
  TrendingUp,
  AlertTriangle,
  CalendarCheck
} from "lucide-react";

// Contact method and type constants
export const CONTACT_METHODS = ['WeChat', 'Phone', 'In-Person'] as const;

export type ContactMethod = typeof CONTACT_METHODS[number];

/**
 * Everything the app knows about a kind of contact, in one place.
 *
 * This list used to be written out by hand in seven: the dropdown, the icon
 * lookup, the badge colours, the calendar's legend, the calendar filter's
 * starting state, the statistics bar and a query in the backend. Adding a type
 * meant finding all seven, and missing the calendar filter was the quiet one,
 * because a type left out of that starting set has its contacts filtered off
 * the calendar with nothing on screen to say why.
 *
 * Declaration order is the order the dropdown and the legend read in.
 */
export const CONTACT_TYPE_META = {
  'Progress Update': {
    short: 'Progress',
    dot: 'bg-blue-500',
    badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    Icon: TrendingUp,
  },
  'Concern': {
    short: 'Concern',
    dot: 'bg-orange-500',
    badge: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    Icon: AlertTriangle,
  },
  'General': {
    short: 'General',
    dot: 'bg-gray-500',
    badge: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400',
    Icon: MessageCircle,
  },
  // Chasing a family about the next intake. Its own type because the retention
  // board has to tell a renewal chase from a call about homework, and once two
  // intakes of contacts are in the table that cannot be worked out afterwards.
  'Course Renewal': {
    short: 'Renewal',
    dot: 'bg-sky-500',
    badge: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
    Icon: CalendarCheck,
  },
} as const;

export type ContactType = keyof typeof CONTACT_TYPE_META;

/** Named rather than spelled out at each call site, because the retention
 *  board, the tutor's own renewal list and the bulk dialog all have to agree
 *  on it for the records to be worth anything. */
export const RENEWAL_CONTACT_TYPE: ContactType = 'Course Renewal';

export const CONTACT_TYPES = Object.keys(CONTACT_TYPE_META) as ContactType[];

/** The three types the database still carries but the app has never offered
 *  can arrive on an old row, so everything here falls back rather than
 *  rendering blank. */
const UNKNOWN_TYPE = {
  short: 'Other',
  dot: 'bg-gray-500',
  badge: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400',
  Icon: MessageCircle,
} as const;

export function contactTypeMeta(type: string) {
  return CONTACT_TYPE_META[type as ContactType] ?? UNKNOWN_TYPE;
}

// Custom WeChat icon SVG
export const WeChatIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.111.24-.247 0-.06-.024-.12-.04-.178l-.326-1.233a.49.49 0 0 1 .178-.553c1.527-1.122 2.5-2.782 2.5-4.622 0-3.105-3.05-5.924-7.059-6.119zm-2.07 2.867c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.14 0c.535 0 .969.44.969.982a.976.976 0 0 1-.97.983.976.976 0 0 1-.968-.983c0-.542.434-.982.969-.982z"/>
  </svg>
);

// Custom In-Person icon SVG (two people meeting)
export const InPersonIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="7" cy="6" r="3" />
    <circle cx="17" cy="6" r="3" />
    <path d="M2 20c0-3.5 2.5-6 5-6s5 2.5 5 6" />
    <path d="M12 20c0-3.5 2.5-6 5-6s5 2.5 5 6" />
  </svg>
);

// Get icon for contact method
export function getMethodIcon(method: string, size: string = "h-4 w-4") {
  switch (method) {
    case 'WeChat':
      return <WeChatIcon className={cn(size, "text-green-600")} />;
    case 'Phone':
      return <Phone className={cn(size, "text-blue-600")} />;
    case 'In-Person':
      return <InPersonIcon className={cn(size, "text-purple-600")} />;
    default:
      return <MessageCircle className={size} />;
  }
}

// Get icon for contact type
export function getContactTypeIcon(type: string, size: string = "h-3 w-3") {
  const { Icon } = contactTypeMeta(type);
  return <Icon className={size} />;
}

// Get color classes for contact type badge
export function getContactTypeColor(type: string) {
  return contactTypeMeta(type).badge;
}

/** The filled dot the calendar and the statistics bar identify a type by. */
export function getContactTypeDot(type: string) {
  return contactTypeMeta(type).dot;
}
