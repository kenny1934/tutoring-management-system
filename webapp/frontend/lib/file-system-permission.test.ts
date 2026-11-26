import { expect, it, vi } from 'vitest';
import { navigateToFile, verifyPermission } from './file-system';

function directory(permission: PermissionState) {
  return {
    queryPermission: vi.fn().mockResolvedValue(permission),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    getFileHandle: vi.fn().mockResolvedValue({ kind: 'file' }),
  };
}
it('does not request permission or traverse a folder during a quiet lookup', async () => {
  const handle = directory('prompt');
  expect(await navigateToFile(handle as unknown as FileSystemDirectoryHandle, ['Worksheet.pdf'], false)).toEqual({ success: false, error: 'permission_denied' });
  expect(handle.requestPermission).not.toHaveBeenCalled();
  expect(handle.getFileHandle).not.toHaveBeenCalled();
});
it('reads a permitted folder without a permission prompt', async () => {
  const handle = directory('granted');
  expect(await navigateToFile(handle as unknown as FileSystemDirectoryHandle, ['Worksheet.pdf'], false)).toEqual({ success: true, handle: { kind: 'file' } });
  expect(handle.requestPermission).not.toHaveBeenCalled();
});
it('preserves permission requests for existing explicit folder actions', async () => {
  const handle = directory('prompt');
  expect(await verifyPermission(handle as unknown as FileSystemDirectoryHandle)).toBe(true);
  expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'read' });
});
