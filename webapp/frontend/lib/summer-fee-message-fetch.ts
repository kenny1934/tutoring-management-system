// On-demand builder for the summer fee message from an enrollment-only context.
//
// The generic /enrollments/{id}/fee-message endpoint rejects Summer enrollments
// (they price via the summer course config, not the 400-per-lesson formula), so
// surfaces that hold just an enrollment (detail popover, detail modal, zen view)
// fetch the application context here and reuse the same client-side formatter
// as the summer panels. The application response carries the enrollment-side
// tier override and attached coupon, so the produced message matches the
// enrollment page and the summer application modal.

import { summerAPI } from "@/lib/api";
import { resolveEffectiveDiscount } from "@/lib/summer-discounts";
import {
  formatSummerFeeMessage,
  type SummerMessageLang,
} from "@/lib/summer-fee-message";

export async function fetchSummerFeeMessage(
  summerApplicationId: number,
  lang: SummerMessageLang = "zh",
): Promise<string> {
  const app = await summerAPI.getApplication(summerApplicationId);
  const config = await summerAPI.getConfig(app.config_id);
  // Buddy group members drive group-tier qualification; a solo applicant
  // evaluates against itself.
  const members = app.buddy_group_id
    ? await summerAPI.getApplications({ buddy_group_id: app.buddy_group_id })
    : [app];
  const discount = resolveEffectiveDiscount(
    app,
    members,
    config.pricing_config,
    app.discount_override_code,
  );
  return formatSummerFeeMessage(app, config, discount, lang);
}
