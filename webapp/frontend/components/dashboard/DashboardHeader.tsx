"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { MapPin, Wrench, Users, DollarSign, ClipboardList, ExternalLink, ChevronDown, Search, Command, UserMinus } from "lucide-react";
import { usefulTools } from "@/config/useful-tools";
import { DailyPuzzle } from "./DailyPuzzle";
import { NotificationBell } from "./NotificationBell";
import { HeaderStats } from "./HeaderStats";
import { TearOffCalendar } from "./TearOffCalendar";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import type { DashboardStats } from "@/types";
import {
  useFloating,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react";

interface DashboardHeaderProps {
  userName?: string;
  location?: string;
  isMobile?: boolean;
  pendingPayments?: number;
  stats?: DashboardStats | null;
}

// Random greeting emojis
const greetingEmojis = ["🎯","🌟","✨","🎉","🚀","💫","🔥","⚡","🎊","🪄","☀️","🌅","☕","🌻","🐣","🌙","🌈","🦄","🎈","🎭","🎨","🎪","💪","⭐","📊","📈", "💼","🏆","🎓","🌺","🦋","🍀","🌸","🎀","💎","🏅","🎖️","🏵️","🎗️","🔮","🎰","🎲","🃏","🎴","🎱","🧿","💝","🎁","🛍️","🎯","🏹"];

// Quick link definitions
const quickLinks = [
  { id: 'tools', label: 'Useful Tools', icon: Wrench, href: null }, // Special: opens dropdown
  { id: 'parents', label: 'Parent Contacts', icon: Users, href: '/parent-contacts' },
  { id: 'revenue', label: 'My Revenue', icon: DollarSign, href: '/revenue' },
  { id: 'terminated', label: 'Terminated Students', icon: UserMinus, href: '/terminated-students' },
  { id: 'leave', label: 'Leave Record', icon: ClipboardList, href: '#' }, // Placeholder
];


export function DashboardHeader({ userName = "Kenny", location, isMobile = false, pendingPayments = 0, stats }: DashboardHeaderProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const { open: openCommandPalette } = useCommandPalette();

  // Random emoji - memoized so it doesn't change on every render
  const greetingEmoji = useMemo(() => {
    return greetingEmojis[Math.floor(Math.random() * greetingEmojis.length)];
  }, []);

  // Floating UI for tools dropdown
  const { refs, floatingStyles, context } = useFloating({
    open: toolsOpen,
    onOpenChange: setToolsOpen,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end" }),
      shift({ padding: 8 }),
    ],
    placement: "bottom-start",
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

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
      {stats && (
        <div className="flex items-center justify-between border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <HeaderStats stats={stats} />
          <div className="px-4 sm:px-6">
            <NotificationBell pendingPayments={pendingPayments} location={location} />
          </div>
        </div>
      )}

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

            // Regular link pills (placeholders for now)
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
                    // Could show a toast here: "Coming soon!"
                  }
                }}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden xs:inline">{link.label}</span>
                <span className="xs:hidden">
                  {link.id === 'parents' && 'Parents'}
                  {link.id === 'revenue' && 'Revenue'}
                  {link.id === 'terminated' && 'Termed'}
                  {link.id === 'leave' && 'Leave'}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
