"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTutors, useProposals, usePageTitle } from "@/lib/hooks";
import { ProposalCardFull } from "@/components/proposals/ProposalCardFull";
import { ScheduleMakeupModal } from "@/components/sessions/ScheduleMakeupModal";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { EmptyCloud } from "@/components/illustrations/EmptyStates";
import { CURRENT_USER_TUTOR } from "@/lib/constants";
import type { MakeupProposal, ProposalStatus } from "@/types";
import {
  CalendarClock,
  ArrowLeft,
  Inbox,
  Send,
  Filter,
  Loader2,
  Search,
  Clock,
  Check,
  X,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
} from "lucide-react";

type TabType = "for-me" | "by-me";

// Status filter options
const statusFilters: { value: ProposalStatus | "all"; label: string; icon: React.ElementType }[] = [
  { value: "all", label: "All", icon: Filter },
  { value: "pending", label: "Pending", icon: Clock },
  { value: "approved", label: "Approved", icon: Check },
  { value: "rejected", label: "Rejected", icon: X },
];

export default function ProposalsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: tutors = [] } = useTutors();

  usePageTitle("Make-up Proposals");

  // Get current tutor ID
  const currentTutorId = useMemo(() => {
    const tutor = tutors.find((t) => t.tutor_name === CURRENT_USER_TUTOR);
    return tutor?.id;
  }, [tutors]);

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

    if (tabParam === "by-me" || tabParam === "for-me") {
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

  // Filter and sort proposals
  const filteredProposals = useMemo(() => {
    let proposals = activeTab === "for-me" ? proposalsForMe : proposalsByMe;

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
  }, [activeTab, proposalsForMe, proposalsByMe, searchQuery, sortOrder]);

  const isLoading = activeTab === "for-me" ? loadingForMe : loadingByMe;

  // Auto-switch tab and scroll to highlighted proposal
  useEffect(() => {
    if (highlightedProposalId && !loadingForMe && !loadingByMe) {
      const inForMe = proposalsForMe.some((p) => p.id === highlightedProposalId);
      const inByMe = proposalsByMe.some((p) => p.id === highlightedProposalId);

      if (inForMe && activeTab !== "for-me") {
        setActiveTab("for-me");
      } else if (inByMe && !inForMe && activeTab !== "by-me") {
        setActiveTab("by-me");
      }

      // Scroll to the proposal after a short delay
      setTimeout(() => {
        const element = document.getElementById(`proposal-${highlightedProposalId}`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [highlightedProposalId, proposalsForMe, proposalsByMe, loadingForMe, loadingByMe, activeTab]);

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
      <DeskSurface>
        <PageTransition className="flex flex-col gap-4 p-4 sm:p-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-4 p-4 sm:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#f5ede3] dark:bg-[#3d3628]">
                <CalendarClock className="h-6 w-6 text-[#a0704b]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Make-up Proposals
                </h1>
                <p className="text-sm text-white/70">
                  Manage make-up session requests
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs and Filters */}
        <div className={cn(
          "bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
          "paper-texture"
        )}>
          {/* Tabs */}
          <div className="flex border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            <button
              onClick={() => handleTabChange("for-me")}
              className={cn(
                "flex-1 sm:flex-none px-6 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2",
                activeTab === "for-me"
                  ? "text-[#a0704b] border-b-2 border-[#a0704b] bg-[#faf6f1] dark:bg-[#2d2820]"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/20"
              )}
            >
              <Inbox className="h-4 w-4" />
              For Me
              {proposalsForMe.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
                  {proposalsForMe.length}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange("by-me")}
              className={cn(
                "flex-1 sm:flex-none px-6 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2",
                activeTab === "by-me"
                  ? "text-[#a0704b] border-b-2 border-[#a0704b] bg-[#faf6f1] dark:bg-[#2d2820]"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/20"
              )}
            >
              <Send className="h-4 w-4" />
              By Me
              {proposalsByMe.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                  {proposalsByMe.length}
                </span>
              )}
            </button>
          </div>

          {/* Filters */}
          <div className="px-4 py-3 flex flex-col gap-3 bg-[#faf6f1]/50 dark:bg-[#2d2820]/50">
            {/* Search and Sort */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none sm:w-[450px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search student or tutor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] placeholder-gray-400"
                />
              </div>
              <button
                onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                  "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]",
                  "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900/20"
                )}
              >
                {sortOrder === "newest" ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpWideNarrow className="h-4 w-4" />}
                <span className="hidden sm:inline">{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
              </button>
            </div>

            {/* Status filter - scrollable on mobile */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
              {statusFilters.map((filter) => {
                const Icon = filter.icon;
                const isActive = statusFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-[#a0704b] text-white"
                        : "bg-white dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-400 border border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-gray-50 dark:hover:bg-gray-900/20"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Proposals List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
            </div>
          ) : filteredProposals.length === 0 ? (
            <div className={cn(
              "flex flex-col items-center justify-center py-16 rounded-xl",
              "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
              "paper-texture"
            )}>
              <EmptyCloud className="mb-2" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                No proposals found
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center px-4">
                {activeTab === "for-me"
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
                  highlightedProposalId === proposal.id && "ring-2 ring-[#a0704b] ring-offset-2 rounded-xl"
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
    </DeskSurface>
  );
}
