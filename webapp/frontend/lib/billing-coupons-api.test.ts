import { beforeEach, describe, expect, it, vi } from 'vitest';
import { billingAPI } from './billing-api';
const request = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ fetchAPI: request, fetchResponse: vi.fn() }));
beforeEach(() => request.mockReset());
describe('coupon and KMS API scope', () => {
  it('keeps all-outstanding receipts independent of collection month and preserves tutor scope', () => {
    billingAPI.receipts({ location: 'MSA', tutor_id: 7, search: 'invented', offset: 25, limit: 25 }); expect(request.mock.lastCall![0]).toBe('/billing/receipts?location=MSA&tutor_id=7&search=invented&offset=25&limit=25'); billingAPI.receiptCount({ location: 'MSA', tutor_id: 7 }); expect(request.mock.lastCall![0]).toBe('/billing/receipts/count?location=MSA&tutor_id=7');
  });
  it('sends the actual file, explicit branch and observation date as multipart through the shared transport', () => {
    const file = new File(['invented'], 'termination-2026-09-01.xls'); const signal = new AbortController().signal; billingAPI.previewCouponImport(file, 'MSB', '2026-10-20', signal); expect(request.mock.lastCall![0]).toBe('/billing/coupon-imports/preview'); const options = request.mock.lastCall![1]; expect(options).toEqual({ method: 'POST', signal, body: expect.any(FormData) }); expect(options.body.get('file')).toBe(file); expect(options.body.get('branch')).toBe('MSB'); expect(options.body.get('observed_on')).toBe('2026-10-20');
  });
  it('preserves exact receipt proof and optional dates without inventing fields for ordinary receipts', () => {
    billingAPI.recordReceipt('p/1', { receipt_reference: 'KMS-0001', expected_version: 3, idempotency_key: 'ordinary' }); expect(JSON.parse(request.mock.lastCall![1].body)).toEqual({ receipt_reference: 'KMS-0001', expected_version: 3, idempotency_key: 'ordinary' }); billingAPI.recordReceipt('p/1', { receipt_reference: 'KMS-0001', expected_version: 3, idempotency_key: 'coupon', coupon_selected: true, coupon_used_on: '2026-10-20', acknowledge_duplicate_receipt: true }); expect(request.mock.lastCall![0]).toBe('/billing/payments/p%2F1/receipt'); expect(JSON.parse(request.mock.lastCall![1].body)).toEqual(expect.objectContaining({ coupon_selected: true, coupon_used_on: '2026-10-20', acknowledge_duplicate_receipt: true }));
  });
});
