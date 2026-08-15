import { describe, it, expect } from 'vitest'
import { groupSessionsForList, UNSCHEDULED, type GroupableSession } from './session-grouping'

interface Row extends GroupableSession {
  id: number
}

const row = (id: number, date: string, timeSlot: string | null, extra: Partial<Row> = {}): Row => ({
  id,
  session_date: date,
  time_slot: timeSlot,
  tutor_name: 'Mr Ivan Chen',
  session_status: 'Scheduled',
  grade: 'F1',
  lang_stream: 'C',
  school: 'MSA',
  school_student_id: `S${id}`,
  ...extra,
})

const keys = (groups: { key: string }[]) => groups.map((g) => g.key)
const ids = (groups: { sessions: Row[] }[]) => groups.map((g) => g.sessions.map((s) => s.id))

describe('groupSessionsForList on a single day', () => {
  it('keys groups by the bare time slot, as the list has always done', () => {
    const groups = groupSessionsForList(
      [row(1, '2026-08-25', '14:30 - 16:00'), row(2, '2026-08-25', '10:00 - 11:30')],
      { spansDates: false }
    )
    expect(keys(groups)).toEqual(['10:00 - 11:30', '14:30 - 16:00'])
  })

  it('files a session with no time slot under Unscheduled, and sorts it last', () => {
    const groups = groupSessionsForList(
      [row(1, '2026-08-25', null), row(2, '2026-08-25', '16:15 - 17:45')],
      { spansDates: false }
    )
    expect(keys(groups)).toEqual(['16:15 - 17:45', UNSCHEDULED])
  })

  it('merges the same slot across dates, because the list shows one day', () => {
    const groups = groupSessionsForList(
      [row(1, '2026-08-25', '10:00 - 11:30'), row(2, '2026-08-26', '10:00 - 11:30')],
      { spansDates: false }
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].sessions).toHaveLength(2)
  })

  it('gives a proposed slot with no lessons in it a group to render into', () => {
    const groups = groupSessionsForList([row(1, '2026-08-25', '10:00 - 11:30')], {
      spansDates: false,
      placeholderSlots: [{ date: '2026-08-25', timeSlot: '18:00 - 19:30' }],
    })
    expect(keys(groups)).toEqual(['10:00 - 11:30', '18:00 - 19:30'])
    expect(groups[1].sessions).toEqual([])
  })
})

describe('groupSessionsForList across dates', () => {
  it('keeps the same slot on different days apart', () => {
    const groups = groupSessionsForList(
      [row(1, '2026-08-26', '10:00 - 11:30'), row(2, '2026-08-25', '10:00 - 11:30')],
      { spansDates: true }
    )
    expect(keys(groups)).toEqual(['2026-08-25|10:00 - 11:30', '2026-08-26|10:00 - 11:30'])
    expect(ids(groups)).toEqual([[2], [1]])
  })

  it('orders by date first and by start time within a date', () => {
    const groups = groupSessionsForList(
      [
        row(1, '2026-08-26', '10:00 - 11:30'),
        row(2, '2026-08-25', '16:15 - 17:45'),
        row(3, '2026-08-25', '10:00 - 11:30'),
      ],
      { spansDates: true }
    )
    expect(groups.map((g) => `${g.date} ${g.timeSlot}`)).toEqual([
      '2026-08-25 10:00 - 11:30',
      '2026-08-25 16:15 - 17:45',
      '2026-08-26 10:00 - 11:30',
    ])
  })

  it('carries the date on each group, which is what the list labels it with', () => {
    const groups = groupSessionsForList(
      [row(1, '2026-08-25', '10:00 - 11:30'), row(2, '2026-08-29', '10:00 - 11:30')],
      { spansDates: true }
    )
    expect(groups.map((g) => g.date)).toEqual(['2026-08-25', '2026-08-29'])
  })
})

describe('order within a group', () => {
  it('puts tutors in name order, ignoring the title', () => {
    const groups = groupSessionsForList(
      [
        row(1, '2026-08-25', '10:00 - 11:30', { tutor_name: 'Mr Ivan Chen' }),
        row(2, '2026-08-25', '10:00 - 11:30', { tutor_name: 'Ms Anna Wong' }),
      ],
      { spansDates: false }
    )
    expect(ids(groups)).toEqual([[2, 1]])
  })

  it('leads with a trial, then the main class for that tutor, then everyone else', () => {
    const groups = groupSessionsForList(
      [
        row(1, '2026-08-25', '10:00 - 11:30', { grade: 'F2', school_student_id: 'S1' }),
        row(2, '2026-08-25', '10:00 - 11:30', { grade: 'F1', school_student_id: 'S2' }),
        row(3, '2026-08-25', '10:00 - 11:30', { grade: 'F1', school_student_id: 'S3' }),
        row(4, '2026-08-25', '10:00 - 11:30', { session_status: 'Trial Class', school_student_id: 'S4' }),
      ],
      { spansDates: false }
    )
    expect(ids(groups)).toEqual([[4, 2, 3, 1]])
  })

  it('sorts the main class by school and then by student number', () => {
    const groups = groupSessionsForList(
      [
        row(1, '2026-08-25', '10:00 - 11:30', { school: 'MSB', school_student_id: 'S1' }),
        row(2, '2026-08-25', '10:00 - 11:30', { school: 'MSA', school_student_id: 'S9' }),
        row(3, '2026-08-25', '10:00 - 11:30', { school: 'MSA', school_student_id: 'S2' }),
      ],
      { spansDates: false }
    )
    expect(ids(groups)).toEqual([[3, 2, 1]])
  })
})
