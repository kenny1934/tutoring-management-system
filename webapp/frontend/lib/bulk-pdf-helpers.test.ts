import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./materials', () => ({ loadMaterialPdf: h.load }));
import { fetchPdfData, getPageNumbers } from './bulk-pdf-helpers';
beforeEach(() => vi.clearAllMocks());
it('loads MCKB bytes on browsers without connected folders and never calls the legacy resolver', async () => {
 const data = new ArrayBuffer(12), legacy = vi.fn(); h.load.mockResolvedValue({ data });
 const exercise = {pdf_name: '[Center]\\A.pdf', complex_pages: '2,4-6'};
 const fs = { isSupported: () => false, getFileHandle: vi.fn() };
 expect(await fetchPdfData(exercise, fs, legacy)).toEqual({exercise, arrayBuffer: data});
 expect(h.load).toHaveBeenCalledWith(exercise.pdf_name); expect(fs.getFileHandle).not.toHaveBeenCalled(); expect(legacy).not.toHaveBeenCalled(); expect(getPageNumbers(exercise)).toEqual([2,4,5,6]);
});
it('keeps a local PDF first and preserves permission denial without falling back to a legacy provider', async () => {
 const data = new TextEncoder().encode('%PDF-fixture').buffer;
 const fs = { isSupported: () => true, getFileHandle: vi.fn().mockResolvedValue({success: true, handle: {getFile: async () => ({arrayBuffer: async () => data})}}) };
 expect((await fetchPdfData({pdf_name:'A.pdf'}, fs)).arrayBuffer).toBe(data); expect(h.load).not.toHaveBeenCalled();
 h.load.mockResolvedValue({denied:true}); const legacy = vi.fn();
 expect((await fetchPdfData({pdf_name:'B.pdf'}, {...fs,isSupported:()=>false}, legacy)).arrayBuffer).toBeNull(); expect(legacy).not.toHaveBeenCalled();
});
