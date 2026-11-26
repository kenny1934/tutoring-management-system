import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TrendingCoursewareSection } from './TrendingCoursewareSection';
const h = vi.hoisted(() => ({ pdf: vi.fn(), add: vi.fn(), paperless: vi.fn(() => { throw new Error('Shelv must not be called'); }) }));
vi.mock('@/lib/api', () => ({ api: { paperless: { search: h.paperless } } }));
vi.mock('@/lib/hooks', () => ({
  useCoursewarePopularity: () => ({ data: [{ filename: 'Shared.pdf', normalized_paths: '[Center]\\Actual\\Shared.pdf, [Center]\\Other\\Shared.pdf', assignment_count: 3, unique_student_count: 2 }], isLoading: false }),
  useCoursewareUsageDetail: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/components/ui/pdf-preview-modal', () => ({ PdfPreviewModal: (props: unknown) => { h.pdf(props); return null; } }));
vi.mock('@/components/ui/copy-path-button', () => ({ CopyPathButton: () => null }));
it('opens the recorded trending NAS path without searching Shelv or adding it to the draft', () => {
  render(<TrendingCoursewareSection exerciseType="CW" grade="F1" onAdd={h.add} />);
  fireEvent.click(screen.getByRole('button', { name: /Trending|Popular|recent|CW/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview Shared.pdf' }));
  expect(h.pdf).toHaveBeenLastCalledWith(expect.objectContaining({ isOpen: true, documentId: null, sourcePath: '[Center]\\Actual\\Shared.pdf' }));
  expect(h.paperless).not.toHaveBeenCalled(); expect(h.add).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Shared.pdf'));
  expect(h.add).toHaveBeenCalledWith('[Center]\\Actual\\Shared.pdf');
});
