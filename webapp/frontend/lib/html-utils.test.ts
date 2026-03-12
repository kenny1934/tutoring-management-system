import { describe, it, expect } from 'vitest';
import {
  unescapeHtmlEntities,
  normalizeDisplaylines,
  stripHtml,
  stripBlockquotes,
  isHtmlEmpty,
} from './html-utils';

// ============================================================================
// unescapeHtmlEntities
// ============================================================================

describe('unescapeHtmlEntities', () => {
  it('unescapes &amp;', () => {
    expect(unescapeHtmlEntities('A &amp; B')).toBe('A & B');
  });

  it('unescapes &lt; and &gt;', () => {
    expect(unescapeHtmlEntities('&lt;div&gt;')).toBe('<div>');
  });

  it('unescapes &quot;', () => {
    expect(unescapeHtmlEntities('&quot;hello&quot;')).toBe('"hello"');
  });

  it('handles multiple entities', () => {
    expect(unescapeHtmlEntities('&amp;&lt;&gt;&quot;')).toBe('&<>"');
  });

  it('passes through text without entities', () => {
    expect(unescapeHtmlEntities('plain text')).toBe('plain text');
  });
});

// ============================================================================
// normalizeDisplaylines
// ============================================================================

describe('normalizeDisplaylines', () => {
  it('merges multiple brace groups', () => {
    expect(normalizeDisplaylines('\\displaylines{a}{b}')).toBe('\\displaylines{a \\\\ b}');
  });

  it('merges three groups', () => {
    expect(normalizeDisplaylines('\\displaylines{a}{b}{c}')).toBe('\\displaylines{a \\\\ b \\\\ c}');
  });

  it('leaves single group unchanged', () => {
    expect(normalizeDisplaylines('\\displaylines{a \\\\ b}')).toBe('\\displaylines{a \\\\ b}');
  });

  it('handles nested braces', () => {
    expect(normalizeDisplaylines('\\displaylines{\\frac{1}{2}}{x}')).toBe('\\displaylines{\\frac{1}{2} \\\\ x}');
  });

  it('handles no displaylines', () => {
    expect(normalizeDisplaylines('x^2 + y^2')).toBe('x^2 + y^2');
  });
});

// ============================================================================
// stripHtml
// ============================================================================

describe('stripHtml', () => {
  it('removes all HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('trims whitespace', () => {
    expect(stripHtml('  <p>text</p>  ')).toBe('text');
  });

  it('returns empty for empty tags', () => {
    expect(stripHtml('<p></p>')).toBe('');
  });

  it('handles plain text', () => {
    expect(stripHtml('just text')).toBe('just text');
  });
});

// ============================================================================
// stripBlockquotes
// ============================================================================

describe('stripBlockquotes', () => {
  it('removes blockquote elements', () => {
    expect(stripBlockquotes('<p>Keep</p><blockquote>Remove</blockquote>')).toBe('<p>Keep</p>');
  });

  it('removes blockquotes with attributes', () => {
    expect(stripBlockquotes('<blockquote data-msg-id="5">Quoted</blockquote><p>Rest</p>')).toBe('<p>Rest</p>');
  });

  it('preserves content without blockquotes', () => {
    expect(stripBlockquotes('<p>No quotes</p>')).toBe('<p>No quotes</p>');
  });
});

// ============================================================================
// isHtmlEmpty
// ============================================================================

describe('isHtmlEmpty', () => {
  it('returns true for null/undefined', () => {
    expect(isHtmlEmpty(null)).toBe(true);
    expect(isHtmlEmpty(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isHtmlEmpty('')).toBe(true);
  });

  it('returns true for empty paragraph', () => {
    expect(isHtmlEmpty('<p></p>')).toBe(true);
  });

  it('returns true for tags with only whitespace', () => {
    expect(isHtmlEmpty('<p>   </p>')).toBe(true);
  });

  it('returns false for content', () => {
    expect(isHtmlEmpty('<p>hello</p>')).toBe(false);
  });

  it('returns false for math nodes (even without visible text)', () => {
    expect(isHtmlEmpty('<span data-type="inline-math" data-latex="x^2"></span>')).toBe(false);
  });

  it('returns false for block math', () => {
    expect(isHtmlEmpty('<div data-type="block-math" data-latex="y=mx+b"></div>')).toBe(false);
  });

  it('returns false for geometry diagrams', () => {
    expect(isHtmlEmpty('<div data-type="geometry-diagram" data-graph-json="{}"></div>')).toBe(false);
  });
});
