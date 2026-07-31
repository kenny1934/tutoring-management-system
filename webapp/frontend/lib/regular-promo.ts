/**
 * Seasonal offer helpers for the regular intake.
 *
 * Regular has at most one offer running at a time, so there is nothing here
 * resembling summer's tier competition — no "best discount wins", no group
 * sizes, no countdown. What there is instead is a *start* date: the application
 * form opens days before the campaign launches, so an offer must stay invisible
 * until its own day.
 *
 * That gating is enforced by the API, which strips the promo from the public
 * config until it is live. The parent-facing form therefore only has to ask
 * whether a promo is present. `isPromoActive` exists for the admin config
 * editor, whose preview renders the unfiltered config and so has to date-check
 * for itself.
 */

import type { RegularPricingConfig, RegularPromo } from "@/types";
import type { Lang } from "@/lib/regular-utils";

/**
 * Whether `promo` may be advertised on `today`.
 *
 * Both bounds are inclusive, and an absent bound is unbounded — an offer with
 * no `until_date` runs until the config says otherwise. Dates are compared as
 * plain calendar strings (YYYY-MM-DD), which sidesteps timezone drift: the
 * caller supplies Hong Kong's today, and lexical order matches date order for
 * ISO dates.
 */
export function isPromoActive(
  promo: RegularPromo | null | undefined,
  todayIso: string,
): boolean {
  if (!promo?.code) return false;
  const day = todayIso.slice(0, 10);
  if (promo.from_date && day < promo.from_date.slice(0, 10)) return false;
  if (promo.until_date && day > promo.until_date.slice(0, 10)) return false;
  return true;
}

/**
 * The offer a parent should see right now, or null.
 *
 * `todayIso` is optional because the public config has already been filtered
 * server-side: when it is omitted, a promo that reached the browser is one the
 * API decided to publish. Pass it only where the config is unfiltered, i.e.
 * the admin preview.
 */
export function getActiveRegularPromo(
  pricing: RegularPricingConfig | null | undefined,
  todayIso?: string,
): RegularPromo | null {
  const promo = pricing?.promo;
  if (!promo?.code) return null;
  if (todayIso && !isPromoActive(promo, todayIso)) return null;
  return promo;
}

/** Offer name in the requested language, preferring the full form. */
export function promoName(promo: RegularPromo, lang: Lang): string {
  return lang === "zh" ? promo.name_zh : promo.name_en;
}

/** Bullet lines for the promo card, already language-resolved. */
export function promoItems(promo: RegularPromo, lang: Lang): string[] {
  return (promo.items ?? []).map((item) =>
    lang === "zh" ? item.name_zh : item.name_en,
  );
}

/** Whether this intake collects the one-off materials fee from anyone.
 *  Absent means it does, so only an intake that opts out behaves differently. */
export function intakeChargesRegistrationFee(
  pricing: RegularPricingConfig | null | undefined,
): boolean {
  return pricing?.registration_fee_charged !== false;
}

/**
 * What a qualifying new student pays, and what they would have paid.
 *
 * The saving is the offer's headline `total_value` rather than a re-derivation,
 * so the form quotes the same number as the campaign. Returns null when the
 * pricing config is too incomplete to show a price at all.
 *
 * `originalFee` is the standard price including the materials fee, which is
 * what the campaign compares against. An intake collecting the fee from nobody
 * does not change that comparison: it is the list price, not this intake's.
 */
export function promoPricing(
  pricing: RegularPricingConfig | null | undefined,
  promo: RegularPromo,
): { originalFee: number; promoFee: number; saving: number } | null {
  if (!pricing?.base_fee) return null;
  const materialsFee = pricing.registration_fee ?? 0;
  const charged = intakeChargesRegistrationFee(pricing) && !promo.waives_registration_fee;
  const originalFee = pricing.base_fee + materialsFee;
  const promoFee =
    pricing.base_fee - (promo.tuition_amount ?? 0) + (charged ? materialsFee : 0);
  return { originalFee, promoFee, saving: promo.total_value };
}
