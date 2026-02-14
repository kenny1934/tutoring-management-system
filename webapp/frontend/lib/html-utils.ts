/** Strip HTML tags from a string and trim whitespace. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Check if an HTML string is effectively empty (no visible text content). */
export function isHtmlEmpty(html: string | undefined | null): boolean {
  return !html || html === "<p></p>" || stripHtml(html).length === 0;
}
