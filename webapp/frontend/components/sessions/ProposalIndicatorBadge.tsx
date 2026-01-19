"use client";

import { cn } from "@/lib/utils";
import { getProposalIndicatorConfig } from "@/lib/session-status";
import { getPendingSlotCount } from "@/lib/proposal-utils";
import type { MakeupProposal } from "@/types";
import { ChevronRight } from "lucide-react";

interface ProposalIndicatorBadgeProps {
  proposal: MakeupProposal;
  onClick: (e: React.MouseEvent) => void;
  size?: "sm" | "md";
  showArrow?: boolean;
}

/**
 * Badge component shown on sessions that have active proposals.
 * Displays the number of pending slots and is clickable to open the proposal.
 */
export function ProposalIndicatorBadge({
  proposal,
  onClick,
  size = "md",
  showArrow = true,
}: ProposalIndicatorBadgeProps) {
  const slotCount = getPendingSlotCount(proposal);

  // Don't render if no pending slots
  if (slotCount === 0) return null;

  const config = getProposalIndicatorConfig(slotCount);
  const Icon = config.Icon;
  const isSmall = size === "sm";

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded font-medium",
        "transition-all hover:shadow-sm",
        "focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1",
        config.className,
        isSmall ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-xs"
      )}
    >
      <Icon className={cn(config.iconClassName, isSmall ? "h-3 w-3" : "h-3.5 w-3.5")} />
      <span>{config.badgeText}</span>
      {showArrow && (
        <ChevronRight className={cn("text-amber-600 dark:text-amber-400", isSmall ? "h-2.5 w-2.5" : "h-3 w-3")} />
      )}
    </button>
  );
}

/**
 * Compact inline version for use in grid views where space is limited
 */
export function ProposalIndicatorDot({
  proposal,
  onClick,
}: {
  proposal: MakeupProposal;
  onClick: (e: React.MouseEvent) => void;
}) {
  const slotCount = getPendingSlotCount(proposal);

  if (slotCount === 0) return null;

  const config = getProposalIndicatorConfig(slotCount);
  const Icon = config.Icon;

  return (
    <button
      onClick={onClick}
      title={config.badgeText}
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        "transition-all hover:scale-110",
        "focus:outline-none focus:ring-2 focus:ring-amber-400",
        "w-5 h-5",
        config.className
      )}
    >
      <Icon className={cn(config.iconClassName, "h-3 w-3")} />
    </button>
  );
}

/**
 * Mini indicator for very compact spaces (just a colored dot with count)
 */
export function ProposalIndicatorMini({
  proposal,
  onClick,
}: {
  proposal: MakeupProposal;
  onClick: (e: React.MouseEvent) => void;
}) {
  const slotCount = getPendingSlotCount(proposal);

  if (slotCount === 0) return null;

  return (
    <button
      onClick={onClick}
      title={`${slotCount} slot${slotCount !== 1 ? 's' : ''} proposed`}
      className={cn(
        "inline-flex items-center justify-center",
        "rounded-full bg-amber-400 dark:bg-amber-500",
        "text-[8px] font-bold text-white",
        "min-w-[14px] h-[14px] px-1",
        "transition-all hover:scale-110",
        "focus:outline-none focus:ring-2 focus:ring-amber-400"
      )}
    >
      {slotCount}
    </button>
  );
}
