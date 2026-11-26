import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { MaterialOriginal } from './MaterialOriginal';
import type { MaterialResult } from './MaterialSearch';
import { clearCoursewarePdfCache } from '@/lib/courseware-pdf';
import { fetchResponse } from '@/lib/api';

const fixture = vi.hoisted(() => ({
  bytes: new TextEncoder().encode('%PDF-1.7 complete original').buffer,
  localBytes: new TextEncoder().encode('%PDF-1.7 connected original').buffer,
  supported: vi.fn(), handle: vi.fn(), viewer: vi.fn(), count: vi.fn(),
}));
vi.mock('@/lib/file-system', () => ({ isFileSystemAccessSupported: fixture.supported, getFileHandleFromPath: fixture.handle }));
vi.mock('@/lib/api', () => ({ fetchResponse: vi.fn(async () => ({ arrayBuffer: async () => fixture.bytes })) }));
vi.mock('@/lib/pdf-utils', () => ({ getPageCount: fixture.count, extractPagesForPrint: vi.fn() }));
vi.mock('next/dynamic', () => ({ default: () => (props: unknown) => { fixture.viewer(props); return null; } }));
beforeEach(() => {
  clearCoursewarePdfCache(); vi.clearAllMocks(); fixture.supported.mockReturnValue(true);
  fixture.handle.mockResolvedValue({ success: false, error: 'folder_not_found' });
  fixture.count.mockResolvedValue(34);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('opens the full authenticated PDF in a new tab even when assignment pages are selected', async () => {
  const blobUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture-original');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const tab = { opener: window };
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  const file = { file_id: 9, filename: 'Fixture.pdf', matched_pages: [16] } as MaterialResult;
  render(<SWRConfig value={{ provider: () => new Map() }}><MaterialOriginal material={file} scope="fixture" pages={[1]} onPageCount={vi.fn()} /></SWRConfig>);
  const button = await screen.findByRole('button', { name: 'Open in new tab' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(blobUrl.mock.calls[0][0]).toMatchObject({ size: fixture.bytes.byteLength, type: 'application/pdf' });
  expect(open).toHaveBeenCalledWith('blob:fixture-original', '_blank');
  expect(tab.opener).toBeNull();
  expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
});

const material = { file_id: 9, filename: 'Fixture.pdf', nas_path: '\\\\office\\Center\\Courseware\\Fixture.pdf', matched_pages: [16] } as MaterialResult;
function mount(initialPage?: number) {
  return render(<SWRConfig value={{ provider: () => new Map() }}><MaterialOriginal material={material} scope="fixture" pages={[]} initialPage={initialPage} onPageCount={vi.fn()} /></SWRConfig>);
}
function localFile(data = fixture.localBytes) {
  fixture.handle.mockResolvedValue({ success: true, handle: { getFile: async () => ({ arrayBuffer: async () => data }) } });
}
it('loads a connected PDF without a gateway request and jumps to its matching page', async () => {
  localFile(); mount();
  await waitFor(() => expect(fixture.viewer).toHaveBeenLastCalledWith(expect.objectContaining({ pdfData: fixture.localBytes, initialPage: 16 })));
  expect(fixture.handle).toHaveBeenCalledWith('[Center]\\Courseware\\Fixture.pdf', { requestPermission: false });
  expect(fetchResponse).not.toHaveBeenCalled();
  expect(fixture.count).not.toHaveBeenCalled();
});
it('uses the gateway directly when connected-folder access is unsupported', async () => {
  fixture.supported.mockReturnValue(false); mount(22);
  await waitFor(() => expect(fixture.viewer).toHaveBeenLastCalledWith(expect.objectContaining({ pdfData: fixture.bytes, initialPage: 22 })));
  expect(fixture.handle).not.toHaveBeenCalled();
  expect(fetchResponse).toHaveBeenCalledWith('/materials/9/raw', expect.objectContaining({ signal: expect.any(AbortSignal) }));
});
it.each(['folder_not_found', 'file_not_found', 'permission_denied'])('falls back when local access reports %s', async error => {
  fixture.handle.mockResolvedValue({ success: false, error }); mount();
  await waitFor(() => expect(fixture.viewer).toHaveBeenLastCalledWith(expect.objectContaining({ pdfData: fixture.bytes, initialPage: 16 })));
});
it('falls back when the connected file read fails', async () => {
  fixture.handle.mockResolvedValue({ success: true, handle: { getFile: async () => { throw new Error('Offline'); } } }); mount();
  await waitFor(() => expect(fetchResponse).toHaveBeenCalled());
});
it('falls back when the connected file is not a PDF', async () => {
  localFile(new TextEncoder().encode('not a PDF').buffer); mount();
  await waitFor(() => expect(fetchResponse).toHaveBeenCalled());
});
it('falls back when a connected PDF cannot be parsed', async () => {
  localFile(); mount();
  await waitFor(() => expect(fixture.viewer).toHaveBeenLastCalledWith(expect.objectContaining({ pdfData: fixture.localBytes })));
  act(() => fixture.viewer.mock.lastCall![0].onDocumentError());
  await waitFor(() => expect(fixture.viewer).toHaveBeenLastCalledWith(expect.objectContaining({ pdfData: fixture.bytes })));
});
it('falls back after a stalled local read and ignores its late result', async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  fixture.handle.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(fetchResponse).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ success: true, handle: { getFile: async () => ({ arrayBuffer: async () => fixture.localBytes }) } });
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(fixture.viewer).toHaveBeenLastCalledWith(expect.objectContaining({ pdfData: fixture.bytes, initialPage: 16 }));
});
