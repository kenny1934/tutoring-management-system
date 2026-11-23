"use client";

import { Fragment, useMemo, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function balanceBraces(latex: string): string {
  let depth = 0;
  for (const char of latex) {
    if (char === '{') depth++;
    else if (char === '}') depth--;
  }
  if (depth > 0) return latex + '}'.repeat(depth);
  if (depth < 0) return '{'.repeat(-depth) + latex;
  return latex;
}

/** Share the question panel's maths rendering with plain extracted text.
 * Text offsets use Unicode code points, matching the search provider.
 */
export function MathText({ text, renderText, renderMath }: {
  text: string;
  renderText?: (text: string, offset: number) => ReactNode;
  renderMath?: (formula: ReactNode, offset: number, length: number) => ReactNode;
}) {
  const content = useMemo(() => {
    const parts: ReactNode[] = [];
    let end = 0;
    const plain = (start: number, stop: number) => {
      if (stop <= start) return;
      const value = text.slice(start, stop);
      parts.push(<Fragment key={`text-${start}`}>{renderText ? renderText(value, Array.from(text.slice(0, start)).length) : value}</Fragment>);
    };
    const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
    for (const match of text.matchAll(pattern)) {
      if (match.index > 0 && text[match.index - 1] === '\\' && match[0].startsWith('$')) continue;
      plain(end, match.index);
      const latex = match[1] ?? match[2] ?? match[3] ?? match[4];
      let formula: ReactNode;
      try {
        const html = katex.renderToString(balanceBraces(latex), { throwOnError: false, output: 'html', displayMode: match[1] !== undefined || match[3] !== undefined, trust: false });
        formula = <span dangerouslySetInnerHTML={{ __html: html }} />;
      } catch {
        formula = <code>{match[0]}</code>;
      }
      parts.push(<Fragment key={`math-${match.index}`}>{renderMath ? renderMath(formula, Array.from(text.slice(0, match.index)).length, Array.from(match[0]).length) : formula}</Fragment>);
      end = match.index + match[0].length;
    }
    plain(end, text.length);
    return parts;
  }, [text, renderText, renderMath]);
  return <span>{content}</span>;
}
