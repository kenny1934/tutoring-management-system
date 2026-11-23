/** Strict page selection for material assignment, with physical PDF bounds. */
export function materialPages(value: string, total: number | null): number[] | null {
  if (!total || total < 1 || value.length > 200 || !/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/.test(value.trim())) return null;
  const pages = new Set<number>();
  for (const part of value.split(',')) {
    const [start, end = start] = part.trim().split(/\s*-\s*/).map(Number);
    if (start < 1 || end < start || end > total || end - start > 10000) return null;
    for (let page = start; page <= end; page++) pages.add(page);
  }
  return [...pages];
}
