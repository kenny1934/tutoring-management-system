import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ supported: vi.fn(), handle: vi.fn(), load: vi.fn(), compose: vi.fn() }));
vi.mock('./file-system', () => ({ isFileSystemAccessSupported: h.supported, getFileHandleFromPath: h.handle }));
vi.mock('./courseware-pdf', () => ({ loadCoursewarePdf: h.load }));
vi.mock('./summer-courseware-scan', () => ({ parseSummerCoursewarePath: () => null, readCoursewareFile: vi.fn() }));
vi.mock('./pdf-utils', () => ({ composeSideBySidePdf: h.compose }));
import { loadExercisePdf, PDF_LOAD_TIMEOUT_MS } from './lesson-pdf-loader';
const bytes = new TextEncoder().encode('%PDF-1.7').buffer;
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); h.supported.mockReturnValue(false); h.load.mockResolvedValue({ data: bytes, source: 'mckb' }); });
afterEach(() => vi.useRealTimers());
describe('MCKB lesson PDF recovery', () => {
 it('aborts a stalled original at the deadline and allows a clean retry', async () => {
  let signal!: AbortSignal; h.load.mockImplementationOnce((options: { signal: AbortSignal }) => { signal=options.signal; return new Promise(() => {}); });
  const pending=loadExercisePdf('A.pdf'); await vi.advanceTimersByTimeAsync(PDF_LOAD_TIMEOUT_MS);
  expect(await pending).toEqual({ error: 'timed_out' }); expect(signal.aborted).toBe(true);
  expect(await loadExercisePdf('A.pdf')).toEqual({ data: bytes, source: 'mckb' }); expect(vi.getTimerCount()).toBe(0);
 });
 it('never starts a remote request after a stalled connected-folder read has expired', async () => {
  h.supported.mockReturnValue(true); let finish!: (value: unknown) => void; h.handle.mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  const pending=loadExercisePdf('A.pdf'); await vi.advanceTimersByTimeAsync(PDF_LOAD_TIMEOUT_MS); expect(await pending).toEqual({ error: 'timed_out' });
  finish({ success: false }); await vi.advanceTimersByTimeAsync(1); expect(h.load).not.toHaveBeenCalled();
 });
 it('passes cancellation to the provider while a bare filename is being resolved', async () => {
  h.load.mockImplementation(({signal}: {signal: AbortSignal}) => new Promise((_resolve,reject) => signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))));
  const pending=loadExercisePdf('A.pdf'); await vi.advanceTimersByTimeAsync(PDF_LOAD_TIMEOUT_MS); expect(await pending).toEqual({ error: 'timed_out' });
 });
 it.each([[404,'file_not_found'],[503,'fetch_failed'],[403,'fetch_failed']])('preserves a %s failure', async(status,error) => {
  h.load.mockRejectedValue({status}); expect(await loadExercisePdf('A.pdf')).toEqual({error}); expect(vi.getTimerCount()).toBe(0);
 });
 it('loads a canonical indexed original only once and never falls back to another provider',async()=>{
  expect(await loadExercisePdf('[Center]\\indexed.pdf')).toEqual({data:bytes,source:'mckb'}); expect(h.load).toHaveBeenCalledOnce();
 });
});
