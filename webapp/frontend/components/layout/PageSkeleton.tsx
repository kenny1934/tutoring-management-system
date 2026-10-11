/**
 * What a student's, a session's or an enrolment's page shows while it is still
 * on its way. These pages are the ones whose address carries an id, so Next
 * can't fetch them ahead of a tap the way it fetches the fixed pages. Without
 * this, a tap on a phone would leave the old page standing until the new one
 * arrived. It is a plain outline of a page (a title, a row of controls and a
 * few cards), and it waits a moment before showing so a quick page never
 * flashes it.
 */
export function PageSkeleton() {
  return (
    <div className="page-skeleton flex flex-col gap-4 p-4 sm:p-6" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-40 rounded bg-tint animate-pulse" />
      <div className="flex gap-2">
        <div className="h-9 w-28 rounded-lg bg-tint animate-pulse" />
        <div className="h-9 w-20 rounded-lg bg-tint animate-pulse" />
        <div className="ml-auto h-9 w-9 rounded-lg bg-tint animate-pulse" />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-4">
          <div className="h-4 w-1/3 rounded bg-tint animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-tint animate-pulse" />
        </div>
      ))}
    </div>
  );
}
