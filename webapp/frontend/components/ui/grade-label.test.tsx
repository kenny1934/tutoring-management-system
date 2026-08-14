import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GradeBadge, EnteringGradeBadge } from './grade-label';
import { GRADE_COLORS } from '@/lib/constants';

// The window that turns a stored grade into its "Pre-" form. Held open for
// every test in here, because that is the only time the two badges disagree,
// and it is why a grade rendered with the wrong one looks correct from
// September onwards and wrong all summer.
vi.mock('@/lib/hooks/useSummerPreGradeWindow', () => ({
  useSummerPreGradeWindow: () => ({ start: '2026-07-05', end: '2026-08-31' }),
}));

const inWindow = new Date(2026, 7, 14); // 14 Aug 2026

describe('grade badges inside the pre-grade window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(inWindow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('promotes a stored student grade, which is what GradeBadge is for', () => {
    render(<GradeBadge grade="F4" langStream="E" />);
    expect(screen.getByText('Pre-F5E')).toBeInTheDocument();
  });

  it('leaves an entering grade alone', () => {
    // An F4 application is a student going into F4. Promoting it would put them
    // in F5, which is a year they will not reach until 2027.
    render(<EnteringGradeBadge grade="F4" langStream="E" />);
    expect(screen.getByText('F4E')).toBeInTheDocument();
    expect(screen.queryByText(/Pre-/)).toBeNull();
  });

  it('colours an entering grade by the grade it actually is', () => {
    render(<EnteringGradeBadge grade="F1" langStream="E" />);
    // Not F2E's colour, which is where the promoting badge would land.
    expect(screen.getByText('F1E')).toHaveStyle({
      backgroundColor: GRADE_COLORS.F1E,
    });
  });

  it('renders the grade alone when no stream governs the placement', () => {
    render(<EnteringGradeBadge grade="F3" langStream={null} />);
    expect(screen.getByText('F3')).toBeInTheDocument();
  });

  it('renders nothing without a grade', () => {
    const { container } = render(<EnteringGradeBadge grade={null} langStream="C" />);
    expect(container).toBeEmptyDOMElement();
  });
});
