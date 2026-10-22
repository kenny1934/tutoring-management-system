import { beforeEach, describe, expect, it, vi } from 'vitest';
import { billingAPI } from './billing-api';

const mocks = vi.hoisted(() => ({ json: vi.fn(), raw: vi.fn() }));
vi.mock('./api', () => ({ fetchAPI: mocks.json, fetchResponse: mocks.raw }));
beforeEach(() => { vi.clearAllMocks(); });

describe('bank run API boundaries', () => {
  it('sends only the profile branch and collection month for the complete run history', () => {
    const abort = new AbortController(); billingAPI.bankRuns({ collection_month: '2026-11', branch: 'MSB' }, abort.signal);
    expect(mocks.json).toHaveBeenCalledWith('/billing/autopay/runs?collection_month=2026-11&branch=MSB', { signal: abort.signal });
  });

  it('preserves the selected file and expected run version in multipart without setting a JSON content type', () => {
    const file = new File(['synthetic'], 'bank.txt', { type: 'text/plain' }); const abort = new AbortController(); billingAPI.previewBankResult('run/one', file, 7, abort.signal);
    expect(mocks.json.mock.lastCall![0]).toBe('/billing/autopay/runs/run%2Fone/results'); const options = mocks.json.mock.lastCall![1];
    expect(options).toEqual({ method: 'POST', body: expect.any(FormData), signal: abort.signal }); expect(options.body.get('file')).toBe(file); expect(options.body.get('expected_version')).toBe('7');
  });

  it('retains exact hashes, versions and retry keys for each explicit write', () => {
    const signal = new AbortController().signal;
    const creation = { collection_month: '2026-11', branch: 'MSA' as const, expected_content_hash: 'a'.repeat(64), idempotency_key: 'save-key' }; billingAPI.saveBankRun(creation, signal);
    expect(mocks.json).toHaveBeenLastCalledWith('/billing/autopay/runs', { method: 'POST', body: JSON.stringify(creation), signal });
    const submitted = { expected_version: 3, bank_batch_no: '00012', idempotency_key: 'upload-key' }; billingAPI.submitBankRun('r1', submitted, signal);
    expect(mocks.json).toHaveBeenLastCalledWith('/billing/autopay/runs/r1/submitted', { method: 'POST', body: JSON.stringify(submitted), signal });
    const discarded = { expected_version: 3, reason: 'Wrong month.', idempotency_key: 'discard-key' }; billingAPI.discardBankRun('r1', discarded, signal);
    expect(mocks.json).toHaveBeenLastCalledWith('/billing/autopay/runs/r1/discard', { method: 'POST', body: JSON.stringify(discarded), signal });
    const confirmation = { expected_review_hash: 'b'.repeat(64), idempotency_key: 'confirm-key' }; billingAPI.confirmBankResult('r1', 'report/1', confirmation, signal);
    expect(mocks.json).toHaveBeenLastCalledWith('/billing/autopay/runs/r1/results/report%2F1/confirm', { method: 'POST', body: JSON.stringify(confirmation), signal });
  });

  it('uses the shared authenticated binary transport for the persisted file', () => {
    const signal = new AbortController().signal; billingAPI.bankRunFile('run/one', signal);
    expect(mocks.raw).toHaveBeenCalledWith('/billing/autopay/runs/run%2Fone/file', { signal }); expect(mocks.json).not.toHaveBeenCalled();
  });
});
