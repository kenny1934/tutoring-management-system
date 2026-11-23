import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MathText } from './math-text';

describe('Shared maths text', () => {
  it('renders inline and display LaTeX using the existing KaTeX engine', () => {
    const { container } = render(<MathText text={String.raw`解 $x^2+1=0$。 $$\frac{1}{2}$$ 然後 \(a+b\) 和 \[c^2\]`} />);
    expect(container.querySelectorAll('.katex')).toHaveLength(4);
    expect(container.querySelectorAll('.katex-display')).toHaveLength(2);
    expect(container).toHaveTextContent('解');
  });
  it('keeps OCR HTML as text and never enables trusted LaTeX commands', () => {
    const { container } = render(<MathText text={String.raw`<img src=x onerror=alert(1)> $\href{javascript:alert(1)}{x}$`} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
    expect(container).toHaveTextContent('<img');
  });
  it('preserves Unicode code-point offsets for highlighting after a formula', () => {
    const text = String.raw`📚 解 $x^2$ fractions`;
    const renderText = vi.fn((value: string, offset: number) => <span data-offset={offset}>{value}</span>);
    render(<MathText text={text} renderText={renderText} />);
    expect(screen.getByText('fractions')).toHaveAttribute('data-offset', String(Array.from(String.raw`📚 解 $x^2$`).length));
  });
});
