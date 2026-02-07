import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  Wallet,
  MapPin,
  GraduationCap,
  BookOpen,
  ArrowLeftRight,
  ThumbsDown,
  Users,
  HelpCircle,
} from "lucide-react";

export const TERMINATION_REASON_CATEGORIES = [
  "Scheduling conflict",
  "Financial reasons",
  "Relocated",
  "Academic goals met",
  "Focusing on other subjects",
  "Switched to competitor",
  "Lost interest",
  "Parent decision",
  "Other",
] as const;

export type TerminationReasonCategory = typeof TERMINATION_REASON_CATEGORIES[number];

export interface CategoryConfig {
  color: string;
  darkColor: string;
  Icon: LucideIcon;
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  "Scheduling conflict":       { color: "#d97706", darkColor: "#fbbf24", Icon: Calendar },
  "Financial reasons":         { color: "#dc2626", darkColor: "#f87171", Icon: Wallet },
  "Relocated":                 { color: "#2563eb", darkColor: "#60a5fa", Icon: MapPin },
  "Academic goals met":        { color: "#16a34a", darkColor: "#4ade80", Icon: GraduationCap },
  "Focusing on other subjects":{ color: "#9333ea", darkColor: "#c084fc", Icon: BookOpen },
  "Switched to competitor":    { color: "#ea580c", darkColor: "#fb923c", Icon: ArrowLeftRight },
  "Lost interest":             { color: "#64748b", darkColor: "#94a3b8", Icon: ThumbsDown },
  "Parent decision":           { color: "#0891b2", darkColor: "#22d3ee", Icon: Users },
  "Other":                     { color: "#78716c", darkColor: "#a8a29e", Icon: HelpCircle },
};

/** Get the color for a category, with optional dark mode support */
export function getCategoryColor(category: string, isDark = false): string {
  const config = CATEGORY_CONFIG[category];
  if (!config) return isDark ? "#a8a29e" : "#78716c";
  return isDark ? config.darkColor : config.color;
}
