import type { SummerApplication, SummerPricingConfig } from "@/types";
import { PRIMARY_BRANCH_CODES, SECONDARY_BRANCH_CODES } from "@/lib/summer-utils";

export type ReceiptCodeRule =
  | "partial"
  | "new"
  | "f1_primary_prospect"
  | "returning_secondary"
  | "returning_primary_no_prospect";

export interface ReceiptCodeSuggestion {
  code: string;
  rule: ReceiptCodeRule;
  /** Short bilingual-safe reason shown below the code (English only for now). */
  reason: string;
}

export interface ReceiptCodeEmpty {
  code: null;
  /** Why no code applies — used for the muted hint. */
  hint: string;
}

export type ReceiptCodeResult = ReceiptCodeSuggestion | ReceiptCodeEmpty;

/**
 * Deterministically pick the receipt code for a summer application.
 *
 * Priority (first match wins):
 *   1. partial plan → SUMMERS code
 *   2. verified New → NEW code
 *   3. F1 + primary branch + linked P6 prospect → MC code
 *   4. F2/F3 + MSA/MSB + linked Secondary student with no non-Summer enrollment
 *      in the current academic year → RT code
 *   5. primary branch + no linked prospect (any grade) → RT code
 */
export function suggestReceiptCode(
  app: SummerApplication,
  config: SummerPricingConfig | null | undefined,
): ReceiptCodeResult {
  const codes = config?.receipt_codes;
  if (!codes) return { code: null, hint: "Receipt codes not configured for this season." };

  const planTotal = app.total_lessons ?? 8;
  const planCurrent = app.lessons_paid ?? planTotal;
  if (planCurrent < planTotal && codes.partial) {
    return {
      code: codes.partial,
      rule: "partial",
      reason: `Partial plan · ${planCurrent}/${planTotal} lessons`,
    };
  }

  const verified = app.verified_branch_origin;
  if (!verified) {
    return { code: null, hint: "Verify branch origin to see receipt code." };
  }

  if (verified === "New" && codes.new) {
    return { code: codes.new, rule: "new", reason: "Verified new student" };
  }

  const isPrimary = PRIMARY_BRANCH_CODES.has(verified);
  const isSecondary = SECONDARY_BRANCH_CODES.has(verified);
  const hasProspect = !!app.linked_prospect;

  if (app.grade === "F1" && isPrimary && hasProspect && codes.f1_primary_prospect) {
    return {
      code: codes.f1_primary_prospect,
      rule: "f1_primary_prospect",
      reason: `F1 · ${verified} · P6 prospect`,
    };
  }

  if (
    (app.grade === "F2" || app.grade === "F3") &&
    isSecondary &&
    app.linked_student &&
    app.linked_student.has_current_year_regular_enrollment === false &&
    codes.returning_secondary
  ) {
    return {
      code: codes.returning_secondary,
      rule: "returning_secondary",
      reason: `${app.grade} · ${verified} · returning (no current-year enrollment)`,
    };
  }

  if (isPrimary && !hasProspect && codes.returning_primary_no_prospect) {
    return {
      code: codes.returning_primary_no_prospect,
      rule: "returning_primary_no_prospect",
      reason: `${verified} · returning (not linked to a P6 prospect)`,
    };
  }

  return { code: null, hint: "No receipt code applies to this applicant." };
}
