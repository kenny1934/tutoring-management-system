/**
 * Clustering of summer session rows into class groups for display.
 *
 * The sessions list sorts rows with a multi-level comparator (tutor →
 * main-group priority → school → student id) that is duplicated across
 * views. This helper deliberately runs AFTER that sort: it takes an
 * already-ordered array and pulls summer rows into per-class clusters
 * anchored at each class's first appearance, leaving regular rows in
 * their existing relative order. That way it composes with every
 * comparator variant without modifying any of them.
 */

export interface SummerSessionFields {
  summer_slot_id?: number | null
  summer_class_grade?: string | null
  summer_course_type?: string | null
  summer_slot_label?: string | null
  /** True when the class fields are the home-slot fallback: no class of
   *  this row's tutor is hosted in its cell (standalone make-up or
   *  tutor-reassigned row). */
  summer_stray?: boolean | null
  tutor_name?: string | null
}

export interface SummerClassInfo {
  /** Null for the generic cluster of stray rows, which has no class. */
  slotId: number | null
  grade: string | null
  courseType: string | null
  slotLabel: string | null
}

export interface FlatSessionRow<T> {
  session: T
  /** Set on the first row of a summer cluster; render a class header above it. */
  classHeader: SummerClassInfo | null
}

interface Bucket<T> {
  header: SummerClassInfo | null
  rows: T[]
}

/**
 * Cluster an already-sorted list of sessions and return it as a flat row
 * list. Summer rows (summer_slot_id set) are grouped by slot at the
 * position where that slot first appears, with `classHeader` set on each
 * cluster's first row; regular rows keep their relative order.
 *
 * Stray rows (summer_stray set) sit in a cell where no class of their
 * tutor is hosted, so their class fields describe another cell's class.
 * Clustering them by slot would split same-cell strays apart and label
 * the cell with a class that is not taught there — instead they share
 * one generic per-tutor cluster.
 */
export function flattenSummerClusters<T extends SummerSessionFields>(
  sessions: T[]
): FlatSessionRow<T>[] {
  const buckets: Bucket<T>[] = []
  const byKey = new Map<string, Bucket<T>>()
  let regularRun: Bucket<T> | null = null

  for (const session of sessions) {
    const slotId = session.summer_slot_id
    if (session.summer_stray || slotId != null) {
      const key = session.summer_stray
        ? `stray:${session.tutor_name ?? ''}`
        : `slot:${slotId}`
      let bucket = byKey.get(key)
      if (!bucket) {
        bucket = {
          header: session.summer_stray
            ? { slotId: null, grade: null, courseType: null, slotLabel: null }
            : {
                slotId: slotId!,
                grade: session.summer_class_grade ?? null,
                courseType: session.summer_course_type ?? null,
                slotLabel: session.summer_slot_label ?? null,
              },
          rows: [],
        }
        byKey.set(key, bucket)
        buckets.push(bucket)
      }
      bucket.rows.push(session)
      regularRun = null
    } else {
      if (!regularRun) {
        regularRun = { header: null, rows: [] }
        buckets.push(regularRun)
      }
      regularRun.rows.push(session)
    }
  }

  return buckets.flatMap((bucket) =>
    bucket.rows.map((session, i) => ({
      session,
      classHeader: i === 0 ? bucket.header : null,
    }))
  )
}

/** Full class header label, e.g. "F1 · Type A · Tue 10:00". */
export function formatSummerClassLabel(info: SummerClassInfo): string {
  const parts: string[] = []
  if (info.grade) parts.push(info.grade)
  if (info.courseType) parts.push(`Type ${info.courseType}`)
  if (info.slotLabel) parts.push(info.slotLabel)
  return parts.length > 0 ? parts.join(' · ') : 'Summer class'
}

/** Compact chip label for grid cells, e.g. "F1·A". Null when no identity. */
export function compactSummerClassLabel(info: SummerClassInfo): string | null {
  const parts: string[] = []
  if (info.grade) parts.push(info.grade)
  if (info.courseType) parts.push(info.courseType)
  return parts.length > 0 ? parts.join('·') : null
}
