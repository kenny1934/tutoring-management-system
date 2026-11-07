import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeeMessageContent } from './FeeMessageContent';

function props() {
  return { language: 'zh' as const, onLanguageChange: vi.fn(), lessons: 8, message: 'Original fee message',
    onCopy: vi.fn(), onClose: vi.fn(), onMarkSent: vi.fn() };
}

describe('shared fee message controls', () => {
  it('keeps a saved lesson count read-only and makes copy and mark sent separate actions', () => {
    const controls = props();
    render(<FeeMessageContent {...controls} />);
    expect(screen.getByRole('spinbutton', { name: 'Lessons' })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'Fee message' })).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(controls.onCopy).toHaveBeenCalledOnce();
    expect(controls.onMarkSent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark sent' }));
    expect(controls.onMarkSent).toHaveBeenCalledOnce();
  });

  it('supports local edits and reset without changing the stored count', () => {
    function Preview() {
      const [editable, setEditable] = useState(false), [message, setMessage] = useState('Original fee message');
      return <FeeMessageContent {...props()} message={message} originalMessage="Original fee message" editable={editable}
        onEditableChange={setEditable} onMessageChange={setMessage} onReset={() => { setEditable(false); setMessage('Original fee message'); }} />;
    }
    render(<Preview />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Edit before copying' }));
    const message = screen.getByRole('textbox', { name: 'Fee message' });
    expect(message).not.toHaveAttribute('readonly');
    fireEvent.change(message, { target: { value: 'Parent-specific wording' } });
    expect(message).toHaveValue('Parent-specific wording');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(message).toHaveValue('Original fee message');
    expect(message).toHaveAttribute('readonly');
    expect(screen.getByRole('spinbutton', { name: 'Lessons' })).toHaveValue(8);
  });

  it('blocks copy and marking sent when message validation fails, with feedback beside actions', () => {
    const controls = props();
    render(<FeeMessageContent {...controls} error="Review the changed enrollment first." canCopy={false} feedback={<p role="status">Message changed.</p>} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Review the changed enrollment first.');
    expect(screen.queryByRole('textbox', { name: 'Fee message' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mark sent' })).toBeDisabled();
    expect(screen.getByRole('status').closest('[data-billing-copy-actions]')).not.toBeNull();
  });

  it('keeps mobile sharing separate and freezes controls while an operation is pending', () => {
    const controls = props(), edit = vi.fn();
    render(<FeeMessageContent {...controls} canShare busy onEditableChange={edit} />);
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'English' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Edit before copying' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(controls.onCopy).not.toHaveBeenCalled();
  });
});
