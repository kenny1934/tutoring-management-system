import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { ConfirmProvider, useConfirm } from './ConfirmContext'

function Harness() {
  const confirm = useConfirm()
  const [result, setResult] = useState<string>('pending')
  return (
    <div>
      <button
        onClick={async () => {
          const ok = await confirm({
            title: 'Duplicate lesson number',
            message: 'Student already has another active session at Lesson 5.',
            confirmText: 'Save anyway',
            variant: 'warning',
          })
          setResult(ok ? 'confirmed' : 'cancelled')
        }}
      >
        open
      </button>
      <output>{result}</output>
    </div>
  )
}

describe('ConfirmProvider', () => {
  it('resolves true when the dialog is confirmed', async () => {
    render(
      <ConfirmProvider>
        <Harness />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByText('open'))
    expect(screen.getByText('Duplicate lesson number')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Save anyway'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('confirmed'))
    expect(screen.queryByText('Duplicate lesson number')).toBeNull()
  })

  it('resolves false when the dialog is cancelled', async () => {
    render(
      <ConfirmProvider>
        <Harness />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('cancelled'))
  })
})
