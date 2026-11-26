/** Native PDF matches use UTF-16 offsets, as DOM Range and PDF.js text spans do. */
export type PdfFindTerm = { text: string; whole?: boolean };
export type PdfTextRun = { start: number; end: number; item: number };
export type PdfTextIndex = { text: string; runs: PdfTextRun[] };
export type PdfTextMatch = { start: number; end: number };
export type PdfTextItem = { str: string; hasEOL?: boolean; transform?: number[]; width?: number };

export function indexPdfText(items: PdfTextItem[]): PdfTextIndex {
  let text = '';
  const runs: PdfTextRun[] = [];
  let previous: PdfTextItem | undefined;
  items.forEach((item, index) => {
    if (previous && text && !/\s$/.test(text) && !/^\s/.test(item.str)) {
      const a = previous.transform, b = item.transform;
      const height = a ? Math.hypot(a[2], a[3]) : 0;
      const continuous = a && b && !previous.hasEOL && Math.abs(b[5] - a[5]) < height * .3 && b[4] - (a[4] + (previous.width ?? 0)) < height * .15;
      if (!continuous) text += previous.hasEOL ? '\n' : ' ';
    }
    runs.push({ item: index, start: text.length, end: text.length + item.str.length });
    text += item.str;
    if (item.str || item.hasEOL) previous = item;
  });
  return { text, runs };
}

function normalizedText(text: string) {
  let value = '';
  const starts: number[] = [], ends: number[] = [];
  const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  for (let offset = 0; offset < text.length;) {
    const char = String.fromCodePoint(text.codePointAt(offset)!);
    if (char === '\u00ad' || /^[-‐]\r?\n/.test(text.slice(offset, offset + 3))) { offset += char.length; if (text[offset] === '\r') offset++; if (text[offset] === '\n') offset++; continue; }
    let replacement = char.normalize('NFKC').toLowerCase().replace(/[−–]/g, '-');
    if (superscripts.includes(char)) {
      const previous = offset > 0 ? text[offset - 1] : '';
      replacement = (previous && superscripts.includes(previous) ? '' : '^') + superscripts.indexOf(char);
    }
    for (let i = 0; i < replacement.length; i++) { starts.push(offset); ends.push(offset + char.length); }
    value += replacement; offset += char.length;
  }
  return { value, starts, ends };
}
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function isPdfMath(value: string) {
  return /^(?:\d+(?:\.\d+)?)?\s*[a-z]\s*(?:[\^²³⁴⁵⁶⁷⁸⁹⁰+−=-]|\d)/i.test(value) && /[\^²³⁴⁵⁶⁷⁸⁹⁰+=−–-]/.test(value) && /^[a-z0-9\s.^_{}()\\+*/=−–²³⁴⁵⁶⁷⁸⁹⁰-]+$/i.test(value);
}
export function pdfTextMatches(text: string, terms: PdfFindTerm[]): { matches: PdfTextMatch[]; truncated: boolean } {
  const normalized = normalizedText(text);
  const patterns = [...terms].filter(term => term.text.trim()).sort((a, b) => b.text.length - a.text.length).map(term => {
    const value = normalizedText(term.text.trim()).value;
    let pattern: string;
    if (isPdfMath(term.text)) {
      const tokens = value.replace(/\s+/g, '').replace(/\^\{(\d+)\}/g, '^$1').match(/\^\d+|./g) ?? [];
      pattern = tokens.map(token => /^\^\d+$/.test(token) ? '\\^\\s*\\{?\\s*' + escape(token.slice(1)) + '\\s*\\}?' : escape(token)).join('\\s*');
    } else pattern = value.split(/\s+/).map(escape).join('\\s+');
    if (term.whole || isPdfMath(term.text)) {
      if (/^[a-z0-9_]/i.test(value)) pattern = '(?<![a-z0-9_])' + pattern;
      if (/[a-z0-9_]$/i.test(value)) pattern += '(?![a-z0-9_])';
      if (isPdfMath(term.text)) pattern += '(?!\\s*[\\^²³⁴⁵⁶⁷⁸⁹⁰])';
    }
    return pattern;
  });
  if (!patterns.length) return { matches: [], truncated: false };
  const regex = new RegExp(patterns.join('|'), 'gu');
  const matches: PdfTextMatch[] = [];
  for (const match of normalized.value.matchAll(regex)) {
    if (matches.length === 500) return { matches, truncated: true };
    const start = normalized.starts[match.index], end = normalized.ends[match.index + match[0].length - 1];
    if (start !== undefined && end !== undefined) matches.push({ start, end });
  }
  return { matches, truncated: false };
}
