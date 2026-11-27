import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, expect, it, vi } from 'vitest';
import { MaterialFolderPicker } from './MaterialFolderPicker';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/api', () => ({ fetchAPI: mocks.fetch }));
function Harness() {
  const [path, setPath] = useState('');
  return <><MaterialFolderPicker id="folder" scope="fixture" share="center" sourceLabel="Center" value={path} onChange={setPath} autoOpen /><output>{path}</output></>;
}
beforeEach(() => { mocks.fetch.mockReset(); });
it('drills into folders and returns through breadcrumbs using full paths', async () => {
  mocks.fetch.mockImplementation(async (_url: string, options: { body: string }) => {
    const { share, folder } = JSON.parse(options.body);
    const name = folder === '' ? 'English' : folder === 'English' ? 'DSE' : null;
    return { share, path: folder, folders: name ? [{ name, path: [folder, name].filter(Boolean).join('/'), files: 12 }] : [], next: null };
  });
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><Harness /></SWRConfig>);
  fireEvent.click(await screen.findByRole('button', { name: 'Open folder English' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open folder DSE' }));
  expect(await screen.findByText('No subfolders')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('English/DSE');
  fireEvent.click(screen.getByRole('button', { name: 'Center' }));
  expect(await screen.findByRole('button', { name: 'Open folder English' })).toBeVisible();
  await waitFor(() => expect(JSON.parse(mocks.fetch.mock.calls.at(-1)![1].body).folder).toBe(''));
});
it('keeps the current folder when loading more sibling names', async () => {
  mocks.fetch.mockImplementation(async (_url: string, options: { body: string }) => {
    const { share, folder, after } = JSON.parse(options.body);
    return { share, path: folder, folders: [{ name: after ? 'Other' : 'English', path: after ? 'Other' : 'English', files: 2 }], next: after ? null : 'English' };
  });
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><Harness /></SWRConfig>);
  fireEvent.click(await screen.findByRole('button', { name: 'More folders' }));
  expect(await screen.findByRole('button', { name: 'Open folder Other' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open folder English' })).toBeVisible();
});
