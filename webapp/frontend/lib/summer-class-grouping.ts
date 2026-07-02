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
}

export interface SummerClassInfo {
  slotId: number
  grade: string | null
  courseType: string | null
  slotLabel: string | null
}

export type SessionRenderGroup<T> =
  | { type: 'regular'; sessions: T[] }
  | { type: 'summer-class'; classInfo: SummerClassInfo; sessions: T[] }

/**
 * Cluster an already-sorted list of sessions into render groups.
 * Summer rows (summer_slot_id set) are grouped by slot at the position
 * where that slot first appears; consecutive non-summer rows form
 * regular groups. Row order within every group follows input order.
 */
export function clusterSummerClasses<T extends SummerSessionFields>(
  sessions: T[]
): SessionRenderGroup<T>[] {
  const groups: SessionRenderGroup<T>[] = []
  const clustersBySlot = new Map<number, Extract<SessionRenderGroup<T>, { type: 'summer-class' }>>()

  for (const session of sessions) {
    const slotId = session.summer_slot_id
    if (slotId != null) {
      const existing = clustersBySlot.get(slotId)
      if (existing) {
        existing.sessions.push(session)
      } else {
        const cluster: Extract<SessionRenderGroup<T>, { type: 'summer-class' }> = {
          type: 'summer-class',
          classInfo: {
            slotId,
            grade: session.summer_class_grade ?? null,
            courseType: session.summer_course_type ?? null,
            slotLabel: session.summer_slot_label ?? null,
          },
          sessions: [session],
        }
        clustersBySlot.set(slotId, cluster)
        groups.push(cluster)
      }
    } else {
      const last = groups[groups.length - 1]
      if (last && last.type === 'regular') {
        last.sessions.push(session)
      } else {
        groups.push({ type: 'regular', sessions: [session] })
      }
    }
  }

  return groups
}

export interface FlatSessionRow<T> {
  session: T
  /** Set on the first row of a summer cluster; render a class header above it. */
  classHeader: SummerClassInfo | null
}

/**
 * Flatten clustered groups back into a single row list for views that
 * render a flat map, marking where class headers belong.
 */
export function flattenSummerClusters<T extends SummerSessionFields>(
  sessions: T[]
): FlatSessionRow<T>[] {
  const rows: FlatSessionRow<T>[] = []
  for (const group of clusterSummerClasses(sessions)) {
    group.sessions.forEach((session, i) => {
      rows.push({
        session,
        classHeader: group.type === 'summer-class' && i === 0 ? group.classInfo : null,
      })
    })
  }
  return rows
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
