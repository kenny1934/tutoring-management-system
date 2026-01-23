"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { MapPin, Wrench, Users, DollarSign, ClipboardList, ExternalLink, ChevronDown, Search, Command, UserMinus, FileSpreadsheet, CalendarClock } from "lucide-react";
import { ProposalQuickLink } from "./ProposalQuickLink";
import { usefulTools } from "@/config/useful-tools";
import { leaveRecords, getLeaveRecordUrl } from "@/config/leave-records";
import { DailyPuzzle } from "./DailyPuzzle";
import { NotificationBell } from "./NotificationBell";
import { HeaderStats } from "./HeaderStats";
import { TearOffCalendar } from "./TearOffCalendar";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { useRole } from "@/contexts/RoleContext";
import { useTutors } from "@/lib/hooks";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import type { DashboardStats } from "@/types";
import { useDropdown } from "@/lib/ui-hooks";
import { FloatingPortal } from "@floating-ui/react";

// Maps the current user's display name to their tutor_name in the database
const CURRENT_USER_TUTOR = "Mr Kenny Chiu";

interface DashboardHeaderProps {
  userName?: string;
  location?: string;
  isMobile?: boolean;
  pendingPayments?: number;
  stats?: DashboardStats | null;
  tutorId?: number;
  isStatsLoading?: boolean;
}

// Random greeting emojis
const greetingEmojis = ["🎯","🌟","✨","🎉","🚀","💫","🔥","⚡","🎊","🪄","☀️","🌅","☕","🌻","🐣","🌙","🌈","🦄","🎈","🎭","🎨","🎪","💪","⭐","📊","📈", "💼","🏆","🎓","🌺","🦋","🍀","🌸","🎀","💎","🏅","🎖️","🏵️","🎗️","🔮","🎰","🎲","🃏","🎴","🎱","🧿","💝","🎁","🛍️","🎯","🏹"];

// Quick link definitions
const quickLinks = [
  { id: 'tools', label: 'Useful Tools', icon: Wrench, href: null }, // Special: opens dropdown
  { id: 'proposals', label: 'Make-up Proposals', icon: CalendarClock, href: null }, // Special: ProposalQuickLink component
  { id: 'parents', label: 'Parent Contacts', icon: Users, href: '/parent-contacts' },
  { id: 'revenue', label: 'My Revenue', icon: DollarSign, href: '/revenue' },
  { id: 'terminated', label: 'Terminated Students', icon: UserMinus, href: '/terminated-students' },
  { id: 'leave', label: 'Leave Record', icon: ClipboardList, href: null }, // Special: dropdown or direct link based on role
];


export function DashboardHeader({ userName = "Kenny", location, isMobile = false, pendingPayments = 0, stats, tutorId, isStatsLoading = false }: DashboardHeaderProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const { open: openCommandPalette } = useCommandPalette();
  const { viewMode } = useRole();
  const { data: tutors = [] } = useTutors();

  // Random emoji - memoized so it doesn't change on every render
  const greetingEmoji = useMemo(() => {
    return greetingEmojis[Math.floor(Math.random() * greetingEmojis.length)];
  }, []);

  // Derive tutor ID from tutors list if not provided
  const currentTutorId = useMemo(() => {
    if (tutorId) return tutorId;
    const currentTutor = tutors.find((t) => t.tutor_name === CURRENT_USER_TUTOR);
    return currentTutor?.id;
  }, [tutorId, tutors]);

  // Current user's leave record URL (for my-view mode)
  const currentUserLeaveUrl = getLeaveRecordUrl(CURRENT_USER_TUTOR);

  // Filter tutors with leave records by location, sorted by first name
  const tutorsWithLeaveRecords = useMemo(() => {
    return tutors
      .map((tutor) => ({
        ...tutor,
        sheetUrl: getLeaveRecordUrl(tutor.tutor_name),
      }))
      .filter((t) => t.sheetUrl) // Only show tutors that have a sheet configured
      .filter((t) => {
        // Filter by location if not "All Locations"
        if (location && location !== "All Locations") {
          return t.default_location === location;
        }
        return true;
      })
      .sort((a, b) => getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name)));
  }, [tutors, location]);

  // Floating UI dropdowns
  const { refs, floatingStyles, getReferenceProps, getFloatingProps } = useDropdown(toolsOpen, setToolsOpen);
  const {
    refs: leaveRefs,
    floatingStyles: leaveFloatingStyles,
    getReferenceProps: getLeaveReferenceProps,
    getFloatingProps: getLeaveFloatingProps,
  } = useDropdown(leaveOpen, setLeaveOpen);

  return (
    <div className={cn(
      "bg-[#fdf6eb] dark:bg-[#342d1f] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
      "shadow-md border-t-4 border-t-[#a0704b] dark:border-t-[#8b6f47]",
      !isMobile && "paper-texture"
    )}>
      {/* Top section: Welcome + Date/Weather + Location */}
      <div className="px-4 sm:px-6 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
        <div className="flex items-center justify-between gap-3">
          {/* Welcome message */}
          <p className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">
            Welcome back, {userName} {greetingEmoji}
          </p>

          {/* Right side: Search + Date/Weather + Location */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search Button - hidden on mobile (top bar has it) */}
            <button
              onClick={openCommandPalette}
              className={cn(
                "hidden sm:flex items-center gap-2 px-3 py-1.5",
                "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-full",
                "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors",
                "text-gray-500 dark:text-gray-400"
              )}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-sm">Search</span>
              <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 bg-[#f5ede3] dark:bg-[#2d2618] rounded text-[10px] font-medium">
                Ctrl+K
              </kbd>
            </button>

            {/* Tear-off Calendar (includes weather) */}
            <TearOffCalendar />

            {/* Location Badge */}
            {location && location !== "All Locations" && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-full">
                <MapPin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  {location}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row with Bell */}
      <div className="flex items-center justify-between border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
        {isStatsLoading && !stats ? (
          <div className="px-4 sm:px-6 py-2.5">
            <div className="flex items-center gap-4 sm:gap-8">
              {/* Skeleton pills matching HeaderStats layout */}
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 border border-[#e8d4b8] dark:border-[#6b5a4a]">
                  <div className="w-4 h-4 rounded shimmer-sepia" />
                  <div className="w-6 h-4 rounded shimmer-sepia" />
                  <div className="hidden sm:block w-14 h-4 rounded shimmer-sepia" />
                </div>
              ))}
              {/* Revenue stat (no border) */}
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded shimmer-sepia" />
                <div className="w-10 h-4 rounded shimmer-sepia" />
                <div className="hidden sm:block w-16 h-4 rounded shimmer-sepia" />
              </div>
            </div>
          </div>
        ) : stats ? (
          <HeaderStats stats={stats} />
        ) : null}
        <div className="px-4 sm:px-6">
          <NotificationBell pendingPayments={pendingPayments} location={location} tutorId={currentTutorId} />
        </div>
      </div>

      {/* Daily Puzzle */}
      <DailyPuzzle className="border-b border-[#e8d4b8] dark:border-[#6b5a4a]" />

      {/* Bottom section: Quick Links */}
      <div className="px-4 sm:px-6 py-4">
        {/* Quick Links */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {quickLinks.map((link) => {
            const Icon = link.icon;

            // Special handling for Useful Tools (dropdown)
            if (link.id === 'tools') {
              return (
                <div key={link.id} className="relative">
                  <button
                    ref={refs.setReference}
                    {...getReferenceProps()}
                    className={cn(
                      "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-all",
                      "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#8b6f47]",
                      "text-[#a0704b] dark:text-[#cd853f]",
                      "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] hover:shadow-sm",
                      toolsOpen && "bg-[#f5ede3] dark:bg-[#3d3628] shadow-sm"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden xs:inline">{link.label}</span>
                    <span className="xs:hidden">Tools</span>
                    <ChevronDown className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      toolsOpen && "rotate-180"
                    )} />
                  </button>

                  {/* Tools Dropdown */}
                  {toolsOpen && (
                    <FloatingPortal>
                      <div
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps()}
                        className={cn(
                          "z-50 w-80 sm:w-96 py-2 max-h-[70vh] overflow-y-auto",
                          "bg-white dark:bg-[#1a1a1a] rounded-lg shadow-lg",
                          "border border-[#e8d4b8] dark:border-[#6b5a4a]"
                        )}
                      >
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Quick Access
                        </div>
                        {usefulTools.map((tool, index) => (
                          <a
                            key={index}
                            href={tool.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={tool.description}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors group"
                            onClick={() => setToolsOpen(false)}
                          >
                            {/* Tool Icon - with warm sepia tint */}
                            <div className="w-8 h-8 flex-shrink-0 rounded-lg overflow-hidden bg-[#f5ede3] dark:bg-[#3d3628] p-1 flex items-center justify-center">
                              {tool.iconUrl ? (
                                <img
                                  src={tool.iconUrl}
                                  alt=""
                                  className="w-6 h-6 object-contain sepia-[.15] group-hover:sepia-0 transition-all"
                                  onError={(e) => {
                                    // Fallback to link icon on error
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                  }}
                                />
                              ) : null}
                              <ExternalLink className={cn("h-4 w-4 text-[#a0704b]", tool.iconUrl && "hidden")} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {tool.name}
                              </div>
                              {tool.description && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                  {tool.description}
                                </div>
                              )}
                            </div>
                            <ExternalLink className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        ))}
                        {usefulTools.length === 0 && (
                          <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                            No tools configured
                          </p>
                        )}
                      </div>
                    </FloatingPortal>
                  )}
                </div>
              );
            }

            // Special handling for Make-up Proposals
            if (link.id === 'proposals') {
              // Show placeholder while loading, then full component
              if (!currentTutorId) {
                return (
                  <button
                    key={link.id}
                    disabled
                    className={cn(
                      "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium",
                      "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#8b6f47]",
                      "text-[#a0704b]/50 dark:text-[#cd853f]/50 cursor-wait"
                    )}
                  >
                    <CalendarClock className="h-4 w-4" />
                    <span>Make-up Proposals</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                );
              }
              return <ProposalQuickLink key={link.id} tutorId={currentTutorId} />;
            }

            // Special handling for Leave Record
            if (link.id === 'leave') {
              // In my-view mode, render as direct link to current user's sheet
              if (viewMode === 'my-view' && currentUserLeaveUrl) {
                return (
                  <a
                    key={link.id}
                    href={currentUserLeaveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-all",
                      "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#8b6f47]",
                      "text-[#a0704b] dark:text-[#cd853f]",
                      "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] hover:shadow-sm"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden xs:inline">{link.label}</span>
                    <span className="xs:hidden">Leave</span>
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                );
              }

              // In center-view mode, render as dropdown
              return (
                <div key={link.id} className="relative">
                  <button
                    ref={leaveRefs.setReference}
                    {...getLeaveReferenceProps()}
                    className={cn(
                      "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-all",
                      "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#8b6f47]",
                      "text-[#a0704b] dark:text-[#cd853f]",
                      "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] hover:shadow-sm",
                      leaveOpen && "bg-[#f5ede3] dark:bg-[#3d3628] shadow-sm"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden xs:inline">{link.label}</span>
                    <span className="xs:hidden">Leave</span>
                    <ChevronDown className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      leaveOpen && "rotate-180"
                    )} />
                  </button>

                  {/* Leave Record Dropdown */}
                  {leaveOpen && (
                    <FloatingPortal>
                      <div
                        ref={leaveRefs.setFloating}
                        style={leaveFloatingStyles}
                        {...getLeaveFloatingProps()}
                        className={cn(
                          "z-50 w-72 py-2 max-h-[70vh] overflow-y-auto",
                          "bg-white dark:bg-[#1a1a1a] rounded-lg shadow-lg",
                          "border border-[#e8d4b8] dark:border-[#6b5a4a]"
                        )}
                      >
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {location && location !== "All Locations" ? location : "All Tutors"}
                        </div>
                        {tutorsWithLeaveRecords.map((tutor) => (
                          <a
                            key={tutor.id}
                            href={tutor.sheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors group"
                            onClick={() => setLeaveOpen(false)}
                          >
                            <FileSpreadsheet className="h-4 w-4 text-[#a0704b] flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {tutor.tutor_name}
                              </div>
                              {tutor.default_location && location === "All Locations" && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {tutor.default_location}
                                </div>
                              )}
                            </div>
                            <ExternalLink className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        ))}
                        {tutorsWithLeaveRecords.length === 0 && (
                          <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                            No leave records configured
                          </p>
                        )}
                      </div>
                    </FloatingPortal>
                  )}
                </div>
              );
            }

            // Regular link pills
            return (
              <Link
                key={link.id}
                href={link.href || '#'}
                className={cn(
                  "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-all",
                  "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#8b6f47]",
                  "text-[#a0704b] dark:text-[#cd853f]",
                  "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] hover:shadow-sm",
                  link.href === '#' && "opacity-70 cursor-not-allowed"
                )}
                onClick={(e) => {
                  if (link.href === '#') {
                    e.preventDefault();
                  }
                }}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden xs:inline">{link.label}</span>
                <span className="xs:hidden">
                  {link.id === 'parents' && 'Parents'}
                  {link.id === 'revenue' && 'Revenue'}
                  {link.id === 'terminated' && 'Termed'}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
