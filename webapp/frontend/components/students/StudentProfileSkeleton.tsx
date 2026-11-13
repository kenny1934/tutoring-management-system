import { PageSurface } from '@/components/layout/PageSurface';
import { SkeletonBlock, SkeletonFieldRows } from '@/components/layout/SkeletonBlock';
import { cn } from '@/lib/utils';
import record from '@/components/material/MaterialWorkspace.module.css';
import profile from './StudentProfileLayout.module.css';

/** Both navigation and the student request use the current record layout. */
export function StudentProfileSkeleton() {
  return <PageSurface fullHeight><div className="flex-1 min-h-0 overflow-y-auto">
    <div role="status" aria-busy="true" aria-label="Loading student profile" className={cn('page-skeleton flex flex-col p-4 sm:p-6 xl:p-8', record.materialRecord)}>
      <div aria-hidden="true" className={record.materialRecordAnchor}>
        <div className={record.materialRecordHeader}>
          <SkeletonBlock className="h-8 w-8 shrink-0" />
          <div className={record.materialRecordIdentity}>
            <div className={record.materialRecordName}>
              <div className="w-full space-y-1 sm:w-44"><SkeletonBlock className="h-6 w-full sm:h-7" /><SkeletonBlock className="h-5 w-3/4 sm:hidden" /></div>
              <SkeletonBlock className="h-5 w-12" /><SkeletonBlock className="h-5 w-20" />
            </div>
            <div className={record.materialRecordMeta}><SkeletonBlock className="h-4 w-12" /><SkeletonBlock className="h-4 w-24" /><SkeletonBlock className="h-5 w-14" /></div>
          </div>
          <SkeletonBlock className="h-8 w-8 sm:w-24" />
        </div>
        <div className={record.materialRecordTabs}>{[16, 20, 24, 16, 20, 20].map((width, index) =>
          <div key={index} className={cn('flex shrink-0 items-center gap-2 px-3 py-3', index === 0 && 'rounded-t border border-b-0 border-line bg-raised')}>
            <SkeletonBlock className="h-4 w-4" /><SkeletonBlock className={width === 24 ? 'h-3 w-24' : width === 20 ? 'h-3 w-20' : 'h-3 w-16'} />
          </div>
        )}</div>
      </div>
      <div className={record.materialRecordContent}>
        <div data-material-record-details className={cn('grid gap-4 md:grid-cols-2', profile.cards)}>
          {[0, 1].map(index => <div key={index} className="rounded-lg border border-line bg-raised p-5 sm:p-6">
            <SkeletonBlock className="mb-4 h-4 w-32" /><SkeletonFieldRows />
          </div>)}
          <section className="rounded-lg border border-line bg-raised p-4 md:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3"><SkeletonBlock className="h-4 w-28" /><SkeletonBlock className="h-7 w-28" /></div>
            <div className="flex flex-wrap gap-3"><SkeletonBlock className="h-4 w-28" /><SkeletonBlock className="h-7 w-24" /></div>
          </section>
          <div className="rounded-lg border border-line bg-raised p-4 md:col-span-2"><SkeletonBlock className="mb-4 h-4 w-40" /><SkeletonBlock className="h-8 w-40" /></div>
          <div className="rounded-lg border border-line bg-raised p-4 md:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-3"><SkeletonBlock className="h-4 w-32" /><SkeletonBlock className="h-7 w-28" /></div>
            <div className="space-y-2"><SkeletonBlock className="h-24 w-full" /><SkeletonBlock className="h-24 w-full" /></div>
          </div>
        </div>
      </div>
    </div>
  </div></PageSurface>;
}
