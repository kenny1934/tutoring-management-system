import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditableLessonNumberBadge } from './EditableLessonNumberBadge'

describe('EditableLessonNumberBadge', () => {
  it('renders an editable badge button when lesson number is set', () => {
    render(<EditableLessonNumberBadge lessonNumber={4} onSave={vi.fn()} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
    expect(screen.getByText('L4')).toBeInTheDocument()
  })

  it('renders a muted read-only badge for a borrowed lesson number', () => {
    render(
      <EditableLessonNumberBadge
        lessonNumber={null}
        movedLessonNumber={5}
        onSave={vi.fn()}
      />
    )
    const badge = screen.getByText('L5')
    expect(badge.className).toContain('opacity-60')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing when neither number is set', () => {
    const { container } = render(
      <EditableLessonNumberBadge lessonNumber={null} onSave={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })
})
