import type { BillingAutopayBankFile, BillingAutopayExportPreview, BillingAutopayExportScope } from '@/types/billing';

const MONEY = /^(0|[1-9]\d*)\.\d{2}$/;
const HASH = /^[a-f0-9]{64}$/;
const CONTRACT = /^[A-Za-z1-9][A-Za-z0-9-]{0,19}$/;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const cents = (amount: string) => BigInt(amount.replace('.', ''));
const safeFilename = (value: string) => /^[A-Za-z0-9_-]+\.xlsx$/.test(value);

/** Do not offer a downloadable review whose identity or exact arithmetic is inconsistent. */
export function checkBankExportPreview(preview: BillingAutopayExportPreview, scope: BillingAutopayExportScope) {
  if (preview.branch !== scope.branch || preview.collection_month !== scope.collection_month
    || !Number.isInteger(preview.payment_count) || preview.payment_count < 0
    || (preview.total_amount !== null && !MONEY.test(preview.total_amount))) throw new Error('Could not verify this bank preview. Refresh the preview.');
  if (!preview.can_download) return preview;
  const contracts = new Set<string>();
  const payments = new Set<string>();
  let total = BigInt(0);
  for (const row of preview.rows) {
    const studentId = row.student.school_student_id;
    if (!row.contract_no || !CONTRACT.test(row.contract_no) || !studentId || row.contract_no !== `${scope.branch}0${studentId}` || row.student.home_location !== scope.branch
      || !row.payment_id || payments.has(row.payment_id) || contracts.has(row.contract_no)
      || !Number.isInteger(row.payment_version) || row.payment_version < 1
      || !row.amount || !MONEY.test(row.amount) || cents(row.amount) <= BigInt(0)) throw new Error('Could not verify every bank entry. Refresh the preview.');
    payments.add(row.payment_id); contracts.add(row.contract_no); total += cents(row.amount);
  }
  if (preview.issues.length || !preview.payment_count || preview.rows.length !== preview.payment_count || !preview.total_amount
    || cents(preview.total_amount) !== total || !HASH.test(preview.content_hash) || !safeFilename(preview.filename)) throw new Error('Could not verify the bank total. Refresh the preview.');
  return preview;
}

function attachmentFilename(value: string | null) {
  if (!value || !/^attachment\s*;/i.test(value)) return null;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) { try { return decodeURIComponent(encoded[1].trim()); } catch { return null; } }
  const plain = value.match(/filename="([^"]+)"|filename=([^;\s]+)/i);
  return plain?.[1] || plain?.[2] || null;
}

/** The displayed bank total must come from the same checked response as the file. */
export async function readBankExport(response: Response, preview: BillingAutopayExportPreview, signal?: AbortSignal): Promise<BillingAutopayBankFile> {
  checkBankExportPreview(preview, preview);
  const total = response.headers.get('X-CSM-Export-Total');
  const count = response.headers.get('X-CSM-Export-Count');
  const hash = response.headers.get('X-CSM-Export-Hash');
  const filename = attachmentFilename(response.headers.get('Content-Disposition'));
  if (!preview.can_download || !response.ok || total !== preview.total_amount || count !== String(preview.payment_count)
    || hash !== preview.content_hash || filename !== preview.filename
    || response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== XLSX) throw new Error('Could not verify the bank file and total. Refresh the preview.');
  const blob = await response.blob();
  if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
  if (!blob.size) throw new Error('The bank file was empty. Refresh the preview.');
  return { blob, filename, total_amount: total!, payment_count: Number(count), content_hash: hash! };
}
