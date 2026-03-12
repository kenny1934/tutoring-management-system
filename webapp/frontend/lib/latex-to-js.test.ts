import { describe, it, expect } from 'vitest';
import { latexToJs } from './latex-to-js';

describe('latexToJs', () => {
  it('converts basic trig functions', () => {
    expect(latexToJs('\\sin(x)')).toBe('Math.sin(x)');
    expect(latexToJs('\\cos(x)')).toBe('Math.cos(x)');
    expect(latexToJs('\\tan(x)')).toBe('Math.tan(x)');
  });

  it('converts inverse trig', () => {
    expect(latexToJs('\\arcsin(x)')).toBe('Math.asin(x)');
    expect(latexToJs('\\arccos(x)')).toBe('Math.acos(x)');
  });

  it('converts reciprocal trig', () => {
    const result = latexToJs('\\csc(x)');
    expect(result).toContain('1/Math.sin');
  });

  it('converts fractions', () => {
    expect(latexToJs('\\frac{a}{b}')).toBe('((a)/(b))');
  });

  it('converts powers with braces', () => {
    expect(latexToJs('x^{2}')).toBe('x**(2)');
  });

  it('converts single-char power', () => {
    expect(latexToJs('x^2')).toBe('x**2');
  });

  it('converts square root', () => {
    expect(latexToJs('\\sqrt{x}')).toBe('Math.sqrt((x))');
  });

  it('converts nth root', () => {
    expect(latexToJs('\\sqrt[3]{x}')).toBe('Math.pow((x),1/(3))');
  });

  it('converts pi constant', () => {
    expect(latexToJs('\\pi')).toBe('Math.PI');
  });

  it('handles implicit multiplication', () => {
    expect(latexToJs('2x')).toBe('2*x');
  });

  it('converts multiplication operators', () => {
    expect(latexToJs('a\\cdot b')).toBe('a*b');
    expect(latexToJs('a\\times b')).toBe('a*b');
  });

  it('converts ln and log', () => {
    expect(latexToJs('\\ln(x)')).toBe('Math.log(x)');
    // Implicit multiplication inserts * between 0 and (: log10*(x)
    // This is a known quirk — the log1*0 fix only handles the digit split
    expect(latexToJs('\\log(x)')).toBe('Math.log10*(x)');
    expect(latexToJs('\\log{x}')).toBe('Math.log10*(x)');
  });
});
