import { describe, expect, it } from 'vitest';
import { materialPages } from './material-pages';

describe('Material page selection', () => {
  it('preserves explicit page order while removing duplicates', () => expect(materialPages('3, 1-2, 3', 5)).toEqual([3, 1, 2]));
  it.each(['0', '-2', '3-1', '1,999', 'page 2', '2foo', '1.5', '', '1-', '1,'])('rejects ambiguous or out-of-bounds selection %s', value => expect(materialPages(value, 20)).toBeNull());
  it('requires a known physical PDF page count', () => expect(materialPages('1', null)).toBeNull());
});
