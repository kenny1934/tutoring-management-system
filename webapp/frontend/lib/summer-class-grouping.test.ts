import { describe, it, expect } from 'vitest'
import {
  clusterSummerClasses,
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

const ids = (group: { sessions: Row[] }) => group.sessions.map((s) => s.id)

describe('clusterSummerClasses', () => {
  it('returns empty array for empty input', () => {
    expect(clusterSummerClasses([])).toEqual([])
  })

  it('keeps all-regular input as a single regular group in order', () => {
    const rows = [regular(1), regular(2), regular(3)]
    const groups = clusterSummerClasses(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('regular')
    expect(ids(groups[0])).toEqual([1, 2, 3])
  })

  it('clusters a single summer slot into one class group', () => {
    const rows = [summer(1, 10), summer(2, 10)]
    const groups = clusterSummerClasses(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('summer-class')
    if (groups[0].type === 'summer-class') {
      expect(groups[0].classInfo.slotId).toBe(10)
      expect(groups[0].classInfo.grade).toBe('F1')
      expect(groups[0].classInfo.courseType).toBe('A')
    }
    expect(ids(groups[0])).toEqual([1, 2])
  })

  it('pulls interleaved same-slot rows into the cluster at first appearance', () => {
    const rows = [regular(1), summer(2, 10), regular(3), summer(4, 10)]
    const groups = clusterSummerClasses(rows)
    expect(groups.map((g) => g.type)).toEqual([
      'regular',
      'summer-class',
      'regular',
    ])
    expect(ids(groups[0])).toEqual([1])
    expect(ids(groups[1])).toEqual([2, 4])
    expect(ids(groups[2])).toEqual([3])
  })

  it('separates different slots into their own clusters', () => {
    const rows = [summer(1, 10), summer(2, 20), summer(3, 10)]
    const groups = clusterSummerClasses(rows)
    expect(groups).toHaveLength(2)
    expect(ids(groups[0])).toEqual([1, 3])
    expect(ids(groups[1])).toEqual([2])
    if (groups[1].type === 'summer-class') {
      expect(groups[1].classInfo.slotId).toBe(20)
    }
  })

  it('treats rows without summer_slot_id as regular even with other summer fields', () => {
    const rows = [
      { id: 1, summer_class_grade: 'F2' } as Row,
      { id: 2, summer_slot_id: null } as Row,
    ]
    const groups = clusterSummerClasses(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('regular')
    expect(ids(groups[0])).toEqual([1, 2])
  })

  it('takes class info from the first row of the cluster, preserving nulls', () => {
    const rows = [
      summer(1, 10, {
        summer_class_grade: null,
        summer_course_type: null,
        summer_slot_label: 'Make-up Slot',
      }),
      summer(2, 10),
    ]
    const groups = clusterSummerClasses(rows)
    expect(groups).toHaveLength(1)
    if (groups[0].type === 'summer-class') {
      expect(groups[0].classInfo.grade).toBeNull()
      expect(groups[0].classInfo.courseType).toBeNull()
      expect(groups[0].classInfo.slotLabel).toBe('Make-up Slot')
    }
  })
})

describe('flattenSummerClusters', () => {
  it('marks the first row of each summer cluster with its class header', () => {
    const rows = [regular(1), summer(2, 10), regular(3), summer(4, 10), summer(5, 20)]
    const flat = flattenSummerClusters(rows)
    expect(flat.map((r) => r.session.id)).toEqual([1, 2, 4, 3, 5])
    expect(flat.map((r) => r.classHeader?.slotId ?? null)).toEqual([
      null,
      10,
      null,
      null,
      20,
    ])
  })

  it('is a no-op passthrough for all-regular input', () => {
    const rows = [regular(1), regular(2)]
    const flat = flattenSummerClusters(rows)
    expect(flat.map((r) => r.session.id)).toEqual([1, 2])
    expect(flat.every((r) => r.classHeader === null)).toBe(true)
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
