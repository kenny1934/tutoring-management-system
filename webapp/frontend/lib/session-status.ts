import {
  Clock,
  CheckCircle,
  CheckCircle2,
  PencilLine,
  AlertTriangle,
  Loader2,
  FlaskConical,
  XCircle,
  UserX,
  Circle,
  type LucideIcon,
} from "lucide-react";

interface SessionStatusConfig {
  bgClass: string;
  bgTint: string;
  textClass: string;
  Icon: LucideIcon;
  iconClass?: string; // Custom icon color class
  strikethrough?: boolean;
}

export const getSessionStatusConfig = (status: string | undefined): SessionStatusConfig => {
  const s = status || "";

  // Check suffix patterns first (for wildcard statuses like "Rescheduled - Pending Make-up")
  if (s.endsWith("- Pending Make-up")) {
    return { bgClass: "bg-orange-500", bgTint: "bg-orange-50/80 dark:bg-orange-900/20", textClass: "text-orange-600 dark:text-orange-400", Icon: AlertTriangle, strikethrough: true };
  }
  if (s.endsWith("- Make-up Booked")) {
    return { bgClass: "bg-gray-400", bgTint: "bg-gray-100/80 dark:bg-gray-800/20", textClass: "text-gray-500 dark:text-gray-400", Icon: Loader2, strikethrough: true };
  }

  // Exact matches
  const config: Record<string, SessionStatusConfig> = {
    "Scheduled": { bgClass: "bg-sky-400", bgTint: "bg-sky-50/80 dark:bg-sky-900/20", textClass: "text-sky-600 dark:text-sky-400", Icon: Clock },
    "Attended": { bgClass: "bg-green-600", bgTint: "bg-green-50/80 dark:bg-green-900/20", textClass: "text-green-600 dark:text-green-400", Icon: CheckCircle },
    "Attended (Make-up)": { bgClass: "bg-green-600", bgTint: "bg-green-50/80 dark:bg-green-900/20", textClass: "text-green-600 dark:text-green-400", Icon: CheckCircle2, iconClass: "text-yellow-300" },
    "Make-up Class": { bgClass: "bg-yellow-500", bgTint: "bg-yellow-50/80 dark:bg-yellow-900/20", textClass: "text-yellow-600 dark:text-yellow-400", Icon: PencilLine },
    "Trial Class": { bgClass: "bg-blue-500", bgTint: "bg-blue-50/80 dark:bg-blue-900/20", textClass: "text-blue-600 dark:text-blue-400", Icon: FlaskConical },
    "Cancelled": { bgClass: "bg-red-500", bgTint: "bg-red-50/80 dark:bg-red-900/20", textClass: "text-red-500 dark:text-red-400", Icon: XCircle, strikethrough: true },
    "No Show": { bgClass: "bg-red-500", bgTint: "bg-red-50/80 dark:bg-red-900/20", textClass: "text-red-500 dark:text-red-400", Icon: UserX, strikethrough: true },
  };

  return config[s] || { bgClass: "bg-[#d4a574]", bgTint: "bg-amber-50/80 dark:bg-amber-900/20", textClass: "text-amber-700 dark:text-amber-400", Icon: Circle };
};

/**
 * Returns sort order for session statuses (lower = higher priority)
 */
export const getStatusSortOrder = (status: string | undefined): number => {
  const s = status || "";

  // Exact matches first
  const exactOrder: Record<string, number> = {
    "Trial Class": 1,
    "Scheduled": 2,
    "Make-up Class": 3,
    "Attended": 4,
    "Attended (Make-up)": 5,
    "No Show": 6,
    "Rescheduled - Pending Make-up": 7,
    "Sick Leave - Pending Make-up": 8,
    "Weather Cancelled - Pending Make-up": 9,
    "Rescheduled - Make-up Booked": 10,
    "Sick Leave - Make-up Booked": 11,
    "Weather Cancelled - Make-up Booked": 12,
    "Cancelled": 13,
  };

  if (exactOrder[s] !== undefined) {
    return exactOrder[s];
  }

  // Fallback for any unrecognized status
  return 99;
};
