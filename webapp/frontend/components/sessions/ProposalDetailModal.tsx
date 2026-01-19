"use client";

import { Modal } from "@/components/ui/modal";
import { ProposalCardFull } from "@/components/proposals/ProposalCardFull";
import type { MakeupProposal } from "@/types";
import { CalendarClock } from "lucide-react";

interface ProposalDetailModalProps {
  proposal: MakeupProposal | null;
  currentTutorId: number;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal wrapper for viewing proposal details from session views.
 * Uses the full ProposalCardFull component for displaying and interacting
 * with the proposal.
 */
export function ProposalDetailModal({
  proposal,
  currentTutorId,
  isOpen,
  onClose,
}: ProposalDetailModalProps) {
  if (!proposal) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <span>Make-up Proposal</span>
        </div>
      }
    >
      <ProposalCardFull
        proposal={proposal}
        currentTutorId={currentTutorId}
        defaultExpanded={true}
        className="border-0 shadow-none bg-transparent"
      />
    </Modal>
  );
}
