import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPreferenceUpdater, checkedPreferences, type PreferenceTarget } from './billing-preferences';
import type { BillingPreferences } from '@/types/billing';

const api = vi.hoisted(() => ({
  preferences: vi.fn(), savePreferences: vi.fn(), confirmDraft: vi.fn(),
  recordManualPayment: vi.fn(), markPaymentSent: vi.fn(), recordReceipt: vi.fn(),
  cancelPayment: vi.fn(), verifyCoupons: vi.fn(),
}));
vi.mock('./billing-api', () => ({ billingAPI: api }));

function target(id = 4, version = 2): PreferenceTarget {
  return { student: { id, student_name: `Synthetic student ${id}`, school_student_id: `000${id}`,
    home_location: 'MSA', grade: 'F1', is_staff_referral: false }, preference_version: version };
}
function preference(changes: Partial<BillingPreferences> = {}): BillingPreferences {
  return { student_id: 4, payment_method: 'manual', mandate_ready: false, version: 2,
    updated_at: '2026-10-27T01:00:00Z', ...changes };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.preferences.mockImplementation(async (id: number) => preference({ student_id: id }));
  api.savePreferences.mockImplementation(async (id: number, body: {
    payment_method: BillingPreferences['payment_method']; mandate_ready: boolean; expected_version: number;
  }) => preference({ student_id: id, payment_method: body.payment_method,
    mandate_ready: body.mandate_ready, version: body.expected_version + 1 }));
});
afterEach(() => {
  for (const call of [api.confirmDraft, api.recordManualPayment, api.markPaymentSent,
    api.recordReceipt, api.cancelPayment, api.verifyCoupons]) expect(call).not.toHaveBeenCalled();
});

describe('versioned payment preference updates', () => {
  it('reads current owned evidence before issuing one scoped preference save', async () => {
    const pending = deferred<BillingPreferences>(); api.preferences.mockReturnValueOnce(pending.promise);
    const updater = new BillingPreferenceUpdater(); const signal = new AbortController().signal;
    const saving = updater.save(target(), { payment_method: 'autopay' }, 7, signal);
    expect(api.preferences).toHaveBeenCalledWith(4, 7, signal);
    expect(api.savePreferences).not.toHaveBeenCalled();
    pending.resolve(preference());
    expect(await saving).toEqual(preference({ payment_method: 'autopay', version: 3 }));
    expect(api.savePreferences).toHaveBeenCalledOnce();
    expect(api.savePreferences).toHaveBeenCalledWith(4, {
      payment_method: 'autopay', mandate_ready: false, expected_version: 2,
      idempotency_key: expect.any(String),
    }, signal);
    expect(updater.hasPending(4)).toBe(false);
  });

  it.each([false, true])('a method-only change preserves bank authorisation=%s', async ready => {
    api.preferences.mockResolvedValue(preference({ mandate_ready: ready }));
    await new BillingPreferenceUpdater().save(target(), { payment_method: 'autopay' });
    expect(api.savePreferences.mock.lastCall![1]).toMatchObject({ payment_method: 'autopay', mandate_ready: ready });
  });

  it('an authorisation-only change preserves the saved plan', async () => {
    api.preferences.mockResolvedValue(preference({ payment_method: 'autopay' }));
    await new BillingPreferenceUpdater().save(target(), { mandate_ready: true });
    expect(api.savePreferences.mock.lastCall![1]).toMatchObject({ payment_method: 'autopay', mandate_ready: true });
  });

  it('clears a recorded plan explicitly without inventing an authorisation change', async () => {
    api.preferences.mockResolvedValue(preference({ payment_method: 'autopay', mandate_ready: true }));
    await new BillingPreferenceUpdater().save(target(), { payment_method: null });
    expect(api.savePreferences.mock.lastCall![1]).toMatchObject({ payment_method: null, mandate_ready: true });
  });

  it('accepts a genuinely unrecorded student at version zero', async () => {
    api.preferences.mockResolvedValue(preference({ version: 0, payment_method: null }));
    const value = await new BillingPreferenceUpdater().save(target(4, 0), { payment_method: 'manual' });
    expect(value.version).toBe(1);
    expect(api.savePreferences.mock.lastCall![1]).toMatchObject({ expected_version: 0, payment_method: 'manual' });
  });

  it.each([
    [null, false], [null, true], ['manual', false], ['manual', true], ['autopay', false], ['autopay', true],
  ] as const)('keeps unchanged method %s and authorisation %s at their original version', async (payment_method, mandate_ready) => {
    const fresh = preference({ payment_method, mandate_ready }); api.preferences.mockResolvedValue(fresh);
    const updater = new BillingPreferenceUpdater();
    expect(await updater.save(target(), { payment_method })).toEqual(fresh);
    expect(api.preferences).toHaveBeenCalledOnce(); expect(api.savePreferences).not.toHaveBeenCalled();
    expect(updater.hasPending(4)).toBe(false);
  });

  it.each([false, true])('does not rewrite unchanged bank authorisation=%s or infer a new plan', async mandate_ready => {
    const fresh = preference({ mandate_ready }); api.preferences.mockResolvedValue(fresh);
    const updater = new BillingPreferenceUpdater();
    expect(await updater.save(target(), { mandate_ready })).toEqual(fresh);
    expect(api.savePreferences).not.toHaveBeenCalled(); expect(updater.hasPending(4)).toBe(false);
  });

  it.each([{}, { payment_method: 'manual', mandate_ready: false }] as const)('does not reserve or write an entirely unchanged request (%j)', async change => {
    const updater = new BillingPreferenceUpdater();
    expect(await updater.save(target(), change)).toEqual(preference());
    expect(api.preferences).toHaveBeenCalledOnce(); expect(api.savePreferences).not.toHaveBeenCalled();
    expect(updater.hasPending(4)).toBe(false);
  });

  it('still holds stale evidence when the requested field happens to match the latest value', async () => {
    api.preferences.mockResolvedValue(preference({ version: 3, payment_method: 'autopay' }));
    const updater = new BillingPreferenceUpdater();
    await expect(updater.save(target(), { payment_method: 'autopay' })).rejects.toThrow('Preference changed');
    expect(api.savePreferences).not.toHaveBeenCalled(); expect(updater.hasPending(4)).toBe(false);
  });

  it('holds a concurrent preference revision before any write', async () => {
    api.preferences.mockResolvedValue(preference({ version: 3, payment_method: 'autopay', mandate_ready: true }));
    const updater = new BillingPreferenceUpdater();
    await expect(updater.save(target(), { payment_method: 'manual' })).rejects.toThrow('Preference changed');
    expect(api.savePreferences).not.toHaveBeenCalled(); expect(updater.hasPending(4)).toBe(false);
  });

  it.each([
    ['foreign owner', { student_id: 8 }], ['negative version', { version: -1 }],
    ['fractional version', { version: 2.5 }], ['missing version', { version: undefined }],
    ['unknown method', { payment_method: 'cash' }], ['missing method', { payment_method: undefined }],
    ['string authorisation', { mandate_ready: 'true' }], ['missing authorisation', { mandate_ready: undefined }],
  ] as const)('rejects %s in a fresh read before writing', async (_label, changes) => {
    api.preferences.mockResolvedValue({ ...preference(), ...changes });
    const updater = new BillingPreferenceUpdater();
    await expect(updater.save(target(), { payment_method: 'autopay' })).rejects.toThrow();
    expect(api.savePreferences).not.toHaveBeenCalled(); expect(updater.hasPending(4)).toBe(false);
  });

  it.each([null, undefined])('cannot write from an empty fresh response (%s)', async value => {
    api.preferences.mockResolvedValue(value);
    await expect(new BillingPreferenceUpdater().save(target(), { payment_method: 'manual' })).rejects.toThrow('Could not verify the saved preference.');
    expect(api.savePreferences).not.toHaveBeenCalled();
  });

  it('does not reserve a request or write after a failed evidence read', async () => {
    api.preferences.mockRejectedValue(new Error('Read unavailable'));
    const updater = new BillingPreferenceUpdater();
    await expect(updater.save(target(), { payment_method: 'autopay' })).rejects.toThrow('Read unavailable');
    expect(api.savePreferences).not.toHaveBeenCalled(); expect(updater.hasPending(4)).toBe(false);
  });

  it.each([undefined, 500, 503])('keeps the exact uncertain request after failure status %s', async status => {
    const lost = Object.assign(new Error('Reply lost'), status === undefined ? {} : { status });
    api.savePreferences.mockRejectedValueOnce(lost);
    const updater = new BillingPreferenceUpdater(); const signal = new AbortController().signal;
    await expect(updater.save(target(), { payment_method: 'autopay' }, 7, signal)).rejects.toThrow('Reply lost');
    const first = structuredClone(api.savePreferences.mock.calls[0][1]);
    expect(updater.hasPending(4)).toBe(true);
    api.preferences.mockResolvedValue(preference({ version: 99, payment_method: 'manual', mandate_ready: true }));
    const result = await updater.save(target(4, 99), { payment_method: 'manual', mandate_ready: true }, 7, signal);
    expect(result).toEqual(preference({ payment_method: 'autopay', mandate_ready: false, version: 3 }));
    expect(api.preferences).toHaveBeenCalledOnce();
    expect(api.savePreferences.mock.calls[1][1]).toEqual(first);
    expect(updater.hasPending(4)).toBe(false);
  });

  it.each([
    ['foreign owner', { student_id: 7 }], ['stale version', { version: 2 }],
    ['unexpected version', { version: 4 }], ['wrong method', { payment_method: 'manual' }],
    ['wrong authorisation', { mandate_ready: true }], ['malformed version', { version: '3' }],
  ] as const)('holds a %s save reply and replays the original request safely', async (_label, changes) => {
    api.savePreferences.mockResolvedValueOnce({ ...preference({ version: 3, payment_method: 'autopay' }), ...changes });
    const updater = new BillingPreferenceUpdater();
    await expect(updater.save(target(), { payment_method: 'autopay' })).rejects.toThrow();
    const body = structuredClone(api.savePreferences.mock.calls[0][1]); expect(updater.hasPending(4)).toBe(true);
    await updater.save(target(), { payment_method: 'manual' });
    expect(api.savePreferences.mock.calls[1][1]).toEqual(body); expect(updater.hasPending(4)).toBe(false);
  });

  it.each([null, undefined])('retains the request after an empty save response (%s)', async value => {
    api.savePreferences.mockResolvedValueOnce(value);
    const updater = new BillingPreferenceUpdater();
    await expect(updater.save(target(), { payment_method: 'autopay' })).rejects.toThrow('Could not verify the saved preference.');
    expect(updater.hasPending(4)).toBe(true);
    await updater.save(target(), { payment_method: 'manual' });
    expect(api.savePreferences.mock.calls[1][1]).toEqual(api.savePreferences.mock.calls[0][1]);
  });

  it.each([400, 401, 403, 404, 409, 422])('clears a known rejected request at HTTP%s before a fresh review', async status => {
    api.savePreferences.mockRejectedValueOnce(Object.assign(new Error('Rejected'), { status }));
    const updater = new BillingPreferenceUpdater();
    await expect(updater.save(target(), { payment_method: 'autopay' })).rejects.toThrow('Rejected');
    expect(updater.hasPending(4)).toBe(false);
    const key = api.savePreferences.mock.calls[0][1].idempotency_key;
    api.preferences.mockResolvedValueOnce(preference({ payment_method: 'autopay', version: 3, mandate_ready: true }));
    await updater.save(target(4, 3), { payment_method: 'manual' });
    expect(api.preferences).toHaveBeenCalledTimes(2);
    expect(api.savePreferences.mock.calls[1][1]).toMatchObject({ payment_method: 'manual', expected_version: 3, mandate_ready: true });
    expect(api.savePreferences.mock.calls[1][1].idempotency_key).not.toBe(key);
  });

  it('does not mix uncertain requests belonging to different students', async () => {
    api.savePreferences.mockRejectedValueOnce(new Error('Lost first reply'));
    const updater = new BillingPreferenceUpdater();
    await expect(updater.save(target(), { payment_method: 'autopay' })).rejects.toThrow();
    const first = structuredClone(api.savePreferences.mock.calls[0][1]);
    await updater.save(target(5), { mandate_ready: true });
    expect(updater.hasPending(4)).toBe(true); expect(updater.hasPending(5)).toBe(false);
    await updater.save(target(), { payment_method: 'manual' });
    expect(api.savePreferences.mock.calls.map(call => call[0])).toEqual([4, 5, 4]);
    expect(api.savePreferences.mock.calls[2][1]).toEqual(first);
  });

  it('aborts before a fresh read resolves without issuing its save', async () => {
    const pending = deferred<BillingPreferences>(); api.preferences.mockReturnValueOnce(pending.promise);
    const updater = new BillingPreferenceUpdater(); const abort = new AbortController();
    const saving = updater.save(target(), { payment_method: 'autopay' }, undefined, abort.signal);
    abort.abort(); pending.resolve(preference());
    await expect(saving).rejects.toThrow(); expect(api.savePreferences).not.toHaveBeenCalled();
    expect(updater.hasPending(4)).toBe(false);
  });

  it('cannot dispatch a save with an already-aborted signal', async () => {
    const abort = new AbortController(); abort.abort();
    await expect(new BillingPreferenceUpdater().save(target(), { payment_method: 'autopay' }, undefined, abort.signal)).rejects.toThrow();
    expect(api.savePreferences).not.toHaveBeenCalled();
  });

  it('retains exact evidence if the signal aborts after the server may have committed', async () => {
    const abort = new AbortController();
    api.savePreferences.mockImplementationOnce(async (_id, body) => {
      abort.abort(); return preference({ version: 3, payment_method: body.payment_method });
    });
    const updater = new BillingPreferenceUpdater();
    await expect(updater.save(target(), { payment_method: 'autopay' }, undefined, abort.signal)).rejects.toThrow();
    expect(updater.hasPending(4)).toBe(true);
    await updater.save(target(), { payment_method: 'manual' });
    expect(api.savePreferences.mock.calls[1][1]).toEqual(api.savePreferences.mock.calls[0][1]);
  });

  it('validates every field of a standalone preference snapshot', () => {
    expect(checkedPreferences(preference(), 4)).toEqual(preference());
    expect(() => checkedPreferences(preference({ student_id: 5 }), 4)).toThrow('Could not verify');
  });
});
