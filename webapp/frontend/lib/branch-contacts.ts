/** Parent-facing contact points, one per branch.
 *
 *  Matched by Chinese name substring so an admin can rename the English label
 *  freely without breaking the lookup. Not in the config schema yet; if more
 *  branches arrive, promote this to a config field.
 */
export type BranchContact = { phone: string; wechat: string };

/** The branches, named, for a screen that has no config to read them from.
 *  The public summer pages fall back to this when there is no active intake at
 *  all, which is what a parent would meet in the gap between one year's config
 *  being deactivated and the next one being activated. Same caveat as above:
 *  promote this to a config field if more branches arrive. */
export const FALLBACK_BRANCHES: Array<{ name: string; name_en: string }> = [
  { name: "華士古分校", name_en: "Jardim de Vasco Center" },
  { name: "二龍喉分校", name_en: "Flora Garden Center" },
];

export function getBranchContact(locationName: string): BranchContact | null {
  if (locationName.includes("華士古")) return { phone: "2835 3333", wechat: "MathConcept9" };
  if (locationName.includes("二龍喉")) return { phone: "6890 5098", wechat: "MathConcept10" };
  return null;
}
