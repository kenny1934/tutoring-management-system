import { describe, it, expect, vi } from 'vitest'
import { ApiError } from './api'
import {
  extractDuplicatePrompt,
  duplicateConfirmOptions,
  confirmDuplicateOrRetry,
  DUPLICATE_CANCELLED,
} from './lesson-duplicate'

const BACKEND_MESSAGE =
  'Student already has another active session at Lesson 5 (2026-07-20). Save anyway?'
// The dialog's buttons ask the question, so the prompt drops the backend's.
const PROMPT =
  'Student already has another active session at Lesson 5 (2026-07-20).'

// Mirrors how fetchAPI throws the backend's 409: message comes from
// detail.message, the error code only exists on the structured detail.
function duplicateApiError(): ApiError {
  return new ApiError(BACKEND_MESSAGE, 409, {
    error: 'DUPLICATE_LESSON_NUMBER',
    message: BACKEND_MESSAGE,
    other_session_id: 123,
    other_session_date: '2026-07-20',
  })
}

describe('extractDuplicatePrompt', () => {
  it('recognises the structured ApiError thrown by fetchAPI', () => {
    expect(extractDuplicatePrompt(duplicateApiError())).toBe(PROMPT)
  })

  it('returns null for ApiErrors with a different error code', () => {
    const err = new ApiError('Makeup must be within 60 days', 400, {
      error: 'MAKEUP_60_DAY_EXCEEDED',
      message: 'Makeup must be within 60 days',
    })
    expect(extractDuplicatePrompt(err)).toBeNull()
  })

  it('returns null for ApiErrors with a plain string detail', () => {
    const err = new ApiError('Session not found', 404, 'Session not found')
    expect(extractDuplicatePrompt(err)).toBeNull()
  })

  it('falls back to err.message when the structured detail has no message', () => {
    const err = new ApiError(BACKEND_MESSAGE, 409, { error: 'DUPLICATE_LESSON_NUMBER' })
    expect(extractDuplicatePrompt(err)).toBe(PROMPT)
  })

  it('still parses plain Errors carrying the stringified detail', () => {
    const err = new Error(
      `{"error":"DUPLICATE_LESSON_NUMBER","message":"${BACKEND_MESSAGE}","other_session_id":123}`,
    )
    expect(extractDuplicatePrompt(err)).toBe(PROMPT)
  })

  it('returns null for unrelated errors', () => {
    expect(extractDuplicatePrompt(new Error('Network error'))).toBeNull()
    expect(extractDuplicatePrompt('not an error')).toBeNull()
  })
})

describe('confirmDuplicateOrRetry', () => {
  it('returns the result without confirming when the save succeeds', async () => {
    const confirm = vi.fn()
    const trySave = vi.fn().mockResolvedValue('saved')
    await expect(confirmDuplicateOrRetry(trySave, confirm)).resolves.toBe('saved')
    expect(trySave).toHaveBeenCalledExactlyOnceWith(false)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('retries with force=true when the admin confirms the duplicate', async () => {
    const confirm = vi.fn().mockResolvedValue(true)
    const trySave = vi
      .fn()
      .mockImplementation((force: boolean) =>
        force ? Promise.resolve('forced') : Promise.reject(duplicateApiError()),
      )
    await expect(confirmDuplicateOrRetry(trySave, confirm)).resolves.toBe('forced')
    expect(confirm).toHaveBeenCalledExactlyOnceWith(duplicateConfirmOptions(PROMPT))
    expect(trySave).toHaveBeenNthCalledWith(1, false)
    expect(trySave).toHaveBeenNthCalledWith(2, true)
  })

  it('returns DUPLICATE_CANCELLED when the admin declines', async () => {
    const confirm = vi.fn().mockResolvedValue(false)
    const trySave = vi.fn().mockRejectedValue(duplicateApiError())
    await expect(confirmDuplicateOrRetry(trySave, confirm)).resolves.toBe(
      DUPLICATE_CANCELLED,
    )
    expect(trySave).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('rethrows non-duplicate errors untouched', async () => {
    const confirm = vi.fn()
    const boom = new ApiError('Session not found', 404, 'Session not found')
    const trySave = vi.fn().mockRejectedValue(boom)
    await expect(confirmDuplicateOrRetry(trySave, confirm)).rejects.toBe(boom)
    expect(confirm).not.toHaveBeenCalled()
  })
})
