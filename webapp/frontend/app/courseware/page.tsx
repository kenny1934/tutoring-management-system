"use client";

import React, { useState, useEffect, useCallback, useRef, Fragment, useMemo } from "react";
import dynamic from "next/dynamic";
import useSWR, { preload } from "swr";
import Fuse from "fuse.js";
import { motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useCoursewarePopularity, useCoursewareUsageDetail, usePageTitle, useFileSystemAccessSupported } from "@/lib/hooks";
import { useMapSelection } from "@/lib/hooks/useMapSelection";
import { CoursewareWorkspace } from "@/components/courseware/CoursewareWorkspace";
import { useLocation } from "@/contexts/LocationContext";
import { CompactErrorBoundary } from "@/components/ui/error-boundary";
import { formatDateCompact } from "@/lib/formatters";
import { PageSurface } from "@/components/layout/PageSurface";
import { Button, IconButton, Input, Select, Label, Segmented, CountBadge, LABEL_CLASS, PageHeader } from "@/components/controls";
import { PageTransition, StickyNote } from "@/lib/design-system";
import {
  BookOpen,
  Loader2,
  Users,
  ChevronDown,
  ChevronRight,
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
  FolderTree,
  Search,
  BarChart3,
  Folder,
  FolderSync,
  FolderPlus,
  LayoutGrid,
  List,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Filter,
  Sun,
} from "lucide-react";
import { studentsAPI, summerCoursewareAPI } from "@/lib/api";
import { CoursewareMatrix } from "@/components/summer/CoursewareMatrix";
import { ConnectDriveButton } from "@/components/summer/ConnectDriveButton";
import { useCoursewareDrive } from "@/lib/summer-courseware-session";
import { getCoursewareFileHandle } from "@/lib/summer-courseware-scan";
import { buildFullPath } from "@/lib/summer-courseware-defaults";
import type { SummerCoursewareFile } from "@/types";
import { cn } from "@/lib/utils";
import { TONES } from "@/lib/tones";
import { CopyPathButton } from "@/components/ui/copy-path-button";
import Link from "next/link";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { type FileSelection, validatePageInput } from "@/components/ui/folder-tree-modal";
import { FileArtwork } from "@/components/material/FileArtwork";
import { useFolderJourney } from "@/components/material/useFolderJourney";
import { usePdfCover } from "@/components/material/usePdfCover";
import materialStyles from "@/components/material/MaterialWorkspace.module.css";
import { getPageCount } from "@/lib/pdf-utils";

// Dynamic imports for modals and tab-specific components




const SessionSelectorModal = dynamic(
  () => import("@/components/sessions/SessionSelectorModal").then(mod => mod.SessionSelectorModal),
  { ssr: false }
);

const BrowsePdfPreview = dynamic(
  () => import("@/components/courseware/BrowsePdfPreview").then(mod => mod.BrowsePdfPreview),
  { ssr: false }
);

const BrowseSelectionPanel = dynamic(
  () => import("@/components/courseware/BrowseSelectionPanel").then(mod => mod.BrowseSelectionPanel),
  { ssr: false }
);


import { TrendingUp } from "lucide-react";
import type { CoursewarePopularity } from "@/types";

// Medal icons for top 3 - using lucide icons with glow effects
const MEDAL_CONFIG = [
  { icon: Trophy, color: "text-amber-500", glow: "drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" },      // Gold
  { icon: Medal, color: "text-gray-500", glow: "drop-shadow-[0_0_6px_rgba(156,163,175,0.5)]" },        // Silver
  { icon: Award, color: "text-amber-700", glow: "drop-shadow-[0_0_6px_rgba(180,83,9,0.5)]" },          // Bronze
];

// Rotating titles for the ranking header, one picked per visit. Each has to
// read well before both "(14 days)" and "(all time)".
const FUN_TITLES = [
  "Most used",
  "Most assigned",
  "Top picks",
  "Tutor favourites",
  "Most reached for",
  "Staffroom favourites",
  "Tried and trusted",
];

// Grade options for filter
const GRADE_OPTIONS = ["All", "F1", "F2", "F3", "F4", "F5", "F6"];

// Exercise type options
const EXERCISE_TYPE_OPTIONS = ["All", "CW", "HW"];

// Tab definitions
type CoursewareTab = "ranking" | "browse" | "search";
const TABS: { id: CoursewareTab; label: string; icon: typeof BarChart3 }[] = [
  { id: "ranking", label: "Ranking", icon: BarChart3 },
  { id: "browse", label: "Browse", icon: FolderTree },
  { id: "search", label: "Search", icon: Search },
];

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

// Hot badge for items assigned a lot lately, compact on mobile. A soft
// warning chip: red is kept for things that have gone wrong.
function HotBadge() {
  return (
    <span className={cn("inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 text-[11px] font-semibold rounded-full", TONES.warning.soft)}>
      <TrendingUp className="h-3 w-3" aria-hidden="true" />
      <span className="hidden sm:inline">Hot</span>
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

// School autocomplete component
function SchoolAutocomplete({
  id,
  value,
  onChange,
  suggestions,
}: {
  id?: string;
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
        id={id}
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
          "h-8 w-full min-w-0 pl-8 pr-2.5 text-sm rounded",
          "bg-field-fill border border-field",
          "text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400",
          "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
        )}
        role="combobox"
        aria-expanded={showSuggestions && filtered.length > 0}
        aria-autocomplete="list"
      />
      {showSuggestions && filtered.length > 0 && (
        <div
          className="absolute top-full left-0 mt-1 w-48 max-h-48 overflow-y-auto bg-raised border border-line-strong dark:border-line rounded-md shadow-lg z-50"
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
                "w-full px-3 py-2 text-left text-sm hover:bg-wash focus:outline-none focus:bg-wash min-h-[40px]",
                i === highlightedIndex && "bg-wash"
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
      <div className="mb-4 p-4 bg-gradient-to-b from-paper to-white dark:to-[#29241e] rounded-lg border-2 border-line-strong overflow-hidden">
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
                "flex flex-col items-center transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-lg p-2 cursor-pointer",
                i === 1 ? "order-first sm:order-none" : "" // Gold first on mobile
              )}
            >
              {/* Medal icon with sparkles */}
              <div className={cn(
                "relative mb-2 p-2 rounded-full bg-raised shadow-lg",
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
              <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">
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
        "group border-b border-line/50",
        "transition-all duration-200",
        isExpanded
          ? "bg-paper"
          : "hover:bg-tint dark:hover:bg-gray-800/30"
      )}
    >
      <div
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        role="button"
        tabIndex={0}
        className="w-full px-3 sm:px-4 py-3 flex items-center gap-3 cursor-pointer text-left min-h-[52px] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/50"
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
            <FileText className="h-4 w-4 text-accent-ink flex-shrink-0" />
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
                className="inline-block text-accent-ink overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px] sm:max-w-[250px] lg:max-w-[400px] align-middle"
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
                  : "bg-gradient-to-r from-primary to-[#c4956a]"
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
        <Loader2 className="h-5 w-5 animate-spin text-accent-ink" />
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
      <div className="bg-raised rounded-lg border border-line overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-line/50">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
            Who used this courseware
          </p>
        </div>
        <div className="divide-y divide-line/30 max-h-64 overflow-y-auto">
          {details.map((detail, idx) => {
            // Check if user has access to this student's location
            const canAccessLocation = selectedLocation === "All Locations" || selectedLocation === detail.location;
            const displayId = detail.school_student_id ? `${detail.location}-${detail.school_student_id}` : detail.location;

            return (
            <div
              key={`${detail.exercise_id}-${idx}`}
              className="px-3 py-2 flex items-center gap-2 sm:gap-3 text-sm hover:bg-wash/50"
            >
              {/* Date */}
              <div className="w-20 sm:w-24 flex-shrink-0 text-gray-600 dark:text-gray-400 text-xs sm:text-sm">
                {detail.session_date ? formatDateCompact(detail.session_date) : "-"}
              </div>

              {/* Student */}
              <div className="flex-1 min-w-0">
                {canAccessLocation ? (
                  <Link
                    href={`/students/${detail.student_id}`}
                    className="group text-accent-ink font-medium truncate block focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
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
                  className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  title="Go to session"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5 text-gray-500 hover:text-accent-ink" />
                </Link>
              ) : (
                <div className="p-2 flex-shrink-0" title="Access restricted">
                  <ExternalLink className="h-3.5 w-3.5 text-gray-300 dark:text-gray-400" />
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
            className="w-full px-3 py-3 text-sm font-medium text-accent-ink hover:bg-wash transition-colors border-t border-line/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/50 min-h-[44px]"
          >
            See more...
          </button>
        )}
      </div>
    </div>
  );
}

// Timeout helper for network operations
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMsg: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMsg)), ms)
  );
  return Promise.race([promise, timeout]);
}

type SortOption = "name-asc" | "name-desc" | "date-desc" | "date-asc";
type ViewMode = "grid" | "list";

// The summer whose courseware index the Browse tab surfaces: the calendar
// year at page load (the year-listing configs endpoint is admin-gated).
const SUMMER_YEAR = new Date().getFullYear();

// Browse tab - Courseware file browser with preview (modern breadcrumb navigation)
function CoursewareBrowserTab() {
  // Root folders and navigation state
  const [rootFolders, setRootFolders] = useState<TreeNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [currentHandle, setCurrentHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [currentContents, setCurrentContents] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentsLoading, setContentsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // View/sort state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [loadingDates, setLoadingDates] = useState(false);

  // Pagination
  const ITEMS_PER_PAGE = 100;
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE);

  // Keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const folderRequest = useRef(0);
  const folderNavigation = useRef(0);
  const folderJourney = useFolderJourney(contentScrollRef, currentPath, loading || contentsLoading, !!error);

  // Network errors
  const [unavailableFolders, setUnavailableFolders] = useState<Set<string>>(new Set());

  // Multi-select state (using shared hook)
  const {
    selections,
    setSelections,
    toggle: toggleFileSelection,
    set: setFileSelection,
    update: updateFileSelection,
    remove: removeFileSelection,
    clear: clearFileSelections,
  } = useMapSelection<string, FileSelection>();
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Session selector modal
  const [sessionSelectorOpen, setSessionSelectorOpen] = useState(false);

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewNode, setPreviewNode] = useState<TreeNode | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const selectedCover = usePdfCover(previewUrl, previewNode?.path ?? null);
  const [zoomIndex, setZoomIndex] = useState(2);
  // Handwriting removal state
  const [cleanedPreviewUrl, setCleanedPreviewUrl] = useState<string | null>(null);
  const [showCleanedPreview, setShowCleanedPreview] = useState(false);

  const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];
  const currentZoom = ZOOM_LEVELS[zoomIndex];

  // Summer courseware: a pinned virtual folder at root, seasonal by
  // construction — it only appears while the current year has a scanned
  // index. Opening it shows the chapter matrix instead of folder contents.
  // Same key family as useSummerCoursewareIndex; the null grade marks the
  // unfiltered all-grades fetch (the hook never fetches without a grade).
  const { data: summerIndex } = useSWR(
    ["summer-courseware-index", SUMMER_YEAR, null],
    () => summerCoursewareAPI.getIndex(SUMMER_YEAR),
    { revalidateOnFocus: false }
  );
  const hasSummer = (summerIndex?.files?.length ?? 0) > 0;
  const [summerOpen, setSummerOpen] = useState(false);
  const summerDrive = useCoursewareDrive(SUMMER_YEAR);

  // File System Access API (local folders) only exists in desktop Chrome/Edge.
  const fsSupported = useFileSystemAccessSupported();

  // Load root folders on mount
  useEffect(() => {
    loadRootFolders();
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  const loadRootFolders = async () => {
    setLoading(true);
    setError(null);
    try {
      const { getSavedFolders, getPathMappings } = await import("@/lib/file-system");
      const folders = await getSavedFolders();

      // Get path mappings to determine which folders are network drive aliases
      const mappings = await getPathMappings();
      const aliasNames = new Set(mappings.map((m) => m.alias));

      // Convert to nodes - add brackets for network drive aliases
      const nodes: TreeNode[] = folders.map((folder) => {
        const isAlias = aliasNames.has(folder.name);
        return {
          id: folder.id,
          name: folder.name,
          path: isAlias ? `[${folder.name}]` : folder.name,
          kind: "folder" as const,
          handle: folder.handle,
          isShared: folder.isShared,
        };
      });
      nodes.sort((a, b) => {
        if (a.isShared && !b.isShared) return -1;
        if (!a.isShared && b.isShared) return 1;
        return a.name.localeCompare(b.name);
      });
      setRootFolders(nodes);
      setCurrentContents(nodes);
    } catch (err) {
      setError("Failed to load folders");
    } finally {
      setLoading(false);
    }
  };

  // Load contents of a directory with timeout handling
  const loadFolderContents = useCallback(async (
    handle: FileSystemDirectoryHandle,
    basePath: string,
    folderId?: string
  ) => {
    const request = ++folderRequest.current;
    setContentsLoading(true);
    setError(null);
    const TIMEOUT_MS = 5000;

    try {
      const { verifyPermission } = await import("@/lib/file-system");
      const hasPermission = await withTimeout(
        verifyPermission(handle),
        TIMEOUT_MS,
        "Connection timeout - drive may be unavailable"
      );

      if (request !== folderRequest.current) return;
      if (!hasPermission) {
        setError("Permission denied. Please grant access in Settings.");
        setContentsLoading(false);
        return;
      }

      const contents: TreeNode[] = [];
      const entriesIterator = handle.entries();

      // Try first entry with timeout
      const firstEntryResult = await withTimeout(
        entriesIterator.next(),
        TIMEOUT_MS,
        "Cannot access folder - network may be unavailable"
      );

      if (!firstEntryResult.done) {
        const [name, entryHandle] = firstEntryResult.value;
        const isPdf = name.toLowerCase().endsWith(".pdf");
        const isFolder = entryHandle.kind === "directory";
        if (isFolder || isPdf) {
          contents.push({
            id: `${basePath}\\${name}`,
            name,
            path: `${basePath}\\${name}`,
            kind: entryHandle.kind === "directory" ? "folder" : "file",
            handle: entryHandle as FileSystemDirectoryHandle | FileSystemFileHandle,
          });
        }
      }

      // Continue with remaining entries
      for await (const [name, entryHandle] of entriesIterator) {
        const isPdf = name.toLowerCase().endsWith(".pdf");
        const isFolder = entryHandle.kind === "directory";
        if (isFolder || isPdf) {
          contents.push({
            id: `${basePath}\\${name}`,
            name,
            path: `${basePath}\\${name}`,
            kind: entryHandle.kind === "directory" ? "folder" : "file",
            handle: entryHandle as FileSystemDirectoryHandle | FileSystemFileHandle,
          });
        }
      }

      // Clear from unavailable on success
      if (folderId) {
        setUnavailableFolders((prev) => {
          const next = new Set(prev);
          next.delete(folderId);
          return next;
        });
      }

      if (request !== folderRequest.current) return;
      setCurrentContents(contents);
      setDisplayLimit(ITEMS_PER_PAGE);
    } catch (err) {
      if (request !== folderRequest.current) return;
      const message = err instanceof Error ? err.message : "Failed to load folder contents.";
      setError(message);
      if (folderId && (message.includes("timeout") || message.includes("unavailable"))) {
        setUnavailableFolders((prev) => new Set(prev).add(folderId));
      }
    } finally {
      if (request === folderRequest.current) setContentsLoading(false);
    }
  }, []);

  // Navigate into a folder
  const navigateInto = useCallback(async (node: TreeNode) => {
    if (node.kind !== "folder" || !node.handle) return;
    const navigation = ++folderNavigation.current;
    const dirHandle = node.handle as FileSystemDirectoryHandle;
    // At root level, use node.path which has brackets for alias folders
    // For subfolders, use node.name (just the folder name)
    const segment = currentPath.length === 0 ? node.path : node.name;
    const newPath = [...currentPath, segment];
    folderJourney.enter(node.path, newPath);
    setSearchQuery(""); // Clear search when navigating
    setCurrentPath(newPath);
    setCurrentHandle(dirHandle);
    await loadFolderContents(dirHandle, newPath.join("\\"), node.id);
    if (navigation !== folderNavigation.current) return;
    if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
  }, [currentPath, loadFolderContents, folderJourney]);

  // Navigate via breadcrumb
  const navigateTo = useCallback(async (index: number) => {
    if (index === currentPath.length - 1) { setSearchQuery(""); return; }
    const navigation = ++folderNavigation.current;
    folderRequest.current++;
    folderJourney.back(index === -1 ? [] : currentPath.slice(0, index + 1));
    setSearchQuery(""); // Clear search when navigating
    if (index === -1) {
      folderRequest.current++;
      setContentsLoading(false);
      setError(null);
      setCurrentPath([]);
      setCurrentHandle(null);
      setCurrentContents(rootFolders);
      return;
    }

    const newPath = currentPath.slice(0, index + 1);
    let handle: FileSystemDirectoryHandle | null = null;
    // Strip brackets if present: [Center] → Center
    let rootName = newPath[0];
    if (rootName.startsWith("[") && rootName.endsWith("]")) {
      rootName = rootName.slice(1, -1);
    }
    const rootFolder = rootFolders.find((f) => f.name === rootName);
    if (!rootFolder || !rootFolder.handle) return;

    handle = rootFolder.handle as FileSystemDirectoryHandle;
    for (let i = 1; i < newPath.length; i++) {
      try {
        handle = await handle.getDirectoryHandle(newPath[i]);
        if (navigation !== folderNavigation.current) return;
      } catch {
        return;
      }
    }

    if (navigation !== folderNavigation.current) return;
    setCurrentPath(newPath);
    setCurrentHandle(handle);
    await loadFolderContents(handle, newPath.join("\\"));
  }, [currentPath, rootFolders, loadFolderContents, folderJourney]);

  // Sort nodes
  const sortNodes = useCallback((nodes: TreeNode[]): TreeNode[] => {
    return [...nodes].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      switch (sortBy) {
        case "date-desc": return (b.lastModified || 0) - (a.lastModified || 0);
        case "date-asc": return (a.lastModified || 0) - (b.lastModified || 0);
        case "name-desc": return b.name.localeCompare(a.name, undefined, { numeric: true });
        case "name-asc":
        default: return a.name.localeCompare(b.name, undefined, { numeric: true });
      }
    });
  }, [sortBy]);

  const sortedContentsRaw = sortNodes(currentContents);

  // Fuzzy filter when search query is active
  const fuseOptions = useMemo(() => ({
    keys: ["name"],
    threshold: 0.4,
    ignoreLocation: true,
  }), []);

  const sortedContents = useMemo(() => {
    if (!searchQuery.trim()) return sortedContentsRaw;
    const fuse = new Fuse(sortedContentsRaw, fuseOptions);
    return fuse.search(searchQuery).map((result) => result.item);
  }, [sortedContentsRaw, searchQuery, fuseOptions]);

  // Load file dates when sorting by date
  useEffect(() => {
    if (!sortBy.startsWith("date-") || loadingDates) return;
    const filesToLoad = currentContents.filter(
      (n) => n.kind === "file" && n.lastModified === undefined && n.handle
    );
    if (filesToLoad.length === 0) return;

    const loadDates = async () => {
      setLoadingDates(true);
      try {
        for (const node of filesToLoad) {
          try {
            const file = await (node.handle as FileSystemFileHandle).getFile();
            node.lastModified = file.lastModified;
          } catch {
            node.lastModified = 0;
          }
        }
        setCurrentContents([...currentContents]);
      } finally {
        setLoadingDates(false);
      }
    };
    loadDates();
  }, [sortBy, currentContents, loadingDates]);

  // Pagination
  const displayedContents = sortedContents.slice(0, displayLimit);
  const hasMore = sortedContents.length > displayLimit;
  const remainingCount = sortedContents.length - displayLimit;

  // Handle preview
  const handlePreview = useCallback(async (node: TreeNode) => {
    if (node.kind !== "file" || !node.handle) return;
    setPreviewLoading(true);
    setPreviewNode(node);
    try {
      const fileHandle = node.handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (err) {
      setError("Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [previewUrl]);

  // Open a summer matrix file in the preview pane. With a drive handle the
  // file becomes an ordinary TreeNode, so preview, Assign, Import and
  // open-in-new-tab all work unchanged; its path is the canonical alias
  // path lesson exercises use. Without one, fall back to the native open
  // (which shows the connect-drive toast).
  const handleSummerFileOpen = useCallback(async (file: SummerCoursewareFile) => {
    const handle = await getCoursewareFileHandle(SUMMER_YEAR, file.rel_path);
    if (!handle) {
      summerDrive.open(file.rel_path);
      return;
    }
    handlePreview({
      id: `summer-${file.id}`,
      name: file.file_name,
      path: buildFullPath(summerIndex?.scan?.path_prefix, file.rel_path),
      kind: "file",
      handle,
    });
  }, [summerDrive, summerIndex, handlePreview]);

  // Toggle file selection (replicated from FolderTreeModal)
  const toggleSelection = useCallback(async (node: TreeNode) => {
    const path = node.path;
    if (selections.has(path)) {
      removeFileSelection(path);
    } else {
      setFileSelection(path, { path, pages: "" });
      // Load page count async
      if (node.handle && node.kind === "file") {
        try {
          const file = await (node.handle as FileSystemFileHandle).getFile();
          const arrayBuffer = await file.arrayBuffer();
          const pageCount = await getPageCount(arrayBuffer);
          updateFileSelection(path, (sel) => ({ ...sel, pageCount }));
        } catch (err) {
          // Page count fetch failed - non-critical
        }
      }
    }
  }, [selections, removeFileSelection, setFileSelection, updateFileSelection]);

  // Update page input for a selection (with validation)
  const updateSelectionPages = useCallback((path: string, pages: string) => {
    updateFileSelection(path, (sel) => {
      const error = sel.pageCount ? validatePageInput(pages, sel.pageCount) : null;
      return { ...sel, pages, error: error || undefined };
    });
  }, [updateFileSelection]);

  // Remove a single selection (alias for hook method)
  const removeSelection = removeFileSelection;

  // Handle click with multi-select support (replicated from FolderTreeModal)
  const handleSingleClick = useCallback((e: React.MouseEvent, node: TreeNode, index: number) => {
    // Ctrl+Click: toggle selection
    if (e.ctrlKey || e.metaKey) {
      if (node.kind === "file") {
        toggleSelection(node);
        setLastClickedIndex(index);
      }
      return;
    }

    // Shift+Click: range selection
    if (e.shiftKey && lastClickedIndex !== null && node.kind === "file") {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const rangeNodes = sortedContents
        .slice(start, end + 1)
        .filter((n) => n.kind === "file") as TreeNode[];
      // Add selections first
      const newPaths: string[] = [];
      setSelections((prev) => {
        const next = new Map(prev);
        for (const n of rangeNodes) {
          if (!next.has(n.path)) {
            next.set(n.path, { path: n.path, pages: "" });
            newPaths.push(n.path);
          }
        }
        return next;
      });
      // Load page counts async for newly added files
      rangeNodes
        .filter((n) => newPaths.includes(n.path) && n.handle)
        .forEach(async (n) => {
          try {
            const file = await (n.handle as FileSystemFileHandle).getFile();
            const arrayBuffer = await file.arrayBuffer();
            const pageCount = await getPageCount(arrayBuffer);
            setSelections((prev) => {
              const next = new Map(prev);
              const existing = next.get(n.path);
              if (existing) next.set(n.path, { ...existing, pageCount });
              return next;
            });
          } catch (err) {
            // Page count fetch failed - non-critical
          }
        });
      return;
    }

    // Regular click on folder: navigate
    if (node.kind === "folder") {
      navigateInto(node);
      return;
    }

    // Regular click on file: preview
    if (node.kind === "file") {
      setLastClickedIndex(index);
      handlePreview(node);
    }
  }, [lastClickedIndex, sortedContents, toggleSelection, navigateInto, handlePreview]);

  // Checkbox click handler
  const handleCheckboxClick = useCallback((e: React.MouseEvent, node: TreeNode, index: number) => {
    e.stopPropagation();
    toggleSelection(node);
    setLastClickedIndex(index);
  }, [toggleSelection]);

  // Double click on file copies path
  const handleDoubleClick = useCallback((node: TreeNode) => {
    if (node.kind === "file") {
      handleCopyPath(node.path);
    }
  }, []);

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleClosePreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (cleanedPreviewUrl) URL.revokeObjectURL(cleanedPreviewUrl);
    setPreviewUrl(null);
    setPreviewNode(null);
    setCleanedPreviewUrl(null);
    setShowCleanedPreview(false);
  }, [previewUrl, cleanedPreviewUrl]);

  // Handle cleaned PDF from handwriting removal
  const handleCleanedPdf = useCallback((url: string | null) => {
    if (cleanedPreviewUrl) URL.revokeObjectURL(cleanedPreviewUrl);
    setCleanedPreviewUrl(url);
    if (url) setShowCleanedPreview(true);
  }, [cleanedPreviewUrl]);

  const handleOpenInNewTab = useCallback(async () => {
    if (previewNode?.handle) {
      const { openFileInNewTab } = await import("@/lib/file-system");
      await openFileInNewTab(previewNode.handle as FileSystemFileHandle);
    }
  }, [previewNode]);

  // Add folder handler
  const handleAddFolder = useCallback(async () => {
    try {
      const { addFolder } = await import("@/lib/file-system");
      const newFolder = await addFolder();
      if (newFolder) await loadRootFolders();
    } catch (err) {
      setError("Failed to add folder.");
    }
  }, []);

  // Remove folder handler
  const handleRemoveFolder = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Remove "${name}" from the folder list?\n\nThis won't delete the actual folder on disk.`)) return;
    try {
      const { removeFolder } = await import("@/lib/file-system");
      await removeFolder(id);
      await loadRootFolders();
    } catch (err) {
      setError("Failed to remove folder.");
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The summer matrix has no focusable rows; leave keys alone there.
      if (summerOpen) return;
      // Ctrl+F or / to focus search
      if ((e.ctrlKey && e.key === "f") || (e.key === "/" && !(e.target instanceof HTMLInputElement))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Escape in search input clears it and unfocuses
      if (e.key === "Escape" && e.target === searchInputRef.current) {
        e.preventDefault();
        setSearchQuery("");
        searchInputRef.current?.blur();
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const totalItems = sortedContents.length;
      const getGridColumns = () => viewMode !== "grid" ? 1 : (window.innerWidth >= 640 ? 4 : 3);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (viewMode === "grid") {
            const cols = getGridColumns();
            setFocusedIndex((prev) => Math.min(prev + cols, totalItems - 1));
          } else {
            setFocusedIndex((prev) => Math.min(prev + 1, totalItems - 1));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (viewMode === "grid") {
            const cols = getGridColumns();
            setFocusedIndex((prev) => Math.max(prev - cols, 0));
          } else {
            setFocusedIndex((prev) => Math.max(prev - 1, 0));
          }
          break;
        case "ArrowLeft":
          if (viewMode === "grid") {
            e.preventDefault();
            setFocusedIndex((prev) => Math.max(prev - 1, 0));
          }
          break;
        case "ArrowRight":
          if (viewMode === "grid") {
            e.preventDefault();
            setFocusedIndex((prev) => Math.min(prev + 1, totalItems - 1));
          }
          break;
        case "Enter":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            const node = sortedContents[focusedIndex];
            if (node.kind === "folder") navigateInto(node);
            else handleDoubleClick(node);
          }
          break;
        case " ": // Space - toggle selection
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            const node = sortedContents[focusedIndex];
            if (node.kind === "file") {
              toggleSelection(node);
            }
          }
          break;
        case "a": // Ctrl+A - select all files
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const allFileSelections = new Map<string, FileSelection>();
            const fileNodes = sortedContents.filter((n) => n.kind === "file") as TreeNode[];
            fileNodes.forEach((n) => allFileSelections.set(n.path, { path: n.path, pages: "" }));
            setSelections(allFileSelections);
            // Load page counts async for all files
            fileNodes
              .filter((n) => n.handle)
              .forEach(async (n) => {
                try {
                  const file = await (n.handle as FileSystemFileHandle).getFile();
                  const arrayBuffer = await file.arrayBuffer();
                  const pageCount = await getPageCount(arrayBuffer);
                  setSelections((prev) => {
                    const next = new Map(prev);
                    const existing = next.get(n.path);
                    if (existing) next.set(n.path, { ...existing, pageCount });
                    return next;
                  });
                } catch {
                  // Non-critical - page count is optional
                }
              });
          }
          break;
        case "Escape": // Clear selection
          if (selections.size > 0) {
            e.preventDefault();
            clearFileSelections();
          }
          break;
        case "p":
        case "P":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            const node = sortedContents[focusedIndex];
            if (node.kind === "file") handlePreview(node);
          }
          break;
        case "Backspace":
          if (currentPath.length > 0) {
            e.preventDefault();
            navigateTo(currentPath.length - 2);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedIndex, sortedContents, currentPath, viewMode, navigateInto, navigateTo, handlePreview, handleDoubleClick, toggleSelection, selections, summerOpen]);

  // Reset focus when contents change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [currentContents]);

  const isAtRoot = currentPath.length === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent-ink" />
        <span className="ml-2 text-gray-500">Loading folders...</span>
      </div>
    );
  }

  // Without the summer entry an empty folder list has nothing to show, so
  // keep the setup hint as a full-pane state; with it, fall through so the
  // pinned summer folder still renders above the (empty) list.
  if (rootFolders.length === 0 && !error && !hasSummer) {
    return (
      <div className="flex justify-center py-12">
        <StickyNote variant="yellow" size="lg" showTape rotation={1}>
          <div className="text-center">
            <FolderTree className="h-12 w-12 mx-auto mb-4 text-accent-ink" />
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No folders configured</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              Set up shared drives in Settings → Path Mappings to browse files here.
            </p>
            {fsSupported && (
              <Button variant="primary" icon={FolderPlus} onClick={handleAddFolder} className="mx-auto">
                Add folder
              </Button>
            )}
          </div>
        </StickyNote>
      </div>
    );
  }

  return (
    <div className={cn("h-full flex gap-0 overflow-hidden", materialStyles.materialWorkspace)}>
      {/* Browser panel */}
      {/* Below md the preview takes over the whole tab (a 40% split leaves
          an unusable sliver on phones); the preview's X brings this back. */}
      <div className={cn("flex flex-col", previewUrl ? "max-md:hidden w-2/5 border-r border-line" : "w-full")}>
        {/* Header: Breadcrumb + Controls */}
        <div data-material-browser-bar className="p-3 border-b border-line space-y-2">
          {/* Row 1: Breadcrumb + View toggle */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto">
              <button
                onClick={() => { setSummerOpen(false); navigateTo(-1); }}
                className={cn(
                  "shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
                  isAtRoot && !summerOpen && "text-amber-700"
                )}
                title="Root"
              >
                <Home className="h-4 w-4" />
              </button>
              {isAtRoot && !summerOpen && fsSupported && (
                <IconButton icon={FolderPlus} size="sm" label="Add local folder" onClick={handleAddFolder} className="ml-1" />
              )}
              {summerOpen && (
                <>
                  <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
                    <Sun className="h-3.5 w-3.5" />
                    Summer Course {SUMMER_YEAR}
                  </span>
                </>
              )}
              {currentPath.map((segment, i) => (
                <Fragment key={i}>
                  <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />
                  <button
                    onClick={() => navigateTo(i)}
                    className={cn(
                      "hover:text-amber-700 truncate max-w-[120px] transition-colors",
                      i === currentPath.length - 1 && "font-medium text-amber-700 dark:text-amber-400"
                    )}
                    title={segment}
                  >
                    {segment}
                  </button>
                </Fragment>
              ))}
            </div>

            {/* View toggle */}
            {!summerOpen && (
            <Segmented
              label="View"
              value={viewMode}
              onChange={setViewMode}
              className="shrink-0"
              options={[
                { value: "list", icon: List, title: "List view", label: <span className="sr-only">List view</span> },
                { value: "grid", icon: LayoutGrid, title: "Grid view", label: <span className="sr-only">Grid view</span> },
              ]}
            />
            )}
          </div>

          {/* Row 2: Sort + Search + Item count (not applicable to the summer matrix) */}
          {!summerOpen && (
          <div className="flex items-center gap-3">
            <Select
              size="sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Sort files"
              className="w-auto"
            >
              <option value="name-asc">Name A→Z</option>
              <option value="name-desc">Name Z→A</option>
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
            </Select>

            {/* Search input */}
            <div className="relative flex-1 max-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
              <Input
                ref={searchInputRef}
                size="sm"
                placeholder="Filter... (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter files in this folder"
                className="pl-7 pr-7"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3 text-gray-500" />
                </button>
              )}
            </div>

            {loadingDates && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-700" />}
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              {searchQuery.trim()
                ? `${sortedContents.length} of ${sortedContentsRaw.length} items`
                : hasMore
                  ? `${displayedContents.length} of ${sortedContents.length} items`
                  : sortedContents.length > 0
                    ? `${sortedContents.length} item${sortedContents.length !== 1 ? "s" : ""}`
                    : ""}
            </span>
          </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <span className="flex-1 text-sm text-red-700 dark:text-red-300">{error}</span>
            <IconButton
              icon={X}
              size="sm"
              label="Dismiss"
              className="text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
              onClick={() => {
                setError(null);
                if (currentPath.length > 0) navigateTo(-1);
              }}
            />
            <IconButton
              icon={RefreshCw}
              size="sm"
              label="Retry"
              className="text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
              onClick={() => {
                setError(null);
                if (currentHandle && currentPath.length > 0) {
                  const rootFolder = rootFolders.find(f => f.name === currentPath[0]);
                  loadFolderContents(currentHandle, currentPath.join("\\"), rootFolder?.id);
                } else {
                  loadRootFolders();
                }
              }}
            />
          </div>
        )}

        {/* Selection panel - shows when files are selected with page range inputs */}
        <BrowseSelectionPanel
          selections={selections}
          onUpdatePages={updateSelectionPages}
          onRemove={removeSelection}
          onClear={clearFileSelections}
          onAssign={() => setSessionSelectorOpen(true)}
        />

        {/* Content area */}
        <div ref={contentScrollRef} onFocusCapture={event => {
          const file = event.target.closest<HTMLElement>("[data-material-file]");
          const index = sortedContents.findIndex(node => node.path === file?.dataset.materialFile);
          if (index >= 0) setFocusedIndex(index);
        }} className="flex-1 overflow-y-auto p-3">
          {/* Pinned summer entry: a virtual folder over the scanned courseware
              drive (not in Paperless or the saved-folder list). */}
          {isAtRoot && hasSummer && !summerOpen && !contentsLoading && (
            <div
              onClick={() => setSummerOpen(true)}
              className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg cursor-pointer border border-[#e8d4b8] dark:border-[#5a4d3a] bg-[#fdf6ec]/70 dark:bg-[#2a2318]/60 hover:bg-[#f8eedd] dark:hover:bg-[#332b1c] transition-colors"
            >
              <div className="w-3.5" />
              <Sun className="h-5 w-5 text-amber-700 shrink-0" />
              <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                Summer Course {SUMMER_YEAR}
              </span>
              <span className="text-xs text-ink-subtle shrink-0">
                Courseware drive
              </span>
              <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />
            </div>
          )}
          {summerOpen && summerIndex ? (
            <div className="space-y-4">
              {summerDrive.connected === false && (
                <ConnectDriveButton
                  onClick={summerDrive.connect}
                  title="Pick the courseware Finalised folder once on this computer so chips can open PDFs"
                  label="Connect drive to open PDFs"
                  size="sm"
                />
              )}
              <CoursewareMatrix
                index={summerIndex}
                totalLessons={null}
                onOpenFile={handleSummerFileOpen}
              />
            </div>
          ) : contentsLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : sortedContents.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No PDF files in this folder</p>
            </div>
          ) : viewMode === "list" ? (
            /* LIST VIEW */
            <div className="space-y-0.5">
              {displayedContents.map((node, index) => {
                const isFocused = focusedIndex === index;
                const isSelected = selections.has(node.path);
                const isHovered = hoveredPath === node.path;
                const showCheckbox = node.kind === "file" && (isHovered || isSelected);

                return (
                  <div
                    key={node.id}
                    data-material-file={node.path}
                    tabIndex={-1}
                    ref={(el) => { itemRefs.current[index] = el; }}
                    onClick={(e) => handleSingleClick(e, node, index)}
                    onDoubleClick={() => handleDoubleClick(node)}
                    onMouseEnter={() => setHoveredPath(node.path)}
                    onMouseLeave={() => setHoveredPath(null)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all group",
                      "hover:bg-wash",
                      isSelected && "bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-300 dark:ring-amber-700",
                      isFocused && !isSelected && "ring-2 ring-amber-400/50 bg-amber-50/50 dark:bg-amber-900/30"
                    )}
                  >
                    {/* Checkbox - visible on hover or when selected */}
                    {node.kind === "file" && (
                      <div className={cn(
                        "transition-opacity duration-100",
                        // Only hide where hover exists to reveal it; touch keeps it visible.
                        showCheckbox ? "opacity-100" : "pointer-fine:opacity-0 pointer-fine:pointer-events-none"
                      )}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={(e) => handleCheckboxClick(e, node, index)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-amber-700 focus:ring-amber-500 cursor-pointer"
                        />
                      </div>
                    )}
                    {/* Spacer for folders to maintain alignment */}
                    {node.kind === "folder" && <div className="w-3.5" />}

                    {/* Icon */}
                    {node.kind === "folder" ? (
                      node.isShared ? <FolderSync className="h-5 w-5 text-green-700 shrink-0" /> :
                      <Folder className="h-5 w-5 text-amber-700 shrink-0" />
                    ) : (
                      <FileText className="h-5 w-5 text-red-600 shrink-0" />
                    )}

                    {/* Name */}
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate" title={node.name}>
                      {node.name}
                    </span>

                    {/* Warning for unavailable folders */}
                    {node.kind === "folder" && unavailableFolders.has(node.id) && (
                      <span title="Folder unavailable"><AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" /></span>
                    )}
                    {node.kind === "folder" && <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />}

                    {/* Copy path button for files */}
                    {node.kind === "file" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopyPath(node.path); }}
                        className={cn(
                          "p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-opacity duration-150",
                          copiedPath === node.path || isFocused
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100"
                        )}
                        title="Copy path"
                      >
                        {copiedPath === node.path ? <Check className="h-3.5 w-3.5 text-green-700" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
                      </button>
                    )}

                    {/* Remove folder button at root */}
                    {isAtRoot && node.kind === "folder" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveFolder(node.id, node.name); }}
                        className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600"
                        title="Remove folder"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* GRID VIEW */
            <div key={currentPath.join("/")} className={cn("grid grid-cols-3 sm:grid-cols-4", materialStyles.materialGrid)}>
              {displayedContents.map((node, index) => {
                const isFocused = focusedIndex === index;
                const isSelected = selections.has(node.path);
                const isHovered = hoveredPath === node.path;
                const showCheckbox = node.kind === "file" && (isHovered || isSelected);

                return (
                  <div
                    key={node.id}
                    ref={(el) => { itemRefs.current[index] = el; }}
                    onClick={(e) => handleSingleClick(e, node, index)}
                    onDoubleClick={() => handleDoubleClick(node)}
                    onMouseEnter={() => setHoveredPath(node.path)}
                    onMouseLeave={() => setHoveredPath(null)}
                    data-material-file={node.path}
                    tabIndex={-1}
                    data-selected={isSelected || previewNode?.path === node.path}
                    data-focused={isFocused}
                    className={cn("group", materialStyles.materialTile)}
                  >
                    {/* Checkbox overlay - visible on hover or when selected */}
                    {node.kind === "file" && (
                      <div className={cn(
                        "absolute top-1 left-1 transition-opacity duration-100",
                        showCheckbox ? "opacity-100" : "pointer-fine:opacity-0 pointer-fine:pointer-events-none"
                      )}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={(e) => handleCheckboxClick(e, node, index)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-amber-700 focus:ring-amber-500 cursor-pointer"
                        />
                      </div>
                    )}

                    {/* Remove folder button at root */}
                    {isAtRoot && node.kind === "folder" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveFolder(node.id, node.name); }}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600"
                        title="Remove folder"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Warning for unavailable folders */}
                    {node.kind === "folder" && unavailableFolders.has(node.id) && (
                      <div className="absolute top-1 left-1 p-0.5 rounded bg-amber-100 dark:bg-amber-900/50" title="Folder unavailable">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                      </div>
                    )}

                    <FileArtwork folder={node.kind === "folder"} shared={node.isShared} cover={selectedCover?.source === node.path ? selectedCover.image : null} />

                    {/* Name */}
                    <span className="text-xs text-center text-gray-700 dark:text-gray-300 truncate w-full" title={node.name}>
                      {node.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Show more button */}
          {hasMore && (
            <Button
              variant="quiet"
              onClick={() => setDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
              className="w-full mt-2"
            >
              Show {Math.min(remainingCount, ITEMS_PER_PAGE)} more
              <span className="text-ink-subtle">({remainingCount} remaining)</span>
            </Button>
          )}
        </div>

        {/* Footer: Keyboard hints (pointless on touch, so reclaim the space) */}
        <div className="pointer-coarse:hidden p-2 border-t border-line text-[11px] text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">
              {viewMode === "grid" ? "←↑↓→" : "↑↓"}
            </kbd>
            <span>navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">Space</kbd>
            <span>select</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">Ctrl+A</kbd>
            <span>all</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">P</kbd>
            <span>preview</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">Enter</kbd>
            <span>open / copy</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">⌫</kbd>
            <span>back</span>
          </span>
        </div>
      </div>

      {/* Preview panel */}
      {previewUrl && (
        <CompactErrorBoundary>
        <BrowsePdfPreview
          previewUrl={previewUrl}
          previewNode={previewNode}
          previewLoading={previewLoading}
          zoomIndex={zoomIndex}
          onZoomIn={() => setZoomIndex((i) => Math.min(i + 1, ZOOM_LEVELS.length - 1))}
          onZoomOut={() => setZoomIndex((i) => Math.max(i - 1, 0))}
          onOpenInNewTab={handleOpenInNewTab}
          onClose={handleClosePreview}
          onCopyPath={handleCopyPath}
          copiedPath={copiedPath}
          onAssign={() => {
            if (previewNode) {
              setSelections(new Map([[previewNode.path, { path: previewNode.path, pages: "" }]]));
              setSessionSelectorOpen(true);
            }
          }}
          cleanedPreviewUrl={cleanedPreviewUrl}
          showCleanedPreview={showCleanedPreview}
          onCleanedPdf={handleCleanedPdf}
          onToggleCleaned={() => setShowCleanedPreview(!showCleanedPreview)}
        />
        </CompactErrorBoundary>
      )}

      {/* Session Selector Modal */}
      <SessionSelectorModal
        isOpen={sessionSelectorOpen}
        onClose={() => setSessionSelectorOpen(false)}
        files={Array.from(selections.values())}
        onAssignComplete={() => {
          setSessionSelectorOpen(false);
          clearFileSelections();
        }}
      />
    </div>
  );
}

// Tree node for browser tab
interface TreeNode {
  id: string;
  name: string;
  path: string;
  kind: "folder" | "file";
  handle?: FileSystemDirectoryHandle | FileSystemFileHandle;
  isShared?: boolean;
  lastModified?: number;
}


function CoursewareSearchTab() {
  return <CoursewareWorkspace />;
}

export default function CoursewarePage() {
  usePageTitle("Courseware");

  const router = useRouter();
  const searchParams = useSearchParams();

  // Warm the summer index cache on page load so the Browse tab's pinned
  // summer entry renders with the folder list instead of popping in after
  // its own fetch (preload dedupes with the tab's useSWR on the same key).
  useEffect(() => {
    preload(["summer-courseware-index", SUMMER_YEAR, null], () =>
      summerCoursewareAPI.getIndex(SUMMER_YEAR)
    );
  }, []);

  // Tab state
  const [activeTab, setActiveTab] = useState<CoursewareTab>(() => {
    return (searchParams.get("tab") as CoursewareTab) || "ranking";
  });

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

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
      .catch(() => { /* School fetch failed - non-critical */ });
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
    if (activeTab !== "ranking") params.set("tab", activeTab);
    if (timeRange !== "recent") params.set("range", timeRange);
    if (exerciseType !== "All") params.set("type", exerciseType);
    if (grade !== "All") params.set("grade", grade);
    if (school) params.set("school", school);
    const query = params.toString();
    router.replace(`/courseware${query ? `?${query}` : ""}`, { scroll: false });
  }, [activeTab, timeRange, exerciseType, grade, school, router]);

  // Close filters dropdown on click outside
  useEffect(() => {
    if (!filtersOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filtersOpen]);

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

  // Toolbar: the outer div is a clean sticky container and the inner one gives
  // it a solid page colour, so the list doesn't show through while it sticks.
  // Sticky breaks if applied to the same element as the flex layout, so the two
  // responsibilities are split (matches the Sessions page). The header draws
  // its own hairline, so there is no box any more.
  const toolbarStickyClasses = "sticky top-0 z-30";
  const toolbarInnerClasses = "surface-bar pt-2";

  // Segmented button component for time range
  const TimeRangeToggle = () => (
    <Segmented
      label="Time range"
      value={timeRange}
      onChange={setTimeRange}
      options={[
        { value: "recent", label: "Last 14 days" },
        { value: "all-time", label: "All time" },
      ]}
    />
  );

  // Filter dropdown component
  const FilterDropdown = ({
    id,
    value,
    options,
    onChange,
    label,
  }: {
    id: string;
    value: string;
    options: string[];
    onChange: (val: string) => void;
    label: string;
  }) => (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt === "All" ? `All ${label.toLowerCase()}` : opt}
        </option>
      ))}
    </Select>
  );

  return (
    <PageSurface fullHeight>
      <PageTransition className="flex-1 overflow-y-auto">
        {/* Browse/search fill the visible area exactly (their boxes are
            flex-1, so the mobile header and stacked toolbar are accounted
            for naturally); ranking keeps the normal page scroll. */}
        <div className={cn("flex flex-col gap-3 p-4 sm:p-6", activeTab !== "ranking" && "h-full")}>
          {/* Toolbar */}
          <div className={toolbarStickyClasses}>
            <div className={toolbarInnerClasses}>
            <PageHeader icon={BookOpen} title="Courseware" className="pb-2">
              <div className="h-6 w-px bg-line hidden sm:block" />

              {/* Tab navigation */}
              <Segmented
                label="Courseware sections"
                value={activeTab}
                onChange={setActiveTab}
                options={TABS.map((tab) => ({
                  value: tab.id,
                  icon: tab.icon,
                  title: tab.label,
                  label: <span className="hidden sm:inline">{tab.label}</span>,
                }))}
              />

              {/* Filters - only show for ranking tab */}
              {activeTab === "ranking" && (
                <>
                  <TimeRangeToggle />

                  {/* Collapsible filters dropdown */}
                  <div className="relative" ref={filterRef}>
                    {(() => {
                      const activeCount = [
                        exerciseType !== "All",
                        grade !== "All",
                        school !== "",
                      ].filter(Boolean).length;

                      return (
                        <Button
                          icon={Filter}
                          onClick={() => setFiltersOpen(!filtersOpen)}
                          aria-expanded={filtersOpen}
                          className={cn(filtersOpen && "bg-tint")}
                        >
                          Filters
                          <CountBadge count={activeCount} tone="neutral" />
                          <ChevronDown className={cn("h-4 w-4 text-ink-subtle transition-transform", filtersOpen && "rotate-180")} aria-hidden="true" />
                        </Button>
                      );
                    })()}

                    {filtersOpen && (
                      <div className="absolute top-full mt-1 right-0 z-50 bg-raised border border-line-strong dark:border-line rounded-lg shadow-lg p-4 min-w-[280px]">
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col">
                            <span className={cn(LABEL_CLASS, "mb-1")}>Type</span>
                            {/* CW and HW keep their red and blue on the icon, so the two read apart at a glance. */}
                            <Segmented
                              label="Exercise type"
                              value={exerciseType}
                              onChange={setExerciseType}
                              options={[
                                { value: "All", label: "All" },
                                { value: "CW", label: "CW", icon: PenTool, iconClassName: "text-red-600 dark:text-red-400" },
                                { value: "HW", label: "HW", icon: Home, iconClassName: "text-blue-600 dark:text-blue-400" },
                              ]}
                            />
                          </div>

                          <div className="flex flex-col">
                            <Label htmlFor="courseware-ranking-grade">Grade</Label>
                            <FilterDropdown
                              id="courseware-ranking-grade"
                              value={grade}
                              options={GRADE_OPTIONS}
                              onChange={setGrade}
                              label="Grades"
                            />
                          </div>

                          <div className="flex flex-col">
                            <Label htmlFor="courseware-ranking-school">School</Label>
                            <SchoolAutocomplete
                              id="courseware-ranking-school"
                              value={school}
                              onChange={setSchool}
                              suggestions={schools}
                            />
                          </div>

                          {/* Clear button */}
                          {(exerciseType !== "All" || grade !== "All" || school !== "") && (
                            <Button
                              variant="quiet"
                              icon={X}
                              onClick={() => {
                                setExerciseType("All");
                                setGrade("All");
                                setSchool("");
                              }}
                            >
                              Clear filters
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </PageHeader>
            </div>
          </div>

          {/* Ranking Tab Content */}
          {activeTab === "ranking" && (
            <>
              {/* Loading state */}
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-accent-ink" />
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
                    "bg-raised rounded-lg border-2 border-line-strong overflow-hidden",
                    !isMobile && "paper-texture",
                    "animate-fade-in"
                  )}
                >
                  {/* Header */}
                  <div className="px-4 py-3 bg-tint border-b border-[#d4a574]/30 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-2">
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
                      <BookOpen className="h-12 w-12 mx-auto mb-4 text-accent-ink" />
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
            </>
          )}

          {/* Browse Tab Content */}
          {activeTab === "browse" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <CoursewareBrowserTab />
            </div>
          )}

          {/* Search Tab Content */}
          {activeTab === "search" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <CoursewareSearchTab />
            </div>
          )}
        </div>

        <ScrollToTopButton />
      </PageTransition>
    </PageSurface>
  );
}
