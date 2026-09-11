"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, ExternalLink, Eye, EyeOff, Flame, Info, Loader2, TrendingUp, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { PaperlessDocument } from "@/lib/api";
import type { CoursewarePopularity } from "@/types";
import { useCoursewarePopularity, useCoursewareUsageDetail } from "@/lib/hooks";
import { CopyPathButton } from "@/components/ui/copy-path-button";
import { PdfPreviewModal } from "@/components/ui/pdf-preview-modal";
import { GradeLabel } from "@/components/ui/grade-label";

interface TrendingCoursewareSectionProps {
  exerciseType: "CW" | "HW";
  grade?: string | null;
  school?: string | null;
  /** The location the tutor is working in. A usage row from another branch
   *  shows the student's name but does not link to them. */
  location?: string | null;
  /** Called with the file's path when the tutor clicks a trending row. */
  onAdd: (path: string) => void;
}

/**
 * The files other tutors have been assigning recently to students of the same
 * grade at the same school. The single-session exercise modal shows it for its
 * student, and the bulk modal shows it when everyone selected shares a school
 * and grade, since those two are all the list is looked up by.
 */
export function TrendingCoursewareSection({
  exerciseType,
  grade,
  school,
  location,
  onAdd,
}: TrendingCoursewareSectionProps) {
  const [trendingExpanded, setTrendingExpanded] = useState(false);
  const [trendingPreviewDoc, setTrendingPreviewDoc] = useState<PaperlessDocument | null>(null);
  // Consolidated trending item state: tracks status and cached document per filename
  const [trendingItemState, setTrendingItemState] = useState<Record<string, { status: 'checking' | 'available' | 'unavailable'; doc?: PaperlessDocument }>>({});
  const [detailItem, setDetailItem] = useState<CoursewarePopularity | null>(null);

  // Fetch trending courseware for this grade/school
  const { data: trendingData, isLoading: trendingLoading } = useCoursewarePopularity(
    "recent",
    exerciseType,
    grade ?? undefined,
    school ?? undefined
  );

  // Fetch usage details for expanded trending item
  const { data: usageDetails, isLoading: usageDetailsLoading } = useCoursewareUsageDetail(
    detailItem?.filename ?? null,
    'recent',
    10,
    undefined,
    grade ?? undefined,
    school ?? undefined
  );

  // Handle preview trending item
  const handlePreviewTrending = useCallback(async (item: CoursewarePopularity) => {
    const itemState = trendingItemState[item.filename];

    // If already cached, open immediately
    if (itemState?.status === 'available' && itemState.doc) {
      setTrendingPreviewDoc(itemState.doc);
      return;
    }

    // If already known to be unavailable or checking, do nothing
    if (itemState?.status === 'unavailable' || itemState?.status === 'checking') return;

    // Start checking
    setTrendingItemState(prev => ({ ...prev, [item.filename]: { status: 'checking' } }));

    try {
      const path = item.normalized_paths?.split(',')[0]?.trim();
      if (!path) {
        setTrendingItemState(prev => ({ ...prev, [item.filename]: { status: 'unavailable' } }));
        return;
      }

      const response = await api.paperless.search(path, 3, 'all');
      if (response.results.length > 0) {
        // Found - cache and open preview
        const doc = response.results[0];
        setTrendingItemState(prev => ({ ...prev, [item.filename]: { status: 'available', doc } }));
        setTrendingPreviewDoc(doc);
      } else {
        setTrendingItemState(prev => ({ ...prev, [item.filename]: { status: 'unavailable' } }));
      }
    } catch {
      setTrendingItemState(prev => ({ ...prev, [item.filename]: { status: 'unavailable' } }));
    }
  }, [trendingItemState]);

  return (
    <>
      {/* Trending Section - Loading Skeleton */}
      {trendingLoading && (
        <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-50 to-white dark:from-orange-900/20 dark:to-[#1a1a1a]">
            <div className="h-3.5 w-3.5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
      )}

      {/* Compact Trending Section */}
      {!trendingLoading && trendingData && trendingData.length > 0 && (
        <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
          {/* Collapsible Header */}
          <button
            type="button"
            onClick={() => setTrendingExpanded(!trendingExpanded)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
              "bg-gradient-to-r from-orange-50 to-white dark:from-orange-900/20 dark:to-[#1a1a1a]",
              "hover:from-orange-100 hover:to-white dark:hover:from-orange-900/30 dark:hover:to-[#1a1a1a]"
            )}
          >
            <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-xs text-gray-600 dark:text-gray-300">
              Trending
              {grade && ` for ${grade}`}
              {school && ` @ ${school}`}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ({trendingData.length} popular)
            </span>
            {trendingExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-auto" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 ml-auto" />
            )}
          </button>

          {/* Expanded Content */}
          {trendingExpanded && (
            <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] max-h-64 overflow-y-auto">
              {trendingData.map((item, index) => {
                const firstPath = item.normalized_paths?.split(", ")[0]?.trim() || item.filename;
                const isExpanded = detailItem?.filename === item.filename;
                const previewStatus = trendingItemState[item.filename]?.status;
                return (
                  <div key={item.filename}>
                    <div
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors",
                        "hover:bg-amber-50 dark:hover:bg-amber-900/20",
                        "border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30",
                        isExpanded && "border-b-0 bg-amber-50/50 dark:bg-amber-900/10"
                      )}
                      onClick={() => onAdd(firstPath)}
                      title={`Click to add ${item.filename} as new exercise`}
                    >
                      {index < 3 && <Flame className="h-3 w-3 text-orange-500 shrink-0" />}
                      {index >= 3 && <div className="w-3" />}
                      <span className="flex-1 truncate text-gray-700 dark:text-gray-300 text-xs">
                        {item.filename}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 flex items-center gap-1">
                        {item.assignment_count}×
                        <User className="h-2.5 w-2.5" />
                        {item.unique_student_count}
                      </span>
                      {/* Preview button */}
                      {previewStatus === 'unavailable' ? (
                        <div className="p-1 shrink-0" title="Not available in Shelv" onClick={(e) => e.stopPropagation()}>
                          <EyeOff className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewTrending(item);
                          }}
                          disabled={previewStatus === 'checking'}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 shrink-0 disabled:opacity-50"
                          title={previewStatus === 'checking' ? 'Checking...' : 'Preview PDF'}
                        >
                          {previewStatus === 'checking' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                      {/* Copy path button */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <CopyPathButton paths={item.normalized_paths} filename={item.filename} />
                      </div>
                      {/* Info/details button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailItem(isExpanded ? null : item);
                        }}
                        className={cn(
                          "p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0",
                          isExpanded
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-gray-500 hover:text-amber-600 dark:hover:text-amber-400"
                        )}
                        title={isExpanded ? "Hide usage details" : "Show usage details"}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    {/* Expandable usage details section */}
                    {isExpanded && (
                      <div className="px-3 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 bg-gray-50 dark:bg-[#1a1a1a]/50">
                        {usageDetailsLoading ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading usage details...
                          </div>
                        ) : usageDetails && usageDetails.length > 0 ? (
                          <div className="space-y-1">
                            <div className="text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Recent sessions using this file:
                            </div>
                            <div className="text-xs space-y-0.5 max-h-24 overflow-y-auto">
                              {usageDetails.map((detail, i) => {
                                const displayId = detail.school_student_id
                                  ? `${detail.location}-${detail.school_student_id}`
                                  : detail.location;
                                // Check if user has access to this detail's location
                                const canAccessLocation = !location || location === detail.location;
                                return (
                                  <div
                                    key={`${detail.session_id}-${detail.exercise_id}-${i}`}
                                    className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 text-[10px]"
                                  >
                                    <span className="text-gray-400 dark:text-gray-500 w-16 shrink-0">
                                      {detail.session_date
                                        ? new Date(detail.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                        : '-'}
                                    </span>
                                    {canAccessLocation ? (
                                      <Link
                                        href={`/students/${detail.student_id}`}
                                        target="_blank"
                                        className="truncate flex-1 text-[#a0704b] dark:text-[#cd853f] hover:underline"
                                        title={`${displayId} ${detail.student_name}`}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {detail.student_name}
                                      </Link>
                                    ) : (
                                      <span className="truncate flex-1 text-gray-500 dark:text-gray-400" title={detail.student_name}>
                                        {detail.student_name}
                                      </span>
                                    )}
                                    <span className="shrink-0 text-gray-400 dark:text-gray-500">
                                      <GradeLabel grade={detail.grade} />
                                    </span>
                                    <span className={cn(
                                      "shrink-0 px-1 rounded text-[9px]",
                                      detail.exercise_type === 'CW'
                                        ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                    )}>
                                      {detail.exercise_type}
                                    </span>
                                    {canAccessLocation ? (
                                      <Link
                                        href={`/sessions/${detail.session_id}`}
                                        target="_blank"
                                        className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0"
                                        title="Go to session"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-2.5 w-2.5 text-gray-400 hover:text-[#a0704b]" />
                                      </Link>
                                    ) : (
                                      <div className="p-0.5 shrink-0 w-3.5" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-500">
                            No usage details available
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PDF Preview Modal for trending items */}
      <PdfPreviewModal
        isOpen={!!trendingPreviewDoc}
        onClose={() => setTrendingPreviewDoc(null)}
        documentId={trendingPreviewDoc?.id ?? null}
        documentTitle={trendingPreviewDoc?.title}
      />
    </>
  );
}
