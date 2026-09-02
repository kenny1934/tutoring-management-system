/** Parent-facing contact points, one per branch.
 *
 *  Matched by Chinese name substring so an admin can rename the English label
 *  freely without breaking the lookup. Not in the config schema yet; if more
 *  branches arrive, promote this to a config field.
 */
export type BranchContact = { phone: string; wechat: string };

export function getBranchContact(locationName: string): BranchContact | null {
  if (locationName.includes("華士古")) return { phone: "2835 3333", wechat: "MathConcept9" };
  if (locationName.includes("二龍喉")) return { phone: "6890 5098", wechat: "MathConcept10" };
  return null;
}
