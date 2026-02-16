import type { Message, MessageCreate, MessageCategory } from "@/types";
import {
  Inbox,
  Send,
  Archive,
  Star,
  AtSign,
  Clock,
  AlarmClock,
  Bell,
  HelpCircle,
  Megaphone,
  Calendar,
  MessageCircle,
  BookOpen,
  CalendarClock,
  MessageSquarePlus,
} from "lucide-react";

export interface Category {
  id: string;
  label: string;
  icon: React.ReactNode;
  filter?: MessageCategory;
}

export interface CategorySection {
  id: string;
  label?: string;
  collapsible?: boolean;
  items: Category[];
}

export const CATEGORY_SECTIONS: CategorySection[] = [
  {
    id: "mailboxes",
    items: [
      { id: "inbox", label: "Inbox", icon: <Inbox className="h-4 w-4" /> },
      { id: "sent", label: "Sent", icon: <Send className="h-4 w-4" /> },
      { id: "archived", label: "Archived", icon: <Archive className="h-4 w-4" /> },
    ],
  },
  {
    id: "views",
    items: [
      { id: "starred", label: "Starred", icon: <Star className="h-4 w-4" /> },
      { id: "mentions", label: "Mentions", icon: <AtSign className="h-4 w-4" /> },
      { id: "scheduled", label: "Send Later", icon: <Clock className="h-4 w-4" /> },
      { id: "reminders", label: "Snoozed", icon: <AlarmClock className="h-4 w-4" /> },
    ],
  },
  {
    id: "tags",
    label: "Tags",
    collapsible: true,
    items: [
      { id: "reminder", label: "Reminder", icon: <Bell className="h-4 w-4" />, filter: "Reminder" },
      { id: "question", label: "Question", icon: <HelpCircle className="h-4 w-4" />, filter: "Question" },
      { id: "announcement", label: "Announcement", icon: <Megaphone className="h-4 w-4" />, filter: "Announcement" },
      { id: "schedule", label: "Schedule", icon: <Calendar className="h-4 w-4" />, filter: "Schedule" },
      { id: "chat", label: "Chat", icon: <MessageCircle className="h-4 w-4" />, filter: "Chat" },
      { id: "courseware", label: "Courseware", icon: <BookOpen className="h-4 w-4" />, filter: "Courseware" },
      { id: "makeup-confirmation", label: "Make-up", icon: <CalendarClock className="h-4 w-4" />, filter: "MakeupConfirmation" },
      { id: "feedback", label: "Feedback", icon: <MessageSquarePlus className="h-4 w-4" />, filter: "Feedback" },
    ],
  },
];

export const CATEGORIES: Category[] = CATEGORY_SECTIONS.flatMap(s => s.items);

export type PriorityLevel = "Normal" | "High" | "Urgent";
export const PRIORITIES: Record<PriorityLevel, { label: string; textClass: string; badgeClass: string; borderClass: string }> = {
  Normal: {
    label: "Normal",
    textClass: "text-gray-600 dark:text-gray-400",
    badgeClass: "text-gray-600 dark:text-gray-400",
    borderClass: "",
  },
  High: {
    label: "High",
    textClass: "text-orange-600 dark:text-orange-400",
    badgeClass: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30",
    borderClass: "border-l-4 border-l-orange-400",
  },
  Urgent: {
    label: "Urgent",
    textClass: "text-red-600 dark:text-red-400",
    badgeClass: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30",
    borderClass: "border-l-4 border-l-red-500",
  },
};

// --- Shared helper functions ---

export function formatSnoozeUntil(isoDate: string): string {
  const date = new Date(isoDate.endsWith("Z") ? isoDate : isoDate + "Z");
  const now = new Date();
  if (date.getTime() <= now.getTime()) return "Reminder due";

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) return `Today ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function formatScheduledAt(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `today ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDay.getTime() === today.getTime()) return "Today";
  if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";

  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function computeReplyRecipients(msg: Message, currentTutorId: number): Pick<MessageCreate, 'to_tutor_id' | 'to_tutor_ids'> {
  if (msg.is_group_message && msg.to_tutor_ids) {
    const replyRecipients = msg.to_tutor_ids.filter(id => id !== currentTutorId);
    if (msg.from_tutor_id !== currentTutorId && !replyRecipients.includes(msg.from_tutor_id))
      replyRecipients.push(msg.from_tutor_id);
    if (replyRecipients.length === 1) return { to_tutor_id: replyRecipients[0] };
    if (replyRecipients.length >= 2) return { to_tutor_ids: replyRecipients };
    return {};
  }
  if (msg.from_tutor_id === currentTutorId) return msg.to_tutor_id != null ? { to_tutor_id: msg.to_tutor_id } : {};
  return { to_tutor_id: msg.from_tutor_id };
}
