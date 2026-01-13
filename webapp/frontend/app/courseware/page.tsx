"use client";

import React, { useState, useEffect, useCallback, useRef, Fragment, useMemo } from "react";
import Fuse from "fuse.js";
import { motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useCoursewarePopularity, useCoursewareUsageDetail, usePageTitle } from "@/lib/hooks";
import { useMapSelection, type DocSelection } from "@/lib/use-selection";
import { useLocation } from "@/contexts/LocationContext";
import { DeskSurface } from "@/components/layout/DeskSurface";
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
  ZoomIn,
  ZoomOut,
  Trash2,
  Filter,
  Tag,
  Eye,
  Flame,
  User,
} from "lucide-react";
import { studentsAPI, api, type PaperlessSearchMode, type PaperlessTagMatchMode } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CopyPathButton } from "@/components/ui/copy-path-button";
import Link from "next/link";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { PdfPreviewModal } from "@/components/ui/pdf-preview-modal";
import { getRecentDocuments, addRecentDocument, clearRecentDocuments, type RecentDocument } from "@/lib/shelv-storage";
import { FolderTreeModal, type FileSelection, validatePageInput } from "@/components/ui/folder-tree-modal";
import { getPageCount } from "@/lib/pdf-utils";
import { SessionSelectorModal } from "@/components/sessions/SessionSelectorModal";
import { HandwritingRemovalToolbar } from "@/components/ui/handwriting-removal-toolbar";
import { BrowsePdfPreview } from "@/components/courseware/BrowsePdfPreview";
import { BrowseSelectionPanel } from "@/components/courseware/BrowseSelectionPanel";
import { SearchSelectionBar } from "@/components/courseware/SearchSelectionBar";
import { CalendarPlus } from "lucide-react";
import type { CoursewarePopularity, CoursewareUsageDetail } from "@/types";
import { getDocumentPath, getTrendingPath, type ExtendedPaperlessDocument } from "@/lib/courseware-utils";

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

// Tab definitions
type CoursewareTab = "ranking" | "browse" | "search";
const TABS: { id: CoursewareTab; label: string; icon: typeof BarChart3 }[] = [
  { id: "ranking", label: "Ranking", icon: BarChart3 },
  { id: "browse", label: "Browse", icon: FolderTree },
  { id: "search", label: "Search", icon: Search },
];

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
  const [zoomIndex, setZoomIndex] = useState(2);
  // Handwriting removal state
  const [cleanedPreviewUrl, setCleanedPreviewUrl] = useState<string | null>(null);
  const [showCleanedPreview, setShowCleanedPreview] = useState(false);

  const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];
  const currentZoom = ZOOM_LEVELS[zoomIndex];

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
      console.error(err);
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

      setCurrentContents(contents);
      setDisplayLimit(ITEMS_PER_PAGE);
    } catch (err) {
      console.error("Failed to load folder contents:", err);
      const message = err instanceof Error ? err.message : "Failed to load folder contents.";
      setError(message);
      if (folderId && (message.includes("timeout") || message.includes("unavailable"))) {
        setUnavailableFolders((prev) => new Set(prev).add(folderId));
      }
    } finally {
      setContentsLoading(false);
    }
  }, []);

  // Navigate into a folder
  const navigateInto = useCallback(async (node: TreeNode) => {
    if (node.kind !== "folder" || !node.handle) return;
    const dirHandle = node.handle as FileSystemDirectoryHandle;
    // At root level, use node.path which has brackets for alias folders
    // For subfolders, use node.name (just the folder name)
    const segment = currentPath.length === 0 ? node.path : node.name;
    const newPath = [...currentPath, segment];
    setSearchQuery(""); // Clear search when navigating
    setCurrentPath(newPath);
    setCurrentHandle(dirHandle);
    await loadFolderContents(dirHandle, newPath.join("\\"), node.id);
    if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
  }, [currentPath, loadFolderContents]);

  // Navigate via breadcrumb
  const navigateTo = useCallback(async (index: number) => {
    setSearchQuery(""); // Clear search when navigating
    if (index === -1) {
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
      } catch {
        return;
      }
    }

    setCurrentPath(newPath);
    setCurrentHandle(handle);
    await loadFolderContents(handle, newPath.join("\\"));
  }, [currentPath, rootFolders, loadFolderContents]);

  // Sort nodes
  const sortNodes = useCallback((nodes: TreeNode[]): TreeNode[] => {
    return [...nodes].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      switch (sortBy) {
        case "date-desc": return (b.lastModified || 0) - (a.lastModified || 0);
        case "date-asc": return (a.lastModified || 0) - (b.lastModified || 0);
        case "name-desc": return b.name.localeCompare(a.name);
        case "name-asc":
        default: return a.name.localeCompare(b.name);
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
      console.error(err);
      setError("Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [previewUrl]);

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
          console.warn("Failed to get page count:", err);
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
            console.warn("Failed to get page count:", err);
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
      console.error("Failed to add folder:", err);
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
      console.error("Failed to remove folder:", err);
      setError("Failed to remove folder.");
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
                } catch (err) {
                  console.warn("Failed to get page count:", err);
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
  }, [focusedIndex, sortedContents, currentPath, viewMode, navigateInto, navigateTo, handlePreview, handleDoubleClick, toggleSelection, selections]);

  // Reset focus when contents change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [currentContents]);

  const isAtRoot = currentPath.length === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
        <span className="ml-2 text-gray-500">Loading folders...</span>
      </div>
    );
  }

  if (rootFolders.length === 0 && !error) {
    return (
      <div className="flex justify-center py-12">
        <StickyNote variant="yellow" size="lg" showTape rotation={1}>
          <div className="text-center">
            <FolderTree className="h-12 w-12 mx-auto mb-4 text-[#a0704b]" />
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No folders configured</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              Set up shared drives in Settings → Path Mappings to browse files here.
            </p>
            <button
              onClick={handleAddFolder}
              className="flex items-center gap-2 mx-auto px-4 py-2 rounded bg-[#a0704b] text-white hover:bg-[#8b6340]"
            >
              <FolderPlus className="h-4 w-4" />
              Add Folder
            </button>
          </div>
        </StickyNote>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4 bg-white dark:bg-[#1a1a1a] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden">
      {/* Browser panel */}
      <div className={cn("flex flex-col", previewUrl ? "w-2/5 border-r border-[#e8d4b8] dark:border-[#6b5a4a]" : "w-full")}>
        {/* Header: Breadcrumb + Controls */}
        <div className="p-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] space-y-2">
          {/* Row 1: Breadcrumb + View toggle */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto">
              <button
                onClick={() => navigateTo(-1)}
                className={cn(
                  "shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
                  isAtRoot && "text-amber-600"
                )}
                title="Root"
              >
                <Home className="h-4 w-4" />
              </button>
              {isAtRoot && (
                <button
                  onClick={handleAddFolder}
                  className="shrink-0 ml-1 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-amber-500"
                  title="Add local folder"
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
              )}
              {currentPath.map((segment, i) => (
                <Fragment key={i}>
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  <button
                    onClick={() => navigateTo(i)}
                    className={cn(
                      "hover:text-amber-500 truncate max-w-[120px] transition-colors",
                      i === currentPath.length - 1 && "font-medium text-amber-600 dark:text-amber-400"
                    )}
                    title={segment}
                  >
                    {segment}
                  </button>
                </Fragment>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-0.5 border border-gray-300 dark:border-gray-600 rounded-md p-0.5 shrink-0">
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1 rounded transition-colors",
                  viewMode === "list"
                    ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                )}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1 rounded transition-colors",
                  viewMode === "grid"
                    ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                )}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Row 2: Sort + Search + Item count */}
          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-400"
            >
              <option value="name-asc">Name A→Z</option>
              <option value="name-desc">Name Z→A</option>
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
            </select>

            {/* Search input */}
            <div className="relative flex-1 max-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Filter... (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-7 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  title="Clear search"
                >
                  <X className="h-3 w-3 text-gray-400" />
                </button>
              )}
            </div>

            {loadingDates && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />}
            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
              {searchQuery.trim()
                ? `${sortedContents.length} of ${sortedContentsRaw.length} items`
                : hasMore
                  ? `${displayedContents.length} of ${sortedContents.length} items`
                  : sortedContents.length > 0
                    ? `${sortedContents.length} item${sortedContents.length !== 1 ? "s" : ""}`
                    : ""}
            </span>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <span className="flex-1 text-sm text-red-700 dark:text-red-300">{error}</span>
            <button
              onClick={() => {
                setError(null);
                if (currentPath.length > 0) navigateTo(-1);
              }}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-800 text-red-500"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setError(null);
                if (currentHandle && currentPath.length > 0) {
                  const rootFolder = rootFolders.find(f => f.name === currentPath[0]);
                  loadFolderContents(currentHandle, currentPath.join("\\"), rootFolder?.id);
                } else {
                  loadRootFolders();
                }
              }}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-800 text-red-500"
              title="Retry"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
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
        <div ref={contentScrollRef} className="flex-1 overflow-y-auto p-3">
          {contentsLoading ? (
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
                    ref={(el) => { itemRefs.current[index] = el; }}
                    onClick={(e) => handleSingleClick(e, node, index)}
                    onDoubleClick={() => handleDoubleClick(node)}
                    onMouseEnter={() => setHoveredPath(node.path)}
                    onMouseLeave={() => setHoveredPath(null)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all group",
                      "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]",
                      isSelected && "bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-300 dark:ring-amber-700",
                      isFocused && !isSelected && "ring-2 ring-amber-400/50 bg-amber-50/50 dark:bg-amber-900/30"
                    )}
                  >
                    {/* Checkbox - visible on hover or when selected */}
                    {node.kind === "file" && (
                      <div className={cn(
                        "transition-opacity duration-100",
                        showCheckbox ? "opacity-100" : "opacity-0 pointer-events-none"
                      )}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={(e) => handleCheckboxClick(e, node, index)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        />
                      </div>
                    )}
                    {/* Spacer for folders to maintain alignment */}
                    {node.kind === "folder" && <div className="w-3.5" />}

                    {/* Icon */}
                    {node.kind === "folder" ? (
                      node.isShared ? <FolderSync className="h-5 w-5 text-green-500 shrink-0" /> :
                      <Folder className="h-5 w-5 text-amber-500 shrink-0" />
                    ) : (
                      <FileText className="h-5 w-5 text-red-500 shrink-0" />
                    )}

                    {/* Name */}
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate" title={node.name}>
                      {node.name}
                    </span>

                    {/* Warning for unavailable folders */}
                    {node.kind === "folder" && unavailableFolders.has(node.id) && (
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" title="Folder unavailable" />
                    )}
                    {node.kind === "folder" && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}

                    {/* Copy path button for files */}
                    {node.kind === "file" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopyPath(node.path); }}
                        className={cn(
                          "p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-opacity duration-150",
                          copiedPath === node.path || isFocused
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        )}
                        title="Copy path"
                      >
                        {copiedPath === node.path ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
                      </button>
                    )}

                    {/* Remove folder button at root */}
                    {isAtRoot && node.kind === "folder" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveFolder(node.id, node.name); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
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
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
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
                    className={cn(
                      "flex flex-col items-center gap-1 p-3 rounded-lg cursor-pointer transition-all relative group",
                      "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] border border-transparent",
                      "hover:border-amber-200 dark:hover:border-amber-700",
                      isSelected && "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700",
                      isFocused && !isSelected && "ring-2 ring-amber-400/50 border-amber-200"
                    )}
                  >
                    {/* Checkbox overlay - visible on hover or when selected */}
                    {node.kind === "file" && (
                      <div className={cn(
                        "absolute top-1 left-1 transition-opacity duration-100",
                        showCheckbox ? "opacity-100" : "opacity-0 pointer-events-none"
                      )}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={(e) => handleCheckboxClick(e, node, index)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        />
                      </div>
                    )}

                    {/* Remove folder button at root */}
                    {isAtRoot && node.kind === "folder" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveFolder(node.id, node.name); }}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                        title="Remove folder"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Warning for unavailable folders */}
                    {node.kind === "folder" && unavailableFolders.has(node.id) && (
                      <div className="absolute top-1 left-1 p-0.5 rounded bg-amber-100 dark:bg-amber-900/50" title="Folder unavailable">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                    )}

                    {/* Icon */}
                    {node.kind === "folder" ? (
                      node.isShared ? <FolderSync className="h-10 w-10 text-green-500" /> : <Folder className="h-10 w-10 text-amber-500" />
                    ) : (
                      <FileText className="h-10 w-10 text-red-500" />
                    )}

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
            <button
              onClick={() => setDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
              className="w-full py-3 mt-2 text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Show {Math.min(remainingCount, ITEMS_PER_PAGE)} more
              <span className="text-gray-400">({remainingCount} remaining)</span>
            </button>
          )}
        </div>

        {/* Footer: Keyboard hints */}
        <div className="p-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] text-[10px] text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-1">
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


// Search mode options
const SEARCH_MODE_OPTIONS: { value: PaperlessSearchMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "title", label: "Title" },
  { value: "content", label: "Content" },
  { value: "advanced", label: "Advanced" },
];

// Search tab - Shelv search interface with full features
function CoursewareSearchTab() {
  const { location } = useLocation();
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Search state
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchMode, setSearchMode] = useState<PaperlessSearchMode>("all");
  const [showAdvancedHints, setShowAdvancedHints] = useState(false);

  // Results state
  const [results, setResults] = useState<ExtendedPaperlessDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tag filtering
  const [availableTags, setAvailableTags] = useState<{ id: number; name: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagMatchMode, setTagMatchMode] = useState<PaperlessTagMatchMode>("all");
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Pagination
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const RESULTS_PER_PAGE = 30;

  // Preview
  const [previewDocId, setPreviewDocId] = useState<number | null>(null);
  const [previewDocTitle, setPreviewDocTitle] = useState<string>("");

  // Session assignment
  const [sessionSelectorOpen, setSessionSelectorOpen] = useState(false);
  const [assignSelections, setAssignSelections] = useState<{ path: string; pages: string }[]>([]);

  // Multi-select state (using shared hook)
  const {
    selections: selectedDocs,
    setSelections: setSelectedDocs,
    toggle: toggleDocSelection,
    remove: removeDocSelection,
    clear: clearDocSelections,
  } = useMapSelection<number, DocSelection>();

  // Keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // State ref for keyboard handler (avoids re-registering on every state change)
  const stateRef = useRef({
    results: [] as ExtendedPaperlessDocument[],
    focusedIndex: -1,
    recentDocs: [] as RecentDocument[],
    top10Trending: [] as CoursewarePopularity[],
    showHomeView: false,
    selectedDocs: new Map() as Map<number, { path: string; title: string }>,
  });

  // Check if showing home view (no query) - moved up for stateRef
  const showHomeView = !query.trim() && results.length === 0;

  // Home view
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);

  // Trending courseware
  const { data: trendingData, isLoading: trendingLoading } = useCoursewarePopularity({
    days: 14,
    limit: 10,
    grade: undefined,
    school: undefined,
  });

  // Memoize top 10 trending to avoid repeated slicing
  const top10Trending = useMemo(() => trendingData?.slice(0, 10) || [], [trendingData]);

  // Update stateRef for keyboard handler
  useEffect(() => {
    stateRef.current = { results, focusedIndex, recentDocs, top10Trending, showHomeView, selectedDocs };
  });

  // Load tags and recent docs on mount
  useEffect(() => {
    api.paperless.getTags()
      .then((response) => setAvailableTags(response.tags))
      .catch(() => setAvailableTags([]));
    setRecentDocs(getRecentDocuments());
  }, []);

  // Close tag dropdown on outside click
  useEffect(() => {
    if (!isTagDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setIsTagDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTagDropdownOpen]);

  // Debounce query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Search when debounced query or filters change
  const performSearch = useCallback(async (searchQuery: string, mode: PaperlessSearchMode, tagIds: number[], matchMode: PaperlessTagMatchMode, append = false, currentOffset = 0) => {
    if (!searchQuery.trim()) {
      if (!append) setResults([]);
      return;
    }

    if (append) {
      setIsLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await api.paperless.search(
        searchQuery,
        RESULTS_PER_PAGE,
        mode,
        tagIds.length > 0 ? tagIds : undefined,
        tagIds.length > 0 ? matchMode : undefined,
        currentOffset
      );

      if (append) {
        setResults(prev => [...prev, ...(response.results || [])]);
      } else {
        setResults(response.results || []);
      }
      setHasMore(response.has_more || false);
      setOffset(currentOffset + RESULTS_PER_PAGE);
    } catch (err) {
      console.error("Search failed:", err);
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Auto-search on filter changes
  useEffect(() => {
    if (debouncedQuery.trim()) {
      setOffset(0);
      performSearch(debouncedQuery, searchMode, selectedTagIds, tagMatchMode);
    }
  }, [debouncedQuery, searchMode, selectedTagIds, tagMatchMode, performSearch]);

  // Reset focused index when results change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [results]);

  // Handle tag toggle
  const handleTagToggle = (tagId: number) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  // Handle remove tag
  const handleRemoveTag = (tagId: number) => {
    setSelectedTagIds(prev => prev.filter(id => id !== tagId));
  };

  // Handle load more
  const handleLoadMore = () => {
    if (hasMore && !isLoadingMore) {
      performSearch(debouncedQuery, searchMode, selectedTagIds, tagMatchMode, true, offset);
    }
  };

  // Handle copy path
  const handleCopyPath = useCallback((filename: string) => {
    navigator.clipboard.writeText(filename);
    setCopiedPath(filename);
    setTimeout(() => setCopiedPath(null), 2000);
  }, []);

  // Handle preview
  const handlePreview = useCallback((docId: number, docTitle: string) => {
    setPreviewDocId(docId);
    setPreviewDocTitle(docTitle);
  }, []);

  // Toggle document selection for multi-select (using shared hook)
  const toggleSelection = useCallback((doc: ExtendedPaperlessDocument) => {
    toggleDocSelection(doc.id, { path: getDocumentPath(doc), title: doc.title });
  }, [toggleDocSelection]);

  // Toggle selection for recent documents (using shared hook)
  const toggleSelectionRecent = useCallback((doc: RecentDocument) => {
    toggleDocSelection(doc.id, { path: doc.path, title: doc.title });
  }, [toggleDocSelection]);

  // Toggle selection for trending items (use negative IDs to avoid collision)
  const toggleSelectionTrending = useCallback((item: CoursewarePopularity, index: number) => {
    const id = -(index + 1000); // Negative ID to avoid collision with doc IDs
    toggleDocSelection(id, { path: getTrendingPath(item), title: item.filename });
  }, [toggleDocSelection]);

  // Handle select from preview (adds to recent)
  const handleSelectFromPreview = (docId: number, title: string, filename: string) => {
    addRecentDocument({
      id: docId,
      title,
      path: filename,
      tags: [],
    });
    setRecentDocs(getRecentDocuments());
    handleCopyPath(filename);
  };

  // Keyboard navigation (uses capture phase to prevent scroll interference)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const { results, focusedIndex, recentDocs, top10Trending, showHomeView, selectedDocs: currentSelectedDocs } = stateRef.current;

      // Calculate total navigable items based on view
      const trendingCount = top10Trending.length;
      const totalItems = showHomeView
        ? trendingCount + recentDocs.length
        : results.length;

      // Ctrl+A / Cmd+A - select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && totalItems > 0) {
        e.preventDefault();
        e.stopPropagation();
        const newSelections = new Map(currentSelectedDocs);
        if (showHomeView) {
          top10Trending.forEach((item, index) => {
            const id = -(index + 1000);
            newSelections.set(id, { path: getTrendingPath(item), title: item.filename });
          });
          recentDocs.forEach(doc => {
            newSelections.set(doc.id, { path: doc.path, title: doc.title });
          });
        } else {
          results.forEach(doc => {
            const path = getDocumentPath(doc);
            newSelections.set(doc.id, { path, title: doc.title || path });
          });
        }
        setSelectedDocs(newSelections);
        return;
      }

      // Escape - clear selections
      if (e.key === "Escape" && currentSelectedDocs.size > 0) {
        e.preventDefault();
        clearDocSelections();
        return;
      }

      if (totalItems === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setFocusedIndex(prev => (prev < totalItems - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        if (showHomeView) {
          if (focusedIndex < trendingCount) {
            handleCopyPath(getTrendingPath(top10Trending[focusedIndex]));
          } else {
            const recentDoc = recentDocs[focusedIndex - trendingCount];
            if (recentDoc) handleCopyPath(recentDoc.path);
          }
        } else {
          const doc = results[focusedIndex];
          if (doc) handleCopyPath(getDocumentPath(doc));
        }
      } else if (e.key === " " && focusedIndex >= 0) {
        // Space - toggle selection
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (showHomeView) {
          if (focusedIndex < trendingCount) {
            const item = top10Trending[focusedIndex];
            toggleSelectionTrending(item, focusedIndex);
          } else {
            const recentDoc = recentDocs[focusedIndex - trendingCount];
            if (recentDoc) toggleSelectionRecent(recentDoc);
          }
        } else {
          const doc = results[focusedIndex];
          if (doc) toggleSelection(doc);
        }
      } else if ((e.key === "p" || e.key === "P") && focusedIndex >= 0) {
        // P - preview
        e.preventDefault();
        e.stopPropagation();
        if (showHomeView) {
          if (focusedIndex < trendingCount) {
            handlePreview(-1, getTrendingPath(top10Trending[focusedIndex]));
          } else {
            const recentDoc = recentDocs[focusedIndex - trendingCount];
            if (recentDoc) handlePreview(recentDoc.id, recentDoc.path);
          }
        } else {
          const doc = results[focusedIndex];
          if (doc) handlePreview(doc.id, doc.title || doc.original_file_name || "");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleCopyPath, handlePreview, toggleSelection, toggleSelectionRecent, toggleSelectionTrending]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && resultsContainerRef.current) {
      const items = resultsContainerRef.current.querySelectorAll("[data-result-item]");
      items[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden flex flex-col h-full">
      {/* Header with search controls */}
      <div className="p-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a] space-y-3">
        {/* Search Mode Tabs */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800 min-w-max sm:min-w-0">
            {SEARCH_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSearchMode(option.value)}
                className={cn(
                  "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap",
                  searchMode === option.value
                    ? "bg-white dark:bg-[#2a2a2a] text-amber-700 dark:text-amber-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courseware in Shelv..."
            className={cn(
              "w-full pl-10 pr-10 py-2.5 text-sm rounded-md",
              "bg-[#fef9f3] dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#6b5a4a]",
              "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
            )}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500 animate-spin" />
          )}
        </div>

        {/* Advanced mode hints */}
        {searchMode === "advanced" && (
          <div className="-mt-1">
            <button
              onClick={() => setShowAdvancedHints(!showAdvancedHints)}
              className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", showAdvancedHints && "rotate-180")} />
              {showAdvancedHints ? "Hide syntax tips" : "Show syntax tips"}
            </button>
            {showAdvancedHints && (
              <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 space-y-1 pl-4">
                <p>
                  <span className="font-medium text-gray-600 dark:text-gray-300">Boolean:</span>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">F1 AND algebra</code>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">factorisation OR factorization</code>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">integral NOT indices</code>
                </p>
                <p>
                  <span className="font-medium text-gray-600 dark:text-gray-300">Fields:</span>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">title:Exam</code>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">tag:SS</code>
                </p>
                <p>
                  <span className="font-medium text-gray-600 dark:text-gray-300">More:</span>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">"exact phrase"</code>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">test*</code>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">created:[2024 to 2025]</code>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tag Filter */}
        {availableTags.length > 0 && (
          <div className="space-y-2">
            {/* Tag dropdown */}
            <div className="relative" ref={tagDropdownRef}>
              <button
                onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all",
                  "bg-white dark:bg-[#2d2618]",
                  "border-[#d4a574] dark:border-[#6b5a4a]",
                  "text-gray-700 dark:text-gray-300",
                  "hover:border-amber-400 dark:hover:border-amber-600",
                  selectedTagIds.length > 0 && "border-amber-400 dark:border-amber-600"
                )}
              >
                <Tag className="h-4 w-4" />
                <span>Filter by tags{selectedTagIds.length > 0 && ` (${selectedTagIds.length})`}</span>
                <ChevronDown className={cn("h-4 w-4 ml-auto transition-transform", isTagDropdownOpen && "rotate-180")} />
              </button>

              {isTagDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] shadow-lg">
                  {availableTags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTagIds.includes(tag.id)}
                        onChange={() => handleTagToggle(tag.id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{tag.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* AND/OR toggle */}
            {selectedTagIds.length >= 2 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Match:</span>
                <button
                  onClick={() => setTagMatchMode("all")}
                  className={cn(
                    "px-2 py-0.5 rounded transition-colors",
                    tagMatchMode === "all"
                      ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  All (AND)
                </button>
                <button
                  onClick={() => setTagMatchMode("any")}
                  className={cn(
                    "px-2 py-0.5 rounded transition-colors",
                    tagMatchMode === "any"
                      ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  Any (OR)
                </button>
              </div>
            )}

            {/* Selected tags as chips */}
            {selectedTagIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedTagIds.map((tagId) => {
                  const tag = availableTags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <span
                      key={tagId}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                    >
                      {tag.name}
                      <button
                        onClick={() => handleRemoveTag(tagId)}
                        className="hover:bg-amber-200 dark:hover:bg-amber-800 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
        </div>
      )}

      {/* Selection panel */}
      <SearchSelectionBar
        selections={selectedDocs}
        onClear={clearDocSelections}
        onAssign={() => {
          const files = Array.from(selectedDocs.values()).map(d => ({ path: d.path, pages: "" }));
          setAssignSelections(files);
          setSessionSelectorOpen(true);
        }}
      />

      {/* Content area */}
      <div ref={resultsContainerRef} className="flex-1 overflow-y-auto">
        {/* Home View - shown when no query */}
        {showHomeView && (
          <div className="p-4 space-y-6">
            {/* Trending Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Flame className="h-5 w-5 text-orange-500" />
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Trending Courseware</h3>
              </div>
              {trendingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                </div>
              ) : top10Trending.length > 0 ? (
                <div className="space-y-1">
                  {top10Trending.map((item, index) => {
                    const trendingId = -(index + 1000);
                    return (
                      <div
                        key={item.stable_id || `trending-${index}`}
                        data-result-item
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                          "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]",
                          index < 3 && "bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-900/10",
                          focusedIndex === index && "ring-2 ring-amber-400/50 ring-inset",
                          selectedDocs.has(trendingId) && "bg-green-50 dark:bg-green-900/20"
                        )}
                        onClick={() => handleCopyPath(item.path || item.filename)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDocs.has(trendingId)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelectionTrending(item, index);
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
                        />
                        {index < 3 && <Flame className="h-4 w-4 text-orange-500 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {item.filename}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{item.assignment_count}× assignments</span>
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {item.unique_students}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopyPath(item.path || item.filename); }}
                          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          {copiedPath === (item.path || item.filename) ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 py-4 text-center">No trending data available</p>
              )}
            </div>

            {/* Recent Documents Section */}
            {recentDocs.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-gray-400" />
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Recent Documents</h3>
                  </div>
                  <button
                    onClick={() => { clearRecentDocuments(); setRecentDocs([]); }}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {recentDocs.map((doc, index) => {
                    const recentIndex = top10Trending.length + index;
                    return (
                      <div
                        key={doc.id}
                        data-result-item
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                          "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]",
                          focusedIndex === recentIndex && "ring-2 ring-amber-400/50 ring-inset",
                          selectedDocs.has(doc.id) && "bg-green-50 dark:bg-green-900/20"
                        )}
                        onClick={() => handleCopyPath(doc.path)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDocs.has(doc.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelectionRecent(doc);
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
                        />
                        <FileText className="h-4 w-4 text-red-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {doc.title}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{doc.path}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePreview(doc.id, doc.title); }}
                          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          <Eye className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state when no recent and no trending */}
            {recentDocs.length === 0 && top10Trending.length === 0 && !trendingLoading && (
              <div className="text-center py-12 text-gray-500">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Search for courseware files in Shelv</p>
              </div>
            )}
          </div>
        )}

        {/* Search Results */}
        {!showHomeView && (
          <>
            {results.length === 0 && !loading && query.trim() && (
              <div className="text-center py-12 text-gray-500">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No documents found</p>
              </div>
            )}
            {results.map((doc, index) => (
              <div
                key={doc.id}
                data-result-item
                className={cn(
                  "flex items-center gap-3 px-4 py-3 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 transition-colors cursor-pointer",
                  "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]",
                  focusedIndex === index && "bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-400/50 ring-inset",
                  selectedDocs.has(doc.id) && "bg-green-50 dark:bg-green-900/20"
                )}
                onClick={() => handleCopyPath(getDocumentPath(doc))}
              >
                <input
                  type="checkbox"
                  checked={selectedDocs.has(doc.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSelection(doc);
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
                />
                <FileText className="h-5 w-5 text-red-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {doc.title || doc.original_file_name}
                  </div>
                  {(doc.converted_path || doc.original_path) && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate" title={doc.converted_path || doc.original_path || undefined}>
                      {doc.converted_path || doc.original_path}
                    </div>
                  )}
                  {doc.correspondent_name && (
                    <div className="text-xs text-gray-500">{doc.correspondent_name}</div>
                  )}
                  {doc.tags && doc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {doc.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        >
                          {tag}
                        </span>
                      ))}
                      {doc.tags.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{doc.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePreview(doc.id, doc.title || doc.original_file_name || ""); }}
                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    title="Preview"
                  >
                    <Eye className="h-4 w-4 text-gray-400" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopyPath(getDocumentPath(doc)); }}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[#d4a574] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                  >
                    {copiedPath === getDocumentPath(doc) ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Copy
                  </button>
                </div>
              </div>
            ))}

            {/* Load more button */}
            {hasMore && (
              <div className="p-4 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    "Load more results"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Keyboard hints footer */}
      <div className="px-4 py-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] text-xs text-gray-400 dark:text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">↑↓</kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">Enter</kbd>
          copy
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">Space</kbd>
          preview
        </span>
      </div>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={previewDocId !== null}
        onClose={() => setPreviewDocId(null)}
        documentId={previewDocId}
        documentTitle={previewDocTitle}
        onAssign={() => {
          if (previewDocId) {
            const paperlessDoc = results.find(d => d.id === previewDocId);
            const recentDoc = recentDocs.find(d => d.id === previewDocId);
            const path = paperlessDoc ? getDocumentPath(paperlessDoc) : recentDoc?.path;
            if (path) {
              setAssignSelections([{ path, pages: "" }]);
              setSessionSelectorOpen(true);
            }
          }
          setPreviewDocId(null);
        }}
      />

      {/* Session Selector Modal */}
      <SessionSelectorModal
        isOpen={sessionSelectorOpen}
        onClose={() => setSessionSelectorOpen(false)}
        files={assignSelections}
        onAssignComplete={() => {
          setSessionSelectorOpen(false);
          setAssignSelections([]);
          clearDocSelections();
        }}
      />
    </div>
  );
}

export default function CoursewarePage() {
  usePageTitle("Courseware");

  const router = useRouter();
  const searchParams = useSearchParams();

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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full flex-wrap">
              {/* Title */}
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                  Courseware
                </h1>
              </div>

              <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

              {/* Tab navigation */}
              <div className="flex rounded-md border border-[#d4a574] dark:border-[#6b5a4a] overflow-hidden" role="tablist" aria-label="Courseware sections">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      className={cn(
                        "px-3 py-2 text-sm font-medium transition-colors min-h-[40px] flex items-center gap-1.5",
                        "focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#a0704b]/70",
                        "border-l border-[#d4a574] dark:border-[#6b5a4a] first:border-l-0",
                        activeTab === tab.id
                          ? "bg-[#a0704b] text-white"
                          : "bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

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
                        <button
                          onClick={() => setFiltersOpen(!filtersOpen)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md min-h-[40px]",
                            "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a]",
                            "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
                            "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50",
                            filtersOpen && "ring-2 ring-[#a0704b]/50"
                          )}
                        >
                          <Filter className="h-4 w-4" />
                          <span>Filters</span>
                          {activeCount > 0 && (
                            <span className="ml-1 h-5 w-5 flex items-center justify-center text-[10px] font-bold bg-[#a0704b] text-white rounded-full">
                              {activeCount}
                            </span>
                          )}
                          <ChevronDown className={cn("h-4 w-4 transition-transform", filtersOpen && "rotate-180")} />
                        </button>
                      );
                    })()}

                    {filtersOpen && (
                      <div className="absolute top-full mt-1 right-0 z-50 bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-lg shadow-lg p-4 min-w-[280px]">
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Type</label>
                            <div className="flex gap-1">
                              <button
                                onClick={() => setExerciseType("All")}
                                className={cn(
                                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                                  exerciseType === "All"
                                    ? "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                )}
                              >
                                All
                              </button>
                              <button
                                onClick={() => setExerciseType("CW")}
                                className={cn(
                                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1",
                                  exerciseType === "CW"
                                    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                )}
                              >
                                <PenTool className="h-3 w-3" />
                                CW
                              </button>
                              <button
                                onClick={() => setExerciseType("HW")}
                                className={cn(
                                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1",
                                  exerciseType === "HW"
                                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                )}
                              >
                                <Home className="h-3 w-3" />
                                HW
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Grade</label>
                            <FilterDropdown
                              value={grade}
                              options={GRADE_OPTIONS}
                              onChange={setGrade}
                              label="Grades"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">School</label>
                            <SchoolAutocomplete
                              value={school}
                              onChange={setSchool}
                              suggestions={schools}
                            />
                          </div>

                          {/* Clear button */}
                          {(exerciseType !== "All" || grade !== "All" || school !== "") && (
                            <button
                              onClick={() => {
                                setExerciseType("All");
                                setGrade("All");
                                setSchool("");
                              }}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                              <X className="h-4 w-4" />
                              Clear filters
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Ranking Tab Content */}
          {activeTab === "ranking" && (
            <>
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
            </>
          )}

          {/* Browse Tab Content */}
          {activeTab === "browse" && (
            <div className="h-[calc(100vh-140px)] flex flex-col">
              <CoursewareBrowserTab />
            </div>
          )}

          {/* Search Tab Content */}
          {activeTab === "search" && (
            <div className="h-[calc(100vh-140px)] flex flex-col">
              <CoursewareSearchTab />
            </div>
          )}
        </div>

        <ScrollToTopButton />
      </PageTransition>
    </DeskSurface>
  );
}
