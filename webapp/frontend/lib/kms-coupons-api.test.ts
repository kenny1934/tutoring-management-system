import { beforeEach, expect, it, vi } from 'vitest';
import { kmsCouponsAPI } from './kms-coupons-api';
const request = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ fetchAPI: request }));
beforeEach(() => request.mockReset());
it('sends only the selected branch and preserves cancellation without sending KMS credentials', () => {
  const signal = new AbortController().signal;
  kmsCouponsAPI.check('MSB', signal);
  expect(request).toHaveBeenCalledWith('/billing/kms-coupons/check', { method: 'POST', body: JSON.stringify({ branch: 'MSB' }), signal });
  kmsCouponsAPI.review('check/1', signal);
  expect(request.mock.lastCall).toEqual(['/billing/kms-coupons/checks/check%2F1', { signal }]);
  kmsCouponsAPI.apply('check/1', { expected_review_hash: 'a'.repeat(64), idempotency_key: 'retry-exact' }, signal);
  expect(request.mock.lastCall).toEqual(['/billing/kms-coupons/checks/check%2F1/apply', { method: 'POST', body: JSON.stringify({ expected_review_hash: 'a'.repeat(64), idempotency_key: 'retry-exact' }), signal }]);
});
