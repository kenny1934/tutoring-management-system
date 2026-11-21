import { CalendarDays, Clock, DollarSign, PencilLine, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import previewStyles from '@/components/design-preview/NativePreview.module.css';
import styles from './DashboardSkeletons.module.css';

export function DashboardPlaceholder({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn(styles.placeholder, className)} />;
}

export function DashboardStatsSkeleton() {
  return <div data-native-stats role="status" aria-busy="true" aria-label="Loading dashboard totals" className="px-4 py-2.5 sm:px-6">
    <div aria-hidden="true" className="flex items-center justify-between gap-2 sm:justify-start sm:gap-8">
      {[Users, CalendarDays, DollarSign].map((Icon, index) => <div key={index} data-native-stat-cell data-native-revenue={index === 2 || undefined} className={cn(index === 2 && 'flex items-center gap-1.5')}>
        <div data-native-stat-action={index !== 2 || undefined} className="flex items-center gap-1.5">
          <Icon className="h-4 w-4 shrink-0 text-ink-subtle" />
          <span className="flex min-w-0 flex-col gap-2"><DashboardPlaceholder className={cn('h-7', index === 2 ? 'w-16' : 'w-12')} /><DashboardPlaceholder className="h-2.5 w-14 max-w-full" /></span>
        </div>
      </div>)}
    </div>
  </div>;
}

function LoadingHeading({ calendar = false }: { calendar?: boolean }) {
  const Icon = calendar ? PencilLine : CalendarDays;
  return <div data-native-paper-head className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
    <h3 className="flex min-w-0 items-center gap-2 font-semibold"><Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-subtle" />{calendar ? 'Tests & exams' : "Today's sessions"}</h3>
    <DashboardPlaceholder className="h-8 w-8 shrink-0 rounded-full" />
  </div>;
}

export function DashboardSessionsSkeleton({ className, isMobile = false }: { className?: string; isMobile?: boolean }) {
  return <div data-native-paper data-native-depth-surface role="status" aria-busy="true" aria-label="Loading today’s sessions"
    className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-paper md:h-[clamp(420px,60vh,560px)]', !isMobile && 'paper-texture', className)}>
    <LoadingHeading />
    <div aria-hidden="true" className="min-h-0 flex-1 overflow-hidden">
      {[0, 1, 2].map(group => <div key={group} className={group === 2 ? styles.desktopGroup : undefined}>
        <div className="flex items-center gap-2 bg-tint/50 px-3 py-2"><Clock className="h-3 w-3 text-ink-subtle" /><DashboardPlaceholder className="h-2.5 w-24" /><DashboardPlaceholder className="h-2.5 w-6" /></div>
        {[0, 1].map(row => <div key={row} className={styles.sessionRow}>
          <DashboardPlaceholder className="h-3.5 w-3.5" />
          <div className="min-w-0 space-y-2"><div className="flex items-center gap-2"><DashboardPlaceholder className="h-3 w-28 max-w-full" /><DashboardPlaceholder className="h-3 w-7 shrink-0" /></div><div className="flex gap-2"><DashboardPlaceholder className="h-2.5 w-14" /><DashboardPlaceholder className="h-2.5 w-10" /></div></div>
          <DashboardPlaceholder className="h-5 w-12 rounded-full" />
        </div>)}
      </div>)}
    </div>
  </div>;
}

export function DashboardCalendarSkeleton({ className, isMobile = false, onPhone = false }: { className?: string; isMobile?: boolean; onPhone?: boolean }) {
  return <div data-native-paper data-native-depth-surface data-native-calendar role="status" aria-busy="true" aria-label="Loading tests and exams"
    className={cn(previewStyles.calendarPanel, 'flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-paper md:h-[clamp(420px,60vh,560px)]', !isMobile && 'paper-texture', className)}>
    <LoadingHeading calendar />
    <div aria-hidden="true" className={styles.calendarBody}>
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 px-3"><DashboardPlaceholder className="h-4 w-28" /><div className="flex gap-2"><DashboardPlaceholder className="h-6 w-6" /><DashboardPlaceholder className="h-6 w-6" /></div></div>
      {!onPhone && <div className={styles.calendarGrid}>
        {Array.from({ length: 7 }, (_, day) => <div key={`weekday-${day}`} className={styles.weekday}><DashboardPlaceholder className="h-2 w-4" /></div>)}
        {Array.from({ length: 42 }, (_, day) => <div key={day} className={styles.calendarDay}><DashboardPlaceholder className="h-2.5 w-3" /></div>)}
      </div>}
      <div className="space-y-2 border-t border-line px-3 py-3"><DashboardPlaceholder className="mb-3 h-2.5 w-28" />
        {[0, 1, 2].map(row => <div key={row} className="flex items-start gap-3 py-2"><DashboardPlaceholder className="h-8 w-8 shrink-0" /><div className="min-w-0 flex-1 space-y-2"><DashboardPlaceholder className="h-3 w-4/5" /><DashboardPlaceholder className="h-2.5 w-3/5" /></div><DashboardPlaceholder className="h-3 w-5 shrink-0" /></div>)}
      </div>
    </div>
  </div>;
}

export function DashboardActivitySkeleton() {
  return <div role="status" aria-busy="true" aria-label="Loading activity" className={previewStyles.activityList}>
    <div aria-hidden="true" className={previewStyles.activityDay}>
      <div className="pb-2"><DashboardPlaceholder className="h-3 w-16" /></div>
      {[0, 1, 2, 3].map(row => <div key={row} className={cn(previewStyles.activityEntry, styles.activityRow)}>
        <DashboardPlaceholder className={cn(previewStyles.activityIcon, 'h-3.5 w-3.5')} />
        <div className={previewStyles.activityIdentity}><DashboardPlaceholder className="mt-1 h-3 w-32 max-w-full" /></div>
        <div className={previewStyles.activityDescription}><DashboardPlaceholder className="mt-1 h-2.5 w-4/5" /></div>
        <div className={previewStyles.activityMeta}><div className={styles.activityTime}><DashboardPlaceholder className="ml-auto mt-1 h-2.5 w-12" /></div></div>
      </div>)}
    </div>
  </div>;
}
