/**
 * Reading the function a tutor types in the Draft's Graph panel. The panel's
 * maths field is MathLive, which hands over what's typed as LaTeX, such as
 * \sin 2x or \frac{1}{x-1}. This reads that LaTeX into a tree, works out the
 * function's value at any x from the tree, and writes the function out as the
 * label that goes on the page, such as y = x² − 2x − 3.
 *
 * Nothing typed is ever run as code. The geometry editor's lib/latex-to-js
 * turns LaTeX into JavaScript with patterns and then runs it. Its patterns
 * can't follow braces inside braces, and they turn \sin x into Math.sinx, so
 * the graph has its own reader.
 *
 * The field turns sin, pi and sqrt into \sin, \pi and \sqrt as they're typed,
 * but only when its shortcuts catch them. So the same words spelt out in plain
 * letters are read as well, and sinx is sin x.
 *
 * A function written without brackets takes the term after it, the way a
 * textbook writes it. So sin 2x is sin(2x), sin x + 1 is sin(x) + 1, x sin x
 * is x times sin x, and sin x cos x is sin x times cos x. A power on the
 * function's name, as in sin²x, is a power of the function's value, and
 * sin⁻¹x is the inverse sine.
 */

/** Whether sin, cos and tan take degrees and their inverses give degrees, or both are in radians. */
export type AngleUnit = "degrees" | "radians";

type FunctionName = "sin" | "cos" | "tan" | "arcsin" | "arccos" | "arctan" | "ln" | "log" | "exp";

const FUNCTIONS: readonly string[] = ["sin", "cos", "tan", "arcsin", "arccos", "arctan", "ln", "log", "exp"];

/** The inverse of each trigonometric function, for a power of −1 on its name. */
const INVERSES: Partial<Record<FunctionName, FunctionName>> = { sin: "arcsin", cos: "arccos", tan: "arctan" };

/** A function of x, read into a tree. */
export type Expr =
  | { type: "number"; value: number; text: string }
  | { type: "x" }
  | { type: "pi" }
  | { type: "e" }
  | { type: "negate"; of: Expr }
  | { type: "sum"; op: "+" | "−"; left: Expr; right: Expr }
  /** Two terms multiplied or divided. "implied" is multiplication with no sign, as in 2x. */
  | { type: "product"; op: "implied" | "×" | "÷"; left: Expr; right: Expr }
  | { type: "fraction"; top: Expr; bottom: Expr }
  | { type: "power"; base: Expr; exponent: Expr }
  /** A root, where index is 2 for a square root. */
  | { type: "root"; of: Expr; index: number }
  | { type: "brackets"; of: Expr; shape: "()" | "[]" }
  | { type: "abs"; of: Expr }
  /** An angle written with a degree sign. */
  | { type: "degrees"; of: Expr }
  /** A function applied to its argument. The argument is a brackets node when it was typed in brackets. */
  | { type: "apply"; name: FunctionName; arg: Expr; base?: Expr };

/** What the reader made of the field: nothing typed yet, something that can't be plotted yet, or a function ready to plot. */
export type Reading =
  | { status: "empty" }
  | { status: "unfinished" }
  | { status: "ready"; expression: Expr; label: string };

// ---------- Reading the LaTeX into tokens ----------

type Shape = "(" | "[" | "|";

type Token =
  | { t: "number"; text: string }
  | { t: "x" } | { t: "pi" } | { t: "e" } | { t: "y" }
  | { t: "function"; name: FunctionName }
  | { t: "sqrt" } | { t: "frac" }
  | { t: "op"; op: "+" | "-" | "×" | "÷" | "/" | "=" }
  | { t: "^" } | { t: "_" }
  /** A bracket. `sized` is set for one written with \left or \right, which is how MathLive writes the brackets it pairs up. */
  | { t: "open"; shape: Shape; sized: boolean }
  | { t: "close"; shape: Shape; sized: boolean }
  /** A LaTeX group's braces, which group without showing. */
  | { t: "{" } | { t: "}" }
  /** A bar with no \left or \right, which could open or close an absolute value. */
  | { t: "bar" }
  | { t: "degree" }
  /** Anything the reader doesn't know, including MathLive's empty box. */
  | { t: "unknown" };

/** The words that plain letters can spell, longest first, so exp is read before e. */
const WORDS: readonly [string, Token][] = [
  ["arcsin", { t: "function", name: "arcsin" }],
  ["arccos", { t: "function", name: "arccos" }],
  ["arctan", { t: "function", name: "arctan" }],
  ["sqrt", { t: "sqrt" }],
  ["sin", { t: "function", name: "sin" }],
  ["cos", { t: "function", name: "cos" }],
  ["tan", { t: "function", name: "tan" }],
  ["exp", { t: "function", name: "exp" }],
  ["log", { t: "function", name: "log" }],
  ["ln", { t: "function", name: "ln" }],
  ["pi", { t: "pi" }],
  ["x", { t: "x" }],
  ["e", { t: "e" }],
  ["y", { t: "y" }],
];

/** A run of plain letters, read as the words it spells. A letter that starts no word is unknown. */
function words(run: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < run.length) {
    const word = WORDS.find(([spelling]) => run.startsWith(spelling, at));
    tokens.push(word ? word[1] : { t: "unknown" });
    at += word ? word[0].length : 1;
  }
  return tokens;
}

// The delimiters that can follow \left and \right.
const DELIMITERS: Record<string, [Shape, "open" | "close" | "either"]> = {
  "(": ["(", "either"], ")": ["(", "either"], "[": ["[", "either"], "]": ["[", "either"], "|": ["|", "either"],
  "\\vert": ["|", "either"], "\\lvert": ["|", "either"], "\\rvert": ["|", "either"],
  "\\lparen": ["(", "either"], "\\rparen": ["(", "either"], "\\lbrack": ["[", "either"], "\\rbrack": ["[", "either"],
};

const COMMANDS: Record<string, Token | null> = {
  cdot: { t: "op", op: "×" }, times: { t: "op", op: "×" }, ast: { t: "op", op: "×" }, div: { t: "op", op: "÷" },
  frac: { t: "frac" }, dfrac: { t: "frac" }, tfrac: { t: "frac" }, sqrt: { t: "sqrt" },
  pi: { t: "pi" }, exponentialE: { t: "e" }, degree: { t: "degree" }, circ: { t: "degree" },
  vert: { t: "bar" }, lvert: { t: "bar" }, rvert: { t: "bar" }, mid: { t: "bar" },
  lparen: { t: "open", shape: "(", sized: false }, rparen: { t: "close", shape: "(", sized: false },
  lbrack: { t: "open", shape: "[", sized: false }, rbrack: { t: "close", shape: "[", sized: false },
  // Spaces, which change nothing.
  ",": null, ";": null, ":": null, "!": null, " ": null, quad: null, qquad: null,
};

// Commands that set their letters in a style, such as \mathrm{e}. Their letters are read as plain letters.
const LETTER_STYLES = new Set(["operatorname", "mathrm", "mathit", "mathup", "text", "textrm"]);

const SINGLE: Record<string, Token> = {
  "+": { t: "op", op: "+" }, "-": { t: "op", op: "-" }, "−": { t: "op", op: "-" },
  "*": { t: "op", op: "×" }, "×": { t: "op", op: "×" }, "·": { t: "op", op: "×" }, "÷": { t: "op", op: "÷" },
  "/": { t: "op", op: "/" }, "=": { t: "op", op: "=" }, "^": { t: "^" }, "_": { t: "_" },
  "(": { t: "open", shape: "(", sized: false }, ")": { t: "close", shape: "(", sized: false },
  "[": { t: "open", shape: "[", sized: false }, "]": { t: "close", shape: "[", sized: false },
  "{": { t: "{" }, "}": { t: "}" }, "|": { t: "bar" }, "°": { t: "degree" }, "π": { t: "pi" },
};

function tokenize(latex: string): Token[] {
  // A degree sign can also be written as a raised circle.
  const s = latex.replace(/\^\s*\{\s*\\circ\s*\}|\^\s*\\circ(?![a-zA-Z])/g, "°");
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const ch = s[i];
    if (/\s|~/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const text = /^[0-9]*\.?[0-9]*/.exec(rest)![0];
      tokens.push({ t: "number", text });
      i += text.length;
    } else if (/[a-zA-Z]/.test(ch)) {
      const run = /^[a-zA-Z]+/.exec(rest)![0];
      tokens.push(...words(run));
      i += run.length;
    } else if (ch === "\\") {
      const command = /^\\([a-zA-Z]+|.)/.exec(rest);
      if (!command) return [{ t: "unknown" }];
      i += command[0].length;
      const name = command[1];
      if (/^(m?left|m?right|[bB]igg?[lr]?)$/.test(name)) {
        // The bracket that \left or \right sizes comes straight after it.
        const delimiter = /^\s*(\\[a-zA-Z]+|.)/.exec(s.slice(i));
        const known = delimiter && DELIMITERS[delimiter[1]];
        if (!delimiter || !known) return [{ t: "unknown" }];
        i += delimiter[0].length;
        const closing = name.endsWith("right") || name.endsWith("r") || (/^[bB]ig/.test(name) && /[)\]]/.test(delimiter[1]));
        tokens.push({ t: closing ? "close" : "open", shape: known[0], sized: true });
      } else if (FUNCTIONS.includes(name)) {
        tokens.push({ t: "function", name: name as FunctionName });
      } else if (LETTER_STYLES.has(name)) {
        const group = /^\s*\{\s*([a-zA-Z]+)\s*\}/.exec(s.slice(i));
        if (!group) return [{ t: "unknown" }];
        tokens.push(...words(group[1]));
        i += group[0].length;
      } else if (name in COMMANDS) {
        const token = COMMANDS[name];
        if (token) tokens.push(token);
      } else {
        tokens.push({ t: "unknown" });
      }
    } else {
      tokens.push(SINGLE[ch] ?? { t: "unknown" });
      i++;
    }
  }
  return tokens;
}

// ---------- Reading the tokens into a tree ----------

/** Thrown while reading when what's typed can't be plotted yet. */
class Unfinished extends Error {}

const isOp = (token: Token | undefined, op: string): token is Token & { t: "op" } => token?.t === "op" && token.op === op;

function numberOf(text: string): Expr {
  const value = Number(text);
  if (text === "." || !Number.isFinite(value)) throw new Unfinished();
  return { type: "number", value, text: text.endsWith(".") ? text.slice(0, -1) : text };
}

const isMinusOne = (e: Expr) => e.type === "negate" && e.of.type === "number" && e.of.value === 1;

class Reader {
  private at = 0;
  /** How many absolute values are open, so a bar after a term closes one instead of opening another. */
  private bars = 0;

  constructor(private readonly tokens: Token[]) {}

  /** The whole function. Anything left over after it means it isn't finished. */
  whole(): Expr {
    const expression = this.sum();
    if (this.at < this.tokens.length) throw new Unfinished();
    return expression;
  }

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  private next(): Token {
    const token = this.tokens[this.at++];
    if (!token) throw new Unfinished();
    return token;
  }

  private expect(t: Token["t"]) {
    if (this.next().t !== t) throw new Unfinished();
  }

  /** Whether a token can start a term that's multiplied by the one before it with no sign, as the x in 2x does. */
  private startsFactor(token: Token): boolean {
    switch (token.t) {
      case "number": case "x": case "pi": case "e": case "function": case "sqrt": case "frac": case "{": case "open":
        return true;
      case "bar":
        return this.bars === 0;
      default:
        return false;
    }
  }

  /** Terms added and taken away, with a sign in front of the first allowed. */
  private sum(): Expr {
    let left: Expr;
    if (isOp(this.peek(), "-")) {
      this.at++;
      left = { type: "negate", of: this.term() };
    } else {
      if (isOp(this.peek(), "+")) this.at++;
      left = this.term();
    }
    for (;;) {
      const token = this.peek();
      if (!isOp(token, "+") && !isOp(token, "-")) return left;
      this.at++;
      left = { type: "sum", op: token.op === "+" ? "+" : "−", left, right: this.term() };
    }
  }

  /** Factors multiplied and divided, with a sign or with none. */
  private term(): Expr {
    let left = this.postfix();
    for (;;) {
      const token = this.peek();
      if (token?.t === "op" && (token.op === "×" || token.op === "÷" || token.op === "/")) {
        this.at++;
        const right = this.signed();
        left = token.op === "/" ? { type: "fraction", top: left, bottom: right } : { type: "product", op: token.op, left, right };
      } else if (token && this.startsFactor(token)) {
        left = { type: "product", op: "implied", left, right: this.postfix() };
      } else {
        return left;
      }
    }
  }

  /** A factor after × or ÷, which can have a minus sign of its own. */
  private signed(): Expr {
    if (isOp(this.peek(), "-")) {
      this.at++;
      return { type: "negate", of: this.signed() };
    }
    return this.postfix();
  }

  /** A factor with any powers and degree signs after it. */
  private postfix(): Expr {
    let base = this.atom();
    for (;;) {
      const token = this.peek();
      if (token?.t === "^") {
        this.at++;
        base = { type: "power", base, exponent: this.group() };
      } else if (token?.t === "degree") {
        this.at++;
        base = { type: "degrees", of: base };
      } else {
        return base;
      }
    }
  }

  /**
   * One argument of \frac, \sqrt or a power: a group in braces, or a single
   * character or symbol. A bare argument is only one character in LaTeX, so
   * \frac12 is a half and x^23 is x² times 3.
   */
  private group(): Expr {
    const token = this.next();
    switch (token.t) {
      case "{": {
        const inside = this.sum();
        this.expect("}");
        return inside;
      }
      case "number":
        if (token.text.length > 1) this.tokens.splice(this.at, 0, { t: "number", text: token.text.slice(1) });
        return numberOf(token.text[0]);
      case "x": return { type: "x" };
      case "pi": return { type: "pi" };
      case "e": return { type: "e" };
      default: throw new Unfinished();
    }
  }

  private atom(): Expr {
    const token = this.next();
    switch (token.t) {
      case "number": return numberOf(token.text);
      case "x": return { type: "x" };
      case "pi": return { type: "pi" };
      case "e": return { type: "e" };
      case "{": {
        const inside = this.sum();
        this.expect("}");
        return inside;
      }
      case "open": {
        const inside = this.sum();
        const close = this.next();
        if (close.t !== "close" || close.shape !== token.shape) throw new Unfinished();
        return token.shape === "|" ? { type: "abs", of: inside } : { type: "brackets", of: inside, shape: token.shape === "(" ? "()" : "[]" };
      }
      case "bar": {
        this.bars++;
        const inside = this.sum();
        if (this.next().t !== "bar") throw new Unfinished();
        this.bars--;
        return { type: "abs", of: inside };
      }
      case "frac": {
        const top = this.group();
        return { type: "fraction", top, bottom: this.group() };
      }
      case "sqrt": {
        let index = 2;
        const option = this.peek();
        if (option?.t === "open" && option.shape === "[" && !option.sized) {
          this.at++;
          const n = this.next();
          if (n.t !== "number" || !/^\d+$/.test(n.text) || Number(n.text) < 2) throw new Unfinished();
          const close = this.next();
          if (close.t !== "close" || close.shape !== "[") throw new Unfinished();
          index = Number(n.text);
        }
        // "sqrt" spelt in letters is followed by brackets, not braces.
        const of = this.peek()?.t === "open" ? this.atom() : this.group();
        return { type: "root", of, index };
      }
      case "function":
        return this.application(token.name);
      default:
        throw new Unfinished();
    }
  }

  /** A function, with a power or a base on its name, and then its argument. */
  private application(named: FunctionName): Expr {
    let name = named;
    let power: Expr | undefined;
    let base: Expr | undefined;
    for (;;) {
      const token = this.peek();
      if (token?.t === "^" && !power) {
        this.at++;
        power = this.group();
      } else if (token?.t === "_" && name === "log" && !base) {
        this.at++;
        base = this.group();
      } else {
        break;
      }
    }
    // sin⁻¹ x is the inverse sine, not one over sin x.
    const inverse = INVERSES[name];
    if (power && inverse && isMinusOne(power)) {
      name = inverse;
      power = undefined;
    }
    const token = this.peek();
    const bracketed = token?.t === "open" && token.shape !== "|";
    const arg = bracketed ? this.atom() : this.operand();
    const applied: Expr = { type: "apply", name, arg, ...(base && { base }) };
    return power ? { type: "power", base: applied, exponent: power } : applied;
  }

  /** What a function written without brackets applies to: the term after it, up to the next function, sign, × or ÷. */
  private operand(): Expr {
    if (isOp(this.peek(), "-")) {
      this.at++;
      return { type: "negate", of: this.operand() };
    }
    let arg = this.postfix();
    for (;;) {
      const token = this.peek();
      if (!token || token.t === "function" || !this.startsFactor(token)) return arg;
      arg = { type: "product", op: "implied", left: arg, right: this.postfix() };
    }
  }
}

/**
 * What's typed in the Graph panel's field, read. A leading "y =" typed out of
 * habit is dropped, since the panel shows it already. An empty box, a bracket
 * that isn't closed, or anything the reader doesn't know, makes it unfinished.
 */
export function readFunction(latex: string): Reading {
  let tokens = tokenize(latex);
  if (tokens[0]?.t === "y" && isOp(tokens[1], "=")) tokens = tokens.slice(2);
  if (tokens.length === 0) return { status: "empty" };
  try {
    const expression = new Reader(tokens).whole();
    return { status: "ready", expression, label: `${ITALIC_Y} = ${written(expression).text}` };
  } catch {
    // Unfinished, or nested so deep it ran out of stack.
    return { status: "unfinished" };
  }
}

// ---------- Working out its value ----------

/** The function's value at x. It's NaN or infinite where the function has no value, such as 1/x at 0. */
export function evaluate(e: Expr, x: number, unit: AngleUnit): number {
  const at = (child: Expr) => evaluate(child, x, unit);
  switch (e.type) {
    case "number": return e.value;
    case "x": return x;
    case "pi": return Math.PI;
    case "e": return Math.E;
    case "negate": return -at(e.of);
    case "sum": return e.op === "+" ? at(e.left) + at(e.right) : at(e.left) - at(e.right);
    case "product": return e.op === "÷" ? at(e.left) / at(e.right) : at(e.left) * at(e.right);
    case "fraction": return at(e.top) / at(e.bottom);
    case "power": return Math.pow(at(e.base), at(e.exponent));
    case "root": {
      const v = at(e.of);
      if (e.index === 2) return Math.sqrt(v);
      // An odd root of a negative number is negative, as the cube root of −8 is −2.
      return v < 0 && e.index % 2 === 1 ? -Math.pow(-v, 1 / e.index) : Math.pow(v, 1 / e.index);
    }
    case "brackets": return at(e.of);
    case "abs": return Math.abs(at(e.of));
    case "degrees": return unit === "degrees" ? at(e.of) : (at(e.of) * Math.PI) / 180;
    case "apply": {
      const v = at(e.arg);
      const radian = unit === "degrees" ? Math.PI / 180 : 1;
      switch (e.name) {
        case "sin": return Math.sin(v * radian);
        case "cos": return Math.cos(v * radian);
        case "tan": return Math.tan(v * radian);
        case "arcsin": return Math.asin(v) / radian;
        case "arccos": return Math.acos(v) / radian;
        case "arctan": return Math.atan(v) / radian;
        case "ln": return Math.log(v);
        case "log": return e.base ? Math.log(v) / Math.log(at(e.base)) : Math.log10(v);
        case "exp": return Math.exp(v);
      }
    }
  }
}

// ---------- Writing its label ----------

const MINUS = "−";
// The letters x, y and e are Unicode's italic maths letters, as a textbook
// sets them and as the axes write their x and y. A text stroke is either all
// italic or all upright, and these letters leave the numbers, π and the
// names sin, cos and log upright beside them. Times New Roman doesn't have
// them, so they come from Cambria Math, the next font in the text's list
// (see lib/text-ink), on screen and in the saved PDF alike.
const ITALIC_X = "\u{1D465}";
const ITALIC_Y = "\u{1D466}";
const ITALIC_E = "\u{1D452}";
const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻",
};
const SUBSCRIPTS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};
const NAMES: Record<FunctionName, string> = {
  sin: "sin", cos: "cos", tan: "tan", arcsin: `sin${SUPERSCRIPTS["-"]}¹`, arccos: `cos${SUPERSCRIPTS["-"]}¹`,
  arctan: `tan${SUPERSCRIPTS["-"]}¹`, ln: "ln", log: "log", exp: "exp",
};

// How tightly each kind of term holds together, which says where the label needs brackets.
const SUM = 1;
const PRODUCT = 2;
const APPLIED = 3;
const POWER = 4;
const ATOM = 5;

interface Written {
  text: string;
  level: number;
}

const wrap = (w: Written, least: number) => (w.level < least ? `(${w.text})` : w.text);

/** A whole number, or minus one, as the digits of a power or a base, or null when it isn't one. */
function wholeNumber(e: Expr): string | null {
  if (e.type === "number" && /^\d+$/.test(e.text)) return e.text;
  if (e.type === "negate" && e.of.type === "number" && /^\d+$/.test(e.of.text)) return `-${e.of.text}`;
  return null;
}

const raised = (digits: string) => [...digits].map((d) => SUPERSCRIPTS[d]).join("");

/** A function's name as the label writes it, with a log's base as a subscript. */
function functionName(e: Expr & { type: "apply" }): string {
  if (!e.base) return NAMES[e.name];
  const base = wholeNumber(e.base);
  return base && !base.startsWith("-") ? `log${[...base].map((d) => SUBSCRIPTS[d]).join("")}` : `log_${wrap(written(e.base), ATOM)}`;
}

/** A function and its argument, with a power on the name, as in sin² x, when there is one. */
function application(e: Expr & { type: "apply" }, power = ""): string {
  const arg = written(e.arg);
  return `${functionName(e)}${power}${e.arg.type === "brackets" ? arg.text : ` ${arg.text}`}`;
}

/**
 * The label for a function, in plain text: x² for x^2, √(x + 1) for a root,
 * 1/(x − 1) for a fraction, and a proper minus sign, with x and e in italic.
 * Powers that Unicode has no superscripts for are written x^(n+1), and a
 * single character after a caret needs no brackets, as in e^x.
 */
function written(e: Expr): Written {
  switch (e.type) {
    case "number": return { text: e.text, level: ATOM };
    case "x": return { text: ITALIC_X, level: ATOM };
    case "pi": return { text: "π", level: ATOM };
    case "e": return { text: ITALIC_E, level: ATOM };
    case "negate": return { text: `${MINUS}${wrap(written(e.of), PRODUCT)}`, level: PRODUCT };
    case "sum":
      return { text: `${written(e.left).text} ${e.op === "+" ? "+" : MINUS} ${wrap(written(e.right), PRODUCT)}`, level: SUM };
    case "product": {
      // A fraction beside another factor goes in brackets, so 1/2 times x is never read as 1/(2x).
      const left = e.left.type === "fraction" ? `(${written(e.left).text})` : wrap(written(e.left), PRODUCT);
      const right = e.right.type === "fraction" ? `(${written(e.right).text})` : wrap(written(e.right), APPLIED);
      if (e.op !== "implied") return { text: `${left} ${e.op} ${right}`, level: PRODUCT };
      // Written side by side, as in 2x, with a space before a function's name, as in x sin x. A number after something else takes a ×.
      const named = e.right.type === "apply" || (e.right.type === "power" && e.right.base.type === "apply");
      const joint = /^[0-9.]/.test(right) ? " × " : named ? " " : "";
      return { text: `${left}${joint}${right}`, level: PRODUCT };
    }
    case "fraction":
      return { text: `${wrap(written(e.top), POWER)}/${wrap(written(e.bottom), POWER)}`, level: PRODUCT };
    case "power": {
      const whole = wholeNumber(e.exponent);
      // sin² x, as a textbook writes the square of sin x. An inverse such as sin⁻¹ x keeps its brackets.
      if (whole && e.base.type === "apply" && !e.base.name.startsWith("arc")) {
        return { text: application(e.base, raised(whole)), level: APPLIED };
      }
      const base = wrap(written(e.base), ATOM);
      if (whole) return { text: `${base}${raised(whole)}`, level: POWER };
      const exponent = written(e.exponent);
      return { text: `${base}^${exponent.level === ATOM && [...exponent.text].length === 1 ? exponent.text : `(${exponent.text})`}`, level: POWER };
    }
    case "root": {
      const sign = e.index === 2 ? "√" : e.index === 3 ? "∛" : e.index === 4 ? "∜" : `${raised(String(e.index))}√`;
      return { text: `${sign}${wrap(written(e.of), ATOM)}`, level: POWER };
    }
    case "brackets": return { text: `${e.shape[0]}${written(e.of).text}${e.shape[1]}`, level: ATOM };
    case "abs": return { text: `|${written(e.of).text}|`, level: ATOM };
    case "degrees": return { text: `${wrap(written(e.of), ATOM)}°`, level: ATOM };
    case "apply": return { text: application(e), level: APPLIED };
  }
}
