import { beforeEach, describe, it, expect, vi } from 'vitest';
import { buildAnswerPaths, searchAnswerFile } from './answer-file-utils';
const mocks = vi.hoisted(() => ({ supported: vi.fn(), getFile: vi.fn(), search: vi.fn(), getTags: vi.fn() }));
vi.mock('./file-system', () => ({ isFileSystemAccessSupported: mocks.supported, getFileHandleFromPath: mocks.getFile }));
vi.mock('./api', () => ({ paperlessAPI: { search: mocks.search, getTags: mocks.getTags } }));
vi.mock('./paperless-utils', () => ({ searchPaperlessByPath: vi.fn() }));

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

const worksheet = String.raw`[Center]\Courseware (Eng)\IGCSE\IGCSE_01.1_Number_System.pdf`;
const answerPath = String.raw`[Center]\ANS\IGCSE\IGCSE_01.1_ANS.pdf`;

describe('IGCSE answer detection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.supported.mockReturnValue(false);
    mocks.getTags.mockResolvedValue({ tags: [{ id: 7, name: 'Ans' }] });
    mocks.search.mockResolvedValue({ results: [] });
  });

  it.each([
    ['IGCSE_01.1_Number_System', 'IGCSE_01.1_ANS'],
    ['IGCSE_32.7_Percentiles', 'IGCSE_32.7_ANS'],
    ['IGCSE_01_Challenge', 'IGCSE_01_ANS'],
  ])('prioritises the local answer for %s', (name, answer) => {
    expect(buildAnswerPaths(`[Center]\\Courseware (Eng)\\IGCSE\\${name}.pdf`)[0])
      .toBe(`[Center]\\ANS\\IGCSE\\${answer}.pdf`);
  });

  it('finds the local answer before searching Shelv', async () => {
    mocks.supported.mockReturnValue(true);
    mocks.getFile.mockImplementation(async (path: string) => ({ success: path === answerPath }));
    expect(await searchAnswerFile(worksheet)).toEqual({ path: answerPath, source: 'local' });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it.each([
    ['IGCSE_01.1_Number_System', 'IGCSE_01.1_ANS'],
    ['IGCSE_01_Challenge', 'IGCSE_01_ANS'],
  ])('uses the shortened Shelv name for %s', async (name, answer) => {
    mocks.search.mockResolvedValue({ results: [{ id: 42, title: `${answer}.pdf` }] });
    expect(await searchAnswerFile(`${name}.pdf`)).toEqual({ source: 'shelv', path: `${answer}.pdf`, documentId: 42 });
    expect(mocks.search).toHaveBeenCalledWith(answer, 10, 'title', [7]);
  });

  it('rejects a section answer for a Challenge sheet', async () => {
    mocks.search.mockResolvedValue({ results: [{ id: 42, title: 'IGCSE_01.1_ANS' }] });
    expect(await searchAnswerFile('IGCSE_01_Challenge.pdf')).toBeNull();
  });

  it('retries without the tag and matches the original filename', async () => {
    mocks.search.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({
      results: [{ id: 42, title: 'Number system answers', original_path: answerPath }],
    });
    expect(await searchAnswerFile(worksheet)).toEqual({ source: 'shelv', path: answerPath, documentId: 42 });
    expect(mocks.search).toHaveBeenLastCalledWith('IGCSE_01.1_ANS', 10, 'title');
  });

  it('preserves other Shelv filename searches', async () => {
    mocks.search.mockResolvedValue({ results: [{ id: 42, title: 'algebra_ans' }] });
    expect(await searchAnswerFile('algebra.pdf')).toMatchObject({ documentId: 42 });
    expect(mocks.search).toHaveBeenCalledWith('algebra_ans', 10, 'title', [7]);
  });
});

describe('SAT, SG and DSE answer detection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.supported.mockReturnValue(false);
    mocks.getTags.mockResolvedValue({ tags: [{ id: 7, name: 'Ans' }] });
    mocks.search.mockResolvedValue({ results: [] });
  });

  it('prioritises SAT keys locally', () => {
    expect(buildAnswerPaths(String.raw`[Center]\Courseware (Eng)\SAT\SAT_01_Properties_of_Integer.pdf`)[0])
      .toBe(String.raw`[Center]\ANS\SAT\SAT_01_Properties_of_Integer_KEY.pdf`);
  });

  it.each([1, 2, 3, 4, 5, 6])('maps SG P%s to its numbered answer folder', (grade) => {
    expect(buildAnswerPaths(`[Center]\\Courseware (Eng)\\SG\\P${grade}\\worksheet.pdf`)[0])
      .toBe(`[Center]\\ANS\\SG\\${grade}\\worksheet_ANS.pdf`);
  });

  it('maps the SG mock folder case', () => {
    expect(buildAnswerPaths(String.raw`[Center]\Courseware (Eng)\SG\MOCK\SG_MOCK_1A_01.pdf`)[0])
      .toBe(String.raw`[Center]\ANS\SG\Mock\SG_MOCK_1A_01_ANS.pdf`);
  });

  it('preserves numbered folders outside SG', () => {
    expect(buildAnswerPaths(String.raw`[Center]\Courseware (Eng)\PS\P1\worksheet.pdf`)[0])
      .toBe(String.raw`[Center]\ANS\PS\P1\worksheet_ANS.pdf`);
  });

  it('finds a DSE key with mixed-case suffix locally', async () => {
    const path = String.raw`[Center]\ANS\DSE_key\DSE_03.2_Key.pdf`;
    mocks.supported.mockReturnValue(true);
    mocks.getFile.mockImplementation(async (candidate: string) => ({ success: candidate === path }));
    expect(await searchAnswerFile(String.raw`[Center]\Courseware (Eng)\DSE\DSE_03.2_Revision_on_Percentage_II.pdf`))
      .toEqual({ path, source: 'local' });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it.each([
    ['SAT_01_Properties_of_Integer', 'SAT_01_Properties_of_Integer_KEY'],
    ['DSE_03.2_Revision_on_Percentage_II', 'DSE_03.2_KEY'],
  ])('searches Shelv for the key for %s', async (name, answer) => {
    mocks.search.mockResolvedValue({ results: [{ id: 42, title: `${answer.toLowerCase()}.pdf` }] });
    expect(await searchAnswerFile(`${name}.pdf`)).toMatchObject({ source: 'shelv', documentId: 42 });
    expect(mocks.search).toHaveBeenCalledWith(answer, 10, 'title', [7]);
  });

  it('retries a key search without the Ans tag', async () => {
    mocks.search.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({
      results: [{ id: 42, title: 'DSE_03.2_Key.pdf' }],
    });
    expect(await searchAnswerFile('DSE_03.2_Revision_on_Percentage_II.pdf')).toMatchObject({ documentId: 42 });
    expect(mocks.search).toHaveBeenLastCalledWith('DSE_03.2_KEY', 10, 'title');
  });

  it.each([
    ['DSE_03.2_Revision_on_Percentage_II', 'DSE_03.20_KEY'],
    ['SAT_01_Properties_of_Integer', 'SAT_01_Properties_of_Integer_KEY_extra'],
  ])('rejects a similarly named key for %s', async (name, wrongAnswer) => {
    mocks.search.mockResolvedValue({ results: [{ id: 42, title: wrongAnswer }] });
    expect(await searchAnswerFile(`${name}.pdf`)).toBeNull();
  });
});
