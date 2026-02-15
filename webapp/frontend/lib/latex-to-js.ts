/**
 * Convert a LaTeX math expression (from MathLive) to evaluable JavaScript.
 *
 * Handles the common expressions students use in a tutoring context:
 * trigonometric functions, logarithms, roots, fractions, powers, constants.
 */

// Map of LaTeX function/constant names → safe tokens.
// Longer patterns first to avoid partial matches (e.g. \arcsin before \sin).
const REPLACEMENTS: [RegExp, string][] = [
  [/\\operatorname\{arcsin\}/g, "__ASIN__"],
  [/\\operatorname\{arccos\}/g, "__ACOS__"],
  [/\\operatorname\{arctan\}/g, "__ATAN__"],
  [/\\arcsin/g, "__ASIN__"],
  [/\\arccos/g, "__ACOS__"],
  [/\\arctan/g, "__ATAN__"],
  [/\\sinh/g, "__SINH__"],
  [/\\cosh/g, "__COSH__"],
  [/\\tanh/g, "__TANH__"],
  [/\\sin/g, "__SIN__"],
  [/\\cos/g, "__COS__"],
  [/\\tan/g, "__TAN__"],
  [/\\csc/g, "__CSC__"],
  [/\\sec/g, "__SEC__"],
  [/\\cot/g, "__COT__"],
  [/\\ln/g, "__LN__"],
  [/\\log/g, "__LOG10__"],
  [/\\abs/g, "__ABS__"],
  [/\\sqrt/g, "__SQRT__"],
  [/\\pi/g, "__PI__"],
  [/\\infty/g, "__INF__"],
];

// Tokens that map directly to JS function/constant names
const DIRECT_TOKENS: Record<string, string> = {
  __ASIN__: "Math.asin",
  __ACOS__: "Math.acos",
  __ATAN__: "Math.atan",
  __SINH__: "Math.sinh",
  __COSH__: "Math.cosh",
  __TANH__: "Math.tanh",
  __SIN__: "Math.sin",
  __COS__: "Math.cos",
  __TAN__: "Math.tan",
  __LN__: "Math.log",
  __LOG10__: "Math.log10",
  __ABS__: "Math.abs",
  __PI__: "Math.PI",
  __INF__: "Infinity",
};

// Reciprocal trig functions need wrapper lambdas since JS has no csc/sec/cot.
// Using ((v)=>1/Math.sin(v)) so the token can be followed by (expr) of any complexity.
const RECIPROCAL_TOKENS: Record<string, string> = {
  __CSC__: "((v)=>1/Math.sin(v))",
  __SEC__: "((v)=>1/Math.cos(v))",
  __COT__: "((v)=>1/Math.tan(v))",
};

export function latexToJs(latex: string): string {
  let s = latex.trim();

  // Phase 1: Replace LaTeX functions/constants with safe tokens
  for (const [pattern, token] of REPLACEMENTS) {
    s = s.replace(pattern, token);
  }

  // Nth root: __SQRT__[n]{expr} → Math.pow((expr), 1/(n))
  s = s.replace(/__SQRT__\[([^\]]+)\]\{([^}]+)\}/g, "Math.pow(($2), 1/($1))");
  // Plain sqrt with braces: __SQRT__{expr} → Math.sqrt((expr))
  s = s.replace(/__SQRT__\{([^}]+)\}/g, "Math.sqrt(($1))");
  // __SQRT__ without braces — leave as token, will become Math.sqrt in Phase 2

  // Fractions: \frac{a}{b} → ((a)/(b))
  // Handle nested fractions by running multiple passes
  for (let i = 0; i < 5; i++) {
    const prev = s;
    s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))");
    if (s === prev) break;
  }

  // Powers: ^{expr} → **(expr)
  s = s.replace(/\^\{([^}]+)\}/g, "**($1)");
  // Single-char power: ^n → **n
  s = s.replace(/\^(\w)/g, "**$1");

  // Multiplication operators: \cdot, \times → *
  s = s.replace(/\\cdot/g, "*");
  s = s.replace(/\\times/g, "*");

  // Remove LaTeX formatting: \left, \right
  s = s.replace(/\\left/g, "");
  s = s.replace(/\\right/g, "");

  // Absolute value: |expr| → Math.abs(expr)
  s = s.replace(/\|([^|]+)\|/g, "Math.abs($1)");

  // Remove remaining LaTeX braces used for grouping
  s = s.replace(/\{/g, "(");
  s = s.replace(/\}/g, ")");

  // Phase 2: Replace tokens with JS equivalents
  // Reciprocal trig → inline lambdas (safe with any nested parens)
  for (const [token, js] of Object.entries(RECIPROCAL_TOKENS)) {
    s = s.replaceAll(token, js);
  }
  // Direct function/constant replacements
  // Handle __SQRT__ that wasn't caught by the brace patterns above
  s = s.replaceAll("__SQRT__", "Math.sqrt");
  for (const [token, js] of Object.entries(DIRECT_TOKENS)) {
    s = s.replaceAll(token, js);
  }

  // Phase 3: Implicit multiplication (safe — all tokens are already expanded)
  // Digit followed by letter: 2x → 2*x
  s = s.replace(/(\d)([a-zA-Z])/g, "$1*$2");
  // Close paren followed by word char: )x → )*x
  s = s.replace(/\)(\w)/g, ")*$1");
  // Close paren followed by open paren: )( → )*(
  s = s.replace(/\)\(/g, ")*(");
  // Digit followed by open paren: 2( → 2*(
  s = s.replace(/(\d)\(/g, "$1*(");

  // Fix Math.log10 broken by implicit multiplication (log1*0 → log10)
  s = s.replace(/Math\.log1\*0/g, "Math.log10");

  // Clean up whitespace
  s = s.replace(/\s+/g, "");

  return s;
}
