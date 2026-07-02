import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LessonNumberBadge, SessionLessonBadge } from './LessonNumberBadge'

describe('LessonNumberBadge', () => {
  it('renders nothing for null lesson number', () => {
    const { container } = render(<LessonNumberBadge lessonNumber={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the lesson number', () => {
    render(<LessonNumberBadge lessonNumber={3} />)
    expect(screen.getByText('L3')).toBeInTheDocument()
    expect(screen.getByTitle('Lesson 3')).toBeInTheDocument()
  })

  it('renders muted styling when moved', () => {
    render(<LessonNumberBadge lessonNumber={5} moved />)
    const badge = screen.getByText('L5')
    expect(badge.className).toContain('opacity-60')
    expect(badge.className).toContain('border-dashed')
    expect(screen.getByTitle('Lesson 5 (moved to booked make-up)')).toBeInTheDocument()
  })
})

describe('SessionLessonBadge', () => {
  it('uses own lesson_number when present', () => {
    render(<SessionLessonBadge session={{ lesson_number: 4 }} />)
    const badge = screen.getByText('L4')
    expect(badge.className).not.toContain('opacity-60')
  })

  it('falls back to moved_lesson_number with muted styling', () => {
    render(
      <SessionLessonBadge session={{ lesson_number: null, moved_lesson_number: 5 }} />
    )
    const badge = screen.getByText('L5')
    expect(badge.className).toContain('opacity-60')
  })

  it('renders nothing when neither is set', () => {
    const { container } = render(<SessionLessonBadge session={{}} />)
    expect(container.firstChild).toBeNull()
  })
})
