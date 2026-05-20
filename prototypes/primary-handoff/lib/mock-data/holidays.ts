/** HK public holidays that fall in the demo window. The create-enrollment
 *  preview consults this list to bump weekly recurrences past the holiday
 *  date. Mock-only — production reads from the holiday table. */
export type Holiday = { date: string; label: string };

export const holidays: Holiday[] = [
  { date: "2026-05-25", label: "Buddha's Birthday" },
  { date: "2026-06-19", label: "Tuen Ng Festival" },
  { date: "2026-07-01", label: "HKSAR Establishment Day" },
  { date: "2026-09-26", label: "Day after Mid-Autumn" },
  { date: "2026-10-01", label: "National Day" },
  { date: "2026-10-19", label: "Chung Yeung Festival" },
  { date: "2026-12-25", label: "Christmas Day" },
  { date: "2026-12-26", label: "Boxing Day" },
];

export const holidayMap: Map<string, Holiday> = new Map(
  holidays.map((h) => [h.date, h])
);
