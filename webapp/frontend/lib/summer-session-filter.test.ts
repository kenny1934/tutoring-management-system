import { describe, it, expect } from 'vitest'
import {
  EMPTY_SUMMER_FILTER,
  applySummerFilter,
  countSummerFilterValues,
  decodeSummerFilter,
  deriveSummerFilterOptions,
  encodeSummerFilter,
  isSummerFilterActive,
  summerFilterSummary,
  summerFiltersEqual,
  toggleFacetValue,
  type SummerFilterFields,
} from './summer-session-filter'

function row(overrides: Partial<SummerFilterFields> = {}): SummerFilterFields {
  return {
    summer_slot_id: 1,
    summer_class_grade: 'F1',
    summer_course_type: 'A',
    lesson_number: 3,
    ...overrides,
  }
}

describe('deriveSummerFilterOptions', () => {
  it('collects only the values present on summer rows, grades up the ladder', () => {
    const options = deriveSummerFilterOptions([
      row({ summer_class_grade: 'F2', summer_course_type: 'B', lesson_number: 4 }),
      row({ summer_class_grade: 'P6', summer_course_type: 'A', lesson_number: 1 }),
      row({ summer_class_grade: 'F2', summer_course_type: 'A', lesson_number: 4 }),
      // Non-summer rows contribute nothing, even with a lesson number.
      row({ summer_slot_id: null, summer_class_grade: 'F6', lesson_number: 9 }),
    ])
    expect(options).toEqual({
      grades: ['P6', 'F2'],
      types: ['A', 'B'],
      lessons: [1, 4],
    })
  })

  it('offers lesson numbers beyond the configured course length', () => {
    // Production has a lesson 10 in a course configured for 8, which is why the
    // facets come from the data rather than the course config.
    expect(deriveSummerFilterOptions([row({ lesson_number: 10 })]).lessons).toEqual([10])
  })

  it('includes borrowed lesson numbers so the badge stays filterable', () => {
    const options = deriveSummerFilterOptions([
      row({ lesson_number: null, moved_lesson_number: 6 }),
    ])
    expect(options.lessons).toEqual([6])
  })

  it('counts stray rows, which carry their home-slot class', () => {
    const options = deriveSummerFilterOptions([
      row({ summer_stray: true, summer_class_grade: 'F3', summer_course_type: 'B' }),
    ])
    expect(options.grades).toEqual(['F3'])
    expect(options.types).toEqual(['B'])
  })

  it('returns empty facets outside the summer period', () => {
    expect(deriveSummerFilterOptions([row({ summer_slot_id: null })])).toEqual({
      grades: [],
      types: [],
      lessons: [],
    })
  })
})

describe('applySummerFilter', () => {
  it('returns the same array reference when nothing is set', () => {
    // Load-bearing: keeps the page's sessions memo stable while idle.
    const sessions = [row()]
    expect(applySummerFilter(sessions, EMPTY_SUMMER_FILTER)).toBe(sessions)
  })

  it('ANDs across facets and ORs within one', () => {
    const filter = { grades: ['F1', 'F2'], types: ['A'], lessons: [3] }
    const kept = [row(), row({ summer_class_grade: 'F2' })]
    const dropped = [
      row({ summer_class_grade: 'F3' }),
      row({ summer_course_type: 'B' }),
      row({ lesson_number: 4 }),
    ]
    expect(applySummerFilter([...kept, ...dropped], filter)).toEqual(kept)
  })

  it('hides regular rows as soon as one facet is set', () => {
    const sessions = [
      row({ lesson_number: 1 }),
      row({ summer_slot_id: null, summer_class_grade: null, lesson_number: null }),
    ]
    const result = applySummerFilter(sessions, { ...EMPTY_SUMMER_FILTER, grades: ['F1'] })
    expect(result).toHaveLength(1)
    expect(result[0].summer_slot_id).toBe(1)
  })

  it('matches on the borrowed lesson number', () => {
    const origin = row({ lesson_number: null, moved_lesson_number: 5 })
    expect(applySummerFilter([origin], { ...EMPTY_SUMMER_FILTER, lessons: [5] })).toEqual([origin])
    expect(applySummerFilter([origin], { ...EMPTY_SUMMER_FILTER, lessons: [3] })).toEqual([])
  })

  it('drops rows with no lesson number when the lesson facet is set', () => {
    const noLesson = row({ lesson_number: null, moved_lesson_number: null })
    expect(applySummerFilter([noLesson], { ...EMPTY_SUMMER_FILTER, lessons: [3] })).toEqual([])
    expect(applySummerFilter([noLesson], { ...EMPTY_SUMMER_FILTER, grades: ['F1'] })).toEqual([noLesson])
  })
})

describe('toggleFacetValue', () => {
  const order = ['P6', 'F1', 'F2']

  it('adds in option order, not click order', () => {
    let selected = toggleFacetValue<string>([], 'F2', order)
    selected = toggleFacetValue(selected, 'P6', order)
    expect(selected).toEqual(['P6', 'F2'])
  })

  it('removes an already selected value', () => {
    expect(toggleFacetValue(['P6', 'F2'], 'P6', order)).toEqual(['F2'])
  })
})

describe('summary and counts', () => {
  it('names a single value per facet', () => {
    expect(summerFilterSummary({ grades: ['F1'], types: ['A'], lessons: [3] })).toBe('F1 · A · L3')
  })

  it('lists every selected value, whatever the types are', () => {
    expect(summerFilterSummary({ grades: ['F1', 'F2'], types: ['A', 'B'], lessons: [1, 2] })).toBe(
      'F1/F2 · A+B · L1/2'
    )
    expect(summerFilterSummary({ grades: [], types: ['A', 'B', 'C'], lessons: [] })).toBe('A+B+C')
  })

  it('falls back to the idle label', () => {
    expect(summerFilterSummary(EMPTY_SUMMER_FILTER)).toBe('Summer')
    expect(isSummerFilterActive(EMPTY_SUMMER_FILTER)).toBe(false)
    expect(countSummerFilterValues(EMPTY_SUMMER_FILTER)).toBe(0)
    expect(countSummerFilterValues({ grades: ['F1'], types: ['A'], lessons: [3, 4] })).toBe(4)
  })
})

describe('URL round-tripping', () => {
  it('survives a round trip through URLSearchParams', () => {
    const filter = { grades: ['P6', 'F1'], types: ['A'], lessons: [2, 5] }
    const encoded = encodeSummerFilter(filter)
    expect(encoded).toEqual({ sgrade: 'P6,F1', stype: 'A', slesson: '2,5' })
    expect(decodeSummerFilter(new URLSearchParams(encoded))).toEqual(filter)
  })

  it('namespaces its params so a student-grade filter cannot collide', () => {
    expect(decodeSummerFilter(new URLSearchParams('grade=F1&type=A&lesson=3'))).toEqual(
      EMPTY_SUMMER_FILTER
    )
  })

  it('omits empty facets', () => {
    expect(encodeSummerFilter(EMPTY_SUMMER_FILTER)).toEqual({})
  })

  it('ignores junk in the URL', () => {
    expect(
      decodeSummerFilter(new URLSearchParams('sgrade= , &stype=a&slesson=3,abc,0,-2,3'))
    ).toEqual({ grades: [], types: ['A'], lessons: [3] })
  })

  it('treats missing params as no filter', () => {
    expect(isSummerFilterActive(decodeSummerFilter(new URLSearchParams()))).toBe(false)
  })
})

describe('summerFiltersEqual', () => {
  it('compares by value', () => {
    expect(summerFiltersEqual({ grades: ['F1'], types: [], lessons: [1] }, { grades: ['F1'], types: [], lessons: [1] })).toBe(true)
    expect(summerFiltersEqual({ grades: ['F1'], types: [], lessons: [] }, { grades: ['F2'], types: [], lessons: [] })).toBe(false)
    expect(summerFiltersEqual({ grades: [], types: [], lessons: [1] }, { grades: [], types: [], lessons: [1, 2] })).toBe(false)
  })
})
