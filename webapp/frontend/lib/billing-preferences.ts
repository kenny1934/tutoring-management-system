import { billingAPI } from './billing-api';
import type { BillingPreferences, BillingRosterRow } from '@/types/billing';

export type PreferenceChange = Partial<Pick<BillingPreferences, 'payment_method' | 'mandate_ready'>>;
export type PreferenceTarget = Pick<BillingRosterRow, 'student' | 'preference_version'>;
type SaveBody = Parameters<typeof billingAPI.savePreferences>[1];

export function checkedPreferences(value: BillingPreferences, studentId: number) {
  if (!value || typeof value !== 'object' || value.student_id !== studentId || !Number.isSafeInteger(value.version) || value.version < 0
      || ![null, 'manual', 'autopay'].includes(value.payment_method) || typeof value.mandate_ready !== 'boolean') {
    throw new Error('Could not verify the saved preference.');
  }
  return value;
}

/** One existing versioned transaction per student. Uncertain replies keep the exact request. */
export class BillingPreferenceUpdater {
  private pending = new Map<number, SaveBody>();

  hasPending(studentId: number) { return this.pending.has(studentId); }

  async save(target: PreferenceTarget, change: PreferenceChange, tutorId?: number, signal?: AbortSignal) {
    const studentId = target.student.id;
    let body = this.pending.get(studentId);
    if (!body) {
      const fresh = checkedPreferences(await billingAPI.preferences(studentId, tutorId, signal), studentId);
      signal?.throwIfAborted();
      if (fresh.version !== (target.preference_version ?? 0)) throw new Error('Preference changed. Reload this list.');
      if (Object.entries(change).every(([field, value]) => fresh[field as keyof PreferenceChange] === value)) return fresh;
      body = { payment_method: fresh.payment_method, mandate_ready: fresh.mandate_ready,
        ...change, expected_version: fresh.version, idempotency_key: crypto.randomUUID() };
      this.pending.set(studentId, body);
    }
    try {
      signal?.throwIfAborted();
      const saved = checkedPreferences(await billingAPI.savePreferences(studentId, body, signal), studentId);
      signal?.throwIfAborted();
      if (saved.version !== body.expected_version + 1 || saved.payment_method !== body.payment_method || saved.mandate_ready !== body.mandate_ready) {
        throw new Error('Could not confirm this save. Retry.');
      }
      this.pending.delete(studentId);
      return saved;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500) this.pending.delete(studentId);
      throw error;
    }
  }
}
