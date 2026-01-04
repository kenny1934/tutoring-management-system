"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useCoursewarePopularity, useCoursewareUsageDetail, usePageTitle } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote } from "@/lib/design-system";
import {
  BookOpen,
  Loader2,
  Users,
  ChevronDown,
  Copy,
  Check,
  Clock,
  FileText,
  X,
  PenTool,
  Home,
  ExternalLink,
  MapPin,
  Building2,
  Medal,
  Trophy,
  Award,
} from "lucide-react";
import { studentsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import type { CoursewarePopularity, CoursewareUsageDetail } from "@/types";

// Medal icons for top 3 - using lucide icons with glow effects
const MEDAL_CONFIG = [
  { icon: Trophy, color: "text-amber-500", glow: "drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" },      // Gold
  { icon: Medal, color: "text-gray-400", glow: "drop-shadow-[0_0_6px_rgba(156,163,175,0.5)]" },        // Silver
  { icon: Award, color: "text-amber-700", glow: "drop-shadow-[0_0_6px_rgba(180,83,9,0.5)]" },          // Bronze
];

// Fun rotating titles for the ranking header
const FUN_TITLES = [
  "This Week's Champions!",
  "Most Wanted Materials",
  "Hall of Fame",
  "Hot Off the Printer",
  "Courseware Royalty",
  "Top Picks",
  "Tutor Favourites",
  "Greatest Hits",
];

// Grade options for filter
const GRADE_OPTIONS = ["All", "F1", "F2", "F3", "F4", "F5", "F6"];

// Exercise type options
const EXERCISE_TYPE_OPTIONS = ["All", "CW", "HW"];

// Helper to format date
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Animated counter hook
function useAnimatedCounter(target: number, duration: number = 1000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target === 0) return;
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setCount(Math.floor(eased * target));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);

  return count;
}

// Hot badge for trending items - compact on mobile
function HotBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full animate-pulse">
      🔥<span className="hidden sm:inline"> HOT</span>
    </span>
  );
}

// Sparkle effect for top 3 medals
const SPARKLE_POSITIONS = [
  { top: "10%", left: "50%" },
  { top: "50%", left: "90%" },
  { top: "90%", left: "50%" },
  { top: "50%", left: "10%" },
];

function Sparkles({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {SPARKLE_POSITIONS.map((pos, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{
            background: color,
            top: pos.top,
            left: pos.left,
            transform: "translate(-50%, -50%)",
          }}
          animate={{
            scale: [0, 1.2, 0],
            opacity: [0, 0.8, 0],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            delay: i * 0.45,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// Confetti burst effect
const CONFETTI_COLORS = ["#fbbf24", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

function ConfettiBurst({
  trigger,
  origin,
  onComplete
}: {
  trigger: boolean;
  origin: { x: number; y: number };
  onComplete: () => void;
}) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; rotation: number; shape: string }>>([]);

  useEffect(() => {
    if (trigger) {
      // Generate confetti particles
      const newParticles = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 200,
        y: -(Math.random() * 150 + 50),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * 360,
        shape: Math.random() > 0.5 ? "50%" : "0",
      }));
      setParticles(newParticles);

      // Clear after animation
      const timer = setTimeout(() => {
        setParticles([]);
        onComplete();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [trigger, onComplete]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-2 h-2"
          style={{
            left: origin.x,
            top: origin.y,
            background: p.color,
            borderRadius: p.shape,
          }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
          animate={{
            x: p.x,
            y: [0, p.y, p.y + 300],
            scale: [1, 1.2, 0.5],
            opacity: [1, 1, 0],
            rotate: p.rotation,
          }}
          transition={{
            duration: 1,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        />
      ))}
    </div>
  );
}

// Copy path button with dropdown for multiple paths
function CopyPathButton({ paths, filename }: { paths: string; filename: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const pathList = paths ? paths.split(", ").filter(Boolean) : [];

  const handleCopy = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopied(path);
    setTimeout(() => {
      setCopied(null);
      setIsOpen(false);
    }, 1500);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pathList.length <= 1) {
      // Single path - copy directly
      handleCopy(pathList[0] || filename, e);
    } else {
      // Multiple paths - toggle dropdown
      setIsOpen(!isOpen);
      setFocusedIndex(0);
    }
  };

  // Keyboard navigation for dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || pathList.length <= 1) return;
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, pathList.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        handleCopy(pathList[focusedIndex]);
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const showCheckmark = pathList.length <= 1 && copied;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
        title={pathList.length > 1 ? "Select path to copy" : "Copy path"}
        aria-haspopup={pathList.length > 1 ? "listbox" : undefined}
        aria-expanded={pathList.length > 1 ? isOpen : undefined}
      >
        {showCheckmark ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Copy className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {isOpen && pathList.length > 1 && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1 z-50",
            "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
            "rounded-lg shadow-lg min-w-[300px] max-w-[90vw] sm:max-w-[600px] overflow-hidden"
          )}
          onClick={(e) => e.stopPropagation()}
          role="listbox"
        >
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Select path to copy (↑↓ to navigate, Enter to copy)
            </p>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {pathList.map((path, i) => (
              <button
                key={i}
                onClick={(e) => handleCopy(path, e)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs",
                  "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors",
                  "flex items-center gap-2 border-b border-[#e8d4b8]/20 dark:border-[#6b5a4a]/20 last:border-0",
                  "focus:outline-none focus:bg-[#f5ede3] dark:focus:bg-[#2d2618]",
                  i === focusedIndex && "bg-[#f5ede3] dark:bg-[#2d2618]"
                )}
                role="option"
                aria-selected={i === focusedIndex}
              >
                {copied === path ? (
                  <Check className="h-3 w-3 text-green-600 flex-shrink-0" />
                ) : (
                  <Copy className="h-3 w-3 text-gray-500 flex-shrink-0" />
                )}
                <span className="break-all text-gray-700 dark:text-gray-300" title={path}>{path}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// School autocomplete component
function SchoolAutocomplete({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const blurTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes(value.toLowerCase())
  );

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [value]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => setShowSuggestions(false), 150);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || filtered.length === 0) return;
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setShowSuggestions(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          onChange(filtered[highlightedIndex]);
          setShowSuggestions(false);
        }
        break;
    }
  };

  return (
    <div className="relative">
      <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
      <input
        type="text"
        value={value}
        placeholder="School..."
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-36 pl-8 pr-3 py-2 text-sm rounded-md min-h-[40px]",
          "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a]",
          "text-gray-700 dark:text-gray-300 placeholder-gray-500",
          "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
        )}
        role="combobox"
        aria-expanded={showSuggestions && filtered.length > 0}
        aria-autocomplete="list"
      />
      {showSuggestions && filtered.length > 0 && (
        <div
          className="absolute top-full left-0 mt-1 w-48 max-h-48 overflow-y-auto bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md shadow-lg z-50"
          role="listbox"
        >
          {filtered.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s);
                setShowSuggestions(false);
              }}
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] focus:outline-none focus:bg-[#f5ede3] dark:focus:bg-[#2d2618] min-h-[40px]",
                i === highlightedIndex && "bg-[#f5ede3] dark:bg-[#2d2618]"
              )}
              role="option"
              aria-selected={i === highlightedIndex}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Podium display for top 3
function Podium({
  top3,
  onSelect,
}: {
  top3: CoursewarePopularity[];
  onSelect: (filename: string) => void;
}) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiOrigin, setConfettiOrigin] = useState({ x: 0, y: 0 });

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent, filename: string) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    setConfettiOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 3 });
    setShowConfetti(true);
    onSelect(filename);
  };

  const handleConfettiComplete = React.useCallback(() => {
    setShowConfetti(false);
  }, []);

  if (top3.length < 3) return null;

  // Reorder for podium: [Silver(2nd), Gold(1st), Bronze(3rd)]
  const podiumOrder = [top3[1], top3[0], top3[2]];
  const heights = ["h-20", "h-28", "h-16"]; // Silver, Gold, Bronze
  const positions = [1, 0, 2]; // Original rank positions

  return (
    <>
      <ConfettiBurst trigger={showConfetti} origin={confettiOrigin} onComplete={handleConfettiComplete} />
      <div className="mb-4 p-4 bg-gradient-to-b from-[#fef9f3] to-white dark:from-[#2d2618] dark:to-[#1a1a1a] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden">
        <div className="flex items-end justify-center gap-2 sm:gap-4">
          {podiumOrder.map((item, i) => {
            const rank = positions[i];
            const config = MEDAL_CONFIG[rank];
            const Icon = config.icon;

            return (
              <motion.div
                key={item.filename}
                role="button"
                tabIndex={0}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  delay: 0.1 + i * 0.12,
                  duration: 0.45,
                  ease: [0.16, 1, 0.3, 1]
                }}
                onClick={(e) => handleClick(e, item.filename)}
                onKeyDown={(e) => e.key === 'Enter' && handleClick(e, item.filename)}
              className={cn(
                "flex flex-col items-center transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50 rounded-lg p-2 cursor-pointer",
                i === 1 ? "order-first sm:order-none" : "" // Gold first on mobile
              )}
            >
              {/* Medal icon with sparkles */}
              <div className={cn(
                "relative mb-2 p-2 rounded-full bg-white dark:bg-[#1a1a1a] shadow-lg",
                config.glow
              )}>
                <Sparkles color={rank === 0 ? "#fbbf24" : rank === 1 ? "#9ca3af" : "#b45309"} />
                <Icon className={cn("h-6 w-6 sm:h-8 sm:w-8 relative z-10", config.color)} />
              </div>

              {/* Filename */}
              <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 text-center max-w-[80px] sm:max-w-[120px] truncate" title={item.filename}>
                {item.filename}
              </div>

              {/* Stats */}
              <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">
                {item.assignment_count} uses
              </div>

              {/* Platform */}
              <div
                className={cn(
                  "w-20 sm:w-28 mt-2 rounded-t-lg flex items-end justify-center",
                  heights[i],
                  rank === 0
                    ? "bg-gradient-to-t from-amber-400 to-amber-300 dark:from-amber-600 dark:to-amber-500"
                    : rank === 1
                    ? "bg-gradient-to-t from-gray-300 to-gray-200 dark:from-gray-500 dark:to-gray-400"
                    : "bg-gradient-to-t from-amber-700 to-amber-600 dark:from-amber-800 dark:to-amber-700"
                )}
              >
                <span className="text-white font-bold text-lg sm:text-2xl mb-2 drop-shadow-md">
                  #{rank + 1}
                </span>
              </div>
            </motion.div>
          );
        })}
        </div>
      </div>
    </>
  );
}

// Ranking row component
function RankingRow({
  item,
  rank,
  isExpanded,
  onToggle,
  timeRange,
  maxCount,
  grade,
  school,
}: {
  item: CoursewarePopularity;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
  timeRange: "recent" | "all-time";
  maxCount: number;
  grade?: string;
  school?: string;
}) {
  // Get medal config for top 3
  const medalConfig = rank <= 3 ? MEDAL_CONFIG[rank - 1] : null;
  // Calculate progress percentage
  const progressPercent = maxCount > 0 ? Math.round((item.assignment_count / maxCount) * 100) : 0;

  return (
    <div
      className={cn(
        "group border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50",
        "transition-all duration-200",
        isExpanded
          ? "bg-[#fef9f3] dark:bg-[#2d2618]"
          : "hover:bg-[#f5ede3] dark:hover:bg-gray-800/30 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(160,112,75,0.12)]"
      )}
    >
      <div
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        role="button"
        tabIndex={0}
        className="w-full px-3 sm:px-4 py-3 flex items-center gap-3 cursor-pointer text-left min-h-[52px] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#a0704b]/50"
        aria-expanded={isExpanded}
      >
        {/* Rank */}
        <div className="w-10 text-center flex-shrink-0">
          {medalConfig ? (
            <medalConfig.icon
              className={cn(
                "h-6 w-6 mx-auto transition-transform duration-300",
                medalConfig.color,
                medalConfig.glow,
                "group-hover:scale-110"
              )}
            />
          ) : (
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              #{rank}
            </span>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Filename */}
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
            <span
              className="font-medium text-gray-900 dark:text-gray-100 truncate"
              title={item.filename}
            >
              {item.filename}
            </span>
            {/* Hot badge for top 5 with high usage */}
            {rank <= 5 && item.assignment_count >= 10 && <HotBadge />}
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {item.assignment_count} times
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {item.unique_student_count} students
            </span>
            {item.used_by && (
              <span
                className="inline-block text-[#a0704b] dark:text-[#cd853f] overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px] sm:max-w-[250px] lg:max-w-[400px] align-middle"
                title={item.used_by}
              >
                {item.used_by}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                rank === 1
                  ? "bg-gradient-to-r from-amber-400 to-amber-500"
                  : rank === 2
                  ? "bg-gradient-to-r from-gray-300 to-gray-400"
                  : rank === 3
                  ? "bg-gradient-to-r from-amber-600 to-amber-700"
                  : "bg-gradient-to-r from-[#a0704b] to-[#c4956a]"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Copy path button with dropdown */}
        <CopyPathButton paths={item.normalized_paths} filename={item.filename} />

        {/* Expand icon with smooth rotation */}
        <div className="flex-shrink-0 text-gray-500">
          <ChevronDown
            className={cn(
              "h-5 w-5 transition-transform duration-200",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* Expanded detail panel */}
      {isExpanded && (
        <UsageDetailPanel filename={item.filename} timeRange={timeRange} grade={grade} school={school} />
      )}
    </div>
  );
}

// Usage detail panel component
function UsageDetailPanel({
  filename,
  timeRange,
  grade,
  school,
}: {
  filename: string;
  timeRange: "recent" | "all-time";
  grade?: string;
  school?: string;
}) {
  const { selectedLocation } = useLocation();
  const [displayCount, setDisplayCount] = useState(10);
  // Request one extra to detect if there are more
  const { data: rawDetails = [], isLoading } = useCoursewareUsageDetail(
    filename,
    timeRange,
    displayCount + 1,
    undefined,  // exerciseType - show both CW and HW
    grade,
    school
  );

  // Check if there are more results by seeing if we got the extra item
  const hasMore = rawDetails.length > displayCount;
  // Only show up to displayCount items
  const details = hasMore ? rawDetails.slice(0, displayCount) : rawDetails;

  if (isLoading) {
    return (
      <div className="px-4 pb-4 flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
        <span className="ml-2 text-sm text-gray-500">Loading details...</span>
      </div>
    );
  }

  if (details.length === 0) {
    return (
      <div className="px-4 pb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          No usage details found
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
            Who used this courseware
          </p>
        </div>
        <div className="divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30 max-h-64 overflow-y-auto">
          {details.map((detail, idx) => {
            // Check if user has access to this student's location
            const canAccessLocation = selectedLocation === "All Locations" || selectedLocation === detail.location;
            const displayId = detail.school_student_id ? `${detail.location}-${detail.school_student_id}` : detail.location;

            return (
            <div
              key={`${detail.exercise_id}-${idx}`}
              className="px-3 py-2 flex items-center gap-2 sm:gap-3 text-sm hover:bg-[#f5ede3]/50 dark:hover:bg-[#2d2618]/50"
            >
              {/* Date */}
              <div className="w-20 sm:w-24 flex-shrink-0 text-gray-600 dark:text-gray-400 text-xs sm:text-sm">
                {formatShortDate(detail.session_date)}
              </div>

              {/* Student */}
              <div className="flex-1 min-w-0">
                {canAccessLocation ? (
                  <Link
                    href={`/students/${detail.student_id}`}
                    className="group text-[#a0704b] dark:text-[#cd853f] font-medium truncate block focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50 rounded"
                    title={detail.student_name}
                  >
                    <span className="text-gray-500 dark:text-gray-400 mr-1">{displayId}</span>
                    <span className="group-hover:underline">{detail.student_name}</span>
                  </Link>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400 truncate block" title={detail.student_name}>
                    <span className="mr-1">{displayId}</span>
                    {detail.student_name}
                  </span>
                )}
                <div className="text-xs text-gray-600 dark:text-gray-400" title={`${detail.school} ${detail.grade}${detail.lang_stream}`}>
                  {detail.school} {detail.grade}
                  {detail.lang_stream}
                </div>
              </div>

              {/* Exercise type badge */}
              {(() => {
                const isCW = detail.exercise_type === "CW";
                return (
                  <div
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 flex items-center gap-1",
                      isCW
                        ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    )}
                  >
                    {isCW ? <PenTool className="h-3 w-3" /> : <Home className="h-3 w-3" />}
                    {isCW ? "CW" : "HW"}
                  </div>
                );
              })()}

              {/* Page range - fixed width for alignment */}
              <div className="hidden sm:block w-12 text-xs text-gray-500 flex-shrink-0">
                {detail.page_start && (
                  <>
                    p.{detail.page_start}
                    {detail.page_end && detail.page_end !== detail.page_start
                      ? `-${detail.page_end}`
                      : ""}
                  </>
                )}
              </div>

              {/* Tutor - tablet and up */}
              <div
                className="hidden sm:block w-24 text-xs text-gray-600 dark:text-gray-400 truncate flex-shrink-0"
                title={detail.tutor_name}
              >
                {detail.tutor_name}
              </div>

              {/* Location - desktop only */}
              {detail.location && (
                <div className="hidden lg:flex items-center gap-1 w-20 text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate" title={detail.location}>{detail.location}</span>
                </div>
              )}

              {/* Session link - only if user has access to this location */}
              {canAccessLocation ? (
                <Link
                  href={`/sessions/${detail.session_id}`}
                  className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
                  title="Go to session"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5 text-gray-500 hover:text-[#a0704b]" />
                </Link>
              ) : (
                <div className="p-2 flex-shrink-0" title="Access restricted">
                  <ExternalLink className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* See more button */}
        {hasMore && (
          <button
            onClick={() => setDisplayCount((c) => c + 10)}
            className="w-full px-3 py-3 text-sm font-medium text-[#a0704b] dark:text-[#cd853f] hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#a0704b]/50 min-h-[44px]"
          >
            See more...
          </button>
        )}
      </div>
    </div>
  );
}

export default function CoursewarePage() {
  usePageTitle("Courseware Ranking");

  const router = useRouter();
  const searchParams = useSearchParams();

  // State from URL params
  const [timeRange, setTimeRange] = useState<"recent" | "all-time">(() => {
    return (searchParams.get("range") as "recent" | "all-time") || "recent";
  });
  const [exerciseType, setExerciseType] = useState<string>(() => {
    return searchParams.get("type") || "All";
  });
  const [grade, setGrade] = useState<string>(() => {
    return searchParams.get("grade") || "All";
  });
  const [school, setSchool] = useState<string>(() => {
    return searchParams.get("school") || "";
  });

  const [expandedFilename, setExpandedFilename] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [schools, setSchools] = useState<string[]>([]);
  const [funTitle, setFunTitle] = useState(() =>
    FUN_TITLES[Math.floor(Math.random() * FUN_TITLES.length)]
  );

  // Fetch schools list
  useEffect(() => {
    studentsAPI.getSchools()
      .then((data) => setSchools(data))
      .catch((err) => console.error("Failed to fetch schools:", err));
  }, []);

  // Detect mobile - only update state when crossing threshold
  useEffect(() => {
    let lastIsMobile = window.innerWidth < 768;
    setIsMobile(lastIsMobile);

    const checkMobile = () => {
      const nowMobile = window.innerWidth < 768;
      if (nowMobile !== lastIsMobile) {
        lastIsMobile = nowMobile;
        setIsMobile(nowMobile);
      }
    };

    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (timeRange !== "recent") params.set("range", timeRange);
    if (exerciseType !== "All") params.set("type", exerciseType);
    if (grade !== "All") params.set("grade", grade);
    if (school) params.set("school", school);
    const query = params.toString();
    router.replace(`/courseware${query ? `?${query}` : ""}`, { scroll: false });
  }, [timeRange, exerciseType, grade, school, router]);

  // Fetch data
  const exerciseTypeFilter =
    exerciseType === "All" ? undefined : exerciseType;
  const gradeFilter = grade === "All" ? undefined : grade;
  const schoolFilter = school || undefined;
  const { data: rankings = [], isLoading, error } = useCoursewarePopularity(
    timeRange,
    exerciseTypeFilter,
    gradeFilter,
    schoolFilter
  );

  // Toggle expanded row
  const handleToggleExpand = (filename: string) => {
    setExpandedFilename((prev) => (prev === filename ? null : filename));
  };

  // Toolbar classes
  const toolbarClasses = cn(
    "sticky top-0 z-30 flex flex-wrap items-center gap-2 sm:gap-3",
    "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47]",
    "rounded-lg px-3 sm:px-4 py-2",
    !isMobile && "paper-texture"
  );

  // Segmented button component for time range
  const TimeRangeToggle = () => (
    <div className="flex rounded-md border border-[#d4a574] dark:border-[#6b5a4a] overflow-hidden" role="group" aria-label="Time range filter">
      <button
        onClick={() => setTimeRange("recent")}
        className={cn(
          "px-3 py-2 text-sm font-medium transition-colors min-h-[40px] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#a0704b]/70",
          timeRange === "recent"
            ? "bg-[#a0704b] text-white"
            : "bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        )}
        aria-pressed={timeRange === "recent"}
      >
        Last 14 Days
      </button>
      <button
        onClick={() => setTimeRange("all-time")}
        className={cn(
          "px-3 py-2 text-sm font-medium transition-colors border-l border-[#d4a574] dark:border-[#6b5a4a] min-h-[40px] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#a0704b]/70",
          timeRange === "all-time"
            ? "bg-[#a0704b] text-white"
            : "bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        )}
        aria-pressed={timeRange === "all-time"}
      >
        All Time
      </button>
    </div>
  );

  // Filter dropdown component
  const FilterDropdown = ({
    value,
    options,
    onChange,
    label,
  }: {
    value: string;
    options: string[];
    onChange: (val: string) => void;
    label: string;
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "px-3 py-2 text-sm font-medium rounded-md min-h-[40px]",
        "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a]",
        "text-gray-700 dark:text-gray-300",
        "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50",
        "cursor-pointer"
      )}
      aria-label={label}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt === "All" ? `All ${label}` : opt}
        </option>
      ))}
    </select>
  );

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-2 sm:p-4">
          {/* Toolbar */}
          <div className={toolbarClasses}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full">
              {/* Title */}
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                  Courseware Ranking
                </h1>
              </div>

              <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <TimeRangeToggle />

                <FilterDropdown
                  value={exerciseType}
                  options={EXERCISE_TYPE_OPTIONS}
                  onChange={setExerciseType}
                  label="Types"
                />

                <FilterDropdown
                  value={grade}
                  options={GRADE_OPTIONS}
                  onChange={setGrade}
                  label="Grades"
                />

                <SchoolAutocomplete
                  value={school}
                  onChange={setSchool}
                  suggestions={schools}
                />

                {/* Clear filters button with count badge */}
                {(() => {
                  const activeCount = [
                    exerciseType !== "All",
                    grade !== "All",
                    school !== "",
                  ].filter(Boolean).length;

                  if (activeCount === 0) return null;

                  return (
                    <button
                      onClick={() => {
                        setExerciseType("All");
                        setGrade("All");
                        setSchool("");
                      }}
                      className="relative p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
                      title={`Clear ${activeCount} filter${activeCount > 1 ? "s" : ""}`}
                    >
                      <X className="h-4 w-4 text-gray-600" />
                      <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center text-[10px] font-bold bg-[#a0704b] text-white rounded-full">
                        {activeCount}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#a0704b] dark:text-[#cd853f]" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Loading rankings...
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex justify-center py-12">
              <StickyNote variant="pink" size="lg" showTape>
                <div className="text-center">
                  <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">
                    Error
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {error instanceof Error
                      ? error.message
                      : "Failed to load rankings"}
                  </p>
                </div>
              </StickyNote>
            </div>
          )}

          {/* Podium for top 3 */}
          {!isLoading && !error && rankings.length >= 3 && (
            <Podium
              top3={rankings.slice(0, 3)}
              onSelect={(filename) => setExpandedFilename(filename)}
            />
          )}

          {/* Ranking list */}
          {!isLoading && !error && rankings.length > 0 && (
            <div
              className={cn(
                "bg-white dark:bg-[#1a1a1a] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden",
                !isMobile && "paper-texture",
                "animate-fade-in"
              )}
            >
              {/* Header */}
              <div className="px-4 py-3 bg-[#f5ede3] dark:bg-[#3d3628] border-b border-[#d4a574]/30 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-2">
                  <span className="animate-pulse">🏆</span>
                  {funTitle}
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400 lowercase">
                    ({timeRange === "recent" ? "14 days" : "all time"})
                  </span>
                </h2>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {rankings.length} items
                </span>
              </div>

              {/* List */}
              <div>
                {rankings.map((item, index) => (
                  <motion.div
                    key={item.filename}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: index * 0.03,
                      duration: 0.35,
                      ease: [0.16, 1, 0.3, 1]
                    }}
                  >
                    <RankingRow
                      item={item}
                      rank={index + 1}
                      isExpanded={expandedFilename === item.filename}
                      onToggle={() => handleToggleExpand(item.filename)}
                      timeRange={timeRange}
                      maxCount={rankings[0]?.assignment_count || 0}
                      grade={gradeFilter}
                      school={schoolFilter}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && rankings.length === 0 && (
            <div className="flex justify-center py-12">
              <StickyNote variant="yellow" size="lg" showTape rotation={-1}>
                <div className="text-center">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 text-[#a0704b] dark:text-[#cd853f]" />
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                    {timeRange === "recent" ? "The stage is empty!" : "No champions yet!"}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    {timeRange === "recent"
                      ? "No courseware has been assigned in the last 14 days."
                      : "No courseware assignments found in the records."}
                  </p>
                  {(exerciseType !== "All" || grade !== "All" || school) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                      Try adjusting your filters to discover hidden gems!
                    </p>
                  )}
                </div>
              </StickyNote>
            </div>
          )}
        </div>

        <ScrollToTopButton />
      </PageTransition>
    </DeskSurface>
  );
}
