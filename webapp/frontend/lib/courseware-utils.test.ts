import { expect, it } from 'vitest';
import { getTrendingPath, splitCoursewarePaths } from './courseware-utils';
it('keeps commas in filenames while separating subsequent rooted copies', () => {
  const first = '[Center]\\Courseware (Eng)\\PHC-E F4 Division of Polynomials, Remainder Theorem, Factor Theorem.pdf';
  const second = 'Courseware Developer 中學\\Secondary\\Other.pdf';
  expect(splitCoursewarePaths(first + ', ' + second)).toEqual([first, second]);
  expect(getTrendingPath({ filename: 'PHC-E F4', normalized_paths: first + ', ' + second })).toBe(first);
});
it('prefers a supported rooted copy when legacy data includes a drive-stripped path', () => {
  const rooted = 'Courseware Developer 中學\\Secondary\\Finalised\\Practice.pdf';
  expect(getTrendingPath({ filename: 'Practice', normalized_paths: '\\Secondary\\Finalised\\Practice.pdf, ' + rooted })).toBe(rooted);
});
it('keeps commas in UNC and mapped-drive paths, including multiple copies', () => {
  const first = '\\\\office\\Center\\Algebra, Part 1.pdf';
  const second = 'Z:\\Algebra, Part 2.pdf';
  expect(splitCoursewarePaths(first + ', ' + second)).toEqual([first, second]);
});

it('splits older forward-slash rooted copies without splitting commas inside a filename', () => {
  expect(splitCoursewarePaths('/path/Algebra, Part 1.pdf, /path/Other.pdf')).toEqual(['/path/Algebra, Part 1.pdf', '/path/Other.pdf']);
});
