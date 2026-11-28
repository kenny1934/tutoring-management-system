import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, expect, it, vi } from 'vitest';
import { CoursewareIndexHealth, HealthContent } from './CoursewareIndexHealth';
const api = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ fetchAPI: api }));
vi.mock('@/components/ui/pdf-preview-modal', () => ({ PdfPreviewModal: ({ isOpen, sourcePath }: { isOpen: boolean; sourcePath: string }) => isOpen ? <div role="dialog" aria-label="Original preview">{sourcePath}</div> : null }));
const issue = { file_id: 7, filename: 'Practice.pdf', nas_path: '\\\\nas\\Center\\F1\\Practice.pdf', share: 'center', status: 'error', reason: 'Document could not be read', guidance: 'Check the original opens correctly.' };
const sources = [{ id: 'center', label: 'Center' }];
function mount(node: React.ReactNode) { return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>); }
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path: string) => {
    if (path === '/materials/sources') return { can_manage_index: true, sources };
    if (path === '/materials/index-health') return { total: 1, failed: 1, queued: 0, results: [issue] };
    if (path === '/materials/retry-extraction') return { status: 'pending' };
    throw new Error('Unexpected service');
  });
});
it('does not advertise management when the provider account lacks permission', async () => {
  api.mockResolvedValue({ can_manage_index: false, sources });
  mount(<CoursewareIndexHealth scope="staff" />);
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Index health' })).toBeNull();
});
it('explains failures and queues a real retry while retaining the original preview', async () => {
  mount(<HealthContent scope="admin" sources={sources} />);
  expect(await screen.findByText('Practice.pdf')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Open original' }));
  expect(screen.getByRole('dialog', { name: 'Original preview' })).toHaveTextContent('[Center]\\F1\\Practice.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'Retry on next scan' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/materials/retry-extraction', expect.objectContaining({ body: '{"file_id":7}' })));
  expect(await screen.findByText('Practice.pdf queued for the next scan.')).toBeVisible();
  expect(api.mock.calls.filter(([path]) => path === '/materials/index-health')).toHaveLength(2);
});
it('shows queued files without offering duplicate work, and gives a retry on loading failure', async () => {
  api.mockResolvedValue({ total: 1, failed: 0, queued: 1, results: [{ ...issue, status: 'pending' }] });
  mount(<HealthContent scope="queued" sources={sources} />);
  expect(await screen.findByRole('button', { name: 'Queued' })).toBeDisabled();
});
it('lets a failed request be retried rather than silently clearing the error', async () => {
  api.mockRejectedValueOnce(new Error('Unavailable'));
  mount(<HealthContent scope="failed" sources={sources} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load index health');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Practice.pdf')).toBeVisible();
});
