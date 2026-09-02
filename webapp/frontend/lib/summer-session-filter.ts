/**
 * Summer class filtering for the sessions page (list, week, day, month).
 *
 * Three facets narrow the sessions in view during the summer course period:
 * the class's grade, its type (A/B), and the lesson number. Values within a
 * facet are OR'd, facets are AND'd together — standard faceted behaviour.
 *
 * Two deliberate rules:
 *  - A row's grade/type come from the class hosting its cell
 *    (`summer_class_grade` / `summer_course_type`), not the student's own
 *    grade, so the facets line up with the class headers the list renders.
 *    Stray rows keep their home-slot fallback, which is still the class the
 *    student belongs to and so still the useful thing to filter by.
 *  - The lesson facet matches the number the row *displays*, via the shared
 *    `displayedLessonNumber`: make-up origins hand their lesson number to the
 *    successor row and borrow it back for display, so sharing that helper with
 *    the badge keeps what-you-see equal to what-you-filter by construction.
 *
 * While any facet is set, non-summer rows drop out entirely — narrowing to
 * "F1 · A · L3" is a question about summer classes, not a request to keep
 * every regular session alongside them.
 *
 * Selections deliberately survive a date change even when the new range offers
 * none of them: the control stays visible while active and the page's empty
 * state says why nothing showed up, which beats silently dropping facets
 * mid-fetch and losing the filter on the way back.
 */

import { sortGrades } from './grade-utils'
import { displayedLessonNumber } from './session-status'
import type { SummerSessionFields } from './summer-class-grouping'

export interface SummerFilterFields extends SummerSessionFields {
  lesson_number?: number | null
  moved_lesson_number?: number | null
}

export interface SummerFilterState {
  grades: string[]
  types: string[]
  lessons: number[]
}

/** Facet values available to choose from; same shape as a selection. */
export type SummerFilterOptions = SummerFilterState

export const EMPTY_SUMMER_FILTER: SummerFilterState = {
  grades: [],
  types: [],
  lessons: [],
}

/** True when at least one facet is narrowing the view. */
export function isSummerFilterActive(filter: SummerFilterState): boolean {
  return (
    filter.grades.length > 0 ||
    filter.types.length > 0 ||
    filter.lessons.length > 0
  )
}

/** How many facet values are selected in total (for the trigger badge). */
export function countSummerFilterValues(filter: SummerFilterState): number {
  return filter.grades.length + filter.types.length + filter.lessons.length
}

/** True when the row sits in a cell hosting a summer class (host or stray). */
function isSummerRow(session: SummerFilterFields): boolean {
  return session.summer_slot_id != null
}

/**
 * Facet values actually present in the loaded sessions. Derived from data
 * rather than the course config so the popover never offers a grade, type or
 * lesson that would return nothing, and so it needs no extra fetch. Real data
 * has a lesson 10 in a course configured for 8, which a config-driven range
 * would silently drop.
 */
export function deriveSummerFilterOptions(
  sessions: SummerFilterFields[]
): SummerFilterOptions {
  const grades = new Set<string>()
  const types = new Set<string>()
  const lessons = new Set<number>()

  for (const session of sessions) {
    if (!isSummerRow(session)) continue
    if (session.summer_class_grade) grades.add(session.summer_class_grade)
    if (session.summer_course_type) types.add(session.summer_course_type)
    const lesson = displayedLessonNumber(session)
    if (lesson != null) lessons.add(lesson)
  }

  return {
    grades: sortGrades([...grades]),
    types: [...types].sort((a, b) => a.localeCompare(b)),
    lessons: [...lessons].sort((a, b) => a - b),
  }
}

/** True when the row survives every set facet. Non-summer rows never do. */
function matchesSummerFilter(
  session: SummerFilterFields,
  filter: SummerFilterState
): boolean {
  if (!isSummerRow(session)) return false
  if (
    filter.grades.length > 0 &&
    !filter.grades.includes(session.summer_class_grade ?? '')
  ) {
    return false
  }
  if (
    filter.types.length > 0 &&
    !filter.types.includes(session.summer_course_type ?? '')
  ) {
    return false
  }
  if (filter.lessons.length > 0) {
    const lesson = displayedLessonNumber(session)
    if (lesson == null || !filter.lessons.includes(lesson)) return false
  }
  return true
}

/**
 * Returns the input array by reference when no facet is set. That identity is
 * load-bearing: it keeps the page's `sessions` memo stable while the filter is
 * idle, so the memoised grid views never invalidate because of this feature.
 */
export function applySummerFilter<T extends SummerFilterFields>(
  sessions: T[],
  filter: SummerFilterState
): T[] {
  if (!isSummerFilterActive(filter)) return sessions
  return sessions.filter((session) => matchesSummerFilter(session, filter))
}

/** Add or remove a facet value, keeping the caller's option order. */
export function toggleFacetValue<T>(values: T[], value: T, order: T[]): T[] {
  const next = values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value]
  return order.filter((v) => next.includes(v))
}

/** Compact trigger label, e.g. "F1 · A · L3" or "F1/F2 · A+B · L1/L2". */
export function summerFilterSummary(filter: SummerFilterState): string {
  const parts: string[] = []
  if (filter.grades.length > 0) parts.push(filter.grades.join('/'))
  if (filter.types.length > 0) parts.push(filter.types.join('+'))
  if (filter.lessons.length > 0) parts.push(`L${filter.lessons.join('/')}`)
  return parts.length > 0 ? parts.join(' · ') : 'Summer'
}

export const SUMMER_FILTER_TOOLTIP =
  'Filter by summer class grade, type and lesson'

// --- URL round-tripping -----------------------------------------------------

/** Namespaced so they cannot collide with a future student-grade filter. */
const GRADE_PARAM = 'sgrade'
const TYPE_PARAM = 'stype'
const LESSON_PARAM = 'slesson'

function splitParam(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

/** Reads straight from a URLSearchParams-like object. */
export function decodeSummerFilter(params: {
  get(name: string): string | null
}): SummerFilterState {
  const lessons = splitParam(params.get(LESSON_PARAM))
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0)
  return {
    grades: splitParam(params.get(GRADE_PARAM)),
    types: splitParam(params.get(TYPE_PARAM)).map((t) => t.toUpperCase()),
    lessons: [...new Set(lessons)].sort((a, b) => a - b),
  }
}

/** Only the facets that are set, ready to spread onto a params object. */
export function encodeSummerFilter(
  filter: SummerFilterState
): Record<string, string> {
  const encoded: Record<string, string> = {}
  if (filter.grades.length > 0) encoded[GRADE_PARAM] = filter.grades.join(',')
  if (filter.types.length > 0) encoded[TYPE_PARAM] = filter.types.join(',')
  if (filter.lessons.length > 0)
    encoded[LESSON_PARAM] = filter.lessons.join(',')
  return encoded
}

/**
 * Cheap equality so the URL-sync effect can skip no-op state writes. Next
 * patches replaceState, so every write re-triggers useSearchParams; without
 * this check each one would mint a new object and cascade through the sessions
 * memo and the selection/focus effects.
 */
export function summerFiltersEqual(
  a: SummerFilterState,
  b: SummerFilterState
): boolean {
  const same = (x: (string | number)[], y: (string | number)[]) =>
    x.length === y.length && x.every((v, i) => v === y[i])
  return (
    same(a.grades, b.grades) &&
    same(a.types, b.types) &&
    same(a.lessons, b.lessons)
  )
}
