import { describe, it, expect } from 'vitest';
import { buildAnswerPaths } from './answer-file-utils';

describe('buildAnswerPaths', () => {
  it('generates Center alias paths with folder replacement', () => {
    const paths = buildAnswerPaths('[Center]\\Courseware (Eng)\\IB\\abc.pdf');
    // Courseware (Eng) → ANS, IB → IB_2020
    expect(paths.some(p => p.includes('ANS\\IB_2020\\abc_ANS.pdf'))).toBe(true);
    expect(paths.some(p => p.includes('ANS\\IB_2020\\abc_ans.pdf'))).toBe(true);
  });

  it('generates Center alias paths with _ANS suffix variations', () => {
    const paths = buildAnswerPaths('[Center]\\Courseware (Eng)\\test.pdf');
    expect(paths.some(p => p.endsWith('test_ANS.pdf'))).toBe(true);
    expect(paths.some(p => p.endsWith('test_ans.pdf'))).toBe(true);
    expect(paths.some(p => p.endsWith('test_Ans.pdf'))).toBe(true);
  });

  it('generates DSE filename transformation', () => {
    const paths = buildAnswerPaths('[Center]\\DSE\\DSE_09.4_Practice.pdf');
    expect(paths.some(p => p.includes('DSE_09.4_KEY.pdf'))).toBe(true);
  });

  it('generates Courseware Developer paths with Ans subfolder', () => {
    const paths = buildAnswerPaths('[Courseware Developer 中學]\\F4\\test.pdf');
    expect(paths.some(p => p.includes('\\Ans\\test_ANS.pdf'))).toBe(true);
    expect(paths.some(p => p.includes('\\ANS\\test_ANS.pdf'))).toBe(true);
  });

  it('generates generic alias paths with Ans subfolder', () => {
    const paths = buildAnswerPaths('[MyAlias]\\Dir\\test.pdf');
    expect(paths.some(p => p.includes('[MyAlias]\\Dir\\Ans\\test_ANS.pdf'))).toBe(true);
    expect(paths.some(p => p.includes('[MyAlias]\\Dir\\ANS\\test_ANS.pdf'))).toBe(true);
  });

  it('returns empty for no alias', () => {
    const paths = buildAnswerPaths('test.pdf');
    expect(paths).toEqual([]);
  });

  it('strips surrounding quotes', () => {
    const paths = buildAnswerPaths('"[Center]\\Courseware (Eng)\\test.pdf"');
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some(p => p.includes('"'))).toBe(false);
  });
});
