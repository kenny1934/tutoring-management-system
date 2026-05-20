/** Mock holiday seed — sourced from CSM's production `holidays` table
 *  (GET /api/holidays?from_date=2026-01-01&to_date=2026-12-31, May 2026).
 *  Includes both statutory HK holidays and MathConcept's own non-teaching
 *  days. The create-enrollment preview consults this list to skip
 *  scheduled lessons that fall on a holiday. */
export type Holiday = { date: string; label: string };

export const holidays: Holiday[] = [
  { date: "2026-01-01", label: "New Year's Day" },
  { date: "2026-02-16", label: "Chinese New Year's Eve" },
  { date: "2026-02-17", label: "Chinese New Year's Day" },
  { date: "2026-02-18", label: "The second day of Chinese New Year" },
  { date: "2026-02-19", label: "The third day of Chinese New Year" },
  { date: "2026-03-15", label: "MathConceptition 2026" },
  { date: "2026-03-16", label: "School Holiday" },
  { date: "2026-04-04", label: "Ching Ming Festival" },
  { date: "2026-04-05", label: "Easter Monday" },
  { date: "2026-05-01", label: "Labour Day" },
  { date: "2026-06-09", label: "MO Annual Dinner" },
  { date: "2026-07-02", label: "School Holiday" },
  { date: "2026-09-25", label: "School Holiday" },
  { date: "2026-09-26", label: "Mid-Autumn Festival" },
  { date: "2026-10-01", label: "National Day" },
  { date: "2026-10-18", label: "Chung Yeung Festival" },
  { date: "2026-12-20", label: "Macau SAR Day" },
  { date: "2026-12-25", label: "Christmas Day" },
  { date: "2026-12-26", label: "Boxing Day" },
];

export const holidayMap: Map<string, Holiday> = new Map(
  holidays.map((h) => [h.date, h])
);
