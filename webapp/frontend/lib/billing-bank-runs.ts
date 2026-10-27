import type { BillingAutopayExportScope, BillingBankResultReview, BillingBankRunDetail } from '@/types/billing';
import { checkBankExportPreview } from './billing-bank-export';
import { mutate } from 'swr';

export const bankRunStatus = { prepared: 'Prepared', submitted: 'Uploaded', processed: 'Results recorded', needs_attention: 'Needs attention', discarded: 'Discarded' };

export function refreshAutopayViews() {
  void mutate(key => Array.isArray(key) && ['billing-autopay', 'billing-renewal-queue', 'renewal-queue-counts'].includes(key[0]));
}

export function checkBankRun(run: BillingBankRunDetail, id: string | null, scope: BillingAutopayExportScope) {
  if ((id && run.id !== id) || run.branch !== scope.branch || run.collection_month !== scope.collection_month
    || run.filename !== run.export_preview.filename || run.content_hash !== run.export_preview.content_hash
    || run.total_amount !== run.export_preview.total_amount || run.payment_count !== run.export_preview.payment_count) throw new Error('Could not verify this saved run. Refresh the run.');
  checkBankExportPreview(run.export_preview, scope);
  return run;
}

export function checkBankResult(review: BillingBankResultReview, run: BillingBankRunDetail) {
  if (review.run_id !== run.id || review.run_version < run.version || !/^[a-f0-9]{64}$/.test(review.review_hash)) throw new Error('The bank result changed. Refresh the run before continuing.');
  return review;
}
