import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ json: vi.fn(), response: vi.fn(), supported: vi.fn(), handle: vi.fn() }));
vi.mock('./api', () => ({ fetchAPI: h.json, fetchResponse: h.response }));
vi.mock('./file-system', () => ({ isFileSystemAccessSupported: h.supported, getFileHandleFromPath: h.handle }));
import { clearCoursewarePdfCache, loadCoursewarePdf, setCoursewarePdfScope } from './courseware-pdf';
const bytes = new TextEncoder().encode('%PDF-1.7 fixture').buffer;
beforeEach(() => {
  vi.clearAllMocks(); clearCoursewarePdfCache(); setCoursewarePdfScope('tutor-1');
  h.supported.mockReturnValue(false); h.json.mockResolvedValue({ file_id: 7 });
  h.response.mockResolvedValue({ arrayBuffer: async () => bytes });
});
afterEach(() => vi.useRealTimers());
it('resolves an exact path and reuses bytes across the console and trending previews', async () => {
  const first = await loadCoursewarePdf({ path: '[Center]\\DSE\\Exam.pdf', fileId: 7, scope: 'tutor-1:Center' });
  expect(await loadCoursewarePdf({ path: '\\\\office\\Center\\DSE\\Exam.pdf' })).toBe(first);
  expect(h.response).toHaveBeenCalledTimes(1); expect(h.json).not.toHaveBeenCalled();
});
it('rejects a forbidden lookup without guessing a different document', async () => {
  h.json.mockRejectedValue({ status: 403 });
  await expect(loadCoursewarePdf({ path: '[Center]\\Exam.pdf' })).rejects.toMatchObject({ status: 403 });
  expect(h.response).not.toHaveBeenCalled();
});
it('clears bytes when the effective account scope changes', async () => {
  await loadCoursewarePdf({ path: '[Center]\\Exam.pdf', fileId: 7 });
  setCoursewarePdfScope('tutor-2');
  await loadCoursewarePdf({ path: '[Center]\\Exam.pdf', fileId: 7 });
  expect(h.response).toHaveBeenCalledTimes(2);
});
it('expires old bytes instead of keeping an old NAS revision indefinitely', async () => {
  vi.useFakeTimers(); await loadCoursewarePdf({ path: '[Center]\\Exam.pdf', fileId: 7 });
  await vi.advanceTimersByTimeAsync(120001);
  await loadCoursewarePdf({ path: '[Center]\\Exam.pdf', fileId: 7 });
  expect(h.response).toHaveBeenCalledTimes(2);
});
it('evicts the oldest PDF after eight files', async () => {
  for (let i = 0; i < 9; i++) await loadCoursewarePdf({ path: `[Center]\\${i}.pdf`, fileId: i + 1 });
  await loadCoursewarePdf({ path: '[Center]\\0.pdf', fileId: 1 });
  expect(h.response).toHaveBeenCalledTimes(10);
});
it('also evicts by byte size', async () => {
  const large = new Uint8Array(17 * 1024 * 1024); large.set(new TextEncoder().encode('%PDF-'));
  h.response.mockResolvedValue({ arrayBuffer: async () => large.buffer });
  await loadCoursewarePdf({ path: '[Center]\\A.pdf', fileId: 1 });
  await loadCoursewarePdf({ path: '[Center]\\B.pdf', fileId: 2 });
  await loadCoursewarePdf({ path: '[Center]\\A.pdf', fileId: 1 });
  expect(h.response).toHaveBeenCalledTimes(3);
});
it('never caches a result arriving after its request was aborted', async () => {
  let finish!: (r: unknown) => void;
  h.response.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController(); const pending = loadCoursewarePdf({ path: '[Center]\\Exam.pdf', fileId: 7, signal: controller.signal });
  await vi.waitFor(() => expect(h.response).toHaveBeenCalled()); controller.abort();
  finish({ arrayBuffer: async () => bytes }); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await loadCoursewarePdf({ path: '[Center]\\Exam.pdf', fileId: 7 }); expect(h.response).toHaveBeenCalledTimes(2);
});
it('does not cache an old account result arriving after a scope switch', async () => {
  let finish!: (r: unknown) => void;
  h.response.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const pending = loadCoursewarePdf({ path: '[Center]\\Exam.pdf', fileId: 7 });
  await vi.waitFor(() => expect(h.response).toHaveBeenCalled()); setCoursewarePdfScope('tutor-2');
  finish({ arrayBuffer: async () => bytes }); await pending;
  await loadCoursewarePdf({ path: '[Center]\\Exam.pdf', fileId: 7 }); expect(h.response).toHaveBeenCalledTimes(2);
});

it('resolves a drive-stripped path exactly before reading the selected connected folder', async () => {
  h.json.mockResolvedValue({ file_id: 7, nas_path: '[Courseware Developer 中學]\\Secondary\\Practice.pdf' });
  h.supported.mockReturnValue(true);
  h.handle.mockResolvedValue({ success: true, handle: { getFile: async () => ({ arrayBuffer: async () => bytes }) } });
  expect(await loadCoursewarePdf({ path: '\\Secondary\\Practice.pdf' })).toMatchObject({ source: 'local', data: bytes });
  expect(h.json).toHaveBeenCalledWith('/materials/resolve', expect.objectContaining({ body: JSON.stringify({ path: '\\Secondary\\Practice.pdf' }) }));
  expect(h.handle).toHaveBeenCalledWith('[Courseware Developer 中學]\\Secondary\\Practice.pdf', { requestPermission: false });
  expect(h.response).not.toHaveBeenCalled();
});
it('does not guess a source when the saved relative path is ambiguous', async () => {
  h.json.mockRejectedValue({ status: 409 });
  await expect(loadCoursewarePdf({ path: '\\Practice.pdf' })).rejects.toMatchObject({ status: 409 });
  expect(h.handle).not.toHaveBeenCalled(); expect(h.response).not.toHaveBeenCalled();
});
