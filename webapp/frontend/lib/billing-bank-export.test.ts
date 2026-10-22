import { describe, expect, it, vi } from 'vitest';
import { checkBankExportPreview, readBankExport } from './billing-bank-export';
import type { BillingAutopayExportPreview } from '@/types/billing';

function preview(): BillingAutopayExportPreview {
  return { branch: 'MSA', collection_month: '2026-11', payment_count: 1, total_amount: '1600.00', content_hash: 'a'.repeat(64), filename: `autopay-MSA-2026-11-${'a'.repeat(12)}.xlsx`, can_download: true, issues: [], rows: [{ payment_id: 'payment-one', payment_version: 2, contract_no: 'MSA02100', amount: '1600.00', student: { id: 4, student_name: 'Synthetic Student', school_student_id: '2100', home_location: 'MSA', grade: 'F1', is_staff_referral: false } }] };
}
function response(review = preview(), headers: Record<string, string> = {}) {
  return new Response(new Uint8Array([80, 75, 3, 4]), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${review.filename}"`, 'X-CSM-Export-Total': review.total_amount!, 'X-CSM-Export-Count': String(review.payment_count), 'X-CSM-Export-Hash': review.content_hash, ...headers } });
}

describe('bank export evidence', () => {
  it('preserves the profile branch, literal zero and original school ID', () => {
    const review = preview(); review.rows[0].student.school_student_id = '002100'; review.rows[0].contract_no = 'MSA0002100';
    expect(checkBankExportPreview(review, { branch: 'MSA', collection_month: '2026-11' })).toBe(review);
    expect(() => checkBankExportPreview(review, { branch: 'MSB', collection_month: '2026-11' })).toThrow('verify');
    expect(() => checkBankExportPreview(review, { branch: 'MSA', collection_month: '2026-12' })).toThrow('verify');
    review.rows[0].student.home_location = 'MSB'; expect(() => checkBankExportPreview(review, review)).toThrow('every bank entry');
  });
  it('blocks duplicate contracts and inconsistent row counts or exact amounts', () => {
    const review = preview();
    review.rows.push({ ...review.rows[0], payment_id: 'another-payment' }); review.payment_count = 2; review.total_amount = '3200.00';
    expect(() => checkBankExportPreview(review, review)).toThrow('every bank entry');
    const wrongCount = { ...preview(), payment_count: 2 }; expect(() => checkBankExportPreview(wrongCount, wrongCount)).toThrow('bank total');
    const wrongTotal = { ...preview(), total_amount: '1600.01' }; expect(() => checkBankExportPreview(wrongTotal, wrongTotal)).toThrow('bank total');
  });
  it('checks decimal sums without floating point rounding and retains blocked unknown amounts', () => {
    const review = preview(); review.rows[0].amount = '0.10'; review.payment_count = 2; review.total_amount = '0.30';
    review.rows.push({ ...review.rows[0], payment_id: 'second', contract_no: 'MSA02101', amount: '0.20', student: { ...review.rows[0].student, id: 5, school_student_id: '2101' } });
    expect(checkBankExportPreview(review, review)).toBe(review);
    const blocked = { ...preview(), total_amount: null, can_download: false, issues: [{ code: 'INVALID_AMOUNT', message: 'Check the confirmed amount.' }] }; blocked.rows[0].amount = null;
    expect(checkBankExportPreview(blocked, blocked).total_amount).toBeNull();
  });
  it('returns only metadata from the matching workbook response', async () => {
    const file = await readBankExport(response(), preview());
    expect(file).toMatchObject({ filename: preview().filename, total_amount: '1600.00', payment_count: 1, content_hash: 'a'.repeat(64) });
    expect(file.blob.size).toBe(4);
  });
  it.each([
    ['X-CSM-Export-Total', '1601.00'], ['X-CSM-Export-Count', '2'], ['X-CSM-Export-Hash', 'b'.repeat(64)],
    ['Content-Disposition', 'attachment; filename="other.xlsx"'], ['Content-Type', 'text/html'],
  ])('rejects a mismatched %s before reading any file bytes', async (name, value) => {
    const result = response(preview(), { [name]: value }); const blob = vi.spyOn(result, 'blob');
    await expect(readBankExport(result, preview())).rejects.toThrow('verify'); expect(blob).not.toHaveBeenCalled();
  });
  it('rejects missing headers, an empty file and an aborted read', async () => {
    const missing = response(); missing.headers.delete('X-CSM-Export-Total');
    await expect(readBankExport(missing, preview())).rejects.toThrow('verify');
    const empty = new Response(null, { headers: response().headers }); await expect(readBankExport(empty, preview())).rejects.toThrow('empty');
    const abort = new AbortController(); abort.abort(); await expect(readBankExport(response(), preview(), abort.signal)).rejects.toHaveProperty('name', 'AbortError');
  });
});
