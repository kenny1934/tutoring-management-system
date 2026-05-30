"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, KeyboardEvent, MouseEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface TutorLinkProps {
  /** Numeric tutor id. When absent (or viewer can't see admin pages) the name renders as plain text. */
  tutorId?: number | null;
  /** Tutor name to display. Used as the label when `children` is not provided. */
  tutorName?: string | null;
  /** Override the rendered label (e.g. first-name-only views). Falls back to `tutorName`. */
  children?: ReactNode;
  /** Shown when there is no name/children to display. */
  fallback?: string;
  /** Class names applied to both the link and the plain-text span so call sites keep their own sizing/colour. */
  className?: string;
}

/**
 * Renders a tutor's name. For admin-capable viewers (Admin / Super Admin / Supervisor)
 * with a known tutor id, it becomes a clickable link to the tutor detail page at
 * /admin/tutors/[id]. Everyone else (and any name without an id) sees plain text —
 * matching the page's own AdminPageGuard so a link only appears when its destination
 * is reachable.
 *
 * Implemented as a <span role="link"> driven by router.push rather than an <a>, because
 * many call sites (session rows, enrollment rows, dashboard cards) are themselves wrapped
 * in a <Link>; a nested <a> would be invalid HTML and break hydration. The click stops
 * propagation so the surrounding row's onClick/navigation doesn't also fire.
 */
export function TutorLink({ tutorId, tutorName, children, fallback = "—", className }: TutorLinkProps) {
  const { canViewAdminPages } = useAuth();
  const router = useRouter();

  const hasLabel = children != null || (tutorName != null && tutorName !== "");
  const label = children ?? tutorName ?? fallback;

  if (!canViewAdminPages || !tutorId || !hasLabel) {
    return <span className={className}>{label}</span>;
  }

  const go = () => router.push(`/admin/tutors/${tutorId}`);

  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        go();
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          e.preventDefault();
          go();
        }
      }}
      className={cn("cursor-pointer hover:underline underline-offset-2", className)}
    >
      {label}
    </span>
  );
}
