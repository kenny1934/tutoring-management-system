import { PageSurface } from '@/components/layout/PageSurface';
import { SkeletonBlock, SkeletonFieldRows } from '@/components/layout/SkeletonBlock';

export function EnrollmentDetailSkeleton() {
  return <PageSurface fullHeight><div className="flex-1 overflow-y-auto">
    <div role="status" aria-busy="true" aria-label="Loading enrollment" className="page-skeleton flex flex-col gap-3 p-4 sm:p-6 xl:p-8">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-line-strong bg-paper px-3 py-2 sm:px-4">
        <SkeletonBlock className="h-8 w-8 shrink-0" /><SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-6 w-40 max-w-full" /><SkeletonBlock className="h-5 w-20" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-line bg-raised p-4">
          <SkeletonBlock className="mb-4 h-4 w-36" /><SkeletonFieldRows count={6} />
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-raised p-4">
          <SkeletonBlock className="mb-4 h-4 w-32" /><SkeletonFieldRows count={4} />
          <div className="mt-4 grid grid-cols-3 gap-2">{[0, 1, 2].map(index => <SkeletonBlock key={index} className="h-16 w-full" />)}</div>
          <div className="mt-4 flex flex-wrap gap-2"><SkeletonBlock className="h-8 w-32" /><SkeletonBlock className="h-8 w-28" /></div>
        </div>
      </div>
      <div className="min-w-0 rounded-lg border border-line bg-raised p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><SkeletonBlock className="h-4 w-40" /><SkeletonBlock className="h-7 w-24" /></div>
        <div className="space-y-2">{[0, 1, 2, 3].map(index => <SkeletonBlock key={index} className="h-12 w-full" />)}</div>
      </div>
    </div>
  </div></PageSurface>;
}
