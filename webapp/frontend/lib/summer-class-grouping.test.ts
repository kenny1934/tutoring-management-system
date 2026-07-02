import { describe, it, expect } from 'vitest'
import {
  flattenSummerClusters,
  formatSummerClassLabel,
  compactSummerClassLabel,
  type SummerSessionFields,
} from './summer-class-grouping'

interface Row extends SummerSessionFields {
  id: number
}

const regular = (id: number): Row => ({ id })

const summer = (
  id: number,
  slotId: number,
  overrides: Partial<SummerSessionFields> = {}
): Row => ({
  id,
  summer_slot_id: slotId,
  summer_class_grade: 'F1',
  summer_course_type: 'A',
  summer_slot_label: null,
  ...overrides,
})

const ids = (rows: { session: Row }[]) => rows.map((r) => r.session.id)
const headers = (rows: { classHeader: { slotId: number } | null }[]) =>
  rows.map((r) => r.classHeader?.slotId ?? null)

describe('flattenSummerClusters', () => {
  it('returns empty array for empty input', () => {
    expect(flattenSummerClusters([])).toEqual([])
  })

  it('passes all-regular input through unchanged with no headers', () => {
    const flat = flattenSummerClusters([regular(1), regular(2), regular(3)])
    expect(ids(flat)).toEqual([1, 2, 3])
    expect(flat.every((r) => r.classHeader === null)).toBe(true)
  })

  it('clusters a single summer slot with a header on the first row', () => {
    const flat = flattenSummerClusters([summer(1, 10), summer(2, 10)])
    expect(ids(flat)).toEqual([1, 2])
    expect(headers(flat)).toEqual([10, null])
    expect(flat[0].classHeader).toMatchObject({ grade: 'F1', courseType: 'A' })
  })

  it('pulls interleaved same-slot rows into the cluster at first appearance', () => {
    const flat = flattenSummerClusters([
      regular(1),
      summer(2, 10),
      regular(3),
      summer(4, 10),
    ])
    expect(ids(flat)).toEqual([1, 2, 4, 3])
    expect(headers(flat)).toEqual([null, 10, null, null])
  })

  it('separates different slots into their own clusters', () => {
    const flat = flattenSummerClusters([summer(1, 10), summer(2, 20), summer(3, 10)])
    expect(ids(flat)).toEqual([1, 3, 2])
    expect(headers(flat)).toEqual([10, null, 20])
  })

  it('marks each cluster once across regular runs', () => {
    const flat = flattenSummerClusters([
      regular(1),
      summer(2, 10),
      regular(3),
      summer(4, 10),
      summer(5, 20),
    ])
    expect(ids(flat)).toEqual([1, 2, 4, 3, 5])
    expect(headers(flat)).toEqual([null, 10, null, null, 20])
  })

  it('treats rows without summer_slot_id as regular even with other summer fields', () => {
    const flat = flattenSummerClusters([
      { id: 1, summer_class_grade: 'F2' } as Row,
      { id: 2, summer_slot_id: null } as Row,
    ])
    expect(ids(flat)).toEqual([1, 2])
    expect(flat.every((r) => r.classHeader === null)).toBe(true)
  })

  it('takes class info from the first row of the cluster, preserving nulls', () => {
    const flat = flattenSummerClusters([
      summer(1, 10, {
        summer_class_grade: null,
        summer_course_type: null,
        summer_slot_label: 'Make-up Slot',
      }),
      summer(2, 10),
    ])
    expect(flat[0].classHeader).toEqual({
      slotId: 10,
      grade: null,
      courseType: null,
      slotLabel: 'Make-up Slot',
    })
    expect(flat[1].classHeader).toBeNull()
  })
})

describe('formatSummerClassLabel', () => {
  it('joins grade, type, and label', () => {
    expect(
      formatSummerClassLabel({
        slotId: 1,
        grade: 'F1',
        courseType: 'A',
        slotLabel: 'Tue 10:00',
      })
    ).toBe('F1 · Type A · Tue 10:00')
  })

  it('omits missing parts', () => {
    expect(
      formatSummerClassLabel({
        slotId: 1,
        grade: 'F2',
        courseType: 'B',
        slotLabel: null,
      })
    ).toBe('F2 · Type B')
    expect(
      formatSummerClassLabel({
        slotId: 1,
        grade: null,
        courseType: null,
        slotLabel: 'Make-up Slot',
      })
    ).toBe('Make-up Slot')
  })

  it('falls back to "Summer class" when everything is missing', () => {
    expect(
      formatSummerClassLabel({
        slotId: 1,
        grade: null,
        courseType: null,
        slotLabel: null,
      })
    ).toBe('Summer class')
  })
})

describe('compactSummerClassLabel', () => {
  it('combines grade and type', () => {
    expect(
      compactSummerClassLabel({
        slotId: 1,
        grade: 'F1',
        courseType: 'A',
        slotLabel: null,
      })
    ).toBe('F1·A')
  })

  it('uses whichever part exists', () => {
    expect(
      compactSummerClassLabel({
        slotId: 1,
        grade: 'F3',
        courseType: null,
        slotLabel: null,
      })
    ).toBe('F3')
    expect(
      compactSummerClassLabel({
        slotId: 1,
        grade: null,
        courseType: 'B',
        slotLabel: null,
      })
    ).toBe('B')
  })

  it('returns null when neither grade nor type exists', () => {
    expect(
      compactSummerClassLabel({
        slotId: 1,
        grade: null,
        courseType: null,
        slotLabel: 'Make-up Slot',
      })
    ).toBeNull()
  })
})
