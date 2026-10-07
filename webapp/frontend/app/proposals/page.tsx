"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useProposals, usePageTitle } from "@/lib/hooks";
import { ProposalCardFull } from "@/components/proposals/ProposalCardFull";
import { ScheduleMakeupModal } from "@/components/sessions/ScheduleMakeupModal";
import { PageSurface } from "@/components/layout/PageSurface";
import { PageTransition } from "@/lib/design-system";
import { EmptyCloud } from "@/components/illustrations/EmptyStates";
import { useAuth } from "@/contexts/AuthContext";
import type { MakeupProposal, ProposalStatus } from "@/types";
import {
  CalendarClock,
  ArrowLeft,
  Inbox,
  Send,
  Filter,
  Search,
  Clock,
  Check,
  X,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, Input, Segmented } from "@/components/controls";

type TabType = "for-me" | "by-me" | "all";

function ProposalCardSkeleton() {
  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-line border-l-4 border-l-gray-200 dark:border-l-gray-700 overflow-hidden">
      <div className="px-5 py-4 bg-[#faf6f1] dark:bg-[#2d2820]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="h-9 w-9 shimmer-sepia rounded-lg flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="h-5 w-16 shimmer-sepia rounded-full" />
                <div className="h-4 w-16 shimmer-sepia rounded" />
                <div className="h-4 w-28 shimmer-sepia rounded" />
                <div className="h-5 w-8 shimmer-sepia rounded" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-28 shimmer-sepia rounded" />
                <div className="h-3 w-20 shimmer-sepia rounded" />
                <div className="h-3 w-16 shimmer-sepia rounded" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="h-6 w-20 shimmer-sepia rounded-full hidden sm:block" />
            <div className="h-5 w-5 shimmer-sepia rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProposalListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => <ProposalCardSkeleton key={i} />)}
    </div>
  );
}

// Status filter options
const statusFilters: { value: ProposalStatus | "all"; label: string; icon: LucideIcon; iconClassName?: string }[] = [
  { value: "all", label: "All", icon: Filter },
  { value: "pending", label: "Pending", icon: Clock, iconClassName: "text-amber-700 dark:text-amber-400" },
  { value: "approved", label: "Approved", icon: Check, iconClassName: "text-green-700 dark:text-green-400" },
  { value: "rejected", label: "Rejected", icon: X, iconClassName: "text-red-600 dark:text-red-400" },
];

export default function ProposalsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAdmin, isImpersonating, impersonatedTutor, effectiveRole } = useAuth();

  usePageTitle("Make-up proposals");

  // Current tutor ID for proposal actions (respects impersonation)
  const currentTutorId = useMemo(() => {
    if (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id) {
      return impersonatedTutor.id;
    }
    return user?.id;
  }, [user?.id, isImpersonating, effectiveRole, impersonatedTutor?.id]);

  // State
  const [activeTab, setActiveTab] = useState<TabType>("for-me");
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [selectedProposal, setSelectedProposal] = useState<MakeupProposal | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [highlightedProposalId, setHighlightedProposalId] = useState<number | null>(null);

  // Handle URL param for specific proposal
  useEffect(() => {
    const idParam = searchParams.get("id");
    const tabParam = searchParams.get("tab");

    if (tabParam === "by-me" || tabParam === "for-me" || tabParam === "all") {
      setActiveTab(tabParam);
    }

    // If specific proposal ID is requested, highlight it
    if (idParam) {
      setHighlightedProposalId(parseInt(idParam, 10));
      // Clear status filter to show all proposals when navigating to specific one
      setStatusFilter("all");
    }
  }, [searchParams]);

  // Fetch proposals
  const { data: proposalsForMe = [], isLoading: loadingForMe } = useProposals({
    tutorId: currentTutorId,
    status: statusFilter === "all" ? undefined : statusFilter,
    includeSession: true,
  });

  const { data: proposalsByMe = [], isLoading: loadingByMe } = useProposals({
    proposedBy: currentTutorId,
    status: statusFilter === "all" ? undefined : statusFilter,
    includeSession: true,
  });

  const { data: allProposals = [], isLoading: loadingAll } = useProposals(
    isAdmin ? {
      status: statusFilter === "all" ? undefined : statusFilter,
      includeSession: true,
    } : null
  );

  // Filter and sort proposals
  const filteredProposals = useMemo(() => {
    let proposals = activeTab === "for-me" ? proposalsForMe : activeTab === "by-me" ? proposalsByMe : allProposals;

    // Filter by search (student, proposer, target tutors, original tutor)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      proposals = proposals.filter((p) => {
        const studentName = p.original_session?.student_name?.toLowerCase() || "";
        const studentId = p.original_session?.school_student_id?.toLowerCase() || "";
        const proposerName = p.proposed_by_tutor_name?.toLowerCase() || "";
        const originalTutor = p.original_session?.tutor_name?.toLowerCase() || "";
        const slotTutorNames = p.slots?.map(s => s.proposed_tutor_name?.toLowerCase() || "").join(" ") || "";
        return studentName.includes(query) || studentId.includes(query) ||
               proposerName.includes(query) || originalTutor.includes(query) || slotTutorNames.includes(query);
      });
    }

    // Sort by created_at
    return [...proposals].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
  }, [activeTab, proposalsForMe, proposalsByMe, allProposals, searchQuery, sortOrder]);

  const isLoading = activeTab === "for-me" ? loadingForMe : activeTab === "by-me" ? loadingByMe : loadingAll;

  // Auto-switch tab and scroll to highlighted proposal
  useEffect(() => {
    if (highlightedProposalId && !loadingForMe && !loadingByMe && !loadingAll) {
      const inForMe = proposalsForMe.some((p) => p.id === highlightedProposalId);
      const inByMe = proposalsByMe.some((p) => p.id === highlightedProposalId);
      const inAll = allProposals.some((p) => p.id === highlightedProposalId);

      if (inForMe && activeTab !== "for-me") {
        setActiveTab("for-me");
      } else if (inByMe && !inForMe && activeTab !== "by-me") {
        setActiveTab("by-me");
      } else if (inAll && !inForMe && !inByMe && activeTab !== "all") {
        setActiveTab("all");
      }

      // Scroll to the proposal after a short delay
      setTimeout(() => {
        const element = document.getElementById(`proposal-${highlightedProposalId}`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [highlightedProposalId, proposalsForMe, proposalsByMe, allProposals, loadingForMe, loadingByMe, loadingAll, activeTab]);

  // Handle tab change - clear highlight when user manually switches
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    // Clear highlight when user manually switches tabs
    if (highlightedProposalId) {
      setHighlightedProposalId(null);
      // Clear URL param too
      router.replace('/proposals', { scroll: false });
    }
  };

  // Handle opening schedule modal for needs_input proposals
  const handleSelectSlot = (proposal: MakeupProposal) => {
    setSelectedProposal(proposal);
    setShowScheduleModal(true);
  };

  if (!currentTutorId) {
    return (
      <PageSurface>
        <PageTransition className="flex flex-col gap-4 p-4 sm:p-8">
          {/* Header skeleton */}
          <div className="flex items-center gap-4">
            <div className="h-9 w-9 shimmer-sepia rounded-lg" />
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shimmer-sepia rounded-lg" />
              <div className="space-y-2">
                <div className="h-6 w-48 shimmer-sepia rounded" />
                <div className="h-4 w-56 shimmer-sepia rounded" />
              </div>
            </div>
          </div>
          {/* Tab bar skeleton */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-line overflow-hidden">
            <div className="flex border-b border-line px-2 py-3 gap-4">
              <div className="h-5 w-20 shimmer-sepia rounded" />
              <div className="h-5 w-20 shimmer-sepia rounded" />
            </div>
            <div className="px-4 py-3 flex flex-col gap-3 bg-[#faf6f1]/50 dark:bg-[#2d2820]/50">
              <div className="h-9 w-full sm:w-[450px] shimmer-sepia rounded-lg" />
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-7 w-20 shimmer-sepia rounded-full" />
                ))}
              </div>
            </div>
          </div>
          {/* Card skeletons */}
          <ProposalListSkeleton />
        </PageTransition>
      </PageSurface>
    );
  }

  return (
    <PageSurface>
      <PageTransition className="flex flex-col gap-4 p-4 sm:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              aria-label="Back to the dashboard"
              title="Back to the dashboard"
              className="p-2 hover:bg-tint rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-tint">
                <CalendarClock className="h-6 w-6 text-accent-ink" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-on-surface">
                  Make-up proposals
                </h1>
                <p className="text-sm text-on-surface/70">
                  Manage make-up session requests
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs and Filters */}
        <div className={cn(
          "bg-white dark:bg-[#1a1a1a] rounded-xl border border-line overflow-hidden",
          "paper-texture"
        )}>
          {/* Tabs */}
          <div className="flex border-b border-line">
            <button
              onClick={() => handleTabChange("for-me")}
              className={cn(
                "flex-1 sm:flex-none px-6 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2",
                activeTab === "for-me"
                  ? "text-accent-ink border-b-2 border-primary bg-[#faf6f1] dark:bg-[#2d2820]"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/20"
              )}
            >
              <Inbox className="h-4 w-4" />
              For me
              {proposalsForMe.length > 0 && (
                <Badge tone="warning" className="tabular-nums">
                  {proposalsForMe.length}
                </Badge>
              )}
            </button>
            <button
              onClick={() => handleTabChange("by-me")}
              className={cn(
                "flex-1 sm:flex-none px-6 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2",
                activeTab === "by-me"
                  ? "text-accent-ink border-b-2 border-primary bg-[#faf6f1] dark:bg-[#2d2820]"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/20"
              )}
            >
              <Send className="h-4 w-4" />
              By me
              {proposalsByMe.length > 0 && (
                <Badge tone="info" className="tabular-nums">
                  {proposalsByMe.length}
                </Badge>
              )}
            </button>
            {isAdmin && (
              <button
                onClick={() => handleTabChange("all")}
                className={cn(
                  "flex-1 sm:flex-none px-6 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2",
                  activeTab === "all"
                    ? "text-accent-ink border-b-2 border-primary bg-[#faf6f1] dark:bg-[#2d2820]"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/20"
                )}
              >
                <Users className="h-4 w-4" />
                All
                {allProposals.length > 0 && (
                  <Badge tone="neutral" className="tabular-nums">
                    {allProposals.length}
                  </Badge>
                )}
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="px-4 py-3 flex flex-col gap-3 bg-[#faf6f1]/50 dark:bg-[#2d2820]/50">
            {/* Search and Sort */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none sm:w-[450px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                <Input
                  type="text"
                  placeholder="Search student or tutor..."
                  aria-label="Search student or tutor"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="secondary"
                icon={sortOrder === "newest" ? ArrowDownWideNarrow : ArrowUpWideNarrow}
                onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")}
                title={sortOrder === "newest" ? "Newest first" : "Oldest first"}
              >
                <span className="hidden sm:inline">{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
              </Button>
            </div>

            {/* Status filter - scrollable on mobile */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
              <Segmented
                label="Proposal status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusFilters.map((filter) => ({
                  value: filter.value,
                  label: filter.label,
                  icon: filter.icon,
                  // The icons hide on a phone so all four choices fit the width.
                  iconClassName: cn("hidden sm:block", filter.iconClassName),
                }))}
              />
            </div>
          </div>
        </div>

        {/* Proposals List */}
        <div className="space-y-4">
          {isLoading ? (
            <ProposalListSkeleton />
          ) : filteredProposals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl bg-paper border border-line">
              <EmptyCloud className="mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center px-4">
                {activeTab === "all"
                  ? statusFilter === "pending"
                    ? "No pending proposals"
                    : statusFilter === "all"
                    ? "No proposals found"
                    : `No ${statusFilter} proposals`
                  : activeTab === "for-me"
                  ? statusFilter === "pending"
                    ? "No pending proposals to review"
                    : statusFilter === "all"
                    ? "No proposals for you"
                    : `No ${statusFilter} proposals for you`
                  : statusFilter === "pending"
                  ? "No pending proposals created by you"
                  : statusFilter === "all"
                  ? "No proposals created by you"
                  : `No ${statusFilter} proposals created by you`}
              </p>
            </div>
          ) : (
            filteredProposals.map((proposal) => (
              <div
                key={proposal.id}
                id={`proposal-${proposal.id}`}
                className={cn(
                  "transition-all duration-300",
                  highlightedProposalId === proposal.id && "ring-2 ring-primary ring-offset-2 rounded-xl"
                )}
              >
                <ProposalCardFull
                  proposal={proposal}
                  currentTutorId={currentTutorId}
                  onSelectSlot={() => handleSelectSlot(proposal)}
                  defaultExpanded={highlightedProposalId === proposal.id}
                />
              </div>
            ))
          )}
        </div>

        {/* Schedule Makeup Modal for needs_input proposals */}
        {selectedProposal && selectedProposal.original_session && (
          <ScheduleMakeupModal
            session={selectedProposal.original_session}
            isOpen={showScheduleModal}
            onClose={() => {
              setShowScheduleModal(false);
              setSelectedProposal(null);
            }}
            proposerTutorId={currentTutorId}
          />
        )}
      </PageTransition>
    </PageSurface>
  );
}
