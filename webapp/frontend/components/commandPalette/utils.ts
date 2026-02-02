import React from "react";

/**
 * Parse query for type filters
 * @john or s:john → students
 * #session or sess:term → sessions
 * /page or p:page → pages
 */
export function parseQuery(q: string): { type: string | null; term: string } {
  // @john or s:john → students
  const studentMatch = q.match(/^[@](.+)/i) || q.match(/^s:(.+)/i);
  if (studentMatch) return { type: "student", term: studentMatch[1] };

  // #session or sess:term → sessions
  const sessionMatch = q.match(/^[#](.+)/i) || q.match(/^sess:(.+)/i);
  if (sessionMatch) return { type: "session", term: sessionMatch[1] };

  // /page or p:page → pages
  const pageMatch = q.match(/^[\/](.+)/i) || q.match(/^p:(.+)/i);
  if (pageMatch) return { type: "page", term: pageMatch[1] };

  return { type: null, term: q };
}

/**
 * Safe math evaluator (no eval) - supports +, -, *, /, parentheses
 */
export function evaluateMath(expr: string): number {
  // Tokenize: numbers (including decimals), operators, parentheses
  const tokens = expr.match(/(\d+\.?\d*|[+\-*/()])/g);
  if (!tokens) throw new Error('Invalid expression');

  let pos = 0;

  function parseExpr(): number {
    let left = parseTerm();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++];
      const right = parseFactor();
      if (op === '/' && right === 0) throw new Error('Division by zero');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number {
    if (tokens[pos] === '(') {
      pos++; // skip (
      const result = parseExpr();
      if (tokens[pos] !== ')') throw new Error('Unmatched parenthesis');
      pos++; // skip )
      return result;
    }
    if (tokens[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    return parseFloat(tokens[pos++]);
  }

  const result = parseExpr();
  if (isNaN(result) || !isFinite(result)) throw new Error('Invalid result');
  return result;
}

/**
 * Highlight matching text in search results
 */
export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      React.createElement('mark', {
        key: i,
        className: "bg-[#d4a574]/30 dark:bg-[#cd853f]/30 text-inherit rounded px-0.5"
      }, part)
    ) : part
  );
}
