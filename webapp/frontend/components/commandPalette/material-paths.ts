/** A copied file identity, not a query in the provider's text-search grammar. */
export function coursewarePath(raw: string): string | null {
  let value = raw.trim();
  if (value.length >= 2 && value[0] === value.at(-1) && ['"', "'"].includes(value[0])) value = value.slice(1, -1).trim();
  return /^(?:\[[^\]]+\](?:[\\/]|$)|[A-Za-z]:[\\/]|\\\\|\/\/)/.test(value)
    || /^\\[^\\].*\.(?:pdf|docx?|xlsx?|pptx?)$/i.test(value) ? value : null;
}
export function folderBrowse(query: string, filters: { share: string; folder: string; any_words: string; exact_phrase: string }) {
  return !query.trim() && !filters.any_words.trim() && !filters.exact_phrase.trim() && !!filters.share && !!filters.folder;
}
