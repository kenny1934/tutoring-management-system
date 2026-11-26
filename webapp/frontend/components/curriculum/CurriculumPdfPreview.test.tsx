import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CurriculumPdfPreview } from './CurriculumPdfPreview';
import { CoursewarePreviewState } from '@/components/courseware/CoursewarePreviewState';
const h = vi.hoisted(() => ({ load: vi.fn(), canvas: vi.fn() }));
vi.mock('@/lib/lesson-pdf-loader', () => ({ loadExercisePdf: h.load }));
vi.mock('@/components/courseware/CanvasPdfPreview', () => ({ CanvasPdfPreview: (props: {title: string; data?: ArrayBuffer; error?: string | null; onRetry?: () => void}) => { h.canvas(props); return props.data ? <div data-testid="canvas-reader">{props.title}</div> : <CoursewarePreviewState error={props.error} onRetry={props.onRetry} />; } }));
vi.mock('@/hooks/usePopoverSheet', () => ({ useAsSheet: () => false }));
beforeEach(() => { vi.clearAllMocks(); h.load.mockResolvedValue({ data: new ArrayBuffer(8), source: 'mckb' }); vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:worksheet'), revokeObjectURL: vi.fn() })); });
it('passes MCKB PDF bytes to the shared canvas reader and preserves Add and Close', async () => {
 const add = vi.fn(), close = vi.fn();
 const view = render(<CurriculumPdfPreview filePath={'[Center]\\A.pdf'} fileLabel="A" onAdd={add} onClose={close} />);
 await screen.findByTestId('canvas-reader'); expect(h.load).toHaveBeenCalledWith('[Center]\\A.pdf');
 expect(h.canvas.mock.calls.at(-1)![0].data.byteLength).toBe(8); expect(document.querySelector('iframe')).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: 'Add to session' })); expect(add).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
 view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:worksheet');
});
it('retries a failed preview and clears the previous reader immediately on source change', async () => {
 h.load.mockResolvedValueOnce({ error: 'fetch_failed' });
 const view = render(<CurriculumPdfPreview filePath={'[Center]\\A.pdf'} fileLabel="A" onClose={vi.fn()} />);
 fireEvent.click(await screen.findByRole('button', { name: /retry preview/i }));
 await screen.findByTestId('canvas-reader');
 let finish!: (value: unknown) => void; h.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 view.rerender(<CurriculumPdfPreview filePath={'[Center]\\B.pdf'} fileLabel="B" onClose={vi.fn()} />);
 expect(screen.queryByTestId('canvas-reader')).toBeNull(); finish({ data: new ArrayBuffer(12), source: 'mckb' });
 await waitFor(() => expect(screen.getByTestId('canvas-reader')).toHaveTextContent('B'));
});
