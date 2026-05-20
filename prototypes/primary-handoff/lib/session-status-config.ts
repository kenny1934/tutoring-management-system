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
import type { SessionStatusValue } from "./types";

/** Visual config for one session_status value. Mirrors CSM's
 *  `lib/session-status.ts` getSessionStatusConfig so the prototype reads
 *  the same way visually. */
export type SessionStatusConfig = {
  /** Right-edge color stripe background (solid). */
  stripeClass: string;
  /** Faint card-tint background. */
  tintClass: string;
  /** Status text color. */
  textClass: string;
  Icon: LucideIcon;
  /** Override icon color (otherwise white on the stripe). */
  iconClass?: string;
  /** Render status text + names with a strikethrough. */
  strikethrough?: boolean;
  /** Visually de-emphasize the whole card (0–1). */
  opacity?: number;
};

const DEFAULT_CONFIG: SessionStatusConfig = {
  stripeClass: "bg-gray-400",
  tintClass: "bg-gray-50",
  textClass: "text-gray-600",
  Icon: Circle,
};

export function getSessionStatusConfig(
  status: SessionStatusValue | string | undefined
): SessionStatusConfig {
  const s = status ?? "";

  if (s.endsWith("- Pending Make-up")) {
    return {
      stripeClass: "bg-orange-500",
      tintClass: "bg-orange-50/50",
      textClass: "text-orange-600",
      Icon: AlertTriangle,
      strikethrough: true,
      opacity: 0.85,
    };
  }
  if (s.endsWith("- Make-up Booked")) {
    return {
      stripeClass: "bg-gray-400",
      tintClass: "bg-gray-100/60",
      textClass: "text-gray-500",
      Icon: Loader2,
      strikethrough: true,
      opacity: 0.65,
    };
  }

  switch (s) {
    case "Scheduled":
      return {
        stripeClass: "bg-sky-400",
        tintClass: "bg-sky-50/50",
        textClass: "text-sky-600",
        Icon: Clock,
      };
    case "Attended":
      return {
        stripeClass: "bg-green-600",
        tintClass: "bg-green-50/50",
        textClass: "text-green-600",
        Icon: CheckCircle,
      };
    case "Attended (Make-up)":
      return {
        stripeClass: "bg-green-600",
        tintClass: "bg-green-50/50",
        textClass: "text-green-600",
        Icon: CheckCircle2,
        iconClass: "text-yellow-300",
      };
    case "Make-up Class":
      return {
        stripeClass: "bg-yellow-500",
        tintClass: "bg-yellow-50/50",
        textClass: "text-yellow-700",
        Icon: PencilLine,
      };
    case "Trial Class":
      return {
        stripeClass: "bg-blue-500",
        tintClass: "bg-blue-50/50",
        textClass: "text-blue-600",
        Icon: FlaskConical,
      };
    case "Cancelled":
      return {
        stripeClass: "bg-red-500",
        tintClass: "bg-red-50/50",
        textClass: "text-red-500",
        Icon: XCircle,
        strikethrough: true,
      };
    case "No Show":
      return {
        stripeClass: "bg-red-500",
        tintClass: "bg-red-50/50",
        textClass: "text-red-500",
        Icon: UserX,
        strikethrough: true,
      };
    default:
      return DEFAULT_CONFIG;
  }
}
