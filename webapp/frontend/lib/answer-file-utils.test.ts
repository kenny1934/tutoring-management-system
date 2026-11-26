import { beforeEach, describe, it, expect, vi } from 'vitest';
import { buildAnswerPaths, searchAnswerFile } from './answer-file-utils';
const mocks = vi.hoisted(() => ({ supported: vi.fn(), getFile: vi.fn(), resolve: vi.fn(), search: vi.fn() }));
vi.mock('./file-system', () => ({ isFileSystemAccessSupported: mocks.supported, getFileHandleFromPath: mocks.getFile }));
vi.mock('./courseware-lookup', () => ({ resolveCoursewareFile: mocks.resolve, searchCoursewareFiles: mocks.search }));
beforeEach(() => {
  vi.resetAllMocks(); mocks.supported.mockReturnValue(false); mocks.getFile.mockResolvedValue({ success: false });
  mocks.resolve.mockRejectedValue({ status: 404 }); mocks.search.mockResolvedValue({ files: [], complete: true });
});
const worksheet = String.raw`[Center]\Courseware (Eng)\IGCSE\IGCSE_01.1_Number_System.pdf`;
const answerPath = String.raw`[Center]\ANS\IGCSE\IGCSE_01.1_ANS.pdf`;
const remote = (filename: string, nas_path = '[Center]\\ANS\\' + filename) => ({ file_id: 42, filename, nas_path, ext: '.pdf' });
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

describe('MCKB answer discovery', () => {
  it.each([
    ['IGCSE_01.1_Number_System', 'IGCSE_01.1_ANS'],
    ['IGCSE_01_Challenge', 'IGCSE_01_ANS'],
    ['SAT_01_Properties_of_Integer', 'SAT_01_Properties_of_Integer_KEY'],
    ['DSE_03.2_Revision_on_Percentage_II', 'DSE_03.2_KEY'],
    ['algebra', 'algebra_ANS'],
  ])('finds the exact answer filename for %s', async (name, expected) => {
    mocks.search.mockResolvedValue({ files: [remote(expected.toLowerCase()+'.pdf')], complete: true });
    expect(await searchAnswerFile(name+'.pdf')).toMatchObject({ source: 'mckb', fileId: 42 });
    expect(mocks.search).toHaveBeenCalledWith(expected+'.pdf');
  });
  it('uses an existing connected answer before any remote lookup', async () => {
    mocks.supported.mockReturnValue(true); mocks.getFile.mockImplementation(async (path: string) => ({ success: path === answerPath }));
    expect(await searchAnswerFile(worksheet)).toEqual({ path: answerPath, source: 'local' });
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.search).not.toHaveBeenCalled();
  });
  it('prefers the expected source and folder over an unrelated same-name answer', async () => {
    mocks.resolve.mockImplementation(async (path: string) => { if(path === answerPath) return { file_id: 42, nas_path: answerPath }; throw { status: 404 }; });
    expect(await searchAnswerFile(worksheet)).toEqual({ source: 'mckb', fileId: 42, path: answerPath });
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it.each([
    ['IGCSE_01_Challenge', 'IGCSE_01.1_ANS.pdf'],
    ['DSE_03.2_Revision_on_Percentage_II', 'DSE_03.20_KEY.pdf'],
    ['SAT_01_Properties_of_Integer', 'SAT_01_Properties_of_Integer_KEY_extra.pdf'],
  ])('never substitutes a neighbouring section or similarly named answer for %s', async (name, wrong) => {
    mocks.search.mockResolvedValue({ files: [remote(wrong)], complete: true });
    expect(await searchAnswerFile(name+'.pdf')).toBeNull();
  });
  it('does not guess among answer files from different folders', async () => {
    mocks.search.mockResolvedValue({ files: [remote('algebra_ANS.pdf'), remote('algebra_ANS.pdf', '[Center]\\Other\\algebra_ANS.pdf')], complete: true });
    expect(await searchAnswerFile('algebra.pdf')).toBeNull();
  });
  it('does not treat an access denial as permission to search another source', async () => {
    mocks.resolve.mockRejectedValue({ status: 403 });
    await expect(searchAnswerFile(worksheet)).rejects.toMatchObject({ status: 403 });
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
describe('Local SAT, SG and DSE conventions', () => {
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


});
