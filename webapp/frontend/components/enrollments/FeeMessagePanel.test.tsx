import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeeMessagePanel } from './FeeMessagePanel';

const mocks = vi.hoisted(() => ({ message: vi.fn(), update: vi.fn(), toast: vi.fn(), share: vi.fn(), auth: vi.fn() }));
vi.mock('@/lib/api', () => ({ enrollmentsAPI: { getFeeMessage: mocks.message, update: mocks.update } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('@/lib/share', () => ({ shareOrCopy: mocks.share, useCanShare: () => false }));

function show() {
  return render(<FeeMessagePanel enrollment={{ id: 77, student_id: 4, renewal_enrollment_id: 77, renewal_lessons_paid: 8, renewal_status: 'pending_message' }} onClose={vi.fn()} />);
}
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.auth.mockReturnValue({ effectiveRole: 'Admin', isReadOnly: false });
  mocks.message.mockResolvedValue({ message: 'Synthetic legacy fee message', lessons_paid: 8, first_lesson_date: '2026-11-06' });
  mocks.share.mockResolvedValue('copied');
});

describe('legacy enrollment fee panel', () => {
  it('uses the actual target and count and does not mark sent when copying', async () => {
    show();
    await screen.findByRole('textbox', { name: 'Fee message' });
    expect(mocks.message).toHaveBeenCalledWith(77, 'zh', 8);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByRole('button', { name: 'Copied!' });
    expect(mocks.share).toHaveBeenCalledWith('Synthetic legacy fee message');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('withholds copy and mark-sent after a message-load failure', async () => {
    mocks.message.mockRejectedValue(new Error('Unavailable'));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the fee message.');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mark sent' })).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: 'Fee message' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark sent' }));
    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reports clipboard failure as an error without claiming successful copying', async () => {
    mocks.share.mockRejectedValue(new Error('Permission denied'));
    show();
    await screen.findByRole('textbox', { name: 'Fee message' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Failed to copy to clipboard', 'error'));
    expect(screen.queryByRole('button', { name: 'Copied!' })).not.toBeInTheDocument();
  });

  it('retains copying for read-only staff while withholding Mark sent', async () => {
    mocks.auth.mockReturnValue({ effectiveRole: 'Supervisor', isReadOnly: true });
    show();
    await screen.findByRole('textbox', { name: 'Fee message' });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Mark sent' })).not.toBeInTheDocument();
  });
});
