/** Strip HTML tags from a string and trim whitespace. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Check if an HTML string is effectively empty (no visible text content). */
export function isHtmlEmpty(html: string | undefined | null): boolean {
  if (!html || html === "<p></p>") return true;
  // Math nodes count as content even though they have no visible text
  if (/data-type="(inline|block)-math"/.test(html)) return false;
  return stripHtml(html).length === 0;
}
