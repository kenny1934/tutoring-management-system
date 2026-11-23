import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { MaterialOriginal } from './MaterialOriginal';
import type { MaterialResult } from './MaterialSearch';

const fixture = vi.hoisted(() => ({ bytes: new TextEncoder().encode('%PDF-1.7 complete original').buffer }));
vi.mock('@/lib/api', () => ({ fetchResponse: vi.fn(async () => ({ arrayBuffer: async () => fixture.bytes })) }));
vi.mock('@/lib/pdf-utils', () => ({ getPageCount: async () => 34, extractPagesForPrint: vi.fn() }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
afterEach(() => { vi.restoreAllMocks(); });
it('opens the full authenticated PDF in a new tab even when assignment pages are selected', async () => {
  const blobUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture-original');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const tab = { opener: window };
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  const file = { file_id: 9, filename: 'Fixture.pdf', matched_pages: [16] } as MaterialResult;
  render(<SWRConfig value={{ provider: () => new Map() }}><MaterialOriginal material={file} scope="fixture" pages={[1]} onPageCount={vi.fn()} /></SWRConfig>);
  const button = await screen.findByRole('button', { name: 'Open in new tab' });
  await vi.waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(blobUrl.mock.calls[0][0]).toMatchObject({ size: fixture.bytes.byteLength, type: 'application/pdf' });
  expect(open).toHaveBeenCalledWith('blob:fixture-original', '_blank');
  expect(tab.opener).toBeNull();
  expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
});
