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
  Icon: LucideIcon;
  strikethrough?: boolean;
}

export const getSessionStatusConfig = (status: string | undefined): SessionStatusConfig => {
  const s = status || "";

  // Check suffix patterns first (for wildcard statuses like "Rescheduled - Pending Make-up")
  if (s.endsWith("- Pending Make-up")) {
    return { bgClass: "bg-orange-500", Icon: AlertTriangle, strikethrough: true };
  }
  if (s.endsWith("- Make-up Booked")) {
    return { bgClass: "bg-gray-400", Icon: Loader2, strikethrough: true };
  }

  // Exact matches
  const config: Record<string, SessionStatusConfig> = {
    "Scheduled": { bgClass: "bg-sky-400", Icon: Clock },
    "Attended": { bgClass: "bg-green-600", Icon: CheckCircle },
    "Attended (Make-up)": { bgClass: "bg-green-600", Icon: CheckCircle2 },
    "Make-up Class": { bgClass: "bg-yellow-500", Icon: PencilLine },
    "Trial Class": { bgClass: "bg-blue-500", Icon: FlaskConical },
    "Cancelled": { bgClass: "bg-red-500", Icon: XCircle, strikethrough: true },
    "No Show": { bgClass: "bg-red-500", Icon: UserX, strikethrough: true },
  };

  return config[s] || { bgClass: "bg-[#d4a574]", Icon: Circle };
};
