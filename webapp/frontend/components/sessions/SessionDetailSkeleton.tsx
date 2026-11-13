import { PageSurface } from "@/components/layout/PageSurface";
import { PageTransition } from "@/lib/design-system";

export function SessionDetailSkeleton() {
  return (
      <PageSurface>
        <PageTransition role="status" aria-busy="true" aria-label="Loading session" className="page-skeleton flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 lg:p-8 md:pr-16 lg:pr-16">
        {/* Chalkboard skeleton - matches ChalkboardHeader structure */}
        <div
          className="relative w-full rounded-[20px] sm:rounded-[28px]"
          style={{ boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}
        >
          {/* Wood Frame */}
          <div className="absolute inset-0 rounded-[20px] sm:rounded-[28px] bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47]" />

          {/* Chalkboard Surface (stops before ledge) */}
          <div className="absolute left-2 right-2 top-2 sm:left-3 sm:right-3 sm:top-3 bg-[#2d4739] dark:bg-[#1a2821] rounded-[14px] sm:rounded-[20px] bottom-[56px] sm:bottom-[64px]" />

          {/* Wooden Ledge */}
          <div
            className="absolute left-2 right-2 sm:left-3 sm:right-3 bottom-2 sm:bottom-3 h-11 sm:h-12 rounded-b-[12px]"
            style={{ background: 'linear-gradient(180deg, #9a7b5a 0%, #8b6f47 30%, #7a6040 70%, #6b5a3a 100%)' }}
          >
            {/* Shimmer chalk stubs */}
            <div className="flex items-center gap-2 px-3 pt-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="w-9 h-4 sm:w-11 sm:h-5 rounded-lg bg-white/20 animate-pulse" />
              ))}
            </div>
          </div>

          {/* Content placeholders */}
          <div className="relative flex items-center justify-between px-4 sm:px-6 pt-3 sm:pt-4 pb-16 sm:pb-18">
            <div className="space-y-2">
              <div className="h-6 sm:h-7 w-48 sm:w-64 bg-white/20 rounded animate-pulse" />
              <div className="h-4 w-40 sm:w-56 bg-white/15 rounded animate-pulse" />
            </div>
            <div className="hidden md:block h-10 w-24 bg-white/10 rounded animate-pulse" />
            <div className="h-9 w-9 md:h-10 md:w-28 bg-white/20 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Courseware Section Skeleton */}
        <div className="relative pt-4 sm:pt-8 lg:pt-10 pl-0 sm:pl-8 lg:pl-14">
          {/* Wooden Tab (CoursewareBanner) skeleton */}
          <div
            className="absolute -top-2 sm:-top-1 lg:top-0 left-4 sm:left-12 lg:left-20 h-8 sm:h-10 w-40 sm:w-48 rounded-t-lg z-10"
            style={{ background: 'linear-gradient(135deg, #8b6f47 0%, #a0826d 50%, #8b6f47 100%)' }}
          >
            <div className="h-4 w-28 bg-white/20 rounded mx-auto mt-2 animate-pulse" />
          </div>

          {/* Two-column layout */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* GraphPaper skeleton (exercises) */}
            <div className="flex-1 lg:w-[70%] min-h-[300px] rounded-lg p-6 paper-cream graph-paper-1cm paper-texture paper-shadow-md">
              <div className="space-y-4">
                <div className="h-5 w-24 bg-gray-400/30 rounded animate-pulse" />
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-12 bg-gray-400/20 rounded-md animate-pulse" />
                  ))}
                </div>
              </div>
            </div>

            {/* StickyNote skeleton (comments) */}
            <div className="lg:w-[calc(30%-0.75rem)] w-64 min-h-[200px] paper-texture bg-[#ffe4e9] dark:bg-[#2b1f22] torn-edge-top p-6">
              <div className="space-y-3">
                <div className="h-4 w-20 bg-pink-400/40 rounded animate-pulse" />
                <div className="flex justify-end">
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="h-5 w-5 bg-pink-400/40 rounded-full animate-pulse" />
                    ))}
                  </div>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="h-3 w-full bg-pink-400/30 rounded animate-pulse" />
                  <div className="h-3 w-3/4 bg-pink-400/30 rounded animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
        </PageTransition>
      </PageSurface>
  );
}
