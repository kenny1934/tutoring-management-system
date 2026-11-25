import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { PdfPreviewModal } from './pdf-preview-modal';
const mocks = vi.hoisted(() => ({ hook: vi.fn(), legacy: vi.fn(() => '/legacy.pdf'), retry: vi.fn() }));
vi.mock('@/hooks/useCoursewarePdf', () => ({ useCoursewarePdf: mocks.hook }));
vi.mock('@/lib/api', () => ({ api: { paperless: { getPreviewUrl: mocks.legacy } }, documentProcessingAPI: {} }));
vi.mock('@/components/ui/modal', () => ({ Modal: ({ children, title }: { children: ReactNode; title?: string }) => <div aria-label={title}>{children}</div> }));
vi.mock('@/lib/pdf-utils', () => ({ validatePageRange: vi.fn(), getPageCount: vi.fn() }));
beforeEach(() => {
  mocks.hook.mockReset(); mocks.legacy.mockClear(); mocks.retry.mockClear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:courseware'), revokeObjectURL: vi.fn() }));
});
it('opens an exact courseware path without looking up a Shelv document and releases its blob on close', async () => {
  mocks.hook.mockReturnValue({ data: { data: new ArrayBuffer(5) }, error: null });
  const props = { isOpen: true, onClose: vi.fn(), documentId: null, sourcePath: '[Center]/algebra.pdf', documentTitle: 'Algebra' };
  const view = render(<PdfPreviewModal {...props} />);
  await waitFor(() => expect(screen.getByTitle('PDF Preview').getAttribute('src')).toContain('blob:courseware'));
  expect(mocks.hook).toHaveBeenCalledWith(props.sourcePath);
  expect(mocks.legacy).not.toHaveBeenCalled();
  view.rerender(<PdfPreviewModal {...props} isOpen={false} />);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:courseware');
});
it('keeps legacy document previews working and provides retry for a path failure', () => {
  const props = { isOpen: true, onClose: vi.fn(), documentId: 12 };
  const view = render(<PdfPreviewModal {...props} />);
  expect(screen.getByTitle('PDF Preview').getAttribute('src')).toContain('/legacy.pdf');
  expect(mocks.hook).not.toHaveBeenCalled();
  mocks.hook.mockReturnValue({ error: 'Unavailable', retry: mocks.retry });
  view.rerender(<PdfPreviewModal {...props} sourcePath="[Center]/algebra.pdf" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
  expect(mocks.retry).toHaveBeenCalledOnce();
});
